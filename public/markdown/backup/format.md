# Repository format, version 1

A backup repository is a set of objects under one prefix in a bucket: R2, or any S3-compatible
store. Everything in it can be restored from the key and the objects alone, with no Gateweave
service running. That's a promise to the people who rely on these backups, so this document is the
contract: code that reads or writes a repository follows it, and a change to it is a new version.

## Objects

| Key                    | Holds                                           | Sealed |
| ---------------------- | ----------------------------------------------- | ------ |
| `config.json`          | The repository's id, format version and chunker | No     |
| `snapshots/<name>`     | One snapshot's manifest                         | Yes    |
| `data/<id[0..2]>/<id>` | One chunk of data, named by its id              | Yes    |

A snapshot's name is its time and a random part, `20261111T200500Z-3f9a1c2e`. Names sort by time.
A writer gives each snapshot a second of its own: one made in a second that already has a snapshot
takes the next free second, so the newest snapshot always sorts last.

`config.json` is plain JSON:

```json
{
	"format": "gateweave-backup",
	"version": 1,
	"id": "<32 hex characters, random>",
	"created": "2026-11-11T20:05:00.000Z",
	"chunker": { "min": 262144, "avg": 1048576, "max": 4194304 },
	"check": "<base64url of a sealed blob>"
}
```

`check` is the text `gateweave-backup` sealed with the label `config:<id>`. Opening it proves the key
is the right one before anything is written.

## Keys

The owner keeps one master key: 32 random bytes, written as base64url (43 characters). Gateweave
never stores it anywhere else. Lose it and the backups can't be read.

Two keys are derived from it with HKDF-SHA256, with the repository's id (16 bytes) as the salt, so
the same master key gives different keys in different repositories:

| `info`                         | Length   | Used for                        |
| ------------------------------ | -------- | ------------------------------- |
| `gateweave-backup v1 seal`     | 32 bytes | AES-256-GCM, sealing every blob |
| `gateweave-backup v1 chunk-id` | 32 bytes | HMAC-SHA256, naming chunks      |
| `gateweave-backup v1 chunker`  | 1 KiB    | The chunker's gear table        |

## Sealed blobs

```
byte 0       version, 1
byte 1       flags: bit 0 set means the plaintext was compressed with deflate-raw first
bytes 2-13   nonce, 12 random bytes
bytes 14-    AES-256-GCM ciphertext, then its 16-byte tag
```

The additional authenticated data is the label's UTF-8 bytes followed by bytes 0 to 13. The label
says what the blob is: `chunk:<id>` for a chunk, `snapshot:<name>` for a manifest, `config:<id>` for
the check. So a blob moved to another name doesn't open.

A blob is compressed only when that makes it smaller. Compressing before encrypting can reveal
something through sizes when an attacker writes part of the data and watches the bucket. Someone
who can do both already reads more than sizes, so we accept it, as restic and Borg do.

## Chunks

A file's bytes are cut into chunks with FastCDC (content-defined chunking): a 32-bit gear hash over
the bytes, normalized with a stricter mask before the average size and a looser one after it. The
gear table comes from the key, so chunk boundaries say nothing to someone without it. Because cuts
depend on content, an edit in the middle of a dump changes only the chunks around it.

A chunk's id is the lowercase hex HMAC-SHA256 of its plaintext under the chunk-id key. A chunk that
already exists isn't uploaded again.

## Manifests

A manifest is JSON, sealed:

```json
{
	"version": 1,
	"name": "20261111T200500Z-3f9a1c2e",
	"created": "2026-11-11T20:05:00.000Z",
	"source": { "kind": "d1", "name": "gateweave-id" },
	"files": [
		{ "path": "database.jsonl", "size": 123456, "sha256": "<hex>", "chunks": ["<id>", "..."] }
	],
	"meta": {}
}
```

`sha256` is the plain SHA-256 of the whole file, checked after a restore joins its chunks. `meta`
holds what the source wants to say, such as a dump's table and row counts.

A source of many databases, such as an app's Durable Objects, keeps each one's dump at
`objects/<name>.jsonl`, under the object's name (`"kind": "do"`). A name is up to 200 letters,
digits, dots, dashes and underscores, starting with a letter or digit, so it is always a plain file
name. Its `meta` counts them all: `{"objects": 3, "tables": 69, "rows": 1840, "empty": []}`, where
`empty` names a contentless table as `<object>/<table>`.

An R2 bucket's snapshot (`"kind": "r2"`) keeps each object's bytes at `files/<key>`, under its key
as it is, and lists the objects in `bucket.json`: a head line, then one object a line, in key
order, with what R2 keeps beside the bytes, so a restore can put it back as it was:

```json
{"format":"r2-bucket","version":1,"objects":2}
{"key":"w1/a.png","size":5120,"etag":"<etag>","uploaded":"2026-11-12T10:00:00.000Z","http":{"contentType":"image/png"},"custom":{"uploadedBy":"<id>"}}
{"key":"w1/b.pdf","size":90210,"etag":"<etag>","uploaded":"2026-11-12T11:00:00.000Z","http":{"contentType":"application/pdf","cacheExpiry":"2027-01-01T00:00:00.000Z"},"custom":{}}
```

`http` has any of `contentType`, `contentLanguage`, `contentDisposition`, `contentEncoding`,
`cacheControl` and `cacheExpiry`. Its `meta` counts them: `{"objects": 2, "bytes": 95330, "read":
1, "reused": 1}`, where `read` objects were read this time and `reused` ones kept the file the
snapshot before had for them.

A dump that couldn't be read at one moment, because its database kept changing while it was read a
page at a time, says so in its head line, and the `meta` says so too: `"consistent": false` for a
single database, or `"inconsistent"` with the names of such objects. Neither appears otherwise.

## SQLite dumps

D1 and Durable Object databases are dumped to `database.jsonl`: one JSON object per line, in this
order. Lines, not SQL, so a value with a line break in it can't split a statement, and so the
restore can check what it reads.

| `k`                        | Fields                                               | Meaning                                                                |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `head`                     | `format: "sqlite-jsonl"`, `version: 1`, `consistent` | Start. `consistent` is true when every row was read at the same moment |
| `table`                    | `name`, `sql`, `cols`                                | A table, its `CREATE` statement and the columns its rows list          |
| `virtual`                  | `name`, `sql`, `cols`, `content`                     | A virtual table. `content` is `own`, `external` or `none` (FTS5)       |
| `row`                      | `t`, `v`                                             | A row of table `t`: its values as SQL literals, joined by commas       |
| `seq`                      | `name`, `seq`                                        | An `AUTOINCREMENT` counter (`sqlite_sequence`)                         |
| `index`, `trigger`, `view` | `name`, `sql`                                        | Made after the rows, as `.dump` does                                   |
| `rebuild`                  | `t`                                                  | Rebuild an external-content FTS5 index                                 |
| `end`                      | `tables`, `rows`                                     | End. A dump without it is incomplete                                   |

Values come from SQLite's own `quote()`, so integers keep every digit, reals round-trip, text is
escaped and blobs are `X'..'`. Columns are the ones `PRAGMA table_info` lists, which leaves out
generated columns.

Left out: SQLite's own tables (`sqlite_*`), Cloudflare's (`_cf_*`) and the shadow tables of virtual
tables, whose contents are rebuilt instead. A contentless FTS5 table (`content=''`) can't be rebuilt
from anything, so it comes back empty, and the manifest says so.

The restore turns the lines back into SQL: the tables and their unique indexes, then the rows as
`INSERT` statements, then the counters, the other indexes, triggers and views, then the rebuilds,
with foreign keys deferred. Unique indexes come first because a foreign key may point at columns
only such an index makes unique, and SQLite refuses rows for it until the index exists, deferred or
not; D1 always checks foreign keys. That SQL works with `wrangler d1 execute --file` and with
SQLite itself.

No statement is longer than 90,000 bytes, since D1 and Durable Objects refuse one over 100,000 and
a D1 row may be 2 MB. A row whose `INSERT` would be longer goes in through a table of the restore's
own, `_gateweave_restore_parts` (with a number after it if the dump has a table of that name):
its longest values are inserted there in pieces of up to 80,000 bytes, text as text and blobs as
hex, and the row's `INSERT` reads each back with `group_concat(part, '' ORDER BY n)`, through
`unhex()` for a blob. The pieces are deleted after each row and the table is dropped at the end.
That needs SQLite 3.44 or later, which D1 has.

## Retention

Retention is the writer's business, not the format's: a reader restores whatever snapshots are
there. What the Worker does, so that pruning is predictable:

- A policy counts snapshots to keep: the newest `l`, then the newest snapshot of each of the newest
  `d` days, `w` ISO weeks and `m` months that have one, all in UTC. It is written `1l 7d 4w 12m`,
  which is the default. A snapshot kept by any rule stays.
- Forgetting a snapshot deletes its manifest. Pruning then deletes the chunks no remaining manifest
  names, and only those: it opens every manifest first, and deletes nothing if one doesn't open.
- Nothing else writes to the repository while it prunes. A run holds the source's lock from its
  first write to its last.
