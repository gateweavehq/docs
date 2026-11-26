# Contributing to Gateweave Docs

Thanks for helping out! This guide covers what can be changed in this repository and how to get a
working setup. Everyone taking part is expected to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Fix a page in the product's repository

Most of this site is not written here. Each product's pages are its own `README.md`,
`CHANGELOG.md` and `docs/`, copied from its repository by `pnpm sync` every day. A hand edit to a
copied page would be overwritten, so to fix a typo or a wrong sentence:

1. Open the page on [docs.gateweave.com](https://docs.gateweave.com) and use its edit link, which
   opens the source file in the product's repository on GitHub.
2. Send the pull request there: [Track](https://github.com/gateweavehq/track),
   [Agents](https://github.com/gateweavehq/agents), [ID](https://github.com/gateweavehq/id),
   [Mail](https://github.com/gateweavehq/mail), [Guard](https://github.com/gateweavehq/guard) or
   [Backup](https://github.com/gateweavehq/backup).

The fix reaches this site with the next sync after the product's next release (a product with no
release yet is read from `main`).

## What to change here

- The site: layout, components, styles, search, the Markdown and copy actions, `llms.txt`.
- The sync and its link rewriting: `scripts/`.
- Which products there are and the order of their pages: `scripts/products.ts`.
- The pages that belong to this site: the home page, "Agent setup", "Community rules" and the 404
  page.

Never edit these by hand, since `pnpm sync` rewrites them: the product folders in
`src/content/docs/`, `public/<product>/`, `public/markdown/` and `src/generated/`.

Open an issue first for anything large. [AGENTS.md](AGENTS.md) describes the sync and the layout
in more detail.

## Setup

Node.js 24 and pnpm 12.

```sh
pnpm install
pnpm dev         # http://localhost:4730
```

The site builds from what is already committed, so you do not need `pnpm sync` to work on it.
Run `pnpm sync` only to refresh the copied pages (it reads GitHub; `GITHUB_TOKEN` raises the rate
limit). `pnpm preview` serves the build the way the Worker does.

## Contributor License Agreement

Gateweave's projects are open source under the AGPL-3.0. The maintainer also offers them under
other terms, such as a hosted service and commercial licenses, and these help fund the projects.
So that every contribution can be part of both, contributors sign the [CLA](CLA.md) once, and it
covers every Gateweave project. You keep the copyright to your work.

A bot asks you to sign on your first pull request. To sign, reply with the sentence it gives you.

## Before you open a pull request

```sh
pnpm verify      # Biome check and Astro type check, tests, and a production build: what CI runs
```

`pnpm format` fixes most Biome findings. Fill in the pull request template. A change to
`scripts/` needs a test in `scripts/transform.test.ts`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`.

## Working with AI coding agents

You are welcome to use one. [AGENTS.md](AGENTS.md) gives agents the commands and the rules for
what may be edited. You remain responsible for the change: review it, run `pnpm verify`, and
make sure you can explain it in review.

## Reporting bugs

Open an issue using the site bug form. Report security problems privately, as described in
[SECURITY.md](SECURITY.md), never in a public issue.
