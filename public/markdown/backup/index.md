# Gateweave Backup

Gateweave Backup is a Cloudflare Worker that backs up D1 databases, Durable Objects' SQLite and R2
buckets every night into an R2 bucket, sealed before it leaves, kept under a retention policy and
restored on a schedule to prove it works. A restore needs only the key, the bucket's objects and
one file for Node.js: no Gateweave service, and no Worker.

It is part of [Gateweave](https://gateweave.com), the family of open-source business tools that
run on Cloudflare, next to [Gateweave Track](https://github.com/gateweavehq/track),
[Gateweave ID](https://github.com/gateweavehq/id),
[Gateweave Agents](https://github.com/gateweavehq/agents),
[Gateweave Mail](https://github.com/gateweavehq/mail) and
[Gateweave Guard](https://github.com/gateweavehq/guard). It backs up any app's data, not only
theirs.

> **Status: early development.** It runs Gateweave Cloud's own backups every night, and has no
> release yet. Expect breaking changes until 1.0, though never to what a repository of format
> version 1 means: old backups always restore. See [CHANGELOG.md](/backup/changelog/).

## What it backs up

| Source                   | How it is read                                                                                                        | What a snapshot holds                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A D1 database            | Through a D1 binding, in one transaction                                                                              | An exact dump: tables, rows, indexes, triggers, views, full-text indexes |
| An app's Durable Objects | Through a service binding to the app's `Backup` entrypoint, which the app writes: [the guide](/backup/app-entrypoint/) | A dump of each object's SQLite, under the object's name                  |
| An R2 bucket             | Through an R2 binding, reading only the objects that are new or replaced                                              | Every object's bytes, with its HTTP and custom metadata                  |

Around that:

- **A run every night** on Cloudflare Workflows, a source after another, each step retried on its
  own. A catalog in D1 keeps every run, snapshot, restore test, copy and alert.
- **Retention:** the newest snapshot, then 7 daily, 4 weekly and 12 monthly by default
  (`RETENTION`). A locked bucket holds what retention would delete until the lock allows.
- **Restore tests:** every 30 days a run restores the snapshot it has just made into a Durable
  Object's SQLite, counts every table against the dump, and rolls the rows back, keeping none.
- **Alerts** by email, to a signed webhook, or both, when a backup, a restore test or a copy
  fails, and when a source's backup is late or stuck.
- **A restore CLI,** one file for Node.js. It only reads the repository, and writes SQL for a new
  D1 database, a SQLite file, or a bucket's objects into a folder or back into a bucket, never
  over anything.

## How it is sealed

- **The key is yours.** One master key, 32 random bytes, which you make and keep. The Worker holds
  it as a secret; nothing else does, and nobody can recover it.
- **AES-256-GCM, before anything is written.** Keys are derived from the master key with
  HKDF-SHA256, salted with the repository's id. Every blob's name is authenticated with it, so a
  blob moved to another name doesn't open.
- **Content-defined chunks.** Data is cut with FastCDC under a table derived from the key, and a
  chunk is named by an HMAC of its plaintext. A night's backup stores only the chunks that
  changed, and the names say nothing about the data to someone without the key.
- **What the bucket shows without the key:** how many objects there are, their sizes, when each
  snapshot was made, and the repository's id and chunk sizes.

[docs/format.md](/backup/format/) is the whole format, and a contract: a restore can be written
from that page alone.

## Requirements

- **A Cloudflare account on the Workers Paid plan.** Backup uses Workflows, Durable Objects with
  SQLite storage, D1 and R2. Those exist on the Free plan too, but a Workflow step there gets 10 ms
  of CPU, and a step that dumps, chunks and seals a database takes seconds to minutes: the
  Worker's configuration asks for the five minutes of CPU a step may have on Paid. R2 is
  subscribed to separately in the dashboard and has a free allowance.
- **The app's Workers in the same account.** Sources are bindings, not API tokens.
- **Node.js 24** (22.13 or later works) and **pnpm 12**, for Wrangler and the restore CLI.

## Quick start

From a checkout, with the names of the example in [docs/deploy.md](/backup/deploy/), which has
each step in full: the Worker, its bucket and its catalog are `my-backup`, and it backs up a D1
database called `shop`.

```sh
pnpm install
cd apps/worker
npx wrangler login

# 1. The key. Put it in a password manager before anything else.
pnpm -w keygen

# 2. The bucket that holds the backups, and the catalog.
npx wrangler r2 bucket create my-backup
npx wrangler d1 create my-backup
```

In `apps/worker/wrangler.jsonc`, at the top level: set `name`, the vault's `bucket_name`, the
catalog's `database_name` and the Workflow's `name` to `my-backup`, add the catalog's
`database_id`, and say what to back up:

```jsonc
"d1_databases": [
	{ "binding": "CATALOG", "database_name": "my-backup", "database_id": "…", "migrations_dir": "migrations" },
	{ "binding": "SHOP_DB", "database_name": "shop", "database_id": "…" }
],
"vars": {
	"SOURCES": [{ "name": "shop", "kind": "d1", "binding": "SHOP_DB" }]
}
```

```sh
# 3. The catalog's tables, a lock on the bucket, the key, and the Worker.
npx wrangler d1 migrations apply my-backup --remote
npx wrangler r2 bucket lock add my-backup keep-30-days "" --retention-days 30
npx wrangler secret put BACKUP_KEY
npx wrangler deploy

# 4. Run it once, with a restore test, and see how it went.
npx wrangler workflows trigger my-backup '{"sources":["shop"],"test":true}'
npx wrangler d1 execute my-backup --remote \
  --command "SELECT source, status, snapshot, row_count, error FROM run ORDER BY started_at DESC LIMIT 5"
```

Then restore it once, with nothing but the key and a read-only R2 token
([docs/restore.md](/backup/restore/)):

```sh
# 5. Build the CLI: one file, to keep beside the key.
cd ../..
pnpm build

export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export AWS_ENDPOINT_URL=https://<account id>.r2.cloudflarestorage.com
node packages/cli/dist/gateweave-backup.mjs snapshots s3://my-backup/shop
node packages/cli/dist/gateweave-backup.mjs check s3://my-backup/shop latest
node packages/cli/dist/gateweave-backup.mjs restore s3://my-backup/shop latest --to ./restore

# 6. Into a new database, never the live one.
npx wrangler d1 create shop-restored
npx wrangler d1 execute shop-restored --remote --file ./restore/database.sql
```

The CLI asks for the key without showing it, or reads it from `GATEWEAVE_BACKUP_KEY`, a file or
stdin; it never takes it as an argument.

## Make your app's Durable Objects backable

A Worker can't open another Worker's Durable Objects, so the app lends Backup a reader: a named
entrypoint, `Backup`, with two methods, `objects(cursor)` and `read(name, statements)`.
[docs/app-entrypoint.md](/backup/app-entrypoint/) has the contract, an example to copy that the
tests run, and the rules it keeps: only reads get in, everything is rolled back, names are file
names. Track, Agents and Mail each have one.

## What it does not do yet

- **KV.** No KV source exists.
- **A copy outside Cloudflare, unless you set one up.** The code is there and tested: with
  `COPY_TO` naming an S3-compatible bucket at another provider, each run sends that bucket the
  sealed objects it lacks and prunes it by the same retention
  ([docs/deploy.md](/backup/deploy/#a-copy-outside-cloudflare)). It is off by default, and without it
  every backup is in the same Cloudflare account as the data. Its tests run against a stand-in
  S3 server, so restore once from your provider's copy before you count on it.
- **A page, an API or an MCP server.** The Worker answers no requests. The catalog is read with
  `wrangler d1 execute`, and alerts are how it speaks.
- **A Deploy to Cloudflare button, or a release.** It is deployed with Wrangler from a checkout
  of `main`.
- **Restores into a live app.** A Durable Object's dump comes back as a file; loading it into an
  object is the app's to offer. A database goes into a new D1 database.
- **Very large sources in one run.** A bucket's first backup takes a Workflow step per 100 objects
  or 256 MB, a restore test of a dump of some 240 MB ran out of memory, and an app's objects are
  listed in one step. [docs/deploy.md](/backup/deploy/#what-it-cant-do-yet) has the numbers.

## Project structure

```
apps/worker     The Worker: the backup Workflow, restore tests, the copy, alerts, the catalog
packages/core   The repository format: keys, sealing, chunking, SQLite dumps, retention
packages/cli    The restore CLI: reads a repository with the key, writes files back
docs/           Architecture, the format, deploying, restoring, an app's entrypoint
scripts/        keygen
```

Read [docs/architecture.md](/backup/architecture/) for how it is built and why.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](https://github.com/gateweavehq/backup/blob/main/CONTRIBUTING.md) and our
[Code of Conduct](https://github.com/gateweavehq/backup/blob/main/CODE_OF_CONDUCT.md). If you work with an AI coding agent, point it at
[AGENTS.md](https://github.com/gateweavehq/backup/blob/main/AGENTS.md). Report security issues privately, as described in
[SECURITY.md](https://github.com/gateweavehq/backup/blob/main/SECURITY.md).

## License

Copyright © 2026 Yiğit Tanrıverdi.

Gateweave Backup is licensed under the [GNU Affero General Public License v3.0](https://github.com/gateweavehq/backup/blob/main/LICENSE). You can
self-host, use and modify Backup freely. If you run a modified version as a network service, you
must make your changes available to its users under the same license.

Contributions are accepted under the [Contributor License Agreement](https://github.com/gateweavehq/backup/blob/main/CLA.md).
