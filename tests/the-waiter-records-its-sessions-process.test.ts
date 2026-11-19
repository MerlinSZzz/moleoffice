// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REAL WAITER TELLS MOLE OFFICE WHICH CLAUDE PROCESS ITS SESSION IS, AND CARRIES ON EITHER WAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * `tools/hold-the-handle.mjs` itself, started as a child against a throwaway app, exactly as
 * tests/the-waiter-says-why-it-exited.test.ts starts it. Two cases:
 *
 *   1. The waiter finds its session's claude process through `CLAUDE_PID`, the office writes it on
 *      the record the handle is held for, and the waiter says which reading found it.
 *   2. The office REFUSES, and the waiter prints one line saying so, goes on beating — a later beat
 *      really lands — and ends with `exiting: stopped` when a signal stops it. Rule 4 of the
 *      measurement: the kit's loop ends on any `exiting:` line, so a waiter that exited over a
 *      process number would leave the agent's handle unheld and its messages unanswered. That is a
 *      worse failure than the one this whole piece is fixing.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PROCESSES THIS FILE STARTS, AND HOW EACH IS STOPPED
 * ---------------------------------------------------------------------------------------
 *
 * THE FAKE CLAUDE. A link called `claude` pointing at this Node, started detached — which is a
 * `setsid` — with `--resume <conversation>` on its command line, so it is a process the office reads
 * as a claude session of that conversation. Its process group id is its pid, written down as it
 * starts, and it is stopped by that group id and by nothing else (chapter 2, rule 1).
 *
 * THE WAITER, WHICH MUST NOT BE THIS RUNNER'S CHILD. The walk up the parent chain is the waiter's
 * first reading, and a waiter started straight from the runner would walk up into whatever started
 * the runner — inside a Claude Code session that is a real claude process, and the case would be
 * measuring the runner's own session. So the waiter is started through a small shell script that
 * WAITS UNTIL IT HAS BEEN REPARENTED TO PID 1 and only then becomes the waiter. The walk then ends
 * at pid 1 with nothing found, on this machine and on the merge queue's alike, and `CLAUDE_PID` is
 * what answers — which is the kit's own shape, measured on 24 September 2026: all three live kit
 * waiters are children of `systemd --user`. The script writes down its own pid and process group
 * after the wait, so what is stopped is what really ran.
 *
 * NEITHER PROCESS INHERITS A CLAUDE VARIABLE. tests/the-agents-variables.ts takes `CLAUDE_PID` and
 * `CLAUDE_CODE_SESSION_ID` out of every test's environment, and the waiter here is handed the two
 * values this file made up. Nothing talks to any office but the one this file started.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first, 24 September 2026.
 * ---------------------------------------------------------------------------------------
 *
 *   MUTATION. Make a refusal from the process door end the waiter — `theLastLine('refused: …');
 *   process.exit(1)` in place of the printed line in `recordThisSessionsProcess` — and case 2 goes
 *   red: no later beat lands and the last line is the refusal instead of `exiting: stopped`.
 */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''

/** The conversation the fake claude's command line names, and one it does not. */
const ITS_CONVERSATION = '32444539-7b2c-4f1a-9d3e-0a1b2c3d4e5f'
const ANOTHER_CONVERSATION = '99faaeef-1111-2222-3333-444455556666'

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Everything this file started, with the group id to stop it by. */
const started: { what: string; pgid: number }[] = []
let scratch = ''
let transcript = ''
/** The session the first case's waiter holds for, so the second case can let the handle go. */
let theFirstSession = ''

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/**
 * Stop a process group, and say nothing when it has already gone.
 *
 * A GROUP OF ZERO IS NOT A GROUP AND IS NEVER SIGNALLED. `kill(-0)` is `kill(0)`, which means *every
 * process in my own group* — this runner and everything it started. A row on the list holds zero
 * until the process it names has written its group id down, so a case that fails before that must
 * not turn the tidy-up into the end of the run.
 */
function stop(pgid: number): void {
  if (!Number.isInteger(pgid) || pgid <= 0) return
  try {
    process.kill(-pgid, 'SIGKILL')
  } catch {
    // Already gone, which is the ordinary ending once a case has finished with it.
  }
}

/**
 * A PROCESS THE OFFICE READS AS A CLAUDE SESSION OF ONE CONVERSATION.
 *
 * The program's own path has a segment exactly `claude`, which is how a claude process is told from
 * anything else, and `--resume <conversation>` is on its arguments, which is the one tie between a
 * process and a conversation that the office can read for itself.
 */
function aFakeClaude(conversation: string): { pid: number } {
  const link = join(scratch, 'claude')
  if (!existsSync(link)) symlinkSync(process.execPath, link)
  // `--` first, so Node stops reading options and `--resume <conversation>` is an argument of the
  // script rather than a flag Node refuses to start on.
  const child = spawn(link, ['-e', 'setInterval(() => {}, 1_000_000)', '--', '--resume', conversation], {
    detached: true,
    stdio: 'ignore',
  })
  const pid = child.pid as number
  child.unref()
  // `detached` made it a session leader, so its process group id is its pid. Written down as it
  // starts, which is the only number it is ever stopped by.
  started.push({ what: `the fake claude for ${conversation}`, pgid: pid })
  return { pid }
}

/**
 * START THE REAL WAITER, REPARENTED TO PID 1 BEFORE IT RUNS. See the header for why.
 *
 * Three processes are involved and only the last one is the waiter: a shell that backgrounds a
 * second shell and exits at once, so the second is orphaned; that second shell waits until it has
 * been reparented, writes down its own pid and process group, and becomes the waiter with `exec`,
 * which keeps both numbers.
 */
function startTheWaiter(input: {
  session: string
  claudePid: number
  conversation: string | null
  /** Where the waiter is told Mole Office is. The default is the loopback address it really is on. */
  api?: string
}): { pidFile: string; out: () => string; err: () => string; pgid: () => number } {
  const outFile = join(scratch, `waiter-out-${String(started.length)}.txt`)
  const errFile = join(scratch, `waiter-err-${String(started.length)}.txt`)
  const pidFile = join(scratch, `waiter-pid-${String(started.length)}.txt`)
  const script = join(scratch, `become-the-waiter-${String(started.length)}.sh`)
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      '# Wait until this shell is nobody’s child but init’s, so the waiter’s walk up its own',
      '# parents ends where the kit’s waiters end, and never in the process that started this test.',
      'while [ "$(awk \'{print $4}\' /proc/$$/stat)" != "1" ]; do sleep 0.05; done',
      `echo "$(awk '{print $1}' /proc/$$/stat) $(awk '{print $5}' /proc/$$/stat)" > ${pidFile}`,
      'exec "$@"',
      '',
    ].join('\n'),
  )
  const tool = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
  const args = [
    process.execPath,
    tool,
    '--agent',
    'held-one',
    '--session',
    input.session,
    '--api',
    input.api ?? api,
    '--workspace',
    'default',
  ]
  const environment: Record<string, string> = {
    ...(process.env as Record<string, string>),
    MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1',
    CLAUDE_PID: String(input.claudePid),
  }
  if (input.conversation !== null) environment['CLAUDE_CODE_SESSION_ID'] = input.conversation
  const launcher: ChildProcess = spawn(
    '/bin/sh',
    ['-c', `setsid /bin/sh ${script} ${args.map((one) => `'${one}'`).join(' ')} > ${outFile} 2> ${errFile} &`],
    { env: environment, stdio: 'ignore' },
  )
  launcher.unref()
  const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  return {
    pidFile,
    out: () => read(outFile),
    err: () => read(errFile),
    pgid: () => Number(read(pidFile).trim().split(/\s+/)[1] ?? 0),
  }
}

/** The waiter's own pid, once its script has written it down. */
function waiterPid(pidFile: string): number {
  return Number((existsSync(pidFile) ? readFileSync(pidFile, 'utf8') : '').trim().split(/\s+/)[0] ?? 0)
}

/** One session record, stamped as the start hook stamps one, for a conversation. */
async function aSession(conversation: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A terminal answering as held-one',
    data: {
      state: 'running',
      runtime: 'claude-code',
      extra: { discovered: { tool: 'claude-code', externalId: conversation, logPath: transcript } },
    },
  })
  return (filed['record'] as { id: string }).id
}

/** The live hold for this handle, or null. */
async function theHold(): Promise<{ session: string; lastHeardAt: string } | null> {
  const listed = (await get('/api/handles')) as {
    holds?: { handle: string; session: string; lastHeardAt: string; releasedAt: string | null }[]
  }
  return (listed.holds ?? []).find((one) => one.handle === 'held-one' && one.releasedAt === null) ?? null
}

/** The process a session record names, as the office stored it. */
async function theProcessOn(session: string): Promise<Record<string, unknown>> {
  const read = (await get(`/api/records/${session}`)) as { record?: { data?: Record<string, unknown> } }
  const extra = read.record?.data?.['extra'] as Record<string, unknown> | undefined
  return (extra?.['discovered'] as Record<string, unknown> | undefined) ?? {}
}

const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'

beforeAll(async () => {
  // THE OFFICE'S OWN BEAT, TURNED DOWN. The waiter beats at the number the office hands it, and a
  // case that waited for the real twenty seconds twice would be a case nobody runs.
  process.env[BEAT] = '1'
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-waiter-process-'))
  transcript = join(scratch, 'transcript.jsonl')
  writeFileSync(
    transcript,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'two hours ago' }] },
    })}\n`,
  )
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await post('/api/records', {
    kind: 'agent',
    title: 'Held One',
    data: { handle: 'held-one', runtime: 'claude-code', state: 'active' },
  })
}, 60_000)

afterAll(async () => {
  delete process.env[BEAT]
  for (const one of started) stop(one.pgid)
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('the waiter records its session’s process', () => {
  it('finds it through CLAUDE_PID, says so, and the office writes it on the held record', async () => {
    const claude = aFakeClaude(ITS_CONVERSATION)
    const session = await aSession(ITS_CONVERSATION)
    theFirstSession = session

    const waiter = startTheWaiter({ session, claudePid: claude.pid, conversation: ITS_CONVERSATION })
    started.push({ what: 'the waiter', pgid: 0 })
    expect(await until(() => waiterPid(waiter.pidFile) > 0), waiter.err()).toBe(true)
    started[started.length - 1] = { what: 'the waiter', pgid: waiter.pgid() }

    expect(await until(() => waiter.out().includes("This session's own process is on record")), waiter.out() + waiter.err()).toBe(true)
    expect(waiter.out()).toContain(
      `This session's own process is on record ${session}: pid ${String(claude.pid)}, started `,
    )
    expect(waiter.out()).toContain("found through CLAUDE_PID in this waiter's environment.")

    const stamp = await theProcessOn(session)
    expect(stamp['pid']).toBe(claude.pid)
    expect(String(stamp['pidCommand'])).toContain(`--resume ${ITS_CONVERSATION}`)
    // AND THE CONVERSATION ON THE RECORD IS UNTOUCHED: one record is one run.
    expect(stamp['externalId']).toBe(ITS_CONVERSATION)
  }, 60_000)

  it('prints the refusal, keeps holding, and ends with `exiting: stopped`', async () => {
    // A WAITER THAT OUTLIVED ITS SESSION, which is what the measurement found: the process its
    // environment names is a claude session of ANOTHER conversation, so nothing ties it to the
    // record this waiter holds for, and the office refuses.
    const claude = aFakeClaude(ANOTHER_CONVERSATION)
    const session = await aSession(ITS_CONVERSATION)
    // THE HANDLE IS FREE AGAIN BEFORE THIS ONE CLAIMS IT. Stopping the first waiter does not let go
    // of its hold — that is deliberate, and the hold stays its session's for the grace window — so
    // the first session lets go through the door a session lets go with.
    const first = started.find((one) => one.what === 'the waiter')
    if (first !== undefined) stop(first.pgid)
    await post(`/api/handles/held-one/release`, {
      session: theFirstSession,
      because: 'the case that took it has finished',
    })
    expect(await until(async () => (await theHold()) === null)).toBe(true)

    const waiter = startTheWaiter({ session, claudePid: claude.pid, conversation: null })
    started.push({ what: 'the second waiter', pgid: 0 })
    expect(await until(() => waiterPid(waiter.pidFile) > 0), waiter.err()).toBe(true)
    const pgid = waiter.pgid()
    started[started.length - 1] = { what: 'the second waiter', pgid }

    expect(
      await until(() => waiter.out().includes("Mole Office did not record this session's process")),
      waiter.out() + waiter.err(),
    ).toBe(true)
    expect(waiter.out()).toContain(
      `Mole Office did not record this session's process on record ${session}: Nothing Mole Office can read ties ` +
        `process ${String(claude.pid)} to the conversation record ${session} names (${ITS_CONVERSATION}). Nothing ` +
        'was written. This waiter has not let go of the handle.',
    )

    // IT IS STILL HOLDING, AND STILL BEATING. A later beat really lands: the hold's heartbeat moves
    // after the refusal was printed, which is what "the waiter carried on" means to the office.
    const heldAfterTheRefusal = await theHold()
    expect(heldAfterTheRefusal?.session).toBe(session)
    expect(
      await until(async () => {
        const now = await theHold()
        return now !== null && now.lastHeardAt !== heldAfterTheRefusal?.lastHeardAt
      }),
    ).toBe(true)

    // AND A SIGNAL IS WHAT ENDS IT, with the line that says so.
    process.kill(-pgid, 'SIGTERM')
    expect(await until(() => waiter.out().includes('exiting: stopped')), waiter.out() + waiter.err()).toBe(true)
    const lines = waiter.out().trim().split('\n')
    expect(lines[lines.length - 1]).toBe('exiting: stopped')
  }, 60_000)

  it('records nothing through an address it cannot tell is this machine, and says that is what it could not tell', async () => {
    // `0.0.0.0` REACHES THIS MACHINE and is not an address that can only name a loopback, which is
    // the whole of what the waiter can test. A waiter on this machine pointed at this machine's own
    // NAME is in the same position, and is refused for the same reason: the tool cannot tell that
    // case from a real other computer, so it says what it could not tell rather than what is true
    // about where Mole Office runs.
    const claude = aFakeClaude(ITS_CONVERSATION)
    const session = await aSession(ITS_CONVERSATION)
    const before = started.find((one) => one.what === 'the second waiter')
    if (before !== undefined) stop(before.pgid)
    const standing = await theHold()
    if (standing !== null) {
      await post('/api/handles/held-one/release', {
        session: standing.session,
        because: 'the case that took it has finished',
      })
    }
    const asAnAddress = api.replace('127.0.0.1', '0.0.0.0')
    expect(asAnAddress).not.toBe(api)

    const waiter = startTheWaiter({
      session,
      claudePid: claude.pid,
      conversation: ITS_CONVERSATION,
      api: asAnAddress,
    })
    started.push({ what: 'the third waiter', pgid: 0 })
    expect(await until(() => waiterPid(waiter.pidFile) > 0), waiter.err()).toBe(true)
    started[started.length - 1] = { what: 'the third waiter', pgid: waiter.pgid() }

    expect(await until(() => waiter.out().includes('Holding the handle')), waiter.out() + waiter.err()).toBe(true)
    expect(await until(() => waiter.out().includes('recorded no process')), waiter.out() + waiter.err()).toBe(true)
    expect(waiter.out()).toContain(
      'This waiter cannot tell that Mole Office is on this machine, so it recorded no process: a process number ' +
        'means something only on its own machine.',
    )
    // AND NOTHING WAS WRITTEN: the record names no process at all.
    expect(await theProcessOn(session)).not.toHaveProperty('pid')
  }, 60_000)
})
