import { describe, expect, it } from "vitest";
import { footerLinks } from "../src/footerLinks.ts";

describe("footerLinks", () => {
	it("lists GitHub, Discussions, Gateweave Cloud and Changelog", () => {
		expect(footerLinks.map((link) => link.label)).toEqual([
			"GitHub",
			"Discussions",
			"Gateweave Cloud",
			"Changelog",
		]);
	});

	it("points Discussions at a public GitHub Discussions board", () => {
		const link = footerLinks.find((l) => l.label === "Discussions");
		expect(link?.href).toBe("https://github.com/gateweavehq/track/discussions");
		expect(link?.external).toBe(true);
	});
});
