// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLD START TELLS AN AGENT WITH A KEY TO FILE ITS SESSION RECORD BEFORE IT NAMES IT, BECAUSE THAT IS THE ORDER
 * THE OFFICE TAKES.
 *
 * The skill's reference (.claude/skills/mole-office/reference.md, *The cold start, in full*) said to send the run
 * name in `x-mole-office-session` before the session record is filed, and that the two would join up. A write that
 * carries a key may name only a run the key holds (src/server/lib/the-run-a-key-holds.ts), and a run name nothing is
 * bound to is no such run, so a new agent with its key that did as the reference said was refused.
 *
 * The office half shows the order that works, through the real doors with `app.inject`:
 *
 *   1. with an agent's own key, a run name sent before any session is filed is refused, and nothing is written;
 *   2. the same agent files a running session with its key and no session header, and the next write names it by its
 *      id, is taken, and its change row names that session.
 *
 * The words half reads the reference's numbered cold-start steps: the step that files the session record comes before
 * the first step that sends `x-mole-office-session`, no step says to send a run name, and the paragraph that speaks of
 * a run name names the status the office refused it with in case 1.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. The cold start of reference.md put back as it was before this file: the words case goes red on the order of
 *      the steps.
 *   b. Step 7 told again to send the run name before the session is filed: the words case goes red on the run name.
 *   c. The status taken out of the paragraph about a run name: the words case goes red on the status.
 *   d. `refuseASessionHeaderTheKeyDoesNotHold` in src/server/lib/http.ts returns before it checks anything: case 1
 *      goes red, and the words case with it, because it reads the status case 1 was refused with.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REFERENCE = fileURLToPath(new URL('../.claude/skills/mole-office/reference.md', import.meta.url))
const THE_COLD_START = '## The cold start, in full'
const THE_HEADER = '`x-mole-office-session`'

let t: TestDb
let app: FastifyInstance
let agentKey = ''
/** The status the office refused a run name sent with a key before any session was filed, read in case 1. */
let refusedWith: number | null = null

const HANDLE = 'a-cold-starter'

function asAgent(key: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': HANDLE,
    'x-mole-office-key': key,
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a reply, for a failure message. A key in it is replaced. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? JSON.stringify(body)).replace(/[0-9a-f]{64}/g, '<a key>')
}

function notesTitled(title: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'note' AND title = ?").get(title) as { n: number }).n
}

/** The section of the reference from its cold-start heading to the next heading of the same level. */
function theColdStart(): string {
  const text = readFileSync(REFERENCE, 'utf8')
  const start = text.indexOf(`\n${THE_COLD_START}\n`)
  expect(start, `reference.md has no "${THE_COLD_START}" section`).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n## ', start + THE_COLD_START.length + 1)
  return text.slice(start, end === -1 ? text.length : end)
}

/** Its numbered steps, each with the indented lines under it, in order. A blank line or a line at the margin ends a step. */
function itsSteps(section: string): string[] {
  const steps: string[] = []
  let open = false
  for (const line of section.split('\n')) {
    if (/^\d+\. /.test(line)) {
      steps.push(line)
      open = true
    } else if (open && /^\s+\S/.test(line)) {
      steps[steps.length - 1] += `\n${line}`
    } else {
      open = false
    }
  }
  return steps
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const personKey = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string }).person
  const made = await ask(
    '/api/agents/started',
    { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey },
    { handle: HANDLE, name: 'A cold starter', runtime: 'claude-code', role: 'worker' },
  )
  expect(made.status, said(made.body)).toBe(201)
  agentKey = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(/^[0-9a-f]{64}$/.test(agentKey), 'the registration answered no key').toBe(true)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the order the office takes, for an agent with its own key', () => {
  it('1. refuses a run name sent before any session is filed, and writes nothing', async () => {
    const title = 'a note under a run name nobody filed'
    const wrote = await ask('/api/records', asAgent(agentKey, 'my-first-run'), { kind: 'note', title, data: { body: title } })
    expect(wrote.status, said(wrote.body)).toBeGreaterThanOrEqual(400)
    expect(said(wrote.body), 'the refusal is not about the run the header names').toContain('"my-first-run"')
    expect(notesTitled(title), 'a refused write was stored all the same').toBe(0)
    refusedWith = wrote.status
  })

  it('2. takes a running session filed with no session header, and the next write named by its id', async () => {
    const filed = await ask('/api/records', asAgent(agentKey), {
      kind: 'session',
      title: 'a cold start',
      data: { state: 'running', runtime: 'claude-code' },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    const run = String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
    const title = 'a note in the run it filed'
    const wrote = await ask('/api/records', asAgent(agentKey, run), { kind: 'note', title, data: { body: title } })
    expect(wrote.status, said(wrote.body)).toBe(201)
    const id = String((wrote.body['record'] as { id?: string } | undefined)?.id ?? '')
    const row = t.client.sqlite.prepare("SELECT session_id AS session FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1").get(id) as
      | { session: string | null }
      | undefined
    expect(row?.session).toBe(run)
  })
})

describe("the reference's cold start says that order", () => {
  it('files the session record before any step sends its header, tells no step to send a run name, and names the refusal', () => {
    const section = theColdStart()
    const steps = itsSteps(section)
    expect(steps.length, 'the cold start has no numbered steps').toBeGreaterThan(0)
    const files = steps.findIndex((step) => /\bfile (?:the|your) session record\b/i.test(step))
    const sends = steps.findIndex((step) => step.includes(THE_HEADER))
    expect(files, 'no step files the session record').toBeGreaterThanOrEqual(0)
    expect(sends, `no step sends ${THE_HEADER}`).toBeGreaterThanOrEqual(0)
    expect(files, `step ${String(sends + 1)} sends ${THE_HEADER} before step ${String(files + 1)} files the session record`).toBeLessThan(sends)
    expect(steps.filter((step) => /\brun name\b/i.test(step)), 'a step says to send a run name').toEqual([])

    // AND THE PARAGRAPH THAT SPEAKS OF A RUN NAME NAMES THE STATUS THE OFFICE REFUSED IT WITH, read in case 1.
    expect(refusedWith, 'case 1 did not run, so the status is not known').not.toBeNull()
    const paragraphs = section.split(/\n\s*\n/).filter((one) => !/^\d+\. /.test(one.trim()) && /\brun name\b/i.test(one))
    expect(paragraphs.length, 'no paragraph of the cold start says what happens to a run name').toBeGreaterThan(0)
    expect(
      paragraphs.some((one) => one.includes(String(refusedWith))),
      `no paragraph that speaks of a run name says it is refused with ${String(refusedWith)}`,
    ).toBe(true)
  })
})
