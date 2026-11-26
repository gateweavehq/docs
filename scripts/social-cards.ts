/**
 * Checks the built site's social cards: every page must carry the Open Graph and Twitter tags in
 * its `<head>` (read with parse5), and the card its `og:image` names must exist in `dist` as a
 * 1200x630 PNG that Sharp fully decodes. `pnpm build` runs it (`scripts/check-social-cards.ts`)
 * and `social-cards.test.ts` covers it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "parse5";
import sharp from "sharp";
import { CARD_HEIGHT, CARD_WIDTH } from "../src/social-card.ts";

/** Parse5 nodes as far as this file reads them. */
interface Node {
	nodeName: string;
	childNodes?: Node[];
	attrs?: { name: string; value: string }[];
}

/**
 * Width and height of a PNG that Sharp fully decodes to pixels, or undefined when the bytes are
 * not one: a bad header, a cut-short file or image data that does not decode all fail. The decode
 * decides, not the header.
 */
export async function pngSize(
	bytes: Buffer,
): Promise<{ width: number; height: number } | undefined> {
	try {
		const image = sharp(bytes, { failOn: "warning" });
		if ((await image.metadata()).format !== "png") return undefined;
		const { info } = await image.raw().toBuffer({ resolveWithObject: true });
		return { width: info.width, height: info.height };
	} catch {
		return undefined;
	}
}

/**
 * Every `<meta>` element that is a direct child of the page's `<head>`, as name-or-property to
 * content (the first one wins). The HTML is parsed, so text that only looks like a tag, in a
 * comment, a script, a style, a title or the body, is not metadata and is ignored.
 */
export function metaTags(html: string): Map<string, string> {
	const tags = new Map<string, string>();
	const document = parse(html) as unknown as Node;
	const root = document.childNodes?.find((node) => node.nodeName === "html");
	const head = root?.childNodes?.find((node) => node.nodeName === "head");
	for (const node of head?.childNodes ?? []) {
		if (node.nodeName !== "meta") continue;
		const attr = (name: string) => node.attrs?.find((a) => a.name === name)?.value;
		const key = attr("property") ?? attr("name");
		const content = attr("content");
		if (key && content !== undefined && !tags.has(key)) tags.set(key, content);
	}
	return tags;
}

function htmlFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "pagefind" ? [] : htmlFiles(path);
		return name.endsWith(".html") ? [path] : [];
	});
}

/** What is wrong with the social cards of the site built in `dist`, one line each. */
export async function checkSocialCards(dist: string, site: string): Promise<string[]> {
	const problems: string[] = [];
	const pages = htmlFiles(dist);
	if (pages.length === 0) return [`no pages found in ${dist}`];

	for (const file of pages) {
		const page = `/${relative(dist, file).replaceAll("\\", "/")}`;
		const meta = metaTags(readFileSync(file, "utf8"));
		const need = (key: string, expected?: string) => {
			const value = meta.get(key);
			if (!value) problems.push(`${page}: missing <meta ${key}>`);
			else if (expected !== undefined && value !== expected) {
				problems.push(`${page}: ${key} is "${value}", expected "${expected}"`);
			}
			return value;
		};

		need("og:title");
		need("og:description");
		const url = need("og:url");
		if (url && !url.startsWith(`${site}/`))
			problems.push(`${page}: og:url "${url}" is not under ${site}`);
		need("twitter:card", "summary_large_image");
		need("og:image:width", String(CARD_WIDTH));
		need("og:image:height", String(CARD_HEIGHT));

		const image = need("og:image");
		need("twitter:image", image);
		if (!image) continue;
		if (!image.startsWith(`${site}/`)) {
			problems.push(`${page}: og:image "${image}" is not an absolute URL under ${site}`);
			continue;
		}
		const cardFile = join(dist, new URL(image).pathname);
		if (!existsSync(cardFile)) {
			problems.push(`${page}: og:image ${image} has no file in dist`);
			continue;
		}
		const size = await pngSize(readFileSync(cardFile));
		if (!size) problems.push(`${page}: ${image} is not a PNG that decodes`);
		else if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) {
			problems.push(
				`${page}: ${image} is ${size.width}x${size.height}, not ${CARD_WIDTH}x${CARD_HEIGHT}`,
			);
		}
	}
	return problems;
}
