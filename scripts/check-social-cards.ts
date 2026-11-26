/** Fails the build when a page lacks its social card or the tags that point at it. Run by `pnpm build`. */
import { join } from "node:path";
import { checkSocialCards } from "./social-cards.ts";
import { SITE } from "./whats-new.ts";

const root = join(import.meta.dirname, "..");
const problems = checkSocialCards(join(root, "dist"), SITE);
if (problems.length > 0) {
	console.error(
		`Social cards: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join("\n")}`,
	);
	process.exit(1);
}
console.log("Social cards: every page has its meta tags and a 1200x630 PNG card.");
