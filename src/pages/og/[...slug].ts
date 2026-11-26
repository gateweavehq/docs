/**
 * One 1200x630 social card per docs page, written at build time to `/og/<page id>.png`. This is
 * the approach Starlight's docs point to for Open Graph images (astro-og-canvas); `routeData.ts`
 * adds the meta tags that point at these files.
 */
import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { cardDescription, DEFAULT_DESCRIPTION } from "../../social-card.ts";

const entries = await getCollection("docs");
const pages = Object.fromEntries(entries.map(({ data, id }) => [id, { data }]));

export const { getStaticPaths, GET } = await OGImageRoute({
	pages,
	getImageOptions: (_id, page: (typeof pages)[string]) => ({
		title: page.data.title,
		description: cardDescription(page.data.description ?? DEFAULT_DESCRIPTION),
		// Gateweave's dark surface and indigo accent, as in theme.css and the logo.
		bgGradient: [
			[24, 24, 27],
			[34, 36, 64],
		],
		border: { color: [139, 147, 255], width: 14, side: "inline-start" },
		padding: 90,
		logo: { path: "./public/apple-touch-icon.png", size: [96] },
		font: {
			title: { size: 76, weight: "Bold", families: ["Inter"], color: [250, 250, 250] },
			description: { size: 36, weight: "Normal", families: ["Inter"], color: [190, 192, 214] },
		},
		fonts: [
			"./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff",
			"./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
		],
	}),
});
