import type { Product } from "./products.ts";

export interface SidebarLink {
	label: string;
	slug: string;
}

export interface SidebarGroup {
	label: string;
	collapsed?: boolean;
	items: (SidebarLink | SidebarGroup)[];
}

export function sidebarFor(product: Product, labels: Map<string, string>): SidebarGroup {
	const link = (slug: string): SidebarLink => ({
		label: product.labels?.[slug] ?? labels.get(slug) ?? slug,
		slug: slug === "" ? product.key : `${product.key}/${slug}`,
	});
	const slugs = [...labels.keys()].filter((slug) => slug !== "" && slug !== "changelog").sort();
	const remaining = new Set(slugs);
	const items: SidebarGroup["items"] = [{ ...link(""), label: "Overview" }];
	if (remaining.delete("quickstart")) items.push(link("quickstart"));
	const concepts: SidebarGroup = { label: "Concepts", items: [] };
	const guides: SidebarGroup = { label: "Guides", items: [] };
	const reference: SidebarGroup = { label: "Reference", items: [] };

	for (const [key, group] of [
		["concepts", concepts],
		["guides", guides],
		["reference", reference],
	] as const) {
		for (const entry of product.groups[key] ?? []) {
			const hasPage = slugs.includes(entry);
			const inside = slugs.filter((slug) => slug.startsWith(`${entry}/`));
			if (hasPage && inside.length === 0) {
				if (remaining.delete(entry)) group.items.push(link(entry));
				continue;
			}
			if (!hasPage && inside.length === 0) {
				console.warn(`${product.key}: no page "${entry}"`);
				continue;
			}
			const nestedItems = [
				...(hasPage && remaining.delete(entry) ? [link(entry)] : []),
				...inside.filter((slug) => remaining.delete(slug)).map(link),
			];
			const label = entry.charAt(0).toUpperCase() + entry.slice(1);
			if (nestedItems.length > 0) group.items.push({ label, items: nestedItems });
		}
	}

	for (const slug of remaining) {
		console.warn(`${product.key}: "${slug}" is not in its groups in scripts/products.ts`);
		guides.items.push(link(slug));
	}
	items.push(...[concepts, guides, reference].filter((group) => group.items.length > 0));
	if (labels.has("changelog")) items.push({ label: "Changelog", items: [link("changelog")] });
	return { label: product.name, items };
}
