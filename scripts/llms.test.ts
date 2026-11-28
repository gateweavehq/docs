import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkLlms } from "./llms.ts";

const headings = [
	"## Recommended entry points",
	"## Which file to use",
	"## Documentation Sets",
	"## Notes",
].join("\n");

let dist: string;
function write(path: string, contents: string) {
	mkdirSync(dirname(join(dist, path)), { recursive: true });
	writeFileSync(join(dist, path), contents);
}

beforeEach(() => {
	dist = mkdtempSync(join(tmpdir(), "llms-"));
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe("checkLlms", () => {
	it("accepts the expected headings and an existing Markdown link", () => {
		write(
			"llms.txt",
			`${headings}\n- [Track overview](https://docs.gateweave.com/markdown/track/index.md)\n`,
		);
		write("markdown/track/index.md", "# Track\n");

		expect(checkLlms(dist)).toEqual([]);
	});

	it("reports duplicate headings", () => {
		write("llms.txt", `${headings}\n## Notes\n`);

		expect(checkLlms(dist)).toContain('llms.txt: duplicate H2 heading "Notes"');
	});

	it("reports a missing linked Markdown copy", () => {
		write(
			"llms.txt",
			`${headings}\n- [Track overview](https://docs.gateweave.com/markdown/track/index.md)\n`,
		);

		expect(checkLlms(dist)).toEqual([
			"llms.txt: linked Markdown copy is missing: /markdown/track/index.md",
		]);
	});

	it("reports an empty linked Markdown copy", () => {
		write("llms.txt", `${headings}\n- [Track overview](/markdown/track/index.md)\n`);
		write("markdown/track/index.md", "");

		expect(checkLlms(dist)).toEqual([
			"llms.txt: linked Markdown copy is empty: /markdown/track/index.md",
		]);
	});
});
