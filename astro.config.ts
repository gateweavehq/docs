import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import starlightLlmsTxt from "starlight-llms-txt";
import sidebar from "./src/generated/sidebar.json" with { type: "json" };
import products from "./src/generated/sources.json" with { type: "json" };

export default defineConfig({
	site: "https://docs.gateweave.com",
	trailingSlash: "always",
	integrations: [
		// Before Starlight, so its code blocks reach the page as diagrams.
		mermaid({ autoTheme: true, enableLog: false }),
		starlight({
			title: "Gateweave Docs",
			description:
				"Documentation for Gateweave's open-source, Cloudflare-native business tools: Track, Agents, ID and Mail.",
			logo: { src: "./src/assets/logo.svg", alt: "Gateweave" },
			favicon: "/favicon.svg",
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/gateweavehq" }],
			customCss: ["@fontsource-variable/inter", "./src/styles/theme.css"],
			components: {
				PageTitle: "./src/components/PageTitle.astro",
			},
			sidebar: [{ label: "Home", link: "/" }, ...sidebar],
			lastUpdated: false,
			pagination: true,
			plugins: [
				starlightLlmsTxt({
					projectName: "Gateweave",
					description:
						"Gateweave is a family of open-source business tools that run on Cloudflare: each is one Worker, with Durable Objects and D1, that you can run on your own account or use on Gateweave Cloud.",
					details: products.map((p) => `- ${p.name} (${p.version}): ${p.summary}`).join("\n"),
					// The short version is for using the products: changelogs and architecture notes, which make
					// up most of the text, stay in llms-full.txt and in each product's own file.
					exclude: ["*/changelog", "*/architecture"],
					customSets: products.map((p) => ({
						label: p.name,
						paths: [`${p.key}/**`, p.key],
						description: p.summary,
					})),
				}),
			],
		}),
	],
});
