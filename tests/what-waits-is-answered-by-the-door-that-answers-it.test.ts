// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH DECLARATION ABOUT WHAT WAITS NAMES THE OPERATION THAT ANSWERS IT, OR NONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Two declarations name the operation that answers a question about what is waiting:
 *
 *   `BOOTSTRAP_SECTIONS` in src/server/api/bootstrap.ts. `owner_waiting` said it was measured by
 *   `project.needs-you`, while the section counts this project's open forks only. §12.2 of
 *   design/round-ten/design/telemetry.md allows a section one operation that answers exactly its
 *   question, or null. This file builds an office holding an open fork here, an open fork in
 *   another project, a settled fork, a card request, an admission and a question for the person,
 *   and compares the section's set with the set of every operation near it. None is the same set,
 *   so the section is declared null.
 *
 *   `WANTED` in src/shared/ops.ts. `owner-waiting` said `project.needs-you`, which lists only forks,
 *   card requests and admissions; `project.waiting` (GET /api/waiting) is the person's whole set.
 *   `messages-waiting` said `agent.inbox`, which never lists a message record; `handle.waiting`
 *   lists the ones still queued for the agent. Both are measured here against the same office.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 *   1. `owner_waiting` back to `measuredBy: 'project.needs-you'`: case 1 is red.
 *   2. `owner-waiting` back to `answeredBy: 'project.needs-you'`: case 2 is red, because
 *      GET /api/needs-you does not list the question.
 *   3. `messages-waiting` back to `answeredBy: 'agent.inbox'`: case 3 is red, because the route
 *      serving `agent.inbox` does not list the message record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { WANTED } from '../src/shared/ops.ts'

let t: TestDb
let app: FastifyInstance
/** Read after the test's own database exists, because importing the file opens a database. */
const sections = async () => (await import('../src/server/api/bootstrap.ts')).BOOTSTRAP_SECTIONS
let routes: { method: string; path: string; operation: string }[] = []

const HERE = 'default'
const ELSEWHERE = 'elsewhere'
const JSON_HEADER = { 'content-type': 'application/json' }
const PERSON = {
  ...JSON_HEADER,
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** A made-up person's key, written into this test's own key file, so an agent can be started on a proved path. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const asAgent = (handle: string) => ({
  ...JSON_HEADER,
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The ids of everything this file put in the office, by what each one is. */
const made = {
  forkHere: '',
  forkElsewhere: '',
  forkSettled: '',
  cardRequest: '',
  admission: '',
  question: '',
  message: '',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: any }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, json: reply.json() }
}

async function aFork(workspace: string, title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', { ...PERSON, 'x-mole-office-workspace': workspace }, {
    kind: 'proposal',
    title,
    data: { question: title, options: ['one', 'the other'] },
  })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return String(filed.json.record.id)
}

/** The operation the route named by an `ask` like "GET /api/handles/<your handle>/waiting" serves. */
function operationOfTheRequest(request: string): string | undefined {
  const space = request.indexOf(' ')
  const method = request.slice(0, space)
  // THE SPACE INSIDE "<your handle>" IS PART OF THE PATH, so only the first space is split on.
  const pattern = request.slice(space + 1).replace(/<[^>]+>/g, ':param').replace(/\?.*$/, '')
  return routes.find((r) => r.method === method && r.path.replace(/:[A-Za-z]+/g, ':param') === pattern)?.operation
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes().map((r) => ({ method: r.method, path: r.path, operation: r.operation }))

  expect((await ask('POST', '/api/workspaces', PERSON, { id: ELSEWHERE, title: 'Elsewhere' })).status).toBe(201)
  made.forkHere = await aFork(HERE, 'Which bench does the gripper go on?')
  made.forkElsewhere = await aFork(ELSEWHERE, 'Which camera goes on the arm?')
  made.forkSettled = await aFork(HERE, 'Which timeout on the poll?')
  const decision = await ask('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'Poll at 200 ms',
    data: { replaces: [], because: 'Latency matters more than a dropped frame.' },
  })
  expect(decision.status, JSON.stringify(decision.json)).toBe(201)
  const settled = await ask('POST', '/api/links', PERSON, {
    fromId: decision.json.record.id,
    toId: made.forkSettled,
    type: 'derived_from',
  })
  expect(settled.status, JSON.stringify(settled.json)).toBe(201)

  // A CARD REQUEST THE PERSON ANSWERS: an agent they started asks them for a higher card. Started with their
  // key, a proved path, because the close below refuses while a live agent holds no proved key
  // .
  const started = await ask('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }, {
    handle: 'asker',
    name: 'Asker',
    role: 'worker',
  })
  expect(started.status).toBe(201)
  const card = await ask('POST', '/api/roles/requests', asAgent('asker'), { asking: 'supervisor' })
  expect(card.status, JSON.stringify(card.json)).toBe(201)
  made.cardRequest = String(card.json.request)

  // AN ADMISSION: a session registers itself while the window for that is closed.
  const window = await import('../src/server/lib/keywindow.ts')
  window.closeTheKeyWindow({ kind: 'person', id: THE_PERSON })
  const admission = await ask('POST', '/api/agents/register-myself', asAgent('newcomer'), {
    handle: 'newcomer',
    name: 'Newcomer',
    workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    requestedRole: 'worker',
  })
  expect(admission.status, JSON.stringify(admission.json)).toBe(202)
  made.admission = String(admission.json.request)

  // A QUESTION FOR THE PERSON that is not a fork and not a card: a problem whose move is theirs.
  const question = await ask('POST', '/api/records', PERSON, {
    kind: 'problem',
    title: 'Somebody has to say which bench this goes on',
    data: { symptom: 'nobody knows which bench', state: 'open', whose_move: 'person' },
  })
  expect(question.status, JSON.stringify(question.json)).toBe(201)
  made.question = String(question.json.record.id)

  // A MESSAGE RECORD FROM ONE AGENT TO ANOTHER, the way a supervisor writes to its worker.
  expect((await ask('POST', '/api/agents/started', PERSON, { handle: 'the-sup', name: 'The Sup', role: 'supervisor' })).status).toBe(201)
  expect((await ask('POST', '/api/agents/started', asAgent('the-sup'), { handle: 'the-worker', name: 'The Worker', role: 'worker' })).status).toBe(201)
  const message = await ask('POST', '/api/records', asAgent('the-sup'), {
    kind: 'message',
    title: 'An answer',
    data: { body: 'Build B.', to: [{ kind: 'agent', id: 'the-worker' }] },
  })
  // NOTHING HOLDS THE WORKER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
  // message is stored all the same, and waits for the worker at its door.
  expect(message.status, JSON.stringify(message.json)).toBe(409)
  made.message = String(message.json.record.id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('what waits is answered by the operation that answers it', () => {
  it('1. owner_waiting counts a set no single operation answers, so it names none', async () => {
    const boot = await ask('GET', '/api/project/bootstrap', asAgent('asker'))
    expect(boot.status).toBe(200)
    const section = new Set<string>(boot.json.owner_waiting.references.map((one: { recordId: string }) => one.recordId))
    expect([...section]).toEqual([made.forkHere])

    // EACH OPERATION NEAR IT ANSWERS A DIFFERENT SET, and each difference is named.
    const forks = await ask('GET', '/api/forks', asAgent('asker'))
    const forkSet = new Set<string>(forks.json.forks.map((one: { recordId: string }) => one.recordId))
    expect(forkSet.has(made.forkElsewhere), 'GET /api/forks lists the open forks of every project').toBe(true)
    expect(forkSet.has(made.forkSettled)).toBe(false)

    const needs = await ask('GET', '/api/needs-you', asAgent('asker'))
    const needsSet = new Set<string>(needs.json.actions.map((one: { recordId: string }) => one.recordId))
    expect(needsSet.has(made.cardRequest), 'needs-you lists card requests').toBe(true)
    expect(needsSet.has(made.admission), 'needs-you lists admissions').toBe(true)

    const waiting = await ask('GET', '/api/waiting', asAgent('asker'))
    const waitingSet = new Set<string>(waiting.json.items.map((one: { id: string }) => one.id))
    expect(waitingSet.has(made.question), 'GET /api/waiting lists the question').toBe(true)

    const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((one) => b.has(one))
    const bySet: Record<string, Set<string>> = {
      'project.forks': forkSet,
      'project.needs-you': needsSet,
      'project.waiting': waitingSet,
    }
    for (const [operation, set] of Object.entries(bySet)) {
      expect(sameSet(set, section), `${operation} answers the same set as owner_waiting`).toBe(false)
    }

    // SO THE DECLARATION NAMES NONE, and says why in the word the reply carries.
    const declared = (await sections()).find((one) => one.section === 'owner_waiting')
    expect(declared?.measuredBy).toBeNull()
    expect(declared?.chosenBy).toBe('no single operation answers this')
    expect(boot.json.chosen_by.owner_waiting).toBe('no single operation answers this')
  })

  it('2. "what is waiting on the owner" is answered by the operation that lists all of it', async () => {
    const entry = WANTED.find((one) => one.name === 'owner-waiting')
    const route = routes.find((r) => r.operation === entry?.answeredBy)
    expect(route, `no route serves ${String(entry?.answeredBy)}`).toBeDefined()
    const answer = await ask(route!.method as 'GET', route!.path, asAgent('asker'))
    expect(answer.status).toBe(200)
    const listed = JSON.stringify(answer.json)
    // EVERY KIND OF THING WAITING ON THE PERSON, and not the fork that is settled.
    for (const id of [made.forkHere, made.forkElsewhere, made.cardRequest, made.admission, made.question]) {
      expect(listed.includes(id), `${String(entry?.answeredBy)} lists ${id}`).toBe(true)
    }
    expect(listed.includes(made.forkSettled)).toBe(false)
    // AND THE NAME, pinned after what it answers was measured.
    expect(entry?.answeredBy).toBe('project.waiting')
  })

  it('3. "messages queued for me" is answered by the door that lists the message, and the bootstrap asks that door', async () => {
    const entry = WANTED.find((one) => one.name === 'messages-waiting')
    const route = routes.find((r) => r.operation === entry?.answeredBy)
    expect(route, `no route serves ${String(entry?.answeredBy)}`).toBeDefined()
    const answer = await ask('GET', route!.path.replace(':handle', 'the-worker'), asAgent('the-worker'))
    expect(answer.status, `${route!.path}: ${JSON.stringify(answer.json)}`).toBe(200)
    expect(JSON.stringify(answer.json).includes(made.message), `${String(entry?.answeredBy)} lists the message`).toBe(true)
    expect(entry?.answeredBy).toBe('handle.waiting')

    // ONE DOOR FOR ONE QUESTION: the bootstrap's `messages` section asks the same operation.
    const messages = (await sections()).find((one) => one.section === 'messages')
    expect(operationOfTheRequest(String(messages?.ask))).toBe(entry?.answeredBy)
  })

  it('4. every question with an operation names one a route serves', () => {
    for (const entry of WANTED) {
      if (entry.answeredBy === null) continue
      expect(routes.some((r) => r.operation === entry.answeredBy), `${entry.name}: ${entry.answeredBy}`).toBe(true)
    }
  })
})
