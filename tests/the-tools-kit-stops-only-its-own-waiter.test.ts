// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT IN tools/kit/ STOPS A RECORDED PROCESS GROUP ONLY WHEN THAT GROUP IS STILL THIS HANDLE'S WAITER. Check
 * 06uOvyWNB10M, chapter 2 rule 1 of the office regulations.
 *
 * This is tests/the-kit-stops-only-its-own-waiter.test.ts, proved again on `tools/kit/waiter-groups.sh`,
 * `tools/kit/stop-waiter.sh` and `tools/kit/waiter-identity.sh`, the copies that sit beside the kit's waiter with no
 * personal default. That file goes on testing the three under design/agents/kit, which live
 * agents still run by their paths.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The kit README (design/agents/kit/README.md, step 3) records each waiter's process-group id in waiter.pgids and says to
 * stop a waiter with `kill -- -<pgid>`. The file is only ever appended to, so a group id written for a waiter that ended
 * long ago can later be the id of an unrelated process group, and the step would stop that instead. Chapter 2 asks that
 * what matched is printed before anything is signalled.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * A stand-in waiter (a script named waiter.sh that only sleeps) is started in a temporary folder with the README's own
 * wrapper line, so its group id is appended to a temporary waiter.pgids. The group id of an unrelated `setsid sleep` is
 * appended to the same file, standing for a recorded id now used by somebody else. No real waiter is touched.
 *   (a) waiter-groups.sh prints, for each recorded group, whether it is alive, what it runs, and whether it is the waiter
 *       of this handle.
 *   (b) stop-waiter.sh refuses the unrelated group, prints what it runs, sends nothing, and leaves it alive.
 *   (c) stop-waiter.sh refuses an id the file does not record.
 *   (d) stop-waiter.sh stops the stand-in waiter's group, after printing what it runs.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, after a green control (see the commit message)
 * ---------------------------------------------------------------------------------------
 *
 * In tools/kit/stop-waiter.sh, make the identity check always pass. (b) goes red: the unrelated group is stopped.
 * (d) goes red with it, because it checks the unrelated group is still alive.
 * In tools/kit/waiter-identity.sh, compare the leader's whole script path with tools/kit's own waiter.sh instead of
 * comparing only the file's name. (f) goes red: a waiter started from the old kit's folder is no longer the waiter.
 *
 * WHY (f) IS HERE. The old path design/agents/kit/waiter.sh is to become a forwarder to tools/kit/waiter.sh, and the
 * loops already running were started from the old path. The tools here must still know such a loop as the waiter of
 * its handle, so they read the script's file name, waiter.sh, and not the folder it was started from.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PROCESS THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2)
 * ---------------------------------------------------------------------------------------
 *
 * The stand-in waiter, the unrelated sleep and the look-alike are each started under setsid, and their group ids are
 * recorded the moment they are known. The kit's scripts and the shells that start the three are run with
 * `detached: true`, each in a new group, and waited for. The cleanup stops every recorded group, TERM first and KILL
 * after two seconds, and nothing by a name or a pattern.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const KIT = fileURLToPath(new URL('../tools/kit/', import.meta.url))
const HANDLE = 'test-kit-handle'
let dir = ''
let pgids = ''
/** The waiter.pgids of case (f), which records only the waiter started from the old kit's folder. */
let oldPgids = ''
let waiterGroup = 0
let unrelatedGroup = 0
let lookalikeGroup = 0
/**
 * EVERY PROCESS GROUP THIS FILE STARTED, recorded the moment its id is known, so the cleanup stops each one even when a
 * case or the setup fails part-way (check FwwgzHBjpErx: two stand-in waiters of this file ran for 6 h 43 min after a
 * setup that failed before it had read the waiter's id, so the cleanup had nothing to stop).
 */
const started = new Set<number>()

/** Whether any process in the group answers a null signal. */
function alive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

/** Send a signal to a whole group this file recorded. A group that has already ended is not an error. */
function signalTheGroup(group: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-group, signal)
  } catch {
    // The group ended before the signal, which is what the cleanup wanted.
  }
}

/**
 * Run one command in a new process group of its own and wait for it. If it has not ended within ten seconds its group
 * is stopped by that id and the run fails, so no case can leave it running.
 */
async function inItsOwnGroup(command: string, args: string[]): Promise<{ status: number | null; out: string }> {
  // NOT PUT ON `started`: this group is waited for here, and its id may belong to somebody else by the cleanup.
  const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) signalTheGroup(child.pid, 'SIGKILL')
  }, 10_000)
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`${command} ${args.join(' ')} was still running after ten seconds, so its group was stopped`)
  return { status, out }
}

async function until(test: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!test()) {
    if (Date.now() > end) throw new Error('the condition did not come true in time')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

function run(script: string, ...args: string[]): Promise<{ status: number | null; out: string }> {
  return inItsOwnGroup('bash', [join(KIT, script), ...args])
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kit-waiter-'))
  pgids = join(dir, 'waiter.pgids')
  const standIn = join(dir, 'waiter.sh')
  writeFileSync(standIn, '#!/bin/sh\n# A stand-in waiter: it holds nothing, it only lives.\nwhile true; do sleep 1; done\n')
  chmodSync(standIn, 0o755)
  // THE README'S OWN WRAPPER LINE, with the temporary paths put in.
  await inItsOwnGroup('bash', [
    '-c',
    `setsid sh -c 'printf "%s\\n" "$$" >> "$1"; shift; exec nohup "$@"' sh ${pgids} ${standIn} ${HANDLE} test-session test-workspace ${join(dir, 'waiter.out')} ${join(dir, 'env')} > /dev/null 2>&1 < /dev/null & disown`,
  ])
  // THE WRAPPER WRITES THE FILE AFTER THIS COMMAND RETURNS, so the wait asks for the file before reading it.
  await until(() => existsSync(pgids) && readFileSync(pgids, 'utf8').trim() !== '')
  waiterGroup = Number(readFileSync(pgids, 'utf8').trim().split('\n')[0])
  started.add(waiterGroup)
  await until(() => alive(waiterGroup))
  // AN UNRELATED GROUP WHOSE ID THE FILE NOW ALSO RECORDS, as a reused id would be.
  const unrelated = await inItsOwnGroup('bash', ['-c', 'setsid sleep 120 > /dev/null 2>&1 < /dev/null & echo $!'])
  unrelatedGroup = Number(unrelated.out.trim())
  started.add(unrelatedGroup)
  await until(() => alive(unrelatedGroup))
  // AND A GROUP WHOSE LEADER'S COMMAND LINE NAMES waiter.sh AND THE HANDLE, though it runs neither: bash -c with the path in
  // its script text. A check of the whole command line for '/waiter.sh <handle> ' reads it as the waiter (check 5PDAmYI1pxq_).
  // THE LAST ':' KEEPS bash THE LEADER: bash runs the last command of a -c script in its own place, and without it the
  // leader would be the sleep, whose command line names nothing.
  const lookalike = await inItsOwnGroup('bash', ['-c', `setsid bash -c ': ${dir}/waiter.sh ${HANDLE} x; sleep 120; :' > /dev/null 2>&1 < /dev/null & echo $!`])
  lookalikeGroup = Number(lookalike.out.trim())
  started.add(lookalikeGroup)
  await until(() => alive(lookalikeGroup))
  writeFileSync(pgids, `${String(waiterGroup)}\n${String(unrelatedGroup)}\n${String(lookalikeGroup)}\n`)
}, 30_000)

afterAll(async () => {
  // CLEAN UP BY THE GROUP IDS THIS TEST RECORDED, and nothing else. The ids the wrapper wrote into this file's own
  // waiter.pgids are read again here, so a waiter whose id the setup never got to read is stopped too.
  for (const file of [pgids, oldPgids]) {
    if (file === '' || !existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) if (/^[0-9]+$/u.test(line.trim())) started.add(Number(line.trim()))
  }
  const groups = [...started].filter((group) => group > 1)
  for (const group of groups) if (alive(group)) signalTheGroup(group, 'SIGTERM')
  // A GROUP THAT IGNORES TERM IS SENT KILL after two seconds, by the same recorded id.
  const end = Date.now() + 2_000
  while (groups.some(alive) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 100))
  for (const group of groups) if (alive(group)) signalTheGroup(group, 'SIGKILL')
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe("the waiter steps in tools/kit", () => {
  it('(a) prints what each recorded group runs, and which one is the waiter of this handle', async () => {
    const listed = await run('waiter-groups.sh', pgids, HANDLE)
    expect(listed.status, listed.out).toBe(0)
    expect(listed.out).toContain(`${String(waiterGroup)}: alive, the waiter of ${HANDLE}`)
    expect(listed.out).toContain(`${String(unrelatedGroup)}: alive, NOT the waiter of ${HANDLE}`)
    expect(listed.out).toContain('sleep 120')
    expect(listed.out).toContain('1 recorded group is the waiter of')
  })

  it('(b) refuses a recorded group that is not the waiter, says what it runs, and leaves it alive', async () => {
    const refused = await run('stop-waiter.sh', pgids, HANDLE, String(unrelatedGroup))
    expect(refused.status, refused.out).toBe(2)
    expect(refused.out).toContain('sleep 120')
    expect(refused.out).toContain('Nothing was sent.')
    expect(alive(unrelatedGroup), 'the unrelated group was stopped').toBe(true)
  })

  it('(e) reads a group whose leader only names waiter.sh and the handle in its text as NOT the waiter, and will not stop it', async () => {
    const listed = await run('waiter-groups.sh', pgids, HANDLE)
    expect(listed.out).toContain(`${String(lookalikeGroup)}: alive, NOT the waiter of ${HANDLE}`)
    const refused = await run('stop-waiter.sh', pgids, HANDLE, String(lookalikeGroup))
    expect(refused.status, refused.out).toBe(2)
    expect(refused.out).toContain('Nothing was sent.')
    expect(alive(lookalikeGroup), 'the look-alike group was stopped').toBe(true)
  })

  it('(c) refuses a group id the file does not record', async () => {
    const refused = await run('stop-waiter.sh', pgids, HANDLE, '999999')
    expect(refused.status, refused.out).toBe(2)
    expect(refused.out).toContain('does not record')
    expect(refused.out).toContain('Nothing was sent.')
  })

  it('(d) stops the waiter of this handle by its recorded group, after printing what it runs', async () => {
    const stopped = await run('stop-waiter.sh', pgids, HANDLE, String(waiterGroup))
    expect(stopped.status, stopped.out).toBe(0)
    expect(stopped.out).toContain(`waiter.sh ${HANDLE}`)
    await until(() => !alive(waiterGroup))
    expect(alive(unrelatedGroup)).toBe(true)
  })

  it('(f) knows a waiter started from another folder, such as the old kit, as the waiter, and stops it', async () => {
    // A STAND-IN WAITER IN A FOLDER SHAPED LIKE THE OLD KIT, inside this file's own temporary folder, started with the
    // README's wrapper line into a waiter.pgids of its own, so cases (a) to (e) are not changed by it.
    const oldKit = join(dir, 'design', 'agents', 'kit')
    mkdirSync(oldKit, { recursive: true })
    const standIn = join(oldKit, 'waiter.sh')
    writeFileSync(standIn, '#!/bin/sh\n# A stand-in waiter in the old folder: it holds nothing, it only lives.\nwhile true; do sleep 1; done\n')
    chmodSync(standIn, 0o755)
    oldPgids = join(dir, 'old-kit-waiter.pgids')
    await inItsOwnGroup('bash', [
      '-c',
      `setsid sh -c 'printf "%s\\n" "$$" >> "$1"; shift; exec nohup "$@"' sh ${oldPgids} ${standIn} ${HANDLE} test-session test-workspace ${join(dir, 'old-waiter.out')} ${join(dir, 'env')} > /dev/null 2>&1 < /dev/null & disown`,
    ])
    await until(() => existsSync(oldPgids) && readFileSync(oldPgids, 'utf8').trim() !== '')
    const oldGroup = Number(readFileSync(oldPgids, 'utf8').trim().split('\n')[0])
    started.add(oldGroup)
    await until(() => alive(oldGroup))

    const listed = await run('waiter-groups.sh', oldPgids, HANDLE)
    expect(listed.out).toContain(`${String(oldGroup)}: alive, the waiter of ${HANDLE}`)
    expect(listed.out).toContain('design/agents/kit/waiter.sh')
    expect(listed.out).toContain('1 recorded group is the waiter of')

    const stopped = await run('stop-waiter.sh', oldPgids, HANDLE, String(oldGroup))
    expect(stopped.status, stopped.out).toBe(0)
    await until(() => !alive(oldGroup))
  })
})
