// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S OWN SERVER THAT STOPS DURING A CASE FAILS THAT CASE WITH ITS EXIT CODE AND LAST LINES.
 *
 * Problem `tiiuVJkCrNjs`. A browser test once failed in the merge queue with ECONNREFUSED and
 * nothing else. Its own API server had stopped during the case, and tests/helpers.ts kept the
 * server's last lines but showed them only when a server failed to start.
 *
 * HOW IT IS MEASURED. What is checked is the failure a case really reports, so this file runs vitest
 * on itself, as a separate run. In that run it takes the other branch below: it starts `liveApp`,
 * and during the case it makes the API server print one known line and exit with code 3. Then it
 * asks the server for something, as the queue's test did, and gets ECONNREFUSED. The outer case
 * reads the inner run's JSON report and checks that the failing case says the exit code and carries
 * the known line, and that the inner run's teardown does not say it a second time.
 *
 * HOW THE SERVER IS MADE TO STOP. Under a test the server prints almost nothing, so there is no line
 * of its own this file can count on. So the inner run gives every Node process it starts a small
 * module to load first, through NODE_OPTIONS. In the API server, and only there, that module listens
 * for SIGUSR2: it prints the known line and exits with code 3. It stands in for a server that says
 * something and crashes. Since wave 13t's round 32 `liveApp` starts the server from its build,
 * dist/server-for-tests/server.mjs, with Node itself, so the process the helper holds is the server
 * and the helper sees code 3. The module looks for the build's path as well as the source entry's:
 * the build sets `process.argv[1]` to src/server/index.ts only when it runs, after this module has
 * looked, so with the source entry alone no listener was set and SIGUSR2 ended the server (merge
 * entry va4QKpbf44eO, wave 13t round 34b).
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_SERVER_BROWSER_TESTS_START } from './the-server-browser-tests-start.ts'

/** The variable that makes this file the inner run. Only the outer case below sets it. */
const THE_INNER_RUN = 'A_TEST_SERVER_DIES_IN_THIS_CASE'

/** The line the API server prints just before it exits. */
const THE_LAST_LINE = 'the last line this test server printed before it was stopped on purpose'

/** The code the API server exits with. */
const THE_EXIT_CODE = 3

/**
 * The module the inner run's Node processes load first. It does something only in a process whose
 * command names the server's build or its source entry: the API server, and a tsx that runs it.
 * The case signals the server alone, by the pid the server reports, so a tsx never gets SIGUSR2.
 */
const THE_STAND_IN_CRASH =
  `if (process.argv.some((a) => a === ${JSON.stringify(THE_SERVER_BROWSER_TESTS_START)} || a.endsWith('src/server/index.ts'))) process.on('SIGUSR2', () => {` +
  `process.stderr.write(${JSON.stringify(THE_LAST_LINE + '\n')}, () => process.exit(${String(THE_EXIT_CODE)}))})`

/** The inner case's name, so the outer case can find its result. */
const THE_INNER_CASE = 'asks its server for something after the server has stopped'

const THIS_FILE = fileURLToPath(import.meta.url)
const ROOT = join(THIS_FILE, '..', '..')

/** Wait until nothing in this process group is left, which means the helper has seen tsx exit. */
async function untilTheGroupIsGone(group: number): Promise<void> {
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      process.kill(-group, 0)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return
      throw err
    }
    if (Date.now() > deadline) throw new Error(`process group ${String(group)} was still there after 30 seconds`)
    await new Promise((done) => setTimeout(done, 50))
  }
}

if (process.env[THE_INNER_RUN] === '1') {
  describe('the inner run: a test server stops during a case', () => {
    let app: LiveApp | null = null

    beforeAll(async () => {
      app = await liveApp({ name: 'dies-mid-case', viewport: { width: 800, height: 600 } })
    })

    afterAll(async () => {
      if (app !== null) await app.stop()
    })

    it(THE_INNER_CASE, async () => {
      if (app === null) throw new Error('liveApp did not start')
      const runtime = (await (await fetch(`${app.api}/api/runtime`)).json()) as { process: { pid: number } }
      const pid = runtime.process.pid
      // Field 5 of /proc/<pid>/stat is the process group, which is the tsx process the helper holds.
      const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
      const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
      process.kill(pid, 'SIGUSR2')
      await untilTheGroupIsGone(group)
      // What the queue's test did next: ask the server for something, and get ECONNREFUSED.
      await fetch(`${app.api}/api/health`)
    })
  })
} else {
  describe('a test server that stops during a case', () => {
    it('fails that case with the exit code and the last lines, and says it only once', async () => {
      const folder = mkdtempSync(join(tmpdir(), 'mole-office-dies-mid-case-'))
      try {
        const report = join(folder, 'report.json')
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          [THE_INNER_RUN]: '1',
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=data:text/javascript,${encodeURIComponent(THE_STAND_IN_CRASH)}`.trim(),
        }
        for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) {
          delete env[name]
        }
        // The inner run fails on purpose, so its exit code is not 0 and execFile rejects with what
        // it printed on both outputs. The JSON report is read for the case's failure, and the printed text for a
        // failure of the inner run's hooks, which the JSON report leaves out. A missing report fails below.
        const printed = await promisify(execFile)(
          process.execPath,
          [
            join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
            'run',
            relative(ROOT, THIS_FILE),
            '--reporter=default',
            '--reporter=json',
            `--outputFile.json=${report}`,
          ],
          { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 },
        ).then(
          (done) => done.stdout + done.stderr,
          (failed: { stdout?: string; stderr?: string }) => (failed.stdout ?? '') + (failed.stderr ?? ''),
        )

        const said = JSON.parse(readFileSync(report, 'utf8')) as {
          testResults: {
            message: string
            assertionResults: { title: string; status: string; failureMessages: string[] }[]
          }[]
        }
        const file = said.testResults[0]
        if (file === undefined) throw new Error(`the inner run reported no file: ${JSON.stringify(said)}`)
        const inner = file.assertionResults.find((one) => one.title === THE_INNER_CASE)
        if (inner === undefined) throw new Error(`the inner run has no case "${THE_INNER_CASE}": ${JSON.stringify(file)}`)
        expect(inner.status).toBe('failed')
        const failure = inner.failureMessages.join('\n')
        // The case's own error is still there.
        expect(failure).toContain('fetch failed')
        // And beside it, what the server said before it stopped.
        expect(failure).toContain('the API server')
        expect(failure).toContain("stopped while the test was running, and the test's own teardown did not stop it")
        expect(failure).toContain(`exited with code ${String(THE_EXIT_CODE)}`)
        expect(failure).toContain(THE_LAST_LINE)
        // Said once: `stop()` in the inner afterAll does not say it a second time. The printed text
        // carries each failure once, the case's and any hook's.
        expect(printed).toContain(THE_INNER_CASE)
        expect(printed.split('stopped while the test was running').length - 1).toBe(1)
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }, 240_000)
  })
}
