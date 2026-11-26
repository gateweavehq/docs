/** Shared by the card endpoint (`pages/og/`) and the route middleware (`routeData.ts`). */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Starlight's own fallback for a page with no description: the one set in `astro.config.ts`. */
export const DEFAULT_DESCRIPTION =
	"Documentation for Gateweave's open-source business tools on Cloudflare: Track, Agents, ID, Mail, Guard and Backup.";

/** Where a page's card is served, relative to the site root. The home page's id is empty. */
export function cardPath(id: string): string {
	return `/og/${id || "index"}.png`;
}

/** A description that fits under the title: cut at a word boundary, with an ellipsis. */
export function cardDescription(text: string, max = 150): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length <= max) return flat;
	const cut = flat.slice(0, max - 1);
	const space = cut.lastIndexOf(" ");
	return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
