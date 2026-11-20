---
title: "Backup architecture"
editUrl: "https://github.com/gateweavehq/backup/edit/main/docs/architecture.md"
source:
  product: "Gateweave Backup"
  version: "main"
  updatedAt: "2026-11-18T09:04:29Z"
  url: "https://github.com/gateweavehq/backup/blob/main/docs/architecture.md"
  markdownUrl: "/markdown/backup/architecture.md"
---
Gateweave Backup keeps copies of what an app on Cloudflare stores (D1 databases, Durable Objects'
SQLite and R2 buckets today; KV is not built) somewhere a mistake or a bad deploy can't reach,
and, when a bucket at another provider is set, somewhere a lost account can't either. It encrypts
them before they leave, keeps them under a retention policy, and tests that they restore.

## Why it exists

Cloudflare's own recovery is good for going back a few days in place, and nothing more:

- D1 Time Travel goes back 30 days (7 on Free) and restores **in place**, overwriting the database.
  It can't copy to a new database yet.
- A Durable Object's SQLite has the same 30 days, also in place, and no export.
- R2 has no point-in-time recovery: a deleted object is gone. Bucket locks can stop deletes for a
  while.
- KV has nothing.

None of it survives the account itself being lost or misused, and none of it is tested until the
day it's needed. The open-source tools we found each cover one piece, mostly a D1 dump into R2 in
the same account.

## Principles

1. **A restore never needs us.** The format is documented ([format.md](/backup/format/)), and the key and
   the objects are enough to read it. A small CLI does it without any Gateweave service.
2. **The key stays with the owner.** Data is sealed before it is written. The Worker holds the key
   as a secret, and nothing else holds it.
3. **One copy outside Cloudflare.** The 3-2-1 rule: three copies, on two kinds of storage, one
   elsewhere. A locked R2 bucket plus an S3-compatible bucket at another provider. The second is
   a setting, `COPY_TO`: a deployment that names no bucket there has no copy outside Cloudflare.
4. **Never restore over live data.** A restore goes to a new database, or into a bucket only where
   a key is free, with a preview of what is in it.
5. **A backup that wasn't restored isn't known to work.** A monthly restore test is part of the
   product, and the catalog keeps each one's date and outcome for every source.

## Pieces

| Piece           | What it does                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `packages/core` | The format: keys, sealing, chunking, repositories, SQLite dumps         |
| `apps/worker`   | Schedules, sources and destinations, the catalog, alerts, restore tests |
| `packages/cli`  | Reads a repository with the key and writes the files back               |

### Core

- **Sealing:** AES-256-GCM, with keys derived from the owner's master key by HKDF and salted with
  the repository's id. Each blob's label (what it is and its name) is authenticated, so a blob moved
  to another name doesn't open.
- **Chunking:** FastCDC with a keyed gear table. Cuts depend on content, so a nightly dump that
  changed in a few places stores only a few new chunks. Chunks are named by an HMAC of their
  plaintext, so the same data is stored once without revealing its hash.
- **SQLite dumps:** one JSON line per table, row and object, built from SQLite's own `quote()`, so
  every value comes back exactly. Virtual tables are handled: FTS5 indexes over another table are
  rebuilt, FTS5 tables that keep their own text are copied with their rowids, and contentless ones
  are reported as coming back empty.
- **One moment, a page at a time when it must be.** A dump first asks how many characters each
  table's rows come to. Up to 12 million, it reads them all in one call, which is one moment: a
  D1 batch is one transaction, and a Durable Object's reads are synchronous. Past that, one call
  can't hold them: a Durable Object answers at most 32 MiB over RPC, and D1 refused a 66 MB batch
  ("exceeded the maximum response size limit of 50 MB", whether it held one statement or four).
  So the dump reads small tables together and large ones a page at a time by rowid, about 12
  million characters a call, and writes each page out before it reads the next. Every call also
  reads `total_changes()`, which any write on the database's connection moves and a read doesn't,
  in D1 and in a Durable Object alike (checked on Cloudflare). A dump whose calls don't all agree
  starts over, up to three tries. The last one goes on regardless and says, in its head line, that
  it wasn't read at one moment. A restart of the database resets the counter, which only makes a
  dump start over.

### Worker

[deploy.md](/backup/deploy/) says how to set it up. Today it backs up D1, an app's Durable Objects
through its `Backup` entrypoint, and R2 buckets, into one R2 bucket, with the catalog, the lock and
retention, and copies them to a bucket at another provider when one is set. What it doesn't have
is at this section's end.

- **Runs in the owner's own Cloudflare account,** deployed with Wrangler from a checkout, so the
  data and the key never pass through Gateweave. A hosted version would hold a token for every
  customer's account. That makes it a target, so it comes later, if at all.
- **Sources through bindings,** not API tokens: a D1 binding per database, an R2 binding per bucket,
  and a service binding to the `Backup` entrypoint of an app whose Durable Objects hold its data.
  Track, Agents and Mail each offer one, and [app-entrypoint.md](/backup/app-entrypoint/) says how
  another app does.
- **An app's objects through the app.** A Worker can't open another Worker's Durable Objects, so
  the app lends a reader with two methods: `objects(cursor)` lists the objects a page at a time,
  and `read(name, statements)` runs a dump's reads in one of them, inside a transaction it always
  rolls back, and answers null for one that is gone. The app checks that the statements only read.
  The entrypoint has no route: a service binding from a Worker in the same account is its access.
- **An app's objects make one snapshot.** The Workflow lists them in one step, dumps 20 to a step,
  so a retry redoes 20 rather than all of them, and commits one manifest with a dump per object at
  `objects/<name>.jsonl`. One deleted after the list was made is left out. Each dump is one
  moment of its object, read as SQLite dumps are; the snapshot isn't one moment across objects,
  which each stand alone.
- **A bucket makes one snapshot too.** A step lists up to 1,000 objects, with their HTTP and custom
  metadata, and stops short of half a megabyte, since a step's answer is kept and has a limit; the
  next goes on from the last key or R2's cursor. An object the newest snapshot holds with the same
  etag, size and upload time keeps that snapshot's file and isn't read: R2 never changes an object,
  only replaces it, so those three tell a new one. The rest are read 100 objects or 256 MB to a
  step, streamed into chunks, each at `files/<key>`, and the commit adds `bucket.json`, which lists
  every object with its metadata. One deleted after it was listed is left out. A newest snapshot
  that doesn't open is no help, so then every object is read again.
- **Cloudflare Workflows** run each backup, one source after another: start, lock, back up, record,
  prune, test when due, copy when set, finish. Steps are durable and retried, so a run that stops resumes at the step it was on,
  and a failed source doesn't stop the others. The Workflow's own `schedules` start a run each night;
  `wrangler workflows trigger` starts one by hand.
- **A D1 catalog** of runs, snapshots, locks, restore tests, copies and alerts is where the daily
  check and the alerts read from, and what an owner asks with `wrangler d1 execute`
  ([deploy.md](/backup/deploy/)). It describes the bucket and never replaces it.
- **A lock per source.** Pruning deletes the chunks no manifest names, so it must never meet a run
  that has found a chunk stored and not yet written its manifest. A run takes the source's lock
  before its first write and gives it back after its last; one that dies frees it after 12 hours.
  A run that finds the lock held fails that source at once, saying another run is backing it up,
  writes nothing and leaves the lock with its holder; its other sources go on, and the run ends
  as failed and alerts. The lock is all that keeps runs apart. The Workflow had a limit of one
  instance at a time as well, from 2026-11-14 to 2026-11-18: scheduled instances never counted
  towards it, and under it every run started by hand stayed queued for good while nothing else
  ran, so it went.
- **Retention:** the newest snapshot, then 7 daily, 4 weekly and 12 monthly by default. Pruning
  forgets manifests first, then deletes the chunks nothing points to. The snapshot a run just made
  always stays.
- **Restore tests.** A run restores the snapshot it made when the source's last passed test is
  `RESTORE_TEST_DAYS` old (30 by default) or it has none, so a failed one is tried again the next
  night. A Durable Object, one per source, reads every file back and checks it, makes the dump's
  tables in its own SQLite, loads the rows in one transaction, checks foreign keys, counts every
  table against the dump, and rolls the rows back. A snapshot of an app's objects is tested a dump
  at a time, each into an empty database. A bucket's has no dump: each object's file is read
  through, a chunk at a time, and checked, and `bucket.json` must list exactly the files there are,
  at their sizes. It runs after the prune and under the lock, so
  it also proves the prune kept what the snapshot needs. A failed test fails the run but keeps the
  backup, and the catalog says why.
- **A restore test keeps no copy.** Only the empty tables are ever committed, and they are deleted
  at the end. The 30 days of point-in-time recovery a Durable Object's storage keeps go back only to
  committed states, so they never hold a row. After the rollback the test checks that every table
  is empty again. The rows can't go in with the tables: rolling back writes to an FTS5 table made in
  the same transaction crashed workerd when we tried it. `JURISDICTION` keeps the objects where the
  bucket is. An object runs one test at a time, since a step that timed out may be tried again
  while its first try is still running.
- **The copy outside Cloudflare** (principle 3) goes to any S3-compatible bucket that `COPY_TO`
  names, through core's own SigV4 client, since a Worker has no SDK to spare. After the restore test
  and under the lock, so the vault holds still, a step lists the copy, works out the objects the
  vault's snapshots need (`Repository.neededKeys()`), and sends what is missing, 200 objects or
  256 MB at a time: chunks, then `config.json`, then the manifests, so a copy cut short holds no
  manifest without its chunks. The objects go as they are, still sealed, so the copy needs no key
  of its own and opens with the master key alone. Then the copy is pruned by the same retention,
  on its own snapshots: one the vault lost stays until the policy lets it go, which is what the
  copy is for, and a lock there holds what it would delete, counted as held. A copy whose
  `config.json` isn't the vault's holds another repository, whose snapshots the new manifests
  wouldn't open with; it is left alone rather than pruned for them. A refusal (4xx) or a missing
  object fails the copy at once; a busy bucket is tried again. A failed copy fails the run and keeps
  the backup, like a failed restore test, and the `copy` table says why.
- **Alerts.** A run in which a backup, a restore test or a copy failed ends with an alert, and so does
  one that asks for it (`"alert": true`). The Worker's own cron checks each morning, six hours after
  the nightly run, that every source's newest backup started in the last 26 hours and hasn't been
  going for over 5, and alerts if not: that catches the runs that never got far enough to send their
  own. An alert goes by email through Email Service's binding, as text and as an HTML card with no
  images or links to load, and to a webhook signed as Standard
  Webhooks signs one, whichever are set up. It is written to the catalog under its key
  (`run:<instance>` or `late:<day>`) before it is sent and marked when it has gone, so a retried step
  doesn't send it twice. One that can't be sent stays there with why, the run ends as it would have,
  and the morning check tries it again for three days. Its text names sources, snapshots and steps,
  never data, like the catalog's errors. Opening a Track issue can come through the webhook.
- **Not built:** KV sources; a page that shows the catalog, so the Worker answers no requests and
  the catalog is read with Wrangler; an MCP server for agents to list and check backups; and a
  Deploy to Cloudflare button, since the Worker's configuration is in `apps/worker` and names its
  sources by hand. [deploy.md](/backup/deploy/#what-it-cant-do-yet) has the limits of what is built.

### CLI

[restore.md](/backup/restore/) says how to use it.

- **One file, Node only.** It bundles the format's code, so a restore needs Node.js and that file,
  nothing from Gateweave. It signs S3 requests itself (SigV4) rather than pulling in an SDK.
- **Reads only.** The stores it opens refuse every write, so no mistake in it, and no token with more
  rights than it needs, can change a backup.
- **Writes only new files.** A restore goes to a folder: SQL for a new D1 database, a SQLite file, or
  the files as stored. Each file is written under a name of its own (`<name>.partial-<random>`),
  checked for its size, then given its name with a hard link, which refuses a name that is taken
  where a rename would replace it. So a restore that fails or is stopped leaves nothing that looks
  finished.
- **Checks by restoring.** `check` restores each database into memory and counts its rows against
  the dump, which proves more than reading the bytes.
- **An object at a time.** A snapshot of an app's Durable Objects restores to a file per object,
  `<object>.sql` or `<object>.sqlite`, or to the one `--object` names, since one workspace is what
  someone usually needs back.
- **Into a bucket, only where a key is free.** A snapshot of a bucket goes back with `--to s3://`,
  through a store of its own that only creates: each PutObject carries `If-None-Match: *` and is
  signed with the object's SHA-256, so the bucket refuses a taken key and bytes that don't match.
  `--prefix` picks the objects, such as one workspace's files. It writes with node:http, since fetch
  adds `Cache-Control: no-cache` to a conditional request and R2 would keep it on the object. R2
  keeps custom metadata names that come through the S3 API in lower case (measured 2026-11-12), so
  the CLI says which names lost their capitals.

## Decisions

- **Our own format, not restic's.** restic's format would let its CLI read our backups, but its
  sealing (AES-CTR with Poly1305-AES) and its index files need more code in a Worker than they give
  back. A short, documented format and our own restore CLI keep the promise in principle 1.
- **JSON lines for SQLite, not SQL text.** A line can't be split by a value with a line break in it,
  and the restore can check what it reads, including that the dump ended.
- **Restore tests in a Durable Object, not in memory.** A WebAssembly SQLite in the Worker would
  keep everything in memory, but it isn't the SQLite D1 runs, with D1's limits. A Durable Object's
  is, so a statement D1 would refuse fails the test too, and rolling the rows back keeps the data out
  of its storage. The rows go in inside one synchronous transaction, which can't wait for the
  bucket, so the test reads the dump first and holds it once, as the chunks it was stored in,
  turning one line at a time into SQL.
- **Pages checked by `total_changes()`, not one read streamed out of the app.** An app's object
  could read everything at one moment and stream it out, past the 32 MiB a call returns, but it
  would hold the whole dump in memory beside its own work, and an object that runs out of memory
  is reset under the people using it. Pages keep what it holds to one page, and the counter tells
  when they saw different moments.
