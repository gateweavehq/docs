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
	 * The page slugs in each sidebar group, in display order. A directory name (`recipes`) puts
	 * its pages in a nested group. Unlisted pages appear at the end of Guides.
	 * A `quickstart` page goes right after Overview automatically.
	 */
	groups: { concepts?: string[]; guides?: string[]; reference?: string[] };
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
		groups: {
			concepts: ["ecosystem", "roadmap", "architecture"],
			guides: ["self-hosting", "recipes"],
			reference: ["mcp"],
		},
		labels: {
			ecosystem: "The Gateweave ecosystem",
			"recipes/notes-to-issues": "Meeting notes into issues",
			"recipes/project-update": "Weekly project update",
			"recipes/triage-intake": "Triage an intake",
		},
	},
	{
		key: "agents",
		repo: "agents",
		name: "Gateweave Agents",
		summary:
			"See which coding agents work in which repositories, share their setups, run your own agents and keep a wiki of each repository.",
		groups: {
			concepts: ["memory", "spec", "architecture"],
			guides: [
				"first-pull-request",
				"self-hosting",
				"github-app",
				"track-triage",
				"track-work",
				"docker-sandboxes",
				"recipes",
			],
			reference: ["mcp"],
		},
		labels: {
			"github-app": "Connecting GitHub",
			"track-triage": "Triaging Track issues",
			"track-work": "Working on Track issues",
			"docker-sandboxes": "Docker cloud sandboxes",
			"recipes/ask-the-wiki": "Ask a repository's wiki",
			"recipes/run-from-your-editor": "Run a task from your editor",
			spec: "Product spec",
		},
	},
	{
		key: "id",
		repo: "id",
		name: "Gateweave ID",
		summary:
			"An OpenID Connect provider with passkeys and access rules: one sign-in for Gateweave's products and your own apps.",
		groups: {
			concepts: ["architecture"],
			guides: ["connect-an-app", "recipes", "cloudflare-access", "self-hosting"],
			reference: ["conformance"],
		},
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
		groups: {
			concepts: ["architecture"],
			guides: ["self-hosting"],
			reference: ["mcp"],
		},
	},
	{
		key: "guard",
		repo: "guard",
		name: "Gateweave Guard",
		summary:
			"See Cloudflare and repository security findings in one place, then connect them to Track issues and Agents fixes.",
		groups: {
			concepts: ["architecture"],
			guides: ["self-hosting"],
		},
	},
	{
		key: "backup",
		repo: "backup",
		name: "Gateweave Backup",
		summary: "Scheduled, encrypted backups for Cloudflare data, with automatic restore tests.",
		groups: {
			concepts: ["architecture"],
			guides: ["deploy", "restore", "app-entrypoint"],
			reference: ["format"],
		},
		labels: { "app-entrypoint": "Backing up an app's Durable Objects" },
	},
];

export interface EntryPoint {
	path: string;
	title: string;
	use: string;
}

export const entryPoints: EntryPoint[] = [
	{
		path: "/markdown/track/index.md",
		title: "Gateweave Track overview",
		use: "what Track is and what it does, before you touch it",
	},
	{
		path: "/markdown/track/quickstart.md",
		title: "Quickstart: Track on your own Cloudflare account",
		use: "deploy Track to your own Cloudflare account from a fresh clone, with no custom domain",
	},
	{
		path: "/markdown/agents/quickstart.md",
		title: "Quickstart: Agents on your own Cloudflare account",
		use: "run Agents on your own Cloudflare account and get your first answer through Workers AI",
	},
	{
		path: "/markdown/agents/first-pull-request.md",
		title: "From zero to a first pull request (Agents)",
		use: "the route from an empty Cloudflare account to an agent that opens a pull request",
	},
	{
		path: "/markdown/id/connect-an-app.md",
		title: "Connect an app to Gateweave ID",
		use: "add OpenID Connect sign-in to your own app",
	},
	{
		path: "/markdown/backup/restore.md",
		title: "Restoring a backup",
		use: "restore Cloudflare data from an encrypted backup",
	},
	{
		path: "/markdown/guard/self-hosting.md",
		title: "Self-hosting Guard",
		use: "run Guard and connect Cloudflare accounts and repositories",
	},
	{
		path: "/markdown/mail/quickstart.md",
		title: "Quickstart: Mail on your own Cloudflare account",
		use: "set up Mail on your own Cloudflare account with an address on a domain verified by a TXT record",
	},
];

export function entryPointsMarkdown(origin: string): string {
	return [
		"## Recommended entry points",
		"",
		...entryPoints.map(({ path, title, use }) => `- [${title}](${origin}${path}): ${use}`),
	].join("\n");
}

export const llmsNotes: string = [
	"## Which file to use",
	"",
	"- `/llms.txt` (this file) is the index and lists the recommended entry points.",
	"- `/llms-small.txt` is a compact tour of the products' usage pages without changelogs or architecture notes, for small context windows.",
	"- `/llms-full.txt` has every page, including changelogs and architecture notes. Use it when the answer needs them.",
	"- The sets listed below include one per product plus Community rules. Each product set contains only that product's pages. Use it for tasks about a single product.",
	"- Every product page also has a Markdown copy at `/markdown/<product>/<page>.md`.",
].join("\n");
