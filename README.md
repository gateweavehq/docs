# Gateweave Docs

The source of [docs.gateweave.com](https://docs.gateweave.com): one site for the docs of
Gateweave's products, built with [Starlight](https://starlight.astro.build) and served as static
files by a Cloudflare Worker.

The docs themselves are written in each product's repository, not here. `pnpm sync` copies the
`README.md`, `CHANGELOG.md` and `docs/` of [Track](https://github.com/gateweavehq/track),
[Agents](https://github.com/gateweavehq/agents), [ID](https://github.com/gateweavehq/id),
[Mail](https://github.com/gateweavehq/mail), [Guard](https://github.com/gateweavehq/guard), and
[Backup](https://github.com/gateweavehq/backup) at their latest release (or `main` until a product
has one) and rewrites their links for this site. Fix a page in its product's repository and it
arrives here with the next sync.

## Layout

| Path                     | What lives there                                                    |
| ------------------------ | ------------------------------------------------------------------- |
| `scripts/products.ts`    | The products, and the order and labels of their pages               |
| `scripts/sync.ts`        | Reads each repository and writes the pages (`pnpm sync`)            |
| `scripts/transform.ts`   | Titles, descriptions and links, with tests beside it                |
| `src/content/docs/`      | The home page, the 404 page and the copied pages (one folder each)  |
| `src/generated/`         | What the last sync read: versions and the sidebar                   |
| `public/<product>/`      | Images copied from a product's `docs/`                              |
| `src/components/`        | Starlight overrides: the title says which version a page describes  |
| `public/markdown/`        | Same-site Markdown for each copied page and its copy action          |

Everything under a product's folder in `src/content/docs/` and `public/`, `public/markdown/`, and `src/generated/`,
is written by `pnpm sync`: don't edit it by hand.

## Commands

Node.js 24 and pnpm 12.

| Command          | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm install`   | Install dependencies                                               |
| `pnpm dev`       | Run the site on http://localhost:4730                              |
| `pnpm sync`      | Copy the products' docs again (`GITHUB_TOKEN` raises GitHub's limit) |
| `pnpm verify`    | Lint, type-check, test and build                                   |
| `pnpm preview`   | Build and serve it as the Worker does, on port 4730                |
| `pnpm run deploy`| Build and deploy to Cloudflare                                     |

## How it updates

- **Every day**, and by hand from the Sync workflow after a release, GitHub Actions runs
  `pnpm sync`. When a page changed, it commits the change to `main` and deploys.
- **Every push to `main`** that passes CI deploys.

## Licence

[AGPL-3.0](LICENSE), as the products are.
