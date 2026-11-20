# Restoring

A restore needs three things: the master key, the repository's objects, and the CLI in
`packages/cli`. Nothing else: no Gateweave service, no Worker, not even Cloudflare if you have a
copy of the objects elsewhere.

A restore never goes over live data. The CLI writes only new files, into a folder you name, and you
load them into a **new** database. A bucket's objects can go straight back into a bucket, but only
where their keys are free. It only reads the repository, whatever its credentials allow.

The names here are [deploy.md](/backup/deploy/)'s example: the backup bucket is `my-backup`, and the
sources are an app's D1 database (`shop`), its Durable Objects (`shop-carts`) and its bucket
(`shop-files`).

## Get the CLI

It is one file that runs on Node.js 22.13 or later. At the root of a checkout:

```sh
pnpm install
pnpm build
node packages/cli/dist/gateweave-backup.mjs --help
```

`packages/cli/dist/gateweave-backup.mjs` can be copied anywhere and run with `node`. Keep a copy
with your key's backup, so a restore doesn't depend on this repository either. The commands below
run it from where it was copied to, as `node gateweave-backup.mjs`.

## The key

The CLI reads the key from `GATEWEAVE_BACKUP_KEY`, from a file (`--key-file <file>`), from stdin
when something is piped in, or asks for it without showing it. It never takes the key as an
argument, since shells keep those in their history. Piping it from a password manager works:

```sh
op read "op://Private/Backup/key" | node gateweave-backup.mjs snapshots ./shop
```

## Reach the repository

Each source has its own repository, in the bucket's folder of the same name (`shop`,
`shop-carts`, …).

**Straight from R2.** Make an R2 API token in the dashboard (R2 object storage › Overview › API
Tokens › Manage) with the **Object Read only** permission, for the backup bucket alone. It gives an
Access Key ID and a Secret Access Key:

```sh
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export AWS_ENDPOINT_URL=https://<account id>.r2.cloudflarestorage.com
node gateweave-backup.mjs snapshots s3://my-backup/shop
```

A bucket made in a jurisdiction is reached only through that jurisdiction's endpoint:
`https://<account id>.eu.r2.cloudflarestorage.com` for an EU bucket.

Any other S3-compatible bucket works the same way, with its endpoint and keys, and `--region` (or
`AWS_REGION`) when the provider wants one. That is how the copy outside Cloudflare is read.

**From a copy.** A folder holding a repository's `config.json`, `snapshots/` and `data/`, as
`rclone copy` or `aws s3 sync` leaves it, is a repository too:

```sh
node gateweave-backup.mjs snapshots ./shop
```

## Look before restoring

```sh
node gateweave-backup.mjs snapshots s3://my-backup/shop
node gateweave-backup.mjs show s3://my-backup/shop latest
```

`show` lists a snapshot's files and, for a database, every table with its row count. It prints
names and counts, never values.

`check` reads a snapshot the way a restore would, checks every chunk against its id and every file
against its SHA-256, then restores each database in it into memory and counts its rows against the
dump.
`check --all` does that for every snapshot. Nothing is written to disk.

```sh
node gateweave-backup.mjs check s3://my-backup/shop --all
```

## Restore a D1 database

```sh
node gateweave-backup.mjs restore s3://my-backup/shop latest --to ./restore
npx wrangler d1 create shop-restored
npx wrangler d1 execute shop-restored --remote --file ./restore/database.sql
```

Check the new database, then point the app at it, or copy the rows you need from it. Don't load the
file into the live database: it makes every table, and the live one has them already.

`--as sqlite` writes `database.sqlite` instead, a SQLite file to open with `sqlite3` or any SQLite
tool. `--as files` writes the files the snapshot holds, as they were backed up (`database.jsonl`,
[format.md](/backup/format/#sqlite-dumps) describes it).

## Restore an app's Durable Objects

A snapshot of an app's Durable Objects holds a database per object. `show` lists them, and
`--object <name>` shows one's tables. `restore` writes `<object>.sql` for each object, or
`<object>.sqlite` with `--as sqlite`; `--object` restores only the one it names:

```sh
node gateweave-backup.mjs show s3://my-backup/shop-carts latest
node gateweave-backup.mjs restore s3://my-backup/shop-carts latest --to ./restore --as sqlite --object <name>
```

Each file is one object's database. Read it with `sqlite3`, or load the SQL into a new D1 database
to look at it. Putting it back into the live app's object is the app's to offer
([app-entrypoint.md](/backup/app-entrypoint/#what-a-restore-then-needs-from-the-app)); Gateweave Track,
whose workspaces are backed up this way, doesn't yet.

## Restore an R2 bucket's objects

A snapshot of a bucket holds every object's bytes and `bucket.json`, which lists them with their
metadata ([format.md](/backup/format/#manifests)).

**Into the bucket.** `--to s3://<bucket>` puts the objects back, each under its key with its type,
its other HTTP metadata and its custom metadata. An object goes in only where its key is free: every
upload carries `If-None-Match: *`, so the bucket refuses one whose key is taken, and nothing in it is
ever replaced. That makes it safe to aim at the live bucket, which gets back what is missing and
keeps the rest as it is.

Pick what comes back with `--prefix`. An app that keeps each customer's files under
`<customer id>/` brings back one customer's files this way, and leaves alone the ones people
deleted elsewhere:

```sh
export GATEWEAVE_RESTORE_ENDPOINT_URL=https://<account id>.r2.cloudflarestorage.com
export GATEWEAVE_RESTORE_ACCESS_KEY_ID=…
export GATEWEAVE_RESTORE_SECRET_ACCESS_KEY=…
node gateweave-backup.mjs restore s3://my-backup/shop-files latest \
  --to s3://shop-files --prefix "<customer id>/"
```

The bucket takes a second R2 API token, one with **Object Read & Write** for that bucket alone, in
the `GATEWEAVE_RESTORE_*` variables, so the token that reads the backup can stay read-only. Without
them the `AWS_*` ones are used, which suits a restore from a copy on disk. `--to-endpoint` and
`--to-region` stand in for the endpoint and region. A bucket in a jurisdiction has it in its
endpoint, such as `.eu` after the account id; a bucket outside one has none.

The CLI says each key it puts back and each it leaves, then counts them. Each object is read and
checked as it is sent, and the upload is signed with the object's SHA-256, so the bucket refuses
bytes that don't match it. When a restore stops half way, say on a damaged chunk, the objects put
back so far stay, each one whole, and the same restore run again puts back the rest.

The S3 API keeps custom metadata names in lower case, R2 included: a name such as `uploadedBy`
comes back as `uploadedby`, and the CLI says so. Check what your app does with a name that lost
its capitals. Gateweave Track reads its `uploadedBy` only to tell a retried upload from someone
else's, so its restored files work as before. Metadata no header can carry, such as a name outside
ASCII, stops the restore before anything is sent; an object over 4.995 GiB, more than one upload
takes at R2, does too.

**Into a folder.** `--to <folder>` writes `bucket.json`, and each object at `files/<key>`.
`--prefix` works here too.

```sh
node gateweave-backup.mjs restore s3://my-backup/shop-files latest --to ./restore
```

A key that can't be a path in a folder, such as one with `..` or `//` in it, stops the restore and
says so.

## An app that seals its data under its own key

The rule: **Backup copies what is there, as it is.** A dump copies a database's rows as they are
stored, and a bucket's snapshot copies its objects' bytes. So whatever an app encrypted before
storing it is in the backup still encrypted, under the app's key and not the backup's. The master
key opens the snapshot, and what comes out needs the app's key to read. Backup never holds that
key, and no snapshot does.

For such an app, a restore therefore needs:

- **The app's key, kept by its operator** where the master key is kept, with any earlier key the
  app still reads with. Without it the restore gives back everything the app stored in the clear,
  and none of what it sealed.
- **Whatever else the app opens a sealed thing with,** restored beside it: a salt in a row, the
  object's own name. So such objects go back under the keys they had, and beside the rows that
  describe them.
- **Sources that agree.** Each source is read at its own moment of the night, so a row in one
  snapshot can point at an object that another doesn't hold yet, or no longer holds.
- **A way of its own to know that it worked.** Restore tests count rows and check bytes. They
  have no app's key, so they can't tell that a sealed thing opens.

### A worked example: Gateweave Mail

[Gateweave Mail](https://github.com/gateweavehq/mail) is such an app, and Gateweave Cloud backs it
up with the configuration in `env.gateweave` ([deploy.md](/backup/deploy/#an-example-of-a-real-configuration-envgateweave)),
so the names below are that deployment's: the backup bucket is `gateweave-backup`, in the EU
jurisdiction. Mail's data is in three sources, and mail that reads again needs all three, and one
thing no backup holds: Mail's own key.

| Source         | Kind            | What it holds                                                                                                                            |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mail`         | D1              | Accounts, workspaces, mailboxes and the address directory, with the workspaces' provider keys and Resend secrets, sealed by Mail         |
| `mail-objects` | Durable Objects | `mailbox.<mailbox id>`: a mailbox's index. `webhooks.<workspace id>` and `audience.<workspace id>`: a workspace's webhooks and templates |
| `mail-raw`     | R2              | Every message as Mail keeps it, under `<workspace id>/<mailbox id>/`, sealed by Mail                                                     |

**Mail's key comes from the operator.** Mail seals raw mail, provider keys, Resend secrets and
webhooks' signing secrets under its `SECRETS_KEY`, a secret of the Worker `gateweave-mail-cloud`.
Backup never holds it and no snapshot does: the bucket's objects are copied as they are, and a
dump copies rows as they are. So the master key opens a snapshot, and what comes out is still
sealed by Mail. Keep `SECRETS_KEY` where the master key is kept, and `SECRETS_KEY_PREVIOUS` too
while Mail has one. Without it the restore gives back the accounts, the directory, each mailbox's
index (addresses, subjects, dates, what was sent and how it went) and the templates, and no
message's body or attachments, no provider key and no webhook's secret.

A message opens with three things: that key, the salt in its row (`seal`, in its mailbox's
`message` table) and its object's name. So raw mail goes back under the keys it had, which is
what the CLI does, and beside the mailbox's rows from a snapshot that has the message.

**The three are read one after another,** each at its own moment of the night. A message that
arrived or was deleted in between can have its row in one snapshot and no object in the other, or
the other way round.

**The database.** As any D1 database, into a new one:

```sh
node gateweave-backup.mjs restore s3://gateweave-backup/mail latest --to ./restore
```

**Raw mail.** Into the bucket, where the keys are free, a mailbox at a time. The bucket is in the
`eu` jurisdiction, so its endpoint has `.eu` after the account id. Mail keeps no metadata on the
objects, so none is lost on the way:

```sh
node gateweave-backup.mjs restore s3://gateweave-backup/mail-raw latest \
  --to s3://gateweave-mail-eu --prefix "<workspace id>/<mailbox id>/"
```

**A mailbox, a workspace's webhooks or its templates.** As any app's object, to a file:

```sh
node gateweave-backup.mjs restore s3://gateweave-backup/mail-objects latest \
  --to ./restore --as sqlite --object mailbox.<mailbox id>
```

What this doesn't cover:

- **Putting an object back into the live app.** Mail has no way to load a mailbox's, a webhooks'
  or an audience's database, so a restored one is read with `sqlite3` or loaded by hand. Raw mail
  put back into the bucket shows in Mail only while its mailbox still has the message's row.
- **A mailbox's search index.** It keeps no text of its own (`message_search`, a contentless FTS5
  table), so it comes back empty, and the snapshot's `empty` names it. A mailbox loaded from a dump
  needs its messages indexed again.
- **Rate limits and the queue.** Mail leaves its rate limiter's objects out of what it lists:
  they hold counters that expire. Delivery events waiting in its queue are in no backup.
- **A very large mailbox.** `message_reference` and `delivery` have no rowid, so a mailbox in which
  one of them alone passes 12 million characters can't be read a page at a time, and the backup of
  `mail-objects` fails and says so ([deploy.md](/backup/deploy/#what-it-cant-do-yet)).
- **That a message opens.** Restore tests restore `mail` and each object's dump and count their
  rows, and read every object of `mail-raw` back against `bucket.json`. None of them has Mail's
  key, so none can tell that a sealed message opens.

## When it fails

The CLI says what went wrong and names the object, never what is in it:

- **That key doesn't open this repository**: a different key, or a different repository.
- **… could not be opened: the key is wrong, or the object was changed**: an object was damaged
  or changed. Try an older snapshot; `check --all` shows which ones are whole.
- **… is missing**: a chunk is gone, so its snapshot can't be restored whole.
- **… is there already**: the folder has a file of that name. Pick an empty folder.

A file is written as `<name>.partial-<random>` and gets its name only once it is whole. If the CLI
is killed outright, such a file can stay behind: delete it and restore again.

`--key-file` reads a file PowerShell's `>` wrote (UTF-16) as well as plain text.
