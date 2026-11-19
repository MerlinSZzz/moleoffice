// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLAUDE CODE RUN IN A SANDBOX IS HANDED THE MESSAGES THAT WAIT FOR IT, AND ITS STOP IS HELD WHILE ITS RUN IS
 * UNFINISHED, THROUGH REAL DOORS IN A TEST WORLD.
 *
 * A worker under claude -p had no waiter and no hook, so a supervisor's answer waited unread until the worker ended.
 * The step hook now hands over each unseen message once in the session, as dsh's PostToolUse does. The stop hook holds
 * the stop by the same rules dsh's stop hook follows (whatHoldsTheStop in tools/dsh-hooks/office.mjs).
 *
 * WHAT IS REAL. The two hook scripts, tools/dsh-hooks/claude-code-step.mjs and claude-code-stop.mjs, run as their own
 * processes against the product's own API on a free port over a throwaway database, with the identity in their
 * environment as the launcher gives it to a run. No model runs and no live office is reached.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - The hand-over left out of the step hook: the hand-over case is red.
 *   - The messages' words left out of the hand-over: the hand-over case is red.
 *   - The hand-over forgetting what it handed over: the second-run part of the hand-over case is red.
 *   - The own-run rule taken out of whatHoldsTheStop: the held-stop case is red.
 *   - The Claude Code stop writing what served the run, as dsh's does: the served case is red.
 *   - Every read that failed said as "did not answer", as before: the refused case is red.
 *   - A supervisor's failed message read letting the stop go by itself, as before: the second-line case is red.
 *   - The stop the cap lets go said nothing: the second-line case is red.
 *
 * The reads made with the run's own key after the key window closed are tests/a-claude-code-runs-hooks-read-with-the-runs-key.test.ts.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theDeliveryPreface } from '../tools/dsh-hooks/office.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const STEP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-step.mjs', import.meta.url))
const STOP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-stop.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api = ''

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

const made: string[] = []
function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-claude-code-hooks-${what}-`))
  made.push(dir)
  return dir
}

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

/** Register an agent and file a run of it in the state asked for: its identity, as the launcher gives it. */
async function anAgentAndItsRun(handle: string, state: 'running' | 'finished', role?: string): Promise<string> {
  const made = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, ...(role === undefined ? {} : { role }) })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  const filed = await inject('POST', '/api/records', asAgent(handle), { kind: 'session', title: `a run of ${handle}`, data: { state } })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

async function writeTo(handle: string, body: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: 'a message for a Claude Code run', data: { body, to: [{ kind: 'agent', id: handle }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, JSON.stringify(filed.json)).toBe(409)
  return (filed.json['record'] as { id: string }).id
}

async function unseenIdsFor(handle: string): Promise<string[]> {
  const reply = await inject('GET', '/api/messages?only=waiting-for-me&full=1', asAgent(handle))
  return ((reply.json['messages'] ?? []) as { id: string }[]).map((one) => one.id)
}

/** Mark every message waiting for one agent seen, so a case starts from nothing waiting: a newly registered agent is
 * sent its card by the office, which would otherwise be counted. */
async function clearInbox(handle: string): Promise<void> {
  for (const id of await unseenIdsFor(handle)) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(handle), { mark: 'seen' })
    expect(marked.status, JSON.stringify(marked.json)).toBe(200)
  }
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}

/** Run one hook as Claude Code would: the payload on stdin, the run's identity in the environment. Asynchronous, so the office in this process can answer. */
function runHook(script: string, identity: { handle: string; session: string; workspace?: string } | null, cwd: string, payload: unknown, office: string = api): Promise<Ran> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  delete env['MOLE_AGENT_KEY']
  if (identity === null) {
    delete env['MOLE_OFFICE_AGENT']
    delete env['MOLE_OFFICE_SESSION']
    delete env['MOLE_OFFICE_WORKSPACE']
  } else {
    env['MOLE_OFFICE_AGENT'] = identity.handle
    env['MOLE_OFFICE_SESSION'] = identity.session
    env['MOLE_OFFICE_WORKSPACE'] = identity.workspace ?? 'default'
  }
  env['MOLE_OFFICE_API'] = office
  env['MOLE_OFFICE_DB'] = t.file
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {})
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

/**
 * AN OFFICE THAT REFUSES ONLY THE UNSEEN-MESSAGES READ: a door in front of the test office that answers that read 403, as
 * the office answers a run's hooks that hold no key since the key window closed (problem RJradfGfKxlq), and passes every
 * other request through unchanged, the run's own record among them.
 */
async function anOfficeThatRefusesTheMessageRead(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    void (async () => {
      if ((req.url ?? '').startsWith('/api/messages')) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'This read named an agent and carried no key.' }))
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
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, server }
}

function parsed(ran: Ran): Record<string, unknown> | null {
  const text = ran.stdout.trim()
  return text === '' ? null : (JSON.parse(text) as Record<string, unknown>)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the step hook of a Claude Code run in a sandbox', () => {
  it('gives each waiting message’s words once in the session, with the preface, and marks none seen', async () => {
    const session = await anAgentAndItsRun('cc-told', 'running')
    await clearInbox('cc-told')
    const first = await writeTo('cc-told', 'the first thing the supervisor says')
    const second = await writeTo('cc-told', 'the second thing the supervisor says')
    // AND ONE WRITTEN IN ANOTHER PROJECT, WHICH IS HANDED OVER TOO. Every message is kept in the office's message centre
    // and belongs to no project, so what waits for this agent is every message waiting for it, wherever it was written.
    // Before that rule, this one was left out as another project's.
    const elsewhere = await inject('POST', '/api/workspaces', AS_THE_PERSON, { id: 'elsewhere', title: 'Another project' })
    expect([201, 409], JSON.stringify(elsewhere.json)).toContain(elsewhere.status)
    const third = await inject('POST', '/api/records', { ...AS_THE_PERSON, 'x-mole-office-workspace': 'elsewhere' }, { kind: 'message', title: 'a message in another project', data: { body: 'said elsewhere', to: [{ kind: 'agent', id: 'cc-told' }] } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(third.status, JSON.stringify(third.json)).toBe(409)
    const cwd = aScratchDirectory('told')
    const ran = await runHook(STEP, { handle: 'cc-told', session }, cwd, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(ran.status, ran.stderr).toBe(0)
    const output = (parsed(ran)?.['hookSpecificOutput'] ?? {}) as Record<string, unknown>
    expect(output['hookEventName']).toBe('PostToolUse')
    const context = String(output['additionalContext'])
    expect(context.startsWith(theDeliveryPreface({ handle: 'cc-told' }, 3)), 'the hand-over did not begin with the preface').toBe(true)
    for (const body of ['the first thing the supervisor says', 'the second thing the supervisor says', 'said elsewhere']) {
      expect(context, `the hand-over left out the words "${body}"`).toContain(body)
    }

    // THE SAME SESSION IS NOT GIVEN THE SAME MESSAGES AGAIN.
    const again = await runHook(STEP, { handle: 'cc-told', session }, cwd, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout, 'the same session was handed the same messages again').toBe('')

    // A MESSAGE WRITTEN AFTER THE FIRST RUN IS GIVEN ALONE BY THE NEXT RUN.
    const fourth = await writeTo('cc-told', 'a fourth thing the supervisor says')
    const next = await runHook(STEP, { handle: 'cc-told', session }, cwd, { hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    expect(next.status, next.stderr).toBe(0)
    const nextContext = String(((parsed(next)?.['hookSpecificOutput'] ?? {}) as Record<string, unknown>)['additionalContext'])
    expect(nextContext.startsWith(theDeliveryPreface({ handle: 'cc-told' }, 1)), 'the later hand-over did not begin with the preface for one message').toBe(true)
    expect(nextContext).toContain('a fourth thing the supervisor says')
    for (const body of ['the first thing the supervisor says', 'the second thing the supervisor says', 'said elsewhere']) {
      expect(nextContext, `the later hand-over repeated the words "${body}"`).not.toContain(body)
    }

    // THE RUN READS THEM ITSELF: the hook marks nothing seen.
    expect((await unseenIdsFor('cc-told')).sort()).toEqual([first, second, (third.json['record'] as { id: string }).id, fourth].sort())
  })

  it('prints nothing when nothing waits, and says in one sentence when the run has no identity', async () => {
    const session = await anAgentAndItsRun('cc-quiet', 'running')
    await clearInbox('cc-quiet')
    const quiet = await runHook(STEP, { handle: 'cc-quiet', session }, aScratchDirectory('quiet'), { hook_event_name: 'PostToolUse' })
    expect(quiet.status, quiet.stderr).toBe(0)
    expect(quiet.stdout).toBe('')
    const nobody = await runHook(STEP, null, aScratchDirectory('nobody'), { hook_event_name: 'PostToolUse' })
    expect(nobody.status).toBe(0)
    expect(nobody.stdout).toBe('')
    expect(nobody.stderr).toContain('so no message was attached')
  })
})

describe('what the two hooks say when the office refused', () => {
  // PROBLEM Z1UaYRGkHBxa: an office that answered with a refusal is not an office that did not answer. A project this office
  // does not hold is refused at the doors these hooks read, so each says the status it was answered instead.
  it('says the status it was answered, and never that the office did not answer', async () => {
    const session = await anAgentAndItsRun('cc-refused', 'running')
    for (const script of [STEP, STOP]) {
      const ran = await runHook(script, { handle: 'cc-refused', session, workspace: 'no-such-project' }, aScratchDirectory('refused'), { hook_event_name: 'PostToolUse' })
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout).toBe('')
      expect(ran.stderr, 'a hook said the office did not answer when it had refused').not.toContain('did not answer')
      expect(ran.stderr).toMatch(/Mole Office answered \d{3} at /)
    }
  })
})

describe('the stop hook of a Claude Code run in a sandbox', () => {
  it('holds a run that still runs unsealed, names it, and at most three times in a row', async () => {
    const session = await anAgentAndItsRun('cc-held', 'running')
    const cwd = aScratchDirectory('held')
    const decisions: (string | null)[] = []
    let reason = ''
    for (let stop = 1; stop <= 4; stop += 1) {
      const said = parsed(await runHook(STOP, { handle: 'cc-held', session }, cwd, { hook_event_name: 'Stop', stop_hook_active: stop > 1 }))
      decisions.push(said === null ? null : String(said['decision'] ?? null))
      if (said !== null) reason = String(said['reason'] ?? '')
    }
    expect(decisions).toEqual(['block', 'block', 'block', null])
    expect(reason).toContain(`Your run ${session} still says running, and it is not sealed.`)
    expect(reason).toContain('wait for it before you end your turn')
  })

  // PROBLEM RJradfGfKxlq: a run's hooks held no key, and once the key window closed the office refused a supervisor's
  // message read, which let the stop go by itself (messages GdSoXrDumLmp and 1s5mFLOPSg-4). Now its own run still
  // running holds it, the reason names the read, and the cap lets it go at the fourth stop with a sentence.
  it('holds a supervisor whose message read is refused for its own run, names that read, and says when the cap lets it go', async () => {
    const session = await anAgentAndItsRun('cc-second-line', 'running', 'supervisor')
    const refusing = await anOfficeThatRefusesTheMessageRead()
    try {
      const cwd = aScratchDirectory('second-line')
      const ran: Ran[] = []
      for (let stop = 1; stop <= 4; stop += 1) {
        ran.push(await runHook(STOP, { handle: 'cc-second-line', session }, cwd, { hook_event_name: 'Stop', stop_hook_active: stop > 1 }, refusing.url))
      }
      expect(ran.map((one) => one.status)).toEqual([0, 0, 0, 0])
      expect(ran.map((one) => (parsed(one) === null ? null : String(parsed(one)?.['decision'])))).toEqual(['block', 'block', 'block', null])
      const reason = String(parsed(ran[0]!)?.['reason'] ?? '')
      expect(reason).toContain(`Your run ${session} still says running, and it is not sealed.`)
      expect(reason).toContain(
        `This hook could not read what is waiting for you (Mole Office answered 403 at ${refusing.url}): ` +
          'read it yourself at GET /api/messages?only=waiting-for-me&full=1 before you stop.',
      )
      expect(ran.slice(0, 3).map((one) => one.stderr)).toEqual(['', '', ''])
      expect(ran[3]!.stderr).toBe(`claude-code Stop: the same reason had held this stop 3 times in a row (own-run:${session}), so the stop was allowed.\n`)
    } finally {
      await new Promise<void>((closed) => refusing.server.close(() => closed()))
    }
  })

  it('lets a run that is over stop, and writes nothing about what served it', async () => {
    const session = await anAgentAndItsRun('cc-over', 'finished')
    const ran = await runHook(STOP, { handle: 'cc-over', session }, aScratchDirectory('over'), { hook_event_name: 'Stop' })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toBe('')
    // THE LAUNCHER WRITES A CLAUDE CODE RUN'S `served` WHEN ITS COMMAND ENDS; this hook never does.
    const read = await inject('GET', `/api/records/${session}`, asAgent('cc-over'))
    expect((read.json['record'] as { data: Record<string, unknown> }).data['served'], 'the Claude Code stop hook wrote what served the run').toBeUndefined()
  })
})
