import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type Product, products } from "./products.ts";
import { type SidebarGroup, type SidebarLink, sidebarFor } from "./sidebar.ts";

const example: Product = {
	key: "example",
	repo: "example",
	name: "Example",
	summary: "Example product",
	groups: {
		concepts: ["architecture"],
		guides: ["start", "recipes"],
		reference: ["format"],
	},
	labels: { "recipes/gitea": "Gitea" },
};

function linksIn(items: SidebarGroup["items"]): SidebarLink[] {
	return items.flatMap((item) => ("items" in item ? linksIn(item.items) : [item]));
}

function contentLabels(key: string): Map<string, string> {
	const contentDir = join(import.meta.dirname, "../src/content/docs", key);
	const labels = new Map<string, string>();
	for (const file of readdirSync(contentDir, { recursive: true, withFileTypes: true })) {
		if (!file.isFile() || !file.name.endsWith(".md")) continue;
		const path = relative(contentDir, join(file.parentPath, file.name)).split(sep).join("/");
		const slug = path === "index.md" ? "" : path.slice(0, -".md".length);
		labels.set(slug, slug);
	}
	return labels;
}

// Content frontmatter holds display titles; the sidebar keeps their shorter source titles.
function sidebarTitle(title: string, key: string): string {
	const product = products.find((product) => product.key === key);
	const short = product?.name.replace(/^Gateweave /, "");
	for (const name of ["architecture", "changelog", "roadmap"] as const) {
		if (title === `${short} ${name}`) return name.charAt(0).toUpperCase() + name.slice(1);
	}
	return title === `Self-hosting ${short}` ? "Self-hosting" : title;
}

function contentTitles(key: string): Map<string, string> {
	const contentDir = join(import.meta.dirname, "../src/content/docs", key);
	const labels = new Map<string, string>();
	for (const file of readdirSync(contentDir, { recursive: true, withFileTypes: true })) {
		if (!file.isFile() || !file.name.endsWith(".md")) continue;
		const path = relative(contentDir, join(file.parentPath, file.name)).split(sep).join("/");
		const slug = path === "index.md" ? "" : path.slice(0, -".md".length);
		const source = readFileSync(join(file.parentPath, file.name), "utf8");
		const title = source.match(/^title: (".*")$/m);
		const rawTitle = title?.[1];
		if (!rawTitle) throw new Error(`${key}/${path} has no frontmatter title`);
		labels.set(slug, sidebarTitle(JSON.parse(rawTitle), key));
	}
	return labels;
}

describe("sidebarFor", () => {
	it("orders the groups and places unlisted pages after the listed Guides", () => {
		const labels = new Map([
			["", "Example home"],
			["changelog", "Release notes"],
			["recipes/outline", "Outline"],
			["recipes/gitea", "Using Gitea"],
			["architecture", "Architecture"],
			["format", "File format"],
			["extra", "Extra guide"],
			["start", "Get started"],
		]);
		using warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(sidebarFor(example, labels)).toEqual({
			label: "Example",
			items: [
				{ label: "Overview", slug: "example" },
				{ label: "Concepts", items: [{ label: "Architecture", slug: "example/architecture" }] },
				{
					label: "Guides",
					items: [
						{ label: "Get started", slug: "example/start" },
						{
							label: "Recipes",
							items: [
								{ label: "Gitea", slug: "example/recipes/gitea" },
								{ label: "Outline", slug: "example/recipes/outline" },
							],
						},
						{ label: "Extra guide", slug: "example/extra" },
					],
				},
				{ label: "Reference", items: [{ label: "File format", slug: "example/format" }] },
				{ label: "Changelog", items: [{ label: "Release notes", slug: "example/changelog" }] },
			],
		});
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			'example: "extra" is not in its groups in scripts/products.ts',
		);
	});

	it("places an unlisted quickstart directly after Overview without warning", () => {
		const labels = new Map([
			["", "Example home"],
			["quickstart", "Get started quickly"],
			["architecture", "Architecture"],
			["start", "Get started"],
			["recipes/gitea", "Using Gitea"],
			["format", "File format"],
		]);
		using warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const { items } = sidebarFor(example, labels);
		expect(items.map(({ label }) => label)).toEqual([
			"Overview",
			"Get started quickly",
			"Concepts",
			"Guides",
			"Reference",
		]);
		expect(items[1]).toEqual({ label: "Get started quickly", slug: "example/quickstart" });
		expect(warn).not.toHaveBeenCalled();
	});

	it("omits empty groups and warns when a listed page is missing", () => {
		using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const sidebar = sidebarFor(
			{ ...example, groups: { concepts: ["missing"] } },
			new Map([
				["", "Example home"],
				["extra", "Extra guide"],
			]),
		);

		expect(sidebar.items).toEqual([
			{ label: "Overview", slug: "example" },
			{ label: "Guides", items: [{ label: "Extra guide", slug: "example/extra" }] },
		]);
		expect(warn).toHaveBeenCalledWith('example: no page "missing"');
	});

	it.each(products)("groups every $key content page exactly once", (product) => {
		const { key } = product;
		const labels = contentLabels(key);

		expect(labels.has("")).toBe(true);
		const [overview, ...items] = sidebarFor(product, labels).items;
		expect(overview).toEqual({ label: "Overview", slug: key });
		const hasQuickstart = labels.has("quickstart");
		if (hasQuickstart) {
			expect(items[0]).toEqual({ label: "quickstart", slug: `${key}/quickstart` });
		}
		const groupedItems = items.slice(hasQuickstart ? 1 : 0);
		const groups = groupedItems.filter((item) => "items" in item);
		expect(groups).toEqual(groupedItems);
		const expectedSlugs = [...labels.keys()].filter(Boolean).map((slug) => `${key}/${slug}`);
		expect(
			linksIn(items)
				.map(({ slug }) => slug)
				.sort(),
		).toEqual(expectedSlugs.sort());

		const concepts = groups.find(({ label }) => label === "Concepts");
		const conceptSlugs = linksIn(concepts?.items ?? []).map(({ slug }) => slug);
		for (const slug of ["architecture", "spec"]) {
			if (labels.has(slug)) expect(conceptSlugs).toContain(`${key}/${slug}`);
		}
	});

	it.each(products.filter(({ key }) => ["track", "agents", "mail"].includes(key)))(
		"places $key Quickstart after Overview and puts MCP in Reference",
		(product) => {
			const { key } = product;
			const { items } = sidebarFor(product, contentLabels(key));
			expect(items.slice(0, 3)).toMatchObject([
				{ label: "Overview", slug: key },
				{ label: "quickstart", slug: `${key}/quickstart` },
				{ label: "Concepts", items: expect.any(Array) },
			]);
			expect(product.groups.guides).not.toContain("quickstart");
			const groups = items.filter((item) => "items" in item);
			const guides = groups.find(({ label }) => label === "Guides");
			expect(linksIn(guides?.items ?? []).map(({ slug }) => slug)).not.toContain(
				`${key}/quickstart`,
			);
			const reference = groups.find(({ label }) => label === "Reference");
			expect(reference?.items).toContainEqual({ label: "mcp", slug: `${key}/mcp` });
		},
	);
});

it("puts Overview and any Quickstart directly in each generated product group", () => {
	const path = new URL("../src/generated/sidebar.json", import.meta.url);
	const sidebar = JSON.parse(readFileSync(path, "utf8")) as SidebarGroup[];
	for (const { key, name } of products) {
		const group = sidebar.find(({ label }) => label === name);
		const overview = { label: "Overview", slug: key };
		expect(group?.items[0], name).toEqual(overview);
		const directLinks = [overview];
		if (contentLabels(key).has("quickstart")) {
			const quickstart = { label: "Quickstart", slug: `${key}/quickstart` };
			expect(group?.items[1], name).toEqual(quickstart);
			directLinks.push(quickstart);
		}
		expect(
			group?.items.filter((item) => !("items" in item)),
			name,
		).toEqual(directLinks);
	}
});

it("matches the sidebar committed in src/generated", () => {
	const path = new URL("../src/generated/sidebar.json", import.meta.url);
	const committed = JSON.parse(readFileSync(path, "utf8")) as SidebarGroup[];
	const rebuilt = products.map((product) => sidebarFor(product, contentTitles(product.key)));

	expect(
		committed,
		"src/generated/sidebar.json is stale; regenerate it with `pnpm sync` and commit the result",
	).toEqual(rebuilt);
});
