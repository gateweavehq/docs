/**
 * Checks the built site's social cards: every page must carry the Open Graph and Twitter tags,
 * and the card its `og:image` names must exist in `dist` as a 1200x630 PNG. `pnpm build` runs it
 * (`scripts/check-social-cards.ts`) and `social-cards.test.ts` covers it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CARD_HEIGHT, CARD_WIDTH } from "../src/social-card.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's header, or undefined when the bytes are not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
	if (bytes.toString("ascii", 12, 16) !== "IHDR") return undefined;
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Every `<meta>` tag in a page's head as name-or-property to content (the first one wins). */
export function metaTags(html: string): Map<string, string> {
	const tags = new Map<string, string>();
	for (const [tag] of html.matchAll(/<meta\s[^>]*>/g)) {
		const attrs: Record<string, string> = {};
		for (const [, name, value] of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
			attrs[name as string] = (value as string).replaceAll("&amp;", "&");
		}
		const key = attrs.property ?? attrs.name;
		if (key && attrs.content !== undefined && !tags.has(key)) tags.set(key, attrs.content);
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
export function checkSocialCards(dist: string, site: string): string[] {
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
		const size = pngSize(readFileSync(cardFile));
		if (!size) problems.push(`${page}: ${image} is not a PNG`);
		else if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) {
			problems.push(
				`${page}: ${image} is ${size.width}x${size.height}, not ${CARD_WIDTH}x${CARD_HEIGHT}`,
			);
		}
	}
	return problems;
}
