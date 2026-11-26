/**
 * The links under every page. Each URL is one the site or the products already use:
 * - GitHub: the `social` link in `astro.config.ts`.
 * - Cloud: the "Gateweave Cloud" button on the home page.
 * - Changelog: the "What's new" page in the sidebar (`pnpm sync` writes it).
 * There is no Discussions link: the organization has no public discussions, and only some product
 * repositories do (Track's README links its own), so none stands for the whole site.
 */
export const footerLinks = [
	{ label: "GitHub", href: "https://github.com/gateweavehq", external: true },
	{ label: "Gateweave Cloud", href: "https://gateweave.com", external: true },
	{ label: "Changelog", href: "/changelog/", external: false },
] as const;
