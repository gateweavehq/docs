# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. It is the single source
of truth for how the repository works; other tool-specific files only add to it.

## The project

This repository builds [docs.gateweave.com](https://docs.gateweave.com): one
[Starlight](https://starlight.astro.build) site for the docs of Gateweave's six products (Track,
Agents, ID, Mail, Guard and Backup). Every page is prerendered, and a Cloudflare Worker serves
the files as static assets; there is no Worker code.

The docs are not written here. Each product keeps its docs in its own repository under
github.com/gateweavehq, and `pnpm sync` copies them in.

## How the sync pulls each product's docs

`scripts/sync.ts` goes through the products listed in `scripts/products.ts`. For each one it:

1. Asks GitHub for the repository's latest release and reads the files at that tag, or at `main`
   while the product has no release.
2. Takes `README.md` (the overview page), `CHANGELOG.md` and every `docs/**/*.md` as pages, and
   every other file under `docs/` (images) as an asset.
3. Passes each page through `scripts/transform.ts`: title, description, and links, so that links
   between products and to copied files stay on this site and links to code point at the
   version read.
4. Writes pages to `src/content/docs/<product>/`, assets to `public/<product>/`, plain Markdown
   copies to `public/markdown/<product>/`, and the versions read and the sidebar to
   `src/generated/`.

It deletes and rewrites each product's folders on every run. The Sync workflow runs it daily and
by hand; when something changed it runs `pnpm verify`, commits to `main` and starts the Deploy
workflow.

## What may be edited here, and what may not

| Path | Edit here? |
| --- | --- |
| `src/content/docs/<product>/`, `public/<product>/`, `public/markdown/`, `src/generated/` | No. Written by `pnpm sync`; a hand edit is lost on the next run. Fix the page in the product's repository. |
| `scripts/products.ts` | Yes: which products, their summaries, and the order and labels of their pages. A page not listed there still appears, at the end, with a warning from the sync. |
| `scripts/sync.ts`, `scripts/transform.ts` | Yes, with a test in `scripts/transform.test.ts`. |
| `src/content/docs/index.mdx`, `agent-setup.mdx`, `community-rules.md`, `404.md` | Yes: the pages that belong to this site. |
| `src/components/`, `src/styles/`, `src/assets/`, `astro.config.ts` | Yes: the site's look and behavior. |
| `public/_headers`, `public/robots.txt`, `public/favicon.svg`, `public/apple-touch-icon.png` | Yes. |
| `.github/workflows/`, `wrangler.jsonc` | Yes, carefully: Deploy runs from `main` with the Cloudflare token. |

When a task is "this page says something wrong", find the file the page came from (every page
links to its source and has an edit link to it on GitHub) and change it in that product's
repository.

## Commands

Node.js 24 and pnpm 12 (`packageManager` in `package.json`).

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Run the site on http://localhost:4730 |
| `pnpm sync` | Copy the products' docs again (set `GITHUB_TOKEN` to raise GitHub's limit) |
| `pnpm check` | Biome lint and format, and Astro's type check (`pnpm format` fixes most Biome findings) |
| `pnpm test` | Run the tests for `scripts/` |
| `pnpm build` | Build the site into `dist/` |
| `pnpm verify` | Everything CI runs: check, test, build |
| `pnpm preview` | Build and serve it as the Worker does, on port 4730 |
| `pnpm run deploy` | Build and deploy to Cloudflare (CI does this; needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`) |

Run `pnpm verify` before you consider a change done. `pnpm sync` needs network access to GitHub
and changes many files; do not run it as part of an unrelated change.

## Conventions

- `wrangler.jsonc` holds no account id. Wrangler reads `CLOUDFLARE_ACCOUNT_ID` from the
  environment; the Deploy workflow sets it from the repository's `CLOUDFLARE_ACCOUNT_ID` Actions
  variable, and locally you set it yourself or log in with `wrangler login`.
- Never commit a secret, token or `.dev.vars`/`.env` file.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org). The sync's own
  commits are `docs: sync from the products' repositories`.
- Pull requests are reviewed and merged by a maintainer; the repository's CLA applies (see
  [CONTRIBUTING.md](CONTRIBUTING.md)).
