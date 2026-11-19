// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK RUN BY HAND WRITES NOTHING, AND SAYS WHAT IT IS.
 *
 * Problem WnVjoGd1bXx8. On 28 September 2026 an agent ran `node tools/session-hook.mjs start` by hand to see what it says,
 * and it filed session lv8MZDIoDnTV in the live office. Only a rule to remember stood against that, and the office is
 * to stop such things itself. Claude Code hands every hook a JSON payload naming its
 * session; with none, the hook now files, notes and asks nothing.
 *
 * WHAT IS REAL. The hook is the real one, run as its own process against the product's own API on a port of its own,
 * over a throwaway database. No live office is reached.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the check for a payload taken out of tools/session-hook.mjs, and both cases of
 * a run by hand go red on the session record they file. And the hook printing a line of its own rather than the one
 * declared in src/config/the-hook-run-by-hand.mjs, whose mark the start-cost measure reads (problem RwLABKMM2OFw): both
 * cases of a run by hand go red on the line. And the line naming tools/session-hook.mjs again, which is only the one-line
 * file that imports the hook's code: the case that writes the line out goes red.
 *
 * AND A PIPE THAT CLOSES LATE STILL HANDS THE HOOK ITS PAYLOAD (problem xeY4z0EQJA8l). Reading `process.stdin.isTTY`
 * makes fd 0 non-blocking, and `readFileSync(0)` then throws EAGAIN while the pipe is still open, even after the payload
 * has arrived; the hook took that for no payload and wrote nothing. Measured in round 52 of the identity and agents line:
 * 5 of 5 starts lost the payload when the pipe closed 300 ms late. WHAT GOES RED: `process.stdin.isTTY` put back in
 * place of `isatty(0)`, and both late cases say the hook wrote nothing.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { theHookWroteNothing, theLineOfTheHookRunByHand } from '../src/config/the-hook-run-by-hand.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-hook-by-hand-'))
})

/** The notes the hook leaves beside the checkout, removed so one test cannot see another's. */
const notesWritten: string[] = []
afterEach(async () => {
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** How late the payload is written, or the pipe closed, in the cases of a pipe that is slow to close. */
const LATE_MS = 300

/**
 * Run the hook's start with this on stdin, as a person or Claude Code would. `late` holds back the closing of the pipe, or
 * the payload itself, by LATE_MS.
 */
async function runHook(stdin: string, late?: 'close' | 'payload'): Promise<{ code: number; stdout: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: url, MOLE_OFFICE_WORKSPACE: WORKSPACE, MOLE_OFFICE_DB: t.file, MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details') }
  delete env['TMUX_PANE']
  return await new Promise((resolve) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      resolve({ code: error === null ? 0 : ((error as { code?: number }).code ?? 1), stdout })
    })
    // A HOOK THAT HAS ALREADY STOPPED closes the pipe under a late write. That is the failure being tested, so its
    // EPIPE is left to the expectations below rather than thrown at the test runner.
    child.stdin?.on('error', () => undefined)
    if (late === undefined) child.stdin?.end(stdin)
    else if (late === 'close') {
      child.stdin?.write(stdin)
      setTimeout(() => child.stdin?.end(), LATE_MS)
    } else setTimeout(() => child.stdin?.end(stdin), LATE_MS)
  })
}

/** How many session records the office holds. */
async function sessions(): Promise<number> {
  const said = await fetch(`${url}/api/records?kind=session&limit=500`, {
    headers: { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-reader' },
  })
  const body = (await said.json()) as { records?: unknown[] }
  return (body.records ?? []).length
}

describe('the session hook run by hand', () => {
  it.each([
    ['nothing on stdin', ''],
    ['a payload that names no session', '{}'],
  ])('files no session with %s, and says what it is', async (_what, stdin) => {
    const before = await sessions()
    const ran = await runHook(stdin)
    expect(ran.code).toBe(0)
    // THE LINE IS THE ONE DECLARED, whose mark the start-cost measure reads (problem RwLABKMM2OFw).
    expect(ran.stdout).toBe(`${theLineOfTheHookRunByHand()}\n`)
    expect(theHookWroteNothing(ran.stdout)).toBe(true)
    expect(await sessions(), 'a run by hand filed a session record').toBe(before)
  })

  // THE LINE NAMES THE FILE THE HOOK'S CODE IS IN. tools/session-hook.mjs is one line that imports it. The words are
  // written out here, because the case above reads them from the same function the hook prints.
  // MUTATION: put tools/session-hook.mjs back as the file the line names, in src/config/the-hook-run-by-hand.mjs.
  it("names for-agents/session-hook.mjs, where the hook's code is", async () => {
    const ran = await runHook('')
    expect(ran.stdout).toBe(
      'MOLE OFFICE — this is for-agents/session-hook.mjs, the hook Claude Code runs at the start of a session, at the end of ' +
        'each turn and at its end, handing it a JSON payload on stdin that names the session. It was run with no such ' +
        'payload, so it wrote nothing. Its tests are the tests/the-hook-*.test.ts files.\n',
    )
  })

  it('still files the session when Claude Code names it', async () => {
    const before = await sessions()
    const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
    notesWritten.push(`session-${id}.json`)
    const ran = await runHook(JSON.stringify({ session_id: id, hook_event_name: 'SessionStart', cwd: scratch }))
    expect(ran.code).toBe(0)
    expect(theHookWroteNothing(ran.stdout), 'a run Claude Code named said it wrote nothing').toBe(false)
    expect(await sessions()).toBe(before + 1)
  })

  // Problem xeY4z0EQJA8l. MUTATION: put `process.stdin.isTTY` back in place of `isatty(0)` in readHookInput.
  it.each([
    ['the pipe closes', 'close'],
    ['the payload comes', 'payload'],
  ] as const)('still files the session when %s late', async (_what, late) => {
    const before = await sessions()
    const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
    notesWritten.push(`session-${id}.json`)
    const ran = await runHook(JSON.stringify({ session_id: id, hook_event_name: 'SessionStart', cwd: scratch }), late)
    expect(ran.code).toBe(0)
    expect(theHookWroteNothing(ran.stdout), `the hook lost a payload whose ${late === 'close' ? 'pipe closed' : 'bytes came'} ${String(LATE_MS)} ms late`).toBe(false)
    expect(await sessions()).toBe(before + 1)
  })
})
