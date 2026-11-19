// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S DOORS ASK WHAT THE GRANT CARRIES. Each door below was the person's alone. It now asks the one check
 * (`aRaiseCarriesIt` in lib/records.ts) after the person, so a secretary holding the person's grant presses it for them
 * where this office's list of what the grant carries says `may-press`, and an office that changed nothing behaves as
 * before: the secretary card keeps each of these doors.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of them
 * raised, and a worker are made-up agents, each holding the key the office answered. Every record here is synthetic.
 * This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary hears the door's old refusal, even with this office's row at may-press, and
 *      nothing changes;
 *   2. granted, no row: the raised secretary is refused in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through, and the change rows name the secretary and the grant, never the
 *      person. A chapter write also needs a regulation's answer at may-press. The line "Mark broken" sends the agent
 *      names the secretary who pressed it for the person, and never says the person pressed it.
 * Then the requests for one press and the signing packages: the act only the person's own press agrees to, the
 * secretary's own filing, an act whose door the card keeps, and a held item. Last, naming the owner, which does not ask yet.
 *
 * The key window is closed last, because closing it is one of the doors.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of one door's guard, and that door's case 4 goes red.
 * Give `theIntentMarkWasBroken` no secretary, and message.mark-broken's case 4 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../src/config/settings.mjs'
import type { AChaptersHistory, ChapterContent, SelectedChapter, TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { ONLY_THE_PERSON_NAMES_THEMSELVES } from '../src/shared/owner.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'grant-secretary'
const UNRAISED = 'plain-secretary'
const WORKER = 'grant-worker'
const THE_MESSAGE_WORKER = { type: 'agent', id: 'mole-office/the-message-worker' } as never

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
let noteId = ''
let proposalId = ''
let chapterRecord = ''
let settingValue = 40

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

async function made(url: string, headers: Record<string, string>, payload: unknown, answers: 201 | 409 = 201): Promise<string> {
  const filed = await call('POST', url, headers, payload)
  expect(filed.status, filed.raw).toBe(answers)
  return String(filed.body.record?.id ?? filed.body.request?.id ?? filed.body.package?.id)
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The last change row, so a case can say what it wrote. */
function marker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

function rowsSince(mark: number): { record_id: string; actor_type: string; actor_id: string; elevation: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { record_id: string; actor_type: string; actor_id: string; elevation: string | null }[]
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))
const dataOf = (id: string): Record<string, unknown> => t.api.getRecord(id)?.data ?? {}

const content = (): ChapterContent => ({
  label: 'Made up chapter',
  title: 'Rules for the made up office',
  conclusion: 'Read these made up rules before this test works.',
  zh: { label: '测试规章', title: '测试办公室的规章', conclusion: '测试工作之前读这些规章。' },
  rules: Array.from({ length: 8 }, (_, i) => ({
    id: `r-${String(i + 1)}`,
    heading: `Made up rule ${String(i + 1)}`,
    text: `Made up words for rule ${String(i + 1)}.`,
    zh: { heading: `测试条文 ${String(i + 1)}`, text: `测试条文 ${String(i + 1)} 的文字。` },
  })),
})

async function theChapter(): Promise<SelectedChapter> {
  const read = await call('GET', '/api/office-regulations/chapters', PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body as TheSelectedChapters).chapters.find((chapter) => chapter.n === 7)!
}

async function theNewestSeq(): Promise<number> {
  const read = await call('GET', '/api/office-regulations/chapters/7/history', PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body as AChaptersHistory).versions[0]!.seq
}

/** A setting request the worker files, with a value no earlier case asked for. */
async function aSettingRequest(by = WORKER): Promise<string> {
  settingValue += 1
  return made('/api/one-press', as(by), { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: settingValue }, because: 'A made-up reason.' })
}

const aSettingItem = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
  settingValue += 1
  return { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: settingValue }, why: 'A made-up reason.', ...extra }
}

async function aPackage(items: Record<string, unknown>[], by = UNRAISED): Promise<{ id: string; items: { id: string }[] }> {
  const brought = await call('POST', '/api/signing-packages', as(by), { forAgent: WORKER, task: 'A made-up task', items })
  expect(brought.status, brought.raw).toBe(201)
  return brought.body.package as { id: string; items: { id: string }[] }
}

const thePackage = (id: string): string =>
  readAll('SELECT * FROM signing_packages WHERE id = ?', id) + readAll('SELECT * FROM signing_package_items WHERE package_id = ? ORDER BY position', id)
const theRequest = (id: string): string => readAll('SELECT state, outcome FROM one_press_requests WHERE id = ?', id)

interface APress {
  method: 'POST' | 'PUT'
  url: string
  body: Record<string, unknown>
  state: () => string | Promise<string>
  /** What else a press that went through must have done, beyond its change rows. */
  went?: () => void
}

interface ADoor {
  door: string
  /** The door's refusal before it asked the check, which a caller with no grant still hears. */
  oldWords: string
  /** Whether a press that goes through changes what `state` reads. */
  changes: boolean
  /** The names beside the door that the press also touches, and what the check says while only the door is open. */
  also?: { names: string[]; words: string }
  make: () => Promise<APress>
}

async function refusedAndNothingChanged(press: APress, who: string, words: string): Promise<string> {
  const before = await press.state()
  const mark = marker()
  const refused = await call(press.method, press.url, as(who), { ...press.body, ...FOR_THE_PERSON })
  expect(refused.status, refused.raw).toBe(403)
  expect(refused.error).toContain(words)
  expect(await press.state(), 'a refused press changed something').toBe(before)
  expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
  return refused.error
}

function theFourCases(one: ADoor): void {
  describe(one.door, () => {
    let press: APress
    beforeAll(async () => {
      press = await one.make()
    })

    it('1: with no grant, even with the row at may-press, refuses in its old words and changes nothing', async () => {
      answer(one.door, 'may-press')
      for (const name of one.also?.names ?? []) answer(name, 'may-press')
      await refusedAndNothingChanged(press, UNRAISED, one.oldWords)
    })

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      await refusedAndNothingChanged(press, RAISED, `The secretary card keeps ${one.door} for the person`)
    })

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(press, RAISED, `keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })

    it('4: with the row at may-press, goes through, and the write names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      if (one.also !== undefined) {
        await refusedAndNothingChanged(press, RAISED, one.also.words)
        for (const name of one.also.names) answer(name, 'may-press')
      }
      const before = await press.state()
      const mark = marker()
      const done = await call(press.method, press.url, as(RAISED), { ...press.body, ...FOR_THE_PERSON })
      expect(done.status, `${one.door}: ${done.raw}`).toBeLessThan(300)
      if (one.changes) expect(await press.state(), 'the press changed nothing').not.toBe(before)
      const rows = rowsSince(mark)
      expect(rows.some((row) => row.actor_id === RAISED && row.elevation !== null), `no change row names the grant: ${JSON.stringify(rows)}`).toBe(true)
      expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
      press.went?.()
    })
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  noteId = await made('/api/records', PERSON, { kind: 'note', title: 'A made-up place to be led to', data: { date: '2026-10-21', body: 'A made-up note.' } })
  proposalId = await made('/api/records', as(WORKER), { kind: 'proposal', title: 'A made-up proposal a report asks about' })
  const chapter = await theChapter()
  const applied = await call('POST', '/api/office-regulations/chapters', PERSON, { n: 7, version: chapter.version, because: 'A made-up first chapter.', chapter: content() })
  expect(applied.status, applied.raw).toBe(200)
  chapterRecord = String((await theChapter()).record)
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the person's doors ask what the grant carries", () => {
  theFourCases({
    door: 'office.set-address-for-browsers',
    oldWords: "Which address browsers are sent to is the owner's own setting",
    changes: false,
    make: async () => ({
      method: 'POST',
      url: '/api/office/address-for-browsers',
      body: { address: null },
      state: () => readAll('SELECT address_for_browsers FROM installation'),
    }),
  })

  theFourCases({
    door: 'office.resume-a-run',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const message = t.api.createRecord({
        kind: 'message',
        title: 'A made-up message to the worker',
        workspaceId: 'default',
        data: { body: 'Made-up words.', to: [{ kind: 'agent', id: ids.get(WORKER) }] },
        actor: { type: 'agent', id: UNRAISED } as never,
      }).id
      const session = t.api.createRecord({
        kind: 'session',
        title: 'A made-up run of the worker',
        workspaceId: 'default',
        data: {
          runtime: 'opencode',
          startedByMoleOffice: true,
          servingAgent: WORKER,
          servingAgentId: ids.get(WORKER),
          deliveringMessage: message,
          providerSession: 'synthetic-conversation',
          workingDirectory: REPO_ROOT,
          state: 'running',
          doing: 'Made up: answering.',
        },
        actor: THE_MESSAGE_WORKER,
      }).id
      t.api.patchRecord(session, { dataPatch: { state: 'crashed', doing: 'Made up: it ended without answering.' } }, THE_MESSAGE_WORKER)
      return { method: 'POST', url: `/api/office/interrupted-runs/${session}/resume`, body: {}, state: () => JSON.stringify(dataOf(session)['resume'] ?? null) }
    },
  })

  theFourCases({
    door: 'office.set-quick-inputs',
    oldWords: "The list of quick inputs is the owner's own setting",
    changes: true,
    make: async () => ({
      method: 'POST',
      url: '/api/office/quick-inputs',
      body: { inputs: ['/context'] },
      state: () => readAll('SELECT inputs, updated_by_kind, updated_by_id FROM quick_input_list'),
    }),
  })

  theFourCases({
    door: 'message.mark-broken',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      const marked = await made('/api/records', PERSON, {
        kind: 'message',
        title: 'A made-up question',
        data: { body: 'Made up: why does the build fail?', to: [{ kind: 'agent', id: ids.get(WORKER) }], intent: 'just-ask' },
      }, 409)
      const reply = await made('/api/records', as(WORKER), { kind: 'message', title: 'A made-up reply', data: { body: 'Made up: I changed the build.', to: [{ kind: 'person', id: THE_PERSON }] } })
      return {
        method: 'POST',
        url: `/api/messages/${reply}/mark-broken`,
        body: { markedMessage: marked },
        state: () => readAll("SELECT id FROM records WHERE kind = 'problem' AND json_extract(data, '$.extra.intentMarkBroken.reply') = ?", reply),
        went: () => {
          const told = t.client.sqlite
            .prepare("SELECT json_extract(data, '$.body') AS line, json_extract(data, '$.saidInFull') AS said FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.intentMarkBroken.reply') = ?")
            .all(reply) as { line: string; said: string }[]
          expect(told, 'the agent was not told once').toHaveLength(1)
          expect(told[0]!.line).toBe('A secretary said, for the person, that your reply broke their mark')
          expect(told[0]!.said).toContain(`The secretary "${RAISED}" pressed "mark broken" for the person, under their grant, on your reply ${reply}`)
          expect(told[0]!.said, 'the line says the person pressed it').not.toContain('The person pressed')
        },
      }
    },
  })

  theFourCases({
    door: 'answer.keep',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const report = await made('/api/records', as(WORKER), {
        kind: 'report',
        title: 'A made-up report with a question',
        data: {
          for: 'the person',
          date: '2026-10-21',
          blocks: [{ id: 'q-1', type: 'choice', question: 'Which made-up option?', about: proposalId, options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B' }] }],
        },
      })
      return { method: 'PUT', url: `/api/records/${report}/answers/q-1`, body: { answer: { chosen: ['a'] } }, state: () => JSON.stringify(dataOf(report)['answers'] ?? null) }
    },
  })

  theFourCases({
    door: 'office.rules.set-chapter',
    oldWords: "is the person's own act",
    changes: true,
    also: { names: ['record:regulation'], words: 'a raise never carries a write of a regulation' },
    make: async () => {
      const chapter = await theChapter()
      const next = content()
      next.rules[7]!.text = 'The made-up office reads this edited rule.'
      return {
        method: 'POST',
        url: '/api/office-regulations/chapters',
        body: { n: 7, version: chapter.version, because: 'A made-up edit.', chapter: next },
        state: async () => JSON.stringify((await theChapter()).chapter),
      }
    },
  })

  theFourCases({
    door: 'office.rules.restore-chapter',
    oldWords: "is the person's own act",
    changes: true,
    also: { names: ['record:regulation'], words: 'a raise never carries a write of a regulation' },
    make: async () => {
      const base = await theNewestSeq()
      const variant = content()
      variant.conclusion = 'A made-up conclusion the person wrote later.'
      const before = await theChapter()
      const applied = await call('POST', '/api/office-regulations/chapters', PERSON, { n: 7, version: before.version, because: 'A made-up later edit.', chapter: variant })
      expect(applied.status, applied.raw).toBe(200)
      const chapter = await theChapter()
      return {
        method: 'POST',
        url: '/api/office-regulations/chapters/restore',
        body: { n: 7, version: chapter.version, because: 'A made-up restoration.', from: base },
        state: async () => JSON.stringify((await theChapter()).chapter),
      }
    },
  })

  theFourCases({
    door: 'office.rules.mark-only-this-office',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => ({
      method: 'POST',
      url: '/api/office-regulations/only-this-office',
      body: { chapter: chapterRecord, rule: 'r-1', only: true },
      state: () => JSON.stringify(dataOf(chapterRecord)['onlyThisOffice'] ?? null),
    }),
  })

  theFourCases({
    door: 'one-press.agree',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const id = await aSettingRequest()
      return { method: 'POST', url: `/api/one-press/${id}/agree`, body: {}, state: () => theRequest(id) }
    },
  })

  theFourCases({
    door: 'one-press.refuse',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const id = await aSettingRequest()
      return { method: 'POST', url: `/api/one-press/${id}/refuse`, body: {}, state: () => theRequest(id) }
    },
  })

  theFourCases({
    door: 'signing-packages.sign',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const filed = await aPackage([aSettingItem()])
      return { method: 'POST', url: `/api/signing-packages/${filed.id}/sign`, body: { struck: [] }, state: () => thePackage(filed.id) }
    },
  })

  theFourCases({
    door: 'signing-packages.refuse',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const filed = await aPackage([aSettingItem()])
      return { method: 'POST', url: `/api/signing-packages/${filed.id}/refuse`, body: {}, state: () => thePackage(filed.id) }
    },
  })

  theFourCases({
    door: 'signing-packages.take-back',
    oldWords: "is the person's own act",
    changes: true,
    make: async () => {
      const filed = await aPackage([aSettingItem({ carriedOut: 'by-the-named-agent' })])
      const signed = await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: [] })
      expect(signed.status, signed.raw).toBe(200)
      return { method: 'POST', url: `/api/signing-packages/${filed.id}/take-back`, body: {}, state: () => thePackage(filed.id) }
    },
  })
})

describe('a request for one press, agreed under the grant', () => {
  it('refuses the act only the person’s own press agrees to, before anything else, and the request still waits', async () => {
    const id = await made('/api/one-press', as(WORKER), { act: 'change-what-the-grant-carries', inputs: { changes: [{ door: 'office.set-quick-inputs', answer: 'kept' }] }, because: 'A made-up reason.' })
    answer('one-press.agree', 'may-press')
    answer('office.set-what-the-grant-carries', 'may-press')
    for (const who of [RAISED, UNRAISED]) {
      const refused = await call('POST', `/api/one-press/${id}/agree`, as(who), FOR_THE_PERSON)
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain("is the person's own press")
    }
    expect(JSON.parse(theRequest(id))[0].state).toBe('waiting')
  })

  it('refuses a request the same secretary filed, and the request still waits', async () => {
    const id = await aSettingRequest(RAISED)
    answer('one-press.agree', 'may-press')
    const refused = await call('POST', `/api/one-press/${id}/agree`, as(RAISED), FOR_THE_PERSON)
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press one-press.agree on something the same secretary filed')
    expect(JSON.parse(theRequest(id))[0].state).toBe('waiting')
  })

  it('refuses an act whose own door the card keeps, until this office opens that door too', async () => {
    const id = await made('/api/one-press', as(WORKER), { act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapterRecord, rule: 'r-2', only: true }, because: 'A made-up reason.' })
    answer('one-press.agree', 'may-press')
    const refused = await call('POST', `/api/one-press/${id}/agree`, as(RAISED), FOR_THE_PERSON)
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('The secretary card keeps office.rules.mark-only-this-office for the person')
    expect(JSON.parse(theRequest(id))[0].state).toBe('waiting')
    answer('office.rules.mark-only-this-office', 'may-press')
    const agreed = await call('POST', `/api/one-press/${id}/agree`, as(RAISED), FOR_THE_PERSON)
    expect(agreed.status, agreed.raw).toBe(200)
    expect(agreed.body.request.state).toBe('done')
    expect(agreed.body.request.answeredBy).toMatchObject({ kind: 'agent' })
    expect(dataOf(chapterRecord)['onlyThisOffice']).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'r-2', by: RAISED })]))
  })

  it('writes a refusal under the grant as the secretary’s, never as the person’s', async () => {
    const id = await aSettingRequest()
    answer('one-press.refuse', 'may-press')
    const refused = await call('POST', `/api/one-press/${id}/refuse`, as(RAISED), FOR_THE_PERSON)
    expect(refused.status, refused.raw).toBe(200)
    expect(refused.body.request.state).toBe('refused')
    expect(refused.body.request.answeredBy).toMatchObject({ kind: 'agent' })
    expect(String(refused.body.request.outcome)).toContain(RAISED)
    expect(String(refused.body.request.outcome)).not.toContain('The person refused it')
  })
})

describe('a signing package, signed under the grant', () => {
  it('refuses a package the same secretary brought, and the package still waits', async () => {
    const filed = await aPackage([aSettingItem()], RAISED)
    answer('signing-packages.sign', 'may-press')
    const before = thePackage(filed.id)
    const refused = await call('POST', `/api/signing-packages/${filed.id}/sign`, as(RAISED), { struck: [], ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press signing-packages.sign on something the same secretary filed')
    expect(thePackage(filed.id)).toBe(before)
  })

  it('refuses an item whose own door the card keeps, and signs the rest once that item is struck', async () => {
    const filed = await aPackage([aSettingItem(), { act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapterRecord, rule: 'r-3', only: true }, why: 'A made-up reason.' }])
    answer('signing-packages.sign', 'may-press')
    const before = thePackage(filed.id)
    const refused = await call('POST', `/api/signing-packages/${filed.id}/sign`, as(RAISED), { struck: [], ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('The secretary card keeps office.rules.mark-only-this-office for the person')
    expect(thePackage(filed.id)).toBe(before)
    const signed = await call('POST', `/api/signing-packages/${filed.id}/sign`, as(RAISED), { struck: [filed.items[1]!.id], ...FOR_THE_PERSON })
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body.package.state).toBe('signed')
    expect(signed.body.package.answeredBy).toMatchObject({ kind: 'agent' })
    expect(signed.body.package.items.map((item: { state: string }) => item.state)).toEqual(['done', 'struck'])
    expect(String(signed.body.package.items[1].outcome)).toContain(RAISED)
  })

  it('refuses an item the named agent would carry out, because that signature would be the person’s', async () => {
    const filed = await aPackage([aSettingItem({ carriedOut: 'by-the-named-agent' })])
    answer('signing-packages.sign', 'may-press')
    const before = thePackage(filed.id)
    const refused = await call('POST', `/api/signing-packages/${filed.id}/sign`, as(RAISED), { struck: [], ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('Strike the item, or ask the person to sign')
    expect(thePackage(filed.id)).toBe(before)
  })
})

describe('the door that does not ask yet', () => {
  it('naming the owner still refuses a granted secretary in its old words, whatever this office says', async () => {
    answer('office.name-owner', 'may-press')
    const owner = readAll('SELECT * FROM installation')
    const named = await call('POST', '/api/office/owner', as(RAISED), { name: 'A made-up owner', ...FOR_THE_PERSON })
    expect(named.status, named.raw).toBe(403)
    expect(named.error).toContain(ONLY_THE_PERSON_NAMES_THEMSELVES)
    expect(readAll('SELECT * FROM installation')).toBe(owner)
  })
})

// LAST, because the press that goes through closes the window.
describe('closing the key window', () => {
  theFourCases({
    door: 'office.close-key-window',
    oldWords: "Closing the key window is the owner's own act",
    changes: true,
    make: async () => ({
      method: 'POST',
      url: '/api/office/key-window/close',
      body: {},
      state: () => readAll('SELECT window_closed_at, window_closed_by_kind, window_closed_by_id FROM installation'),
    }),
  })
})
