// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOODBYE LINES ARE READ ONLY WHERE A WAIT CAN DECIDE THE ANSWER (wave 13y round 91, item 24).
 *
 * MEASURED FIRST, on the made-up office of round 91 at d9ab32a4b (55,725 messages), the people view asked for one agent:
 * 36.1 ms when no run of it carried a wait, 85.8 ms when one did, and 341.3 ms when every message also carried `aboutRun`,
 * as 40 % of the live messages do. A run that carries a wait and is the newest of its conversation makes the office read
 * every message that names a run (`theRunsAlreadySaidGoodbyeTo` in src/server/lib/worker.ts), and it did so for an agent
 * a hold already answered and for a wait that was long over. Live, at the same time of day, the people view of the agent
 * with the most runs took 227.5 ms, and the same view of the other 19 agents 22.2 ms (36RZ1nde0t1q).
 *
 * WHAT THIS FILE PROVES, on an office written straight into a fresh test database by SQL. Every agent, run, hold and line
 * below is invented for the test.
 * b. AN AGENT ITS HOLD ANSWERS READS NO GOODBYE LINE (EKN3Xa0wjwGx): the people view and the presence door asked
 *    for that agent run no statement that reads them, and its dot is green. A run of it inside its wait is there to be
 *    read. The online view is not among them: it reads every agent on the roster, and an agent nothing answers, such as
 *    `mole-office` in every office, is answered or not by the waiting runs.
 * c. A WAIT THAT IS OVER IS NOT ASKED ABOUT: the work view of an agent whose one run's wait has ended reads no goodbye
 *    line, and draws that run as no work, as it did.
 * d. NOR BY ANY OTHER VIEW (wave 13y round 110, item 43): when the one run in the office that carries a wait is past it,
 *    the people view and the presence door asked for its agent, and the online view, run no statement that reads the
 *    goodbye lines, and answer as they did: grey, and not online. It comes first, because b writes a run inside its wait
 *    and the online view reads the runs of every agent. Live on 30 October 2026, no run was inside its wait, and 23 runs
 *    past it made the online view read all 75,377 messages, in 117.5 to 125.7 ms; three of them, serving three of the 20
 *    agents the office map asks about by handle, made the people view of those 20 do the same (counts 44 to 48).
 * The control: an agent whose run inside its wait is what answers reads the goodbye lines in the people view, the online
 * view and the work view, its dot is green and its run is drawn as a conversation wait.
 * a. WHICH LINES SAY GOODBYE, through `runsWaitingForTheNextMessage`: a message that names the run in `aboutRun` and says
 *    one of the two ending lines exactly, written by anybody, ends the run's wait, however its JSON writes the letters.
 *    A line with other spaces, another case or a full stop, a body or a run that is not text, a deleted line, a line of
 *    another kind and a run named with a space before it do not.
 *
 * The statements are counted where SQLite runs them, as tests/a-plugin-views-list-reads-only-the-agents-it-names.test.ts
 * counts them. The goodbye read is the one statement holding `LIKE '%"aboutRun"%'`, as
 * tests/the-dead-letter-sweep-reads-each-thing-once-per-project.test.ts finds it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TEMPLATE = 'goodbye-template'
// ONE INSTANT FOR THE WHOLE FILE, so a wait and a hold read the same on every run of it.
const NOW = new Date(2026, 9, 27, 9, 0, 0)
const GOODBYE_READ = /LIKE '%"aboutRun"%'/
const ENDED = SYSTEM_LINES.aRunWaitedAndEnded(0).line
const RESTARTED = SYSTEM_LINES.aRestartCutARunOff.line

type Row = Record<string, unknown>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // ONE AGENT THROUGH THE DOOR, so every other one can be a copy of a row the registration wrote.
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: TEMPLATE, name: TEMPLATE, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterAll(async () => {
  vi.useRealTimers()
  await app.close()
  t.close()
})

/** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
function stamp(n: number): string {
  const at = new Date(NOW.getTime() + n * 1000)
  const two = (v: number) => String(v).padStart(2, '0')
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

/** A record of `kind`, its data written as the text `data`, so a line can be written as its JSON would never write it. */
function aRecord(id: string, kind: string, at: number, title: string, data: string): void {
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, 'authored')`)
    .run(id, stamp(at), stamp(at), kind, title, data)
}

/** One agent row copied from the template's, and an agent record naming its runtime. */
function addAgent(id: string): void {
  const sqlite = t.client.sqlite
  const template = sqlite.prepare('SELECT * FROM agents WHERE handle = ?').get(TEMPLATE) as Row
  const columns = Object.keys(template)
  const row: Row = {
    id, handle: id, name: `Invented ${id}`, retired: 0, retired_at: null, created_at: stamp(-80_000), role: 'worker',
    pixel_appearance: JSON.stringify(generateCWholeAppearance('goodbye-seed', 'registration')),
    pixel_scale: JSON.stringify(generatePixelScale('goodbye-seed', 'worker')),
    resident_since: null, credential: null,
  }
  sqlite.prepare(`INSERT INTO agents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (c in row ? row[c] : template[c])))
  aRecord(`${id}-record`, 'agent', -80_000, id, JSON.stringify({ handle: id, runtime: 'claude-code' }))
  sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`${id}-record`, id)
}

/**
 * A run the message worker started for `agent`, carrying a conversation of its own and a message, and waiting until
 * `until` seconds from NOW, so it is the newest run of that conversation.
 */
function aWaitingRun(run: string, agent: string, until: number, at: number): void {
  aRecord(run, 'session', at, `Waiting run ${run}`, JSON.stringify({
    state: 'finished', servingAgent: agent, servingAgentId: agent, runtime: 'claude-code', providerSession: `${run}-conversation`,
    deliveringMessage: `${run}-message`, waitsUntil: stamp(until), lastOutputAt: stamp(at), startedByMoleOffice: true,
  }))
}

/** A hold on `agent`'s handle by `session`, heard from 30 seconds ago. */
function aHold(agent: string, session: string): void {
  t.client.sqlite
    .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
    .run(`${agent}-hold`, agent, session, 'goodbye-machine', 'claude-code', stamp(-7_200), stamp(-30))
}

/** How many times the goodbye read ran while `act` ran. Counted where SQLite runs a statement, not where it is prepared. */
async function goodbyeReadsDuring(act: () => Promise<unknown>): Promise<number> {
  type Run = (this: { source: string }, ...args: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', Run>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  let reads = 0
  const counted = (method: 'all' | 'get' | 'iterate'): Run =>
    function (this: { source: string }, ...args: unknown[]) {
      if (GOODBYE_READ.test(this.source)) reads++
      return originals[method].apply(this, args)
    }
  proto.all = counted('all')
  proto.get = counted('get')
  proto.iterate = counted('iterate')
  try {
    await act()
  } finally {
    Object.assign(proto, originals)
  }
  return reads
}

/** The door's answer to the person, as JSON, after its status is checked. */
async function ask(url: string): Promise<Row> {
  const answer = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(answer.statusCode, answer.body.slice(0, 400)).toBe(200)
  return answer.json() as Row
}

/** The colour of `agent`'s dot in the people view, project by project. */
async function thePeopleColours(agent: string): Promise<{ project: string; colour: string }[]> {
  const people = await ask(`/api/plugin-read/v1/people?agents=${agent}`)
  const rows = people['agents'] as { id: string; presence: { project: string; colour: string }[] }[]
  expect(rows.map((one) => one.id)).toEqual([agent])
  return rows[0]!.presence.map(({ project, colour }) => ({ project, colour }))
}

describe('the goodbye lines are read only where a wait can decide the answer (wave 13y round 91, item 24)', () => {
  it('d. a wait that is over makes no goodbye read in the people view, the online view or the presence door', async () => {
    // THE ONE RUN IN THE OFFICE THAT CARRIES A WAIT, and the wait ended a minute ago. It is written before any run inside
    // its wait, because the online view reads the runs of every agent on the roster.
    addAgent('goodbye-ended')
    aWaitingRun('goodbye-ended-run', 'goodbye-ended', -60, -1_900)

    let colours: { project: string; colour: string }[] = []
    expect(await goodbyeReadsDuring(async () => (colours = await thePeopleColours('goodbye-ended'))), 'the people view').toBe(0)
    expect(colours.find((one) => one.project === 'default')?.colour).toBe('grey')

    let online: Row = {}
    expect(await goodbyeReadsDuring(async () => (online = await ask('/api/plugin-read/v1/online'))), 'the online view').toBe(0)
    expect((online['agents'] as { id: string; online: boolean }[]).find((one) => one.id === 'goodbye-ended')?.online).toBe(false)

    let presence: Row = {}
    expect(await goodbyeReadsDuring(async () => (presence = await ask('/api/presence?of=agent:goodbye-ended'))), 'the presence door').toBe(0)
    expect((presence['presence'] as { colour: string }[])[0]?.colour).toBe('grey')
  })

  it('b. an agent its hold answers reads no goodbye line in the people view or the presence door, and is green', async () => {
    // HELD BY A RUN THE OFFICE STARTED FOR IT, which is going, and A RUN OF IT INSIDE ITS WAIT, which would be read.
    addAgent('goodbye-held')
    aRecord('goodbye-held-run', 'session', -600, 'The run holding goodbye-held', JSON.stringify({
      state: 'running', servingAgent: 'goodbye-held', servingAgentId: 'goodbye-held', runtime: 'claude-code',
      providerSession: 'goodbye-held-run-conversation', deliveringMessage: 'goodbye-held-run-message', startedByMoleOffice: true,
    }))
    aHold('goodbye-held', 'goodbye-held-run')
    aWaitingRun('goodbye-held-waiting', 'goodbye-held', 1_200, -900)

    let colours: { project: string; colour: string }[] = []
    expect(await goodbyeReadsDuring(async () => (colours = await thePeopleColours('goodbye-held'))), 'the people view').toBe(0)
    expect(colours.find((one) => one.project === 'default')?.colour).toBe('green')

    let presence: Row = {}
    expect(await goodbyeReadsDuring(async () => (presence = await ask('/api/presence?of=agent:goodbye-held'))), 'the presence door').toBe(0)
    expect((presence['presence'] as { colour: string }[])[0]?.colour).toBe('green')
  })

  it('c. the work view reads no goodbye line for an agent whose one wait is over, and draws that run as no work', async () => {
    addAgent('goodbye-over')
    aWaitingRun('goodbye-over-run', 'goodbye-over', -60, -1_900)
    let work: Row = {}
    expect(await goodbyeReadsDuring(async () => (work = await ask('/api/plugin-read/v1/work?agents=goodbye-over'))), 'the work view').toBe(0)
    expect(work['work']).toEqual([])
  })

  it('the control: an agent a run inside its wait answers reads the goodbye lines, is green, and has the run drawn as its wait; the online view reads them too', async () => {
    addAgent('goodbye-waiting')
    aWaitingRun('goodbye-waiting-run', 'goodbye-waiting', 1_200, -800)
    let colours: { project: string; colour: string }[] = []
    expect(await goodbyeReadsDuring(async () => (colours = await thePeopleColours('goodbye-waiting'))), 'the people view').toBeGreaterThanOrEqual(1)
    expect(colours.find((one) => one.project === 'default')?.colour).toBe('green')
    expect(await goodbyeReadsDuring(() => ask('/api/plugin-read/v1/online')), 'the online view').toBeGreaterThanOrEqual(1)
    let work: Row = {}
    expect(await goodbyeReadsDuring(async () => (work = await ask('/api/plugin-read/v1/work?agents=goodbye-waiting'))), 'the work view').toBeGreaterThanOrEqual(1)
    expect((work['work'] as Row[]).map((one) => [one['id'], one['association']])).toEqual([['goodbye-waiting-run', 'conversation wait']])
  })

  it('a. a line ends a wait when it names the run and says an ending line exactly, as its parsed JSON reads', async () => {
    const { runsWaitingForTheNextMessage } = await import('../src/server/lib/worker.ts')
    addAgent('goodbye-lines')
    // EACH RUN, the line written about it, and whether the run still waits. The run's id is `goodbye-lines-<key>`.
    const LINES: { key: string; data: string; kind?: string; deleted?: true; waits: boolean }[] = [
      { key: 'ended', data: JSON.stringify({ aboutRun: 'goodbye-lines-ended', body: ENDED }), waits: false },
      { key: 'restarted', data: JSON.stringify({ aboutRun: 'goodbye-lines-restarted', body: RESTARTED }), waits: false },
      { key: 'by-a-person', data: JSON.stringify({ aboutRun: 'goodbye-lines-by-a-person', body: ENDED, sentBy: { kind: 'person', id: THE_PERSON } }), waits: false },
      // THE SAME LETTERS, WRITTEN AS ESCAPES in the stored text: the body's first letter, and the run's last.
      { key: 'escaped-body', data: '{"aboutRun":"goodbye-lines-escaped-body","body":"\\u0041gent run ended"}', waits: false },
      { key: 'escaped-run', data: '{"aboutRun":"goodbye-lines-escaped-ru\\u006e","body":"Agent run ended"}', waits: false },
      { key: 'a-space-before', data: JSON.stringify({ aboutRun: 'goodbye-lines-a-space-before', body: ` ${ENDED}` }), waits: true },
      { key: 'a-space-after', data: JSON.stringify({ aboutRun: 'goodbye-lines-a-space-after', body: `${ENDED} ` }), waits: true },
      { key: 'another-case', data: JSON.stringify({ aboutRun: 'goodbye-lines-another-case', body: ENDED.toLowerCase() }), waits: true },
      { key: 'a-full-stop', data: JSON.stringify({ aboutRun: 'goodbye-lines-a-full-stop', body: `${ENDED}.` }), waits: true },
      { key: 'a-list-body', data: JSON.stringify({ aboutRun: 'goodbye-lines-a-list-body', body: [ENDED] }), waits: true },
      { key: 'a-number-body', data: JSON.stringify({ aboutRun: 'goodbye-lines-a-number-body', body: 7 }), waits: true },
      { key: 'no-body', data: JSON.stringify({ aboutRun: 'goodbye-lines-no-body', body: null }), waits: true },
      { key: 'an-object-run', data: JSON.stringify({ aboutRun: { id: 'goodbye-lines-an-object-run' }, body: ENDED }), waits: true },
      { key: 'a-padded-run', data: JSON.stringify({ aboutRun: ' goodbye-lines-a-padded-run', body: ENDED }), waits: true },
      { key: 'deleted', data: JSON.stringify({ aboutRun: 'goodbye-lines-deleted', body: ENDED }), deleted: true, waits: true },
      { key: 'another-kind', data: JSON.stringify({ aboutRun: 'goodbye-lines-another-kind', body: ENDED }), kind: 'report', waits: true },
    ]
    t.client.sqlite.transaction(() => {
      LINES.forEach((one, n) => {
        aWaitingRun(`goodbye-lines-${one.key}`, 'goodbye-lines', 1_200, -700 + n)
        aRecord(`goodbye-lines-${one.key}-line`, one.kind ?? 'message', -100 + n, `A line about goodbye-lines-${one.key}`, one.data)
        if (one.deleted) t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(stamp(-50), `goodbye-lines-${one.key}-line`)
      })
    })()
    const waiting = runsWaitingForTheNextMessage('default').filter((one) => one.agentId === 'goodbye-lines').map((one) => one.session).sort()
    expect(waiting).toEqual(LINES.filter((one) => one.waits).map((one) => `goodbye-lines-${one.key}`).sort())
  })
})
