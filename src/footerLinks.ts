/**
 * The links under every page. Each URL is one the site or the products already use:
 * - GitHub: the `social` link in `astro.config.ts`.
 * - Discussions: Track's board, the one Track's README sends questions and ideas to. It is the
 *   public place to talk about Gateweave: the organization has no board of its own, and Track is
 *   the flagship product (Agents has one too).
 * - Cloud: the "Gateweave Cloud" button on the home page.
 * - Changelog: the "What's new" page in the sidebar (`pnpm sync` writes it).
 */
export const footerLinks = [
	{ label: "GitHub", href: "https://github.com/gateweavehq", external: true },
	{
		label: "Discussions",
		href: "https://github.com/gateweavehq/track/discussions",
		external: true,
	},
	{ label: "Gateweave Cloud", href: "https://gateweave.com", external: true },
	{ label: "Changelog", href: "/changelog/", external: false },
] as const;
