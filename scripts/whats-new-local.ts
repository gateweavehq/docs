/**
 * Rebuilds the "What's new" page and its feed from the changelog pages already in
 * `src/content/docs`, with no network. Run it with `pnpm whats-new`; `pnpm sync` does the same
 * from what it has just read.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildWhatsNew, FEED_PATH, PAGE_PATH, readLocalSources } from "./whats-new.ts";

const root = join(import.meta.dirname, "..");
const { page, feed } = buildWhatsNew(readLocalSources(root));
for (const [path, contents] of [
	[PAGE_PATH, page],
	[FEED_PATH, feed],
] as const) {
	await mkdir(dirname(join(root, path)), { recursive: true });
	await writeFile(join(root, path), contents);
	console.log(`wrote ${path}`);
}
