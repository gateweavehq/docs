/** Adds the social card's meta tags to every page's head (Starlight already adds og:title, og:description, og:url and twitter:card). */
import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { CARD_HEIGHT, CARD_WIDTH, cardPath } from "./social-card.ts";

export const onRequest = defineRouteMiddleware((context) => {
	const { head, entry } = context.locals.starlightRoute;
	const image = new URL(cardPath(context.locals.starlightRoute.id), context.site).href;
	head.push(
		{ tag: "meta", attrs: { property: "og:image", content: image } },
		{ tag: "meta", attrs: { property: "og:image:type", content: "image/png" } },
		{ tag: "meta", attrs: { property: "og:image:width", content: String(CARD_WIDTH) } },
		{ tag: "meta", attrs: { property: "og:image:height", content: String(CARD_HEIGHT) } },
		{ tag: "meta", attrs: { property: "og:image:alt", content: entry.data.title } },
		{ tag: "meta", attrs: { name: "twitter:image", content: image } },
	);
});
