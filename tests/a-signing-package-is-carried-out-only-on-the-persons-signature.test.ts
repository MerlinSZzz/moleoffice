// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SIGNING PACKAGE RUNS ONLY ON THE PERSON'S SIGNATURE, EACH UNSTRUCK ACT ONCE.
 * From two decisions of the owner's: line round 54, piece 1.
 * 1. Three items wait untouched; signing strikes item 2, runs 1 and 3, and gives an attributed receipt;
 *    another signature changes nothing, even after a setting is changed by hand.
 * 2. An ask answered by hand becomes could-not without hiding the other acts; a failure after a write
 *    rolls back only that act's writes, proving the nested transaction is a savepoint.
 * 3. Only a secretary with its own agent key brings a package.
 * 4. Signing and refusing belong to the proved person. A raised secretary is refused in the words of the check of
 *    what the grant carries, because the card keeps both doors; every signature and refusal in a test world is refused.
 * 5. Unknown acts, excluded settings, new-key asks, supplied changes or undone, duplicate items,
 *    unknown or retired agents, and invalid task, reasons or item counts file nothing.
 * 6. Striking every item or an item outside the package is refused.
 * 7. Only its secretary withdraws; withdrawn and refused packages never run, and items say not-run.
 * 8. Marking a rule runs at signing; the undo sentence names the existing mark on Regulations.
 * MUTATIONS after a control, restored byte for byte: remove the person check on sign (4), remove
 * the test-world refusal (4), remove the secretary check on bring (3), remove both waiting guards
 * (1), replace the nested transaction with a direct call (2), remove the duplicate check (5).
 */
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let forgetWorld: () => void
const keys = new Map<string, string>()
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (handle: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' })
const clean = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<fixture key>')
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string> = PERSON, payload?: unknown) {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: res.statusCode, body: res.json(), raw: clean(res.body) }
}
type Item = { id: string; position: number; act: string; inputs: Record<string, unknown>; why: string; shows: string; changes: string; undone: string; state: string; outcome: string | null; doneAt: string | null }
type Package = { id: string; task: string; forAgent: { id: string; handle: string }; broughtBy: { id: string; handle: string }; broughtAt: string; answeredBy: { kind: string; id: string } | null; answeredAt: string | null; state: string; items: Item[] }
const setting = (value: number, name = 'keepBackups') => ({ act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: name, value }, why: 'Keep enough copies.' })
async function bring(items: unknown[] = [setting(21)], extra: object = {}): Promise<Package> {
  const res = await call('POST', '/api/signing-packages', agent('package-secretary'), { forAgent: 'package-worker', task: 'Keep the agreed copies', items, ...extra })
  expect(res.status, res.raw).toBe(201)
  return res.body.package as Package
}
const count = () => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM signing_packages').get() as { n: number }).n
async function kept(name = 'keepBackups'): Promise<number | null> {
  const res = await call('GET', '/api/office/what-is-kept')
  const number = res.body.numbers.find((one: { key: string }) => one.key === name)
  return number.nobodyChose ? null : number.inForce as number
}
async function ask(handle: string): Promise<string> {
  const res = await call('POST', '/api/roles/requests', agent(handle), { asking: 'supervisor', because: 'To manage the work.' })
  expect(res.status, res.raw).toBe(201)
  return res.body.request as string
}
beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetWorld = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetWorld()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of ['package-secretary', 'package-other-secretary', 'package-worker', 'package-asker', 'package-failed-asker', 'package-retired']) {
    const res = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, workArea: ['src'] })
    expect(res.status, res.raw).toBe(201)
    keys.set(handle, res.body.whatToGiveIt.key as string)
  }
  for (const handle of ['package-secretary', 'package-other-secretary']) {
    expect((await call('POST', `/api/roles/card/${handle}`, PERSON, { role: 'secretary' })).status).toBe(201)
  }
}, 60_000)
afterAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  forgetWorld?.()
  await app?.close()
  t?.close()
})

describe('a signing package', () => {
  it('1: signs the unstruck items once and returns the whole receipt', async () => {
    const before = await kept()
    const request = await ask('package-asker')
    const filed = await bring([setting(21), { act: 'answer-an-ask-at-the-door', inputs: { request, answer: 'grant' }, why: 'The task needs a supervisor.' }, setting(22, 'untracedRequestDays')])
    expect(await kept()).toBe(before)
    expect(filed.items.map(one => one.state)).toEqual(['waiting', 'waiting', 'waiting'])
    expect(filed.items.map(one => one.position)).toEqual([1, 2, 3])
    expect(t.api.getRecord(request)?.data['answer']).toBeFalsy()
    // The waiting sentence is redrawn from today's value, and all-project reading retains its project.
    expect((await call('POST', '/api/office/what-is-kept', PERSON, { keepBackups: 19 })).status).toBe(200)
    const otherProject = { ...PERSON, 'x-mole-office-workspace': 'another-project' }
    const read = await call('GET', `/api/signing-packages/${filed.id}`, otherProject)
    expect(read.status, read.raw).toBe(200)
    expect(read.body.package.items[0].shows).toContain('from 19 to 21')
    const signed = await call('POST', `/api/signing-packages/${filed.id}/sign`, otherProject, { struck: [filed.items[1]!.id] })
    expect(signed.status, signed.raw).toBe(200)
    const receipt = signed.body.package as Package
    expect(receipt).toMatchObject({ task: filed.task, forAgent: filed.forAgent, broughtBy: filed.broughtBy, broughtAt: filed.broughtAt, state: 'signed', answeredBy: { kind: 'person', id: THE_PERSON } })
    expect(receipt.forAgent.handle).toBe('package-worker')
    expect(receipt.broughtBy.handle).toBe('package-secretary')
    expect(receipt.forAgent.id).not.toBe(receipt.forAgent.handle)
    expect(receipt.answeredAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(receipt.items.map(one => one.state)).toEqual(['done', 'struck', 'done'])
    for (const i of [0, 2]) {
      expect(receipt.items[i]!.outcome).toContain('is now')
      expect(receipt.items[i]!.doneAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
      expect(receipt.items[i]!.changes).not.toBe('')
      expect(receipt.items[i]!.undone).toContain('Settings')
      expect(receipt.items[i]!.undone).not.toContain('/api/')
    }
    expect(receipt.items[1]!.doneAt).toBeNull()
    expect(await kept()).toBe(21)
    expect(await kept('untracedRequestDays')).toBe(22)
    expect((await call('POST', '/api/office/what-is-kept', PERSON, { keepBackups: 40 })).status).toBe(200)
    expect((await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: [] })).status).toBe(409)
    expect(await kept()).toBe(40)
    expect((await call('GET', `/api/signing-packages/${filed.id}`)).body.package).toEqual(receipt)
    expect((await call('GET', '/api/signing-packages?state=signed&limit=1')).body.packages).toHaveLength(1)
  })

  it('2: a failed act keeps its reason and the other acts still run', async () => {
    const request = await ask('package-failed-asker')
    const filed = await bring([setting(23), { act: 'answer-an-ask-at-the-door', inputs: { request, answer: 'grant' }, why: 'Manage the task.' }, setting(24, 'untracedRequestDays')])
    expect((await call('POST', `/api/roles/requests/${request}/grant`, PERSON, {})).status).toBe(200)
    const signed = await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: [] })
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body.package.items.map((one: Item) => one.state)).toEqual(['done', 'could-not', 'done'])
    expect(signed.body.package.items[1].outcome).toMatch(/The act could not run: .*already granted/)
    expect(signed.body.package.items[1].doneAt).toBeNull()
    const before = await kept('untracedRequestDays')
    const partial = await bring([setting(25), setting(26, 'untracedRequestDays'), setting(27)])
    // A real SQLite failure AFTER the setting wrote: RAISE(FAIL) leaves the write until a savepoint rolls it back.
    t.client.sqlite.exec("CREATE TRIGGER package_act_fails AFTER UPDATE OF untraced_request_days ON installation WHEN NEW.untraced_request_days = 26 BEGIN SELECT RAISE(FAIL, 'the act failed after writing'); END")
    try {
      const result = await call('POST', `/api/signing-packages/${partial.id}/sign`, PERSON, { struck: [] })
      expect(result.status, result.raw).toBe(200)
      expect(result.body.package.items.map((one: Item) => one.state)).toEqual(['done', 'could-not', 'done'])
      expect(result.body.package.items[1].outcome).toContain('the act failed after writing')
      expect(await kept()).toBe(27)
      expect(await kept('untracedRequestDays'), 'the failed act left its write behind').toBe(before)
    } finally { t.client.sqlite.exec('DROP TRIGGER package_act_fails') }
  })

  it('3: only a secretary proved by its own key brings one', async () => {
    const before = count()
    for (const headers of [agent('package-worker'), { ...agent('package-secretary'), 'x-mole-office-key': '' }, PERSON]) {
      expect((await call('POST', '/api/signing-packages', headers, { forAgent: 'package-worker', task: 'Keep copies', items: [setting(28)] })).status).toBe(403)
    }
    expect(count()).toBe(before)
  })

  it('4: only the person signs and refuses, never in a test world', async () => {
    const filed = await bring()
    expect((await call('POST', '/api/roles/elevation/package-secretary', PERSON, { reason: 'A fixture raise for the signature refusal.' })).status).toBe(201)
    for (const who of ['package-secretary', 'package-worker']) {
      for (const door of ['sign', 'refuse']) {
        const res = await call('POST', `/api/signing-packages/${filed.id}/${door}`, agent(who), door === 'sign' ? { struck: [] } : undefined)
        expect(res.status, res.raw).toBe(403)
        expect(res.body.error).toContain(who === 'package-secretary' ? `The secretary card keeps signing-packages.${door} for the person` : "is the person's own act")
      }
    }
    const rule = await import('../src/server/lib/signing-packages.ts')
    expect(() => rule.signAPackage(filed.id, [], { type: 'human', id: THE_PERSON, from: 'this machine' })).toThrow("is the person's own act")
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'package-secretary'
    forgetWorld()
    try {
      for (const door of ['sign', 'refuse']) {
        const res = await call('POST', `/api/signing-packages/${filed.id}/${door}`, PERSON, door === 'sign' ? { struck: [] } : undefined)
        expect(res.status, res.raw).toBe(409)
        expect(res.body.error).toContain('This Mole Office is a test world')
      }
    } finally { delete process.env.MOLE_OFFICE_WORLD_STARTED_BY; forgetWorld() }
    expect((await call('GET', `/api/signing-packages/${filed.id}`)).body.package.state).toBe('waiting')
  })

  it('5: never files an invalid or forbidden item, including duplicates', async () => {
    const before = count()
    const workerId = (await call('GET', '/api/participants/agent/package-worker')).body.participant.id as string
    const newKey = t.api.createRecord({ workspaceId: 'default', actor: { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' }, kind: 'role_request', title: 'A fixture new-key ask', data: { asker: { kind: 'agent', id: workerId }, asking: 'worker', answersTo: { kind: 'person', id: THE_PERSON }, because: 'A fixture key was lost.', extra: { newKey: { agent: workerId } } } })
    const afterFixture = count()
    for (const [item, status, words] of [
      [{ act: 'revoke-a-regulation', inputs: {}, why: 'Not allowed.' }, 400, 'not one of the acts'],
      [{ ...setting(1), inputs: { panel: 'settings.keys', setting: 'person', value: 1 } }, 409, 'about a key, a login or a summons'],
      [{ act: 'answer-an-ask-at-the-door', inputs: { request: newKey.id, answer: 'grant' }, why: 'Not allowed.' }, 409, 'for a new key'],
      [{ ...setting(28), changes: 'Agent supplied.' }, 400, 'changes'],
      [{ ...setting(28), undone: 'Agent supplied.' }, 400, 'undone'],
    ] as const) {
      const res = await call('POST', '/api/signing-packages', agent('package-secretary'), { forAgent: 'package-worker', task: 'Keep copies', items: [setting(29), item] })
      expect(res.status, res.raw).toBe(status)
      expect(res.body.error).toContain(words)
      expect(res.body.error).toMatch(/item 2/i)
    }
    const retired = await call('POST', '/api/participants/agent/package-retired/retire', PERSON, { because: 'A fixture retired agent.' })
    expect(retired.status, retired.raw).toBe(200)
    for (const body of [
      { items: [setting(30), { ...setting(30), inputs: { value: 30, setting: 'keepBackups', panel: 'settings.whatiskept' } }] },
      { task: ' ' }, { task: 'x'.repeat(501) }, { items: [] }, { items: Array.from({ length: 26 }, (_, i) => setting(i + 1)) },
      { items: [{ ...setting(31), why: ' ' }] }, { items: [{ ...setting(31), why: 'x'.repeat(2001) }] },
      { forAgent: 'unknown-package-agent' }, { forAgent: 'package-retired' }, { questions: [] },
    ]) {
      const res = await call('POST', '/api/signing-packages', agent('package-secretary'), { forAgent: 'package-worker', task: 'Keep copies', items: [setting(31)], ...body })
      expect([400, 404, 409], res.raw).toContain(res.status)
    }
    expect(count()).toBe(afterFixture)
    expect(afterFixture).toBe(before)
  })

  it('6: refuses all items struck and an item outside the package', async () => {
    const filed = await bring()
    const all = await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: filed.items.map(one => one.id) })
    expect(all.status, all.raw).toBe(400)
    expect(all.body.error).toMatch(/refuse the package/i)
    const outside = await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: ['another-item'] })
    expect(outside.status, outside.raw).toBe(400)
    expect((await call('GET', `/api/signing-packages/${filed.id}`)).body.package.state).toBe('waiting')
  })

  it('7: only its secretary withdraws, and neither withdrawal nor refusal runs an act', async () => {
    const before = await kept()
    const filed = await bring()
    expect((await call('POST', `/api/signing-packages/${filed.id}/withdraw`, agent('package-other-secretary'))).status).toBe(403)
    const withdrawn = await call('POST', `/api/signing-packages/${filed.id}/withdraw`, agent('package-secretary'))
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body.package).toMatchObject({ state: 'withdrawn', answeredBy: { kind: 'agent', id: filed.broughtBy.id } })
    expect(withdrawn.body.package.items[0].state).toBe('not-run')
    expect((await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: [] })).status).toBe(409)
    const second = await bring()
    const refused = await call('POST', `/api/signing-packages/${second.id}/refuse`)
    expect(refused.status, refused.raw).toBe(200)
    expect(refused.body.package.state).toBe('refused')
    expect(refused.body.package.items[0].state).toBe('not-run')
    expect((await call('POST', `/api/signing-packages/${second.id}/sign`, PERSON, { struck: [] })).status).toBe(409)
    expect(await kept()).toBe(before)
  })

  it('8: marks a rule only at signing and names the existing undo press', async () => {
    const chapter = t.api.createRecord({ workspaceId: 'default', actor: { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' }, kind: 'module', title: 'A fixture chapter', data: { extra: { chapter: 1 }, summaryBlocks: [{ id: 'rule-fixture', type: 'text', heading: 'A fixture rule', text: 'Only this office uses the fixture rule.' }] } })
    const rule = 'rule-fixture'
    const filed = await bring([{ act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapter.id, rule, only: true }, why: 'This rule applies only here.' }])
    expect(filed.items[0]!.undone).toContain('Office regulations')
    expect(filed.items[0]!.undone).not.toContain('/api/')
    expect(t.api.getRecord(chapter.id)?.data['onlyThisOffice']).toBeFalsy()
    const signed = await call('POST', `/api/signing-packages/${filed.id}/sign`, PERSON, { struck: [] })
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body.package.items[0].state).toBe('done')
    expect(t.api.getRecord(chapter.id)?.data['onlyThisOffice']).toEqual([expect.objectContaining({ rule, by: THE_PERSON })])
    expect((await call('POST', '/api/office-regulations/only-this-office', PERSON, { chapter: chapter.id, rule, only: false })).status).toBe(200)
    const onePress = await call('POST', '/api/one-press', agent('package-worker'), { act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapter.id, rule, only: true } })
    expect(onePress.status, onePress.raw).toBe(201)
    const pressed = await call('POST', `/api/one-press/${onePress.body.request.id}/agree`)
    expect(pressed.body.request.state).toBe('done')
    expect(pressed.body.request.outcome).toContain(chapter.title)
    const already = await bring([{ act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapter.id, rule, only: true }, why: 'An unchanged mark must say so.' }])
    const noChange = await call('POST', `/api/signing-packages/${already.id}/sign`, PERSON, { struck: [] })
    expect(noChange.body.package.items[0].outcome).toContain('already marked')
    expect(noChange.body.package.items[0].outcome).toContain('nothing was changed')
    expect(noChange.body.package.items[0].outcome).toContain(chapter.title)
  })
})
