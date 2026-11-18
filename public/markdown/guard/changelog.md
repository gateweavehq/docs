# Guard changelog

Notable changes to Gateweave Guard, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org). Until 1.0, any release may change how things work:
read its entry before updating a self-hosted copy.

Each version's [GitHub release](https://github.com/gateweavehq/guard/releases) carries the same
notes. Publishing a release deploys it.

## [0.3.2] - 2026-11-16

Puts back a guard that v0.3.1 dropped by mistake. There is no migration in this release.

### Fixed

- **A server function's request from another origin is refused again.** The framework refuses
  such a request unless the browser says it comes from the app's own origin. v0.3.1 added a file
  that replaced the framework's default without listing that guard, so for a few hours it did not
  run. Guard's server functions only read, and what changes anything goes through routes with
  their own origin check, so nothing could be changed through the gap; a link on another site
  could have run a read whose answer only the person's own browser saw.
  ([#22](https://github.com/gateweavehq/guard/pull/22))

### If you run your own

- **If you run v0.3.1, update.**

## [0.3.1] - 2026-11-16

A database read that fails in passing is asked again instead of becoming an error, and a query
that fails for good no longer logs or answers with its values. There is no migration in this
release.

### Fixed

- **An error because one database read failed.** When a single read from D1 failed, a page, a
  scan step or an assistant's call was an error although asking again would have worked. A plain
  read (one `SELECT` statement) that fails with one of the errors Cloudflare documents as passing
  is now sent up to three times, a moment apart. Writes, batches and any other error are sent
  once, as before. ([#20](https://github.com/gateweavehq/guard/pull/20))
- **A failed database query no longer carries its values.** When a query failed for good, the
  error held the statement and its values. Replacing a connection's token could log the token in
  its encrypted form with its last four characters, a failed read of a session or a refresh token
  was logged with its value, and `/mcp` could answer an assistant with the database's own
  message. A failure now carries a reference only. The log has the kind of failure and the
  statement without its values under the same reference; a page shows a plain sentence with it.
  To see whether a server ever logged one, search its logs for `Failed query:`.
  ([#20](https://github.com/gateweavehq/guard/pull/20))

### If you run your own

- **Nothing to do.** If a page shows a reference, the line with the same reference in the
  Worker's logs says what failed.

## [0.3.0] - 2026-11-14

A person can see the AI assistants they allowed and take one back, effective at once.

### Added

- **Assistants you allowed.** Settings, AI assistant, lists each app the person let act as them:
  the name it gave itself, where it goes ("an app on this computer" for one on their own machine),
  when it was allowed and last used. "Take back" ends its access at once: its tokens and the
  consent go, and `/mcp` checks the consent on every call, so even an access token that hasn't
  expired is refused, and the app has to ask again. Every role sees it.
  ([#17](https://github.com/gateweavehq/guard/pull/17))

### Changed

- The daily clean-up also deletes OAuth clients that registered themselves more than a day ago and
  that nobody allowed. ([#17](https://github.com/gateweavehq/guard/pull/17))

### If you run your own

- Nothing to do: no migration and no new setting.

## [0.2.0] - 2026-11-14

Guard can now be used from an AI assistant. A person pastes Guard's `/mcp` address into Claude
Code, Claude or any assistant that speaks MCP, signs in and allows it, and the assistant can read
their findings and traffic, and do what their role lets them on the pages.

### Added

- **An MCP server at `/mcp`.** Signed in through OAuth, with no key to copy: the assistant
  registers itself, the person signs in and sees a consent page that names the app and where the
  grant goes. A token acts as the person who allowed it, in every workspace they belong to, and
  each call checks their membership. Tools: `list_workspaces`, `list_findings` (the page's
  filters, with a cursor), `get_finding`, `traffic_summary`, and for owners and admins
  `dismiss_finding` (with a reason) and `start_scan`. No answer carries a token, its hint or a
  rule's expression. Session cookies are never accepted there, and calls are rate limited per
  person and app. Settings has an "AI assistant" tab with the address and the `claude mcp add`
  line. ([#15](https://github.com/gateweavehq/guard/pull/15))

### If you run your own

- The migration `0009_mcp_oauth.sql` adds the tables of the OAuth plugins; `pnpm run deploy`
  applies it.
- `/mcp` is on only when `BETTER_AUTH_URL` is set to the address people open Guard at. See
  [docs/self-hosting.md](/guard/self-hosting/).

## [0.1.0] - 2026-11-14

The first release of Gateweave Guard: security in one place for teams on Cloudflare. It reads a
Cloudflare account and GitHub repositories with read-only tokens, shows what is wrong, what
protects each zone and what got blocked, tells people when something new and serious appears, and
turns a finding into an issue in Gateweave Track. It never changes a setting, a rule or a file.

### Added

- **Workspaces and sign-in.** Email and password, or an OpenID Connect provider such as Gateweave
  ID; workspaces with owners, admins and members; invitations; a deployment owner who decides who
  may make an account. ([#1](https://github.com/gateweavehq/guard/pull/1))
- **Connections and findings.** A Cloudflare account connects with a read-only API token (Account
  and Zone Security Center Insights Read, Zone Analytics Read), a GitHub repository with a
  fine-grained token that reads Contents. Tokens are checked, sealed with `SECRETS_KEY` and never
  shown again. Scans run every day and on "Scan now", and list Security Insights and known
  vulnerabilities in pnpm and npm lockfiles (from OSV) as findings by severity, which close by
  themselves when a scan no longer sees them.
  ([#2](https://github.com/gateweavehq/guard/pull/2), [#4](https://github.com/gateweavehq/guard/pull/4),
  [#5](https://github.com/gateweavehq/guard/pull/5))
- **Traffic.** Daily counts of what the WAF and bot protection stopped or challenged in each zone,
  by action, rule, country and host, kept 90 days, with a finding when a zone's WAF stops far more
  than usual. Never IPs, user agents or paths.
  ([#7](https://github.com/gateweavehq/guard/pull/7))
- **Protection.** What protects each zone, in plain words: WAF managed rules, custom rules and what
  each did, rate limiting, Bot Fight Mode and Under Attack mode, with "Fix in Cloudflare" links and
  an overview across zones. Three more read permissions turn it on; a rule's expression is never
  stored. ([#9](https://github.com/gateweavehq/guard/pull/9), [#11](https://github.com/gateweavehq/guard/pull/11))
- **Alerts.** A count of new findings in the sidebar, an email for new critical and high findings
  (at most one an hour per workspace), a weekly summary on Mondays, switches in Settings and a
  one-click unsubscribe. ([#10](https://github.com/gateweavehq/guard/pull/10))
- **From a finding to work.** Connect a Gateweave Track workspace with an agent member's key, and
  "File in Track" makes one issue per finding; for a dependency with a fixed version, "Ask Agents
  for a fix" adds the label a Gateweave Agents trigger watches.
  ([#12](https://github.com/gateweavehq/guard/pull/12))

### If you run your own

- See [docs/self-hosting.md](/guard/self-hosting/): it needs Workers Paid, a D1 database and, to
  connect anything, `SECRETS_KEY`. Keep a copy of `SECRETS_KEY` outside Cloudflare: without it, the
  tokens in the database and its backups cannot be opened.
