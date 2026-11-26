---
title: "What's new"
description: "The latest five releases of each Gateweave product, with their dates, links to the releases and upgrade notes."
editUrl: false
---

The latest 5 releases of each Gateweave product, newest first. Under a release, the note for people who run their own copy says what to do when updating. Follow along with the [Atom feed](/changelog.xml).

## Gateweave Track

- 2026-11-26 · [v0.51.0](https://github.com/gateweavehq/track/releases/tag/v0.51.0)

  - **The protocol stays at 31.** Open tabs keep their copy.
  - **Two workspace migrations** (`0041` and `0042`) run on their own when each workspace wakes.
    They add the reopen count to signals and the tables that keep panels. There is no D1 migration.
  - **Nothing to set.** Upload addresses are signed with your existing `BETTER_AUTH_SECRET` and the
    files go to the existing `FILES` bucket. Without a `FILES` bucket, `attach_file` answers that
    this Track keeps no files.
  - **Rolling back to 0.50.0** works, since it ignores the new columns and tables. The three panel
    tools and `attach_file` go away, and an open panel is not revealed until you update again.

- 2026-11-25 · [v0.50.0](https://github.com/gateweavehq/track/releases/tag/v0.50.0)

  - **The protocol goes from 30 to 31.** Open tabs reload and sync again.
  - **Two workspace migrations** (`0039` and `0040`) run on their own when each workspace wakes.
    They add the repository to signals and fill it in for attempts claimed before.
  - **Rolling back to 0.49.0** works, since it ignores the new column. Attempts claimed meanwhile
    have no repository after you update again, so the filter leaves them out.

- 2026-11-25 · [v0.49.0](https://github.com/gateweavehq/track/releases/tag/v0.49.0)

  - **Nothing to do.** There is no protocol, migration or setting change. Rolling back to 0.48.0
    only takes the page away.

- 2026-11-25 · [v0.48.0](https://github.com/gateweavehq/track/releases/tag/v0.48.0)

  - **Nothing to do.** There is no protocol, migration or setting change, and rolling back to
    0.47.1 only takes the row and the lookup away.

- 2026-11-25 · [v0.47.1](https://github.com/gateweavehq/track/releases/tag/v0.47.1)

  - **The protocol goes from 29 to 30.** Open tabs reload and sync again.
  - **Two workspace migrations** (`0037` and `0038`) run on their own when each workspace wakes.
    They add the attempt number to signals and fill it in for attempts claimed before.
  - **Rolling back to 0.47.0** works, since it ignores the new column. Attempts claimed meanwhile
    keep going by their ID after you update again.

[Full Gateweave Track changelog](/track/changelog/)

## Gateweave Agents

- 2026-11-26 · [v0.35.1](https://github.com/gateweavehq/agents/releases/tag/v0.35.1)

  - **Update.** There is no migration. If the usage dataset is bound, each run's point gains
    `double10` to `double13` after the existing fields, so queries that name the earlier fields
    keep working. "Usage across workspaces" in `docs/self-hosting.md` has a query that sums the
    counts by workspace and agent.

- 2026-11-26 · [v0.35.0](https://github.com/gateweavehq/agents/releases/tag/v0.35.0)

  - **Update.** `pnpm run deploy` applies the D1 migration (`0013_workspace_deletion`, a new table)
    before the new code goes live. The four registry migrations (`0046` to `0049`: three new tables
    and three nullable columns) are in each workspace's registry and run by themselves when the
    workspace is next used; there is no step for you.
  - **Data left by earlier deletions.** From the first daily run after the update, a workspace
    that is gone but still has a location row is taken as deleted, and its objects are deleted.
  - **`TARGET_RULE` still defaults to `log`.** A call with a destination the agent learned only
    from outside content runs, and the run page counts it. Refusing such calls by default moves to
    a later release; to refuse them now, set `enforce`, as "Tool destinations" in
    `docs/self-hosting.md` says.
  - **`SANDBOX_IDLE_MINUTES`** is optional: unset or mistyped it is 5, and it takes a number above
    0 and up to 300. Set `15` to keep the old behaviour.
  - **Track run reporting** needs a Track that takes run reports, 0.47.0 or later. A report links
    to the run's page only when `BETTER_AUTH_URL` is set.

- 2026-11-20 · [v0.34.0](https://github.com/gateweavehq/agents/releases/tag/v0.34.0)

  - **Update.** The migration is in each workspace's registry and runs by itself when the
    workspace is next used; there is no step for you.
  - **`TARGET_RULE`** decides what happens to a flagged call: `log`, the default in this release,
    records it, and `enforce` refuses it. To refuse now, set `enforce`; see "Tool destinations" in
    `docs/self-hosting.md`.

- 2026-11-20 · [v0.33.0](https://github.com/gateweavehq/agents/releases/tag/v0.33.0)

  - **Update.** The migration is in each workspace's registry and runs by itself when the workspace
    is next used; there is no step for you.
  - **Old copies.** From a week after a move, the daily run erases the old copies, at its next
    run; a copy it could not erase is tried again the day after. A deployment that never
    moved its objects into a jurisdiction has nothing to erase.

- 2026-11-19 · [v0.32.0](https://github.com/gateweavehq/agents/releases/tag/v0.32.0)

  - **Update.** Nothing else to do: no migration, variable or secret.

[Full Gateweave Agents changelog](/agents/changelog/)

## Gateweave ID

- 2026-11-19 · [v0.16.3](https://github.com/gateweavehq/id/releases/tag/v0.16.3)

  - **Update.** Migrations `0020` and `0021` add the outbox table. A deploy applies them before the
    new code, and the previous version runs fine on them.
  - **A second cron.** The Worker now also runs every five minutes (`*/5 * * * *`), next to the
    daily run. A deployment without the `LOGOUTS` queue keeps its old behavior: a refused handoff
    is logged.

- 2026-11-18 · [v0.16.2](https://github.com/gateweavehq/id/releases/tag/v0.16.2)

  - **Update.** No database migration, new secret or environment variable is required.

- 2026-11-18 · [v0.16.1](https://github.com/gateweavehq/id/releases/tag/v0.16.1)

  - **Update.** If an app you registered signs in from a development machine, check that its
    callback is registered with the exact host and port it uses.

- 2026-11-16 · [v0.16.0](https://github.com/gateweavehq/id/releases/tag/v0.16.0)

  - **Update.** Nothing to set.
  - "Products you use" lists the apps registered with `apps:add` that the account has signed in to,
    each with a link to the origin of its first `https` redirect address.

- 2026-11-16 · [v0.15.2](https://github.com/gateweavehq/id/releases/tag/v0.15.2)

  - **Update.**

[Full Gateweave ID changelog](/id/changelog/)

## Gateweave Mail

- 2026-11-20 · [v0.4.0](https://github.com/gateweavehq/mail/releases/tag/v0.4.0)

  - **Update.** Two D1 migrations (`0027_agent_any_recipient`, `0028_agent_webhook_hosts`), which
    `pnpm run deploy` applies before the new code goes live. Each mailbox upgrades its own storage
    when it is next used.
  - **Older mailboxes.** A mailbox that holds mail from before Mail indexed every sender checks
    that mail's sender against the stored original before trusting it. While a check cannot
    finish, a send to that sender answers 503 for up to an hour, then the sender counts as unknown.
  - **An agent under "Never" that wrote to addresses outside these three kinds** is refused for
    those addresses from now on; addresses already on its allowed list still work. Add the others
    to its list, or turn on "Allow any recipient and webhook host" for it.

- 2026-11-19 · [v0.3.0](https://github.com/gateweavehq/mail/releases/tag/v0.3.0)

  No migration, variable or secret. Deploy as usual.

- 2026-11-19 · [v0.2.2](https://github.com/gateweavehq/mail/releases/tag/v0.2.2)

  No migration, variable or secret. Deploy as usual.

- 2026-11-19 · [v0.2.1](https://github.com/gateweavehq/mail/releases/tag/v0.2.1)

  No migration, variable or secret. Deploy as usual.

- 2026-11-18 · [v0.2.0](https://github.com/gateweavehq/mail/releases/tag/v0.2.0)

  - One D1 migration (`0026_agent_policy_approval.sql`, a nullable column), which `pnpm run deploy`
    applies before the new code goes live. No new setting.
  - The `send_email`, `reply` and `send_template` operations answer "sent" or "held" as before; the
    skill in the Claude Code plugin says what becomes of a message under each policy.

[Full Gateweave Mail changelog](/mail/changelog/)

## Gateweave Guard

- 2026-11-20 · [v0.6.1](https://github.com/gateweavehq/guard/releases/tag/v0.6.1)

  No migration, variable or secret. Deploy as usual. The hourly run logs `reports:` with how many
  connections it reported for and how many events it sent.

- 2026-11-20 · [v0.6.0](https://github.com/gateweavehq/guard/releases/tag/v0.6.0)

  - `pnpm run deploy` applies the D1 migration (`0011_track_connect`).
  - **Connect Track needs Track 0.45.0 or later,** and Guard served over HTTPS. Against an older
    Track, keep pasting source keys.
  - **If you are rotating `SECRETS_KEY`,** wait for a `settled=true` line from this version before
    removing the previous key: a line from an older version does not count.

- 2026-11-20 · [v0.5.0](https://github.com/gateweavehq/guard/releases/tag/v0.5.0)

  - `pnpm run deploy` applies the D1 migration (`0010_track_sources`).
  - Reporting needs Track 0.44.0 or later. Against an older Track, every event gets a 404, and
    after seven days Guard stops sending for that connection until a new key is pasted.

- 2026-11-19 · [v0.4.1](https://github.com/gateweavehq/guard/releases/tag/v0.4.1)

  No migration, variable or secret. Deploy as usual.

- 2026-11-19 · [v0.4.0](https://github.com/gateweavehq/guard/releases/tag/v0.4.0)

  - **Update.** No migration, variable or secret is needed.
  - **A copy made with the Deploy button** can take this release with the commands under
    "Updating" in `docs/self-hosting.md`. They run the script from Guard's repository, so the copy
    does not need it first.

[Full Gateweave Guard changelog](/guard/changelog/)

## Gateweave Backup

There is no release yet. [Its changelog](/backup/changelog/) says what changed on `main`.
