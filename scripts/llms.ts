import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_H2 = [
	"Recommended entry points",
	"Which file to use",
	"Documentation Sets",
	"Notes",
];
const SITE = "https://docs.gateweave.com";

/** Problems in a built `dist/llms.txt`: wrong headings, or Markdown copies that are not there. */
export function checkLlms(dist: string): string[] {
	const path = join(dist, "llms.txt");
	if (!existsSync(path)) return ["llms.txt: missing from the build"];
	const source = readFileSync(path, "utf8");
	const problems: string[] = [];

	const headings = [...source.matchAll(/^## (.+)$/gm)].flatMap((match) =>
		match[1] === undefined ? [] : [match[1]],
	);
	if (JSON.stringify(headings) !== JSON.stringify(EXPECTED_H2)) {
		problems.push(
			`llms.txt: H2 headings are ${JSON.stringify(headings)}, expected ${JSON.stringify(EXPECTED_H2)}`,
		);
	}
	const seen = new Set<string>();
	for (const heading of headings) {
		if (seen.has(heading)) problems.push(`llms.txt: duplicate H2 heading "${heading}"`);
		seen.add(heading);
	}

	for (const match of source.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
		const target = match[1]?.trim();
		if (!target) continue;
		let url: URL;
		try {
			url = new URL(target, SITE);
		} catch {
			problems.push(`llms.txt: malformed link target "${target}"`);
			continue;
		}
		if (!url.pathname.startsWith("/markdown/") || !url.pathname.endsWith(".md")) continue;
		const relative = decodeURIComponent(url.pathname).slice(1);
		const file = join(dist, relative);
		if (!existsSync(file)) {
			problems.push(`llms.txt: linked Markdown copy is missing: ${url.pathname}`);
			continue;
		}
		const stat = statSync(file);
		if (!stat.isFile() || stat.size === 0) {
			problems.push(`llms.txt: linked Markdown copy is empty: ${url.pathname}`);
		}
	}
	return problems;
}
