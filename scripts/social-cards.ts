/**
 * Checks the built site's social cards: every page must carry the Open Graph and Twitter tags in
 * its `<head>`, and the card its `og:image` names must exist in `dist` as a 1200x630 PNG that
 * decodes. `pnpm build` runs it (`scripts/check-social-cards.ts`) and `social-cards.test.ts`
 * covers it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { crc32, inflateSync } from "node:zlib";
import { CARD_HEIGHT, CARD_WIDTH } from "../src/social-card.ts";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Samples per pixel for each PNG colour type. */
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Width and height of a PNG that decodes, or undefined when the bytes are not one: the signature,
 * every chunk's length and CRC, an IHDR first, image data that inflates to exactly the pixels the
 * header promises (when the image is not interlaced) and a closing IEND. A header on its own, or a
 * file cut short, is not a card.
 */
export function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
	if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
	let header: Buffer | undefined;
	const data: Buffer[] = [];
	let ended = false;
	let offset = 8;
	while (offset + 12 <= bytes.length && !ended) {
		const length = bytes.readUInt32BE(offset);
		const end = offset + 8 + length;
		if (end + 4 > bytes.length) return undefined;
		const type = bytes.toString("ascii", offset + 4, offset + 8);
		if (crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)) return undefined;
		const body = bytes.subarray(offset + 8, end);
		if (!header) {
			if (type !== "IHDR" || length !== 13) return undefined;
			header = body;
		} else if (type === "IDAT") data.push(body);
		else if (type === "IEND") ended = true;
		offset = end + 4;
	}
	if (!header || !ended || data.length === 0) return undefined;

	const width = header.readUInt32BE(0);
	const height = header.readUInt32BE(4);
	const bitDepth = header.readUInt8(8);
	const channels = PNG_CHANNELS[header.readUInt8(9)];
	if (width === 0 || height === 0 || channels === undefined) return undefined;
	let pixels: Buffer;
	try {
		pixels = inflateSync(Buffer.concat(data));
	} catch {
		return undefined;
	}
	if (header.readUInt8(12) === 0) {
		const row = 1 + Math.ceil((width * channels * bitDepth) / 8);
		if (pixels.length !== row * height) return undefined;
	} else if (pixels.length === 0) return undefined;
	return { width, height };
}

/** The markup between `<head>` and `</head>`, without comments, scripts and styles. */
function headOf(html: string): string {
	const clean = html.replace(/<!--[\s\S]*?-->/g, "");
	const open = /<head(?:\s[^>]*)?>/i.exec(clean);
	if (!open) return "";
	const rest = clean.slice(open.index + open[0].length);
	const close = /<\/head\s*>/i.exec(rest);
	if (!close) return "";
	return rest
		.slice(0, close.index)
		.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
}

/**
 * Every `<meta>` tag in a page's `<head>` as name-or-property to content (the first one wins).
 * A tag in the body, in a script or in a comment is not metadata and is ignored.
 */
export function metaTags(html: string): Map<string, string> {
	const tags = new Map<string, string>();
	for (const [tag] of headOf(html).matchAll(/<meta\s[^>]*>/gi)) {
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
		if (!size) problems.push(`${page}: ${image} is not a PNG that decodes`);
		else if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) {
			problems.push(
				`${page}: ${image} is ${size.width}x${size.height}, not ${CARD_WIDTH}x${CARD_HEIGHT}`,
			);
		}
	}
	return problems;
}
