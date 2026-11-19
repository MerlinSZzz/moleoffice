// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A JUDGED RECEIPT LETS AN UPGRADE IN (wave 13q item 6). A receipt that is not green goes in only when the authorization
 * note pins a judgement of it that stands. Two checks read that: the office's, when the notices are filed (the BEFORE by
 * the notice function, with a synthetic identity for the stopped baseline, the AFTER through the notice door, which reads
 * the real serving socket), and the release tool's, over the same office in this test's process. Each refusal is asked
 * of both, each for its own commit, and both must give the same sentence. The receipts are made up
 * (tests/a-made-up-judged-receipt.ts). The judgements are filed through the judgement door, except those the door would
 * refuse, which are written as plain notes.
 *
 * A RECEIPT AND A JUDGEMENT LONGER THAN THE DEFAULT REPLY: a receipt's original revision has been longer than 60,000
 * characters, and a judgement of many red files, each with its reason, can be too. The tool reads the receipt and the
 * judgement's revision, current record and revision list at the evidence module's own reply length, and an answer cut
 * even at that length is still refused. The office reads its own store, so only the tool is asked this.
 */
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aReceiptGreenAlone, aReceiptRedIn, type AloneOutcome } from './a-made-up-judged-receipt.ts'
import { stableUpgradeHistoryPageSchema, stableUpgradeNoticeResultSchema, type StableUpgradeNoticeResult } from '../src/shared/stable-upgrade-notices.ts'
import { theClockZone } from '../src/shared/time.ts'
import { gateNamed } from '../src/config/gates.mjs'
import { THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { verifyStableReleasePolicy } from '../tools/stable/stable-release-policy.mjs'
import type { Actor } from '../src/server/lib/records.ts'

// Read by name, so this criterion compiles before the judgement module, the tool's new export, the office's sentences and
// the evidence module's reply length are there.
const modulePath = '../src/shared/receipt-judgement.ts'
const policyPath = '../tools/stable/stable-release-policy.mjs'
const noticesPath = '../src/server/lib/stable-upgrade-notices.ts'
const evidencePath = '../tools/stable/stable-upgrade-evidence.mjs'
let theLongestReceiptReply: number
type Sentence = string & {}
type Refusals = Record<'pin' | 'revision' | 'shape' | 'deleted' | 'changed' | 'author' | 'another' | 'green' | 'emergency' | 'incomplete', Sentence> &
  Record<'noVerdict' | 'notRed' | 'featureBroken' | 'noProblem' | 'ranAlone', (file: string) => Sentence>
let REFUSALS: Refusals
/** What the office says of a receipt it does not take. */
let RECEIPT: Record<'notGreen' | 'notOfTheCommit', Sentence>
const TREE = 'd'.repeat(40)
type Ref = { id: string; seq: number; contentHash: string }
type Side = 'office' | 'tool'
let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/stable-upgrade-notices.ts')
let commit: string
let repository: string
let port: number
let number = 0
/** The newest completed upgrade: the tool's baseline. The office's cases that go in complete one, and become it. */
let latest: { after: StableUpgradeNoticeResult; candidateTag: string }
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
function reference(id: string, seq = 1): Ref {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq, contentHash: r.content_hash }
}
/**
 * The release check runs as a secretary. Its reads are answered as the request helper answers them, cut past the longest
 * reply a read asks for. `padded` puts spaces after the answer to one path, up to `to` characters, so the answer is still
 * whole JSON and only the cut refuses it.
 */
function aRequestHelper(padded: { path: string; to: number } | null = null) {
  return Object.assign(async (request: { method: string; path: string; body?: unknown; longestReply?: number }) => {
    const reply = await app.inject({ method: request.method as 'GET', url: request.path, headers: headers('secretary'),
      ...(request.body === undefined ? {} : { payload: request.body as object }) })
    const body = padded?.path === request.path ? reply.body.padEnd(padded.to) : reply.body
    const longest = request.longestReply ?? THE_LONGEST_REPLY
    const cut = body.length > longest
    const location = reply.headers.location
    return { status: reply.statusCode, body: cut ? body.slice(0, longest) : body, cut,
      location: typeof location === 'string' ? location : null }
  }, { identity: { get project() { return 'default' }, get agent() { return ids.get('secretary')! }, get session() { return runs.get('secretary')! } } })
}
const officeRequest = aRequestHelper()

/** Each side's upgrade goes to its own commit: the office's to the commit it serves, the tool's from it. */
const target = (side: Side) => side === 'office' ? commit : commit === 'b'.repeat(40) ? 'c'.repeat(40) : 'b'.repeat(40)
/** Three made-up test files no other case names, so an open problem of one case never meets another. */
function files(): [string, string, string] {
  const n = ++number
  return [`tests/made-up-${n}-a.test.ts`, `tests/made-up-${n}-b.test.ts`, `tests/made-up-${n}-c.test.ts`]
}
function receiptFor(side: Side, alone: Record<string, AloneOutcome>, more: object = {}): Ref {
  return reference(t.api.createRecord({ kind: 'whole_suite_receipt', title: `Made-up receipt ${++number}`, workspaceId: 'default',
    data: { ...aReceiptRedIn(target(side), TREE, alone), ...more }, actor: actor('controller') }).id)
}
/** A judgement filed through the judgement door by `who`, with `reason` for each file. */
async function judgementOf(receipt: Ref, verdicts: [string, 'test-fault' | 'feature-broken'][], who = 'secretary',
  reason = (file: string) => `A made-up reason for ${file}.`) {
  const reply = await app.inject({ method: 'POST', url: '/api/office/upgrades/judgements', headers: who === 'person' ? ownerHeaders : headers(who),
    payload: { receipt, verdicts: verdicts.map(([file, verdict]) => ({ file, verdict, reason: reason(file), line: ids.get('line')! })) } })
  expect(reply.statusCode, reply.body).toBe(201)
  const filed = reply.json() as { judgement: Ref; files: { problem: string }[] }
  return { pin: filed.judgement, problems: filed.files.map(one => one.problem) }
}
/** A judgement the door would refuse, written as a plain note by the secretary. */
function aPlainJudgement(receipt: Ref, verdicts: [string, string][]): Ref {
  return reference(t.api.createRecord({ kind: 'note', title: `A made-up judgement ${++number}`, workspaceId: 'default', actor: actor('secretary'), data: {
    body: 'A made-up judgement the judgement door would refuse.',
    extra: { receiptJudgement: { version: 1, receipt, verdicts: verdicts.map(([file, problem]) => ({ file, verdict: 'test-fault', reason: 'A made-up reason.', problem })) } },
  } }).id)
}
/** A version-2 judgement whose stored run alone the case names, written as a plain note by the secretary. */
function aJudgementSayingItRanAlone(receipt: Ref, verdicts: [string, string, string][]): Ref {
  return reference(t.api.createRecord({ kind: 'note', title: `A made-up judgement ${++number}`, workspaceId: 'default', actor: actor('secretary'), data: {
    body: 'A made-up judgement with a stored run alone.',
    extra: { receiptJudgement: { version: 2, receipt, verdicts: verdicts.map(([file, ranAlone, problem]) => ({ file, ranAlone, verdict: 'test-fault', reason: 'A made-up reason.', problem })) } },
  } }).id)
}
/** The authorization note: the notice, written by `author`, then its extra. */
function noteB(notice: string, author: string, extra: Record<string, unknown> | null): Ref {
  const note = t.api.createRecord({ kind: 'note', title: `Synthetic approval ${++number}`, workspaceId: 'default', data: { body: notice }, actor: actor(author) })
  if (extra === null) return reference(note.id)
  t.api.patchRecord(note.id, { dataPatch: { extra } }, actor(author))
  return reference(note.id, 2)
}

/** The office's two checks of an upgrade to the commit it serves. `pin` undefined pins nothing. */
function theOffice(evidence: Ref, pin?: unknown, author = 'secretary') {
  const n = ++number
  const notice = `Synthetic judged upgrade notice ${n}.`
  const announcement = { candidateTag: `stable-2026-10-26-judged-${n}`, baselineTag: `synthetic-older-${n}`, fromCommit: 'a'.repeat(40), toCommit: commit,
    tree: TREE, notice, evidence, noticeApproval: noteB(notice, author, pin === undefined ? null : { stableReleaseJudgement: pin }) }
  const before = () => lib.fileStableUpgradeNotice('default', { stage: 'before', sendId: `before-judged-${n}`, announcement }, actor('controller'),
    () => ({ commit: announcement.fromCommit, repository, database: t.file, port: 12345 }))
  const after = async (filed: { original: unknown }) => {
    const reply = await app.inject({ method: 'POST', url: '/api/office/upgrades/notice', headers: headers('controller'), payload: {
      stage: 'after', sendId: `after-judged-${n}`, before: filed.original,
      outcome: { state: 'completed', verification: { result: 'completed', evidence, serving: { commit, repository, database: t.file, port } } },
    } })
    if (reply.statusCode === 201) latest = { after: stableUpgradeNoticeResultSchema.parse(reply.json()), candidateTag: announcement.candidateTag }
    return reply
  }
  return { before, after, announcement }
}
/** What the office's BEFORE says: the refusal, or that it went in. */
function officeSays(before: () => unknown): string {
  try { before() } catch (error) { return (error as Error).message }
  return 'went in'
}
async function officeLetsIn(evidence: Ref, pin?: unknown, author = 'secretary') {
  const office = theOffice(evidence, pin, author)
  const after = await office.after(office.before())
  expect(after.statusCode, after.body).toBe(201)
  return office.announcement
}

/**
 * The release tool's check of the next upgrade from the commit the office serves. `pin` undefined pins nothing. The check
 * reads through `request`, the request helper unless a case names another.
 */
function theTool(evidence: Ref, pin?: unknown, author = 'secretary', mode: 'spacing' | 'emergency' = 'spacing') {
  const n = ++number
  const notice = `Synthetic next judged upgrade notice ${n}.`
  const candidateTag = `stable-2026-10-27-judged-${n}`
  const serving = { commit, repository, database: t.file, port }
  // Past every spacing the gate allows, so the spacing never decides these cases.
  const spacing = gateNamed('release-spacing').positions
  if (spacing.kind !== 'number') throw new Error('The spacing between stable releases is declared without a number.')
  const checked = Date.now() + (spacing.most + 1) * 60_000
  const authorized = { version: 1, mode, reason: 'Synthetic release approval.', timeZone: theClockZone(), candidateTag, baselineTag: latest.candidateTag,
    fromCommit: commit, toCommit: target('tool'), tree: TREE, serving, validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(checked + 60 * 60_000).toISOString(), baselineSource: { kind: 'completed-after', after: latest.after.original } }
  const stableReleaseAuthorization = mode === 'emergency' ? { ...authorized, message: evidence } : { ...authorized, evidence }
  const config = { candidateTag, previousBaselineTag: latest.candidateTag, targetCommit: target('tool'), notice,
    noticeApproval: noteB(notice, author, { stableReleaseAuthorization, ...(pin === undefined ? {} : { stableReleaseJudgement: pin }) }),
    evidence: { recordId: evidence.id, seq: evidence.seq, contentHash: evidence.contentHash },
    stableCheckout: repository, database: t.file, servicePort: port, ...(mode === 'emergency' ? { emergency: true } : {}) }
  return { config, check: (request = officeRequest) => verifyStableReleasePolicy({ config, baseline: commit, tree: TREE }, { officeRequest: request, now: () => checked }) }
}
async function toolSays(check: () => Promise<unknown>): Promise<string> {
  try { await check() } catch (error) { return (error as Error).message.replace(/^Release policy refused: /, '') }
  return 'went in'
}

const both = (sentence: string) => ({ office: sentence, tool: sentence })
/**
 * One case built for each side's commit, and what each side says of it. The step run after the authorization note is
 * written is not called `then`: an object with a `then` is awaited as a promise, and that one never settles.
 */
async function bothSay(build: (side: Side) => Promise<{ evidence: Ref; pin?: unknown; author?: string; afterTheNote?: () => void }>) {
  const forOffice = await build('office')
  const office = theOffice(forOffice.evidence, forOffice.pin, forOffice.author)
  forOffice.afterTheNote?.()
  const forTool = await build('tool')
  const tool = theTool(forTool.evidence, forTool.pin, forTool.author)
  forTool.afterTheNote?.()
  return { office: officeSays(office.before), tool: await toolSays(tool.check) }
}
/** A receipt red alone in two of three files, and a judgement of it by the secretary that stands. */
async function aJudgedReceipt(side: Side, who = 'secretary') {
  const [a, b, c] = files()
  const evidence = receiptFor(side, { [a]: 'red', [b]: 'green', [c]: 'red' })
  const judged = await judgementOf(evidence, [[a, 'test-fault'], [c, 'test-fault']], who)
  return { evidence, pin: judged.pin, problems: judged.problems, files: [a, b, c] as const }
}
/** How many files a long judgement judges, and how many more failed assertions a long receipt carries. */
const LONG_JUDGED_FILES = 40
const LONG_RECEIPT_TESTS = Math.ceil(THE_LONGEST_REPLY / 50)
/**
 * A receipt red alone in LONG_JUDGED_FILES files, with LONG_RECEIPT_TESTS more failed assertions in its first, and a
 * judgement of every file with a long reason, which its judge then changed. The pin is at the judgement's newest revision.
 * `reads` are the four reads the tool makes of the two: the receipt's original revision, and the judgement's pinned
 * revision, its current record and its revision list, which carries the body the change replaced.
 */
async function aLongJudgedReceipt() {
  const n = ++number
  const red = Array.from({ length: LONG_JUDGED_FILES }, (_, i) => `tests/made-up-${n}-${i + 1}.test.ts`)
  const alone = Object.fromEntries(red.map(file => [file, 'red' as const]))
  const failedTests = [...aReceiptRedIn(target('tool'), TREE, alone).failedTests!,
    ...Array.from({ length: LONG_RECEIPT_TESTS }, (_, i) => ({ file: red[0]!, name: `Made-up assertion ${i + 1} of a long red run` }))]
  const evidence = receiptFor('tool', alone, { failedTests })
  const judged = await judgementOf(evidence, red.map((file): [string, 'test-fault'] => [file, 'test-fault']), 'secretary',
    file => `A made-up long reason for ${file}. ${'The made-up reason goes on. '.repeat(60).trim()}`)
  t.api.patchRecord(judged.pin.id, { dataPatch: { body: 'The same long judgement, said again by the judge.' } }, actor('secretary'))
  const pin = reference(judged.pin.id, 2)
  const reads = { receipt: `/api/records/${evidence.id}/revisions/1`, judgement: `/api/records/${pin.id}/revisions/${pin.seq}`,
    current: `/api/records/${pin.id}`, revisions: `/api/records/${pin.id}/revisions` }
  return { evidence, pin, reads }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  ;({ commit, repository } = settings.theServingInstall())
  const webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  port = (app.server.address() as AddressInfo).port
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  for (const who of ['controller', 'secretary', 'other-secretary', 'line']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: ownerHeaders,
      payload: { handle: `judged-${who}`, name: `Synthetic ${who}`, role: who.endsWith('secretary') ? card : 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
    runs.set(who, t.api.createRecord({ workspaceId: 'default', kind: 'session', title: `Synthetic ${who} run`,
      data: { state: 'running', servingAgent: data.agent.id }, actor: t.api.HUMAN }).id)
  }
  lib = await import('../src/server/lib/stable-upgrade-notices.ts')
  REFUSALS = (await import(modulePath)).JUDGEMENT_REFUSALS as Refusals
  RECEIPT = (await import(noticesPath)).RECEIPT_REFUSALS as typeof RECEIPT
  theLongestReceiptReply = (await import(evidencePath)).THE_LONGEST_RECEIPT_REPLY as number
  // The first baseline: a green receipt, pinning nothing, goes in as it always has.
  const [a] = files()
  await officeLetsIn(reference(t.api.createRecord({ kind: 'whole_suite_receipt', title: 'Made-up green receipt', workspaceId: 'default',
    data: { ...aReceiptGreenAlone(commit, TREE, [a]) }, actor: actor('controller') }).id))
})
afterAll(async () => { await app?.close(); t?.close() })

it("lets in a receipt red alone in files judged a test's fault by the author of the authorization note, at BEFORE, at AFTER and at every check of the tool", async () => {
  const office = await aJudgedReceipt('office')
  const announcement = await officeLetsIn(office.evidence, office.pin)
  // The history page reads an authorization note with the pin beside its notice.
  const history = await app.inject({ method: 'GET', url: '/api/office/upgrades?limit=25', headers: headers('secretary') })
  expect(history.statusCode, history.body).toBe(200)
  expect(stableUpgradeHistoryPageSchema.parse(history.json()).entries).toContainEqual(expect.objectContaining({ tag: announcement.candidateTag, outcome: 'completed' }))
  const tool = await aJudgedReceipt('tool')
  const { check } = theTool(tool.evidence, tool.pin)
  for (const time of [1, 2]) await expect(check(), `check ${time}`).resolves.toMatchObject({ judgement: tool.pin })
})

it("lets in a receipt the person judged with the person's key, and one the judge changed and pinned again at its newest revision", async () => {
  const byThePerson = await aJudgedReceipt('office', 'person')
  await officeLetsIn(byThePerson.evidence, byThePerson.pin)
  const tool = await aJudgedReceipt('tool', 'person')
  await expect(theTool(tool.evidence, tool.pin).check()).resolves.toMatchObject({ judgement: tool.pin })
  const changed = await aJudgedReceipt('tool')
  t.api.patchRecord(changed.pin.id, { dataPatch: { body: 'The same judgement, said again by the judge.' } }, actor('secretary'))
  const newest = reference(changed.pin.id, 2)
  expect(await toolSays(theTool(changed.evidence, changed.pin).check)).toBe(REFUSALS.changed)
  await expect(theTool(changed.evidence, newest).check()).resolves.toMatchObject({ judgement: newest })
})

it('lets in a judged receipt whose receipt and judgement are each longer than the default reply, and still refuses either cut at the longer reply', async () => {
  const long = await aLongJudgedReceipt()
  for (const path of Object.values(long.reads)) {
    const reply = await app.inject({ method: 'GET', url: path, headers: headers('secretary') })
    expect(reply.body.length, `${path} is longer than the default reply`).toBeGreaterThan(THE_LONGEST_REPLY)
  }
  const { check } = theTool(long.evidence, long.pin)
  await expect(check(), 'the tool reads each of them whole').resolves.toMatchObject({ judgement: long.pin })

  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  for (const path of [long.reads.receipt, long.reads.judgement]) {
    expect(await toolSays(() => check(aRequestHelper({ path, to: theLongestReceiptReply + 1 }))), path)
      .toBe(`The office's answer to ${path} was cut, so the release check cannot read it whole.`)
  }
})

it('keeps a green receipt as it was, refuses a red one that pins nothing with the sentence it always had, and refuses a judged one of another commit', async () => {
  const [a] = files()
  const green = (side: Side) => reference(t.api.createRecord({ kind: 'whole_suite_receipt', title: `Made-up green receipt ${++number}`, workspaceId: 'default',
    data: { ...aReceiptGreenAlone(target(side), TREE, [a]) }, actor: actor('controller') }).id)
  await officeLetsIn(green('office'))
  const result = await theTool(green('tool')).check()
  expect(result).not.toHaveProperty('judgement')
  const [b] = files()
  expect(officeSays(theOffice(receiptFor('office', { [b]: 'red' })).before)).toBe(RECEIPT.notGreen)
  // A judgement standing for the receipt changes nothing while the authorization note does not pin it.
  const judged = await aJudgedReceipt('office')
  expect(officeSays(theOffice(judged.evidence).before)).toBe(RECEIPT.notGreen)
  // A judgement that stands, of a receipt of another commit: the office refuses the receipt before it asks the rule. The
  // tool's evidence check refuses such a receipt before it reads any judgement.
  const elsewhere = await aJudgedReceipt('tool')
  expect(officeSays(theOffice(elsewhere.evidence, elsewhere.pin).before)).toBe(RECEIPT.notOfTheCommit)
  // The release policy never read a receipt; the evidence check refuses it, below.
  expect(await theTool((await aJudgedReceipt('tool')).evidence).check()).not.toHaveProperty('judgement')
})

it('refuses a pin, a revision or a record that is not a judgement, the same way in the office and in the tool', async () => {
  expect(await bothSay(async side => ({ evidence: (await aJudgedReceipt(side)).evidence, pin: { id: 'not a record id', seq: 1 } }))).toEqual(both(REFUSALS.pin))
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    return { evidence: judged.evidence, pin: { ...judged.pin, contentHash: reference(judged.evidence.id).contentHash } }
  })).toEqual(both(REFUSALS.revision))
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    return { evidence: judged.evidence, pin: { ...judged.pin, seq: 2 } }
  })).toEqual(both(REFUSALS.revision))
  expect(await bothSay(async side => ({ evidence: (await aJudgedReceipt(side)).evidence,
    pin: reference(t.api.createRecord({ kind: 'note', title: `A made-up note ${++number}`, workspaceId: 'default', data: { body: 'Not a judgement.' }, actor: actor('secretary') }).id) }))).toEqual(both(REFUSALS.shape))
})

it('refuses a judgement deleted, deleted and restored, or changed since the pin, the same way in the office and in the tool', async () => {
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    return { ...judged, afterTheNote: () => t.api.deleteRecord(judged.pin.id, t.api.HUMAN) }
  })).toEqual(both(REFUSALS.deleted))
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    // Anybody's delete stops an upgrade; this one is the other secretary's.
    return { ...judged, afterTheNote: () => { t.api.deleteRecord(judged.pin.id, actor('other-secretary')); t.api.restoreRecord(judged.pin.id, t.api.HUMAN) } }
  })).toEqual(both(REFUSALS.deleted))
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    return { ...judged, afterTheNote: () => t.api.patchRecord(judged.pin.id, { dataPatch: { body: 'Changed after the pin.' } }, actor('secretary')) }
  })).toEqual(both(REFUSALS.changed))
})

it('refuses a judgement not written by the author of the authorization note nor by the person, the same way in the office and in the tool', async () => {
  // Both hold the secretary card; only the one who wrote the authorization note may have judged.
  expect(await bothSay(async side => ({ ...await aJudgedReceipt(side, 'other-secretary') }))).toEqual(both(REFUSALS.author))
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    t.api.patchRecord(judged.pin.id, { dataPatch: { body: 'Changed by another secretary.' } }, actor('other-secretary'))
    return { evidence: judged.evidence, pin: reference(judged.pin.id, 2) }
  })).toEqual(both(REFUSALS.author))
  expect(await bothSay(async side => ({ ...await aJudgedReceipt(side), author: 'other-secretary' }))).toEqual(both(REFUSALS.author))
})

it('refuses a judgement of another receipt, and every receipt no judgement can stand for, the same way in the office and in the tool', async () => {
  expect(await bothSay(async side => {
    const judged = await aJudgedReceipt(side)
    const [a, b, c] = judged.files
    // The same files, red alone the same way, in a receipt filed again: another receipt.
    return { evidence: receiptFor(side, { [a]: 'red', [b]: 'green', [c]: 'red' }), pin: judged.pin }
  })).toEqual(both(REFUSALS.another))
  const standing = { office: await aJudgedReceipt('office'), tool: await aJudgedReceipt('tool') }
  const pinned = async (side: Side, alone: Record<string, AloneOutcome>, more: object = {}) => ({ evidence: receiptFor(side, alone, more), pin: standing[side].pin })
  const [a, b] = files()
  expect(await bothSay(side => pinned(side, { [a]: 'green', [b]: 'green' }))).toEqual(both(REFUSALS.green))
  // A file with no result alone, and one not run alone, take a verdict now: leaving either out is noVerdict.
  for (const outcome of ['no result', 'not run'] as const) {
    expect(await bothSay(async side => {
      const evidence = receiptFor(side, { [a]: 'red', [b]: outcome })
      const judged = await judgementOf(evidence, [[a, 'test-fault'], [b, 'test-fault']])
      return { evidence, pin: aPlainJudgement(evidence, [[a, judged.problems[0]!]]) }
    })).toEqual(both(REFUSALS.noVerdict(b)))
  }
  expect(await bothSay(side => pinned(side, { [a]: 'red' }, { errorsOutsideTests: 1 }))).toEqual(both(REFUSALS.incomplete))
  expect(await bothSay(side => pinned(side, { [a]: 'red' }, { suiteExitCode: 2 }))).toEqual(both(REFUSALS.incomplete))
  const missing = `tests/made-up-${++number}.test.ts`
  expect(await bothSay(side => pinned(side, { [a]: 'red' }, { coverage: { expectedCount: 41, observedCount: 40, missing: [missing], unexpected: [] } }))).toEqual(both(REFUSALS.incomplete))
})

it('refuses verdicts that do not fit the receipt, a feature broken, and a problem no longer kept, the same way in the office and in the tool', async () => {
  const [a, b, c] = files()
  const receipt = (side: Side) => receiptFor(side, { [a]: 'red', [b]: 'green', [c]: 'red' })
  // The judgement door refuses the first two, so they are written as plain notes.
  expect(await bothSay(async side => {
    const evidence = receipt(side)
    return { evidence, pin: aPlainJudgement(evidence, [[a, 'NoSuchProblem']]) }
  })).toEqual(both(REFUSALS.noVerdict(c)))
  expect(await bothSay(async side => {
    const evidence = receipt(side)
    return { evidence, pin: aPlainJudgement(evidence, [[a, 'NoSuchProblem'], [b, 'NoSuchProblem'], [c, 'NoSuchProblem']]) }
  })).toEqual(both(REFUSALS.notRed(b)))
  expect(await bothSay(async side => {
    const evidence = receipt(side)
    return { evidence, pin: (await judgementOf(evidence, [[a, 'test-fault'], [c, 'feature-broken']])).pin }
  })).toEqual(both(REFUSALS.featureBroken(c)))
  expect(await bothSay(async side => {
    const evidence = receipt(side)
    return { evidence, pin: aPlainJudgement(evidence, [[a, 'NoSuchProblem'], [c, 'NoSuchProblem']]) }
  })).toEqual(both(REFUSALS.noProblem(a)))
  const [d] = files()
  expect(await bothSay(async side => {
    const evidence = receiptFor(side, { [d]: 'red' })
    const judged = await judgementOf(evidence, [[d, 'test-fault']])
    return { evidence, pin: judged.pin, afterTheNote: () => t.api.deleteRecord(judged.problems[0]!, t.api.HUMAN) }
  })).toEqual(both(REFUSALS.noProblem(d)))
})

it('lets a capped receipt in when every verdict is a test fault, and stops a feature broken on a file not run alone', async () => {
  expect(await bothSay(async side => {
    const [a, b, c] = files()
    const evidence = receiptFor(side, { [a]: 'red', [b]: 'not run', [c]: 'no result' })
    const judged = await judgementOf(evidence, [[a, 'test-fault'], [b, 'test-fault'], [c, 'test-fault']])
    return { evidence, pin: judged.pin }
  })).toEqual(both('went in'))
  const [a, b] = files()
  expect(await bothSay(async side => {
    const evidence = receiptFor(side, { [a]: 'red', [b]: 'not run' })
    const judged = await judgementOf(evidence, [[a, 'test-fault'], [b, 'feature-broken']])
    return { evidence, pin: judged.pin }
  })).toEqual(both(REFUSALS.featureBroken(b)))
})

it('refuses a stored run alone that differs from the receipt, and keeps a version-1 judgement standing', async () => {
  const [a, b] = files()
  expect(await bothSay(async side => {
    const evidence = receiptFor(side, { [a]: 'red', [b]: 'not run' })
    const judged = await judgementOf(evidence, [[a, 'test-fault'], [b, 'test-fault']])
    return { evidence, pin: aJudgementSayingItRanAlone(evidence, [[a, 'red', judged.problems[0]!], [b, 'red', judged.problems[1]!]]) }
  })).toEqual(both(REFUSALS.ranAlone(b)))
  expect(await bothSay(async side => {
    const [c, d] = files()
    const evidence = receiptFor(side, { [c]: 'red', [d]: 'red' })
    const judged = await judgementOf(evidence, [[c, 'test-fault'], [d, 'test-fault']])
    return { evidence, pin: aPlainJudgement(evidence, [[c, judged.problems[0]!], [d, judged.problems[1]!]]) }
  })).toEqual(both('went in'))
})

it('lets an AFTER in when the judgement was deleted after its BEFORE, and stops the tool at its next check after a delete', async () => {
  const office = await aJudgedReceipt('office')
  const upgrade = theOffice(office.evidence, office.pin)
  const before = upgrade.before()
  t.api.deleteRecord(office.pin.id, t.api.HUMAN)
  // The decision was taken at BEFORE; the AFTER says what happened.
  const after = await upgrade.after(before)
  expect(after.statusCode, after.body).toBe(201)
  const tool = await aJudgedReceipt('tool')
  const { check } = theTool(tool.evidence, tool.pin)
  await expect(check()).resolves.toMatchObject({ judgement: tool.pin })
  t.api.deleteRecord(tool.pin.id, actor('other-secretary'))
  expect(await toolSays(check)).toBe(REFUSALS.deleted)
})

it('refuses an emergency release whose authorization note pins a judgement, in the office and in the tool', async () => {
  const judged = await aJudgedReceipt('tool')
  const emergency = theTool(judged.evidence, judged.pin, 'secretary', 'emergency')
  expect(await toolSays(emergency.check)).toBe(REFUSALS.emergency)
  const n = ++number
  const notice = `Synthetic emergency notice ${n}.`
  const announcement = { candidateTag: `stable-2026-10-26-emergency-${n}`, baselineTag: `synthetic-older-${n}`, fromCommit: 'a'.repeat(40), toCommit: commit,
    tree: TREE, notice, noticeApproval: noteB(notice, 'secretary', { stableReleaseJudgement: judged.pin }),
    emergency: { throw: { change: 'NoSuchChange0', appendOrder: 1 }, message: judged.evidence } }
  expect(officeSays(() => lib.fileStableUpgradeNotice('default', { kind: 'emergency', stage: 'before', sendId: `before-emergency-${n}`, announcement } as never,
    actor('controller'), () => ({ commit: announcement.fromCommit, repository, database: t.file, port: 12345 })))).toBe(REFUSALS.emergency)
})

it('reads, through the tool, whether the authorization note pins a judgement that stands for the receipt', async () => {
  const theJudgementThatStands = (await import(policyPath)).theJudgementThatStands as (request: typeof officeRequest, approval: Ref, original: unknown) => Promise<unknown>
  const original = async (evidence: Ref) => {
    const reply = await officeRequest({ method: 'GET', path: `/api/records/${evidence.id}/revisions/1` })
    expect(reply.status, reply.body).toBe(200)
    const read = JSON.parse(reply.body) as { recordId: string; seq: number; contentHash: string; content: unknown }
    return { recordId: read.recordId, seq: read.seq, contentHash: read.contentHash, content: read.content }
  }
  const judged = await aJudgedReceipt('tool')
  const notice = `Synthetic notice ${++number}.`
  await expect(theJudgementThatStands(officeRequest, noteB(notice, 'secretary', { stableReleaseJudgement: judged.pin }), await original(judged.evidence))).resolves.toEqual(judged.pin)
  await expect(theJudgementThatStands(officeRequest, noteB(notice, 'secretary', null), await original(judged.evidence))).resolves.toBeNull()
  await expect(theJudgementThatStands(officeRequest, noteB(notice, 'other-secretary', { stableReleaseJudgement: judged.pin }), await original(judged.evidence)))
    .rejects.toThrow(REFUSALS.author)
})
