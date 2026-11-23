// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE dsh HOOKS CARRY A MESSAGE TO A dsh AGENT, THROUGH REAL DOORS IN A TEST WORLD.
 *
 * A dsh agent receives office messages through the `dsh-hooks-claude-code` bridge, whose hooks are
 * three scripts in this repository. This file drives those three scripts
 * against a real Mole Office listening on a free port, exactly as `dsh` will run them.
 *
 * WHAT IS PROVED, one case each:
 *
 *   SessionStart  attaches the three-line envelope and the body verbatim, and marks the message
 *                 delivered, never seen; the same session attaches each message once, including already delivered rows.
 *   PostToolUse   the same, with a real PostToolUse payload on stdin, because a message that
 *                 arrived while a tool ran must reach the tool's result.
 *   Stop          a worker whose run is over is allowed to stop; a supervisor is held while a message is
 *                 unseen, naming it; while a worker it started still has a run in state running, naming the
 *                 worker and telling it to read its waiting messages and the reports; for neither, with its run
 *                 over, allowed; any agent whose own run still says running with no seal is held, naming the
 *                 run (problem UbG6k-7jGLa5); and the same sight is held at most three times in a row.
 *   Unreachable   every script exits 0 with one sentence on stderr and nothing on stdout, so a hook
 *                 can never stop a run by failing.
 *   No key file   every script, keep-the-brief.mjs included, does its whole job with no key file
 *                 beside the database it names, which is how it runs in a sandbox (acceptance
 *                 finding 13), with the run's own key in MOLE_AGENT_KEY, and no call it makes
 *                 carries the office's key.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   session-start: mark attached messages seen again → the delivered cases are red.
 *   session-start: ignore the attached ids → the second-call cases are red.
 *   session-start: omit markDelivered from the read → queued messages stay queued and the delivered cases are red.
 *   scratch state: lose it on stop, share it between sessions, or silently fail → the state cases are red.
 *   session-start: print the body with `.trim()` in `messageBlock` → the verbatim case is red.
 *   post-tool-use: make it exit before `attachUnseen` → the PostToolUse case is red.
 *   stop: hold a run that is over, or let one that still runs unsealed go → the worker cases are red.
 *   stop: drop the `HOLDS_IN_A_ROW` guard → the fourth-run case is red.
 *   stop: the stop the cap lets go says nothing → the worker's fourth-stop case is red (problem RJradfGfKxlq).
 *   stop: have `theRunningWorkersOf` (src/server/lib/running-workers.ts) bind each running row to
 *                 the supervisor's own record instead of each worker's → the running-worker case is red.
 *   unreachable: let the fetch throw out of `main` → the one-sentence case turns into a stack.
 *   refused: say "did not answer" for every read that failed, as before → the refused case is red (problem Z1UaYRGkHBxa).
 *   no key file: make `theHeaders` in office.mjs send no key when MOLE_AGENT_KEY holds one → the
 *                no-key case is red at the Stop hook, whose write of what was served is refused.
 *   no key file: run the no-key case's hooks against the test's own database, beside the office's
 *                key file, and make `theHeaders` send the office's key in place of the run's → the
 *                no-key case is red at its last check, on what the calls carried.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { runningWorkers } from '../tools/dsh-hooks/office.mjs'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const SESSION_START = fileURLToPath(new URL('../tools/dsh-hooks/session-start.mjs', import.meta.url))
const POST_TOOL_USE = fileURLToPath(new URL('../tools/dsh-hooks/post-tool-use.mjs', import.meta.url))
const STOP = fileURLToPath(new URL('../tools/dsh-hooks/stop.mjs', import.meta.url))
const CLAUDE_STOP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-stop.mjs', import.meta.url))
const KEEP_THE_BRIEF = fileURLToPath(new URL('../tools/dsh-hooks/keep-the-brief.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api = ''
let session = ''
let hookCwd = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/**
 * The key each request that named a run in its session header carried, as the office received it. Kept in memory for
 * the no-key-file case, which reads it only as words, so no key is ever printed.
 */
const theKeysSentNamingARun: { session: string; key: string | undefined }[] = []

/** Directories this file makes, removed after it. */
const made: string[] = []
function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-dsh-hooks-${what}-`))
  made.push(dir)
  return dir
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

/** Register an agent through the starter door, naming its card where one is named. */
async function started(handle: string, role?: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, {
    handle,
    name: handle,
    ...(role === undefined ? {} : { role }),
  })
  expect(reply.status, JSON.stringify(reply.json)).toBe(201)
}

/** The registry row of one agent, as the office reads it. */
async function agentRow(handle: string): Promise<{ id: string; handle: string; record: string | null; startedBy: unknown; roleReadAs: string }> {
  const listed = await inject('GET', '/api/participants', AS_THE_PERSON)
  const agents = (listed.json['agents'] ?? []) as { id: string; handle: string; record: string | null; startedBy: unknown; roleReadAs: string }[]
  const found = agents.find((one) => one.handle === handle)
  if (found === undefined) throw new Error(`no agent row for ${handle}`)
  return found
}

/** What one agent has not marked seen, through the same door the hooks read. */
async function unseenIdsFor(handle: string): Promise<string[]> {
  const reply = await inject('GET', '/api/messages?only=waiting-for-me', asAgent(handle))
  expect(reply.status, JSON.stringify(reply.json)).toBe(200)
  return ((reply.json['messages'] ?? []) as { id: string }[]).map((one) => one.id)
}

/** Mark every message waiting for one agent seen, so a test starts from nothing waiting. */
async function clearInbox(handle: string): Promise<void> {
  for (const id of await unseenIdsFor(handle)) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(handle), { mark: 'seen' })
    expect(marked.status, JSON.stringify(marked.json)).toBe(200)
  }
}

/** A run of the agent that is over, as a stop hook sees one: its record says finished. */
async function aRunThatIsOver(handle: string): Promise<string> {
  const filed = await inject('POST', '/api/records', asAgent(handle), { kind: 'session', title: 'a run that is over', data: { state: 'finished' } })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

/** Write one message to an agent as the person and answer its record id. */
async function writeTo(handle: string, body: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: 'a message for a dsh agent',
    data: { body, to: [{ kind: 'agent', id: handle }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, JSON.stringify(filed.json)).toBe(409)
  return (filed.json['record'] as { id: string }).id
}

/**
 * The mark on one message's delivery to one agent. A delivery names the agent by its registry id,
 * which is not its handle, so the id is read from the registry first.
 */
async function theMark(messageId: string, handle: string): Promise<string | null> {
  const agentId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  const read = await inject('GET', `/api/messages/${messageId}`, asAgent(handle))
  const deliveries = (read.json['message'] as { deliveries?: { to: { kind: string; id: string }; mark: string }[] } | undefined)
    ?.deliveries
  const mine = (deliveries ?? []).find((one) => one.to.kind === 'agent' && one.to.id === agentId)
  return mine?.mark ?? null
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Run one hook script exactly as the bridge would: the payload on stdin, the identity in the env.
 *
 * IT IS ASYNCHRONOUS ON PURPOSE. The office this file starts runs in THIS process, and `spawnSync`
 * would block the event loop that answers the hook's own request — the hook would time out against
 * a server that is up but cannot reply. `spawn` leaves the loop free.
 */
function runHook(
  script: string,
  handle: string | null,
  options: { payload?: unknown; api?: string; cwd?: string; session?: string; db?: string; env?: Record<string, string> } = {},
): Promise<Ran> {
  const env: Record<string, string> = { ...withoutInheritedEffort() } as Record<string, string>
  // NODE'S OWN COLOUR WARNING IS NOT A SENTENCE THIS HOOK SAID. Vitest sets FORCE_COLOR, which
  // makes Node warn that it is ignoring NO_COLOR; dropping both leaves the hook's own words alone.
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  if (handle === null) {
    delete env['MOLE_OFFICE_AGENT']
    delete env['MOLE_OFFICE_SESSION']
    delete env['MOLE_OFFICE_WORKSPACE']
  } else {
    env['MOLE_OFFICE_AGENT'] = handle
    env['MOLE_OFFICE_SESSION'] = options.session ?? session
    env['MOLE_OFFICE_WORKSPACE'] = 'default'
  }
  env['MOLE_OFFICE_API'] = options.api ?? api
  // THE OFFICE'S KEY FILE IS FOR THIS TEST'S DATABASE, never the live checkout's.
  env['MOLE_OFFICE_DB'] = options.db ?? t.file
  Object.assign(env, options.env ?? {})
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: options.cwd ?? hookCwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {
      // The child stopped reading, which is its right; the run is still reported below.
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.write(JSON.stringify(options.payload ?? {}))
    child.stdin.end()
  })
}

/** The JSON the bridge reads out of a hook's stdout, or null because there was none. */
function parsed(ran: Ran): Record<string, unknown> | null {
  const text = ran.stdout.trim()
  if (text === '') return null
  return JSON.parse(text) as Record<string, unknown>
}

/** The context the bridge folds into the session or the tool result. */
function contextOf(ran: Ran): string {
  const said = parsed(ran)
  const hso = (said?.['hookSpecificOutput'] ?? {}) as Record<string, unknown>
  return String(hso['additionalContext'] ?? '')
}

beforeAll(async () => {
  hookCwd = aScratchDirectory('work')
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  app.addHook('onRequest', async (req) => {
    const named = req.headers['x-mole-office-session']
    const key = req.headers[KEY_HEADER]
    if (typeof named === 'string') theKeysSentNamingARun.push({ session: named, key: typeof key === 'string' ? key : undefined })
  })
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
    kind: 'session',
    title: 'the run doing this work',
    data: { state: 'running' },
  })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  session = (filed.json['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('SessionStart delivers unseen messages once per session without marking them read', () => {
  it('carries the envelope and the body verbatim, and leaves the message delivered afterwards', async () => {
    await started('hook-start')
    // THE CARD MESSAGE THE REGISTRATION WROTE IS ONE OF THEM, which is the point of the decision:
    // the office writes it unseen and this hook is what attaches it to the first request.
    const before = await unseenIdsFor('hook-start')
    expect(before.length, 'the registration wrote no card message').toBe(1)
    const body = 'the exact words — line one\nline two 尾  '
    const written = await writeTo('hook-start', body)
    expect(await unseenIdsFor('hook-start')).toContain(written)

    const ran = await runHook(SESSION_START, 'hook-start', {
      payload: { session_id: 'dsh-1', transcript_path: '', cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'startup' },
    })
    expect(ran.status, ran.stderr).toBe(0)
    const said = parsed(ran)
    expect(said, `SessionStart printed nothing; status ${String(ran.status)}; stderr: ${ran.stderr}`).not.toBeNull()
    expect((said?.['hookSpecificOutput'] as Record<string, unknown>)['hookEventName']).toBe('SessionStart')
    const context = contextOf(ran)
    // THE SENDER BY NAME, WITH THE ID BESIDE IT, as the office read the person's row (problem ynGL0myEnAbi).
    const person = (t.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').get(THE_PERSON) as { name: string }).name
    expect(context, 'the sender is not named').toContain(`WHO SENT IT: person ${person} (id ${THE_PERSON})\n`)
    // NO PROJECT TO ANSWER IN: every message is kept in the message centre. This hook still hands
    // the envelope the stored project, the message centre, which says nothing about where the words were said, so the
    // envelope draws no line for it until the hook hands on the message's writtenIn.
    expect(context, 'the envelope still names a project to answer in').not.toContain('IN PROJECT')
    expect(context, 'the record id is not named').toContain(`THE MESSAGE, record ${written}:`)
    // THE BODY IS THE BYTES THAT WERE SENT, with the blank line the envelope ends on in front of it.
    expect(context, 'the body was rewritten').toContain(`\n\n${body}`)
    expect(context).toContain(body)
    expect(await theMark(written, 'hook-start')).toBe('delivered')
    expect(await unseenIdsFor('hook-start')).toContain(written)
    expect(context).toContain('POST /api/messages/<id>/mark {"mark":"seen"}')
    expect(context).toContain('office_request')
    expect(context).toContain('green ticks only then')

    const again = await runHook(SESSION_START, 'hook-start', {
      payload: { session_id: 'dsh-1', transcript_path: '', cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'startup' },
    })
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout, 'the same session attached a message twice').toBe('')
    expect(again.stderr).toBe('')
  })

  it('attaches a message delivered elsewhere once in each session, even when sessions share a directory', async () => {
    const handle = 'hook-delivered'
    await started(handle)
    await clearInbox(handle)
    const written = await writeTo(handle, 'Already handed over, still unread.')
    const delivered = await inject('GET', '/api/messages?only=waiting-for-me&markDelivered=1', asAgent(handle))
    expect(delivered.status).toBe(200)
    expect(await theMark(written, handle)).toBe('delivered')
    const otherSession = await aRunThatIsOver(handle)
    const cwd = aScratchDirectory('sessions')
    for (const run of [session, otherSession]) {
      const first = await runHook(SESSION_START, handle, { cwd, session: run })
      expect(first.status, first.stderr).toBe(0)
      expect(contextOf(first)).toContain(`THE MESSAGE, record ${written}:`)
    }
    for (const run of [session, otherSession]) {
      const again = await runHook(POST_TOOL_USE, handle, { cwd, session: run })
      expect(again.status, again.stderr).toBe(0)
      expect(again.stdout).toBe('')
      expect(again.stderr).toBe('')
    }
    expect(await theMark(written, handle)).toBe('delivered')
  })

  it.each(['unreadable', 'unwritable'])('attaches anyway with one stderr sentence when the scratch state is %s', async (failure) => {
    const handle = `hook-state-${failure}`
    await started(handle)
    await clearInbox(handle)
    const written = await writeTo(handle, 'Do not lose these words when scratch state fails.')
    const cwd = aScratchDirectory(failure)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (failure === 'unreadable') {
        mkdirSync(join(cwd, '.logs'), { recursive: true })
        writeFileSync(join(cwd, '.logs', 'dsh-hooks-stop.json'), '{broken')
      } else if (attempt === 0) {
        writeFileSync(join(cwd, '.logs'), 'A file cannot hold the scratch file.')
      }
      const ran = await runHook(POST_TOOL_USE, handle, { cwd })
      expect(ran.status, ran.stderr).toBe(0)
      expect(contextOf(ran)).toContain(`THE MESSAGE, record ${written}:`)
      expect(ran.stderr.trim().split('\n')).toHaveLength(1)
      expect(ran.stderr).toContain('attachment state')
      expect(ran.stderr).toContain('attached again')
      expect(await theMark(written, handle)).toBe('delivered')
    }
  })
})

describe('an office line reaches a dsh agent with the whole sentence behind it (criterion M34)', () => {
  it('attaches the few words and then the sentence, because a session cannot hover', async () => {
    await started('hook-said')
    const groups = await import('../src/server/lib/groups.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const { moleOffice } = await import('../src/shared/participants.ts')
    const listed = await inject('GET', '/api/participants', AS_THE_PERSON)
    const agentId = ((listed.json['agents'] as { id: string; handle: string }[]).find((a) => a.handle === 'hook-said') as { id: string }).id
    // SYNTHETIC: the day's last broadcast reminder, with a made-up backup sentence behind it.
    const sentence = 'Synthetic backup sentence: check that today’s work has a second copy.'
    groups.writeASystemLineToOne({ kind: 'agent', id: agentId }, 'default', SYSTEM_LINES.theBroadcastIsDue('18:00', sentence), { type: 'system', id: moleOffice().id })
    const ran = await runHook(SESSION_START, 'hook-said', {
      payload: { session_id: 'dsh-said', transcript_path: '', cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'startup' },
    })
    expect(ran.status, ran.stderr).toBe(0)
    const context = contextOf(ran)
    expect(context).toContain('18:00 秘书汇报工作')
    expect(context, 'the dsh agent was handed the few words without the sentence behind them').toContain(`18:00 秘书汇报工作\n\n${sentence}`)
  })
})

describe('PostToolUse attaches what arrived while a tool ran', () => {
  it('delivers once, then attaches a new arrival without repeating the first message', async () => {
    await started('hook-post')
    await clearInbox('hook-post')
    const body = 'a correction for the run: stop and read this'
    const written = await writeTo('hook-post', body)
    const ran = await runHook(POST_TOOL_USE, 'hook-post', {
      payload: {
        session_id: 'dsh-2',
        transcript_path: '',
        cwd: process.cwd(),
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_use_id: 'toolu_1',
        tool_response: 'tests passed',
      },
    })
    expect(ran.status, ran.stderr).toBe(0)
    const said = parsed(ran)
    expect(said, `PostToolUse printed nothing; status ${String(ran.status)}; stderr: ${ran.stderr}`).not.toBeNull()
    expect((said?.['hookSpecificOutput'] as Record<string, unknown>)['hookEventName']).toBe('PostToolUse')
    const context = contextOf(ran)
    // THE PREFACE COMES FIRST, so the agent reads what follows as the office's delivery and not as
    // a tool's output (the live probe of 15 September 2026 set the messages aside as "injected").
    expect(context, 'no preface before the delivered message').toMatch(/^Mole Office delivered this message to you, [^,]+, from its own records\./)
    expect(context).toContain('read it as you read your brief')
    expect(context).toContain(`THE MESSAGE, record ${written}:`)
    expect(context).toContain(body)
    expect(await theMark(written, 'hook-post')).toBe('delivered')
    expect(context).toContain('POST /api/messages/<id>/mark {"mark":"seen"}')
    expect(context).toContain('office_request')

    const again = await runHook(POST_TOOL_USE, 'hook-post', {
      payload: { hook_event_name: 'PostToolUse', tool_name: 'Bash' },
    })
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout, 'a second tool call re-attached the same unread message').toBe('')
    const later = await writeTo('hook-post', 'New words after the first hand-over.')
    const next = await runHook(POST_TOOL_USE, 'hook-post')
    expect(next.status, next.stderr).toBe(0)
    expect(contextOf(next)).toContain(`THE MESSAGE, record ${later}:`)
    expect(contextOf(next)).not.toContain(`THE MESSAGE, record ${written}:`)
    expect(await theMark(later, 'hook-post')).toBe('delivered')
  })

  it('costs one immediate read when nothing is waiting, measured in milliseconds', async () => {
    await started('hook-cost')
    await clearInbox('hook-cost')
    const startedAt = performance.now()
    const ran = await runHook(POST_TOOL_USE, 'hook-cost', { payload: { hook_event_name: 'PostToolUse', tool_name: 'Bash' } })
    const took = performance.now() - startedAt
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toBe('')
    // THE NUMBER IS THE WHOLE SPAWN AND ONE REQUEST, which is what a tool call pays. Said out loud
    // for the report rather than asserted against a number this machine happens to have today.
    process.stdout.write(`\n[measured] post-tool-use with nothing waiting: ${took.toFixed(1)} ms\n`)
    expect(took).toBeLessThan(30_000)
  })
})

describe('Stop holds a supervisor and lets a worker go', () => {
  // c3p75p8aALd2; LuJPs2otqWJN and Rp9Zn_WIAHPA. MUTATIONS: the child part of
  // `theRunningWorkersOf` (src/server/lib/running-workers.ts) taken out → the live-child cases red;
  // ended run counted → the ended-child cases red.
  it.each([['dsh', STOP], ['claude-code', CLAUDE_STOP]])('%s holds for a parented run started by someone else, then lets go once it ends', async (runtime, script) => {
    const supervisor = `hook-parent-${runtime}`
    const starter = `hook-filer-${runtime}`
    const workerHandle = `hook-child-${runtime}`
    await started(starter, 'supervisor')
    // THE FILER STARTED THE SUPERVISOR TOO, as the secretary starts a supervisor and files workers under its run, so the filer
    // may name the supervisor's run as the worker run's parent (problem NlOyicZP_Jjt).
    const supervising = await inject('POST', '/api/agents/started', asAgent(starter), { handle: supervisor, name: supervisor, role: 'supervisor' })
    expect(supervising.status, JSON.stringify(supervising.json)).toBe(201)
    const parent = await aRunThatIsOver(supervisor)
    const registered = await inject('POST', '/api/agents/started', asAgent(starter), { handle: workerHandle, name: workerHandle })
    expect(registered.status, JSON.stringify(registered.json)).toBe(201)
    const worker = await agentRow(workerHandle)
    expect(worker.startedBy).toEqual({ kind: 'agent', id: (await agentRow(starter)).id })
    expect(worker.startedBy).not.toEqual({ kind: 'agent', id: (await agentRow(supervisor)).id })
    const filed = await inject('POST', '/api/records', asAgent(starter), {
      kind: 'session', title: 'a run filed under another supervisor',
      data: { state: 'running', servingAgent: workerHandle, parentAttachment: parent, ranAs: [{ workspaceId: 'default', agentId: worker.record }] },
    })
    expect(filed.status, JSON.stringify(filed.json)).toBe(201)
    const child = (filed.json['record'] as { id: string }).id
    await clearInbox(supervisor)
    const cwd = aScratchDirectory(`parent-${runtime}`)
    const held = await runHook(script, supervisor, { cwd, session: parent, payload: { hook_event_name: 'Stop' } })
    expect(held.status, held.stderr).toBe(0)
    expect(held.stderr).toBe('')
    expect(parsed(held)?.['decision']).toBe('block')
    expect(String(parsed(held)?.['reason'])).toContain(workerHandle)
    const workers = await runningWorkers(api, { handle: supervisor, session: parent, workspace: 'default' })
    expect(workers).toEqual({ running: [{ handle: workerHandle, name: workerHandle }] })

    // No closedAt: an ended session must not hold merely because the attachment says open.
    const report = await inject('POST', '/api/records', asAgent(workerHandle), {
      kind: 'report', title: 'the child run finished its test work', data: {}, links: [{ type: 'about', toId: child }],
    })
    expect(report.status, JSON.stringify(report.json)).toBe(201)
    const reportId = (report.json['record'] as { id: string }).id
    const ended = await inject('PATCH', `/api/records/${child}`, asAgent(starter), { dataPatch: { state: 'finished', submission: { kind: 'records', records: [reportId] } } })
    expect(ended.status, JSON.stringify(ended.json)).toBe(200)
    await clearInbox(supervisor)
    expect(await runningWorkers(api, { handle: supervisor, session: parent, workspace: 'default' })).toEqual({ running: [] })
    const released = await runHook(script, supervisor, { cwd, session: parent, payload: { hook_event_name: 'Stop' } })
    expect(released.status, released.stderr).toBe(0)
    expect(released.stderr).toBe('')
    expect(released.stdout).toBe('')
  })

  // MUTATION: count a closed parented attachment whose session still says running in `theRunningWorkersOf`
  // (src/server/lib/running-workers.ts) → the closed-child case red.
  it('lets both stop scripts go for a closed parented attachment whose session still says running', async () => {
    const supervisor = 'hook-parent-closed'
    const workerHandle = 'hook-child-closed'
    await started(supervisor, 'supervisor')
    await started(workerHandle)
    const parent = await aRunThatIsOver(supervisor)
    const worker = await agentRow(workerHandle)
    const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
      kind: 'session', title: 'a child whose attachment ends',
      data: { state: 'running', servingAgent: workerHandle, parentAttachment: parent, ranAs: [{ workspaceId: 'default', agentId: worker.record }] },
    })
    expect(filed.status, JSON.stringify(filed.json)).toBe(201)
    const child = (filed.json['record'] as { id: string }).id
    const closed = await inject('POST', `/api/attachments/${child}/close`, AS_THE_PERSON, { how: 'provider-event', because: 'the test provider ended its child' })
    expect(closed.status, JSON.stringify(closed.json)).toBe(200)
    const read = await inject('GET', `/api/records/${child}`, AS_THE_PERSON)
    expect(read.status, JSON.stringify(read.json)).toBe(200)
    const data = (read.json['record'] as { data: Record<string, unknown> }).data
    expect(data['state']).toBe('running')
    expect(data['closedAt']).toBeTruthy()
    await clearInbox(supervisor)
    expect(await runningWorkers(api, { handle: supervisor, session: parent, workspace: 'default' })).toEqual({ running: [] })
    for (const script of [STOP, CLAUDE_STOP]) {
      const released = await runHook(script, supervisor, { session: parent, cwd: aScratchDirectory('closed-child'), payload: { hook_event_name: 'Stop' } })
      expect(released.status, released.stderr).toBe(0)
      expect(released.stderr).toBe('')
      expect(released.stdout).toBe('')
    }
  })

  // MUTATION: remove the handle de-duplication from `theRunningWorkersOf` (src/server/lib/running-workers.ts)
  // → duplicate worker assertion red.
  it('names a worker once when found by both startedBy and parentAttachment, including two child runs', async () => {
    const supervisor = 'hook-parent-both'
    const workerHandle = 'hook-child-both'
    await started(supervisor, 'supervisor')
    const parent = await aRunThatIsOver(supervisor)
    const registered = await inject('POST', '/api/agents/started', asAgent(supervisor), { handle: workerHandle, name: workerHandle })
    expect(registered.status, JSON.stringify(registered.json)).toBe(201)
    const worker = await agentRow(workerHandle)
    for (let run = 0; run < 2; run += 1) {
      const opened = await inject('POST', '/api/records', asAgent(supervisor), {
        kind: 'session', title: 'a worker found both ways',
        data: { state: 'running', servingAgent: workerHandle, parentAttachment: parent, ranAs: [{ workspaceId: 'default', agentId: worker.record }] },
      })
      expect(opened.status, JSON.stringify(opened.json)).toBe(201)
    }
    expect(await runningWorkers(api, { handle: supervisor, session: parent, workspace: 'default' })).toEqual({ running: [{ handle: workerHandle, name: workerHandle }] })
    await clearInbox(supervisor)
    for (const script of [STOP, CLAUDE_STOP]) {
      const held = await runHook(script, supervisor, { session: parent, cwd: aScratchDirectory('both'), payload: { hook_event_name: 'Stop' } })
      expect(held.status, held.stderr).toBe(0)
      expect(parsed(held)?.['decision']).toBe('block')
      expect(String(parsed(held)?.['reason']).split(workerHandle)).toHaveLength(2)
    }
  })

  it('lets a worker whose run is over stop with no output', async () => {
    await started('hook-worker-only')
    const over = await aRunThatIsOver('hook-worker-only')
    const ran = await runHook(STOP, 'hook-worker-only', { payload: { hook_event_name: 'Stop', stop_hook_active: false }, cwd: aScratchDirectory('worker'), session: over })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toBe('')
  })

  // PROBLEM UbG6k-7jGLa5: a one-turn worker that ended its turn to wait for the background subagents it started was ended
  // with them. A worker whose own run still says running with no seal is held, and told to wait or to finish.
  it('holds a worker whose own run still runs unsealed, names the run, and at most three times in a row', async () => {
    await started('hook-worker-running')
    const cwd = aScratchDirectory('worker-running')
    const decisions: (string | null)[] = []
    let reason = ''
    let fourth = ''
    for (let stop = 1; stop <= 4; stop += 1) {
      const ran = await runHook(STOP, 'hook-worker-running', { payload: { hook_event_name: 'Stop' }, cwd })
      const said = parsed(ran)
      decisions.push(said === null ? null : String(said['decision'] ?? null))
      if (said !== null) reason = String(said['reason'] ?? '')
      if (stop === 4) fourth = ran.stderr
    }
    expect(decisions, 'a worker whose run still runs was not held, or was held more than three times').toEqual(['block', 'block', 'block', null])
    expect(reason).toContain(`Your run ${session} still says running, and it is not sealed.`)
    // THE STOP THE CAP LETS GO SAYS SO (problem RJradfGfKxlq; message GdSoXrDumLmp).
    expect(fourth).toContain(`dsh-hooks Stop: the same reason had held this stop 3 times in a row (own-run:${session}), so the stop was allowed.`)
  })

  it('holds for an unread delivery, names the read mark door, and preserves attachment memory and the hold count', async () => {
    await started('hook-sup-msg', 'supervisor')
    await clearInbox('hook-sup-msg')
    const written = await writeTo('hook-sup-msg', 'read this before you stop')
    const cwd = aScratchDirectory('sup-msg')
    expect(parsed(await runHook(STOP, 'hook-sup-msg', { cwd }))?.['decision']).toBe('block')
    const attached = await runHook(SESSION_START, 'hook-sup-msg', { cwd })
    expect(contextOf(attached)).toContain(`THE MESSAGE, record ${written}:`)
    const ran = await runHook(STOP, 'hook-sup-msg', { payload: { hook_event_name: 'Stop' }, cwd })
    expect(ran.status, ran.stderr).toBe(0)
    const said = parsed(ran)
    expect(said?.['decision'], 'the stop was not held').toBe('block')
    const reason = String(said?.['reason'] ?? '')
    expect(reason, 'the reason does not name the message').toContain(written)
    expect(reason).toContain('unseen')
    expect(reason).toContain('mark each one read')
    expect(reason).toContain('POST /api/messages/<id>/mark {"mark":"seen"}')
    expect(reason).toContain('office_request')
    const again = await runHook(POST_TOOL_USE, 'hook-sup-msg', { cwd })
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout).toBe('')
    expect(parsed(await runHook(STOP, 'hook-sup-msg', { cwd }))?.['decision']).toBe('block')
    expect((await runHook(STOP, 'hook-sup-msg', { cwd })).stdout).toBe('')
  })

  it('lets a finished supervisor stop with an old unseen backlog, leaving it unseen', async () => {
    const handle = 'hook-sup-old'
    await started(handle, 'supervisor')
    await clearInbox(handle)
    const over = await aRunThatIsOver(handle)
    const old = await writeTo(handle, 'an older message')
    // sentAt is derived from the message record's created_at in the test office.
    expect(t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2000-01-01 00:00:00', old).changes).toBe(1)
    const markBefore = await theMark(old, handle)
    const ran = await runHook(STOP, handle, { session: over, cwd: aScratchDirectory('old-backlog') })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stderr).toBe('')
    expect(ran.stdout).toBe('')
    expect(await unseenIdsFor(handle)).toContain(old)
    expect(await theMark(old, handle)).toBe(markBefore)
  })

  it('holds for a new message without naming the old backlog in the reason or fingerprint', async () => {
    const handle = 'hook-sup-new'
    await started(handle, 'supervisor')
    await clearInbox(handle)
    const over = await aRunThatIsOver(handle)
    const old = await writeTo(handle, 'an older message')
    expect(t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2000-01-01 00:00:00', old).changes).toBe(1)
    const current = await writeTo(handle, 'a new message')
    const markBefore = await theMark(old, handle)
    const cwd = aScratchDirectory('new-message')
    const ran = await runHook(STOP, handle, { session: over, cwd })
    expect(ran.status, ran.stderr).toBe(0)
    expect(parsed(ran)?.['decision']).toBe('block')
    const reason = String(parsed(ran)?.['reason'] ?? '')
    expect(reason).toContain(current)
    expect(reason).not.toContain(old)
    const state = JSON.parse(readFileSync(join(cwd, '.logs', 'dsh-hooks-stop.json'), 'utf8')) as { fingerprint: string }
    expect(state.fingerprint).toBe(`messages:${current}`)
    expect(await unseenIdsFor(handle)).toEqual(expect.arrayContaining([old, current]))
    expect(await theMark(current, handle)).toBe('delivered')
    expect(await theMark(old, handle)).toBe(markBefore)
  })

  it('holds every unseen message and says when the run start cannot be read', async () => {
    const handle = 'hook-sup-no-start'
    await started(handle, 'supervisor')
    await clearInbox(handle)
    const over = await aRunThatIsOver(handle)
    const old = await writeTo(handle, 'an older message')
    expect(t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2000-01-01 00:00:00', old).changes).toBe(1)
    const current = await writeTo(handle, 'a new message')
    const server = createServer((req, res) => {
      void (async () => {
        if (req.url === `/api/records/${over}`) {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'The run record cannot be read.' }))
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string' && (name.startsWith('x-mole-office-') || name === 'content-type')) headers[name] = value
        }
        const answer = await fetch(`${api}${req.url ?? ''}`, { method: req.method ?? 'GET', headers, ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }) })
        res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
        res.end(Buffer.from(await answer.arrayBuffer()))
      })()
    })
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
    try {
      const refusing = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
      const ran = await runHook(STOP, handle, { session: over, cwd: aScratchDirectory('no-start'), api: refusing })
      expect(ran.status, ran.stderr).toBe(0)
      expect(parsed(ran)?.['decision']).toBe('block')
      const reason = String(parsed(ran)?.['reason'] ?? '')
      expect(reason).toContain(old)
      expect(reason).toContain(current)
      expect(reason).toContain("the run's start could not be read")
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()))
    }
  })

  it('holds and says so when a message that holds cannot be marked delivered', async () => {
    const handle = 'hook-sup-mark-refused'
    await started(handle, 'supervisor')
    await clearInbox(handle)
    const over = await aRunThatIsOver(handle)
    const current = await writeTo(handle, 'a new message')
    const server = createServer((req, res) => {
      void (async () => {
        if (req.method === 'POST' && req.url === `/api/messages/${current}/mark`) {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'The mark was refused.' }))
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string' && (name.startsWith('x-mole-office-') || name === 'content-type')) headers[name] = value
        }
        const answer = await fetch(`${api}${req.url ?? ''}`, { method: req.method ?? 'GET', headers, ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }) })
        res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
        res.end(Buffer.from(await answer.arrayBuffer()))
      })()
    })
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
    try {
      const refusing = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
      const ran = await runHook(STOP, handle, { session: over, cwd: aScratchDirectory('mark-refused'), api: refusing })
      expect(ran.status, ran.stderr).toBe(0)
      expect(parsed(ran)?.['decision']).toBe('block')
      const reason = String(parsed(ran)?.['reason'] ?? '')
      expect(reason).toContain(current)
      expect(reason).toContain('could not be marked delivered')
      expect(reason).toContain('The mark was refused.')
      expect(await theMark(current, handle)).toBe('queued')
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()))
    }
  })

  it('holds a supervisor while a worker it started has a run in state running, and names the worker', async () => {
    await started('hook-sup-run', 'supervisor')
    await clearInbox('hook-sup-run')
    // THE WORKER IS STARTED BY THE SUPERVISOR, which is what makes it its worker.
    const asTheSupervisor = asAgent('hook-sup-run')
    const registered = await inject('POST', '/api/agents/started', asTheSupervisor, {
      handle: 'hook-worker-run',
      name: 'hook-worker-run',
    })
    expect(registered.status, JSON.stringify(registered.json)).toBe(201)
    const worker = await agentRow('hook-worker-run')
    expect(worker.record, 'the worker has no agent record').not.toBeNull()
    // AND IT HAS A RUN IN STATE running, filed as an attachment bound to that agent record, which
    // is the one binding `ranAs` carries.
    const opened = await inject('POST', '/api/attachments', AS_THE_PERSON, {
      title: 'the worker run',
      agentId: worker.record,
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/cache/worktrees/dsh-hooks`,
      runtime: 'dsh',
    })
    expect(opened.status, JSON.stringify(opened.json)).toBe(200)

    const ran = await runHook(STOP, 'hook-sup-run', { payload: { hook_event_name: 'Stop' }, cwd: aScratchDirectory('sup-run') })
    expect(ran.status, ran.stderr).toBe(0)
    const said = parsed(ran)
    expect(said?.['decision'], 'the stop was not held').toBe('block')
    const reason = String(said?.['reason'] ?? '')
    expect(reason, 'the reason does not name the worker').toContain('hook-worker-run')
    expect(reason, 'the reason does not say the run is still running').toContain('running')
    expect(reason, 'the reason does not send it to its waiting messages and the reports').toContain(
      'Read the messages waiting for you at GET /api/handles/hook-sup-run/waiting and the workers’ reports before you stop.',
    )
  })

  it('holds at most three times in a row for the same sight, and holds again when the sight changes', async () => {
    await started('hook-sup-cap', 'supervisor')
    await clearInbox('hook-sup-cap')
    const asTheSupervisor = asAgent('hook-sup-cap')
    const registered = await inject('POST', '/api/agents/started', asTheSupervisor, {
      handle: 'hook-worker-cap',
      name: 'hook-worker-cap',
    })
    expect(registered.status, JSON.stringify(registered.json)).toBe(201)
    const worker = await agentRow('hook-worker-cap')
    const opened = await inject('POST', '/api/attachments', AS_THE_PERSON, {
      title: 'the capped worker run',
      agentId: worker.record,
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/cache/worktrees/dsh-hooks`,
      runtime: 'dsh',
    })
    expect(opened.status, JSON.stringify(opened.json)).toBe(200)

    const cwd = aScratchDirectory('sup-cap')
    const decisions: (string | null)[] = []
    for (let run = 1; run <= 4; run += 1) {
      const said = parsed(await runHook(STOP, 'hook-sup-cap', { payload: { hook_event_name: 'Stop' }, cwd }))
      decisions.push(said === null ? null : String(said['decision'] ?? null))
    }
    expect(decisions, 'the same sight was held more than three times in a row').toEqual(['block', 'block', 'block', null])

    // A NEW MESSAGE IS A NEW SIGHT, so the count starts again and the stop is held once more.
    const written = await writeTo('hook-sup-cap', 'a new thing arrived')
    const said = parsed(await runHook(STOP, 'hook-sup-cap', { payload: { hook_event_name: 'Stop' }, cwd }))
    expect(said?.['decision'], 'a changed sight was not held again').toBe('block')
    expect(String(said?.['reason'] ?? '')).toContain(written)
  })

  it('allows a supervisor with nothing waiting, no worker running and its run over', async () => {
    await started('hook-sup-clear', 'supervisor')
    await clearInbox('hook-sup-clear')
    const over = await aRunThatIsOver('hook-sup-clear')
    const ran = await runHook(STOP, 'hook-sup-clear', { payload: { hook_event_name: 'Stop' }, cwd: aScratchDirectory('sup-clear'), session: over })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toBe('')
  })
})

describe('an office that does not answer never stops a run by failing', () => {
  const NOWHERE = 'http://127.0.0.1:9'
  it('says one sentence on stderr and prints nothing, for each script', async () => {
    await started('hook-unreachable')
    // THE THREE SCRIPTS RUN AT ONCE, here and in the two cases below. Here they share this file's folder and only read the
    // state file in it: SessionStart writes it only on a first try at saying the turn started, which the cases above made,
    // and that try would say a second sentence.
    const runs = await Promise.all([SESSION_START, POST_TOOL_USE, STOP].map(async (script) => ({ script, ran: await runHook(script, 'hook-unreachable', { api: NOWHERE, payload: { hook_event_name: 'Stop' } }) })))
    for (const { script, ran } of runs) {
      expect(ran.status, `${script} did not exit 0`).toBe(0)
      expect(ran.stdout, `${script} printed on stdout with no office`).toBe('')
      const lines = ran.stderr.trim().split('\n')
      expect(lines.length, `${script} said more than one sentence: ${ran.stderr}`).toBe(1)
      expect(lines[0], `${script} did not say it could not reach the office`).toContain('did not answer')
    }
  })

  // PROBLEM Z1UaYRGkHBxa: an office that answered with a refusal is not an office that did not answer. A project this office
  // does not hold is refused at the doors these hooks read, so each script says the status it was answered instead.
  it('says the status an office that refused answered, and never that it did not answer, for each script', async () => {
    await started('hook-refused')
    const runs = await Promise.all([SESSION_START, POST_TOOL_USE, STOP].map(async (script) => ({ script, ran: await runHook(script, 'hook-refused', { payload: { hook_event_name: 'Stop' }, cwd: aScratchDirectory('refused'), env: { MOLE_OFFICE_WORKSPACE: 'no-such-project' } }) })))
    for (const { script, ran } of runs) {
      expect(ran.status, `${script} did not exit 0`).toBe(0)
      expect(ran.stdout, `${script} printed on stdout for a refused read`).toBe('')
      expect(ran.stderr, `${script} said the office did not answer when it had refused`).not.toContain('did not answer')
      expect(ran.stderr, `${script} did not say what the office answered`).toMatch(/Mole Office answered \d{3} at /)
    }
  })

  it('says one sentence and prints nothing when the runner exported no identity', async () => {
    const runs = await Promise.all([SESSION_START, POST_TOOL_USE, STOP].map(async (script) => ({ script, ran: await runHook(script, null, { payload: { hook_event_name: 'Stop' } }) })))
    for (const { script, ran } of runs) {
      expect(ran.status, `${script} did not exit 0`).toBe(0)
      expect(ran.stdout, `${script} printed on stdout with no identity`).toBe('')
      const lines = ran.stderr.trim().split('\n')
      expect(lines.length, `${script} said more than one sentence: ${ran.stderr}`).toBe(1)
      expect(lines[0], `${script} did not name the missing identity`).toContain('MOLE_OFFICE_AGENT')
    }
  })
})

describe('with no key file, as in a sandbox, every hook still does its whole job', () => {
  /**
   * ACCEPTANCE FINDING 13. The sandbox template used to mount the office's key file back into the
   * data folder it covers, "because the dsh hooks read the office key from here". That file holds
   * the person's key as well. The template no longer mounts it, so a hook in a sandbox finds no key
   * file, and sends the run's own key, which the run is given in MOLE_AGENT_KEY. This case is the
   * proof that nothing a hook does needs the key file: each script runs against a database path
   * whose folder is empty, with the run's key, and still attaches, marks, keeps the brief, reads the
   * cards and writes what the run was served, and none of its calls carries the office's key.
   */
  it("attaches and marks messages at the start and after a tool, keeps the brief, reads the cards and writes what was served, sending the run's key and never the office's", async () => {
    const handle = 'hook-no-key'
    await started(handle, 'supervisor')
    // THE RUN IS THE AGENT'S OWN, filed by the office's own worker with the office's key, as the office files a run it
    // starts, so the office makes the run its key. The hooks get that key in MOLE_AGENT_KEY, as tools/sandbox-start.mjs
    // gives a run in a sandbox the key the host was given. A name with no key does not write a run's served conditions
    // over a listener (`anAgentThatAnswersForTheRun` in src/server/lib/records.ts).
    const filed = await inject('POST', '/api/records', { ...asAgent(THE_MESSAGE_WORKER_ID), ...theOfficesKeyHeader() }, {
      kind: 'session',
      title: 'a run in a sandbox',
      data: { state: 'running', startedByMoleOffice: true, servingAgent: handle },
    })
    expect(filed.status, JSON.stringify(filed.json)).toBe(201)
    const run = (filed.json['record'] as { id: string }).id
    const runKey = (filed.json['runKey'] as { key?: unknown } | undefined)?.key
    expect(typeof runKey, 'the office made the run no key').toBe('string')

    // A DATABASE PATH IN A FOLDER THAT HOLDS NOTHING, so the key file beside it is not there.
    const noKeyHere = join(aScratchDirectory('no-key'), 'panelx.db')
    expect(readdirSync(dirname(noKeyHere)), 'the folder the hooks look in for a key file is not empty').toEqual([])
    const asInASandbox = { session: run, db: noKeyHere, env: { MOLE_AGENT_KEY: String(runKey) } }

    // SESSIONSTART: the message is attached, its body verbatim, and it reads delivered afterwards.
    const body = 'a message to a run in a sandbox'
    const written = await writeTo(handle, body)
    const began = await runHook(SESSION_START, handle, {
      ...asInASandbox,
      payload: { session_id: 'dsh-sandboxed', transcript_path: '', cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'startup' },
    })
    expect(began.status, began.stderr).toBe(0)
    expect(began.stderr, 'SessionStart said something went wrong').toBe('')
    expect(contextOf(began)).toContain(`THE MESSAGE, record ${written}:`)
    expect(contextOf(began)).toContain(body)
    expect(await theMark(written, handle)).toBe('delivered')

    // POSTTOOLUSE: a message that arrived while a tool ran is attached and reads delivered.
    const later = await writeTo(handle, 'a second message, while a tool ran in the sandbox')
    const tooled = await runHook(POST_TOOL_USE, handle, { ...asInASandbox, payload: { hook_event_name: 'PostToolUse', tool_name: 'Bash' } })
    expect(tooled.status, tooled.stderr).toBe(0)
    expect(tooled.stderr, 'PostToolUse said something went wrong').toBe('')
    expect(contextOf(tooled)).toContain(`THE MESSAGE, record ${later}:`)
    expect(await theMark(later, handle)).toBe('delivered')
    expect(contextOf(tooled)).not.toContain(`THE MESSAGE, record ${written}:`)

    // KEEP-THE-BRIEF: the brief is filed as a note about the run.
    const brief = join(aScratchDirectory('no-key-brief'), 'brief.md')
    writeFileSync(brief, '# The brief of a run in a sandbox\n')
    const kept = await runHook(KEEP_THE_BRIEF, handle, { ...asInASandbox, env: { ...asInASandbox.env, MOLE_OFFICE_BRIEF_PATH: brief } })
    expect(kept.status, kept.stderr).toBe(0)
    expect(kept.stderr, 'keep-the-brief said something went wrong').toBe('')
    const read = await inject('GET', `/api/records/${run}`, asAgent(handle))
    const links = (read.json['links'] ?? []) as { type: string; isBacklink: boolean; other?: { title?: string } }[]
    expect(
      links.some((one) => one.type === 'about' && one.isBacklink && one.other?.title === `Brief of ${handle}'s run ${run}`),
      'the brief was not kept about the run',
    ).toBe(true)

    // STOP: the delivered messages still hold the supervisor until it marks them read itself;
    // what the run was served is written onto its record.
    const stopCwd = aScratchDirectory('no-key-stop')
    const stopped = await runHook(STOP, handle, { ...asInASandbox, payload: { hook_event_name: 'Stop' }, cwd: stopCwd })
    expect(stopped.status, stopped.stderr).toBe(0)
    expect(stopped.stderr, 'Stop said something went wrong').toBe('')
    expect(parsed(stopped)?.['decision'], 'Stop let go of a supervisor with unread messages').toBe('block')
    expect(String(parsed(stopped)?.['reason'] ?? '')).toContain(written)
    expect(String(parsed(stopped)?.['reason'] ?? '')).toContain(later)
    const after = await inject('GET', `/api/records/${run}`, asAgent(handle))
    expect((after.json['record'] as { data: Record<string, unknown> }).data['served'], 'nothing served was written').toBeDefined()

    // ONCE THE AGENT HAS MARKED BOTH READ ITSELF, the stop is still held, because that run still says running with no
    // seal (problem UbG6k-7jGLa5).
    await clearInbox(handle)
    const stoppedAgain = await runHook(STOP, handle, { ...asInASandbox, payload: { hook_event_name: 'Stop' }, cwd: stopCwd })
    expect(stoppedAgain.status, stoppedAgain.stderr).toBe(0)
    expect(stoppedAgain.stderr, 'Stop said something went wrong').toBe('')
    expect(parsed(stoppedAgain)?.['decision'], 'Stop let go of a run that still runs unsealed').toBe('block')
    expect(String(parsed(stoppedAgain)?.['reason'] ?? '')).toContain(`Your run ${run} still says running`)

    // AND NO CALL CARRIED THE OFFICE'S KEY: every call that named the run carried the run's own key. Each key is
    // read here as words and never printed.
    const officeKey = theOfficesKeyHeader()[KEY_HEADER]
    const carried = { "the run's own key": 0, "the office's key": 0, 'no key': 0, 'another key': 0 }
    for (const sent of theKeysSentNamingARun.filter((one) => one.session === run)) {
      if (sent.key === undefined) carried['no key'] += 1
      else if (sent.key === runKey) carried["the run's own key"] += 1
      else if (sent.key === officeKey) carried["the office's key"] += 1
      else carried['another key'] += 1
    }
    expect({ ...carried, "the run's own key": carried["the run's own key"] > 0 }, 'what the calls that named the run carried').toEqual({
      "the run's own key": true,
      "the office's key": 0,
      'no key': 0,
      'another key': 0,
    })
  })
})
