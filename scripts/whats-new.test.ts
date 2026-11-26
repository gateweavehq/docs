import { readFileSync } from "node:fs";
import { join } from "node:path";
import sax from "sax";
import { describe, expect, it } from "vitest";
import {
	bodyOf,
	buildWhatsNew,
	FEED_PATH,
	FEED_URL,
	PAGE_PATH,
	parseReleases,
	readLocalSources,
	type WhatsNewSource,
} from "./whats-new.ts";

const root = join(import.meta.dirname, "..");

const changelog = [
	"Intro text.",
	"",
	"## [0.3.0] - 2026-11-20",
	"",
	"Summary.",
	"",
	"### Added",
	"",
	"- A thing.",
	"",
	"### If you run your own",
	"",
	"- **One migration** for `a & b`.",
	"",
	"```sh",
	"## not a release",
	"### If you run your own",
	"```",
	"",
	"### Fixed",
	"",
	"- Nothing.",
	"",
	"## [0.2.1] - 2026-11-19",
	"",
	"### Fixed",
	"",
	"- A fix.",
	"",
	"## [0.2.0] - 2026-11-18",
	"",
	"### Upgrading",
	"",
	"Update <soon> & restart.",
	"",
	"## [0.1.0] - 2026-11-01",
	"",
	"First.",
	"",
].join("\n");

const sources: WhatsNewSource[] = [
	{ key: "one", name: "Gateweave One", repo: "one", version: "v0.3.0", changelog },
	{ key: "two", name: "Gateweave Two", repo: "two", version: "main", changelog },
];

interface Node {
	name: string;
	attributes: Record<string, string>;
	text: string;
	children: Node[];
}

/** Parses strictly: any malformed XML throws. */
function parseXml(xml: string): Node {
	const parser = sax.parser(true, { xmlns: false });
	const stack: Node[] = [];
	let root: Node | null = null;
	parser.onopentag = (tag) => {
		const node: Node = {
			name: tag.name,
			attributes: tag.attributes as Record<string, string>,
			text: "",
			children: [],
		};
		stack.at(-1)?.children.push(node);
		if (!root) root = node;
		stack.push(node);
	};
	parser.ontext = (text) => {
		const top = stack.at(-1);
		if (top) top.text += text;
	};
	parser.onclosetag = () => {
		stack.pop();
	};
	parser.onerror = (error) => {
		throw error;
	};
	parser.write(xml).close();
	if (!root) throw new Error("no root element");
	return root;
}

function child(node: Node, name: string): Node {
	const found = node.children.find((c) => c.name === name);
	if (!found) throw new Error(`<${node.name}> has no <${name}>`);
	return found;
}

/** What a feed reader needs of an Atom feed (RFC 4287): the required elements of each. */
function expectValidFeed(xml: string): Node {
	const feed = parseXml(xml);
	expect(feed.name).toBe("feed");
	expect(feed.attributes.xmlns).toBe("http://www.w3.org/2005/Atom");
	expect(child(feed, "id").text).toMatch(/^https:\/\//);
	expect(child(feed, "title").text).not.toBe("");
	expect(child(feed, "updated").text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
	expect(child(child(feed, "author"), "name").text).not.toBe("");
	return feed;
}

describe("parseReleases", () => {
	it("lists releases newest first with date, tag and release link", () => {
		const releases = parseReleases(changelog, "one");
		expect(releases.map((r) => [r.version, r.tag, r.date])).toEqual([
			["0.3.0", "v0.3.0", "2026-11-20"],
			["0.2.1", "v0.2.1", "2026-11-19"],
			["0.2.0", "v0.2.0", "2026-11-18"],
			["0.1.0", "v0.1.0", "2026-11-01"],
		]);
		expect(releases[0]?.url).toBe("https://github.com/gateweavehq/one/releases/tag/v0.3.0");
	});

	it("takes the upgrade section of an entry, and ignores headings inside code fences", () => {
		const releases = parseReleases(changelog, "one");
		expect(releases[0]?.upgrade).toBe(
			[
				"- **One migration** for `a & b`.",
				"",
				"```sh",
				"## not a release",
				"### If you run your own",
				"```",
			].join("\n"),
		);
		expect(releases[1]?.upgrade).toBeNull();
		expect(releases[2]?.upgrade).toBe("Update <soon> & restart.");
		expect(releases[3]?.upgrade).toBeNull();
	});

	it("keeps only the latest five", () => {
		const many = Array.from(
			{ length: 8 },
			(_, i) => `## [0.${8 - i}.0] - 2026-11-0${8 - i}\n\nText.\n`,
		).join("\n");
		const releases = parseReleases(many, "one");
		expect(releases.map((r) => r.version)).toEqual(["0.8.0", "0.7.0", "0.6.0", "0.5.0", "0.4.0"]);
	});
});

describe("buildWhatsNew", () => {
	const { page, feed } = buildWhatsNew(sources);

	it("writes a page with front matter, the feed link, and a section per product", () => {
		expect(page).toMatch(/^---\ntitle: "What's new"\n/);
		expect(page).toContain("[Atom feed](/changelog.xml)");
		expect(page).toContain("## Gateweave One");
		expect(page).toContain(
			"- 2026-11-20 · [v0.3.0](https://github.com/gateweavehq/one/releases/tag/v0.3.0)",
		);
		expect(page).toContain("  - **One migration** for `a & b`.");
	});

	it("shows a product that has no release yet without entries", () => {
		expect(page).toContain("## Gateweave Two\n\nThere is no release yet.");
		expect(feed).not.toContain("/two/releases");
	});

	it("writes a feed that is well-formed XML with the feed's id, title and updated", () => {
		const parsed = expectValidFeed(feed);
		expect(child(parsed, "id").text).toBe(FEED_URL);
		expect(child(parsed, "title").text).toBe("Gateweave: what's new");
		expect(child(parsed, "updated").text).toBe("2026-11-20T00:00:00Z");
	});

	it("gives each entry an id, title, updated and link, newest first, and escapes text", () => {
		const entries = expectValidFeed(feed).children.filter((c) => c.name === "entry");
		expect(entries.map((e) => child(e, "title").text)).toEqual([
			"Gateweave One 0.3.0",
			"Gateweave One 0.2.1",
			"Gateweave One 0.2.0",
			"Gateweave One 0.1.0",
		]);
		for (const entry of entries) {
			const id = child(entry, "id").text;
			expect(id).toMatch(/^https:\/\/github\.com\/gateweavehq\/one\/releases\/tag\/v/);
			expect(child(entry, "link").attributes.href).toBe(id);
			expect(child(entry, "updated").text).toMatch(/^2026-11-\d\dT00:00:00Z$/);
		}
		expect(new Set(entries.map((e) => child(e, "id").text)).size).toBe(entries.length);
		expect(child(entries[0] as Node, "summary").text).toBe(
			"One migration for a & b. ## not a release ### If you run your own",
		);
		expect(child(entries[2] as Node, "summary").text).toBe("Update <soon> & restart.");
		expect(entries[1]?.children.some((c) => c.name === "summary")).toBe(false);
	});

	it("is the same on every run", () => {
		expect(buildWhatsNew(sources)).toEqual({ page, feed });
	});
});

describe("the committed What's new page and feed", () => {
	const sourcesNow = readLocalSources(root);
	const { page, feed } = buildWhatsNew(sourcesNow);

	it("are what the sync's code path writes from the committed changelog pages", () => {
		// `pnpm sync` hands `buildWhatsNew` each changelog page's body, the part after the front
		// matter, which is also what `readLocalSources` reads back from the files it wrote.
		expect(readFileSync(join(root, PAGE_PATH), "utf8")).toBe(page);
		expect(readFileSync(join(root, FEED_PATH), "utf8")).toBe(feed);
	});

	it("make a valid feed of at most five releases per product", () => {
		const parsed = expectValidFeed(readFileSync(join(root, FEED_PATH), "utf8"));
		const entries = parsed.children.filter((c) => c.name === "entry");
		expect(entries.length).toBeGreaterThan(0);
		const perProduct = new Map<string, number>();
		for (const entry of entries) {
			const repo = /gateweavehq\/([^/]+)\//.exec(child(entry, "id").text)?.[1] ?? "";
			perProduct.set(repo, (perProduct.get(repo) ?? 0) + 1);
			expect(child(entry, "title").text).toMatch(/^Gateweave \w+ \S+$/);
		}
		for (const count of perProduct.values()) expect(count).toBeLessThanOrEqual(5);
		const dates = entries.map((e) => child(e, "updated").text);
		expect(dates).toEqual([...dates].sort().reverse());
		expect(child(parsed, "updated").text).toBe(dates[0]);
	});

	it("strips only the front matter from a changelog page", () => {
		expect(bodyOf("---\ntitle: x\n---\nBody\n\n---\nrule\n")).toBe("Body\n\n---\nrule\n");
	});
});
