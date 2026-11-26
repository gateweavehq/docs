/**
 * The "What's new" page and its Atom feed, built from each product's `CHANGELOG.md` at the version
 * the sync read: the latest five releases per product, newest first, with the date, a link to the
 * GitHub release and the entry's upgrade note when it has one.
 *
 * `pnpm sync` calls `buildWhatsNew` with the changelogs it just converted and writes both files;
 * `pnpm whats-new` calls it with the changelog pages already in `src/content/docs`, so the page and
 * the feed can be rebuilt without the network. Nothing here reads the clock, so the same
 * changelogs always give the same files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OWNER } from "./products.ts";

export const SITE = "https://docs.gateweave.com";
export const PAGE_PATH = "src/content/docs/changelog.md";
export const FEED_PATH = "public/changelog.xml";
export const FEED_URL = `${SITE}/changelog.xml`;
export const FEED_TITLE = "Gateweave: what's new";
/** How many releases of each product the page and the feed show. */
export const RELEASES_PER_PRODUCT = 5;

/** What the builder needs to know about one product. */
export interface WhatsNewSource {
	key: string;
	name: string;
	/** The repository under github.com/gateweavehq. */
	repo: string;
	/** The tag the changelog was read at, or `main` while the product has no release. */
	version: string;
	/** The changelog's Markdown, without front matter. */
	changelog: string;
}

export interface Release {
	/** The version as the changelog writes it, such as `0.51.0`. */
	version: string;
	/** The release tag, such as `v0.51.0`. */
	tag: string;
	/** `YYYY-MM-DD`. */
	date: string;
	/** The GitHub release's address. */
	url: string;
	/** The entry's upgrade section, as Markdown, or null. */
	upgrade: string | null;
}

export interface ProductReleases {
	key: string;
	name: string;
	repo: string;
	releases: Release[];
}

const ENTRY = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/;
const UPGRADE_HEADING = /^### (If you run your own|Running your own|Upgrading)\s*$/;

/** The lines of a Markdown file, each with whether it sits inside a fenced code block. */
function outsideFences(markdown: string): Line[] {
	let fence: string | null = null;
	return markdown.split(/\r?\n/).map((line) => {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence === null) {
			if (marker) {
				fence = marker;
				return { line, code: true };
			}
			return { line, code: false };
		}
		if (marker?.startsWith(fence.charAt(0)) && marker.length >= fence.length) fence = null;
		return { line, code: true };
	});
}

interface Line {
	line: string;
	code: boolean;
}

interface Entry {
	version: string;
	date: string;
	lines: Line[];
}

/** The releases a changelog lists, newest first as the file has them. */
export function parseReleases(
	changelog: string,
	repo: string,
	limit = RELEASES_PER_PRODUCT,
): Release[] {
	const entries: Entry[] = [];
	let current: Entry | undefined;
	for (const item of outsideFences(changelog)) {
		const heading = item.code ? null : ENTRY.exec(item.line);
		if (heading?.[1] && heading[2]) {
			current = { version: heading[1], date: heading[2], lines: [] };
			entries.push(current);
		} else if (!item.code && item.line.startsWith("## ")) {
			current = undefined;
		} else if (current) {
			current.lines.push(item);
		}
	}
	return entries.slice(0, limit).map((entry) => {
		const tag = `v${entry.version}`;
		return {
			version: entry.version,
			tag,
			date: entry.date,
			url: `https://github.com/${OWNER}/${repo}/releases/tag/${tag}`,
			upgrade: upgradeNote(entry.lines),
		};
	});
}

function upgradeNote(lines: Line[]): string | null {
	const start = lines.findIndex((item) => !item.code && UPGRADE_HEADING.test(item.line));
	if (start === -1) return null;
	const body: string[] = [];
	for (const item of lines.slice(start + 1)) {
		if (!item.code && item.line.startsWith("### ")) break;
		body.push(item.line);
	}
	const note = body.join("\n").trim();
	return note === "" ? null : note;
}

/**
 * Each product's latest releases. A product still on `main` has none: its changelog has no
 * release to link, so it is left out of the page and the feed.
 */
export function releasesOf(sources: WhatsNewSource[]): ProductReleases[] {
	return sources.map(({ key, name, repo, version, changelog }) => ({
		key,
		name,
		repo,
		releases: version === "main" ? [] : parseReleases(changelog, repo),
	}));
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

function indent(text: string, by: string): string {
	return text
		.split("\n")
		.map((line) => (line === "" ? "" : by + line))
		.join("\n");
}

export function renderPage(products: ProductReleases[]): string {
	const lines = [
		"---",
		`title: ${yamlString("What's new")}`,
		`description: ${yamlString("The latest five releases of each Gateweave product, with their dates, links to the releases and upgrade notes.")}`,
		"editUrl: false",
		"---",
		"",
		`The latest ${RELEASES_PER_PRODUCT} releases of each Gateweave product, newest first. Under a release, the note for people who run their own copy says what to do when updating. Follow along with the [Atom feed](/changelog.xml).`,
		"",
	];
	for (const product of products) {
		lines.push(`## ${product.name}`, "");
		if (product.releases.length === 0) {
			lines.push(
				`There is no release yet. [Its changelog](/${product.key}/changelog/) says what changed on \`main\`.`,
				"",
			);
			continue;
		}
		for (const release of product.releases) {
			lines.push(`- ${release.date} · [${release.tag}](${release.url})`);
			if (release.upgrade) lines.push("", indent(release.upgrade, "  "), "");
		}
		lines.push("", `[Full ${product.name} changelog](/${product.key}/changelog/)`, "");
	}
	return `${lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()}\n`;
}

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** An upgrade note as one line of plain text. */
function plainText(markdown: string): string {
	return markdown
		.replace(/^\s*(`{3,}|~{3,}).*$/gm, "")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\*\*|`/g, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function renderFeed(products: ProductReleases[]): string {
	const entries = products
		.flatMap((product) => product.releases.map((release) => ({ product, release })))
		// A stable sort keeps the changelog's own order for releases made on the same day.
		.sort((a, b) => b.release.date.localeCompare(a.release.date));
	const newest = entries[0]?.release.date;
	const updated = newest ? `${newest}T00:00:00Z` : "1970-01-01T00:00:00Z";
	const xml = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		`\t<id>${escapeXml(FEED_URL)}</id>`,
		`\t<title>${escapeXml(FEED_TITLE)}</title>`,
		`\t<updated>${updated}</updated>`,
		"\t<author><name>Gateweave</name></author>",
		`\t<link rel="self" type="application/atom+xml" href="${escapeXml(FEED_URL)}"/>`,
		`\t<link rel="alternate" type="text/html" href="${SITE}/changelog/"/>`,
	];
	for (const { product, release } of entries) {
		xml.push(
			"\t<entry>",
			`\t\t<id>${escapeXml(release.url)}</id>`,
			`\t\t<title>${escapeXml(`${product.name} ${release.version}`)}</title>`,
			`\t\t<updated>${release.date}T00:00:00Z</updated>`,
			`\t\t<link rel="alternate" type="text/html" href="${escapeXml(release.url)}"/>`,
		);
		if (release.upgrade) {
			xml.push(`\t\t<summary type="text">${escapeXml(plainText(release.upgrade))}</summary>`);
		}
		xml.push("\t</entry>");
	}
	xml.push("</feed>", "");
	return xml.join("\n");
}

export function buildWhatsNew(sources: WhatsNewSource[]): { page: string; feed: string } {
	const products = releasesOf(sources);
	return { page: renderPage(products), feed: renderFeed(products) };
}

/** A copied page without its front matter: what the sync hands to `buildWhatsNew`. */
export function bodyOf(file: string): string {
	const match = /^---\n[\s\S]*?\n---\n/.exec(file);
	return match ? file.slice(match[0].length) : file;
}

/** The sources as the last sync left them: `src/generated/sources.json` and the changelog pages. */
export function readLocalSources(root: string): WhatsNewSource[] {
	const sources = JSON.parse(readFileSync(join(root, "src/generated/sources.json"), "utf8")) as {
		key: string;
		name: string;
		repo: string;
		version: string;
	}[];
	return sources.map((source) => ({
		key: source.key,
		name: source.name,
		repo: source.repo.slice(`${OWNER}/`.length),
		version: source.version,
		changelog: bodyOf(
			readFileSync(join(root, "src/content/docs", source.key, "changelog.md"), "utf8"),
		),
	}));
}
