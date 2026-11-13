/**
 * The products whose docs this site shows. Each one's `README.md`, `CHANGELOG.md` and `docs/`
 * come from its public repository; the repository stays the one place they are written.
 */
export interface Product {
	/** The first segment of the product's pages on this site. */
	key: string;
	/** The repository under github.com/gateweavehq. */
	repo: string;
	name: string;
	/** What the product is, for the home page and `llms.txt`. */
	summary: string;
	/**
	 * The order of the pages after the overview, by slug. A directory's name (`recipes`) puts its
	 * pages there as a group. Pages not listed come after these, then the changelog.
	 */
	pages: string[];
	/** Shorter sidebar labels than the pages' titles, by slug. */
	labels?: Record<string, string>;
}

export const OWNER = "gateweavehq";

export const products: Product[] = [
	{
		key: "track",
		repo: "track",
		name: "Gateweave Track",
		summary:
			"A realtime issue tracker on one Cloudflare Worker, with a local copy that works offline and AI agents as members.",
		pages: ["self-hosting", "ecosystem", "roadmap", "architecture"],
		labels: { ecosystem: "The Gateweave ecosystem" },
	},
	{
		key: "agents",
		repo: "agents",
		name: "Gateweave Agents",
		summary:
			"See which coding agents work in which repositories, share their setups, run your own agents and keep a wiki of each repository.",
		pages: [
			"self-hosting",
			"github-app",
			"track-triage",
			"track-work",
			"docker-sandboxes",
			"spec",
			"architecture",
		],
		labels: {
			"github-app": "Connecting GitHub",
			"track-triage": "Triaging Track issues",
			"track-work": "Working on Track issues",
			"docker-sandboxes": "Docker cloud sandboxes",
			spec: "Product spec",
		},
	},
	{
		key: "id",
		repo: "id",
		name: "Gateweave ID",
		summary:
			"An OpenID Connect provider with passkeys and access rules: one sign-in for Gateweave's products and your own apps.",
		pages: [
			"connect-an-app",
			"recipes",
			"cloudflare-access",
			"self-hosting",
			"conformance",
			"architecture",
		],
		labels: {
			"cloudflare-access": "Cloudflare Access",
			conformance: "OpenID conformance",
			"recipes/gitea": "Gitea",
			"recipes/grafana": "Grafana",
			"recipes/outline": "Outline",
		},
	},
	{
		key: "mail",
		repo: "mail",
		name: "Gateweave Mail",
		summary:
			"Mailboxes for people and AI agents on one Cloudflare Worker. Early: it is not on Gateweave Cloud yet.",
		pages: ["self-hosting", "architecture"],
	},
];
