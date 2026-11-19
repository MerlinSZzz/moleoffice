# Read-only Git configuration guard

## Criterion change

**Old wording:** `tools/stable/upgrade-stable.criteria.md` said, “Git replacements and filesystem-monitor hooks cannot change that reading.” `tools/stable/stable-upgrade-evidence.criteria.md` said, “Disable Git filesystem-monitor commands during every read.”

**New wording:** Before a release Git read that can inspect or refresh a checkout, including `git status`, call `requireReadOnlyGitConfig(repository)` for that canonical repository. It runs a bounded `git config --name-only --get-regexp` query for local and included `filter.*.clean` and `filter.*.process` keys. The query uses the release read environment: `PATH`, a controlled `HOME`, a fixed locale, no system or global configuration, optional locks disabled, and replacement objects disabled. It also disables hooks and filesystem-monitor commands. A complete exit status 1 with no output means no matching filter key is configured. Exit status 0 with matching key names refuses before the caller runs `git status`. A spawn error, timeout, signal, unexpected exit or output, inaccessible configuration, or malformed configuration is unknown and refuses. The query reads and reports key names only. It does not disable filters or conversions and does not substitute another cleanliness method. It performs no fetch, index/ref write, lock, office write, or service operation.

**Why:** The synthetic probe `git-filter-probe.py`, from round 3 of wave 13q, showed that `git status` can execute a configured clean filter and write outside the repository even with optional locks disabled, hooks disabled, and `core.fsmonitor=false`. The status still reported a clean tree. A separate configuration preflight must therefore refuse filters before status runs.

## Narrow compatibility limits

- The query reads key names only. It refuses a configured clean or process key even when its value is empty, because it does not read command values to decide whether a filter could run.
- A tracked gitlink refuses the read even when the parent repository has no filters, because a parent status can inspect the child repository and run its commands.
- Any local or included promisor or partial-clone configuration key refuses the read, regardless of its value, because object reads can fetch missing objects into the repository.
- The input must be an existing absolute canonical repository root. Relative paths, paths through symlinks, and repository subdirectories refuse so the query checks the same repository the caller will read.

## Tracked gitlink criterion change

**Old wording:** A complete query with no matching clean/process filter key allows the caller to run its Git read.

**New wording:** After the config query and before any caller status read, read only bounded index object modes. Refuse when any tracked entry has mode `160000` (a Git submodule link). Do not inspect or start the child checkout.

**Why:** The supervisor's synthetic parent/submodule probe showed that `git status` can return clean while running the initialized child's configured clean filter and writing an outside marker. The guard's config query alone cannot see a filter configured only in that child.

## Partial-clone criterion change

**Old wording:** The key-name-only config query checks local and included clean/process filter keys, and a repository with no such keys and no tracked gitlinks may proceed to an object-reading Git command.

**New wording:** The bounded key-name-only config query also checks local and included `remote.*.promisor`, `remote.*.partialclonefilter`, and `extensions.partialclone` keys. Any match refuses before an object-reading Git command, regardless of the stored value.

**Why:** The supervisor's synthetic filtered `file://` clone probe showed that `git ls-tree` wrote four missing objects into the clone's object store through lazy fetch. Disabling replacement objects does not prevent that write.

## Index bound criterion change

**Old wording:** "After the config query and before any caller status read, read only bounded index object modes." The index query was bounded by the same 64 KiB as the root and config queries.

**New wording:** The index object-mode query has a bound of its own, sized by what it reads: one 6-digit mode and a newline, 7 bytes, for each tracked file. It is 16 MiB, room for about 2.4 million tracked files. The root and config queries keep 64 KiB, because they print a root or a few key names. Every mode is still checked, and a mode `160000` anywhere in the list still refuses.

**Why:** On 1 November 2026 main tracked 9,366 files, so the index query printed 65,562 bytes, past 64 KiB. spawnSync stopped it with ENOBUFS, and receipt firing 428 refused with "Git index metadata query could not be started (ENOBUFS)" before any test ran. Every stable upgrade read that takes this guard would have refused the same way. The guard refused a tree that has nothing wrong with it, only because the tree had grown.

## Proof required

Use real throwaway Git repositories and harmless synthetic clean/process commands that write markers only inside their own temporary fixture. Cover no configured filter, a local clean filter, a process filter from an included config, broken or unreadable configuration, a tracked gitlink whose child has a local clean filter, a filtered partial clone whose missing object would be lazily fetched, and an index of more tracked files than 64 KiB holds as modes, with and without a gitlink after all of them. For each guarded call, compare repository bytes, refs, and index bytes and check that filter, hook, filesystem-monitor, and lazy-fetch effects did not occur. Each test needs an unmutated control, a specific red mutation, and an exact restore, run through named-tests with this worker's run variables. Do not run tests, typecheck, or build without the supervisor's separate clear-window message.
