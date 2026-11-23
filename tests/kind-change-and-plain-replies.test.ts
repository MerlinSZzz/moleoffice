// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR THINGS THE SERVER SAID THAT WERE FALSE OR UNUSABLE, AND THE ONE THING IT DID NOT DO.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * Everything here was found on 18 August 2026 by three people using Mole Office in a browser for the
 * first time, and by one agent driving the whole agent path with a real agent. None of it was
 * caught by the 5,904 tests that were passing at the time, and the normal-mode test — the file
 * that existed to keep Mole Office's own vocabulary off a screen — did not catch any of it either,
 * because it reads what a PAGE draws and every one of these sentences is written by the SERVER and
 * printed by a page verbatim.
 *
 *   1. CHANGING A KIND LOST THE ESTIMATE AND SAID IT HAD BEEN KEPT. A person typed `6h` on a plan
 *      line, tracked it, and changed the kind twice. The 6 was in `data.extra.effort_hours`, where
 *      nothing in the product reads it, and Mole Office's reply said it had been kept. It had been. It
 *      was also gone from the plan text, from the table and from the record. A sentence that is
 *      technically true and practically a lie is worse than either.
 *   2. THE SENTENCE SAYING SO NAMED A STORED PATH AND AN API PATH. It was read in a ninety-pixel
 *      column and could not be acted on.
 *   3. THE DISPATCH REFUSAL DESCRIBED THE WRONG FAULT. "1 of the 1 comment here does not say who it
 *      is for", about a comment that says exactly who it is for and names an agent that cannot be
 *      picked up again.
 *   4. YOU COULD NOT REPLY TO THE AGENT THAT JUST ANSWERED YOU. The answer carries the tool's own
 *      id for the conversation it came from and nothing wrote it down, so the run Mole Office had went
 *      on naming the conversation it was picked up from — and a later sweep filed a second record
 *      for the conversation that actually answered.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RULE EVERY "PLAIN" TEST BELOW APPLIES
 * ---------------------------------------------------------------------------------------------
 *
 * `noWireIn` is the whole of it, and it is deliberately narrow: a stored field path, an HTTP verb
 * with a path, and a Mole Office header name. Those are the three things a person cannot act on and the
 * three things these sentences kept carrying. It is NOT a readability score and it does not try to
 * be one — what makes the sentences readable is that each one is also asserted, word for word,
 * against the shape it must have.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KIND_SPECS } from '@shared/kinds.ts'
import { RECORD_KINDS } from '@shared/types.ts'
import { fieldWords, withArticle } from '@shared/work.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'

// ------------------------------------------------------------------------------ the harness

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance

/** The office is made once for the file; each case makes the records it acts on. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 300)}`)
  }
  return parsed as Record<string, unknown>
}

interface KindChange {
  from: string
  to: string
  changed: boolean
  kept: { key: string; nowAt: string; why: string; plainly: string }[]
  broughtBack: { key: string; wasAt: string; restored: boolean; why: string; plainly: string }[]
  note: string
  detail: string
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** The agent "the run that wrote the note" worked as, filed once, because the office is made once for the file. */
let theNoteWritersAgent: string | null = null

/**
 * THE RUN THAT WROTE THE NOTE, naming the agent it worked as in `ranAs`. A comment addressed to a run that answers as no
 * agent is refused before it is stored, and nothing is made up for it. Only the person with their key may file a
 * session for an agent.
 */
async function theRunThatWroteTheNote(data: Record<string, unknown>): Promise<string> {
  theNoteWritersAgent ??= await file('agent', 'The agent that wrote the note', { handle: 'the-note-writer', state: 'active', runtime: 'claude-code' })
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { kind: 'session', title: 'the run that wrote the note', data: { ...data, ranAs: [{ workspaceId: WORKSPACE, agentId: theNoteWritersAgent }] } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function becomes(id: string, kind: string): Promise<KindChange> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: HUMAN,
    payload: { kind },
  })
  expect(res.statusCode, res.body).toBe(200)
  const report = bodyOf(res)['kindChange']
  if (typeof report !== 'object' || report === null) throw new Error(`no kindChange in ${res.body.slice(0, 300)}`)
  return report as KindChange
}

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const record = bodyOf(res)['record'] as Record<string, unknown>
  return record['data'] as Record<string, unknown>
}

/**
 * THE THREE THINGS A PERSON CANNOT ACT ON, and the only things this checks for.
 *
 * A stored field path (`data.extra.state`), a request line (`GET /api/kinds/problem`) and a Mole Office
 * header name (`x-mole-office-workspace`). Each one is a thing to type at a program, and the person who
 * met all three was reading a plan table in a browser.
 */
function noWireIn(sentence: string): void {
  expect(sentence, 'a stored field path reached a person').not.toMatch(/\bdata\.[A-Za-z_]/)
  expect(sentence, 'a request line reached a person').not.toMatch(/\b(GET|POST|PATCH|PUT|DELETE)\s+\//)
  // The name from before 28 August 2026 is looked for as well: a header name that leaked into a
  // sentence is just as unreadable when the name it leaked is the old one.
  expect(sentence, 'a header name reached a person').not.toMatch(/x-(?:mole-office|panelx)-/i)
}

// ============================================================================================
describe('what a kind change does with a value the new kind cannot hold', () => {
  it('gives the estimate and the state back when the kind changes back', async () => {
    // The tester's own sequence: a plan line saying 6h, tracked as a task, then two kind changes.
    const id = await file('task', 'reprint the gripper at 50mm', { state: 'todo', effort_hours: 6 })

    const away = await becomes(id, 'problem')
    expect(away.kept.map((k) => k.key).sort()).toEqual(['effort_hours', 'state'])
    // Both really are set aside, and this is the state the tester was left in.
    const asProblem = await dataOf(id)
    expect(asProblem['effort_hours']).toBeUndefined()
    expect(asProblem['state']).toBeUndefined()
    expect(asProblem['extra']).toEqual({ effort_hours: 6, state: 'todo' })

    const back = await becomes(id, 'task')
    const asTask = await dataOf(id)
    // THE WHOLE POINT. The record is the task it started as.
    expect(asTask['effort_hours']).toBe(6)
    expect(asTask['state']).toBe('todo')
    expect(asTask['extra']).toEqual({})

    // AND THE REPLY SAYS WHICH ONES CAME HOME. A value that reappears without being announced is
    // as surprising as one that disappears without being announced.
    expect(back.broughtBack.map((f) => f.key).sort()).toEqual(['effort_hours', 'state'])
    expect(back.broughtBack.every((f) => f.restored)).toBe(true)
    expect(back.broughtBack.map((f) => f.wasAt).sort()).toEqual(['data.extra.effort_hours', 'data.extra.state'])
    expect(back.note).toContain('Effort hours and state came back onto this record')
    expect(back.detail).toContain('data.extra.effort_hours')
  })

  it('refuses to write over a value the record already holds, and says so instead of doing it', async () => {
    // A task and an obligation both declare `effort_hours`, so the record keeps its own 6 through
    // the change. The 12 that was set aside by some earlier change has nowhere to go, and choosing
    // between two numbers somebody wrote is not Mole Office's to do.
    const id = await file('task', 'swap the force gauge', { effort_hours: 6, extra: { effort_hours: 12 } })

    const report = await becomes(id, 'obligation')
    const held = await dataOf(id)
    expect(held['effort_hours']).toBe(6)
    expect(held['extra']).toMatchObject({ effort_hours: 12 })

    const blocked = report.broughtBack.find((f) => f.key === 'effort_hours')
    expect(blocked).toBeDefined()
    expect(blocked?.restored).toBe(false)
    expect(report.note).toContain('This record already has its own effort hours')
    expect(report.note).toContain('stays set aside')
  })

  it('leaves a value in place when the new kind cannot hold it, and says that rather than refusing', async () => {
    // `state` is in `extra` as a task word, and a purchase cannot hold a task word. The kind change
    // still happens: a value nobody asked to restore must not make a correctable mistake permanent.
    const id = await file('task', 'order a second gauge', { extra: { state: 'todo' } })
    const report = await becomes(id, 'purchase')

    const blocked = report.broughtBack.find((f) => f.key === 'state')
    expect(blocked?.restored).toBe(false)
    expect((await dataOf(id))['extra']).toEqual({ state: 'todo' })
    expect(report.note).toContain('A purchase cannot hold that state')
  })

  it('says nothing about extra when extra holds nothing the new kind declares', async () => {
    const id = await file('task', 'tidy the bench', { extra: { rig_serial: 'A-14' } })
    const report = await becomes(id, 'problem')
    expect(report.broughtBack).toEqual([])
    expect((await dataOf(id))['extra']).toEqual({ rig_serial: 'A-14' })
  })
})

// ============================================================================================
describe('the sentence a person reads when a kind changes', () => {
  it('says why the value cannot stay, what happens to it, and how to get it back — with no wire in it', async () => {
    const id = await file('task', 'reprint the gripper at 50mm', { state: 'todo', effort_hours: 6 })
    const report = await becomes(id, 'problem')

    noWireIn(report.note)
    // The required shape, in the voice of the sentence beside it in the plan table:
    // what this kind has no place for, then what became of the value, then how to get it back.
    expect(report.note).toContain('This record was a task and is now a problem.')
    expect(report.note).toContain('A problem has no effort hours')
    expect(report.note).toContain('set aside')
    expect(report.note).toContain('Nothing reads them while this is a problem')
    expect(report.note).toContain('come back if you make this a task again')

    // NOTHING IS LOST BY BEING PLAIN. The exact place is still served, in the field a developer
    // view and an agent read, and in `kept` as data.
    expect(report.detail).toContain('data.extra.effort_hours')
    expect(report.detail).toContain('GET /api/kinds/problem')
    expect(report.kept.map((k) => k.nowAt).sort()).toEqual(['data.extra.effort_hours', 'data.extra.state'])
  })

  it('says the state is set aside, which is what nobody was told', async () => {
    // The third tester's report: task to problem to task left the record with no state where it had
    // `todo`, and nothing said it would. It is said now, and the round trip gives it back.
    const id = await file('task', 'calibrate the wrist camera', { state: 'todo' })
    const away = await becomes(id, 'problem')
    expect(away.note).toContain('State does not mean the same thing on a problem')
    expect((await dataOf(id))['state']).toBeUndefined()

    const back = await becomes(id, 'task')
    expect((await dataOf(id))['state']).toBe('todo')
    expect(back.note).toContain('State came back onto this record')
  })

  it('never joins a word to the wrong article, for any kind', async () => {
    // "Tracked as a obligation" and "This record was a obligation and is now a problem" both
    // reached a reader. One rule now answers it, in shared/work.ts.
    expect(withArticle('obligation')).toBe('an obligation')
    expect(withArticle('idea')).toBe('an idea')
    expect(withArticle('task')).toBe('a task')

    const id = await file('task', 'return the borrowed gauge', {})
    const report = await becomes(id, 'obligation')
    expect(report.note).toContain('is now an obligation')
    expect(report.note).not.toContain('a obligation')
  })

  it('keeps the wire out of every kind change this schema allows', async () => {
    // A sweep rather than one example, because the sentence is built from the kinds and a kind
    // added tomorrow reaches it without this file being touched. Only the kinds a record may become
    // through this route: `block` cannot be one and the human-only kinds are refused to an agent,
    // and both refusals are proved in tests/kind-can-change.test.ts.
    for (const to of RECORD_KINDS) {
      if (to === 'block') continue
      const id = await file('task', `an ordinary task becoming ${to}`, { state: 'todo', effort_hours: 3 })
      const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: HUMAN, payload: { kind: to } })
      if (res.statusCode !== 200) continue
      const report = bodyOf(res)['kindChange'] as KindChange
      noWireIn(report.note)
      expect(report.note, `${to} was joined to the wrong article`).not.toMatch(/\ba (?:obligation|idea)\b/)
    }
  })
})

// ============================================================================================
describe('the sentence a person reads after an ordinary edit', () => {
  it('says what changed by name, and never counts JSON paths at them', async () => {
    const id = await file('task', 'reprint the gripper at 50mm', { state: 'todo' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { state: 'doing' } },
    })
    expect(res.statusCode, res.body).toBe(200)
    const outcome = bodyOf(res)['dataPatch'] as { note: string; detail: string; changed: string[] }

    // What the person met before: "1 path changed: data.state."
    expect(outcome.note).toBe('Saved. What changed: state.')
    noWireIn(outcome.note)
    // The exact paths are still there, twice: as the sentence a developer view reads, and as data.
    expect(outcome.detail).toContain('1 path changed: data.state')
    expect(outcome.changed).toEqual(['data.state'])
  })

  it('names a camel-cased key in words too', async () => {
    const id = await file('session', 'a run somebody filed by hand', { state: 'running' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { lastOutputAt: '2026-08-18 09:00:00' } },
    })
    expect(res.statusCode, res.body).toBe(200)
    const outcome = bodyOf(res)['dataPatch'] as { note: string }
    expect(outcome.note).toBe('Saved. What changed: last output at.')
  })

})

// ============================================================================================
describe('the server and the record page name a field the same way', () => {
  // THE PAGE IS IMPORTED ONCE, IN A HOOK, AND THE CASE ONLY COMPARES. The record page is a large
  // module, and on a busy machine its first import took longer than the five seconds a case has: the
  // case ended with "Test timed out in 5000ms" in a merge queue run. A cold import of a large module
  // graph is the same work as the server's import in this file's first hook, so the page's import
  // gets that hook's budget, by its name.
  let page: typeof import('../src/web/pages/RecordPage.tsx')
  beforeAll(async () => {
    // The window stand-in is the same one tests/record-tiers.test.ts installs and for the same
    // reason: src/web/lib/workspace.ts reads localStorage at import.
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    try {
      page = await import('../src/web/pages/RecordPage.tsx')
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window
    }
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  it('agrees with englishHeading on every declared key of every kind', () => {
    // THE SAME FACT IS WORKED OUT IN TWO PLACES AND THIS IS WHAT MAKES THEM AGREE. `englishHeading`
    // in src/web/pages/RecordPage.tsx computes a field's English name for the heading and the Save
    // button; `fieldWords` in src/shared/work.ts computes it for the server's own sentences. The
    // server may not import a React page, so the two cannot be one function — and CLAUDE.md offers
    // exactly three ways out of that, of which this is the third: make a test fail when they
    // disagree. A rule changed in one and not the other is red here rather than two spellings of
    // one field on two screens.
    const keys = new Set<string>()
    for (const spec of Object.values(KIND_SPECS)) for (const field of spec.fields) keys.add(field.key)
    expect(keys.size).toBeGreaterThan(40)
    for (const key of keys) {
      expect(fieldWords(key), `the two names for "${key}" have drifted apart`).toBe(
        page.englishHeading(key).toLowerCase(),
      )
    }
  })
})

// ============================================================================================
describe('a record that is in another project', () => {
  it('names the record, hands the browser the two facts a button needs, and keeps the header for a program', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: HUMAN,
      payload: { id: 'robotics', title: 'Robotics' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...HUMAN, 'x-mole-office-workspace': 'robotics' },
      payload: { kind: 'task', title: 'swap the gripper' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const id = (res.json() as { record: { id: string } }).record.id

    const wrong = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect(wrong.statusCode).toBe(404)
    const said = bodyOf(wrong)

    const error = said['error'] as string
    noWireIn(error)
    // THE SENTENCE NAMES THE RECORD AND NOTHING ELSE. It used to read: "swap the gripper belongs to
    // the project \"robotics\", and you are looking at \"default\". Nothing here answers about another
    // project, so this found nothing. Switch to \"robotics\" and open it there." Both projects were
    // named by their stored ids where the sidebar in the same screenshot showed their titles, and
    // the reader was told in words to do a thing the product could do for them. Finding 4 of the
    // language audit, 19 August 2026.
    expect(error).toContain('"swap the gripper" is in another project.')
    expect(error).not.toContain('robotics')
    expect(error).not.toContain('Switch to')

    // AND THE BROWSER GETS THE TWO FACTS THAT MAKE IT A BUTTON RATHER THAN AN INSTRUCTION: which
    // record, and which project. It turns the project id into the project's NAME itself, because it
    // already holds that list — sending the name from here as well would be the same fact worked
    // out in two places. Without this the screen can only tell somebody to go and switch.
    expect(said['elsewhere']).toEqual({ title: 'swap the gripper', workspaceId: 'robotics', recordId: id })

    // The exact header is still served, for an agent and for Developer mode.
    expect(said['detail']).toContain('x-mole-office-workspace: robotics')
  })

  it('says there is nothing at this address, without the id, when the id names nothing at all', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/records/NOPEnothere99', headers: HUMAN })
    expect(missing.statusCode).toBe(404)
    const said = bodyOf(missing)
    const error = said['error'] as string
    // "No record with id NOPEnothere99" — the stored word `id` as a bare noun, the raw id as the
    // subject, and no full stop. Finding 10, 19 August 2026.
    expect(error).toBe('There is no record at this address. It may have been deleted, or the link may be wrong.')
    expect(error).not.toContain('NOPEnothere99')
    // WHICH ID WAS NOT FOUND IS STILL SAID, where an id belongs.
    expect(said['detail']).toContain('NOPEnothere99')
  })
})

// ============================================================================================
describe('the refusal when a review cannot be sent', () => {
  it('does not claim a comment fails to say who it is for when it says exactly that', async () => {
    // A session record nothing has ever stamped: Mole Office knows who the comment is for and cannot
    // pick that agent up again. That is a different fault from "nobody has been chosen". It names the
    // agent it worked as, so the comment is stored and the refusal is dispatch's.
    const session = await theRunThatWroteTheNote({ state: 'idle', runtime: 'claude-code' })
    const thread = (
      await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'read this again', mode: 'review' },
      })
    ).json() as { thread: { id: string } }

    const written = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'Does this still hold after the rewrite?',
        recipient: { kind: 'session', sessionId: session, why: 'This run wrote it.' },
      },
    })
    expect(written.statusCode, written.body).toBe(201)

    const sent = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/dispatch`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    expect(sent.statusCode, sent.body).toBe(409)
    const error = bodyOf(sent)['error'] as string

    // THE LIE. The comment says who it is for, by id, with a reason.
    expect(error).not.toContain('does not say who it is for')
    // THE REAL FAULT, on the line about that comment.
    expect(error).toContain('cannot be picked up')
    expect(error).toContain('the line under each one says why')
    // AND NOTHING WAS LOST. This is still a 409 because this review holds ONE comment and it could
    // not be sent, so there was no half to send.
    //
    // IT USED TO ALSO PIN "A review is sent whole or not at all". That sentence was true of every
    // dispatch until 19 August 2026 and is now true of none: a review with one bad address sends
    // its good comments and names the one that stayed. The wording changed with the rule; what this
    // test is about — the refusal naming the REAL fault rather than a summary that is right one
    // time in five — did not.
    expect(error).toContain('Everything is still waiting and nothing is lost')
  })

  it('still says so plainly when nobody has been chosen, which is the other fault', async () => {
    const thread = (
      await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'a comment with nobody on it', mode: 'review' },
      })
    ).json() as { thread: { id: string } }
    await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Who owns this?' },
    })
    const sent = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/dispatch`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    expect(sent.statusCode, sent.body).toBe(409)
    expect(bodyOf(sent)['error']).toContain('No recipient chosen yet')
  })
})

// ============================================================================================
//
// REPLYING TO THE AGENT THAT JUST ANSWERED YOU
//
// These call `finishRun` directly rather than through its route, for one reason: the route always
// looks at the real machine, and a test that only passes when the right transcript is in the right
// home directory is a test nobody can run twice. The route is one line — `finishRun(id, body)` —
// and everything under test is in the function.

const HOMES = mkdtempSync(join(tmpdir(), 'mole-office-run-home-'))
afterAll(() => { rmSync(HOMES, { recursive: true, force: true }) })

/** A Claude Code transcript where its adapter really looks: ~/.claude/projects/<project>/<id>.jsonl */
function transcriptIn(home: string, externalId: string): string {
  const at = join(home, '.claude', 'projects', 'a-project', `${externalId}.jsonl`)
  mkdirSync(dirname(at), { recursive: true })
  writeFileSync(at, '{"type":"user","message":{"role":"user","content":"hello"},"cwd":"/tmp/a-project"}\n')
  return at
}

describe('a finished run writes down the conversation that answered', () => {
  const FIRST = '11111111-1111-4111-8111-111111111111'
  const SECOND = '22222222-2222-4222-8222-222222222222'

  /** A session record that can be picked up, a thread addressed to it, and its dispatched run. */
  async function runAddressedTo(externalId: string, logPath: string): Promise<{ runId: string; sessionId: string }> {
    const sessionId = await theRunThatWroteTheNote({
      state: 'idle',
      runtime: 'claude-code',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId,
          logPath,
          resumeCommand: `claude --resume ${externalId}`,
          observedState: 'idle',
          stateReason: 'its log last grew 40 minutes ago',
          filesTouched: [],
          filesComplete: true,
          at: '2026-08-18 09:00:00',
        },
      },
    })
    const thread = (
      await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'about the note you wrote', mode: 'direct' },
      })
    ).json() as { thread: { id: string } }
    await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'Does this still hold?',
        recipient: { kind: 'session', sessionId, why: 'This run wrote it.' },
      },
    })
    const sent = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/dispatch`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    expect(sent.statusCode, sent.body).toBe(201)
    const runs = (sent.json() as { runs: { id: string }[] }).runs
    expect(runs).toHaveLength(1)
    return { runId: runs[0]?.id ?? '', sessionId }
  }

  it('points the run at the conversation that answered, so the next reply reaches it', async () => {
    const home = mkdtempSync(join(HOMES, 'reply-'))
    const was = transcriptIn(home, FIRST)
    // Picking a Claude Code conversation up again can produce a new conversation id. This is that.
    const now = transcriptIn(home, SECOND)

    const { runId, sessionId } = await runAddressedTo(FIRST, was)
    const agents = await import('../src/server/lib/agents.ts')
    const sessions = await import('../src/server/lib/sessions.ts')
    const recipients = await import('../src/server/lib/recipients.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')

    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: AGENT,
      payload: { worker: 'a-worker' },
    })
    const finished = agents.finishRun(
      runId,
      { result: { answer: 'It still holds.', runtime: { tool: 'claude-code', sessionId: SECOND } } },
      defaultEnv({ homeDir: home }),
    )

    expect(finished.pickUpAgain?.written).toBe(true)
    expect(finished.pickUpAgain?.externalId).toBe(SECOND)
    expect(finished.pickUpAgain?.logPath).toBe(now)
    expect(finished.note).toContain('points at the conversation that answered you')
    noWireIn(finished.note)

    // THE RECORD ITSELF, read the way the product reads it. `stampOf` is the one reader of a
    // discovery stamp and `pickUpOf` is the one place Mole Office decides whether a run can be picked
    // up again — the same reading the recipient list shows before Send.
    const record = t.api.getRecord(sessionId)
    expect(record).not.toBeNull()
    const stamp = sessions.stampOf(record as NonNullable<typeof record>)
    expect(stamp?.externalId).toBe(SECOND)
    expect(stamp?.logPath).toBe(now)
    const pick = recipients.pickUpOf(record as NonNullable<typeof record>)
    expect(pick.answer).toBe('yes')
    expect(pick.answer === 'yes' && pick.conversationId).toBe(SECOND)
  })

  it('writes a stamp onto a run that never had one, so a reply can reach it at all', async () => {
    // The `never-observed` case an agent measured: the record carries no stamp, `pickUpOf`
    // says nobody recorded a transcript, and the product says the run cannot be picked up.
    const home = mkdtempSync(join(HOMES, 'never-'))
    const path = transcriptIn(home, FIRST)
    const sessionId = await file('session', 'a run filed by hand', { state: 'idle', runtime: 'claude-code' })

    const sessions = await import('../src/server/lib/sessions.ts')
    const recipients = await import('../src/server/lib/recipients.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')

    const before = t.api.getRecord(sessionId)
    expect(recipients.pickUpOf(before as NonNullable<typeof before>).answer).toBe('no')

    const written = sessions.stampFinishedRun(
      sessionId,
      'claude-code',
      FIRST,
      { type: 'agent', id: 'claude-code' },
      defaultEnv({ homeDir: home }),
    )
    expect(written.written).toBe(true)
    expect(written.logPath).toBe(path)
    expect(written.says).toContain('can be picked up again now')

    const after = t.api.getRecord(sessionId)
    expect(recipients.pickUpOf(after as NonNullable<typeof after>).answer).toBe('yes')
  })

  it('writes nothing when the conversation is not on this machine, and says that rather than guessing a path', async () => {
    // THE FAILURE THIS MUST NOT RECREATE. A stamp naming a file that is not there makes the product
    // say a run is resumable and hands a worker nothing — the same defect one layer down.
    const home = mkdtempSync(join(HOMES, 'absent-'))
    const was = transcriptIn(home, FIRST)
    const { runId, sessionId } = await runAddressedTo(FIRST, was)
    const agents = await import('../src/server/lib/agents.ts')
    const sessions = await import('../src/server/lib/sessions.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')

    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: AGENT,
      payload: { worker: 'a-worker' },
    })
    const finished = agents.finishRun(
      runId,
      { result: { answer: 'done', runtime: { tool: 'claude-code', sessionId: SECOND } } },
      defaultEnv({ homeDir: home }),
    )

    expect(finished.pickUpAgain?.written).toBe(false)
    expect(finished.pickUpAgain?.logPath).toBeNull()
    expect(finished.note).toContain('is not on this machine')
    const record = t.api.getRecord(sessionId)
    // The stamp it already had is untouched: nothing invented, nothing overwritten.
    expect(sessions.stampOf(record as NonNullable<typeof record>)?.externalId).toBe(FIRST)
  })

  it('says there is nothing to reply to yet when the answer came from a new agent', async () => {
    const home = mkdtempSync(join(HOMES, 'new-agent-'))
    transcriptIn(home, SECOND)
    const thread = (
      await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'somebody fresh', mode: 'direct' },
      })
    ).json() as { thread: { id: string } }
    await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'Read this with no history.',
        recipient: { kind: 'new', said: 'somebody who has not read this', why: 'Asked for a fresh agent.' },
      },
    })
    const sent = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread.thread.id}/dispatch`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    const runId = (sent.json() as { runs: { id: string }[] }).runs[0]?.id ?? ''
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: AGENT,
      payload: { worker: 'a-worker' },
    })

    const agents = await import('../src/server/lib/agents.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')
    const finished = agents.finishRun(
      runId,
      { result: { answer: 'read', runtime: { tool: 'claude-code', sessionId: SECOND } } },
      defaultEnv({ homeDir: home }),
    )
    expect(finished.pickUpAgain).toBeNull()
    expect(finished.note).toContain('nothing here to reply to yet')
    noWireIn(finished.note)
  })

  it('says so when the answer does not name a conversation at all', async () => {
    const home = mkdtempSync(join(HOMES, 'silent-'))
    const was = transcriptIn(home, FIRST)
    const { runId } = await runAddressedTo(FIRST, was)
    const agents = await import('../src/server/lib/agents.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: AGENT,
      payload: { worker: 'a-worker' },
    })
    const finished = agents.finishRun(
      runId,
      { result: { answer: 'no runtime block on this one' } },
      defaultEnv({ homeDir: home }),
    )
    expect(finished.pickUpAgain).toBeNull()
    expect(finished.note).toContain('does not say which conversation it came from')
  })

  it('writes nothing about a conversation for a failure or a decline', async () => {
    const home = mkdtempSync(join(HOMES, 'failed-'))
    const was = transcriptIn(home, FIRST)
    transcriptIn(home, SECOND)
    const { runId, sessionId } = await runAddressedTo(FIRST, was)
    const agents = await import('../src/server/lib/agents.ts')
    const sessions = await import('../src/server/lib/sessions.ts')
    const { defaultEnv } = await import('../src/server/lib/adapters/index.ts')
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: AGENT,
      payload: { worker: 'a-worker' },
    })
    const finished = agents.finishRun(runId, { error: 'the model refused' }, defaultEnv({ homeDir: home }))
    expect(finished.pickUpAgain).toBeNull()
    const record = t.api.getRecord(sessionId)
    expect(sessions.stampOf(record as NonNullable<typeof record>)?.externalId).toBe(FIRST)
  })
})

// A transcript from the shared helper is not used above, and that is deliberate: the adapter reads
// a HOME DIRECTORY and the helper writes into one of its own, so a test of the lookup has to own
// the home it points at. Named here so nobody wires the two together and gets a passing test that
// proves nothing.
void fakeTranscript
void Fastify
