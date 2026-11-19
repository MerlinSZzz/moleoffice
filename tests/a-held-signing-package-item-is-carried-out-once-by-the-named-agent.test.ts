// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SIGNED ITEM IS HELD FOR ITS NAMED AGENT, ONCE, FOR AT MOST 24 HOURS.
 * Three decisions, and the secretary's answer lmhhlMScsmHo.
 * 1. Bring defaults to at-the-signature and refuses unknown carriedOut values without filing.
 * 2. Signing runs the immediate item and holds the ask and rule without running either.
 * 3. Each act keeps its own outcome and writes the agent and signed item on both ledgers.
 * 4. A second press changes nothing; the claim must still be conditional on held.
 * 5. Only the named agent's key or run presses; another agent, a raise and the person cannot.
 * 6. Every read and press uses the clock; one second before the end still permits a press.
 * 7. The last held item ends the hold early, including an act that could not run.
 * 8. The person takes back what remains; the named agent gives back what remains.
 * 9. A hold opens neither an unrelated person-only door nor another agent's package.
 * 11. A test world refuses all three doors.
 * 12. The request hook refuses a named agent's key under human headers before the held door.
 * MUTATIONS, each restored: drop the named-agent check (5); drop the conditional held predicate
 * (4); ignore the clock (6); stop signedItemWritten writing (3); drop underTheirSignature (3);
 * ask the raise before the signature (3, with a raised named secretary granting a secretary card).
 * Remove the key hook's human-specific throw (12, whose reason distinguishes the generic type guard).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance
let forgetWorld: () => void
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (handle = 'held-worker'): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ids.get(handle)!, 'x-mole-office-key': keys.get(handle)! })
async function call(method: 'GET' | 'POST', url: string, headers = PERSON, payload?: unknown) {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: res.statusCode, body: res.json(), raw: res.body.replace(/[0-9a-f]{64}/g, '<fixture key>') }
}
type Item = { id: string; state: string; outcome: string | null; doneAt: string | null; carriedOut: string; carriedOutBy: { id: string; handle: string } | null; carriedOutIn: string | null }
type Package = { id: string; forAgent: { id: string; handle: string }; answeredAt: string; hold: null | { endsAt: string; open: boolean; endedAt: string | null; endedHow: string | null }; items: Item[] }
const setting = (value: number, carriedOut: string = 'by-the-named-agent') => ({ act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value }, why: 'A fixture change to copies kept.', carriedOut })
const counts = () => ['changes', 'revisions', 'signing_packages'].map(table => (t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
async function kept() { return (await call('GET', '/api/office/what-is-kept')).body.numbers.find((one: { key: string }) => one.key === 'keepBackups').inForce as number }
async function bring(items: unknown[] = [setting(21)], forAgent = 'held-worker'): Promise<Package> {
  const res = await call('POST', '/api/signing-packages', agent('held-secretary'), { forAgent, task: 'A fixture held task', items })
  expect(res.status, res.raw).toBe(201)
  return res.body.package as Package
}
async function sign(pack: Package): Promise<Package> {
  const res = await call('POST', `/api/signing-packages/${pack.id}/sign`, PERSON, { struck: [] })
  expect(res.status, res.raw).toBe(200)
  return res.body.package as Package
}
const press = (pack: Package, index = 0, headers = agent()) => call('POST', `/api/signing-packages/${pack.id}/items/${pack.items[index]!.id}/carry-out`, headers)
async function request(handle: string, asking = 'supervisor'): Promise<string> {
  const res = await call('POST', '/api/roles/requests', agent(handle), { asking, because: 'A fixture ask answered by the person.' })
  expect(res.status, res.raw).toBe(201)
  return res.body.request as string
}
function chapter() {
  return t.api.createRecord({ workspaceId: 'default', origin: 'fixture', actor: { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' }, kind: 'module', title: 'A fixture chapter', data: { extra: { chapter: 1 }, summaryBlocks: [{ id: 'held-rule', type: 'text', heading: 'A fixture rule', text: 'Only this office uses this rule.' }] } })
}
const askItem = (id: string) => ({ act: 'answer-an-ask-at-the-door', inputs: { request: id, answer: 'grant' }, why: 'A fixture card grant.', carriedOut: 'by-the-named-agent' })
const ruleItem = (id: string) => ({ act: 'mark-a-rule-only-for-this-office', inputs: { chapter: id, rule: 'held-rule', only: true }, why: 'A fixture rule mark.', carriedOut: 'by-the-named-agent' })
beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetWorld = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetWorld()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of ['held-secretary', 'held-other-secretary', 'held-worker', 'held-other', 'held-asker', 'held-asker-2', 'held-secretary-asker']) {
    const res = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, workArea: ['src'] })
    expect(res.status, res.raw).toBe(201)
    keys.set(handle, res.body.whatToGiveIt.key as string)
    ids.set(handle, (await call('GET', `/api/participants/agent/${handle}`)).body.participant.id as string)
  }
  for (const handle of ['held-secretary', 'held-other-secretary']) expect((await call('POST', `/api/roles/card/${handle}`, PERSON, { role: 'secretary' })).status).toBe(201)
  expect((await call('POST', '/api/roles/elevation/held-other-secretary', PERSON, { reason: 'A fixture raise that opens no held item.' })).status).toBe(201)
}, 60_000)
afterAll(async () => { vi.useRealTimers(); delete process.env.MOLE_OFFICE_WORLD_STARTED_BY; forgetWorld?.(); await app?.close(); t?.close() })

describe('an item held on the signature', () => {
  it('1: bring defaults, keeps the choice, and rejects another word without filing', async () => {
    const { carriedOut: _choice, ...immediate } = setting(21)
    const pack = await bring([immediate, setting(22)])
    expect(pack.items.map(one => one.carriedOut)).toEqual(['at-the-signature', 'by-the-named-agent'])
    const before = counts()
    const res = await call('POST', '/api/signing-packages', agent('held-secretary'), { forAgent: 'held-worker', task: 'A fixture task', items: [setting(23, 'whenever')] })
    expect(res.status, res.raw).toBe(400)
    expect(counts()).toEqual(before)
  })
  it('2: signing runs only the immediate item, and writes the end from the one signature time', async () => {
    const ask = await request('held-asker')
    const rule = chapter()
    const pack = await sign(await bring([setting(24, 'at-the-signature'), askItem(ask), ruleItem(rule.id)]))
    expect(pack.items.map(one => one.state)).toEqual(['done', 'held', 'held'])
    expect(await kept()).toBe(24)
    expect(t.api.getRecord(ask)?.data['answer']).toBeFalsy()
    expect(t.api.getRecord(rule.id)?.data['onlyThisOffice']).toBeFalsy()
    expect(pack.items.slice(1).map(one => [one.outcome, one.doneAt])).toEqual([[null, null], [null, null]])
    expect(pack.hold).toEqual({ endsAt: localStamp(new Date(parseLocalStamp(pack.answeredAt)! + 86400000)), open: true, endedAt: null, endedHow: null })
    expect((await sign(await bring([setting(25, 'at-the-signature')]))).hold).toBeNull()
  })
  it('3: all three acts keep their signature outcomes and the agent on both ledgers', async () => {
    const ask = await request('held-asker-2')
    const rule = chapter()
    const cases = [
      { item: setting(26), outcome: '"Backups to keep" was 25 and is now 26.', revisions: false },
      { item: askItem(ask), outcome: 'held-asker-2 holds the supervisor card.', revisions: true },
      { item: ruleItem(rule.id), outcome: `Rule 1, "A fixture rule", in "${rule.title}" is marked as only for this office.`, revisions: true },
    ]
    for (const one of cases) {
      const pack = await sign(await bring([one.item]))
      const limits = ['changes', 'revisions'].map(table => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n)
      const res = await press(pack)
      expect(res.status, res.raw).toBe(200)
      expect(res.body.package.items[0]).toMatchObject({ state: 'done', carriedOutBy: { id: ids.get('held-worker'), handle: 'held-worker' }, carriedOutIn: null })
      if (one.item.act === 'answer-an-ask-at-the-door') expect(res.body.package.items[0].outcome).toContain(one.outcome)
      else expect(res.body.package.items[0].outcome).toBe(one.outcome)
      for (const [i, table] of ['changes', 'revisions'].entries()) {
        const rows = t.client.sqlite.prepare(`SELECT actor_type, actor_id, signed_item, elevation FROM ${table} WHERE rowid > ?`).all(limits[i]) as { actor_type: string; actor_id: string; signed_item: string | null; elevation: string | null }[]
        if (table === 'changes' || one.revisions) expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
          expect(row).toMatchObject({ actor_type: 'agent', actor_id: ids.get('held-worker'), elevation: null })
          expect(JSON.parse(row.signed_item!)).toEqual({ package: pack.id, item: pack.items[0]!.id })
        }
      }
    }
    // A signature on this card grant precedes a raise the named secretary also holds. The raise's
    // card limit must not replace the person's signature on this one answer.
    expect((await call('POST', '/api/roles/elevation/held-secretary', PERSON, { reason: 'A fixture concurrent raise.' })).status).toBe(201)
    const special = await sign(await bring([askItem(await request('held-secretary-asker', 'secretary'))], 'held-secretary'))
    const done = await press(special, 0, agent('held-secretary'))
    expect(done.status, done.raw).toBe(200)
    expect(done.body.package.items[0].state).toBe('done')
    const row = t.client.sqlite.prepare('SELECT elevation, signed_item FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(special.items[0] && (await call('GET', `/api/signing-packages/${special.id}`)).body.package.items[0].inputs.request) as { elevation: string | null; signed_item: string }
    expect(row.elevation).toBeNull()
    expect(JSON.parse(row.signed_item)).toEqual({ package: special.id, item: special.items[0]!.id })
  })
  it('4: a second press runs nothing and the claim itself is conditional on held', async () => {
    const pack = await sign(await bring([setting(27)]))
    expect((await press(pack)).status).toBe(200)
    const before = counts()
    const receipt = (await call('GET', `/api/signing-packages/${pack.id}`)).body.package
    expect((await press(pack)).status).toBe(409)
    expect(counts()).toEqual(before)
    expect((await call('GET', `/api/signing-packages/${pack.id}`)).body.package).toEqual(receipt)
    // The synchronous transaction makes a natural second request hit the state guard first.
    // Check the conditional write as well: removing its predicate must fail this once criterion.
    const source = readFileSync(new URL('../src/server/lib/signing-packages.ts', import.meta.url), 'utf8')
    const carry = source.slice(source.indexOf('export function carryOutAHeldItem'), source.indexOf('export function takeBackAHold'))
    expect(carry).toMatch(/where\(and\(eq\(signingPackageItems\.id, itemId\), eq\(signingPackageItems\.state, 'held'\)\)\)/)
  })
  it('5: only the named agent presses, including its office-started run', async () => {
    const pack = await sign(await bring([setting(28)]))
    const before = counts()
    const value = await kept()
    for (const headers of [agent('held-other'), agent('held-other-secretary'), PERSON]) expect((await press(pack, 0, headers)).status).toBe(403)
    expect(counts()).toEqual(before)
    expect(await kept()).toBe(value)
    expect((await call('POST', '/api/signing-packages/unknown-held-package/items/unknown-held-item/carry-out', agent())).status).toBe(404)
    const run = await call('POST', '/api/records', PERSON, { kind: 'session', title: 'A fixture run of the named agent', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: 'held-worker' } })
    expect(run.status, run.raw).toBe(201)
    const res = await press(pack, 0, { ...agent(), 'x-mole-office-session': run.body.record.id, 'x-mole-office-workspace': 'another-project' })
    expect(res.status, res.raw).toBe(200)
    expect(res.body.package.items[0].carriedOutIn).toBe(run.body.record.id)
  })
  it('6: reads expiry without rewriting, refuses after the end, and permits one second before it', async () => {
    const expired = await sign(await bring([setting(29)]))
    const near = await sign(await bring([setting(30)]))
    const before = counts()
    const value = await kept()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(parseLocalStamp(expired.hold!.endsAt)! + 1000))
      const read = (await call('GET', `/api/signing-packages/${expired.id}`)).body.package as Package
      expect(read.hold).toMatchObject({ open: false, endedAt: expired.hold!.endsAt, endedHow: 'the-time-ran-out' })
      expect(read.items[0]).toMatchObject({ state: 'not-used', doneAt: null })
      expect(read.items[0]!.outcome).toContain(expired.hold!.endsAt)
      expect((await press(expired)).status).toBe(409)
      expect(counts()).toEqual(before)
      expect(await kept()).toBe(value)
      expect(t.client.sqlite.prepare('SELECT state FROM signing_package_items WHERE id = ?').get(expired.items[0]!.id)).toEqual({ state: 'held' })
      vi.setSystemTime(new Date(parseLocalStamp(near.hold!.endsAt)! - 1000))
      expect((await press(near)).status).toBe(200)
    } finally { vi.useRealTimers() }
  })
  it('7: the last held item ends early; a failed item is final and its writes roll back', async () => {
    const pack = await sign(await bring([setting(31), setting(32)]))
    const first = await press(pack)
    expect(first.body.package.hold.open).toBe(true)
    t.client.sqlite.exec("CREATE TRIGGER held_act_fails AFTER UPDATE OF keep_backups ON installation WHEN NEW.keep_backups = 32 BEGIN SELECT RAISE(FAIL, 'fixture failure after writing'); END")
    try {
      const last = await press(pack, 1)
      expect(last.status, last.raw).toBe(200)
      expect(last.body.package.items[1]).toMatchObject({ state: 'could-not', doneAt: null })
      expect(last.body.package.items[1].outcome).toContain('fixture failure after writing')
      expect(last.body.package.hold).toMatchObject({ open: false, endedHow: 'all-carried-out' })
      expect(last.body.package.hold.endedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
      expect(await kept()).toBe(31)
      expect((await press(pack, 1)).status).toBe(409)
    } finally { t.client.sqlite.exec('DROP TRIGGER held_act_fails') }
  })
  it('8: take-back belongs to the proved person, give-back to the named agent', async () => {
    for (const door of ['take-back', 'give-back']) {
      const pack = await sign(await bring([setting(33), setting(34)]))
      const before = counts()
      const value = await kept()
      const refused = door === 'take-back' ? [agent(), agent('held-other-secretary')] : [PERSON, agent('held-other')]
      for (const headers of refused) expect((await call('POST', `/api/signing-packages/${pack.id}/${door}`, headers)).status).toBe(403)
      expect(counts()).toEqual(before)
      const allowed = door === 'take-back' ? PERSON : agent()
      expect((await call('POST', `/api/signing-packages/unknown-held-package/${door}`, allowed)).status).toBe(404)
      const res = await call('POST', `/api/signing-packages/${pack.id}/${door}`, { ...allowed, 'x-mole-office-workspace': 'another-project' })
      expect(res.status, res.raw).toBe(200)
      expect(res.body.package.hold).toMatchObject({ open: false, endedHow: door === 'take-back' ? 'taken-back' : 'given-back' })
      expect(res.body.package.items.map((one: Item) => one.state)).toEqual(['not-used', 'not-used'])
      expect((await press(pack)).status).toBe(409)
      expect(await kept()).toBe(value)
    }
  })
  it('9: the grant opens only the named items', async () => {
    const own = await sign(await bring([setting(35)]))
    const other = await sign(await bring([setting(36)], 'held-other'))
    const before = counts()
    // An agent gives a card only within its own rank, and this agent holds the worker card, so an open held task must not
    // give it the supervisor card, which is above its own rung.
    expect((await call('POST', '/api/roles/card/held-other', agent(), { role: 'supervisor' })).status).toBe(403)
    expect((await press(other)).status).toBe(403)
    expect(counts()).toEqual(before)
    expect((await call('GET', `/api/signing-packages/${own.id}`)).body.package.hold.open).toBe(true)
  })
  it('11: a test world refuses carry-out, take-back and give-back', async () => {
    const pack = await sign(await bring([setting(37)]))
    const before = counts()
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'held-secretary'
    forgetWorld()
    try {
      for (const [door, headers] of [['take-back', PERSON], ['give-back', agent()], [`items/${pack.items[0]!.id}/carry-out`, agent()]] as const) {
        const res = await call('POST', `/api/signing-packages/${pack.id}/${door}`, headers)
        expect(res.status, res.raw).toBe(409)
        expect(res.body.error).toContain('This Mole Office is a test world')
      }
      expect(counts()).toEqual(before)
    } finally { delete process.env.MOLE_OFFICE_WORLD_STARTED_BY; forgetWorld() }
  })
  it('12: the request hook refuses the named key under a human name before carrying out', async () => {
    const pack = await sign(await bring([setting(38)]))
    const before = counts()
    const value = await kept()
    const res = await press(pack, 0, { ...agent(), 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })
    expect(res.status, res.raw).toBe(403)
    // The generic non-agent-type guard also refuses. Pin the human-specific sentence so removing
    // its throw is detected even while that second guard still blocks the request.
    expect(res.body.error).toContain("an agent's key never makes the caller the person")
    expect((await call('GET', `/api/signing-packages/${pack.id}`)).body.package.items[0].state).toBe('held')
    expect(counts()).toEqual(before)
    expect(await kept()).toBe(value)
  })
})
