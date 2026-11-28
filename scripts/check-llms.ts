/** Fails a built site when `dist/llms.txt` has wrong headings or missing Markdown copies. */
import { join } from "node:path";
import { checkLlms } from "./llms.ts";

const problems = checkLlms(join(import.meta.dirname, "../dist"));
if (problems.length > 0) {
	console.error(
		`llms.txt: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join("\n")}`,
	);
	process.exit(1);
}
console.log("llms.txt: H2 headings are as expected and every Markdown link exists.");
