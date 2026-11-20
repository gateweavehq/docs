---
title: "Deploying the Worker"
editUrl: "https://github.com/gateweavehq/backup/edit/main/docs/deploy.md"
source:
  product: "Gateweave Backup"
  version: "main"
  updatedAt: "2026-11-18T09:04:29Z"
  url: "https://github.com/gateweavehq/backup/blob/main/docs/deploy.md"
  markdownUrl: "/markdown/backup/deploy.md"
---
The Worker runs in the Cloudflare account whose data it backs up, so the data and the key never
pass through anyone else. It needs Workers Paid: a backup step needs minutes of CPU, and Workflows
on Free get 10 ms a step.

Run these from `apps/worker` in a checkout of this repository, after `pnpm install` at its root,
logged in with `npx wrangler login`.

The names here are an example. The Worker, its bucket, its catalog and its Workflow are all called
`my-backup`, and the app it backs up is called `shop`: a Worker `shop` with a D1 database, carts
in Durable Objects and a bucket of files. Use your own.

## 1. The key

```sh
pnpm -w keygen
```

prints a new master key (`-w` because the script is the repository root's, and these commands
run in `apps/worker`). Put it in a password manager **before anything else**. Every backup is
sealed with it, and without it none of them opens: nobody, Gateweave included, can recover it.

## 2. The bucket and the catalog

```sh
npx wrangler r2 bucket create my-backup
npx wrangler d1 create my-backup
```

`apps/worker/wrangler.jsonc` comes with `gateweave-backup` for all four names. At its top level,
above `env`, set the Worker's `name`, the vault's `bucket_name`, the catalog's `database_name` and
the Workflow's `name` to yours, and put the `database_id` that `d1 create` printed beside
`database_name`. Then make the catalog's tables:

```sh
npx wrangler d1 migrations apply my-backup --remote
```

Lock the bucket, so that nothing can delete or overwrite a backup for 30 days: not a mistake, not a
bad deploy, and not someone who gets hold of a token.

```sh
npx wrangler r2 bucket lock add my-backup keep-30-days "" --retention-days 30
```

Retention still runs under a lock. What it would delete before the lock allows is left for a later
run, and the catalog counts it as held.

## 3. The sources

Each D1 database to back up gets a binding in `d1_databases` and an entry in `SOURCES`:

```jsonc
"d1_databases": [
	{ "binding": "CATALOG", "database_name": "my-backup", "database_id": "…", "migrations_dir": "migrations" },
	{ "binding": "SHOP_DB", "database_name": "shop", "database_id": "…" }
],
"vars": {
	"SOURCES": [{ "name": "shop", "kind": "d1", "binding": "SHOP_DB" }]
}
```

A source's `name` is its folder in the bucket. Choose it once: a new name starts a new repository.

### An app's Durable Objects

An app that offers a `Backup` entrypoint gets a service binding to it and a source of kind `do`.
The app must be a Worker in the same account. [app-entrypoint.md](/backup/app-entrypoint/) says what
the entrypoint is and how to write one for your app:

```jsonc
"services": [{ "binding": "SHOP_APP", "service": "shop", "entrypoint": "Backup" }],
"vars": {
	"SOURCES": [
		{ "name": "shop", "kind": "d1", "binding": "SHOP_DB" },
		{ "name": "shop-carts", "kind": "do", "binding": "SHOP_APP" }
	]
}
```

The app says which objects there are. Each night's snapshot holds a dump per object, under its
name, and stores only the dumps that changed.

### An R2 bucket

A bucket gets an R2 binding and a source of kind `r2`. Each night's snapshot holds every object,
with its metadata, and reads only the objects that are new or were replaced since the last one:

```jsonc
"r2_buckets": [
	{ "binding": "VAULT", "bucket_name": "my-backup" },
	{ "binding": "SHOP_FILES", "bucket_name": "shop-files" }
],
"vars": {
	"SOURCES": [{ "name": "shop-files", "kind": "r2", "binding": "SHOP_FILES" }]
}
```

The binding needs only to read, but Workers bindings can't be made read-only: the backup lists and
gets, and never writes there. `VAULT` itself can't be a source.

## 4. Set the key and deploy

```sh
npx wrangler secret put BACKUP_KEY
npx wrangler deploy
```

Paste the key when asked. The key goes first: the configuration requires it (`secrets.required`),
and a deploy without it is refused. The Worker doesn't exist yet, so Wrangler offers to make it
to hold the secret; say yes. Backups run every night at 03:17 UTC (`schedules` in `wrangler.jsonc`).

## 5. Run one now, and check it

```sh
npx wrangler workflows trigger my-backup '{"sources":["shop"]}'
npx wrangler workflows instances describe my-backup latest
npx wrangler d1 execute my-backup --remote \
  --command "SELECT source, status, snapshot, row_count, error FROM run ORDER BY started_at DESC LIMIT 5"
```

A run with no `sources` backs up all of them. One that fails says why in the catalog's `error`,
which names objects and steps, never data.

Two runs may be going at once, such as one started by hand while the nightly one runs. A lock per
source keeps them apart: the run that comes second fails that source with "Another run is backing
up …", changes nothing, and alerts like any failed run. Start it again when the first has ended.

Then restore it once, before you need to: [restore.md](/backup/restore/).

## Restore tests

Every `RESTORE_TEST_DAYS` days (30 by default), a run restores the snapshot it has just made into a
Durable Object's SQLite, counts every table against the dump, and rolls the rows back, so no copy
stays there. The first run of a source tests it, and a test that fails is tried again the next
night. The deploy makes the Durable Object (`exports` in `wrangler.jsonc`).

Set `JURISDICTION` to the bucket's jurisdiction (`"eu"` or `"fedramp"`), so restore tests run there
too. To test now, add `"test": true` to a run, and read the outcome in the catalog:

```sh
npx wrangler workflows trigger my-backup '{"sources":["shop"],"test":true}'
npx wrangler d1 execute my-backup --remote \
  --command "SELECT source, snapshot, status, row_count, error FROM restore_test ORDER BY tested_at DESC LIMIT 5"
```

A failed test fails the run, but the backup it tested stays.

## Alerts

A run in which a backup, a restore test or a copy failed sends an alert, and so does the daily
check (`triggers` in `wrangler.jsonc`, at 09:17 UTC) when a source's newest backup started over 26
hours ago, or hasn't ended after 5. The check counts on backups running every night. Every alert is
kept in the catalog's `alert` table, sent or not; set up where they go, by email, by webhook or
both.

**Email** needs [Email Service](https://developers.cloudflare.com/email-service/) sending from a
domain of yours (`npx wrangler email sending enable example.com`). Add the binding and the sender
to `wrangler.jsonc`:

```jsonc
"send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["backup@example.com"] }],
"vars": { "ALERT_FROM": "Backups <backup@example.com>" }
```

and give where alerts go as a secret, so no address is in the repository: one or several,
separated by commas.

```sh
npx wrangler secret put ALERT_TO
```

**A webhook** gets a POST of JSON, `{"type":"backup.alert","timestamp":…,"data":{"key","subject","text"}}`,
signed as [Standard Webhooks](https://www.standardwebhooks.com) signs one, so its libraries check
it. Set two secrets: `ALERT_WEBHOOK_URL`, an https address, and `ALERT_WEBHOOK_SECRET`, at least 24
random bytes in base64 (`whsec_` in front or not). `webhook-id` is the same each time an alert is
sent, so the receiver can drop a second copy.

A setting that is there but wrong stops alerts, not backups, and the catalog says which. To check
that alerts arrive, add `"alert": true` to a run, which sends one even if nothing failed:

```sh
npx wrangler workflows trigger my-backup '{"sources":["shop"],"alert":true}'
npx wrangler d1 execute my-backup --remote \
  --command "SELECT key, subject, sent_to, sent_at, error FROM alert ORDER BY made_at DESC LIMIT 5"
```

`sent_to` lists where it went; it is empty when nothing is set up. An alert that couldn't go keeps
its `error`, and the daily check sends it again for three days.

## Retention

`RETENTION` keeps the newest snapshot, the newest of each of the last 7 days, 4 weeks and 12 months
(`1l 7d 4w 12m`). [format.md](/backup/format/#retention) says exactly how it counts.

## A copy outside Cloudflare

A bucket in your Cloudflare account doesn't survive the account being lost or misused, so each run
can also copy every source's repository to an S3-compatible bucket at another provider, such as
Backblaze B2, Hetzner Object Storage or Scaleway. It is off until `COPY_TO` names a bucket. It
sends the sealed objects as they are in the vault, and only those the copy lacks: the provider
sees chunk ids, snapshot times and sizes, never data, and the key stays with you.

Make a bucket there, and a key that may list, read, write and delete in that bucket only. Then set
where it is in `wrangler.jsonc`:

```jsonc
"vars": {
	"COPY_TO": "s3://<bucket>/<folder>",
	"COPY_ENDPOINT": "https://s3.eu-central-003.backblazeb2.com",
	"COPY_REGION": "eu-central-003"
}
```

`COPY_ENDPOINT` is the bucket's S3 endpoint, an https URL, and `COPY_REGION` the region requests are
signed for, both from the provider's page for the bucket (`auto` is R2's). Deploy, and give it the
key:

```sh
npx wrangler deploy
npx wrangler secret put COPY_ACCESS_KEY_ID
npx wrangler secret put COPY_SECRET_ACCESS_KEY
```

The copy runs after a source's backup, prune and restore test, still under its lock, 200 objects or
256 MB to a step. Chunks go first and manifests last, so a copy cut short holds no snapshot without
its chunks, and the next step or run goes on from what is there. The catalog's `copy` table has a
row per source and run:

```sh
npx wrangler d1 execute my-backup --remote \
  --command "SELECT source, status, object_count, size, snapshot_count, error FROM copy ORDER BY copied_at DESC LIMIT 5"
```

A copy that fails, such as one the bucket refuses, fails the run and sends an alert; the backup
stays in the vault, and the next run sends what is missing.

The copy keeps its own retention, `RETENTION` on the snapshots it holds: a snapshot the vault lost
stays in the copy until the policy lets it go, and none stays longer than the vault would keep it.
If you lock that bucket too, keep its lock no longer than your retention, and with versioning, add a
lifecycle rule that removes noncurrent versions after a few days, or what retention lets go stays
there. If you tell people their data is gone some days after they delete it, count the copy in.

A copy that holds another repository than the vault, as it does after the vault's was lost and
made anew, is left as it is, and the run says so. Move its folder aside to start a new copy. Restore
tests read the vault; to check the copy, point the CLI at it ([restore.md](/backup/restore/)).

## Restoring

[restore.md](/backup/restore/): the CLI reads the bucket with a read-only R2 token and the key, and
writes SQL for a new D1 database, or a bucket's objects to a folder.

## An example of a real configuration: `env.gateweave`

`wrangler.jsonc` also holds the configuration Gateweave Cloud's own backups run with, as the
environment `gateweave`. It is there to read, as a deployment with every kind of source: five D1
databases, three apps' Durable Objects through their `Backup` entrypoints and two buckets, in the
EU jurisdiction, with a 21-day lock, a shorter retention to match a privacy policy, and email
alerts. Its database ids and Worker names are Gateweave's, so `--env gateweave` deploys nowhere
but there. Your own configuration goes at the top level, and you can delete `env` from your copy.

## What it can't do yet

- D1, an app's Durable Objects and R2 buckets. KV is not built.
- A bucket's backup takes a Workflow step per 1,000 objects listed and per 100 objects or 256 MB
  read, so the first backup of a bucket of hundreds of thousands of objects takes too many steps
  for one run. Later runs read only what is new.
- A database whose rows come to more than 12 million characters is read a page at a time (see
  [Core](/backup/architecture/#core)). One that changes during each of three tries is kept anyway, and
  says it wasn't read at one moment. A table that large without a rowid (`WITHOUT ROWID`) can't be
  read a page at a time, and its backup fails.
- A restore test holds the dump in memory once, as it was stored, while it loads. On Cloudflare a
  test of a 160 MB dump passed and one of 240 MB ran out of the Durable Object's memory (measured
  2026-11-12), so larger databases will need a test that restores them in parts.
- An app's objects are listed in one Workflow step, whose result may be 1 MiB: some 25,000 objects
  with names of 36 characters ([app-entrypoint.md](/backup/app-entrypoint/#the-limits)).
- There is no page: the catalog is read with `wrangler d1 execute`, as above.
