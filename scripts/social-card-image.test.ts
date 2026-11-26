import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateOpenGraphImage } from "astro-og-canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, DEFAULT_DESCRIPTION } from "../src/social-card.ts";
import {
	cardImageOptions,
	fitCardText,
	TEXT_BOTTOM,
	TEXT_MAX_HEIGHT,
	textHeight,
} from "../src/social-card-image.ts";

/**
 * The fixture is the Backup "app entrypoint" page (`backup/app-entrypoint`): a three-line title
 * and no description of its own, so the card carries the site's long default one. Drawn with the
 * fixed 76 px and 36 px type sizes its last line ended at pixel 675 on a 630 px image.
 */
const fixtureTitle = "Make your app's Durable Objects backable";

describe("social card text", () => {
	it("is too tall for the fixed type sizes on the fixture page (the bug)", async () => {
		const height = await textHeight(fixtureTitle, DEFAULT_DESCRIPTION.slice(0, 149), 76, 36);
		expect(height).toBeGreaterThan(TEXT_MAX_HEIGHT);
	});

	it("is fitted inside the canvas on the fixture page", async () => {
		const fit = await fitCardText(fixtureTitle, DEFAULT_DESCRIPTION);
		const height = await textHeight(
			fixtureTitle,
			fit.description,
			fit.titleSize,
			fit.descriptionSize,
		);
		expect(height).toBeLessThanOrEqual(TEXT_MAX_HEIGHT);
		expect(fit.description.length).toBeGreaterThan(40);
	});

	it("leaves nothing drawn in the bottom margin of the real card", async () => {
		const options = await cardImageOptions(fixtureTitle, DEFAULT_DESCRIPTION);
		const card = (await generateOpenGraphImage({ ...options, cacheDir: "" })) as Buffer;
		const { data, info } = await sharp(card)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		expect([info.width, info.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);

		// Right of the text the background is a plain vertical gradient, so any row below the text
		// block that differs from its own right-hand pixel has text in it.
		const reference = (y: number) =>
			data.subarray((y * info.width + 1150) * 4, (y * info.width + 1150) * 4 + 3);
		const inkRows: number[] = [];
		for (let y = 0; y < info.height; y++) {
			const expected = reference(y);
			for (let x = 104; x < 1100; x++) {
				const at = (y * info.width + x) * 4;
				if (Math.abs((data[at] ?? 0) - (expected[0] ?? 0)) > 8) {
					inkRows.push(y);
					break;
				}
			}
		}
		expect(inkRows.length).toBeGreaterThan(100); // the text is there
		expect(Math.max(...inkRows)).toBeLessThan(TEXT_BOTTOM);
	});

	it("fits every page of the site", async () => {
		const docs = "src/content/docs";
		const files = (readdirSync(docs, { recursive: true }) as string[]).filter((f) =>
			/\.mdx?$/.test(f),
		);
		expect(files.length).toBeGreaterThan(20);
		const field = (text: string, key: string) => {
			const raw = new RegExp(`^${key}:[ \\t]*(.+)$`, "m").exec(text)?.[1]?.trim();
			if (!raw || /^[>|]/.test(raw)) return undefined;
			return /^["']/.test(raw) ? (JSON.parse(raw.replace(/^'(.*)'$/, '"$1"')) as string) : raw;
		};
		for (const file of files) {
			const front = readFileSync(join(docs, file), "utf8").split(/^---\s*$/m)[1] ?? "";
			const title = field(front, "title");
			if (!title) continue;
			const fit = await fitCardText(title, field(front, "description") ?? DEFAULT_DESCRIPTION);
			const height = await textHeight(title, fit.description, fit.titleSize, fit.descriptionSize);
			expect(height, file).toBeLessThanOrEqual(TEXT_MAX_HEIGHT);
		}
	}, 60_000);
});
