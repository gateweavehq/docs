import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardDescription, cardPath } from "../src/social-card.ts";
import { checkSocialCards, metaTags, pngSize } from "./social-cards.ts";

const site = "https://docs.gateweave.com";

/** A PNG that decodes, as Sharp writes it: blank 8-bit grey pixels. */
async function png(width: number, height: number): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: "#123456" } })
		.png()
		.toBuffer();
}

function chunk(type: string, body: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(body.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
	return Buffer.concat([length, Buffer.from(type), body, crc]);
}

/** Valid signature, IHDR and IEND (every CRC right) around the given IDAT bytes. */
function pngFrom(width: number, height: number, idat: Buffer): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.writeUInt8(8, 8); // bit depth; colour type 0 (grey), not interlaced
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
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
	it("accepts a page with every tag and a 1200x630 card", async () => {
		write("track/index.html", page());
		write("og/track.png", await png(1200, 630));
		expect(await checkSocialCards(dist, site)).toEqual([]);
	});

	it("reports a page with no card tags at all", async () => {
		write("track/index.html", "<html><head></head></html>");
		const problems = await checkSocialCards(dist, site);
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
	])("reports a page without %s", async (key) => {
		write("track/index.html", page({ [key]: null }));
		write("og/track.png", await png(1200, 630));
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: missing <meta ${key}>`,
		]);
	});

	it("reports a card that is missing from dist", async () => {
		write("track/index.html", page());
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: og:image ${site}/og/track.png has no file in dist`,
		]);
	});

	it("reports a card of the wrong size or format", async () => {
		write("track/index.html", page());
		write("og/track.png", await png(800, 418));
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is 800x418, not 1200x630`,
		]);
		write("og/track.png", "not a png");
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is not a PNG that decodes`,
		]);
	});

	it("reports a card that is only a 24-byte PNG fragment, or cut short", async () => {
		write("track/index.html", page());
		const whole = await png(1200, 630);
		for (const bytes of [whole.subarray(0, 24), whole.subarray(0, whole.length - 20)]) {
			write("og/track.png", bytes);
			expect(await checkSocialCards(dist, site)).toEqual([
				`/track/index.html: ${site}/og/track.png is not a PNG that decodes`,
			]);
		}
	});

	it("reports a card whose image data is damaged or too short for its size", async () => {
		write("track/index.html", page());
		const damaged = Buffer.from(await png(1200, 630));
		damaged.writeUInt8(0xff ^ damaged.readUInt8(damaged.length - 20), damaged.length - 20); // inside IDAT: the CRC no longer matches
		write("og/track.png", damaged);
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is not a PNG that decodes`,
		]);
		write("og/track.png", pngFrom(1200, 630, deflateSync(Buffer.alloc(100))));
		expect(await checkSocialCards(dist, site)).toEqual([
			`/track/index.html: ${site}/og/track.png is not a PNG that decodes`,
		]);
	});

	it("reports a card with a valid PNG signature and header whose pixels do not decode", async () => {
		write("track/index.html", page());
		const notDecodable = [
			pngFrom(1200, 630, Buffer.from("these bytes are not deflate data")),
			pngFrom(1200, 630, deflateSync(Buffer.alloc(100))),
		];
		for (const bytes of notDecodable) {
			write("og/track.png", bytes);
			expect(await checkSocialCards(dist, site)).toEqual([
				`/track/index.html: ${site}/og/track.png is not a PNG that decodes`,
			]);
		}
	});

	it("reports a page whose head lacks og:image", async () => {
		write("track/index.html", page({ "og:image": null }));
		write("og/track.png", await png(1200, 630));
		expect(await checkSocialCards(dist, site)).toEqual([
			"/track/index.html: missing <meta og:image>",
		]);
	});

	it("ignores meta-like text in a comment, script, style or the body", async () => {
		const tags =
			page()
				.match(/<meta [^>]*>/g)
				?.join("") ?? "";
		write("og/track.png", await png(1200, 630));
		const outside = [
			`<html><head></head><body>${tags}</body></html>`,
			`<html><head></head><body><template>${tags}</template></body></html>`,
			`<html><head><script>var s = '${tags}';</script></head><body></body></html>`,
			`<html><head><!-- ${tags} --></head><body></body></html>`,
			`<html><head><style>/* ${tags} */</style></head><body></body></html>`,
			`<html><head><title>${tags}</title></head><body></body></html>`,
			`<html><head></head><body><!-- ${tags} --><script>var s = '${tags}';</script><style>${tags}</style></body></html>`,
		];
		for (const html of outside) {
			write("track/index.html", html);
			expect(await checkSocialCards(dist, site)).toContain(
				"/track/index.html: missing <meta og:image>",
			);
		}
	});

	it("reports a relative og:image and a wrong twitter:card", async () => {
		write("track/index.html", page({ "og:image": "/og/track.png", "twitter:card": "summary" }));
		write("og/track.png", await png(1200, 630));
		const problems = await checkSocialCards(dist, site);
		expect(problems).toContain(
			`/track/index.html: og:image "/og/track.png" is not an absolute URL under ${site}`,
		);
		expect(problems).toContain(
			`/track/index.html: twitter:card is "summary", expected "summary_large_image"`,
		);
	});

	it("fails when there are no pages", async () => {
		expect(await checkSocialCards(dist, site)).toEqual([`no pages found in ${dist}`]);
	});
});

describe("helpers", () => {
	it("reads a PNG's size and refuses other bytes", async () => {
		expect(await pngSize(await png(1200, 630))).toEqual({ width: 1200, height: 630 });
		expect(await pngSize(Buffer.from("GIF89a"))).toBeUndefined();
		expect(await pngSize((await png(1200, 630)).subarray(0, 24))).toBeUndefined();
	});

	it("reads meta tags, unescaping entities", () => {
		const tags = metaTags(
			`<html><head><meta property="og:url" content="https://x/?a=1&amp;b=2"/><meta name="a" content=""/></head></html>`,
		);
		expect(tags.get("og:url")).toBe("https://x/?a=1&b=2");
		expect(tags.get("a")).toBe("");
	});

	it("ignores meta-like text in comments, scripts and styles in the head", () => {
		const tags = metaTags(
			`<html><head><!-- <meta name="a" content="c"/> --><script>"<meta name='b' content='s'>"</script><style>/* <meta name="c" content="t"> */</style><meta name="d" content="real"/></head></html>`,
		);
		expect([...tags.keys()]).toEqual(["d"]);
	});

	it("reads meta tags only from the head", () => {
		const tags = metaTags(
			`<html><head><meta name="a" content="head"/></head><body><meta name="a" content="body"/><meta name="b" content="body"/></body></html>`,
		);
		expect(tags.get("a")).toBe("head");
		expect(tags.has("b")).toBe(false);
		expect(
			metaTags('<html><head></head><body><meta name="a" content="x"/></body></html>').size,
		).toBe(0);
	});

	it("names the card by page id, with the home page as index", async () => {
		expect(cardPath("track/self-hosting")).toBe("/og/track/self-hosting.png");
		expect(cardPath("")).toBe("/og/index.png");
	});

	it("shortens long descriptions at a word boundary", async () => {
		expect(cardDescription("Short.")).toBe("Short.");
		const long = `${"word ".repeat(60)}end`;
		const cut = cardDescription(long, 50);
		expect(cut.length).toBeLessThanOrEqual(50);
		expect(cut.endsWith("word…")).toBe(true);
	});
});
