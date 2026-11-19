#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGER: ONE TOOL RUN THAT CARRIES ONE MERGE ENTRY THROUGH THE QUEUE, STEP BY STEP, WITH NO MODEL.
 *
 * Sandbox v1, piece P8 (SPEC.md sections 5.3 to 5.4, and section 6.3), under decisions
 * R3 (the queue carries a changeset, through a git adapter or a files adapter),
 * R4 (everything a program can decide is decided by a tool, the rest goes to the inspector), R6
 * (persist state first, then fast-forward, then wait for health) and R7 (the whole test suite takes
 * the office's `full-suite` seat).
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/the-merger.mjs --entry <merge entry id> --session <this tool run's session id> \
 *       [--api <url>] [--workspace <project>] [--as <actor id>] [--workdir <dir>] \
 *       [--slot-every <s>] [--slot-for <s>] [--health-for <s>] [--office-for <s>] \
 *       [--sandbox-template <name>] [--sandboxes <dir>]
 *
 *   --entry      the merge entry to carry. Required.
 *   --session    the session record of this tool run: a session whose runtime is `merge-tool`, made
 *                by the office's message worker (P9). Required, because the tool doors record it.
 *   --api        which office. Default: the one this checkout is set to.
 *   --workspace  which project the entry is in. Default: the one this checkout is set to.
 *   --as         who is knocking. Default: the office's message worker, `mole-office/the-message-worker`,
 *                which is the one identity the step and tool doors accept.
 *   --workdir    where this entry's clone, held blobs, logs and state live. Default:
 *                ~/.cache/mole-office/merge-queue/<entry id>. Chapter 3: nothing goes in the owner's home folder.
 *   --slot-every how often to ask again for the full-suite seat, in seconds. Default 10.
 *   --slot-for   the longest to wait for that seat, in seconds. Default 14400 (four hours).
 *   --health-for the longest to wait for the office to be healthy after main moved, in seconds. Default 300.
 *   --office-for the longest to wait for the office to answer at all, in seconds. Default 300.
 *   --sandbox-template  the template a git entry's sandbox is made from. Default mole-office-dev.
 *   --sandboxes  where sandbox instance folders are. Default ~/.cache/mole-office/sandboxes.
 *   --room-every how often to try a build or test again after the sandbox launcher refused it with exit 75 for want of
 *                room, in seconds. Default 60. Exit 75 means wait, never red.
 *   --pin-only   pin a submitted entry and stop (agreed with the merge tool's keeper).
 *                The message worker starts such a run while its merge slot is busy with another entry, so an entry
 *                submitted during a suite is pinned and judged in time for the next bus. The run takes the entry's
 *                hold first. It acts only on a submitted entry; in any other state it ends at once and says which
 *                state it found. It never takes a lane, never starts or brings down a sandbox, never brings down what
 *                ended entries left up, and every git command it runs carries `-c gc.auto=0`.
 *   --check-resolution  check the resolution a supervisor handed over for a resolving entry, and stop (tier 2 of
 *                the resolution rule, round B, answer 1). The message worker starts such a run
 *                beside the lane, in the slot pin-only runs share, whenever a resolving entry's resolution waits for
 *                its check. The run takes the entry's hold first. It acts only on such an entry; in any other state
 *                it ends at once and says what it found. It works in <workdir>/resolution, never takes a lane, never
 *                starts or brings down a sandbox, never brings down what ended entries left up, and every git command
 *                it runs carries `-c gc.auto=0`. tools/merge-tool/check-a-resolution.mjs says what it proves.
 *   --sandbox-tool  FOR TESTS ONLY: a stand-in for tools/sandbox.mjs, which takes the same words. The
 *                message worker never passes it, so the queue always runs tools/sandbox.mjs from this
 *                checkout.
 *   --modal-runner  FOR TESTS ONLY: a stand-in for tools/modal-tests.mjs, which takes the same words and
 *                exits the same way. The message worker never passes it. The real runner is never called
 *                from a process the test suite started (the test mark), so no test spends money on Modal.
 *
 * Exit 0: every step it could take was taken and reported, or the entry waits on somebody else (the
 * inspector, the secretary) or on the lane another entry holds, and the tool said so. Exit 1: the tool
 * itself could not go on, and the reason is on stderr, in the log, and in the entry's `tool.reason`.
 * Exit 2: a usage error.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, AND WHO DECIDES
 * ---------------------------------------------------------------------------------------
 *
 * The tool DOES the deterministic work and REPORTS facts through `POST /api/merge-queue/:id/step`.
 * The SERVER decides the next state (the state machine, piece P7). After every step the tool reads
 * the entry back with `GET /api/merge-queue/:id` and goes on only if the new state is one it acts in.
 * It never decides a state itself, and it never writes an entry by any other door.
 *
 *   state        what the tool does                                  step it reports
 *   submitted    pins the content: a ref in the main repository        pinned
 *                (git), or verified blobs held in its workdir (files)
 *   pinned       nothing: the entry waits on the inspector's release   —
 *   judged       takes the lane; ends, naming the holder, when         integrating
 *                another entry holds it. An entry moved to the
 *                front, one back from a check, and one that waited
 *                for a press each say so in the log as they take it
 *   integrating  puts the change on top of the main world as it is     integrated | conflict |
 *                now, runs the checker tools                           guard-failed
 *   reinspecting nothing: waits on the inspector, and ends saying      —
 *                whether the entry let its lane go for the check, or
 *                holds it, as an entry back from an earlier check does
 *   testing      the whole suite under the full-suite seat (git);      tested |
 *                nothing to run for files, and it says so              main-moved-while-testing
 *   testing,     state on the server first (the landing step), then    landing, then landed |
 *   once green   compare-and-swap main                                 main-moved
 *   landing      what is left of a landing cut off                     landed | main-moved
 *   final        nothing                                               —
 *
 * WHAT A STEP CARRIES is exactly the facts the step door reads (src/server/lib/merge-state-machine.ts
 * `THE_FACTS_OF`): content by path as sha256 of the bytes, or the word "absent"; the checker's own
 * report; where the main world stood. Everything else the tool measured — the rebase's commits, the
 * reruns of red files with the machine's load, the backup, the migration, the office's health, the
 * landing plan of a files entry — is written beside it, one line per step, in <workdir>/steps.jsonl,
 * so the office holds what it decides on and the evidence stays on disk where the log names it.
 *
 * ---------------------------------------------------------------------------------------
 * THE GIT ADAPTER
 * ---------------------------------------------------------------------------------------
 *
 * PIN. The sealed commit is fetched into the main repository if it is not already there, every
 * sealed file's content is compared with the seal (sha256 of the blob, the seal's own hashing),
 * and `refs/mole-office/queue/<entry>` is pointed at it. From here on the queue reads the commit
 * object, never the worker's worktree, which may move on or be removed.
 *
 * THE ENTRY'S SANDBOX (acceptance finding 17). Nothing of a submitted tree runs on the host. Before
 * integrating, the tool starts a sandbox of the entry's own, `merge-<entry>`, from the lane's
 * checkout with --sandbox-template, through tools/sandbox.mjs up (registered in the ledger against
 * this run's session, with no dsh folder and no provider key). The clone the tool integrates in is
 * made INSIDE that sandbox's folder, at <folder>/work/clone, because the folder is the one place the
 * sandbox may write. Every command that runs the tree's own code — a generator, `npm run build`, the
 * whole suite, each rerun — goes through `tools/sandbox.mjs exec --wait --plain-env --timeout`: it
 * runs in the container, with the container's own environment and none of the launcher's variables,
 * stopped inside the container at its limit. Git itself, the checkers and the landing run on the host,
 * as before: they are this checkout's own code, reading the tree. Each run that brought the sandbox
 * up brings it down through the ledger when it stops, and the next run brings it up again on the
 * same folder. The run that ends the entry (merged or bounced) brings its sandbox down whichever run
 * brought it up. Once the entry is final and no check is going, this version's sandbox clears the trees it
 * can make again (repo/ and work/'s clones, theReCreatableMergeParts) through the launcher, keeping every other part
 * and the workdir. There is no way to run a git entry's code
 * on the host: with no docker, a git entry cannot be tested, and the tool says so.
 *
 * INTEGRATE. In a `git clone --shared` of the main checkout inside the entry's sandbox (it writes
 * nothing into the main repository), `git rebase <M>` puts the change on top of M, the main
 * checkout's HEAD at that moment, leaving out each commit whose patch M already holds (wave 13v round 20). A textual conflict is never resolved here: the conflicted paths
 * are reported and the rebase is abandoned. Then, per SPEC 5.5 and decision R2, the verdict follows
 * file content: every path that differs from M in the commit that would land is reported at its
 * sha256, and the office compares that with what the inspector judged and asks for a scoped check of
 * whatever differs (the tool logs its own reading of it, but decides nothing). Five guards run on the
 * result. The first four: tools/checks/git-changeset.mjs (regenerated files byte for byte, protected paths handed
 * to the inspector — decision R4), run from THIS checkout's tools; the mutation-marker reader
 * tests/applied-mutations.ts over the rebased tree; the owner-content gate, owner-content.mjs
 * that refuses owner content on the lines the entry adds to what ships,
 * lets through what owner-content-allowed.mjs names, and puts its reminders on `integrated`; and the address gate,
 * addresses.mjs, which refuses a new IPv4 address on an added line of any path, outside loopback, the unspecified
 * address and the documentation ranges, unless addresses-allowed.mjs names it. Then, if the change touches a path a generated
 * file declares under `regenerateWhen` in `.mole-office/protected.json`, the generator runs in the clone and its output is
 * committed temporarily in the clone and reported as decided by regeneration (R4), so the office does not send it
 * to the inspector. The complete replay and generated output become one feature commit with M as its sole parent,
 * titled from the run's whole record, and naming its run, seal, original tip and effective replay. Original and replay
 * histories are kept in the main repository before main moves and pushed with it. The commit-address gate screens both
 * the retained replay and the final commit. The tests run on that final commit, which is the one main lands.
 *
 * TEST. `npm run build` (when the project has a build script) and `npm test`, at nice 19, in the
 * entry's sandbox, holding the office's `full-suite` seat for the whole step with this process's own
 * group. The suite is vitest, and its JSON report says which files were red. Each red file is run
 * again alone, at once, on the same tree, with `--no-file-parallelism`, and the machine's load
 * average at that moment is recorded beside the result: green alone passes (ACCEPTANCE item 23).
 *
 * RED ALONE IS COMPARED WITH MAIN (acceptance finding 18). A file that is red alone may be red on
 * main already: main carried thirteen such files on 22 September, and a plain clone in a sandbox
 * fails some more wherever it runs (no .env to find, not a worktree). So each file red alone is run
 * alone once more, in the same sandbox, on main as it stood when the entry was integrated (M, in a
 * clone of its own at <folder>/work/main, built first). The comparison is by test, not by file: a
 * test that fails with the entry and also fails on main is not this entry's doing; a test that fails
 * only with the entry is, once the pair of runs below confirms it, and so is a file main does not
 * have. A file that fails without any failed test (it did not load, or a hook threw) counts as one
 * test named after the file. The run is green when no test is left failing with the entry that main
 * does not also fail, and `says` names every file passed that way, so nobody reads "green" as "main
 * is green".
 *
 * THE ENTRY IS BLAMED ONLY ON A PAIR OF RUNS (finding 81). A test that fails alone with the entry and
 * not on main is run again as a pair: the file alone on main, and straight after, alone with the
 * entry, with the time and the 1-minute load written beside each. A run on main made for that file
 * just before, in the same tool run, is the pair's first half; a result on main kept from another
 * entry is not, so main is run again. The entry is blamed for the test only when, in the pair, it
 * fails with the entry and passes on main. A kept result on main can still clear a test, because
 * it shows the test failing on main, but it never blames one. The facts name each blamed test with
 * the pair's two times and loads, and each file the pair cleared the same way. A run of the pair
 * that gives no result stops the tool, as any run with no result does.
 *
 * A RUN THAT GAVE NO RESULT IS NOT RED (acceptance finding 80). A test run gives a result only when
 * it leaves a readable report that names its file. A build gives one only when the launcher started
 * it and it was not cut off; a build that ran and failed is red. The tool stops with ok false and
 * reports no `tested` step when the whole suite leaves no readable report, when a build gives no
 * result, when a file red in the suite gives no result when run again alone, or when main gives no
 * result for a file red alone with the entry (main's own build that did not succeed included). It
 * names each file and what its run said. The office then asks for the tool again, and after three
 * runs that leave the entry where it was, it bounces the entry as stalled. When a suite two entries
 * share leaves no readable report, each entry is tested alone, as before. tools/merge-tool/testing.mjs,
 * red-files.mjs and pairs.mjs.
 *
 * LAND, once the office holds a green test run. The compare-and-swap: main's HEAD must still be M,
 * and the merge is `--ff-only`. In order: the final commit's objects are fetched into the main
 * repository; the landing plan is written to the workdir; the `landing` step is reported and
 * confirmed on the server BEFORE anything moves, because, when the office runs from the main
 * checkout, that checkout is the live server's own working directory and moving it restarts the
 * server (R6); if main is no longer M, that is reported
 * as `main-moved` and the office sends the entry back to take its lane again; otherwise
 * `npm run db:backup`; `git merge --ff-only`; `npm run db:migrate` when the landed
 * commits bring migration files (the supervisor, tools/serve-dev.mjs, looks for exactly that after a
 * refusal of the serve kind); then `GET /api/health` until it says ok, and,
 * when the office runs from the lane, until `GET /api/runtime` says it serves the landed commit.
 * AFTER THE SWITCH, when the office runs from another folder on the database the main checkout's own settings name, the
 * landing changes main only: no backup, no migration and no prune. When the office's runtime does not say where it runs
 * and which database it has open, the landing stops before main moves (tools/merge-tool/the-stable-office.mjs).
 * A run that is interrupted anywhere can be started again: what was done is on disk and on the
 * server, and each part of landing is skipped when the tree already shows it done.
 *
 * ---------------------------------------------------------------------------------------
 * THE FILES ADAPTER
 * ---------------------------------------------------------------------------------------
 *
 * PIN. Each staged file is copied into the workdir's hold and the manifest is written there in the
 * checker's format; tools/checks/files-changeset.mjs verifies shape, provenance, sha256, type and
 * content, and that nothing would overwrite. The manifest also names the folder the entry was
 * staged in, so a source there is known to be the new file itself (acceptance finding 45), and, for
 * an entry on a files seal, each file's original as the seal recorded it at finish, read off the
 * seal and never off the entry. INTEGRATE runs the same checker against
 * the main world as it stands NOW: a target whose hash is not the before-hash is a conflict (R3),
 * unless the submitter chose keep-both, in which case an add or a modify lands under another name
 * beside the main world's file. A delete is applied only when the entry carries the secretary's confirmation
 * comes; until it does, the tool stops before taking the lane and says what it
 * waits on. `mainAt` for a files entry is a sha256 over what every touched path holds. LAND reports
 * the landing step, then checks every touched path again: each must hold what it held at integrate
 * time or what the plan lands there, or the folder moved (`main-moved`); it creates a new file exclusively
 * (never over an existing one), replaces a modified file atomically only when it still holds the
 * before-hash, and then reads every landed file back through the office (`GET /api/file`) and
 * compares the hash; where the office refuses the read, the read is done from the file system and
 * the reply says so. A file the checker decided by its hash over the content limit lands unread, and
 * the landing's words name it with the checker's own. Nothing is backed up, migrated or restarted,
 * and the facts say so.
 *
 * ---------------------------------------------------------------------------------------
 * ONE RUN PER ENTRY, AND NO SANDBOX LEFT UP
 * ---------------------------------------------------------------------------------------
 *
 * THE HOLD (acceptance finding 80). Before anything else, a run takes the entry's hold in
 * <workdir>/holds: a file naming its session, its pid and when its process began. If another run
 * that is still running holds the entry, this run stops with ok false and touches neither the entry
 * nor its sandbox. A hold whose process has ended is taken over, and the log says so.
 * `takeTheEntrysHold` in tools/merge-tool/office-keeper.mjs.
 *
 * THE SWEEP. Then, before its own work, the run brings down every merge
 * sandbox this version marked, whose entry the office says has ended, and whose entry no live run
 * holds. It then clears its clone parts once no check is going. Old folders are left for separate cleanup.
 * Last, it removes the resolution clone of each ended entry a day after the clone was last written, unless an open
 * problem or a current fix brief names the entry, or a live run holds it (tools/merge-tool/ended-resolutions.mjs).
 * A failure is logged and left for the next run.
 * `bringDownWhatEndedEntriesLeftUp` in tools/merge-tool/office-keeper.mjs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * It never decides a state, resolves a conflict, deletes a branch, a ref, a worktree or its own
 * workdir (R5: a secretary deletes; the launcher's clear of a final merge sandbox is its own rule, and the
 * tool removes an ended entry's resolution clone a day after it was last written, unless an open problem or a current
 * fix brief names the entry, or a live run holds it), overwrites a file whose hash differs, or moves main by anything
 * but a fast-forward whose starting point it checked. It never acts on an entry another live run
 * holds. It runs no model.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CODE IS
 * ---------------------------------------------------------------------------------------
 *
 * This file holds the run: `carry`, `testedGreenOnWhatIsHeld`, `MOST_TURNS` and the ending. The rest is in
 * tools/merge-tool/:
 *
 *   arguments.mjs           the flags, read when it is loaded, and the constants several modules read
 *   log-and-state.mjs       the log, the state file, and the tool's own failure
 *   git.mjs                 git, commands in their own process group, and hashing
 *   what-a-clone-names.mjs  what a clone in a sandbox folder names for git to run, read before git runs on its files
 *   cleanup.mjs             an independent watcher stops the recorded groups, sandbox and seat when this run ends
 *   early-conflicts.mjs     whether an entry's commits join main, replayed by merge-tree at the pin and after each landing, without moving refs
 *   office-keeper.mjs       every function that sends a request to the office, the entry's sandbox, and the entry's hold
 *   unreadable-entries.mjs  what the office could not read of the queue it listed; it imports nothing
 *   ended-resolutions.mjs   when an ended entry's resolution clone goes; it sends no request itself
 *   integrate.mjs           the checkers and the git adapter: pin, rebase, guards, regenerate
 *   owner-content.mjs       the third guard: new owner content in what ships; it imports nothing from the tool
 *   owner-content-allowed.mjs   what that guard lets through, each entry with its key and its reason
 *   addresses.mjs           the fourth guard: a new IPv4 address in any path, by its shape; it names no address
 *   addresses-allowed.mjs   what that guard lets through, each entry with its key and its reason
 *   commit-addresses.mjs    the fifth guard: a commit at the placeholder domain, as its author or its committer
 *   house-rules.mjs         main-only house-rule facts and the searchable class expectation
 *   merge-class.mjs         build, database-path and red-file class facts, and repair named-file runs
 *   take-back.mjs           one clean inverse commit for the office to verify
 *   emergency-push.mjs      one commit straight to main while the emergency switch is on, between the office's two doors
 *   testing.mjs             the whole suite, reruns alone, what the suite read, the comparison with main
 *   fix-round.mjs           the wait while the office asks for a fix round for a tested entry, looked at again until it opens
 *   red-files.mjs           which files a report says were red, and one file run alone
 *   installed-lock.mjs      the installed package lock where a run ran, and whether a suite and a run alone had the same
 *   pairs.mjs               two entries, one suite
 *   plugin-lane.mjs         a plugin-only change: the plugin's own check, the secret scan and the privacy gate, no suite
 *   lines.mjs               the line rule for line files (the line rule); it imports nothing from the tool
 *   documents.mjs           documents that no test reads, and the record of what the suite reads
 *   migrations.mjs          renumber independent migration additions at integration
 *   journal-join.mjs        the merge driver that joins the migration journal's rows in the integration clone
 *   list-join.mjs           the merge driver that joins conflicts where both sides only added, in list files and imports
 *   the-joins.mjs           both joins, given to a clone in one place, and what they wrote there
 *   rebase-with-joins.mjs   the queue's rebase with its joins, at the entry's turn and tried early on a scratch copy
 *   conflicted-file.mjs     a path left in conflict as its three sides, and the places a resolved file resolves
 *   check-a-resolution.mjs  the check of a resolution a supervisor handed over, for a --check-resolution run
 *   resolve-a-conflict.mjs  the clean copy a supervisor resolves a conflict in; a supervisor runs it, not this run
 *   trial-replay.mjs        what the queue's rebase would do with a tip, tried on a scratch copy; a supervisor runs it, not this run
 *   push.mjs                check private origin and push a landed commit without force
 *   land.mjs                landing a git entry
 *   the-stable-office.mjs   whether the office runs elsewhere on the main checkout's database, so a landing changes main only,
 *                           and whether an entry that changes the queue's own code may ride a bus; it imports nothing from the tool
 *   files.mjs               the files adapter
 *   generated-regions.mjs   whether an entry's version of a generated file stands on main's; it imports only the
 *                           markers, tools/test-audit-table-markers.mjs, which is the queue's own code too
 *   the-queues-own-code.mjs the queue's own code, which an entry is tested alone for changing unless a landing changes
 *                           neither the office nor the tool (the-stable-office.mjs); it imports nothing
 */

import { finishCleanup } from './merge-tool/cleanup.mjs'
import { watchMergeCleanup } from './merge-tool/office-keeper.mjs'

import { appendFileSync } from 'node:fs'

import { theEntryNeedsNothingMore, theMergeToolEndingLine, theMergeToolFinished } from '../src/config/merge-tool.mjs'
import { LOG, WORKDIR, chosen, THE_INTEGRATION_READS, THE_LANDING_GATE_READS } from './merge-tool/arguments.mjs'
import { ACloneNamesAProgram, MergerFailure, fail, log, readState } from './merge-tool/log-and-state.mjs'
import { ask, bringDownWhatEndedEntriesLeftUp, bringTheSandboxDown, clearTheFinalSandbox, conflictsAfterLanding, countAGateMet, readBackThroughTheOffice, readEntry, runInSandbox, sleep, step, takeTheEntrysHold, theLane, theMigrationsQueued, theOfficesRuntime, theSandbox, theSeal, toolEnded, toolStarted, waitForHealth } from './merge-tool/office-keeper.mjs'
import { integrateGit, pinGit } from './merge-tool/integrate.mjs'
import { testGit } from './merge-tool/testing.mjs'
import { landGit } from './merge-tool/land.mjs'
import { MERGE_STATE_SPECS, aResolutionWaitsForItsCheck } from '../src/shared/merge-queue.ts'
import { checkTheResolution } from './merge-tool/check-a-resolution.mjs'
import { itWaitsForAFixRound, waitForTheFixRound } from './merge-tool/fix-round.mjs'
import { mergeTestsAuthorizeLanding } from '../src/config/whole-suite-red.mjs'
import { deletesAreConfirmed, deletesOf, integrateFiles, landFiles, pinFiles, testFiles } from './merge-tool/files.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

/** The ten office functions and the two gate reads a landing takes from its caller. */
const WHAT_THE_LANDING_NEEDS = { ask, countAGateMet, runInSandbox, step, theOfficesRuntime, theSandbox, waitForHealth, conflictsAfterLanding, theLane, sleep, ...THE_LANDING_GATE_READS }

// THE START CHECK (wave 13q), before this run reads its entry: a stable checkout at a dated stable tag started without
// the pairing would read its own defaults. It reads the pairing settings.mjs loaded with, because arguments.mjs has
// taken the variable out of this process's environment by now.
stopAnUnpairedStableStart()

// ============================================================================ the run

/** Whether the entry's own test record authorizes landing what this tool integrated last. */
function testedGreenOnWhatIsHeld(entry) {
  const tested = entry.machine?.tested
  if (!mergeTestsAuthorizeLanding(tested)) return false
  if (entry.changeset.adapter !== 'git') return true
  return tested.tip === readState().integrated?.Cfinal
}

/**
 * WHAT A REINSPECTING ENTRY DOES WITH ITS LANE WHILE ITS CHECK RUNS (wave 13u, item 53), as the office's reading says.
 * The office works out `occupies` from the state and `returnsFirst` (`occupiesTheLaneIn` in src/shared/merge-queue.ts),
 * and this only reads it. An entry the office moved to reinspecting before checks let the lane go holds its lane too,
 * with no `returnsFirst`, so no reason is given for it.
 */
function whatItDoesWithItsLane(entry) {
  if (entry.occupies === null) return 'It let its lane go for this check, so another entry of the lane may take the lane meanwhile.'
  return `It holds its lane through this check${entry.returnsFirst ? ', because it came back from an earlier check' : ''}.`
}

/**
 * THE MOST STATES ONE RUN WALKS THROUGH before it stops rather than loop: a pin, then up to four
 * rounds of taking the lane, integrating, testing and landing (the main world may move under the
 * entry as often as the landing-attempts row allows before the office bounces it as churn), and some room.
 */
const MOST_TURNS = 32

/**
 * CARRY THE ENTRY, once this run holds it. First the sandboxes that ended entries left up are brought down, and that
 * never stops this run's own work.
 */
async function carry() {
  await bringDownWhatEndedEntriesLeftUp()
  let entry = await readEntry()
  lastState = entry.state
  const adapter = entry.changeset.adapter
  log(`merge entry ${chosen.entry} (${adapter}) is ${entry.state}; lane ${entry.lane}; workdir ${WORKDIR}`)
  await toolStarted()
  for (let turns = 0; turns < MOST_TURNS; turns += 1) {
    const state = entry.state
    lastState = state
    if (state === 'submitted') {
      entry = adapter === 'git' ? await pinGit(entry, { ...THE_INTEGRATION_READS, theSeal, countAGateMet, step }) : await pinFiles(entry, { step, theSeal })
    } else if (state === 'pinned') {
      return `the entry is pinned and waits on ${entry.waitsOn}.`
    } else if (state === 'judged') {
      // A DELETE IN THE MAIN WORLD WAITS FOR THE SECRETARY, and the entry does
      // not take its lane while it waits. The office hands it to the tool again once it is confirmed.
      const deletes = adapter === 'files' ? deletesOf(entry) : []
      if (deletes.length > 0 && !deletesAreConfirmed(entry)) {
        return `${String(deletes.length)} delete operation(s) (${deletes.join(', ')}) wait for a secretary's confirmation on the entry. Nothing was integrated.`
      }
      // A SENSITIVE PATH WAITS FOR ONE PRESS (the press rule, part 4), and the entry does not take its lane while
      // it waits. The office hands it to the tool again once a secretary or the person has pressed.
      const press = entry.pressToLand
      if (press && press.pressed === null) {
        return `${String(press.paths.length)} path(s) (${press.paths.join(', ')}) land only after a press, and nobody has pressed POST /api/merge-queue/${entry.id}/press-to-land yet. Nothing was integrated.`
      }
      entry = await step('integrating', {}, { lane: entry.lane })
      // THE LANE IS HELD BY ANOTHER ENTRY (choice (a)). The run ends ok and names the
      // holder. The office counts no stall for it, and its list for the worker leaves the entry off until the lane is let go.
      if (entry.laneHeldBy) {
        const held = entry.laneHeldBy
        const where = held.workspaceId === undefined || held.workspaceId === entry.workspaceId ? '' : ` in the project ${held.workspaceId}`
        return `the lane ${entry.lane} is held by merge entry ${held.entry}${where}, which is ${held.state}, so the entry stays judged. Nothing was integrated.`
      }
      // AN ENTRY MOVED TO THE FRONT says so in the log when it takes its lane: who moved it, when and why.
      if (entry.movedFirst) log(`merge entry ${entry.id} took its lane ${entry.lane} as an entry moved to the front. ${entry.movedFirst.says}`)
      // AN ENTRY BACK FROM A CHECK (wave 13u, item 53) says so in the log when it takes its lane: which check it let the lane
      // go for, and when it came back. Only a move into testing clears `returnsFirst`, so it is still on the entry here.
      const back = entry.returnsFirst
      if (back) log(`merge entry ${entry.id} took its lane ${entry.lane} as an entry back from a check: it let the lane go while check-again run ${back.run} ran, and came back at ${back.at} to find the lane held or main moved.`)
      // AN ENTRY THAT WAITED FOR A PRESS says in the log who pressed, when and why, when it takes its lane.
      const pressed = entry.pressToLand?.pressed
      if (pressed) log(`merge entry ${entry.id} took its lane ${entry.lane} after the press of ${pressed.by.kind} ${pressed.by.id} at ${pressed.at}: ${pressed.because}`)
    } else if (state === 'integrating') {
      try {
        entry = adapter === 'git' ? await integrateGit(entry, { queued: await theMigrationsQueued(entry.changeset.root, entry), landing: true, ...THE_INTEGRATION_READS, ask, countAGateMet, runInSandbox, step, theSandbox, theSeal }) : await integrateFiles(entry, { step })
      } catch (err) {
        // A CLONE THAT NAMES A PROGRAM (merge-tool/what-a-clone-names.mjs) bounces the entry with the sentence naming it.
        if (!(err instanceof ACloneNamesAProgram)) throw err
        log(`the entry bounces: ${err.message}`)
        entry = await step('guard-failed', { guard: 'a-clone-names-a-program', files: [], detail: err.message })
      }
    } else if (state === 'reinspecting') {
      return `the entry is reinspecting and waits on ${entry.waitsOn}. ${whatItDoesWithItsLane(entry)}`
    } else if (state === 'testing') {
      if (itWaitsForAFixRound(entry)) {
        entry = await waitForTheFixRound(entry, { sleep, step })
      } else if (testedGreenOnWhatIsHeld(entry)) {
        bringTheSandboxDown()
        entry = adapter === 'git' ? await landGit(entry, WHAT_THE_LANDING_NEEDS) : await landFiles(entry, { readBackThroughTheOffice, step })
      } else entry = adapter === 'git' ? await testGit(entry) : await testFiles({ step })
    } else if (state === 'landing') {
      bringTheSandboxDown()
      entry = adapter === 'git' ? await landGit(entry, WHAT_THE_LANDING_NEEDS) : await landFiles(entry, { readBackThroughTheOffice, step })
    } else {
      return theEntryNeedsNothingMore(state)
    }
  }
  fail(`The entry was still ${entry.state} after ${String(MOST_TURNS)} turns; stopping rather than looping.`)
}

/**
 * PIN THE ENTRY AND STOP, for a `--pin-only` run that holds the entry. A submitted entry is pinned, as carry() pins it,
 * and the run stops however the office answers. Any other state ends the run at once with that state named: it never
 * steps past pinned. Nothing here takes a lane or touches a sandbox, so the ending below leaves the sandbox alone.
 */
async function pinOnly() {
  const entry = await readEntry()
  lastState = entry.state
  if (entry.state !== 'submitted') {
    return `this run only pins a submitted entry, and merge entry ${chosen.entry} is ${entry.state}, so it did nothing.`
  }
  log(`merge entry ${chosen.entry} (${entry.changeset.adapter}) is submitted; this run only pins it; workdir ${WORKDIR}`)
  await toolStarted()
  const after = entry.changeset.adapter === 'git' ? await pinGit(entry, { ...THE_INTEGRATION_READS, theSeal, countAGateMet, step }) : await pinFiles(entry, { step, theSeal })
  lastState = after.state
  return `this run only pins, and merge entry ${chosen.entry} is now ${after.state} and waits on ${after.waitsOn}.`
}

/**
 * CHECK THE ENTRY'S RESOLUTION AND STOP, for a `--check-resolution` run that holds the entry. Only a resolving entry
 * whose resolution waits for its check is checked; any other ends the run at once with what it found. Nothing here
 * takes a lane or touches a sandbox, so the ending below leaves the sandbox alone, as for a pin-only run.
 */
async function checkResolution() {
  const entry = await readEntry()
  lastState = entry.state
  if (!aResolutionWaitsForItsCheck(entry.state, entry.machine?.resolution)) {
    return `this run only checks a resolution that waits for its check, and merge entry ${chosen.entry} is ${entry.state}${entry.state === 'resolving' ? (entry.machine?.resolution ? ' with a resolution the check already refused' : ' with no resolution handed over') : ''}, so it did nothing.`
  }
  log(`merge entry ${chosen.entry} is resolving, and its resolution ${entry.machine.resolution.commit} waits for its check; this run only checks it; workdir ${WORKDIR}`)
  await toolStarted()
  const after = await checkTheResolution(entry, { step })
  lastState = after.state
  return `this run only checks a resolution, and merge entry ${chosen.entry} is now ${after.state} and waits on ${after.waitsOn}.`
}

/**
 * AN EMERGENCY PUSH (wave 13u round 82, item 16) is asked under the caller's own handle and key, not the queue's, because
 * its record names who pushed. It holds no entry and starts no sandbox.
 */
if (chosen.emergencyPush !== null) {
  const { AN_EMERGENCY_PUSH_NEEDS_YOUR_KEY, runTheEmergencyPush } = await import('./merge-tool/emergency-push.mjs')
  const { theDatabaseRootNames } = await import('./merge-tool/land.mjs')
  const { whatTheLandingDoesAboutTheOffice } = await import('./merge-tool/the-stable-office.mjs')
  const { API, WORKSPACE } = await import('./merge-tool/arguments.mjs')
  const { anAgentsToolHeaders, theAgentKey } = await import('./sandbox-common.mjs')
  let said
  let ok = false
  try {
    const key = theAgentKey()
    if (key === null) fail(AN_EMERGENCY_PUSH_NEEDS_YOUR_KEY)
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-session': chosen.session, ...anAgentsToolHeaders({ self: chosen.as, key }) }
    const ask = async (method, path, body = undefined) => {
      const res = await fetch(`${API}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const text = await res.text()
      let parsed = null
      try { parsed = text === '' ? null : JSON.parse(text) } catch { parsed = { error: text } }
      return { status: res.status, body: parsed }
    }
    const [id, contentHash] = chosen.message.split(':')
    const whatAboutTheOffice = async () => {
      const runtime = await ask('GET', '/api/runtime')
      return whatTheLandingDoesAboutTheOffice({ root: chosen.root, runtime: runtime.status === 200 ? runtime.body : null, askTheRootsDatabase: () => theDatabaseRootNames(chosen.root) })
    }
    const push = await runTheEmergencyPush({ root: chosen.root, commit: chosen.emergencyPush, message: { id, seq: 1, contentHash }, line: chosen.line, ask, sleep, whatAboutTheOffice })
    said = `emergency push ${push.id} moved main in ${chosen.root} to ${push.commit}, and the commit went on to the private GitHub copy and to the mirror.`
    ok = true
  } catch (error) {
    said = error instanceof Error ? error.message : String(error)
    log(said)
  }
  process.stdout.write(`EMERGENCY PUSH: ${said}\n`)
  process.exit(ok ? 0 : 1)
}

/**
 * HOW THIS RUN ENDED, said once in the same words on the entry (tool-ended) and in the one line the
 * message worker reads off this run's output (src/config/merge-tool.mjs), which must be the last line
 * printed. `ok` is true when the tool did what the state asked of it, including reporting a conflict
 * or a red test, and false when it could not go on.
 *
 * THE ENTRY'S HOLD COMES FIRST (acceptance finding 80). A run that does not hold the entry, because another live run
 * does or because nobody can tell, ends here with ok false. It sends no step, starts nothing, asks the office nothing,
 * and does not write the state; it writes one line to the entry's log, and its ending line.
 */
if (chosen.takeBack !== null) {
  const { runTakeBack } = await import('./merge-tool/take-back.mjs')
  const { ask, inATestBatchSeat, keepTheReport, theSandbox, runInSandbox } = await import('./merge-tool/office-keeper.mjs')
  const { runAlone } = await import('./merge-tool/red-files.mjs')
  const { linkNodeModules, packageScripts } = await import('./merge-tool/git.mjs')
  const { GIT_IDENTITY, SCRIPT_TIMEOUT_MS } = await import('./merge-tool/arguments.mjs')
  const hold = takeTheEntrysHold()
  if (!hold.held) {
    process.stdout.write(`TAKE-BACK: problem ${chosen.takeBack}; office not asked; ${hold.says}\n`)
    process.exit(1)
  }
  watchMergeCleanup()
  // each file run alone on main sits in a test-batches seat, since a take-back holds no full-suite seat, and it passes the office's runInSandbox and keepTheReport
  const runAloneInASeat = (sandbox, tree, file, label, reports, options = {}) =>
    inATestBatchSeat(`the merge queue's take-back of problem ${chosen.takeBack}: ${file} on main`, () => runAlone(sandbox, tree, file, label, reports, { ...options, runInSandbox, keepTheReport }))
  let ok = false
  try { ok = await runTakeBack({ chosen, workdir: WORKDIR, ask, identity: GIT_IDENTITY, mainTools: { theSandbox, runAlone: runAloneInASeat, linkNodeModules, packageScripts, runInSandbox, buildLimitMs: SCRIPT_TIMEOUT_MS } }) }
  finally {
    try { bringTheSandboxDown() } finally { await finishCleanup() }
  }
  process.exit(ok ? 0 : 1)
}

let ending
let holdsTheEntry = false
/** The state this run last read the entry in, so its ending knows whether the entry has ended. */
let lastState = null
try {
  const hold = takeTheEntrysHold()
  if (hold.held) {
    holdsTheEntry = true
    if (!chosen.pinOnly && !chosen.checkResolution) watchMergeCleanup()
    const said = chosen.pinOnly ? await pinOnly() : chosen.checkResolution ? await checkResolution() : await carry()
    log(`done: ${said}`)
    ending = { ok: true, says: theMergeToolFinished(said) }
  } else {
    log(`this run, session ${chosen.session}, stops: ${hold.says}`)
    process.stderr.write(`tools/the-merger.mjs: ${hold.says}\n`)
    ending = { ok: false, says: `The merge tool could not go on: ${hold.says}` }
  }
} catch (err) {
  const why = err instanceof Error ? err.message : String(err)
  log(`FAILED: ${why}`)
  process.stderr.write(`tools/the-merger.mjs: ${why}\n`)
  if (!(err instanceof MergerFailure) && err instanceof Error && err.stack) appendFileSync(LOG, `${err.stack}\n`)
  ending = { ok: false, says: `The merge tool could not go on: ${why.slice(0, 1500)}`.trim() }
}
// THE ENDING, ON EACH PATH.
//   - This run did not hold the entry: nothing below runs. No sandbox is brought down and the office is not told,
//     because this run never told it that it started, and the entry's tool is the run that holds it.
//   - This run held the entry: `bringTheSandboxDown` brings the entry's sandbox down when the state says this run's
//     session brought it up, whatever state the entry is in, and the next run brings it up again on the same folder.
//     When the entry has ended (a final state), it brings the sandbox down whoever brought it up. Otherwise a sandbox
//     another session brought up is left as it is, and the log says so. With no sandbox in the state (a
//     files entry, or a git entry that never reached one), or one already brought down, it does nothing. Then the
//     office is told how the run ended.
//   - A pin-only run that held the entry: no sandbox is brought down or cleared, even an ended entry's, and the
//     office is told how it ended (condition 3 of the merge tool's keeper). A run that checks a
//     resolution ends the same way (answer 1).
const beside = chosen.pinOnly || chosen.checkResolution
if (holdsTheEntry && !beside) {
  try {
    bringTheSandboxDown({ entryEndedIn: lastState !== null && MERGE_STATE_SPECS[lastState]?.final === true ? lastState : null })
  } catch (err) {
    log(`the entry's sandbox could not be brought down: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    await clearTheFinalSandbox()
  } catch (err) {
    log(`the entry's sandbox was not cleared: ${err instanceof Error ? err.message : String(err)}; the next run's sweep tries again`)
  }
}
if (holdsTheEntry && !beside) await finishCleanup()
if (holdsTheEntry) {
  try {
    await toolEnded(ending.says)
  } catch (again) {
    process.stderr.write(`tools/the-merger.mjs: and the office could not be told: ${again instanceof Error ? again.message : String(again)}\n`)
  }
}
process.stdout.write(`${theMergeToolEndingLine(ending)}\n`)
process.exit(ending.ok ? 0 : 1)
