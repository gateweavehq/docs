/**
 * One 1200x630 social card per docs page, written at build time to `/og/<page id>.png`. This is
 * the approach Starlight's docs point to for Open Graph images (astro-og-canvas); `routeData.ts`
 * adds the meta tags that point at these files, and `social-card-image.ts` draws them and fits
 * each title and description inside the canvas.
 */
import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { DEFAULT_DESCRIPTION } from "../../social-card.ts";
import { cardImageOptions } from "../../social-card-image.ts";

const entries = await getCollection("docs");
const pages = Object.fromEntries(entries.map(({ data, id }) => [id, { data }]));

export const { getStaticPaths, GET } = await OGImageRoute({
	pages,
	getImageOptions: (_id, page: (typeof pages)[string]) =>
		cardImageOptions(page.data.title, page.data.description ?? DEFAULT_DESCRIPTION),
});
