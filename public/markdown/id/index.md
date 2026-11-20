# Gateweave ID

<p align="center">
  <a href="https://gateweave.com/id"><strong>See what it does</strong></a> ·
  <a href="#running-your-own"><strong>Deploy your own</strong></a> ·
  <a href="/id/connect-an-app/">Connect an app</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/id/images/signin-dark.gif">
  <img src="/id/images/signin-light.gif" alt="A browser signs in to Grafana with Gateweave ID. After the password, a page asks whether to allow Grafana, lists what it will see and says which workspace's admin added it. Back in Grafana, the profile shows the role Admin, which came from a group in that workspace.">
</picture>

<p align="center">
  A real sign-in to Grafana against ID's staging server, with the time spent loading cut out.
  Which role someone gets depends on the groups they are in.
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/gateweavehq/id"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>
</p>

It runs entirely on Cloudflare: one Worker, one D1 database, a Durable Object for rate limits and a
Queue for logouts an app missed. It is meant to let people hold one account and sign in to any app
that supports OIDC.

Gateweave ID is part of [Gateweave](https://gateweave.com), the family of open-source business tools
that run on Cloudflare, next to [Gateweave Track](https://github.com/gateweavehq/track) and
[Gateweave Agents](https://github.com/gateweavehq/agents).

> **Status: early.** It is not certified. The OpenID conformance suite's Basic OP and Config OP plans
> pass, and [docs/conformance.md](/id/conformance/) says what differs and why, so check that it does
> what you need before you rely on it. [docs/architecture.md](/id/architecture/) describes what it is
> being built to be, including what is decided and what is still unproven.

## What works today

- **Accounts.** Sign up with a code sent to your email, sign in with a password, GitHub or a passkey,
  reset a password, and see an account page with its recent activity.
- **First-party apps.** Tokens for apps that a deployment registers itself. Gateweave's own products
  sign in through it, next to their own sign-in. When someone signs out of ID, an app that gave a
  back-channel logout address is told, and a logout it missed is tried again from a queue for about 20
  hours.
- **Workspaces.** People can make workspaces, invite each other and
  [connect their own apps](/id/connect-an-app/), which only that workspace's members can use. Groups
  decide who in a workspace may sign in to which app, and an app can ask for them as a `groups` claim.
  A workspace can require two-factor sign-in, and its apps then only admit people who signed in with a
  passkey, or with a password and a code.
  These apps do not hear about a sign-out yet. One of them can be
  [Cloudflare Access](/id/cloudflare-access/), which puts an internal app behind ID through a tunnel,
  with no server of your own to run. There are guides for [Grafana](/id/recipes/grafana/),
  [Gitea](/id/recipes/gitea/) and [Outline](/id/recipes/outline/), each signed in to for real.
- **Your own server.** The first account owns it. Sign-up stays closed until you open it, and while it
  is closed only people who are invited, or on your list of addresses and domains, get in. It also runs without email, with less.

## Tech stack

[TanStack Start](https://tanstack.com/start) · React 19 · Tailwind CSS 4 ·
[Better Auth](https://better-auth.com) · [Drizzle ORM](https://orm.drizzle.team) ·
Cloudflare Workers, Durable Objects and D1 · TypeScript 7 · Vitest · Biome

## Running it locally

Requirements: Node.js 24 (22+ works) and pnpm 12.

```sh
pnpm install
pnpm doctor      # checks your toolchain and setup, and explains how to fix anything missing
pnpm dev:setup   # creates .dev.vars with a random secret, migrates the local database
pnpm dev         # http://localhost:4730
```

Sign up at `/signup`. Signing up takes a code sent by email, so `pnpm dev:setup` turns email on.
Nothing is sent locally: each email is saved as a file under `apps/web/.wrangler/tmp/email`, and the
terminal that runs `pnpm dev` prints its path. The code is in the `.txt` file.

To enable "Continue with GitHub", [create an OAuth App](https://github.com/settings/applications/new)
with the callback URL `http://localhost:4730/api/auth/callback/github`, then uncomment and fill in
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.dev.vars`.

`pnpm verify` runs everything CI does: lint, types, tests and a build. See
[CONTRIBUTING.md](https://github.com/gateweavehq/id/blob/v0.16.3/CONTRIBUTING.md) and [AGENTS.md](https://github.com/gateweavehq/id/blob/v0.16.3/AGENTS.md) for how the code is organized and
what must never break.

## Running your own

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gateweavehq/id)

[docs/self-hosting.md](/id/self-hosting/) has the steps and every setting, including what you give
up without email. The first account owns a new server and sign-up closes behind it, so claim yours as
soon as it is up.

## License

[AGPL-3.0](https://github.com/gateweavehq/id/blob/v0.16.3/LICENSE). Contributors sign a [CLA](https://github.com/gateweavehq/id/blob/v0.16.3/CLA.md) once, which covers every Gateweave project.
Third-party code is listed in [THIRD_PARTY_NOTICES.md](https://github.com/gateweavehq/id/blob/v0.16.3/THIRD_PARTY_NOTICES.md). Report security
problems as [SECURITY.md](https://github.com/gateweavehq/id/blob/v0.16.3/SECURITY.md) describes.
