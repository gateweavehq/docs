---
title: Community rules
description: How contributions to Gateweave earn standing, what is never for sale, who decides, and why a pull request or issue can be closed and how to appeal.
editUrl: https://github.com/gateweavehq/docs/edit/main/src/content/docs/community-rules.md
---

These rules apply to every public Gateweave repository on
[github.com/gateweavehq](https://github.com/gateweavehq). They cover people and the agents they
work with.

## Standing

- Your standing is the public record of your merged or accepted work on GitHub. It is not stored as
  a score.
- The first version has no points, credits, leaderboards or paid promotion. Points are postponed,
  not dropped: they come back for discussion once about 25 people have had a pull request merged
  within 90 days.

## Thanks in release notes

A maintainer ends a release-note entry for a merged outside pull request with `thanks @login`.
This is only a thank-you: there are no totals or rankings. To opt out, say so on the pull request
and the maintainer leaves the mention out.

## Red lines

- Nothing that grants standing, rank, review or merge is for sale.
- No pay per pull request.
- Money never becomes standing.
- Agents never vote, moderate or sign the [CLA](https://github.com/gateweavehq/docs/blob/main/CLA.md).
  The person who opens a pull request answers for it.

## Claims

Claiming a task is the only privilege. An account, meaning a person and their agents, holds one
open claim, or three after its first merged pull request.

## Who decides

- The project owner is the maintainer of record and appoints maintainers by hand from people with
  merged work.
- Rules change by lazy consensus: a proposal on a public GitHub issue is accepted when no one
  objects within 72 hours. The project owner can veto it and gives a reason.
- Elections start once seats are contested, about 25 people have had a pull request merged within
  90 days, and someone can run appeals.

## Conduct

Moderation is based on each repository's Code of Conduct:
[Track](https://github.com/gateweavehq/track/blob/main/CODE_OF_CONDUCT.md),
[Agents](https://github.com/gateweavehq/agents/blob/main/CODE_OF_CONDUCT.md),
[ID](https://github.com/gateweavehq/id/blob/main/CODE_OF_CONDUCT.md),
[Mail](https://github.com/gateweavehq/mail/blob/main/CODE_OF_CONDUCT.md),
[Guard](https://github.com/gateweavehq/guard/blob/main/CODE_OF_CONDUCT.md),
[Backup](https://github.com/gateweavehq/backup/blob/main/CODE_OF_CONDUCT.md),
[Docs](https://github.com/gateweavehq/docs/blob/main/CODE_OF_CONDUCT.md),
[Forms](https://github.com/gateweavehq/forms/blob/main/CODE_OF_CONDUCT.md),
[Status](https://github.com/gateweavehq/status/blob/main/CODE_OF_CONDUCT.md),
[Runner](https://github.com/gateweavehq/runner/blob/main/CODE_OF_CONDUCT.md) and
[CLI](https://github.com/gateweavehq/cli/blob/main/CODE_OF_CONDUCT.md).

## Closes and appeals

Every close, and every withdrawn privilege, names one reason from this list and its appeal path. A
withdrawn privilege never erases merged work. Unless the reason says otherwise, appeal by
commenting on the closed pull request or issue.

| Reason | Appeal |
| --- | --- |
| Out of scope | Show how it fits the project's stated scope, or propose a change of scope in a new issue. |
| Duplicate | Show how it differs from the item it duplicates. |
| Claimed by someone else | If the claim is wrong, or has expired, say so in a comment and ask the project owner to reopen the item. A claim lapses after 7 days without a linked pull request, and the project owner can override a claim. |
| Checks fail | Fix the failure and push, or show that the change did not cause it. |
| Misses the brief | Point to the part of the brief it meets, or ask for the brief to be made clearer. |
| Author cannot explain the change | Answer the review questions in the thread yourself. |
| Breaks the Code of Conduct | Write to the address in the Code of Conduct, conduct@gateweave.com, not in public. |
