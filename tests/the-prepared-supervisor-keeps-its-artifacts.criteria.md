# The prepared supervisor start keeps its artifacts

Old: `tools/serve-dev.mjs --built` always builds the page before the first start. A checkout that
already holds a built page made from exactly this commit and tree cannot be started without a
rebuild, and a first handoff or a recovery that restores the exact prepared artifacts would rebuild
during downtime and could replace them.

New: `--built --prepared` is a second flag for the same supervisor. Plain `--built` is unchanged.
`--prepared` alone is refused with one sentence, `--prepared requires --built.`, before anything
listens. With both flags, before anything listens, serve-dev validates the existing
`dist/web/index.html` and its build stamp against this checkout:

1. the output must be there;
2. the stamp must be there and readable and must name a commit;
3. Git must resolve that commit, derive its tree, derive HEAD's tree, and read this checkout's HEAD
   — a Git failure refuses, naming what Git said, and there is no fallback;
4. the stamped commit and tree must be HEAD's commit and tree — a different commit or tree refuses,
   naming both pairs;
5. the files the page is built from, walked from `src/web/index.html`, must be whole (nothing
   unresolved or unreadable) and must be clean in Git: tracked with no uncommitted change and no
   untracked addition. The check reads commit and tree identities and the Git working-tree state; it
   does not read modification times, and it claims no byte identity from a time.

Any refusal is one sentence naming the reason, before anything listens. When the validation passes,
only the single `buildThePage` call before the first start is skipped; every later page rebuild is
unchanged, the source watches stay rooted at this checkout, and no other argv, port, redirect,
ledger, crash-restart or held-socket behaviour changes. No stamp field and no new file is added:
the stamped tree is derived from the commit the stamp already holds.

Why: the approval `gIgeyzM2_S2r`, forwarded as `tx15hfOt0Anu` in report `o7eNVeIJWuvS`,
approves `serve-dev --built --prepared` so a stable worktree's exact prepared page survives the
first handoff and recovery without a build during downtime. The refinement `l5IvD5HyPdph`
proposed the flag and the check. The validation is an explicit check made by a real prepared start;
it is not an expansion of any dry path.

The tests use an injected builder that counts calls. That is unit evidence for the call counting
and the refusals, not a rehearsal of the real `vite build`.
