// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK ROW OF THE QUEUE READS ONLY ITS OWN AGENT'S RUNS.
 *
 * GET /api/worker/queue built the whole project's run lists for a check row: every session record of the project, read
 * whole and parsed, to say who is answering as the agent the check is asked of. On a copy of the live office that list
 * was most of a reading of the checks form, and the office answered nothing else meanwhile. A check row now asks the
 * narrowed reading, the one the handle door uses, which reads only the runs that may serve that agent, and looks up the
 * run that reading names by its id. Every other row is read as before.
 *
 * Every id, handle, sandbox and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE CHANGE. In every form of the door (plain, ?full=1, ?only=checks and the marking form), a reading whose only
 *      queued rows are check rows never runs the statement `everyRunRow` runs. The statement is taken from a call of
 *      `everyRunRow` itself, so the mark is the list's own text. On the code before the change this case is red.
 *   2. GUARDS. A check row says what it said before about who is answering as its agent: `runningAlready`,
 *      `runningAlreadySays` and `heldByALiveSession` are written out for each state below, in each form of the door.
 *        a. nobody;
 *        b. a run the office started, of this project, holding the handle, in a sandbox of its own;
 *        c. a live sandbox run with no hold, which the office did not start, naming its agent by registry id;
 *        d. the same, naming its agent by handle;
 *        e. the same, naming its agent by the id of its agent record;
 *        f. a run waiting for the next message. THE LIMIT OF THIS GUARD: a check row shows nothing of a waiting run,
 *           so the row is the same whether the reading found the run or not. Case 3 proves the run is really waiting,
 *           through `resume` on an ordinary row to the same agent;
 *        g. a live session holding the handle;
 *        h. a hold whose session is gone, with nothing else answering;
 *        i. a hold whose session is gone, with a live sandbox run of the agent under it;
 *        j. a run the office started in ANOTHER project holding the handle. The row read before the change found no
 *           run row for it in this project, so it names the run with the sentence for a run the office did not start
 *           and no sandbox. A lookup by id that left out the project would find the run and say something else.
 *   3. GUARDS. Ordinary rows in the plain reading, to the agents of c, f and g, say what they said before, `resume`
 *      included.
 *
 * WHAT TURNS EACH GUARD RED. In src/server/lib/worker.ts: handing a check row the whole reading again turns case 1
 * red; looking the run up by its id with no project turns 2j red; handing the narrowed reading an empty list of run
 * rows turns 2c, 2d, 2e and 2i red.
 *
 * HOW A STATEMENT IS SEEN, as tests/the-queue-asks-which-agent-a-run-serves-once-a-pass.test.ts sees one: the
 * database's `prepare` is replaced before the server is made, so every statement the server prepares afterwards is
 * recorded each time it runs.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { aLiveSessionHasIt, theMessageWaitsForARunGoing, whoIsAnsweringLine } from '../src/shared/handles.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type WorkerLib = typeof import('../src/server/lib/worker.ts')

const PROJECT = 'default'
const ELSEWHERE = 'made-up-elsewhere'
const owner = (workspace = PROJECT) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})
const THE_WORKER = {
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
}
const FORMS = {
  plain: '/api/worker/queue',
  full: '/api/worker/queue?full=1',
  checks: '/api/worker/queue?only=checks',
  marking: '/api/worker/queue?only=checks&markDelivered=1',
} as const
const at = localStamp(new Date())

interface Row {
  messageId: string
  inspection?: { run: string }
  runningAlready: string | null
  runningAlreadySays: string | null
  heldByALiveSession: string | null
  resume: { id: string; runtime: string; run: string } | null
}
interface Ran {
  text: string
  args: unknown[]
  /** The frames of the server's own code that ran the statement, for a failure's message. */
  from: string[]
}

let t: TestDb
let app: FastifyInstance
let worker: WorkerLib
let recording = false
const ran: Ran[] = []
/** Every real child this file started, stopped by its group afterwards. */
const started: ChildProcess[] = []
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-check-row-runs-'))
let made = 0

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE RECORDER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'run', 'iterate', 'values'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (recording) {
          const from = (new Error().stack ?? '').split('\n').filter((line) => line.includes('/src/server/')).slice(0, 6).map((line) => line.trim())
          ran.push({ text, args, from })
        }
        return run.apply(this, args)
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'A made-up second project' })
  await anAgent('made-up-builder')
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file tests.
    }
  }
  await app?.close()
  t?.close()
  rmSync(transcripts, { recursive: true, force: true })
})

/** What `fn` ran, recorded while it ran. */
async function whatRan(fn: () => unknown): Promise<Ran[]> {
  ran.length = 0
  recording = true
  try {
    await fn()
  } finally {
    recording = false
  }
  return [...ran]
}

/** Register an agent through the real door, and give back its registry id and the id of its agent record. */
async function anAgent(handle: string): Promise<{ id: string; record: string; handle: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: owner(),
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: owner() })
  const agents = (JSON.parse(listed.body) as { agents: { id: string; handle: string }[] }).agents
  const id = one(agents.filter((row) => row.handle === handle), `the registry row for ${handle}`).id
  return { id, record: (JSON.parse(filed.body) as { record: { id: string } }).record.id, handle }
}

/** One stored row, written as the fixtures of tests/the-checks-reading-marks-settled-asks-only-when-asked.test.ts are. */
function record(id: string, kind: string, data: object, workspace: string): void {
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
      VALUES (?, ?, ?, ?, ?, ?, 'A made-up record', ?, 'fixture')`)
    .run(id, workspace, THE_PERSON, at, at, kind, JSON.stringify(data))
}

/** A check the office asked of this agent, of a finished run, not started yet, with its delivery queued. */
function aCheckAskedOf(agent: { id: string; handle: string }): string {
  made += 1
  const id = `made-up-check-ask-${String(made)}`
  const run = `made-up-checked-run-${String(made)}`
  record(id, 'message', { body: 'A made-up check ask.', sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'agent', id: agent.id }], aboutRun: run, writtenIn: { project: PROJECT } }, 'message-centre')
  record(run, 'session', { state: 'finished', servingAgent: 'made-up-builder', theCheck: { message: id, askedOf: agent.handle, askedAt: at, checkout: {}, says: 'A made-up check request.' } }, PROJECT)
  t.client.sqlite
    .prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)")
    .run(`made-up-delivery-${String(made)}`, id, agent.id, at)
  return id
}

/** A message from the person to one agent through the real door, so its delivery row is real. */
async function anOrdinaryMessageTo(agentId: string): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: owner(),
    payload: { kind: 'message', title: 'A made-up question', data: { body: 'A made-up question.', to: [{ kind: 'agent', id: agentId }] } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (JSON.parse(filed.body) as { record: { id: string } }).record.id
}

/** A session record of this file's own, in one project. */
function aSession(data: Record<string, unknown>, workspace = PROJECT): string {
  return t.api.createRecord({ workspaceId: workspace, kind: 'session', title: 'A made-up session', data, actor: t.api.HUMAN }).id
}

/** A sandbox whose folder ends in its own name, so each run's sentence names the run it came from. */
const aSandbox = (name: string) => ({ template: 'a-made-up-template', folder: `/made/up/sandboxes/${name}` })

/** A real process of this file's own, in its own group, registered against the session. */
async function aLiveProcessFor(sessionRecordId: string, workspace = PROJECT): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: workspace, sessionRecordId, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

/** A terminal somebody opened, with a live process and a transcript written now, as the hook files one. */
async function aLiveSession(): Promise<string> {
  made += 1
  const logPath = join(transcripts, `session-${String(made)}.jsonl`)
  writeFileSync(
    logPath,
    `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'answering' }] } })}\n`,
  )
  const session = aSession({
    state: 'running',
    runtime: 'claude-code',
    doing: 'A made-up terminal.',
    extra: { discovered: { tool: 'claude-code', externalId: `made-up-${String(made)}`, logPath, resumeCommand: null, startedAt: null, entryPoint: null } },
  })
  await aLiveProcessFor(session)
  return session
}

/** The session takes the agent's handle through the real door, asked in the session's own project. */
async function hold(handle: string, session: string, workspace = PROJECT): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: owner(workspace),
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** One form of the door, read as the message worker reads it. */
async function theQueue(url: string): Promise<{ queue: Row[]; markedDelivered?: unknown[] }> {
  const reply = await app.inject({ method: 'GET', url, headers: THE_WORKER })
  expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
  return reply.json() as { queue: Row[]; markedDelivered?: unknown[] }
}

const theRowOf = (queue: readonly Row[], messageId: string): Row => one(queue.filter((row) => row.messageId === messageId), `the row of ${messageId}`)

const told = (row: Row) => ({ runningAlready: row.runningAlready, runningAlreadySays: row.runningAlreadySays, heldByALiveSession: row.heldByALiveSession })

describe('1. a check row never builds the whole project run list', () => {
  it('in every form of the door', async () => {
    // ONLY CHECK ROWS ARE QUEUED for this case: an ordinary row still reads the whole list, as before.
    t.client.sqlite.prepare("UPDATE message_delivery SET mark = 'delivered' WHERE mark = 'queued'").run()
    // OTHER AGENTS' RUNS IN THE PROJECT, running and holding a message, which the whole list would read.
    for (const n of [1, 2, 3]) {
      const other = await anAgent(`made-up-other-${String(n)}`)
      aSession({ state: 'running', runtime: 'claude-code', servingAgentId: other.id, sandbox: aSandbox(`other-${String(n)}`) })
      aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: other.id, deliveringMessage: `made-up-message-${String(n)}`, providerSession: `made-up-conversation-${String(n)}` })
    }
    // ONE CHECK ASKED OF AN AGENT WITH A LIVE RUN, so the reading must really find who is answering.
    const busy = await anAgent('made-up-busy-inspector')
    const busyRun = aSession({ state: 'running', runtime: 'claude-code', servingAgentId: busy.id, sandbox: aSandbox('busy-run') })
    await aLiveProcessFor(busyRun)
    const busyAsk = aCheckAskedOf(busy)
    const idle = await anAgent('made-up-idle-inspector')
    const idleAsks = [aCheckAskedOf(idle), aCheckAskedOf(idle)]

    // THE MARK IS THE LIST'S OWN STATEMENT, taken from a call of the list itself.
    const listed = await whatRan(() => worker.everyRunRow(PROJECT))
    const mark = one(listed, 'the one statement everyRunRow runs').text

    // WHERE EACH FORM READ THE LIST FROM, all four forms in one answer, so a failure names every form it is true of.
    const readFrom: Record<string, string[][]> = {}
    for (const [form, url] of Object.entries(FORMS)) {
      let reply: Awaited<ReturnType<typeof theQueue>> | undefined
      const statements = await whatRan(async () => {
        reply = await theQueue(url)
      })
      // THE CONTROL: the reading did read each check row, and found the busy agent's run without the list.
      expect(reply!.queue.map((row) => row.messageId).sort(), form).toEqual([busyAsk, ...idleAsks].sort())
      for (const row of reply!.queue) expect(row.inspection, `${form}: ${row.messageId} is a check row`).toBeDefined()
      expect(theRowOf(reply!.queue, busyAsk).runningAlready, form).toBe(busyRun)
      expect(statements.length, `${form}: statements were recorded`).toBeGreaterThan(0)
      readFrom[form] = statements.filter((statement) => statement.text === mark).map((statement) => statement.from)
    }
    expect(readFrom, 'where each form read the whole run list').toEqual({ plain: [], full: [], checks: [], marking: [] })
  })
})

describe('2 and 3. who is answering, as each row said it before', () => {
  /** Each state's agent and its check ask, by the letter of its guard. */
  const guard = new Map<string, { agent: { id: string; record: string; handle: string }; ask: string; expected: ReturnType<typeof told> }>()
  /** The ordinary messages of case 3, by the letter of the agent's state. */
  const ordinary = new Map<string, { message: string; expected: ReturnType<typeof told> & { resume: Row['resume'] } }>()

  beforeAll(async () => {
    const nobody = { runningAlready: null, runningAlreadySays: null, heldByALiveSession: null }

    const a = await anAgent('made-up-nobody')
    guard.set('a', { agent: a, ask: aCheckAskedOf(a), expected: nobody })

    const b = await anAgent('made-up-held-by-an-office-run')
    const bRun = aSession({ state: 'running', runtime: 'claude-code', servingAgent: b.id, startedByMoleOffice: true, sandbox: aSandbox('office-run') })
    await hold(b.handle, bRun)
    guard.set('b', { agent: b, ask: aCheckAskedOf(b), expected: { runningAlready: bRun, runningAlreadySays: theMessageWaitsForARunGoing('office-run', true), heldByALiveSession: null } })

    const byName = { c: (x: { id: string }) => ({ servingAgentId: x.id }), d: (x: { handle: string }) => ({ servingAgent: x.handle }), e: (x: { record: string }) => ({ servingAgent: x.record }) }
    for (const [letter, naming] of Object.entries(byName)) {
      const agent = await anAgent(`made-up-sandbox-run-${letter}`)
      const run = aSession({ state: 'running', runtime: 'claude-code', ...naming(agent), sandbox: aSandbox(`sandbox-run-${letter}`) })
      await aLiveProcessFor(run)
      guard.set(letter, { agent, ask: aCheckAskedOf(agent), expected: { runningAlready: run, runningAlreadySays: theMessageWaitsForARunGoing(`sandbox-run-${letter}`, false), heldByALiveSession: null } })
    }

    const f = await anAgent('made-up-waiting-run')
    const fRun = aSession({
      state: 'finished',
      runtime: 'claude-code',
      servingAgentId: f.id,
      deliveringMessage: 'made-up-answered-message',
      providerSession: 'made-up-waiting-conversation',
      waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)),
    })
    guard.set('f', { agent: f, ask: aCheckAskedOf(f), expected: nobody })

    const g = await anAgent('made-up-live-session')
    const gSession = await aLiveSession()
    await hold(g.handle, gSession)
    guard.set('g', {
      agent: g,
      ask: aCheckAskedOf(g),
      expected: {
        runningAlready: gSession,
        runningAlreadySays: whoIsAnsweringLine('a live session', { machine: 'a-machine', runtime: 'claude-code' }).says,
        heldByALiveSession: aLiveSessionHasIt(g.handle, gSession),
      },
    })

    const h = await anAgent('made-up-gone-session')
    const hSession = aSession({ state: 'running', runtime: 'claude-code', doing: 'A made-up terminal that has gone.' })
    await hold(h.handle, hSession)
    guard.set('h', { agent: h, ask: aCheckAskedOf(h), expected: { ...nobody, heldByALiveSession: aLiveSessionHasIt(h.handle, hSession) } })

    const i = await anAgent('made-up-gone-session-and-a-run')
    const iSession = aSession({ state: 'running', runtime: 'claude-code', doing: 'Another made-up terminal that has gone.' })
    await hold(i.handle, iSession)
    const iRun = aSession({ state: 'running', runtime: 'claude-code', servingAgentId: i.id, sandbox: aSandbox('under-the-hold') })
    await aLiveProcessFor(iRun)
    guard.set('i', { agent: i, ask: aCheckAskedOf(i), expected: { runningAlready: iRun, runningAlreadySays: theMessageWaitsForARunGoing('under-the-hold', false), heldByALiveSession: null } })

    const j = await anAgent('made-up-held-from-elsewhere')
    const jRun = aSession({ state: 'running', runtime: 'claude-code', servingAgent: j.id, startedByMoleOffice: true, sandbox: aSandbox('elsewhere-run') }, ELSEWHERE)
    await hold(j.handle, jRun, ELSEWHERE)
    guard.set('j', { agent: j, ask: aCheckAskedOf(j), expected: { runningAlready: jRun, runningAlreadySays: theMessageWaitsForARunGoing(null, false), heldByALiveSession: null } })

    ordinary.set('c', { message: await anOrdinaryMessageTo(guard.get('c')!.agent.id), expected: { ...guard.get('c')!.expected, resume: null } })
    ordinary.set('f', {
      message: await anOrdinaryMessageTo(f.id),
      expected: { ...nobody, resume: { id: 'made-up-waiting-conversation', runtime: 'claude-code', run: fRun } },
    })
    ordinary.set('g', { message: await anOrdinaryMessageTo(g.id), expected: { ...guard.get('g')!.expected, resume: null } })
  })

  for (const letter of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
    it(`2${letter}. a check row says what it said before, in every form of the door`, async () => {
      const { ask, expected } = guard.get(letter)!
      for (const [form, url] of Object.entries(FORMS)) {
        const row = theRowOf((await theQueue(url)).queue, ask)
        expect(row.inspection, `${form}: a check row`).toBeDefined()
        expect(told(row), form).toEqual(expected)
        const fullUrl = url.includes('full=1') ? url : `${url}${url.includes('?') ? '&' : '?'}full=1`
        const fullRow = theRowOf((await theQueue(fullUrl)).queue, ask)
        expect(fullRow.resume, `${form}: a check row picks up no conversation`).toBeNull()
      }
    })
  }

  for (const letter of ['c', 'f', 'g']) {
    it(`3${letter}. an ordinary row says what it said before`, async () => {
      const { message, expected } = ordinary.get(letter)!
      const row = theRowOf((await theQueue(FORMS.plain)).queue, message)
      expect(row.inspection, 'an ordinary row').toBeUndefined()
      const fullRow = theRowOf((await theQueue(FORMS.full)).queue, message)
      expect({ ...told(row), resume: fullRow.resume }).toEqual(expected)
    })
  }
})
