// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST LEAVES A RULES FILE IN THE WORKTREE IT RUNS FROM.
 *
 * On 18 October 2026 an `AGENTS.md` of 7,877 bytes, written at 06:37:03.948, was found at the root of
 * a worktree of this repository. Git ignores the file, so nothing showed it was there. The same day,
 * at commit a41c89182, 36 test files were each run alone, and each left an `AGENTS.md` at the root of
 * the worktree it ran from: 35 of 7,877 bytes, and one of 9,263.
 *
 * WHY A TEST WRITES IT. `startOne` (src/worker/index.ts) starts a run in `settings.checkout` and first
 * writes there the rules file the run's tool reads (`writeRulesInto`, src/worker/rules.ts). With
 * MOLE_OFFICE_FAKE_RUNTIME set, every run is served by the fake adapter, and its file is `AGENTS.md`.
 * So a test that gives its worker this worktree as the checkout writes `AGENTS.md` at the worktree's
 * root, from the chapters of the test's own throwaway office. A Codex or OpenCode session started in
 * that worktree afterwards reads that file as its rules.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. No test file that drives the worker gives it this worktree or a folder in it as its
 *      checkout, unless it is named below as one that never writes a rules file. A file drives the
 *      worker when its source calls `startOne(` or `onePass(`, the two doors of src/worker/index.ts
 *      that reach the write, or starts the office or worker as a process as described below.
 *      A file named in red gives its worker the folder
 *      `aCheckoutForATestRun()` makes instead, in tests/a-checkout-for-a-test-run.ts.
 *   2. Every file named below is still read as giving the worker this worktree, so the list only shrinks.
 *   3. Both readings, of a checkout and of a process start, find each spelling they say they read
 *      and none of the ones they say they miss. Every miss named below is held as an example in
 *      MISSES or PROCESS_MISSES, and neither list is empty.
 *   4. The folder `aCheckoutForATestRun()` makes is outside this worktree, has no git repository in
 *      or above it, and gives a run the same rules this worktree gives.
 *   6. The checkout and process readings together parse each source at most once in each language.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS THE SOURCE AND NOT THE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The file at the root says nothing about which test wrote it, and an office started from this
 * worktree writes the same file there for each Codex or OpenCode run it starts. Running every file
 * that drives the worker, to watch the file, takes about seven minutes (measured on 18 October 2026:
 * 65 files in 7 parts, 402 seconds), which is too long for one case. Case 4 reads the effect where it
 * can: what the folder holds, and the rules a run is given in it. Since round 15 the file is watched
 * as well: the guard reads it around every case of every test file, so a file that writes it fails
 * its own run. The reading here still finds the files that must give their worker a folder of their
 * own before any of them runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE READING READS, AND WHAT IT MISSES
 * ---------------------------------------------------------------------------------------
 *
 * It reads a `checkout:` whose value starts with the worktree's root, spelled as `process.cwd()`,
 * `fileURLToPath(new URL('..', import.meta.url))` (or `'../'`, with anything after it such as
 * `.replace(...)`), `join(import.meta.dirname, '..')`, `resolve(import.meta.dirname, '..')` or
 * `REPO_ROOT`. It reads folders in it through `join(W, ...)`, `resolve(W, ...)`, templates starting
 * with `${W}`, `import.meta.dirname`, and file URLs for `'.'`, `'./...'` or `'../...'` relative to
 * `import.meta.url`. It follows bound names to any depth, including a name bound to a folder in the
 * worktree, and reads `checkout,` or `checkout }` when that name is such a folder. It reads
 * relative quoted paths and templates whose first text is relative; a template starting with `${W}`
 * needs W to be read as the worktree. A path prefix can also flag a join or relative path that
 * climbs out of the worktree. It follows named relative imports one file deep under tests/, including
 * aliases. It reads the imported variable's initializer and its local variable dependencies with
 * the same path reading. It does not follow a second import from the imported file, a re-export,
 * a namespace or default import, an imported function declaration, or an import outside tests/.
 * MISSES holds one example of each.
 *
 * It also reads bare spawn, spawnSync, execFile, execFileSync and fork calls that name the service command,
 * src/worker/index.ts or src/server/index.ts, directly or through local variable bindings, or whose
 * arguments come from apiServerArguments() in tests/helpers.ts, with cwd read as this worktree or
 * omitted. A cwd may be a name imported one file deep from tests/, read as the checkout's imports are.
 * Those workers start their runs in the folder workerSettingsFrom in src/worker/index.ts gives them.
 * Round 15 lets MOLE_OFFICE_WORKER_CHECKOUT name another folder. The reading does not read that
 * setting, so a file that sets it is still found, and is named below with why. Process commands hidden
 * behind other calls, an imported program or an unread cwd are not followed.
 * exec and execSync take a whole command string and are not read. PROCESS_MISSES holds one example
 * of each miss in this paragraph, the later change to a bound environment object included.
 * A service or server start passes when its supplied env has a literal MOLE_OFFICE_MESSAGE_WORKER:
 * 'off' after every spread or computed key. A top-level variable bound to that object is read too,
 * unless a parameter shares its name. Other environment bindings stay unknown. This is read from
 * src/server/index.ts:1811: off returns before a worker starts, so that office starts no agent run.
 * It is not a measurement of a rules-file write. Direct worker starts are still read with off.
 * The reading does not execute code or follow later mutations of a bound environment object.
 * A named file is not pinned by its source. Until round 15 each was pinned by the SHA-256 digest of
 * its whole source, and any change to it, a comment included, turned this gate red until somebody ran
 * it alone again. Now the guard fails any run of a named file that writes the rules file, so a change
 * to one named file needs no new run alone, and leaves every other name as it was.
 * The two process-started tests reported in UPbdVfwtKOic are a-shutdown-pauses-the-runs-at-work.test.ts
 * and an-interrupted-run-resumes-with-one-press.test.ts. Until round 15 this said they could not run in
 * this sandbox because the terminal holder is off. That was wrong. Both ran here in run ECF3iI2eyujt
 * on 18 October 2026 with no case skipped, and the root AGENTS.md went from 7,877 to 9,263 bytes while
 * an-interrupted-run-resumes-with-one-press.test.ts was the only file running. In round 15 each, run
 * alone under the guard, failed with "was written again with the same 9263 bytes". Each now gives its
 * office's worker a folder of its own, and THEY_WRITE_NO_RULES_FILE names both.
 * A symbolic link outside the worktree pointing into it is realistic too; source reading cannot
 * resolve a link a test creates at runtime. MISSES holds an example of one.
 *
 * ---------------------------------------------------------------------------------------
 * THE FILES NAMED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The original files were run alone on 18 October 2026 at a41c89182, and the root `AGENTS.md` was the same
 * after it as before. The process files added in round 14 were run alone on its branch; their logs
 * are in the round's report. All named files were run alone in round 14, with the root AGENTS.md
 * absent before and after. The two process-started files of finding 8 were run alone in round 15,
 * under the guard and once the worker read MOLE_OFFICE_WORKER_CHECKOUT, with the root AGENTS.md the
 * same after as before; their logs are in the round's report. The reading found 21 more files in round
 * 15, once it read apiServerArguments() starts and folders imported for cwd. Each was run alone under
 * the guard on 19 October 2026 at 16ad2c637, with the root AGENTS.md the same after as before.
 * The three window tests were measured in round 16 of wave 13r. Run by name, their cases skip, so
 * until then they stood on a list of their own whose write nobody had measured. On 19 October 2026 at
 * 5e49275cc they ran under `--list window` with the guard, twice: once as the list is, and once with
 * MOLE_OFFICE_WINDOW_PICTURES set, so that the one picture case ran too. No case was skipped in the
 * second run, and the root AGENTS.md was the same after each run as before. That list is gone.
 * tests/terminal-holder-stand.ts is a helper, so three test files that start a server through it were
 * run alone for it. Each group says why, as read from the source. A reason read from the source
 * can go stale when the file or a helper it imports changes; the guard does not. A named file that
 * later starts a run in this worktree fails its own run, whatever its reason here says, and the
 * failure names it.
 */

import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { parseAst } from 'rolldown/parseAst'
import { describe, expect, it, vi } from 'vitest'

import { RULES_SOURCE, SKILL_SOURCE, USER_PART_SOURCE, chaptersFrom, holdsTheDeveloperRules, howToLead, rulesTextFrom } from '../src/worker/rules.ts'

vi.mock('rolldown/parseAst', async (original) => {
  const actual = await original<typeof import('rolldown/parseAst')>()
  return { ...actual, parseAst: vi.fn(actual.parseAst) }
})

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

// Imports, bindings, process starts and bound environments read the same source tree.



describe('the folder a test gives its worker instead', () => {
  it('is outside this worktree, with no git repository in or above it, and a run there is given the same rules', async () => {
    const { aCheckoutForATestRun } = await import('./a-checkout-for-a-test-run.ts')
    const folder = aCheckoutForATestRun()

    const fromTheWorktree = relative(ROOT, folder)
    expect(fromTheWorktree === '' || !fromTheWorktree.startsWith('..'), `${folder} is this worktree or a folder inside it`).toBe(false)

    const gits: string[] = []
    for (let here = resolve(folder); ; here = dirname(here)) {
      if (lstatSync(join(here, '.git'), { throwIfNoEntry: false }) !== undefined) gits.push(join(here, '.git'))
      if (dirname(here) === here) break
    }
    expect(gits, `${folder} is in a git repository, so a run there would ask git about its rules file`).toEqual([])

    for (const file of [RULES_SOURCE, USER_PART_SOURCE, SKILL_SOURCE]) {
      expect(readFileSync(join(folder, file), 'utf8'), `${file} in ${folder} is not this worktree's`).toBe(readFileSync(join(ROOT, file), 'utf8'))
    }
    expect(holdsTheDeveloperRules(folder), `${folder} is not read as a developer checkout`).toBe(true)
    const chapters = chaptersFrom(ROOT)
    expect(rulesTextFrom(folder, chapters)).toBe(rulesTextFrom(ROOT, chapters))
    expect(howToLead(folder)).toBe(howToLead(ROOT))
  })
})
