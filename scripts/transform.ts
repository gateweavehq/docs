import { posix } from "node:path";
import type { Html, Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString as textOf } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";

/**
 * Turns a product repository's Markdown into pages for this site: a title and description for the
 * front matter, and links that point where they should from here. Everything else in the source
 * is left as written, so a page reads as it does on GitHub.
 */

/** Where a product's files are, and which of them become pages or images here. */
export interface Repository {
	owner: string;
	repo: string;
	/** The product's first segment on this site. */
	key: string;
	/** The tag or branch the files were read at, which links to code point to. */
	ref: string;
	/** Repository paths of the files that are pages here. */
	pages: ReadonlySet<string>;
	/** Repository paths of the files copied to this site, such as images. */
	assets: ReadonlySet<string>;
}

export interface Context {
	/** The repository the page comes from. */
	from: Repository;
	/** The page's path in it, such as `docs/self-hosting.md`. */
	path: string;
	/** Every product's repository, so links between them stay on this site. */
	all: readonly Repository[];
}

/** A page's slug within its product: `""` for the overview, null for files that are no page. */
export function slugOf(path: string): string | null {
	if (path === "README.md") return "";
	if (path === "CHANGELOG.md") return "changelog";
	const doc = /^docs\/(.+)\.md$/.exec(path);
	return doc?.[1] ?? null;
}

/** Whether a file under `docs/` is copied to this site, such as an image. */
export function isAsset(path: string): boolean {
	return path.startsWith("docs/") && !path.endsWith(".md");
}

export function pageUrl(key: string, slug: string): string {
	return slug === "" ? `/${key}/` : `/${key}/${slug}/`;
}

/** Where a copied file is served from here. */
export function assetUrl(key: string, path: string): string {
	return `/${key}/${path.slice("docs/".length)}`;
}

const IMAGE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const GITHUB_FILE =
	/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|tree)\/[^/]+\/([^#?]+)(#.*)?$/;

/** Where a link in the page should point from this site. */
export function rewriteUrl(url: string, { from, path, all }: Context): string {
	if (url === "" || url.startsWith("#")) return url;

	if (SCHEME.test(url) || url.startsWith("//")) {
		// A link to another product's docs on GitHub reads better here.
		const file = GITHUB_FILE.exec(url);
		if (!file) return url;
		const [, owner, repo, target = "", hash = ""] = file;
		const other = all.find((r) => r.owner === owner && r.repo === repo);
		const slug = slugOf(target);
		if (!other || slug === null || !other.pages.has(target)) return url;
		return pageUrl(other.key, slug) + hash;
	}

	const hashAt = url.search(/[?#]/);
	const target = hashAt === -1 ? url : url.slice(0, hashAt);
	const suffix = hashAt === -1 ? "" : url.slice(hashAt);
	let decoded: string;
	try {
		decoded = decodeURIComponent(target);
	} catch {
		return url;
	}
	const resolved = decoded.startsWith("/")
		? posix.normalize(decoded.slice(1))
		: posix.normalize(posix.join(posix.dirname(path), decoded));
	if (resolved.startsWith("..")) return url;
	const file = resolved.replace(/\/$/, "");

	if (from.pages.has(file)) {
		const slug = slugOf(file);
		if (slug !== null) return pageUrl(from.key, slug) + suffix;
	}
	if (from.assets.has(file)) return assetUrl(from.key, file);

	const base = `${from.owner}/${from.repo}`;
	if (file === "." || file === "") return `https://github.com/${base}/tree/${from.ref}`;
	if (IMAGE.test(file)) return `https://raw.githubusercontent.com/${base}/${from.ref}/${file}`;
	const kind = target.endsWith("/") ? "tree" : "blob";
	return `https://github.com/${base}/${kind}/${from.ref}/${file}${suffix}`;
}

export interface Page {
	title: string;
	description?: string;
	body: string;
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

/** Converts one Markdown file. `fallbackTitle` is used when it has no top-level heading. */
export function convert(source: string, context: Context, fallbackTitle: string): Page {
	const markdown = source.replace(/\r\n?/g, "\n");
	const tree: Root = fromMarkdown(markdown, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()],
	});
	const edits: Edit[] = [];
	const removed = new Set<Nodes>();
	let title: string | undefined;
	let description: string | undefined;

	// A README opens with centred HTML: a logo, the name, a tagline and badges. The name becomes the
	// title and the tagline the description; the logo and badges have no place in a docs page.
	for (const node of tree.children) {
		if (node.type !== "html") break;
		const html = node.value;
		if (title === undefined && /<h1[\s>]/i.test(html)) {
			title = plain(html);
		} else if (/img\.shields\.io|\/badge\.svg|\.github\/logo/.test(html)) {
			// Badges and the logo.
		} else if (description === undefined && title !== undefined && /<strong>/i.test(html)) {
			description = plain(html);
		} else {
			continue;
		}
		removed.add(node);
	}

	if (title === undefined) {
		const heading = tree.children.find((node) => node.type === "heading" && node.depth === 1);
		if (heading) {
			title = textOf(heading).trim();
			removed.add(heading);
		}
	}

	for (const node of removed) {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === undefined || end === undefined) continue;
		edits.push({ start, end, text: "" });
	}

	visit(tree, (node) => {
		if (removed.has(node as Nodes)) return "skip";
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === undefined || end === undefined) return;
		const text = markdown.slice(start, end);

		if (node.type === "html") {
			const rewritten = rewriteHtml((node as Html).value, context);
			if (rewritten !== (node as Html).value) edits.push({ start, end, text: rewritten });
			return;
		}
		if (node.type === "link" || node.type === "image") {
			// The destination follows the last `](` of the node's source: after the text of a link,
			// or the alt text of an image. Autolinks have none and are always absolute.
			const children = "children" in node ? node.children : [];
			const last = children.at(-1)?.position?.end.offset;
			const from = last === undefined ? 0 : last - start;
			const open = text.indexOf("](", from);
			if (open === -1) return;
			const match = /^\]\(\s*(<[^>\n]*>|[^\s)]+)/.exec(text.slice(open));
			if (!match?.[1]) return;
			replaceUrl(edits, start + open + match[0].length - match[1].length, match[1], context);
			return;
		}
		if (node.type === "definition") {
			const match = /^\[[^\]]*\]:\s*(<[^>\n]*>|\S+)/.exec(text);
			if (!match?.[1]) return;
			replaceUrl(edits, start + match[0].length - match[1].length, match[1], context);
		}
	});

	edits.sort((a, b) => b.start - a.start);
	let body = markdown;
	for (const edit of edits) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
	body = `${body.replace(/^\s+/, "").replace(/\s+$/, "")}\n`;

	return { title: title || fallbackTitle, ...(description && { description }), body };
}

function replaceUrl(edits: Edit[], at: number, written: string, context: Context): void {
	const bracketed = written.startsWith("<") && written.endsWith(">");
	const url = bracketed ? written.slice(1, -1) : written;
	const rewritten = rewriteUrl(url, context);
	if (rewritten === url) return;
	edits.push({
		start: at,
		end: at + written.length,
		text: bracketed ? `<${rewritten}>` : rewritten,
	});
}

/** Rewrites the `href`, `src` and `srcset` attributes in raw HTML. */
export function rewriteHtml(html: string, context: Context): string {
	return html.replace(
		/(\s(href|src|srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
		(whole, prefix: string, name: string, double?: string, single?: string) => {
			const value = double ?? single ?? "";
			const rewritten =
				name.toLowerCase() === "srcset"
					? value
							.split(",")
							.map((candidate) => {
								const [url = "", ...descriptor] = candidate.trim().split(/\s+/);
								return [rewriteUrl(url, context), ...descriptor].join(" ");
							})
							.join(", ")
					: rewriteUrl(value, context);
			if (rewritten === value) return whole;
			return `${prefix}"${rewritten.replaceAll('"', "&quot;")}"`;
		},
	);
}

/** The text of a bit of HTML, without its tags. */
function plain(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}
