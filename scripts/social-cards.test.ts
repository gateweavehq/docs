import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardDescription, cardPath } from "../src/social-card.ts";
import { checkSocialCards, metaTags, pngSize } from "./social-cards.ts";

const site = "https://docs.gateweave.com";

/** The first bytes of a PNG: signature and an IHDR chunk of the given size. */
function png(width: number, height: number): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(13);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		length,
		Buffer.from("IHDR"),
		header,
		deflateSync(Buffer.alloc(0)),
	]);
}

function page(overrides: Record<string, string | null> = {}, image = "/og/track.png"): string {
	const tags: Record<string, string> = {
		"og:title": "Track",
		"og:description": "An issue tracker.",
		"og:url": `${site}/track/`,
		"twitter:card": "summary_large_image",
		"og:image": `${site}${image}`,
		"og:image:width": "1200",
		"og:image:height": "630",
		"twitter:image": `${site}${image}`,
	};
	const metas = Object.entries({ ...tags, ...overrides })
		.filter(([, value]) => value !== null)
		.map(([key, value]) => {
			const attr = key.startsWith("twitter:") ? "name" : "property";
			return `<meta ${attr}="${key}" content="${value}"/>`;
		});
	return `<html><head>${metas.join("")}</head><body></body></html>`;
}

let dist: string;
function write(path: string, contents: string | Buffer) {
	mkdirSync(dirname(join(dist, path)), { recursive: true });
	writeFileSync(join(dist, path), contents);
}

beforeEach(() => {
	dist = mkdtempSync(join(tmpdir(), "social-cards-"));
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe("checkSocialCards", () => {
	it("accepts a page with every tag and a 1200x630 card", () => {
		write("track/index.html", page());
		write("og/track.png", png(1200, 630));
		expect(checkSocialCards(dist, site)).toEqual([]);
	});

	it("reports a page with no card tags at all", () => {
		write("track/index.html", "<html><head></head></html>");
		const problems = checkSocialCards(dist, site);
		expect(problems).toContain("/track/index.html: missing <meta og:image>");
		expect(problems).toContain("/track/index.html: missing <meta twitter:card>");
		expect(problems).toContain("/track/index.html: missing <meta og:title>");
	});

	it.each([
		"og:title",
		"og:description",
		"og:url",
		"og:image:width",
		"og:image:height",
		"twitter:image",
	])("reports a page without %s", (key) => {
		write("track/index.html", page({ [key]: null }));
		write("og/track.png", png(1200, 630));
		expect(checkSocialCards(dist, site)).toEqual([`/track/index.html: missing <meta ${key}>`]);
	});

	it("reports a card that is missing from dist", () => {
		write("track/index.html", page());
		expect(checkSocialCards(dist, site)).toEqual([
			`/track/index.html: og:image ${site}/og/track.png has no file in dist`,
		]);
	});

	it("reports a card of the wrong size or format", () => {
		write("track/index.html", page());
		write("og/track.png", png(800, 418));
		expect(checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is 800x418, not 1200x630`,
		]);
		write("og/track.png", "not a png");
		expect(checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is not a PNG`,
		]);
	});

	it("reports a relative og:image and a wrong twitter:card", () => {
		write("track/index.html", page({ "og:image": "/og/track.png", "twitter:card": "summary" }));
		write("og/track.png", png(1200, 630));
		const problems = checkSocialCards(dist, site);
		expect(problems).toContain(
			`/track/index.html: og:image "/og/track.png" is not an absolute URL under ${site}`,
		);
		expect(problems).toContain(
			`/track/index.html: twitter:card is "summary", expected "summary_large_image"`,
		);
	});

	it("fails when there are no pages", () => {
		expect(checkSocialCards(dist, site)).toEqual([`no pages found in ${dist}`]);
	});
});

describe("helpers", () => {
	it("reads a PNG's size and refuses other bytes", () => {
		expect(pngSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
		expect(pngSize(Buffer.from("GIF89a"))).toBeUndefined();
	});

	it("reads meta tags, unescaping entities", () => {
		const tags = metaTags(
			`<meta property="og:url" content="https://x/?a=1&amp;b=2"/><meta name="a" content=""/>`,
		);
		expect(tags.get("og:url")).toBe("https://x/?a=1&b=2");
		expect(tags.get("a")).toBe("");
	});

	it("names the card by page id, with the home page as index", () => {
		expect(cardPath("track/self-hosting")).toBe("/og/track/self-hosting.png");
		expect(cardPath("")).toBe("/og/index.png");
	});

	it("shortens long descriptions at a word boundary", () => {
		expect(cardDescription("Short.")).toBe("Short.");
		const long = `${"word ".repeat(60)}end`;
		const cut = cardDescription(long, 50);
		expect(cut.length).toBeLessThanOrEqual(50);
		expect(cut.endsWith("word…")).toBe(true);
	});
});
