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
		const contentDir = join(import.meta.dirname, "../src/content/docs", key);
		const labels = new Map<string, string>();
		for (const file of readdirSync(contentDir, { recursive: true, withFileTypes: true })) {
			if (!file.isFile() || !file.name.endsWith(".md")) continue;
			const path = relative(contentDir, join(file.parentPath, file.name)).split(sep).join("/");
			const slug = path === "index.md" ? "" : path.slice(0, -".md".length);
			labels.set(slug, slug);
		}

		expect(labels.has("")).toBe(true);
		const [overview, ...items] = sidebarFor(product, labels).items;
		expect(overview).toEqual({ label: "Overview", slug: key });
		const groups = items.filter((item) => "items" in item);
		expect(groups).toEqual(items);
		const expectedSlugs = [...labels.keys()].filter(Boolean).map((slug) => `${key}/${slug}`);
		expect(
			linksIn(groups)
				.map(({ slug }) => slug)
				.sort(),
		).toEqual(expectedSlugs.sort());

		const concepts = groups.find(({ label }) => label === "Concepts");
		const conceptSlugs = linksIn(concepts?.items ?? []).map(({ slug }) => slug);
		for (const slug of ["architecture", "spec"]) {
			if (labels.has(slug)) expect(conceptSlugs).toContain(`${key}/${slug}`);
		}
	});
});

it("keeps only the first Overview link directly in each generated product group", () => {
	const path = new URL("../src/generated/sidebar.json", import.meta.url);
	const sidebar = JSON.parse(readFileSync(path, "utf8")) as SidebarGroup[];
	for (const { key, name } of products) {
		const group = sidebar.find(({ label }) => label === name);
		const overview = { label: "Overview", slug: key };
		expect(group?.items[0], name).toEqual(overview);
		expect(
			group?.items.filter((item) => !("items" in item)),
			name,
		).toEqual([overview]);
	}
});
