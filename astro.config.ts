import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import starlightLlmsTxt from "starlight-llms-txt";
import { entryPointsMarkdown, llmsNotes } from "./scripts/products.ts";
import sidebar from "./src/generated/sidebar.json" with { type: "json" };
import products from "./src/generated/sources.json" with { type: "json" };

const site = "https://docs.gateweave.com";

export default defineConfig({
	site,
	trailingSlash: "always",
	integrations: [
		// Before Starlight, so its code blocks reach the page as diagrams.
		mermaid({ autoTheme: true, enableLog: false }),
		starlight({
			title: "Gateweave Docs",
			description:
				"Documentation for Gateweave's open-source business tools on Cloudflare: Track, Agents, ID, Mail, Guard and Backup.",
			logo: { src: "./src/assets/logo.svg", alt: "Gateweave" },
			favicon: "/favicon.svg",
			head: [
				{
					tag: "link",
					attrs: {
						rel: "alternate",
						type: "application/atom+xml",
						title: "Gateweave: what's new",
						href: `${site}/changelog.xml`,
					},
				},
			],
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/gateweavehq" }],
			customCss: ["@fontsource-variable/inter", "./src/styles/theme.css"],
			components: {
				Footer: "./src/components/Footer.astro",
				PageTitle: "./src/components/PageTitle.astro",
			},
			// Adds each page's social card to its head (cards are built by `src/pages/og/`).
			routeMiddleware: "./src/routeData.ts",
			sidebar: [
				{ label: "Home", link: "/" },
				{ label: "Agent setup", link: "/agent-setup/" },
				{ label: "Community rules", link: "/community-rules/" },
				{ label: "What's new", link: "/changelog/" },
				...sidebar,
			],
			lastUpdated: false,
			pagination: true,
			plugins: [
				starlightLlmsTxt({
					projectName: "Gateweave",
					description:
						"Gateweave is a family of open-source business tools that run on Cloudflare: each is one Worker, with Durable Objects and D1, that you can run on your own account or use on Gateweave Cloud.",
					details: [
						products.map((p) => `- ${p.name} (${p.version}): ${p.summary}`).join("\n"),
						entryPointsMarkdown(site),
						llmsNotes,
					].join("\n\n"),
					// The short version is for using the products: changelogs and architecture notes, which make
					// up most of the text, stay in llms-full.txt and in each product's own file. The matcher
					// is anchored, so the root "What's new" page needs its own entry.
					exclude: ["changelog", "*/changelog", "*/architecture"],
					customSets: [
						...products.map((p) => ({
							label: p.name,
							paths: [`${p.key}/**`, p.key],
							description: p.summary,
						})),
						{
							label: "Community rules",
							paths: ["community-rules"],
							description:
								"How contributions earn standing, what is never for sale, who decides, and the close reasons with their appeals.",
						},
					],
				}),
			],
		}),
	],
});
