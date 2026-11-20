# Make your app's Durable Objects backable

A Worker can't open another Worker's Durable Objects, so Gateweave Backup can't reach the SQLite
your app keeps in them the way it reaches a D1 database or a bucket. The app lends it a reader
instead: a named entrypoint called `Backup`, with two methods. Backup calls it over a service
binding, and gets a SQLite dump of every object the app lists, in one snapshot
([architecture.md](/backup/architecture/#worker)).

This guide is for the app's author. It has the contract, an example to copy, and the rules the
example keeps, each with its reason. [deploy.md](/backup/deploy/#an-apps-durable-objects) says how to
bind Backup to the entrypoint once it exists.

Three apps offer one today, and the rules below are theirs:

- Gateweave Track, a workspace an object:
  [`apps/web/src/server/backup.ts`](https://github.com/gateweavehq/track/blob/main/apps/web/src/server/backup.ts)
  is the entrypoint, and
  [`packages/sync-server/src/backup.ts`](https://github.com/gateweavehq/track/blob/main/packages/sync-server/src/backup.ts)
  the read inside the object.
- Gateweave Mail, three kinds of object behind one entrypoint:
  [`apps/web/src/server/backup.ts`](https://github.com/gateweavehq/mail/blob/main/apps/web/src/server/backup.ts)
  and
  [`apps/web/src/server/backup-read.ts`](https://github.com/gateweavehq/mail/blob/main/apps/web/src/server/backup-read.ts).
- [Gateweave Agents](https://github.com/gateweavehq/agents), its registries and conversations.

## The contract

`BackupService` in [`apps/worker/src/bindings.ts`](https://github.com/gateweavehq/backup/blob/main/apps/worker/src/bindings.ts):

```
objects(cursor?: string): Promise<{ names: string[]; cursor?: string }>
read(name: string, statements: string[]): Promise<Row[][] | null>
```

- **`objects(cursor)`** lists the objects to back up, a page at a time. The first call has no
  cursor. An answer with a `cursor` has more pages, and Backup passes that cursor back for the
  next; an answer without one is the last.
- **`read(name, statements)`** runs the statements in the object of that name, all at one moment,
  and answers each statement's rows, in the statements' order: a row is an object of column names
  and values, as `sql.exec(…).toArray()` gives it. It answers `null` when there is no such object.

That is the whole of it. Backup decides what to read and writes the dump; the app never builds a
dump, and never sees the backup key.

## An example to copy

An app that keeps notebooks, each in a Durable Object with SQLite, and lists them in a D1 table
`notebook (id TEXT PRIMARY KEY)`. Its Worker's configuration binds the database as `DB` and the
objects as `NOTEBOOK`.

```ts
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

/** What this app's Worker binds: its directory of notebooks, and the notebooks themselves. */
interface AppEnv {
	DB: D1Database;
	NOTEBOOK: DurableObjectNamespace<Notebook>;
}

type Row = Record<string, SqlStorageValue>;

/** A statement that only reads: a SELECT, or one of the three PRAGMAs that describe tables. */
const READ = /^\s*(?:SELECT\b|PRAGMA\s+table_(?:list|info|xinfo)\b)/i;

/** Why a backup's statements are refused, or undefined when they may run. */
export function refusal(statements: unknown): string | undefined {
	if (!Array.isArray(statements)) return "Not a list of statements.";
	if (statements.length > 1000) return "Too many statements at once.";
	for (const sql of statements) {
		if (typeof sql !== "string") return "Not a list of statements.";
		if (sql.length > 100_000) return "A statement is too long.";
		if (!READ.test(sql)) return "A backup only reads: SELECT, or PRAGMA table_list or table_info.";
		if (sql.includes(";")) return "One statement at a time.";
	}
	return undefined;
}

class RollBack extends Error {}

/** One of the app's Durable Objects. Yours has its own tables and methods; it gains `backupRead`. */
export class Notebook extends DurableObject<AppEnv> {
	constructor(ctx: DurableObjectState, env: AppEnv) {
		super(ctx, env);
		ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS note (id INTEGER PRIMARY KEY, body TEXT)");
	}

	/**
	 * Runs a backup's statements together and rolls back whatever they did. Synchronous from start
	 * to end, so they all see one moment of the object. A refusal says why and never what was
	 * sent: its message is kept in the backup's catalog and sent in its alert.
	 */
	backupRead(statements: string[]): Row[][] {
		const reason = refusal(statements);
		if (reason !== undefined) throw new Error(`The notebook refused the backup's read. ${reason}`);
		let rows: Row[][] = [];
		try {
			this.ctx.storage.transactionSync(() => {
				rows = statements.map((sql) => this.ctx.storage.sql.exec<Row>(sql).toArray());
				throw new RollBack();
			});
		} catch (error) {
			if (!(error instanceof RollBack)) throw error;
		}
		return rows;
	}
}

/** A notebook's id, which is also its dump's file name in the backup. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** How many names a page of `objects` holds. */
const PAGE = 100;

/**
 * Gateweave Backup's way in. It has no route: a service binding from a Worker in the same account
 * is its access, so nothing here checks who is calling.
 */
export class Backup extends WorkerEntrypoint<AppEnv> {
	/** The notebooks' ids, in order, a page at a time: `cursor` is the last id of the page before. */
	async objects(cursor?: string): Promise<{ names: string[]; cursor?: string }> {
		if (cursor !== undefined && !NAME.test(cursor)) throw new Error("That is not a cursor.");
		const { results } = await this.env.DB.prepare(
			"SELECT id FROM notebook WHERE id > ?1 ORDER BY id LIMIT ?2",
		)
			.bind(cursor ?? "", PAGE + 1)
			.all<{ id: string }>();
		const names = results.slice(0, PAGE).map((row) => row.id);
		const last = names.at(-1);
		return results.length > PAGE && last !== undefined ? { names, cursor: last } : { names };
	}

	/** Runs a backup's reads in one notebook, or answers null when there is no such notebook. */
	async read(name: string, statements: string[]): Promise<Row[][] | null> {
		if (typeof name !== "string" || !NAME.test(name)) return null;
		// Asked of the directory first: naming an object makes it, and a deleted one must stay gone.
		const found = await this.env.DB.prepare("SELECT 1 FROM notebook WHERE id = ?1")
			.bind(name)
			.first();
		if (found === null) return null;
		return this.env.NOTEBOOK.getByName(name).backupRead(statements);
	}
}
```

Export `Backup` from the Worker's main module, beside its default export. It needs no entry in
the app's configuration: the service binding in Backup's configuration names it.

The example is [`apps/worker/test/example-app.ts`](https://github.com/gateweavehq/backup/blob/main/apps/worker/test/example-app.ts), word for
word: a test fails when this page and that file differ. The file is type-checked with the Worker's
tests, and the tests run it as a Worker of its own in workerd and read it as a backup does: they
list more than two pages of notebooks, dump one whole and a page at a time and restore the dump,
ask for notebooks that are gone, send it writes, and hold its guard against every statement a
real dump sends. The backup tests themselves, which run the whole Workflow, use another stand-in,
[`apps/worker/test/app-worker.js`](https://github.com/gateweavehq/backup/blob/main/apps/worker/test/app-worker.js). It has the same shape, with
what tests want and an app doesn't: a page of two names, its directory in a Durable Object so the
tests can empty it, a way to fill objects with any tables, and no guard on the statements, which
only the Worker under test sends it.

## The rules, and why

### Only reads get in

The object runs SQL that comes from outside it, so it checks each statement before any runs. The
check in Track and in Mail, which the example copies:

- A statement starts, after any white space, with `SELECT` as a whole word, or with `PRAGMA
  table_list`, `PRAGMA table_info` or `PRAGMA table_xinfo`. Nothing else: no `WITH`, no other
  PRAGMA, no `EXPLAIN`. Letter case doesn't matter.
- It has no `;` anywhere, so it is one statement: `SELECT 1; DELETE …` is refused whole. A `;`
  inside a quoted name is refused too, so a table or a column with a `;` in its name can't be
  backed up.
- It is at most 100,000 characters, which is the longest statement a Durable Object's SQLite takes.
- A call has at most 1,000 statements.

What a dump sends fits in it: `SELECT … FROM sqlite_master`, `PRAGMA table_list`, a `PRAGMA
table_info(…)` for each table, a `SELECT` that counts each table's rows and their length, a
`SELECT` of each table's rows as SQL literals (`quote(…)`), `SELECT … FROM sqlite_sequence`, and
`SELECT total_changes()`. It sends no `table_xinfo` today; the real guards let it in, and so does
the example.

A refusal says why and never repeats what was sent. Backup keeps a failed read's message in its
catalog and sends it in an alert, and neither should hold a statement.

Track's and Mail's guards also refuse an empty list. Their objects always have tables, so they
never get one. An object with no table of its own does: the dump asks for the columns of all its
tables in one call, and that call is then empty. The example lets an empty list in and answers
no rows; keep it that way if your objects can be empty.

### Everything is rolled back

The statements run inside `transactionSync`, and the function throws on purpose at its end, so the
transaction is rolled back every time, whatever ran. The check above is the first guard and this is
the second: a statement that got past the check and wrote something would still leave nothing.
Catch only your own error, and let any other out, so a statement that fails still fails the read.

The read is synchronous from its first statement to its last. A Durable Object runs one thing at a
time, so nothing can write between two statements of a call, and the call sees one moment of the
object. Don't `await` inside it.

### One moment a call, and how large objects are read

A dump of a small object is a few calls, and its rows come in one. Backup first asks how many
characters each table's rows come to, and when they come to more than 12 million it reads the
small tables together and a large one a page at a time by rowid, about 12 million characters a
call ([architecture.md](/backup/architecture/#core)). The app does nothing for this: paging is in the
statements Backup sends. Three things follow for the app:

- **`SELECT total_changes()` must work.** Every call of a paged dump reads it, and a dump whose
  calls don't agree starts over, up to three times, since a write came between two pages. The
  third try is kept anyway and says it wasn't read at one moment. An object that is written to
  all night is backed up, but not at one moment.
- **A large table needs a rowid.** A table made `WITHOUT ROWID` whose rows alone pass 12 million
  characters can't be paged, and the backup of the whole source fails and says which table. Mail
  has two such tables and says so in its restore notes.
- **An object is one moment; the snapshot isn't.** Each object is read on its own, minutes apart
  from the next, and the app's D1 database is another source, read at another time. A restore can
  find a row in one that points at something the other doesn't have yet, or no longer has.

### The limits

| Limit                          | Where it comes from                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32 MiB an answer               | What a call over a service binding or to a Durable Object may return. Backup keeps a call's rows to about 12 million characters for it, which leaves room for characters that take more than one byte.               |
| 1,000 statements a call        | The real guards' limit. Backup sends a statement per table, plus one or two, in a call, and at most 500 tables' rows in a call of a paged dump. So an object with more than 998 tables can't be backed up.           |
| 100,000 characters a statement | SQLite's limit in a Durable Object. A dump's statements grow with a table's column count and their names' length, not with its rows.                                                                                 |
| 30 seconds of CPU a call       | Cloudflare's default for a Durable Object's invocation; the app's own `limits.cpu_ms` raises it to 5 minutes. A call that reads 12 million characters is far inside it. While it runs, the object does nothing else. |
| 30 minutes for 20 objects      | Backup dumps 20 objects in one Workflow step, which may take 30 minutes and is tried again three times. A step that fails dumps its 20 again.                                                                        |
| 1 MiB for the whole list       | Backup lists every object in one Workflow step, and a step's result may be 1 MiB. With names of 36 characters that is some 25,000 objects. The step has a minute, and is tried again five times.                     |

### Names are file names

A name becomes a file in the snapshot, `objects/<name>.jsonl`, and what a restore's `--object`
takes ([format.md](/backup/format/#manifests)). So it is 1 to 200 characters, of letters, digits, dots,
dashes and underscores, and starts with a letter or a digit. One name outside that fails the
backup of the whole source, rather than leaving an object out without a word.

- Use the id the app already has for the object, as Track does with a workspace's.
- With more than one kind of object, put the kind in front, as Mail does: `mailbox.<id>`,
  `webhooks.<id>`, `audience.<id>`. `read` then takes the name apart again, and answers `null`
  for a name it doesn't know.
- A name must mean the same object every night. Each night's dump of an object is stored against
  the one before, and only what changed is kept.

### List what exists, in order, and answer `null` for the rest

- **List from the app's own record of its objects,** such as a D1 table. Cloudflare has no list
  of a class's objects that a Worker can ask for.
- **Page by key, not by offset:** `WHERE id > cursor ORDER BY id`. An object made or deleted
  between two pages then moves nothing. Check the cursor as you would a name. A cursor that comes
  back the same as it went in stops the run, so always move on.
- **Look the name up before touching the object.** Asking for an object by name makes it, so a
  `read` that went straight to the object would make an empty one for every name it is asked,
  and wake one whose data the app deleted. Track and Mail both ask D1 first.
- **Answer `null`, not an error, for an object that is gone.** One deleted after it was listed
  is then left out of the snapshot. An error fails the step, and after its retries the source.
- **Leave out what isn't worth keeping.** Mail doesn't list its rate limiter's objects, whose
  counters expire.

### No route, and nothing to check

A named entrypoint answers no request from the internet: only a Worker with a service binding to
it can call it, and only a Worker in the same Cloudflare account can have that binding. So the
binding is the access, and the entrypoint checks nobody. Keep it that way: don't call it from the
app's `fetch` handler, and don't give it a method that writes.

### What is and isn't in the dump

- Tables, their rows, indexes, triggers and views, and `AUTOINCREMENT` counters
  ([format.md](/backup/format/#sqlite-dumps)).
- Full-text indexes are rebuilt from the tables they index, or copied when they keep their own
  text. A contentless one (`content=''`) can't be rebuilt from anything: it comes back empty, and
  the snapshot names it.
- **Not the object's key-value storage.** What `ctx.storage.put()` keeps lives in a table of
  Cloudflare's (`_cf_KV`), and a dump leaves Cloudflare's tables out. Data to back up goes in
  tables of the app's own. An object must have SQLite storage at all: one of the older key-value
  kind has no `sql` to read.
- Not alarms, and nothing held in memory.

## What a restore then needs from the app

The restore CLI gives back each object's database as a file, `<name>.sql` or `<name>.sqlite`, all
of them or the one `--object` names ([restore.md](/backup/restore/#restore-an-apps-durable-objects)).
That is where Backup's part ends. The rest is the app's:

- **A way to load a database into an object.** Backup can't write into an app's objects, and
  shouldn't: a restore never goes over live data. An app that wants an object back in place needs
  its own, checked way to take a dump's rows in, into a new object rather than over one that
  exists. Neither Track nor Mail has one yet, so today a restored object is read with `sqlite3`
  and its rows are copied by hand.
- **Its own keys.** What the app sealed before storing it comes back sealed. Mail seals raw mail
  and secrets under a key of its own, which no backup holds, so a restore of Mail needs that key
  too ([restore.md](/backup/restore/#a-worked-example-gateweave-mail)). Keep such a key where the backup
  key is kept.
- **To index again.** A contentless full-text index comes back empty.
- **To live with different moments.** The app's D1 database, its objects and its bucket are read
  one after another. After a restore, expect a row whose object is missing and an object whose
  row is, and decide which one wins.

## Bind it

In Backup's `wrangler.jsonc`, a service binding to the entrypoint and a source of kind `do`:

```jsonc
"services": [{ "binding": "NOTES_APP", "service": "notes", "entrypoint": "Backup" }],
"vars": {
	"SOURCES": [{ "name": "notes-notebooks", "kind": "do", "binding": "NOTES_APP" }]
}
```

`service` is the app's Worker's name. Then run it once and look at what it made:

```sh
npx wrangler workflows trigger my-backup '{"sources":["notes-notebooks"],"test":true}'
node gateweave-backup.mjs show s3://my-backup/notes-notebooks latest
```

`"test": true` restores each object's dump into an empty database and counts its rows, so the
first run already says whether the dumps restore.
