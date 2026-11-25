## What and why

<!-- What does this change, and why is it needed? Link the issue it closes: "Closes #123". -->

## Where the change belongs

- [ ] It does not edit a copied page. Pages under a product's folder in `src/content/docs/`, and
      `public/<product>/`, `public/markdown/` and `src/generated/`, are written by `pnpm sync`; a fix
      to their text goes to the product's own repository.

## How it was tested

<!-- Commands you ran and what you checked by hand. Screenshots help for visual changes. -->

- [ ] `pnpm verify` passes
- [ ] Changes to `scripts/` have tests in `scripts/transform.test.ts` (or a reason they do not)
