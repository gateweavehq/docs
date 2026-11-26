/**
 * How a social card is drawn, and how its text is made to fit. Used by the card endpoint
 * (`pages/og/[...slug].ts`) and by the tests, which draw real cards.
 *
 * astro-og-canvas lays the title and the description out as one paragraph and never shrinks or
 * cuts it, so a long title or description runs off the bottom of the image. This module measures
 * the paragraph with the same CanvasKit and the same fonts, and picks the largest type sizes (and,
 * as a last resort, the longest description) that stay above the bottom margin.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { OGImageOptions } from "astro-og-canvas";
import type { CanvasKit, FontMgr } from "canvaskit-wasm";
import { CARD_HEIGHT, CARD_WIDTH, cardDescription } from "./social-card.ts";

const PADDING = 90;
const BORDER = 14;
const LOGO = 96;

/** Width the text wraps at: the card minus its margins, the accent border and one padding. */
export const TEXT_WIDTH = CARD_WIDTH - (PADDING + BORDER) - PADDING - PADDING;
/** Where the text block starts when it is tall: under the logo (astro-og-canvas's `minTop`). */
const TEXT_TOP = PADDING + LOGO + PADDING;
/** The tallest the text block may be, so that it ends above the bottom margin. */
export const TEXT_MAX_HEIGHT = CARD_HEIGHT - PADDING - TEXT_TOP;
/** Where the last line of text may end at the lowest (the top of the bottom margin). */
export const TEXT_BOTTOM = CARD_HEIGHT - PADDING;

const TITLE_SIZES = [76, 68, 60, 52, 44];
const DESCRIPTION_SIZES = [36, 32, 28];

const FONT_FILES = [
	"./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff",
	"./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
];

type Measurer = { kit: CanvasKit; fonts: FontMgr };
let measurer: Promise<Measurer> | undefined;

function getMeasurer(): Promise<Measurer> {
	measurer ??= (async () => {
		const { default: init } = await import("canvaskit-wasm/full");
		const { resolve } = createRequire(import.meta.url);
		const kit = await init({
			locateFile: (file: string) => resolve(`canvaskit-wasm/bin/full/${file}`),
		});
		const data = await Promise.all(FONT_FILES.map((file) => readFile(file)));
		const fonts = kit.FontMgr.FromData(...data.map((buf) => new Uint8Array(buf).buffer));
		if (!fonts) throw new Error("could not load the card fonts");
		return { kit, fonts };
	})();
	return measurer;
}

/** Height of the title and description paragraph, laid out as astro-og-canvas does. */
export async function textHeight(
	title: string,
	description: string,
	titleSize: number,
	descriptionSize: number,
): Promise<number> {
	const { kit, fonts } = await getMeasurer();
	const style = (size: number, weight: "Bold" | "Normal", lineHeight: number) => ({
		fontFamilies: ["Inter"],
		fontSize: size,
		fontStyle: { weight: kit.FontWeight[weight] },
		heightMultiplier: lineHeight,
	});
	const paragraphStyle = new kit.ParagraphStyle({
		textAlign: kit.TextAlign.Left,
		textStyle: style(titleSize, "Bold", 1),
		textDirection: kit.TextDirection.LTR,
	});
	const builder = kit.ParagraphBuilder.Make(paragraphStyle, fonts);
	builder.addText(title);
	builder.pushStyle(new kit.TextStyle({ fontSize: PADDING / 3, heightMultiplier: 1 }));
	builder.addText("\n\n");
	builder.pushStyle(new kit.TextStyle(style(descriptionSize, "Normal", 1.3)));
	builder.addText(description);
	const paragraph = builder.build();
	paragraph.layout(TEXT_WIDTH);
	const height = paragraph.getHeight();
	paragraph.delete();
	builder.delete();
	return height;
}

export type CardText = { titleSize: number; descriptionSize: number; description: string };

/** The type sizes, and the description, that make a card's text fit above the bottom margin. */
export async function fitCardText(title: string, description: string): Promise<CardText> {
	for (const titleSize of TITLE_SIZES) {
		for (const descriptionSize of DESCRIPTION_SIZES) {
			const height = await textHeight(title, description, titleSize, descriptionSize);
			if (height <= TEXT_MAX_HEIGHT) return { titleSize, descriptionSize, description };
		}
	}
	// Even the smallest sizes are too tall: keep them and shorten the description.
	const titleSize = TITLE_SIZES.at(-1) as number;
	const descriptionSize = DESCRIPTION_SIZES.at(-1) as number;
	for (let max = description.length - 1; max > 0; max -= 10) {
		const shorter = cardDescription(description, max);
		const height = await textHeight(title, shorter, titleSize, descriptionSize);
		if (height <= TEXT_MAX_HEIGHT) return { titleSize, descriptionSize, description: shorter };
	}
	return { titleSize, descriptionSize, description: "" };
}

/** The options astro-og-canvas draws a card with, for a page's title and description. */
export async function cardImageOptions(
	title: string,
	description: string,
): Promise<OGImageOptions> {
	const fit = await fitCardText(title, cardDescription(description));
	return {
		title,
		description: fit.description,
		// Gateweave's dark surface and indigo accent, as in theme.css and the logo.
		bgGradient: [
			[24, 24, 27],
			[34, 36, 64],
		],
		border: { color: [139, 147, 255], width: BORDER, side: "inline-start" },
		padding: PADDING,
		logo: { path: "./public/apple-touch-icon.png", size: [LOGO] },
		font: {
			title: { size: fit.titleSize, weight: "Bold", families: ["Inter"], color: [250, 250, 250] },
			description: {
				size: fit.descriptionSize,
				weight: "Normal",
				families: ["Inter"],
				color: [190, 192, 214],
			},
		},
		fonts: FONT_FILES,
	};
}
