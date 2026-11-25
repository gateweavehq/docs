# Security policy

## Supported versions

This repository builds [docs.gateweave.com](https://docs.gateweave.com). Security fixes go into
`main`, which is what the site serves. The products' own code is in their own repositories, each
with its own security policy; report a problem in a product there.

## Reporting a vulnerability

Please report vulnerabilities privately, never in a public issue or pull request.

- Preferred: [open a private security advisory](https://github.com/gateweavehq/docs/security/advisories/new)
  on GitHub.
- Or email **security@gateweave.com**.

Include what an attacker could do, the steps to reproduce it, and the affected page or commit.
We aim to reply within three working days, and will keep you updated while we work on a fix,
and credit you in the release notes unless you would rather stay anonymous.

## Scope

Areas where reports are especially valuable:

- Script or HTML injection through a copied product page, the sync's link and image rewriting, or
  the Markdown and copy actions on a page.
- Anything in the sync or deploy workflows that lets a pull request, a fork or a product's
  repository change what is deployed without review, or read a secret.
- Credentials or private data committed to this repository.

Wrong or outdated documentation is not a security report: open an issue, or fix it in the product's
repository (see [CONTRIBUTING.md](CONTRIBUTING.md)).
