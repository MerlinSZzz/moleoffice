// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOX MEMORY LIMIT RUNS ONLY ITS FIXED COMMAND, AND SAYS WHAT HAPPENED, from the owner.
 *
 * src/config/sandbox-memory-cap.mjs runs `pkexec systemctl set-property <slice> MemoryMax=60G` or `pkexec systemctl
 * revert <slice>`, and reads back `systemctl show <slice> -p MemoryMax --value`. Every case here runs stand-in pkexec
 * and systemctl scripts in a scratch folder, passed through `programs`: each notes its argv and answers as the case
 * tells it. Nothing runs pkexec, sudo or the real systemctl, and this machine's slice is never touched.
 *
 *   1. The press on runs exactly the fixed argv, and is done only when the read afterwards says 60G; the press off
 *      runs exactly `revert`. The fixed commands are the ones the page shows.
 *   2. 126 is cancelled and 127 is not authorized; neither reads the limit as changed.
 *   3. Any other exit is failed, with pkexec's first line of stderr.
 *   4. An exit of 0 whose read afterwards does not agree is failed, not done.
 *   5. A pkexec that never exits has its process group stopped after the wait (a child it started too), the press
 *      answers no dialog, and no process of the group is left.
 *   6. The read: 60 GiB in bytes is on, infinity is off, another number is other, and a systemctl that fails, is
 *      missing, or a system that is not Linux is unreadable. An unreadable limit runs nothing.
 *   7. A limit already as asked runs nothing.
 *
 * MUTATIONS (each after a control run; the hand-back names the runs):
 *   - MemoryMax=60G written as MemoryMax=60g in theCommand: case 1 goes red.
 *   - the 126 branch taken out: case 2 goes red.
 *   - the read afterwards taken out (done straight after exit 0): case 4 goes red.
 *   - SIGTERM sent to the pid instead of the group: case 5 goes red (the child is left).
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  pressTheSandboxCap,
  readTheSandboxCap,
  THE_CAP_OFF_COMMAND,
  THE_CAP_OFF_TEXT,
  THE_CAP_ON_COMMAND,
  THE_CAP_ON_TEXT,
  THE_SANDBOX_CAP_BYTES,
} from '../src/config/sandbox-memory-cap.mjs'
import { SANDBOX_SLICE } from '../src/config/sandbox-slice.mjs'

let scratch = ''
let state = ''
let log = ''
let pidFile = ''
let programs = { pkexec: '', systemctl: '' }

/** What the stand-ins answer: pkexec's exit or that it hangs, and what systemctl show prints before and after. */
function tell(said: { pkexec?: number | 'hang'; stderr?: string; limit?: string; after?: string; showFails?: boolean }): void {
  const now = existsSync(state) ? (JSON.parse(readFileSync(state, 'utf8')) as Record<string, unknown>) : {}
  writeFileSync(state, JSON.stringify({ ...now, ...said }))
}

/** Every call the stand-ins took, as the program's name and its arguments. */
function calls(): string[][] {
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as string[])
}

/** Whether anything of a process group is there. */
function groupIsThere(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'ESRCH'
  }
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'sandbox-memory-cap-test-'))
  state = join(scratch, 'state.json')
  log = join(scratch, 'calls.log')
  pidFile = join(scratch, 'pids.json')
  const head = (name: string) => `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify([${JSON.stringify(name)}, ...args]) + '\\n')
const state = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const save = () => fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(state))
`
  // THE STAND-IN pkexec: notes its argv; hangs, with a child of its own in its group, or exits as told. On 0 the limit
  // becomes what the case said comes after.
  programs = { pkexec: join(scratch, 'pkexec'), systemctl: join(scratch, 'systemctl') }
  writeFileSync(
    programs.pkexec,
    `${head('pkexec')}
if (state.pkexec === 'hang') {
  const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ pkexec: process.pid, child: child.pid }))
  setInterval(() => {}, 1000)
} else {
  if (state.stderr) process.stderr.write(state.stderr)
  if (state.pkexec === 0 && state.after !== undefined) { state.limit = state.after; save() }
  process.exit(state.pkexec)
}
`,
  )
  writeFileSync(
    programs.systemctl,
    `${head('systemctl')}
if (state.showFails) { process.stderr.write('Failed to connect to bus: No such file or directory\\n'); process.exit(1) }
if (args.join(' ') !== 'show ${SANDBOX_SLICE} -p MemoryMax --value') { process.stderr.write('The stand-in does not take: ' + args.join(' ') + '\\n'); process.exit(1) }
process.stdout.write(state.limit + '\\n')
`,
  )
  chmodSync(programs.pkexec, 0o755)
  chmodSync(programs.systemctl, 0o755)
})

afterAll(() => {
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

beforeEach(() => {
  rmSync(log, { force: true })
  rmSync(pidFile, { force: true })
  writeFileSync(state, JSON.stringify({ pkexec: 0, limit: 'infinity' }))
})

const ON_ARGS = ['set-property', SANDBOX_SLICE, 'MemoryMax=60G']
const OFF_ARGS = ['revert', SANDBOX_SLICE]
const SHOW = ['systemctl', 'show', SANDBOX_SLICE, '-p', 'MemoryMax', '--value']

describe('the sandbox memory limit', () => {
  it('1: the press runs exactly the fixed command, and is done only when the read afterwards agrees', async () => {
    expect(THE_CAP_ON_COMMAND).toEqual(['/usr/bin/pkexec', '/usr/bin/systemctl', ...ON_ARGS])
    expect(THE_CAP_OFF_COMMAND).toEqual(['/usr/bin/pkexec', '/usr/bin/systemctl', ...OFF_ARGS])
    expect(Object.isFrozen(THE_CAP_ON_COMMAND) && Object.isFrozen(THE_CAP_OFF_COMMAND)).toBe(true)
    expect(THE_CAP_ON_TEXT).toBe(`/usr/bin/pkexec /usr/bin/systemctl set-property ${SANDBOX_SLICE} MemoryMax=60G`)
    expect(THE_CAP_OFF_TEXT).toBe(`/usr/bin/pkexec /usr/bin/systemctl revert ${SANDBOX_SLICE}`)

    tell({ pkexec: 0, limit: 'infinity', after: String(THE_SANDBOX_CAP_BYTES) })
    const on = await pressTheSandboxCap(true, { programs, platform: 'linux' })
    expect(on).toMatchObject({ outcome: 'done', reading: { held: 'on', bytes: THE_SANDBOX_CAP_BYTES } })
    expect(calls()).toEqual([SHOW, ['pkexec', programs.systemctl, ...ON_ARGS], SHOW])

    rmSync(log)
    tell({ pkexec: 0, after: 'infinity' })
    const off = await pressTheSandboxCap(false, { programs, platform: 'linux' })
    expect(off).toMatchObject({ outcome: 'done', reading: { held: 'off' } })
    expect(calls()).toEqual([SHOW, ['pkexec', programs.systemctl, ...OFF_ARGS], SHOW])
  })

  it('2: 126 is cancelled and 127 is not authorized, and neither reads the limit again', async () => {
    tell({ pkexec: 126, stderr: 'Error executing command as another user: Request dismissed\n' })
    expect(await pressTheSandboxCap(true, { programs, platform: 'linux' })).toMatchObject({ outcome: 'cancelled' })
    tell({ pkexec: 127, stderr: 'Error executing command as another user: No authentication agent found.\n' })
    const refused = await pressTheSandboxCap(true, { programs, platform: 'linux' })
    expect(refused).toMatchObject({ outcome: 'not authorized', reason: 'Error executing command as another user: No authentication agent found.' })
    expect(refused.says).toContain('Nothing was changed')
    expect(calls().filter((call) => call[0] === 'systemctl')).toEqual([SHOW, SHOW])
  })

  it("3: any other exit is failed, with pkexec's first line of stderr", async () => {
    tell({ pkexec: 1, stderr: '\nFailed to set unit properties on system-molesandboxes.slice: Unit not loaded.\nsecond line\n' })
    const failed = await pressTheSandboxCap(true, { programs, platform: 'linux' })
    expect(failed).toMatchObject({ outcome: 'failed', reason: 'Failed to set unit properties on system-molesandboxes.slice: Unit not loaded.' })
  })

  it('4: an exit of 0 whose read afterwards does not agree is failed, not done', async () => {
    tell({ pkexec: 0, limit: 'infinity', after: 'infinity' })
    const said = await pressTheSandboxCap(true, { programs, platform: 'linux' })
    expect(said).toMatchObject({ outcome: 'failed', reading: { held: 'off' } })
  })

  it('5: a pkexec that never exits has its group stopped after the wait, answers no dialog, and leaves nothing', async () => {
    tell({ pkexec: 'hang' })
    const started = Date.now()
    const said = await pressTheSandboxCap(true, { programs, platform: 'linux', waitMs: 1_500 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_500)
    expect(said).toMatchObject({ outcome: 'no dialog' })
    expect(said.says).toContain('Nothing was changed')
    const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as { pkexec: number; child: number }
    expect(groupIsThere(pids.pkexec), 'the stand-in pkexec started its own process group').toBe(false)
    let childThere = true
    try {
      process.kill(pids.child, 0)
    } catch {
      childThere = false
    }
    expect(childThere, 'the child pkexec started is left running').toBe(false)
    expect(calls().filter((call) => call[0] === 'systemctl')).toEqual([SHOW])
  }, 20_000)

  it('6: reads on, off, another limit and no answer, and runs nothing when it cannot read', async () => {
    tell({ limit: String(THE_SANDBOX_CAP_BYTES) })
    expect(await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'linux' })).toMatchObject({ held: 'on', bytes: THE_SANDBOX_CAP_BYTES })
    tell({ limit: 'infinity' })
    expect(await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'linux' })).toMatchObject({ held: 'off', bytes: null })
    tell({ limit: String(16 * 1024 ** 3) })
    expect(await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'linux' })).toMatchObject({ held: 'other', bytes: 16 * 1024 ** 3 })
    tell({ limit: '[not set]' })
    expect(await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'linux' })).toMatchObject({ held: 'unreadable' })
    tell({ showFails: true })
    const noBus = await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'linux' })
    expect(noBus).toMatchObject({ held: 'unreadable' })
    expect(noBus.says).toContain('Failed to connect to bus')
    expect(await readTheSandboxCap({ systemctl: join(scratch, 'no-such-systemctl'), platform: 'linux' })).toMatchObject({ held: 'unreadable' })
    expect(await readTheSandboxCap({ systemctl: programs.systemctl, platform: 'darwin' })).toMatchObject({ held: 'unreadable' })
    rmSync(log)
    expect(await pressTheSandboxCap(true, { programs, platform: 'linux' })).toMatchObject({ outcome: 'not readable' })
    expect(calls().filter((call) => call[0] === 'pkexec')).toEqual([])
  })

  it('7: a limit already as asked runs nothing', async () => {
    tell({ limit: String(THE_SANDBOX_CAP_BYTES) })
    expect(await pressTheSandboxCap(true, { programs, platform: 'linux' })).toMatchObject({ outcome: 'already' })
    tell({ limit: 'infinity' })
    expect(await pressTheSandboxCap(false, { programs, platform: 'linux' })).toMatchObject({ outcome: 'already' })
    expect(calls().filter((call) => call[0] === 'pkexec')).toEqual([])
  })
})
