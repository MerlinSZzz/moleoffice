// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A JUDGEMENT IS ITS OWN NOTE (wave 13q item 6). POST /api/office/upgrades/judgements, on a scratch office in this test's
 * process: who may judge, what the note keeps, the problem each judged file opens and the message each line is sent, and
 * that every refusal leaves nothing written. The receipts are made up (tests/a-made-up-judged-receipt.ts).
 */
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aReceiptGreenAlone, aReceiptRedIn } from './a-made-up-judged-receipt.ts'
import type { Actor } from '../src/server/lib/records.ts'
import type { RecordKind } from '../src/shared/types.ts'

// Read by name, so this criterion compiles before the judgement modules are there. Every sentence and the longest reason
// are read from the code that says them.
const modulePath = '../src/shared/receipt-judgement.ts'
const doorPath = '../src/server/lib/stable/judgement.ts'
type Refusals = Record<'incomplete', string> & Record<'noVerdict' | 'notRed' | 'ranAlone', (file: string) => string>
type DoorRefusals = Record<'shape' | 'writer' | 'receipt' | 'green', string> & Record<'line' | 'anotherLine', (file: string) => string>
let REFUSALS: Refusals
let DOOR: DoorRefusals
let REASON_MOST: number
const COMMIT = 'c'.repeat(40)
const TREE = 'd'.repeat(40)
let t: TestDb
let app: FastifyInstance
let number = 0
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
const personKey = randomBytes(32).toString('hex')
const ownerHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': personKey }
function headers(who: string) {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ids.get(who)!, 'x-mole-office-key': keys.get(who)!, 'x-mole-office-session': runs.get(who)! }
}
function actor(who: string): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(who)! }
}
function reference(id: string, seq = 1) {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq, contentHash: r.content_hash }
}
/** Three made-up test files no other case names, so an open problem of one case never meets another. */
function files(): [string, string, string] {
  const n = ++number
  return [`tests/made-up-${n}-a.test.ts`, `tests/made-up-${n}-b.test.ts`, `tests/made-up-${n}-c.test.ts`]
}
function filed(data: object, kind: RecordKind = 'whole_suite_receipt') {
  return reference(t.api.createRecord({ kind, title: `Made-up receipt ${++number}`, workspaceId: 'default', data: { ...data }, actor: actor('controller') }).id)
}
const verdict = (file: string, line = 'line-a', said: 'test-fault' | 'feature-broken' = 'test-fault') =>
  ({ file, verdict: said, reason: `A made-up reason for ${file}.`, line: ids.get(line) ?? line })
const judge = (who: string, payload: object) => app.inject({ method: 'POST', url: '/api/office/upgrades/judgements',
  headers: who === 'person' ? ownerHeaders : headers(who), payload })
function row(id: string) {
  const found = t.client.sqlite.prepare('SELECT kind, workspace_id, data, deleted_at FROM records WHERE id = ?').get(id) as { kind: string; workspace_id: string; data: string; deleted_at: string | null }
  return { kind: found.kind, workspaceId: found.workspace_id, data: JSON.parse(found.data) as Record<string, any>, deletedAt: found.deleted_at }
}
const aboutLinks = (id: string) => (t.client.sqlite.prepare("SELECT from_id FROM links WHERE to_id = ? AND type = 'about' ORDER BY from_id").all(id) as { from_id: string }[]).map(one => one.from_id)
const writes = () => (t.client.sqlite.prepare('SELECT (SELECT COUNT(*) FROM revisions) + (SELECT COUNT(*) FROM links) AS n').get() as { n: number }).n
async function firstRevision(id: string) {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: headers('secretary') })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { revisions: Record<string, any>[] }).revisions.find(one => one.seq === 1)!
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  for (const who of ['controller', 'secretary', 'stranger', 'line-a', 'line-b']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: ownerHeaders,
      payload: { handle: `judgement-${who}`, name: `Made-up ${who}`, role: who === 'secretary' ? card : 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
    runs.set(who, t.api.createRecord({ workspaceId: 'default', kind: 'session', title: `Made-up ${who} run`,
      data: { state: 'running', servingAgent: data.agent.id }, actor: t.api.HUMAN }).id)
  }
  const judgement = await import(modulePath)
  REFUSALS = judgement.JUDGEMENT_REFUSALS as Refusals
  REASON_MOST = judgement.JUDGEMENT_REASON_MOST as number
  DOOR = (await import(doorPath)).JUDGEMENT_DOOR_REFUSALS as DoorRefusals
})
afterAll(async () => { await app?.close(); t?.close() })

it("keeps one note with the verdicts in the receipt's order, opens a problem for each file and tells each line once", async () => {
  const [a, b, c] = files()
  const receipt = filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red', [b]: 'green', [c]: 'red' }))
  const reply = await judge('secretary', { receipt, verdicts: [verdict(c, 'line-b', 'feature-broken'), verdict(a)] })
  expect(reply.statusCode, reply.body).toBe(201)
  const result = reply.json() as { judgement: { id: string }; files: { file: string; verdict: string; problem: string; opened: string }[]; told: { line: string; message: string }[] }
  expect(result.judgement).toEqual(reference(result.judgement.id))
  expect(result.files.map(one => [one.file, one.verdict, one.opened])).toEqual([[a, 'test-fault', 'now'], [c, 'feature-broken', 'now']])
  const [pa, pc] = result.files.map(one => one.problem) as [string, string]
  const note = row(result.judgement.id)
  expect(note).toMatchObject({ kind: 'note', workspaceId: 'default', deletedAt: null })
  // Who judged and when are the note's create stamp, and are not stored a second time.
  expect(note.data['extra']).toEqual({ receiptJudgement: { version: 2, receipt, verdicts: [
    { file: a, ranAlone: 'red', verdict: 'test-fault', reason: `A made-up reason for ${a}.`, problem: pa },
    { file: c, ranAlone: 'red', verdict: 'feature-broken', reason: `A made-up reason for ${c}.`, problem: pc },
  ] } })
  expect(await firstRevision(result.judgement.id)).toMatchObject({ op: 'create', who: { actorType: 'agent', resolvedAgentId: ids.get('secretary') }, provedBy: 'an-agent-key' })
  for (const [problem, file, said, line] of [[pa, a, 'test-fault', 'line-a'], [pc, c, 'feature-broken', 'line-b']] as const) {
    expect(row(problem)).toMatchObject({ kind: 'problem', workspaceId: 'default', deletedAt: null,
      data: { state: 'open', seen_in: [file], extra: { judgedFile: { receipt, file, verdict: said, line: ids.get(line) } } } })
  }
  expect(aboutLinks(result.judgement.id)).toEqual([pa, pc].sort())
  expect(result.told.map(one => one.line)).toEqual([ids.get('line-a'), ids.get('line-b')])
  for (const told of result.told) {
    const message = row(told.message)
    expect(message.kind).toBe('message')
    expect(message.data['to']).toEqual([{ kind: 'agent', id: told.line }])
    expect(message.data['lead']).toMatchObject({ target: { kind: 'record', recordId: result.judgement.id, workspaceId: 'default' } })
  }
})

it('files a judgement of red, not-run and no-result files, and keeps how each ran alone', async () => {
  const [a, b, c] = files()
  const receipt = filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red', [b]: 'not run', [c]: 'no result' }))
  const reply = await judge('secretary', { receipt, verdicts: [verdict(c), verdict(a), verdict(b)] })
  expect(reply.statusCode, reply.body).toBe(201)
  const result = reply.json() as { judgement: { id: string }; files: { file: string; verdict: string; problem: string; opened: string }[] }
  expect(result.files.map(one => [one.file, one.verdict, one.opened]))
    .toEqual([[a, 'test-fault', 'now'], [b, 'test-fault', 'now'], [c, 'test-fault', 'now']])
  const [pa, pb, pc] = result.files.map(one => one.problem) as [string, string, string]
  expect(row(result.judgement.id).data['extra']).toEqual({ receiptJudgement: { version: 2, receipt, verdicts: [
    { file: a, ranAlone: 'red', verdict: 'test-fault', reason: `A made-up reason for ${a}.`, problem: pa },
    { file: b, ranAlone: 'not run', verdict: 'test-fault', reason: `A made-up reason for ${b}.`, problem: pb },
    { file: c, ranAlone: 'no result', verdict: 'test-fault', reason: `A made-up reason for ${c}.`, problem: pc },
  ] } })
  expect(result.files.map(one => row(one.problem))).toEqual([
    expect.objectContaining({ kind: 'problem', data: expect.objectContaining({ state: 'open', seen_in: [a] }) }),
    expect.objectContaining({ kind: 'problem', data: expect.objectContaining({ state: 'open', seen_in: [b] }) }),
    expect.objectContaining({ kind: 'problem', data: expect.objectContaining({ state: 'open', seen_in: [c] }) }),
  ])
})

it("takes a judgement from the person with the person's key", async () => {
  const [a] = files()
  const reply = await judge('person', { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red' })), verdicts: [verdict(a)] })
  expect(reply.statusCode, reply.body).toBe(201)
  expect(await firstRevision(reply.json().judgement.id)).toMatchObject({ op: 'create', who: { actorType: 'human' }, provedBy: 'the-person-key' })
})

it('keeps the problem still open for a file, and refuses a judgement that names another line for it', async () => {
  const [a] = files()
  const first = await judge('secretary', { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red' })), verdicts: [verdict(a)] })
  expect(first.statusCode, first.body).toBe(201)
  const problem = first.json().files[0].problem as string
  const again = await judge('secretary', { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red' })), verdicts: [verdict(a)] })
  expect(again.statusCode, again.body).toBe(201)
  expect(again.json().files).toEqual([expect.objectContaining({ file: a, problem, opened: 'already' })])
  expect(aboutLinks(again.json().judgement.id)).toEqual([problem])
  const other = { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red' })), verdicts: [verdict(a, 'line-b')] }
  const before = writes()
  const refused = await judge('secretary', other)
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.json().error).toBe(DOOR.anotherLine(a))
  expect(writes()).toBe(before)
  t.api.patchRecord(problem, { dataPatch: { state: 'fixed' } }, t.api.HUMAN)
  const after = await judge('secretary', other)
  expect(after.statusCode, after.body).toBe(201)
  expect(after.json().files).toEqual([expect.objectContaining({ file: a, opened: 'now' })])
  expect(after.json().files[0].problem).not.toBe(problem)
})

it('refuses, writing nothing, a judgement the release check could never take', async () => {
  const [a, b, c] = files()
  const red = filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red', [b]: 'green', [c]: 'red' }))
  const both = [verdict(a), verdict(c)]
  const note = filed({ body: 'A made-up note, not a receipt.' }, 'note')
  const cases: [string, string, object, number, string][] = [
    ['a key the request does not have', 'secretary', { receipt: red, verdicts: both, judgedBy: 'me' }, 400, DOOR.shape],
    ['a blank reason', 'secretary', { receipt: red, verdicts: [verdict(a), { ...verdict(c), reason: '  ' }] }, 400, DOOR.shape],
    ['a reason too long', 'secretary', { receipt: red, verdicts: [verdict(a), { ...verdict(c), reason: 'x'.repeat(REASON_MOST + 1) }] }, 400, DOOR.shape],
    ['a verdict word it does not know', 'secretary', { receipt: red, verdicts: [verdict(a), { ...verdict(c), verdict: 'flaky' }] }, 400, DOOR.shape],
    ['the same file twice', 'secretary', { receipt: red, verdicts: [verdict(a), verdict(a), verdict(c)] }, 400, DOOR.shape],
    ['no verdicts', 'secretary', { receipt: red, verdicts: [] }, 400, DOOR.shape],
    ['an agent without the secretary card', 'stranger', { receipt: red, verdicts: both }, 403, DOOR.writer],
    ['a verdict for a file green alone', 'secretary', { receipt: red, verdicts: [...both, verdict(b)] }, 400, REFUSALS.notRed(b)],
    ['no verdict for a file red alone', 'secretary', { receipt: red, verdicts: [verdict(a)] }, 400, REFUSALS.noVerdict(c)],
    ['a green receipt', 'secretary', { receipt: filed(aReceiptGreenAlone(COMMIT, TREE, [a])), verdicts: [verdict(a)] }, 400, DOOR.green],
    ['no verdict for a file with no result alone', 'secretary', { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red', [c]: 'no result' })), verdicts: [verdict(a)] }, 400, REFUSALS.noVerdict(c)],
    ['no verdict for a file not run alone', 'secretary', { receipt: filed(aReceiptRedIn(COMMIT, TREE, { [a]: 'red', [c]: 'not run' })), verdicts: [verdict(a)] }, 400, REFUSALS.noVerdict(c)],
    ['an error outside the tests', 'secretary', { receipt: filed({ ...aReceiptRedIn(COMMIT, TREE, { [a]: 'red' }), errorsOutsideTests: 1 }), verdicts: [verdict(a)] }, 400, REFUSALS.incomplete],
    ['a note instead of a receipt', 'secretary', { receipt: note, verdicts: both }, 400, DOOR.receipt],
    ['another content hash', 'secretary', { receipt: { ...red, contentHash: note.contentHash }, verdicts: both }, 400, DOOR.receipt],
    ['a line nobody registered', 'secretary', { receipt: red, verdicts: [verdict(a), verdict(c, 'NoSuchAgent0')] }, 400, DOOR.line(c)],
  ]
  for (const [name, who, payload, status, sentence] of cases) {
    const before = writes()
    const reply = await judge(who, payload)
    expect(reply.statusCode, `${name}: ${reply.body}`).toBe(status)
    expect(reply.json().error, name).toBe(sentence)
    expect(writes(), name).toBe(before)
  }
  const kept = await judge('secretary', { receipt: red, verdicts: both })
  expect(kept.statusCode, kept.body).toBe(201)
})
