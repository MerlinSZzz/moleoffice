// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The new synthetic lease transport participates in tool fixtures; it is named so those callers keep their process budget. */
/**
 * HOW LONG ONE TEST MAY TAKE, AND WHY THAT IS NOT ONE NUMBER FOR THE WHOLE SUITE.
 *
 * THE RULE. A test that starts something outside the test process — a browser, an API server, a
 * Vite, any child process — gets thirty seconds, and its hooks get four minutes. Every other test
 * keeps the runner's own five-second default.
 *
 * WHY TWO NUMBERS. Five seconds is the right budget for a test that only calls a function: a pure
 * test that hangs should say so at once, and raising its budget would hide a real fault behind a
 * long wait. Five seconds is the wrong budget for a test that starts an API server, opens a browser
 * and then reads a page out of it. This machine runs three worktrees' suites at
 * once by design, so a loaded machine is the normal case, not the exception.
 *
 * WHAT WAS MEASURED. Problem `xi0SpPpDxl6j` in Mole Office. On 4 September 2026 at load average 31,
 * four tests failed with "Test timed out in 5000ms" across two files — three in
 * tests/one-listener-for-the-whole-product.test.ts and one in
 * tests/what-a-reader-of-this-audience-is-shown.test.ts. The same two files passed together on
 * their own in thirteen seconds. Earlier the same day, at load average 18 to 27, ten more browser
 * files failed the same way in one run and all ten passed when re-run together. Nothing was wrong
 * with the code in any of them.
 *
 * WHERE THIS IS APPLIED, AND WHY IT CANNOT BE DONE FROM A HOOK. tests/set-how-long-a-test-may-take.ts
 * applies it, and vitest.config.ts names that file under `setupFiles`. A setup file is imported
 * before the test file it belongs to is collected. That matters, because the runner fixes a test's
 * budget when it collects the test and never looks at the configured value again —
 * `@vitest/runner`, `const timeout = options.timeout ?? runner.config.testTimeout` in the function
 * that builds a task. Measured on 4 September 2026 with two probe files: `vi.setConfig({ testTimeout:
 * 30_000 })` inside a `beforeAll` did NOT reach the tests below it — a six-second test still died
 * at 5000ms — and the same call from a setup file did. So the helper the browser tests already
 * call, `liveApp`, cannot raise its own budget: it runs inside `beforeAll`, which is too late.
 *
 * HOW IT DECIDES. The file's own source names what it starts, and this module holds that list. A
 * new test that starts a browser has to write one of these words to do it, so it gets the budget
 * without anybody remembering to ask for it.
 * tests/a-test-that-starts-something-gets-the-time-to-do-it.test.ts keeps the list honest: it goes
 * red when a module under tests/ starts a browser or a process and this list does not know about
 * it.
 */

/** Thirty seconds for a test that starts something. */
export const A_TEST_THAT_STARTS_SOMETHING = 30_000

/**
 * Four minutes for a hook in such a file.
 *
 * This is the number the browser tests already pass by hand — sixty-eight files end a `beforeAll`
 * or an `afterAll` with `, 240_000)` — and a server on a busy machine has taken more than sixty
 * seconds to answer, which is why `waitUntilReady` in helpers.ts waits ninety. Thirteen of these
 * files have an `afterAll` with no number of its own, and that hook stops two servers and waits up
 * to ten seconds for each port to come back; on the runner's ten-second default it has nothing to
 * spare. Saying it once here means a file no longer has to remember to say it.
 */
export const A_HOOK_THAT_STARTS_SOMETHING = 240_000

/**
 * SIXTY SECONDS FOR A HOOK IN A FILE THAT IMPORTS THE SERVER, AND THE TESTS KEEP FIVE.
 *
 * WHY. Problem `NmTNODGbbGaC`. A file whose `beforeEach` calls `freshDb()` and then `apiApp()` imports
 * the server cold in its first hook, because `freshDb` calls `vi.resetModules()` and the first import
 * of the run also builds the schema and transforms the server's files. On vitest's ten-second hook
 * default, six such files went red with "Hook timed out in 10000ms" at load 45 to 87, and passed when
 * run again. Nothing was wrong with the code. Problems `lqBrJv8_Jsvk` and `VeXZP9TPPFMX` were the same
 * hook in two more files, each fixed by hand with a number of its own.
 *
 * WHAT WAS MEASURED. Wave 13j round 46, 10 October 2026, on this machine's 20 cores, with no load made
 * for the purpose: the first hook took 4,474, 4,751 and 4,800 ms at load 11.6 to 11.9 (2.7 s of it
 * `freshDb`, 1.8 to 2.0 s `apiApp`), and each later hook in the same file took 246 to 312 ms. Problem
 * `NmTNODGbbGaC` records 12.4 s for the same first case at load 49. That is about 4 s more for each
 * unit of load per core, so at load 96, the highest recorded on this machine (problem `lqBrJv8_Jsvk`),
 * it comes to about 22 s. Sixty seconds is nearly three times that, and is the number those two files
 * were already given by hand.
 *
 * WHY NOT THE LONG BUDGET ABOVE. The server here answers through `inject`, inside the test process. It
 * starts nothing that has to be waited for, and only the first hook is slow. So only the hooks get
 * more time, and a test in such a file that hangs still fails at five seconds.
 */
export const A_HOOK_THAT_IMPORTS_THE_SERVER = 60_000

/**
 * HOW A FILE IS SEEN TO IMPORT THE SERVER: it writes `apiApp`, the helper in helpers.ts that does it,
 * or awaits an import of src/server/index.ts by itself, as six files do. A type that only names it
 * (`typeof import(...)`) imports nothing and is not counted. A file that only calls `freshDb` is not
 * counted. Its cold hook took 2.7 s in the same measurement, and no such file has been recorded going
 * red at ten seconds.
 */
export const SERVER_IMPORTS: readonly RegExp[] = [/\bapiApp\b/, /\bawait\s+import\(\s*['"]\.\.\/src\/server\/index\.ts['"]\s*\)/]

/** Does this test file import the server, cold, in a hook? */
export function importsTheServer(source: string): boolean {
  return SERVER_IMPORTS.some((word) => word.test(source))
}

/**
 * HOW LONG ONE WAIT INSIDE SUCH A TEST MAY LAST: WHATEVER IS LEFT OF THE TEST'S OWN BUDGET.
 *
 * WHY NOT A NUMBER OF ITS OWN. Problem `jddGW981fri2`. A browser test waited ten seconds for the
 * composer, inside the thirty this rule gives it, and went red at load average 12 on a page that drew
 * correctly a moment later. Its ten was a second number for the same wait, and it was the smaller
 * one. A wait that asks this clock instead gets every millisecond the test still has, so raising the
 * rule's number raises every wait with it.
 *
 * WHY IT STOPS SHORT OF THE END. When the runner's own timer ends a test, it says only "Test timed
 * out", and nobody can tell which wait ran out. So each wait ends `KEPT_FOR_THE_FAILURE` before the
 * test does, and Playwright's own error, which names what it was waiting for, is the one reported.
 */
export const KEPT_FOR_THE_FAILURE = 2_000

/** What a test is told about itself: its budget, and when it started. */
export interface ATestsOwnTask {
  readonly timeout: number
  readonly result?: { readonly startTime?: number }
}

/** The time one test has left, for the waits inside it. */
export interface TheTimeLeft {
  /** Milliseconds a wait for `what` may take. It throws, naming `what`, when none are left. */
  forAWait: (what: string) => number
}

/**
 * The clock for one running test. Pass it the test's own task: `it('…', async ({ task }) => …)`.
 *
 * IT FAILS RATHER THAN GUESSING when the runner has not said when the test started, because a clock
 * with no start would hand out a whole budget to every wait and bring back the fault above.
 */
export function theTimeLeftIn(task: ATestsOwnTask): TheTimeLeft {
  const startedAt = task.result?.startTime
  if (typeof startedAt !== 'number') {
    throw new Error('The runner did not say when this test started, so nothing can say how long its waits may last.')
  }
  return {
    forAWait(what: string): number {
      const used = Date.now() - startedAt
      const left = task.timeout - KEPT_FOR_THE_FAILURE - used
      if (left <= 0) {
        throw new Error(
          `No time was left to wait for ${what}: this test has ${String(task.timeout)} ms and had used ` +
            `${String(used)} ms before that wait began.`,
        )
      }
      return left
    },
  }
}

/** One word a test file writes when it starts something outside the test process. */
export interface Starter {
  /** The word itself, matched whole. */
  readonly name: string
  /** The test-only module that exports it, or null when the test file starts the thing itself. */
  readonly from: string | null
  /** What writing it starts. */
  readonly starts: string
}

/**
 * THE WORDS. Each one is a thing that starts outside this process and has to be waited for.
 *
 * `liveApp` is named rather than helpers.ts, because helpers.ts is the harness for every test in
 * the suite, pure and live alike: importing it says nothing about whether this file starts
 * anything. Calling `liveApp` does.
 *
 * WHAT `liveApp` STARTS CHANGED ON 23 SEPTEMBER 2026 AND THE WORD DID NOT. It used to start an API
 * server, a Vite and a Chromium for every test. It now starts an API server for every test, and,
 * the first time a worker asks, one Chromium the whole worker shares and one build of the page the
 * whole RUN shares. That is less than it was and it is still a server, a browser and a child
 * process, so the file that writes the word still needs the long budget. The hooks need it most on
 * the first test of a worker, which is the one that pays for the browser and may pay for the
 * build.
 *
 * `createServer` is here because a server started inside the test process is still a server: it
 * binds a port and answers over a socket, and both take longer on a loaded machine. Three files
 * start one that way — tests/governance-from-another-machine.test.ts,
 * tests/the-browser-app-waits-for-the-api-to-answer.test.ts and
 * tests/the-browser-app-says-it-is-on-no-list-only-while-it-is.test.ts. None of them has been
 * measured going red, and in two of the three the starting is done by a hook that already carries
 * a budget of its own; they are here because the rule says "a browser or a server" and they drive
 * a real one. A file that only reads a Vite configuration without starting anything —
 * tests/the-browser-app-writes-itself-down-once.test.ts — stays on the short side, which is right.
 */
export const STARTERS: readonly Starter[] = [
  { name: 'runRealAdmissionInterleaving', from: null, starts: 'the message worker version probe against an isolated test office' },
  { name: 'probeWithinTestProcessGroup', from: null, starts: 'a bounded version stand-in in the test process group' },
  { name: 'privatePoolFixture', from: null, starts: 'a bounded invented pool helper through runPoolStandIn when its writer is invoked' },
  { name: 'privateLoginBrowser', from: null, starts: 'an isolated component through drawInABrowser with invented replies' },
  { name: 'runPoolStandIn', from: 'private-sandbox-login-pool-stand.ts', starts: 'a bounded invented flock helper in a made-up home' },
  { name: 'stableUpgradeFixture', from: 'stable-upgrade-fixture.ts', starts: 'the shared synthetic stable upgrade repositories, database and recorded service groups' },
  { name: 'crashTheUpgradeAt', from: 'a-closed-stable-upgrade.ts', starts: 'a closed stable upgrade in a program of its own, ended by SIGKILL at one journal boundary, and a restart of the made-up office' },
  { name: 'startUpgradeProgram', from: null, starts: 'a recorded process group for the executable identity tests' },
  { name: 'startUpgradeOffice', from: null, starts: 'a supervisor, server and worker through the real tsx, on a free loopback port' },
  { name: 'unreadableUpgradeProgram', from: null, starts: 'a Python process that makes its executable unreadable' },
  { name: 'actualBootstrapOffice', from: 'stable-bootstrap-actual-office-fixture.ts', starts: 'the actual development Office and its stable bootstrap preparation and handoff' },
  { name: 'liveApp', from: 'helpers.ts', starts: 'an API server, and the first time in a worker a Chromium and a build of the page' },
  { name: 'inspectorFixture', from: 'inspector-tool-fixture.ts', starts: 'a stand-in HTTP office and an inspector tool process' },
  { name: 'checkViewLedger', from: 'check-view-stand-ins.ts', starts: 'a stand-in HTTP ledger for check-view launcher processes' },
  { name: 'drawInABrowser', from: 'what-the-browser-draws.ts', starts: 'a Chromium' },
  { name: 'tokensInABrowser', from: 'tokens-in-a-browser.ts', starts: 'a Chromium' },
  { name: 'packedHeadFixture', from: 'packed-head-fixture.ts', starts: 'git, to make and pack a repository' },
  { name: 'largePackedCommitFixture', from: 'large-packed-commit-fixture.ts', starts: 'git, to make and pack a repository with a large object' },
  { name: 'startAHolder', from: 'terminal-holder-stand.ts', starts: 'a terminal holder process, and in most files that write it a scratch API server too' },
  { name: 'aStandInRegistry', from: 'harness-stand-ins.ts', starts: 'a stand-in package registry (npm and PyPI answers) served over HTTP' },
  { name: 'runToItsEnd', from: 'the-shells-office-stand-in.ts', starts: 'a process run to its end, and in most files that write it a stand-in office served over HTTP' },
  { name: 'theListsThatLostTheirDoneLine', from: 'the-moved-test-files.ts', starts: "git, to read each wave list's history" },
  { name: 'aMadeUpSandboxRepo', from: 'a-made-up-sandbox-repo.ts', starts: "git, to make a repository that reads a checkout's objects" },
  { name: 'runOpenCode', from: 'real-opencode-stand-in.ts', starts: 'the real OpenCode as a process of its own, against a stand-in model served over HTTP on loopback' },
  { name: 'aStandInOwner', from: 'the-owner-watching-gate.ts', starts: 'a stand-in for the test worker, a Node process a case can kill with SIGKILL' },
  { name: 'aSealedRun', from: 'a-seal-read-fixture.ts', starts: "git, to make and seal a run's worktree, and the office's seal-read thread when a check door reads that seal" },
  { name: 'aFolderShutAfterTheCopy', from: 'a-folder-shut-after-the-copy.ts', starts: 'a Node process of its own, which shuts a folder once a copy appears in it and then reads a named pipe' },
  { name: 'aWorldOfMethodRuns', from: 'a-world-of-method-runs.ts', starts: "git, to make the made-up run's worktree that its seal reads" },
  { name: 'aWorktreeOfItsOwn', from: 'a-worktree-of-its-own.ts', starts: "git, to make a made-up run's worktree and the cut its changed paths are read from" },
  { name: 'chromium', from: null, starts: 'a browser this file launches itself' },
  { name: 'child_process', from: null, starts: 'a process this file spawns itself' },
  { name: 'createServer', from: null, starts: 'a server this file starts inside the test process' },
]

const WHOLE_WORDS = STARTERS.map((starter) => new RegExp(`\\b${starter.name}\\b`))

/** Does this test file start a browser, a server or any other process of its own? */
export function startsSomethingOutsideTheTestProcess(source: string): boolean {
  return WHOLE_WORDS.some((word) => word.test(source))
}
