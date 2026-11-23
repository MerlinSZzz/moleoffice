// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S MODEL HAS NO OFFICE ADDRESS, READS THE RECORDS ITS TOOL WROTE FOR IT, AND WHAT IT WROTE IS COUNTED.
 *
 * ACCEPTANCE FINDING 44, 23 SEPTEMBER 2026. A check's model ran the browser tests of the tree it
 * was checking, inside the inspector's sandbox and with MOLE_OFFICE_API in its environment. The tests
 * started the app, the app pointed its pages at that address, and between 00:08 and 00:10 on 23
 * September 2026 sixty-five "The browser app" session records were written into the live office with
 * the check's worktree as their working directory. They were noise and nothing live was edited, but
 * nothing stopped it and nothing counted it.
 *
 * WHAT THIS FILE MEASURES, EACH WITH A CONTROL RUN FIRST AND A MUTATION THAT TURNS IT RED:
 *
 *   T1  runInside starts every command with --no-office-variables, so neither the build nor the model
 *       sees the office's address. Mutation: drop the switch.
 *   T2  the prompt the office assembles carries the reading section, which names the files the check's
 *       tool wrote for the model and no office address, since the model holds no key and the office
 *       refuses a request with none (problem YxzFRQIpx9Pz, 29 September 2026); the assembly stored on the
 *       run is the one the model is handed, list included; and a list naming a file by a relative path
 *       is refused. It also names the records the tool meant to hand over and could not, each with why,
 *       and refuses a reason on two lines (problems iVfuq3VBSnih and 7vaMy2NYnNQc). Both lists take each
 *       reason the office lists and no other (problem WBddfI3C1RQy). Mutations: name the office's address in
 *       the section; leave the list out; take the list off the stored assembly; take the path rule off the
 *       door; leave the records not handed over unnamed; take the one-line rule off their reasons; drop a
 *       reason from the office's list, such as named-record (problem ZTS6soSziHJ-).
 *       It also names the exact kept why a carried or omitted record came from, and never says a report named a
 *       record only a kept why names (uQMufaAoVuVs). Mutations: always say a report named the record; name
 *       only the first why; drop a why's source from the omitted records; match an id inside a longer word.
 *   T3  GET /api/records/created-between lists the records created inside its window and not those
 *       outside it, with the creating actor, the creating session the ledger keeps, and the working
 *       directory. Mutation: drop the window test.
 *   T4  the tool counts only the records whose working directory is inside the check's own worktree
 *       (or whose creating session is the check's). Mutation: count every record in the window.
 *   T5  the office stores wroteIntoTheOffice on a release. Mutation: drop it in the store.
 *   T6  a window the door cut short is not counted: the tool leaves wroteIntoTheOffice off and says in one
 *       sentence that the number is not known, and never writes a lower bound as the count (the check of
 *       run 5OEGnN3JXrRs, 23 September 2026). Mutation: count the records the door did list.
 *
 * THE STAND-INS ARE LABELLED IN THEIR OWN FIRST LINES. T1 drives the real runInside with a stand-in
 * launcher that answers in tools/sandbox.mjs exec's shape and records what it was asked. T2, T3 and T5
 * use the product's own API over a throwaway database. T4 uses tests/inspector-tool-fixture.ts (a
 * labelled stand-in office) and a labelled stand-in claude on PATH: no model runs and no live office
 * is reached. Nothing here writes into the live office.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { settings } from '../src/config/settings.mjs'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { aMadeUpCheckSession, inspectorFixture, writeManyRecordsFixture } from './inspector-tool-fixture.ts'
import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

// ============================================================================ T1

describe('T1 — a command inside the inspector sandbox gets no office variables', () => {
  it('starts runInside with --no-office-variables, so MOLE_OFFICE_API is not in the environment', async () => {
    const view = inspectorViewStandIn()
    try {
      const ran = await runInside(view.sandbox, { label: 'probe', cwd: view.work, argv: ['true'], limitMs: 5_000, launcher: view.launcher })
      expect(ran.started, ran.why ?? '').not.toBeNull()
      expect(view.calls).toHaveLength(1)
      expect(view.calls[0]!.words).toContain('--no-office-variables')
      expect(view.calls[0]!.words).toContain('--check-view')
      expect(view.calls[0]!.command).toEqual(['sh', '/inputs/commands/probe.sh'])
    } finally { view.close() }
  }, 30_000)
})

// ============================================================================ T2, T3 and T5

let t: TestDb
let app: FastifyInstance
let checkout = ''
/** The checkout's HEAD, as the tools use it for a fixture seal. */
let fixtureTip = ''

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A finished run of a registered worker, filed the way an inspector fixture files one. */
async function fileARun(handle: string, title: string): Promise<string> {
  const run = historicalSession(t, {
    workspaceId: WORKSPACE,
    kind: 'session',
    title,
    actor: { type: 'agent', id: handle },
    data: { state: 'finished', servingAgent: handle, cutFrom: 'main', tip: fixtureTip, doing: 'building the check' },
  }).id
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  return run
}

describe('T2 — the prompt sends the model to the files its tool wrote, names no office, and the stored assembly is the same one', () => {
  /** One record the check's tool wrote for its model, in the shape the tool sends. */
  const aWrittenReport = (id: string) => ({ path: `/a/check/folder/records/${id}.json`, id, kind: 'report', title: 'What the run did', as: 'report' })

  it('names each file the tool wrote, and no office address', async () => {
    const run = await fileARun('builder-c', 'A run whose prompt names the files its model reads')
    const carries = [aWrittenReport('reportAAAAAA')]
    // AND ONE THE TOOL COULD NOT READ (problems iVfuq3VBSnih and 7vaMy2NYnNQc).
    const couldNotCarry = [{ id: 'reportDDDDDD', as: 'report', why: 'the office refused the read (HTTP 404)' }]
    const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes: [], carries, couldNotCarry } })
    expect(prompt.statusCode, prompt.body).toBe(200)
    const body = prompt.json() as { prompt: string; bytes: number }
    const section = body.prompt.split('## Reading a record this prompt does not carry')[1]?.split('\n## ')[0] ?? ''
    expect(section, 'the prompt has no reading section').not.toBe('')
    expect(section).toContain(`- /a/check/folder/records/reportAAAAAA.json: a report this run's agent filed, `)
    expect(section).toContain('ask the office nothing')
    // THE ONE IT COULD NOT READ IS NAMED, with why, so the model does not take it for a record never filed.
    expect(section).toContain(`- reportDDDDDD: a report this run's agent filed; the office refused the read (HTTP 404)`)
    expect(section).toContain('do not take any of them for a record that was never filed')
    // NO ADDRESS: the office's own, read the way the office reads it, is nowhere in the prompt, and the section names none.
    expect(body.prompt).not.toContain(settings().apiAddress)
    expect(section).not.toMatch(/https?:\/\//)
    // AND THE ASSEMBLY THE OFFICE STORES IS THE ONE THE MODEL IS HANDED: same bytes, the list included, so a list
    // added to one and not the other cannot pass.
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [], carries, couldNotCarry } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const kept = (assembled.json() as { whatTheCheckWouldRead: { bytes: number } }).whatTheCheckWouldRead
    expect(kept.bytes).toBe(body.bytes)
  })

  it('says so when the tool wrote no file, and refuses a file named by a relative path', async () => {
    const run = await fileARun('builder-c', 'A run whose tool wrote its model no file')
    const none = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes: [] } })
    expect(none.statusCode, none.body).toBe(200)
    expect((none.json() as { prompt: string }).prompt).toContain('wrote no record into a file for you')
    const relative = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/prompt`,
      headers: asAgent('inspector-one'),
      payload: { changes: [], carries: [{ ...aWrittenReport('reportBBBBBB'), path: 'records/reportBBBBBB.json' }] },
    })
    expect(relative.statusCode, relative.body).toBe(400)
    // A REASON ON TWO LINES IS REFUSED TOO, so no reason can add a line to the list.
    const twoLines = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}/prompt`,
      headers: asAgent('inspector-one'),
      payload: { changes: [], couldNotCarry: [{ id: 'reportEEEEEE', as: 'report', why: 'refused\n- /etc/a-line-of-its-own: a report' }] },
    })
    expect(twoLines.statusCode, twoLines.body).toBe(400)
  })

  it('takes each reason the office lists, in both lists, and no other', async () => {
    // THE ONE LIST (problem WBddfI3C1RQy): what the door takes is WHY_THE_TOOL_WANTED_IT, read from the lib.
    const run = await fileARun('builder-c', 'A run whose tool names every reason it wanted a record for')
    const reasons = ['report', 'named-report', 'named-record', 'started-for', 'session-task', 'last-message'] as const
    const carries = reasons.map((as, n) => ({ ...aWrittenReport(`reportF${String(n)}FFFFF`), as }))
    const couldNotCarry = reasons.map((as, n) => ({ id: `reportG${String(n)}GGGGG`, as, why: 'the office refused the read (HTTP 404)' }))
    const all = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes: [], carries, couldNotCarry } })
    expect(all.statusCode, all.body).toBe(200)
    for (const [list, one] of [['carries', { ...aWrittenReport('reportHHHHHH'), as: 'a reason nobody listed' }], ['couldNotCarry', { id: 'reportIIIIII', as: 'a reason nobody listed', why: 'refused' }]] as const) {
      const other = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes: [], [list]: [one] } })
      expect(other.statusCode, `${list}: ${other.body}`).toBe(400)
    }
  })

  it('names the exact kept why each record came from, and never says a report named a record only a why names', async () => {
    // FROM uQMufaAoVuVs: a record the whys the server keeps name by their ids is carried like one the reports name,
    // and the prompt names the exact why path each came from — every kept why, and the omitted ones too. A record
    // only a why names never reads as one a report names.
    const run = await fileARun('builder-c', 'A run whose carried records came from kept whys')
    const ONE = 'tools/a-file-a-why-names.ts'
    const TWO = 'tools/another-file-a-why-names.ts'
    const WHY_RECORD = 'recordWhyA01'
    const GONE_RECORD = 'recordGoneB02'
    const payload = {
      changes: [ONE, TWO].map((path) => ({ path, changes: 'A diff.' })),
      needsJudgment: [
        { path: ONE, why: `The earlier check of another round names ${WHY_RECORD} and ${GONE_RECORD}.`, changes: 'A diff.' },
        { path: TWO, why: `It answers the same ${WHY_RECORD}.`, changes: 'A diff.' },
      ],
      carries: [{ path: `/fixture/records/${WHY_RECORD}.json`, id: WHY_RECORD, kind: 'problem', title: 'A record a kept why names', as: 'named-record' }],
      couldNotCarry: [{ id: GONE_RECORD, as: 'named-record', why: 'the office refused the read (HTTP 403)' }],
    }
    const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload })
    expect(prompt.statusCode, prompt.body).toBe(200)
    const text = (prompt.json() as { prompt: string }).prompt
    expect(text, 'the carried line does not name both kept whys').toContain(
      `- /fixture/records/${WHY_RECORD}.json: a record that the whys for ${ONE}, ${TWO} name by its id, such as a decision or an earlier check, `,
    )
    expect(text, 'the refused read does not name its why').toContain(
      `- ${GONE_RECORD}: a record that the why for ${ONE} names by its id, such as a decision or an earlier check; the office refused the read (HTTP 403)`,
    )
    expect(text, 'a record only a why names reads as one a report names').not.toContain("one of this run's reports names by its id")
    expect(text, 'a checker reason is not the office\'s own reading').not.toContain("The office's own reading of this run named each one")
  })

  it('keeps the report wording for a record a report names, and every kept why beside it', async () => {
    // A RECORD A REPORT NAMES KEEPS THAT WORDING (uQMufaAoVuVs), and each kept why that names it is said too.
    const run = await fileARun('builder-c', 'A run whose carried record came from a report and a kept why')
    const BOTH = 'recordBothD04'
    const WHY_FILE = 'tools/a-file-whose-why-names-it.ts'
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('builder-c'),
      payload: {
        kind: 'report',
        title: 'A report naming one record',
        data: { for: 'nobody in particular', date: '2026-10-17', blocks: [{ id: 'b-1', type: 'text', text: `It answers ${BOTH}.` }] },
        links: [{ type: 'about', toId: run }],
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const payload = {
      changes: [{ path: WHY_FILE, changes: 'A diff.' }],
      needsJudgment: [{ path: WHY_FILE, why: `The queue's why names ${BOTH} too.`, changes: 'A diff.' }],
      carries: [{ path: `/fixture/records/${BOTH}.json`, id: BOTH, kind: 'problem', title: 'A record a report names', as: 'named-record' }],
    }
    const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload })
    expect(prompt.statusCode, prompt.body).toBe(200)
    const text = (prompt.json() as { prompt: string }).prompt
    expect(text).toContain(
      `a record that one of this run's reports names by its id, such as a decision or an earlier check, and the why for ${WHY_FILE} names it by its id`,
    )
  })

  it('adds no why attribution unless the id stands alone in a why this check keeps', async () => {
    // THE STANDALONE-TOKEN RULE (uQMufaAoVuVs): a kept why that holds the id only inside a longer word, a kept
    // entry's path and diff that hold it, and a dropped path's why that names it are none of them sources. The record
    // here is a report-named one, so the prompt keeps the report wording and adds no why beside it.
    const run = await fileARun('builder-c', 'A run whose record is named only by a longer token')
    const TOKEN = 'recordToken5'
    const KEPT_FILE = `tools/${TOKEN}-file.ts`
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('builder-c'),
      payload: {
        kind: 'report',
        title: 'A report naming one record once',
        data: { for: 'nobody in particular', date: '2026-10-17', blocks: [{ id: 'b-1', type: 'text', text: `It answers ${TOKEN}.` }] },
        links: [{ type: 'about', toId: run }],
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const payload = {
      changes: [{ path: KEPT_FILE, changes: `+const ${TOKEN} = 1` }],
      needsJudgment: [
        { path: KEPT_FILE, why: `The queue's why names x${TOKEN}x inside a word.`, changes: `+const ${TOKEN} = 1` },
        { path: 'design/elsewhere.md', why: `The dropped why names ${TOKEN} itself.`, changes: '' },
      ],
      carries: [{ path: `/fixture/records/${TOKEN}.json`, id: TOKEN, kind: 'problem', title: 'A record a report names', as: 'named-record' }],
    }
    const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload })
    expect(prompt.statusCode, prompt.body).toBe(200)
    const text = (prompt.json() as { prompt: string }).prompt
    const line = text.split('\n').find((one) => one.includes(`problem ${TOKEN},`)) ?? ''
    expect(line, 'the carried line was not found').toContain("a record that one of this run's reports names by its id, such as a decision or an earlier check, ")
    expect(line, 'a longer token, a path, a diff or a dropped why gained attribution').not.toContain('the why for')
    expect(text).toContain('dropped from the list, not in the sealed change: design/elsewhere.md')
  })
})

describe('the check tool and prompt door share one record ceiling (zZXY9HqyGuj2, USER.md invariant 2)', () => {
  it('accepts the real tool’s 101 records and lets the check go on to its stored assembly', async () => {
    const office = await inspectorFixture()
    try {
      const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, n) => `${prefix}${String(n).padStart(6, '0')}`)
      const reports = ids('report', 20)
      const problems = ids('issueN', 80)
      office.state.reading = { reports: [{ id: 'roundN000001', title: 'Fixture round' }] }
      office.state.records = {
        roundN000001: { status: 200, body: { record: { id: 'roundN000001', kind: 'report', title: 'Fixture round', summary: [...reports, ...problems].join(' ') } } },
        ...Object.fromEntries([...reports, ...problems].map(id => [id, { status: 200, body: { record: { id, kind: id.startsWith('report') ? 'report' : 'problem', title: 'Fixture record' } } }])),
      }
      const ran = await office.inspect()
      expect(ran.code, ran.err).toBe(0)
      const sent = office.state.writes.find(one => one.path.endsWith('/prompt'))!.body
      expect(sent['carries']).toHaveLength(101)
      const run = await fileARun('builder-c', 'Fixture of round-28’s 101 carried records')
      const payload = { changes: [], carries: sent['carries'], couldNotCarry: sent['couldNotCarry'] }
      const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload })
      expect(prompt.statusCode, prompt.body).toBe(200)
      for (const one of payload.carries) expect(prompt.json().prompt).toContain(one.path)
      const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload })
      expect(assembled.statusCode, assembled.body).toBe(201)
      expect(assembled.json().whatTheCheckWouldRead.bytes).toBe(prompt.json().bytes)
    } finally {
      await office.close()
    }
  })

  it('writes exactly the ceiling in collection order, names every leftover, and the door tells the model', async () => {
    mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
    const folder = mkdtempSync(join(process.cwd(), '.logs', 'carried-records-'))
    try {
      // Reach both ceilings together: the names of all omitted records still fit.
      const total = THE_MOST_RECORDS_A_CHECK_CARRIES * 2
      const records = await writeManyRecordsFixture(folder, total)
      expect(records.written).toHaveLength(THE_MOST_RECORDS_A_CHECK_CARRIES)
      expect(readdirSync(folder).sort()).toEqual(records.written.map(one => `${one.id}.json`))
      const idAt = (n: number) => `taskN${String(n).padStart(7, '0')}`
      expect(records.written.map(one => one.id)).toEqual(Array.from({ length: THE_MOST_RECORDS_A_CHECK_CARRIES }, (_, n) => idAt(n)))
      expect(JSON.parse(readFileSync(records.written[0]!.path, 'utf8')).id).toBe(idAt(0))
      expect(records.couldNotCarry).toEqual(Array.from({ length: total - THE_MOST_RECORDS_A_CHECK_CARRIES }, (_, n) => ({
        id: idAt(n + THE_MOST_RECORDS_A_CHECK_CARRIES), as: 'session-task',
        why: `the door takes at most ${THE_MOST_RECORDS_A_CHECK_CARRIES} records for one check`,
      })))
      const run = await fileARun('builder-c', 'Fixture with records beyond the shared ceiling')
      const payload = { changes: [], carries: records.written, couldNotCarry: records.couldNotCarry }
      const prompt = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload })
      expect(prompt.statusCode, prompt.body).toBe(200)
      for (const one of records.couldNotCarry) expect(prompt.json().prompt).toContain(`- ${one.id}: a task of this run's session; ${one.why}`)
      const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload })
      expect(assembled.statusCode, assembled.body).toBe(201)
      expect(assembled.json().whatTheCheckWouldRead.bytes).toBe(prompt.json().bytes)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('stops before writing or assembling when even the omitted names exceed the ceiling, including existing failures', async () => {
    const home = mkdtempSync(join(process.cwd(), '.logs', 'uncarried-records-'))
    try {
      for (const [count, unread] of [[THE_MOST_RECORDS_A_CHECK_CARRIES * 2 + 1, 0], [THE_MOST_RECORDS_A_CHECK_CARRIES * 2, 1], [0, THE_MOST_RECORDS_A_CHECK_CARRIES + 1]] as const) {
        const folder = join(home, `records-${count}-${unread}`)
        expect(existsSync(folder)).toBe(false)
        const omitted = Math.max(0, count - THE_MOST_RECORDS_A_CHECK_CARRIES) + unread
        await expect(writeManyRecordsFixture(folder, count, unread)).rejects.toThrow(
          `The check had ${count} records and ${omitted} records it could not carry; the door takes at most ${THE_MOST_RECORDS_A_CHECK_CARRIES} records in each list for one check.`,
        )
        expect(existsSync(folder)).toBe(false)
      }
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('uses the same imported ceiling on both sides and refuses one beyond it in either list', async () => {
    const tool = readFileSync('tools/the-inspector.mjs', 'utf8')
    const door = readFileSync('src/server/api/inspection.ts', 'utf8')
    expect(tool).toContain("import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'")
    expect(door).toContain("import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../../config/check-records.mjs'")
    for (const name of ['carries', 'couldNotCarry']) {
      expect(door).toMatch(new RegExp(`${name}: z\\.array\\([^)]*\\)\\.max\\(THE_MOST_RECORDS_A_CHECK_CARRIES\\)`))
    }
    const run = await fileARun('builder-c', 'Fixture of both shared list boundaries')
    for (const name of ['carries', 'couldNotCarry']) {
      const one = name === 'carries'
        ? { path: '/fixture/taskN0000000.json', id: 'taskN0000000', kind: 'task', title: 'Fixture task', as: 'session-task' }
        : { id: 'taskN0000000', as: 'session-task', why: 'Fixture omission' }
      for (const extra of [0, 1]) {
        const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/prompt`, headers: asAgent('inspector-one'), payload: { changes: [], [name]: Array.from({ length: THE_MOST_RECORDS_A_CHECK_CARRIES + extra }, () => one) } })
        expect(reply.statusCode, `${name}, ${extra}: ${reply.body}`).toBe(extra === 0 ? 200 : 400)
      }
    }
  })
})

describe('T3 — the window door lists what was created inside the window and nothing outside it', () => {
  async function createdBetween(from: string, to: string): Promise<{ records: Record<string, any>[]; says: string }> {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/records/created-between?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    })
    expect(reply.statusCode, reply.body).toBe(200)
    return reply.json() as { records: Record<string, any>[]; says: string }
  }

  it('answers the record inside the window with its actor, session and working directory, and not the one outside', async () => {
    const session = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('builder-c'), payload: { kind: 'session', title: 'T3, the model run', data: { state: 'running' } } })
    expect(session.statusCode, session.body).toBe(201)
    const theSession = (session.json() as { record: { id: string } }).record.id

    const first = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...asAgent('builder-c'), 'x-mole-office-session': theSession },
      payload: { kind: 'session', title: 'A record the model wrote inside its window', data: { state: 'running', workingDirectory: '/tmp/the-checks-own-tree' } },
    })
    expect(first.statusCode, first.body).toBe(201)
    const a = (first.json() as { record: { id: string; createdAt: string } }).record

    // A SECOND MOMENT, so the two records are in different seconds and the window can tell them apart.
    while (localStamp(new Date()) <= a.createdAt) await sleep(20)
    const second = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('builder-c'), payload: { kind: 'session', title: 'A record written after the window', data: { state: 'running' } } })
    expect(second.statusCode, second.body).toBe(201)
    const b = (second.json() as { record: { id: string; createdAt: string } }).record

    const atA = await createdBetween(a.createdAt, a.createdAt)
    expect(atA.records.map((one) => one.id)).toContain(a.id)
    expect(atA.records.map((one) => one.id)).not.toContain(b.id)
    const row = atA.records.find((one) => one.id === a.id)!
    expect(row.kind).toBe('session')
    expect(row.title).toBe('A record the model wrote inside its window')
    expect(row.when).toBe(a.createdAt)
    expect(row.createdBy).toEqual({ actorType: 'agent', actorId: 'builder-c', sessionId: theSession })
    expect(row.workingDirectory).toBe('/tmp/the-checks-own-tree')
    expect(atA.says).toContain('first revision the ledger keeps')

    const atB = await createdBetween(b.createdAt, b.createdAt)
    expect(atB.records.map((one) => one.id)).toContain(b.id)
    expect(atB.records.map((one) => one.id)).not.toContain(a.id)
  })

  it('refuses a window it cannot read, in words', async () => {
    const bad = await app.inject({ method: 'GET', url: '/api/records/created-between?from=not-a-moment&to=2026-01-01%2000:00:00', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(bad.statusCode).toBe(400)
    expect(String((bad.json() as { error: string }).error)).toContain('from is not a moment Mole Office can read')
    const backwards = await app.inject({ method: 'GET', url: '/api/records/created-between?from=2026-01-02%2000:00:00&to=2026-01-01%2000:00:00', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(backwards.statusCode).toBe(400)
    expect(String((backwards.json() as { error: string }).error)).toContain('ends before it begins')
  })
})

describe('T5 — the office stores what the model wrote on the release', () => {
  it('keeps wroteIntoTheOffice on the release, beside read', async () => {
    const run = await fileARun('builder-c', 'A run released with what its model wrote')
    const wrote = { count: 1, ids: ['a-model-wrote-this'], from: '2026-09-23 00:08:00', to: '2026-09-23 00:09:00' }
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('inspector-one'),
      payload: { verdict: 'released', check: 'Read the diff and the report. Nothing is missing.', chaptersRead: ['5:full'], wroteIntoTheOffice: wrote },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const stands = (read.json() as { stands: { released: Record<string, unknown> | null } }).stands
    expect(stands.released?.['wroteIntoTheOffice']).toEqual(wrote)
  })
})

// ============================================================================ T4

describe('T4 — the tool counts only what belongs to this check', () => {
  it("counts the record inside the check's own worktree and not the one elsewhere", async () => {
    const office = await inspectorFixture()
    try {
      const check = aMadeUpCheckSession()
      const theChecksTree = office.pathFor(check)
      office.state.createdBetween = [
        {
          id: 'written-inside-the-checks-tree',
          kind: 'session',
          title: 'The browser app',
          when: '2026-09-23 00:09:00',
          createdBy: { actorType: 'agent', actorId: 'the-browser-app', sessionId: null },
          workingDirectory: join(theChecksTree, 'public'),
        },
        {
          id: 'written-elsewhere',
          kind: 'session',
          title: 'Somewhere else entirely',
          when: '2026-09-23 00:09:30',
          createdBy: { actorType: 'agent', actorId: 'somebody-else', sessionId: null },
          workingDirectory: '/tmp/somewhere-else',
        },
      ]
      // A STAND-IN claude ON PATH, written by this test. It runs no model.
      const bin = join(office.home, 'bin')
      mkdirSync(bin, { recursive: true })
      const answer = JSON.stringify({ result: JSON.stringify({ verdict: 'released', check: 'Read the diff and the report. Nothing is missing.', chaptersRead: [] }) })
      writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# A STAND-IN FOR claude, written by a test. It runs no model.\ncat >/dev/null\nprintf '%s' '${answer}'\n`)
      chmodSync(join(bin, 'claude'), 0o755)

      const ran = await office.inspect(['--check', check], { PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
      expect(ran.code, ran.err).toBe(0)
      expect(ran.out).toContain("The model's run wrote 1 record into the office: written-inside-the-checks-tree")

      const verdict = office.state.writes.find((one) => one.path === `/api/checks/${office.run}`)
      expect(verdict, 'the tool never posted a verdict').toBeDefined()
      const wrote = verdict!.body['wroteIntoTheOffice'] as { count: number; ids: string[]; from: string; to: string }
      expect(wrote.count).toBe(1)
      expect(wrote.ids).toEqual(['written-inside-the-checks-tree'])
      // THE WINDOW IS THE ONE THE MODEL RAN IN: the two moments the tool noted are real stamps and in order.
      expect(wrote.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(wrote.to >= wrote.from).toBe(true)
    } finally {
      await office.close()
    }
  }, 60_000)
})

describe('T6: a window the door cut short', () => {
  it('leaves the count off, and says that the number is not known', async () => {
    const office = await inspectorFixture()
    try {
      const check = aMadeUpCheckSession()
      const theChecksTree = office.pathFor(check)
      // ONE OF THIS CHECK'S RECORDS LISTED, AND 500 MORE MATCHED THAN THE DOOR LISTED: a count of 1 would be
      // a lower bound written as the count.
      office.state.createdBetween = [
        {
          id: 'written-inside-the-checks-tree',
          kind: 'session',
          title: 'The browser app',
          when: '2026-09-23 00:09:00',
          createdBy: { actorType: 'agent', actorId: 'the-browser-app', sessionId: null },
          workingDirectory: join(theChecksTree, 'public'),
        },
      ]
      office.state.createdBetweenMatched = 501
      const bin = join(office.home, 'bin')
      mkdirSync(bin, { recursive: true })
      const answer = JSON.stringify({ result: JSON.stringify({ verdict: 'released', check: 'Read the diff and the report. Nothing is missing.', chaptersRead: [] }) })
      writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# A STAND-IN FOR claude, written by a test. It runs no model.\ncat >/dev/null\nprintf '%s' '${answer}'\n`)
      chmodSync(join(bin, 'claude'), 0o755)

      const ran = await office.inspect(['--check', check], { PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
      expect(ran.code, ran.err).toBe(0)
      expect(ran.err).toContain('(the office matched 501)')
      expect(ran.err).toContain('so what the model wrote is not known and nothing is claimed about it')
      expect(ran.out).not.toContain("The model's run wrote")
      const verdict = office.state.writes.find((one) => one.path === `/api/checks/${office.run}`)
      expect(verdict, 'the tool never posted a verdict').toBeDefined()
      expect(verdict!.body).not.toHaveProperty('wroteIntoTheOffice')
    } finally {
      await office.close()
    }
  }, 60_000)
})

// ============================================================================ the world for T2, T3 and T5

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-c', name: 'Builder C', role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib', 'tools'] })

  checkout = mkdtempSync(join(tmpdir(), 'mole-office-no-office-address-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  writeFileSync(join(checkout, 'work'), 'Before.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work'), 'Before.\nAnd after.\n')
  git('commit', '-qam', 'The work under check')
  // THE RUN'S TIP IS THE REPOSITORY'S OWN HEAD for this fixture's purpose; the run is a legacy fixture
  // and the check reads it as one.
  fixtureTip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (checkout !== '') rmSync(checkout, { recursive: true, force: true })
})
