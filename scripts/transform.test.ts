import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entryPoints, entryPointsMarkdown, llmsNotes } from "./products.ts";
import {
	type Context,
	convert,
	type Repository,
	rewriteHtml,
	rewriteUrl,
	slugOf,
} from "./transform.ts";

const track: Repository = {
	owner: "gateweavehq",
	repo: "track",
	key: "track",
	ref: "v1.2.0",
	pages: new Set(["README.md", "CHANGELOG.md", "docs/self-hosting.md", "docs/architecture.md"]),
	assets: new Set(["docs/images/board-light.webp"]),
};
const id: Repository = {
	owner: "gateweavehq",
	repo: "id",
	key: "id",
	ref: "main",
	pages: new Set(["README.md", "docs/connect-an-app.md", "docs/recipes/gitea.md"]),
	assets: new Set(),
};
const at = (path: string, from = track): Context => ({ from, path, all: [track, id] });

describe("llms.txt entry points", () => {
	it("lists five to eight entry points with unique paths", () => {
		const paths = entryPoints.map(({ path }) => path);
		expect(paths.length).toBeGreaterThanOrEqual(5);
		expect(paths.length).toBeLessThanOrEqual(8);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it.each(entryPoints)("links to an existing Markdown copy at $path", ({ path }) => {
		expect(path).toMatch(/^\/markdown\/.*\.md$/);
		expect(existsSync(new URL(`../public${path}`, import.meta.url))).toBe(true);
	});

	it("renders the heading and a line with an absolute link and use for each entry", () => {
		const origin = "https://x.test";
		const lines = entryPointsMarkdown(origin).split("\n");
		expect(lines[0]).toBe("## Recommended entry points");
		for (const { path, title, use } of entryPoints) {
			expect(lines).toContain(`- [${title}](${origin}${path}): ${use}`);
		}
	});

	it("mentions the small and full files in the notes", () => {
		expect(llmsNotes).toContain("llms-small.txt");
		expect(llmsNotes).toContain("llms-full.txt");
	});

	it("does not reuse the integration's own Notes heading", () => {
		expect(llmsNotes).not.toMatch(/^## Notes\s*$/m);
	});
});

describe("slugs", () => {
	it("maps the README, the changelog and docs/ to pages, and nothing else", () => {
		expect(slugOf("README.md")).toBe("");
		expect(slugOf("CHANGELOG.md")).toBe("changelog");
		expect(slugOf("docs/self-hosting.md")).toBe("self-hosting");
		expect(slugOf("docs/recipes/gitea.md")).toBe("recipes/gitea");
		expect(slugOf("docs/images/board.webp")).toBeNull();
		expect(slugOf("apps/web/README.md")).toBeNull();
	});
});

describe("links", () => {
	it("keeps links between a product's pages on this site, with their anchors", () => {
		expect(rewriteUrl("architecture.md#webhooks", at("docs/self-hosting.md"))).toBe(
			"/track/architecture/#webhooks",
		);
		expect(rewriteUrl("../CHANGELOG.md", at("docs/self-hosting.md"))).toBe("/track/changelog/");
		expect(rewriteUrl("docs/self-hosting.md", at("README.md"))).toBe("/track/self-hosting/");
		expect(rewriteUrl("../../README.md", at("docs/recipes/gitea.md", id))).toBe("/id/");
		expect(rewriteUrl("../connect-an-app.md", at("docs/recipes/gitea.md", id))).toBe(
			"/id/connect-an-app/",
		);
	});

	it("sends links to code to GitHub, at the version the page was copied from", () => {
		expect(rewriteUrl("../apps/web/src/server/sync.ts", at("docs/architecture.md"))).toBe(
			"https://github.com/gateweavehq/track/blob/v1.2.0/apps/web/src/server/sync.ts",
		);
		expect(rewriteUrl("packages/protocol/", at("README.md"))).toBe(
			"https://github.com/gateweavehq/track/tree/v1.2.0/packages/protocol",
		);
		expect(rewriteUrl("LICENSE", at("README.md"))).toBe(
			"https://github.com/gateweavehq/track/blob/v1.2.0/LICENSE",
		);
	});

	it("serves copied images from here and others from GitHub", () => {
		expect(rewriteUrl("images/board-light.webp", at("docs/self-hosting.md"))).toBe(
			"/track/images/board-light.webp",
		);
		expect(rewriteUrl(".github/logo.svg", at("README.md"))).toBe(
			"https://raw.githubusercontent.com/gateweavehq/track/v1.2.0/.github/logo.svg",
		);
	});

	it("turns a link to another product's docs on GitHub into its page here", () => {
		expect(
			rewriteUrl(
				"https://github.com/gateweavehq/id/blob/main/docs/connect-an-app.md#add-it",
				at("docs/self-hosting.md"),
			),
		).toBe("/id/connect-an-app/#add-it");
		// Code in another product's repository, and a doc that isn't copied, stay on GitHub.
		const code = "https://github.com/gateweavehq/id/blob/main/apps/web/src/index.ts";
		expect(rewriteUrl(code, at("README.md"))).toBe(code);
		const other = "https://github.com/someone/else/blob/main/docs/x.md";
		expect(rewriteUrl(other, at("README.md"))).toBe(other);
	});

	it("leaves anchors, other sites, mail and paths outside the repository alone", () => {
		for (const url of ["#deploying", "https://gateweave.com", "mailto:a@example.com", "../../x"]) {
			expect(rewriteUrl(url, at("docs/self-hosting.md"))).toBe(url);
		}
	});

	it("rewrites links in raw HTML, including each candidate of a srcset", () => {
		expect(
			rewriteHtml(
				"<source srcset=\"docs/images/board-light.webp 1x, docs/images/board-light.webp 2x\"><a href='LICENSE'>",
				at("README.md"),
			),
		).toBe(
			'<source srcset="/track/images/board-light.webp 1x, /track/images/board-light.webp 2x"><a href="https://github.com/gateweavehq/track/blob/v1.2.0/LICENSE">',
		);
	});
});

describe("pages", () => {
	it("takes a README's name and tagline from its HTML header and drops the logo and badges", () => {
		const readme = [
			'<p align="center">',
			'  <img src=".github/logo.svg" width="96" height="96" alt="">',
			"</p>",
			"",
			'<h1 align="center">Gateweave Track</h1>',
			"",
			'<p align="center">',
			"  <strong>An issue tracker on one Worker.</strong><br>",
			"  It opens at once.",
			"</p>",
			"",
			'<p align="center">',
			'  <a href="LICENSE"><img src="https://img.shields.io/github/license/x" alt="License"></a>',
			"</p>",
			"",
			"<picture>",
			'  <img src="docs/images/board-light.webp" alt="A board">',
			"</picture>",
			"",
			"Track keeps every workspace in a Durable Object. See [self-hosting](docs/self-hosting.md).",
			"",
		].join("\r\n");
		const page = convert(readme, at("README.md"), "fallback");
		expect(page.title).toBe("Gateweave Track");
		expect(page.description).toBe("An issue tracker on one Worker. It opens at once.");
		expect(page.body).toBe(
			[
				"<picture>",
				'  <img src="/track/images/board-light.webp" alt="A board">',
				"</picture>",
				"",
				"Track keeps every workspace in a Durable Object. See [self-hosting](/track/self-hosting/).",
				"",
			].join("\n"),
		);
	});

	it("takes the first heading as the title, and leaves code as written", () => {
		const doc = [
			"# Self-hosting",
			"",
			"Read the [architecture](architecture.md 'How it works') and ![the board](images/board-light.webp).",
			"",
			"Use `[x](architecture.md)` to link. See [the code][code].",
			"",
			"```md",
			"[a link](architecture.md)",
			"```",
			"",
			"[code]: ../apps/web/src/server/sync.ts",
			"",
		].join("\n");
		const page = convert(doc, at("docs/self-hosting.md"), "fallback");
		expect(page.title).toBe("Self-hosting");
		expect(page.body).toBe(
			[
				"Read the [architecture](/track/architecture/ 'How it works') and ![the board](/track/images/board-light.webp).",
				"",
				"Use `[x](architecture.md)` to link. See [the code][code].",
				"",
				"```md",
				"[a link](architecture.md)",
				"```",
				"",
				"[code]: https://github.com/gateweavehq/track/blob/v1.2.0/apps/web/src/server/sync.ts",
				"",
			].join("\n"),
		);
	});

	it("falls back to a title when the file has no heading", () => {
		expect(convert("Just text.\n", at("docs/self-hosting.md"), "self-hosting").title).toBe(
			"self-hosting",
		);
	});
});
