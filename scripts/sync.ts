/**
 * Copies each product's docs from its repository into this site: `README.md`, `CHANGELOG.md` and
 * `docs/`, at the product's latest release, or `main` while it has none. Pages go to
 * `src/content/docs/<product>/`, other files under `docs/` to `public/<product>/`, and what was
 * read, with the sidebar, to `src/generated/`. It also writes the "What's new" page and its Atom
 * feed from the changelogs (`scripts/whats-new.ts`). Run it with `pnpm sync`; set `GITHUB_TOKEN` to
 * raise GitHub's limit on unauthenticated requests.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { OWNER, type Product, products } from "./products.ts";
import { type SidebarGroup, sidebarFor } from "./sidebar.ts";
import { convert, isAsset, type Repository, slugOf } from "./transform.ts";
import { buildWhatsNew, FEED_PATH, PAGE_PATH, type WhatsNewSource } from "./whats-new.ts";

const root = join(import.meta.dirname, "..");
const contentDir = join(root, "src/content/docs");
const publicDir = join(root, "public");
const markdownDir = join(publicDir, "markdown");
const generatedDir = join(root, "src/generated");

const headers: Record<string, string> = {
	Accept: "application/vnd.github+json",
	"User-Agent": "gateweave-docs-sync",
	"X-GitHub-Api-Version": "2022-11-28",
};
const token = process.env.GITHUB_TOKEN;
if (token) headers.Authorization = `Bearer ${token}`;

async function github<T>(path: string): Promise<T | null> {
	const response = await fetch(`https://api.github.com${path}`, { headers });
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}`);
	return (await response.json()) as T;
}

async function raw(repo: string, ref: string, path: string): Promise<Uint8Array> {
	const url = `https://raw.githubusercontent.com/${OWNER}/${repo}/${ref}/${path}`;
	const response = await fetch(url, { headers: { "User-Agent": headers["User-Agent"] ?? "" } });
	if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`);
	return new Uint8Array(await response.arrayBuffer());
}

interface Fetched {
	product: Product;
	repository: Repository;
	/** The release's tag, or `main`. */
	version: string;
	/** Last commit affecting each copied page at this version. */
	pageDates: Map<string, string>;
	files: Map<string, Uint8Array>;
}

async function read(product: Product): Promise<Fetched> {
	const release = await github<{ tag_name: string; published_at: string }>(
		`/repos/${OWNER}/${product.repo}/releases/latest`,
	);
	const ref = release?.tag_name ?? "main";
	const commit = release
		? null
		: await github<{ commit: { committer: { date: string } } }>(
				`/repos/${OWNER}/${product.repo}/commits/main`,
			);
	const versionDate = release?.published_at ?? commit?.commit.committer.date;
	if (!versionDate) throw new Error(`${product.repo} has no source snapshot date`);
	const tree = await github<{ tree: { path: string; type: string }[]; truncated: boolean }>(
		`/repos/${OWNER}/${product.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
	);
	if (!tree) throw new Error(`${product.repo} has no ref ${ref}`);
	if (tree.truncated) throw new Error(`${product.repo}'s file list came back truncated`);

	const wanted = tree.tree
		.filter((entry) => entry.type === "blob")
		.map((entry) => entry.path)
		.filter((path) => slugOf(path) !== null || isAsset(path));
	const files = new Map<string, Uint8Array>();
	const pageDates = new Map<string, string>();
	for (const path of wanted) {
		files.set(path, await raw(product.repo, ref, path));
		if (slugOf(path) === null) continue;
		const history = await github<{ commit: { committer: { date: string } } }[]>(
			`/repos/${OWNER}/${product.repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&per_page=1`,
		);
		pageDates.set(path, history?.[0]?.commit.committer.date ?? versionDate);
	}

	const paths = [...files.keys()];
	return {
		product,
		version: ref,
		pageDates,
		files,
		repository: {
			owner: OWNER,
			repo: product.repo,
			key: product.key,
			ref,
			pages: new Set(paths.filter((path) => slugOf(path) !== null)),
			assets: new Set(paths.filter(isAsset)),
		},
	};
}

/** Titles that would be the same for every product say which one they are about. */
function titleFor(title: string, product: Product): string {
	const short = product.name.replace(/^Gateweave /, "");
	switch (title) {
		case "Architecture":
		case "Changelog":
		case "Roadmap":
			return `${short} ${title.toLowerCase()}`;
		case "Self-hosting":
			return `Self-hosting ${short}`;
		default:
			return title;
	}
}

function frontMatter(fields: Record<string, unknown>): string {
	const lines = ["---"];
	const write = (value: unknown, key: string, indent: string) => {
		if (value === undefined) return;
		if (typeof value === "object" && value !== null) {
			lines.push(`${indent}${key}:`);
			for (const [k, v] of Object.entries(value)) write(v, k, `${indent}  `);
		} else {
			lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
		}
	};
	for (const [key, value] of Object.entries(fields)) write(value, key, "");
	lines.push("---", "");
	return lines.join("\n");
}

async function write(path: string, contents: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
}

const fetched: Fetched[] = [];
for (const product of products) {
	const result = await read(product);
	console.log(`${product.key}: ${result.version}, ${result.files.size} files`);
	fetched.push(result);
}
const all = fetched.map((f) => f.repository);
const sidebar: SidebarGroup[] = [];
const changelogs: WhatsNewSource[] = [];
await rm(markdownDir, { recursive: true, force: true });

for (const { product, repository, version, pageDates, files } of fetched) {
	await rm(join(contentDir, product.key), { recursive: true, force: true });
	await rm(join(publicDir, product.key), { recursive: true, force: true });
	const labels = new Map<string, string>();

	for (const [path, bytes] of files) {
		const slug = slugOf(path);
		if (slug === null) {
			await write(join(publicDir, product.key, path.slice("docs/".length)), bytes);
			continue;
		}
		const fallback = slug === "" ? product.name : (slug.split("/").at(-1) ?? slug);
		const page = convert(
			new TextDecoder().decode(bytes),
			{ from: repository, path, all },
			fallback,
		);
		labels.set(slug, slug === "" ? "Overview" : page.title);
		if (slug === "changelog") {
			changelogs.push({
				key: product.key,
				name: product.name,
				repo: product.repo,
				version,
				changelog: page.body,
			});
		}
		const header = frontMatter({
			title: titleFor(page.title, product),
			description: page.description,
			editUrl: `https://github.com/${OWNER}/${product.repo}/edit/main/${path}`,
			source: {
				product: product.name,
				version,
				updatedAt: pageDates.get(path),
				url: `https://github.com/${OWNER}/${product.repo}/blob/${version}/${path}`,
				markdownUrl: `/markdown/${product.key}/${slug || "index"}.md`,
			},
		});
		const file = slug === "" ? "index.md" : `${slug}.md`;
		await write(join(contentDir, product.key, file), header + page.body);
		await write(
			join(markdownDir, product.key, file),
			`# ${titleFor(page.title, product)}\n\n${page.body}`,
		);
	}
	sidebar.push(sidebarFor(product, labels));
}

const sources = fetched.map(({ product, version }) => ({
	key: product.key,
	name: product.name,
	summary: product.summary,
	repo: `${OWNER}/${product.repo}`,
	version,
}));
await write(join(generatedDir, "sources.json"), `${JSON.stringify(sources, null, "\t")}\n`);
await write(join(generatedDir, "sidebar.json"), `${JSON.stringify(sidebar, null, "\t")}\n`);

const whatsNew = buildWhatsNew(changelogs);
await write(join(root, PAGE_PATH), whatsNew.page);
await write(join(root, FEED_PATH), whatsNew.feed);
