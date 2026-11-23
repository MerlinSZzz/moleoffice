// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER'S LAST LINE SAYS WHY IT EXITED.
 *
 * Problem `kimEUGbzWDdn`, found on 16 September 2026: a waiter that restarted, took one
 * message, printed it and exited inside a twelve-second `ps` window read as a failed start,
 * because nothing in what it printed named why the process had gone — its last words were the
 * message block and the restart note. The waiter now prints ONE FINAL LINE on stdout, after
 * everything else: `exiting: delivered <message record ids>` after a hand-over, `exiting: refused:
 * <the office's sentence>` when the office refused the hold with a 4xx it cannot recover from,
 * `exiting: error: <one line>` for any other error, and `exiting: stopped` when a signal stopped
 * it. The exit codes did not change; the line is the record, not the code.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY A REAL CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * A real waiter (`tools/hold-the-handle.mjs`) is started as a child against a throwaway app, exactly
 * as tests/the-hand-over-marks-the-message-delivered.test.ts does. Four cases:
 *
 *   1. A hand-over ends with the delivered line naming the message id, on stdout, as the last line,
 *      with the "Start the waiter again" note still in front of it, and the exit code stays 0.
 *   2. Everything waiting in one wake ends with the delivered line carrying every id, separated by
 *      spaces.
 *   3. A hold the office refuses — a second session reaching for a handle the first session holds —
 *      ends with the refused line carrying the office's own sentence, and the exit code stays 1.
 *   4. A signal ends with the stopped line, and the exit code stays 0.
 *
 * STDOUT AND STDERR ARE CAPTURED SEPARATELY on purpose: the refused explanations go to stderr, and
 * the last line on stdout is the assertion, so a merged capture would make the order a matter of
 * luck between two pipes.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, PROVED AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the cases below pass. Then, in tools/hold-the-handle.mjs, the `theLastLine` call at the
 * hand-over in `wakeTheSessionWith` is removed — the exact state before problem `kimEUGbzWDdn` was
 * fixed. Case 1 goes red (the last stdout line is the restart note, not the delivered line); case 2
 * goes red with it. The call was put back byte-for-byte (sha256 checked) and the control run again:
 * green.
 *
 * WHAT WOULD MAKE THIS GO RED: dropping the final line, printing anything after it, or printing the
 * delivered line with fewer or different ids than were handed over.
 */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
let keyEnv: NodeJS.ProcessEnv = {}
/** The session record the first waiter is started with; the wake flow starts the SAME waiter again. */
let sessionOf = ''
const started: ChildProcess[] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/**
 * The last line that is not blank, of what reached stdout. Blank lines at the end of a pipe's
 * buffer are not words a reader would call the last line.
 */
function lastLine(held: { stdout: () => string }): string {
  const lines = held.stdout().split('\n')
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    if (lines[at]?.trim() !== '') return lines[at] ?? ''
  }
  return ''
}

/** Start the waiter and say what each stream printed and when the process stopped. */
function startTheWaiter(args: string[]): {
  child: ChildProcess
  stdout: () => string
  stderr: () => string
  ended: Promise<number>
} {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)), ...args],
    { env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let out = ''
  let err = ''
  child.stdout?.on('data', (chunk) => (out += String(chunk)))
  child.stderr?.on('data', (chunk) => (err += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { child, stdout: () => out, stderr: () => err, ended }
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

/** The live hold row for one handle, waiting until the waiter's own claim is visible. */
async function holdVisible(): Promise<boolean> {
  const listed = (await get('/api/handles')) as { holds?: { handle: string; session: string; releasedAt: string | null }[] }
  return (listed.holds ?? []).some((hold) => hold.handle === 'exit-line' && hold.releasedAt === null)
}

async function sendTheAgent(body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  keyEnv = await aTestAgentsKeyEnvironment(app, 'exit-line', dirname(t.file))
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'exit-line'), 'the registry row').id
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
  await app.close()
  t.close()
})

describe('the waiter ends with one line saying why', () => {
  it('a hand-over ends with `exiting: delivered <message id>`, the note before it, exit code 0', async () => {
    sessionOf = (
      (await post('/api/records', {
        kind: 'session',
        title: 'A terminal answering as exit-line',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as exit-line' },
      }))['record'] as { id: string }
    ).id
    const waiter = startTheWaiter([
      '--agent',
      'exit-line',
      '--session',
      sessionOf,
      '--api',
      api,
      '--workspace',
      'default',
    ])
    // THE HOLD IS REALLY THERE BEFORE THE MESSAGE IS WRITTEN, so the taken message cannot have been
    // answered by anything else in its place.
    expect(await until(holdVisible), waiter.stdout()).toBe(true)

    const messageId = await sendTheAgent("I'm back. Say the id back to me when you read this.")
    expect(
      await until(() => waiter.stdout().includes(messageId) && waiter.stdout().includes('exiting: delivered ')),
      waiter.stdout(),
    ).toBe(true)
    expect(await waiter.ended, waiter.stdout()).toBe(0)

    // THE FINAL LINE, AND THE NOTE STILL IN FRONT OF IT.
    expect(lastLine({ stdout: () => waiter.stdout() })).toBe(`exiting: delivered ${messageId}`)
    expect(waiter.stdout(), 'the note stays where it was').toContain(
      'Start the waiter again so the next message comes here too:',
    )
    expect(waiter.stdout().indexOf('Start the waiter again so the next message comes here too:')).toBeLessThan(
      waiter.stdout().indexOf(`exiting: delivered ${messageId}`),
    )
  }, 60_000)

  it('one wake that hands over two messages names both ids, separated by spaces', async () => {
    const first = await sendTheAgent('第一条')
    const alsoFirst = await sendTheAgent('第二条')
    // THE SAME SESSION STARTING ITS WAITER AGAIN, which is the real flow: the hold it already has is
    // beaten, and everything waiting for the handle goes in the one wake.
    const waiter = startTheWaiter([
      '--agent',
      'exit-line',
      '--session',
      sessionOf,
      '--api',
      api,
      '--workspace',
      'default',
    ])
    expect(
      await until(() => waiter.stdout().includes('exiting: delivered ') && waiter.stdout().includes(first)),
      waiter.stdout(),
    ).toBe(true)
    expect(await waiter.ended).toBe(0)

    const said = lastLine({ stdout: () => waiter.stdout() })
    expect(said.startsWith('exiting: delivered '), `last line was: ${said}`).toBe(true)
    expect(new Set(said.slice('exiting: delivered '.length).split(' '))).toEqual(new Set([first, alsoFirst]))
  }, 60_000)

  it('a hold the office refuses ends with the refused line, carrying the office sentence, exit code 1', async () => {
    // THE FIRST SESSION IS HOLDING from the case above. A second session reaching for the same
    // handle is refused with the office's own sentence, which is what the waiter names.
    const another = (
      (await post('/api/records', {
        kind: 'session',
        title: 'A third terminal reaching for the same handle',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as exit-line, refused' },
      }))['record'] as { id: string }
    ).id
    const refused = startTheWaiter([
      '--agent',
      'exit-line',
      '--session',
      another,
      '--api',
      api,
      '--workspace',
      'default',
    ])
    expect(await refused.ended, refused.stdout()).toBe(1)
    const said = lastLine({ stdout: () => refused.stdout() })
    expect(said.startsWith('exiting: refused: '), `last line was: ${said}`).toBe(true)
    // THE OFFICE'S SENTENCE IS THE REST OF THE LINE, not a paraphrase of it.
    const officeSentence = ((refused.stderr().match(/was not held: (.*)/) ?? [''])[1] ?? '').trim()
    expect(officeSentence, refused.stderr()).not.toBe('')
    expect(said.endsWith(officeSentence), `last line was: ${said}`).toBe(true)
    expect(refused.stderr()).toContain('The handle "exit-line" was not held')
  }, 60_000)

  it('a signal ends with the stopped line, and the release was really asked of the office', async () => {
    keyEnv = await aTestAgentsKeyEnvironment(app, 'exit-stopped-hand', dirname(t.file))
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const stoppedAgentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'exit-stopped-hand'),
      'the registry row',
    ).id
    const session = (
      (await post('/api/records', {
        kind: 'session',
        title: 'A terminal answering as exit-stopped-hand',
        data: { state: 'running', runtime: 'claude-code', doing: 'answering as exit-stopped-hand' },
      }))['record'] as { id: string }
    ).id
    const waiter = startTheWaiter([
      '--agent',
      'exit-stopped-hand',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
    ])
    expect(
      await until(async () => {
        const holds = (await get('/api/handles')) as { holds?: { handle: string; releasedAt: string | null }[] }
        return (holds.holds ?? []).some(
          (hold) => hold.handle === 'exit-stopped-hand' && hold.releasedAt === null,
        )
      }),
      waiter.stdout(),
    ).toBe(true)

    waiter.child.kill('SIGTERM')
    expect(await waiter.ended).toBe(0)
    expect(lastLine({ stdout: () => waiter.stdout() })).toBe('exiting: stopped')
    // AND THE HOLD IS RELEASED, as it always was; the line adds, it does not replace.
    const listed2 = (await get('/api/handles')) as { holds?: { handle: string; releasedAt: string | null }[] }
    const mine = (listed2.holds ?? []).find((hold) => hold.handle === 'exit-stopped-hand')
    expect(mine?.releasedAt ?? null, 'the waiter released its hold before it stopped').not.toBeNull()
    expect(stoppedAgentId).not.toBe('')
  }, 60_000)
})
