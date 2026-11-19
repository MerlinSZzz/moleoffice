// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Only the broadcast-times door and the broadcast-settings door write their change stamps. All people and records here are made up.
 * Each key is discovered from its door's write, so changing a door's key exposes an unguarded key.
 * 1. The door adds a stamp naming the requester and reason; removing that write turns it red.
 * 2. Person and secretary cannot change the stamp with dataPatch; comparing only times turns it red.
 *    Removing the stamp path from the refusal also turns it red.
 * 3. Neither can change it with whole data; comparing only times turns it red.
 * 4. Neither can remove it with whole data; comparing only times turns it red.
 * 5. Both kinds of write can carry it unchanged; refusing unchanged stamps turns it red.
 * 6. Filing an agent with a stamp is refused; comparing only times turns it red.
 * 7. Restoring a version with the same times but an older stamp is refused; comparing only times turns it red.
 * 8. Restoring the first-filed record with the same times and an older stamp is refused; comparing only times turns it red.
 * 9. Restoring a later record with no times and its own stamp is refused; skipping such a record turns it red.
 * 10. The settings door adds a settings stamp naming the requester and reason.
 * 11. Person and secretary cannot change the settings stamp with dataPatch; comparing only the settings and the times stamp turns it red.
 * 12. Neither can change it with whole data; comparing only the settings and the times stamp turns it red.
 * 13. Neither can remove it with whole data; comparing only the settings and the times stamp turns it red.
 * 14. Both kinds of write can carry it unchanged.
 * 15. Filing an agent with a settings stamp is refused; comparing only the settings and the times stamp turns it red.
 * 16. Restoring a version with the same settings but an older settings stamp is refused; comparing only the settings and the
 *     times stamp turns it red.
 * 17. Restoring a later record with no settings, no times and its own settings stamp is refused; skipping such a record turns it red.
 * Reading the settings stamp under another key turns 11, 12, 13, 15, 16 and 17 red.
 * Taking the settings door out of the refusal turns every refused case red.
 * The later records in cases 9 and 17 are given only their stamp directly in this fresh database, to represent old stored data.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let stampKey: string
let settingsKey: string
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ids: Record<string, string> = {}
const records: Record<string, string> = {}
const timesA = ['12:00']
const timesB = ['13:00']
const reason = 'A reason for this test.'
const otherWorkspace = 'stamp-test'

async function ask(method: 'POST' | 'PATCH' | 'DELETE', path: string, payload?: unknown, headers = person) {
  const reply = await app.inject({ method, url: path, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { code: reply.statusCode, body: reply.body, said: reply.json() as Record<string, unknown> }
}
function agent(handle: string) { return { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ids[handle]! } }
function inOtherWorkspace() { return { ...person, 'x-mole-office-workspace': otherWorkspace } }
function data(record: string): Record<string, unknown> { return structuredClone(t.api.getRecord(record)!.data) }
function extra(record: string): Record<string, unknown> { return data(record)['extra'] as Record<string, unknown> }
function stamp(record: string): unknown { return extra(record)[stampKey] }
function settingsStamp(record: string): unknown { return extra(record)[settingsKey] }
async function setTimes(handle: string, times: string[], because = reason) {
  const reply = await ask('POST', `/api/participants/agent/${handle}/broadcast-times`, { times, because })
  expect(reply.code, reply.body).toBe(200)
}
async function setSettings(handle: string, settings: Record<string, unknown>, because = reason) {
  const reply = await ask('POST', `/api/participants/agent/${handle}/broadcast-settings`, { ...settings, because })
  expect(reply.code, reply.body).toBe(200)
}
function expectRefusal(reply: Awaited<ReturnType<typeof ask>>, key = stampKey) {
  expect(reply.code, reply.body).toBe(403)
  const said = String(reply.said['error'])
  expect(said).toContain('are changed only by their own doors: POST /api/participants/agent/<id>/broadcast-times')
  expect(said).toContain('POST /api/participants/agent/<id>/broadcast-settings')
  expect(said).toContain(`extra.${key}`)
}
function fileAnother(handle: string): string {
  return t.api.createRecord({ workspaceId: otherWorkspace, kind: 'agent', title: 'Another record in this test', data: { handle }, actor: { type: 'human', id: THE_PERSON } }).id
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const made = await ask('POST', '/api/workspaces', { id: otherWorkspace, title: 'A test workspace' })
  expect(made.code, made.body).toBeLessThan(300)
  for (const handle of ['door', 'patch', 'whole', 'remove', 'carry', 'revision', 'first', 'later',
    'settings-door', 'settings-patch', 'settings-whole', 'settings-remove', 'settings-carry', 'settings-revision', 'settings-later']) {
    const reply = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'secretary' })
    expect(reply.code, reply.body).toBe(201)
    ids[handle] = (reply.said['agent'] as { id: string }).id
    records[handle] = (t.client.sqlite.prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? ORDER BY r.created_at ASC, r.rowid ASC LIMIT 1').get(ids[handle]) as { id: string }).id
  }
  const before = extra(records['door']!)
  await setTimes('door', timesA)
  const after = extra(records['door']!)
  const added = Object.keys(after).filter((key) => !(key in before))
  expect(added).toHaveLength(1)
  stampKey = added[0]!
  const beforeSettings = extra(records['settings-door']!)
  await setSettings('settings-door', { leadMinutes: 5 })
  const afterSettings = extra(records['settings-door']!)
  const addedSettings = Object.keys(afterSettings).filter((key) => !(key in beforeSettings))
  expect(addedSettings).toHaveLength(1)
  settingsKey = addedSettings[0]!
}, 60_000)

afterAll(async () => { await app.close(); t.close() })

it('1. the door writes a stamp naming who asked and why', () => {
  expect(stamp(records['door']!)).toMatchObject({ by: { type: 'human', id: THE_PERSON }, because: reason })
})

it('2. dataPatch cannot change the stamp', async () => {
  const record = records['patch']!
  await setTimes('patch', timesA)
  const before = JSON.stringify(stamp(record))
  for (const headers of [person, agent('patch')]) {
    const reply = await ask('PATCH', `/api/records/${record}`, { dataPatch: { extra: { [stampKey]: { because: 'A false reason.' } } } }, headers)
    expectRefusal(reply)
    expect(JSON.stringify(stamp(record))).toBe(before)
  }
})

it('3. whole data cannot change the stamp', async () => {
  const record = records['whole']!
  await setTimes('whole', timesA)
  const before = JSON.stringify(stamp(record))
  for (const headers of [person, agent('whole')]) {
    const held = data(record)
    const bag = held['extra'] as Record<string, unknown>
    bag[stampKey] = { ...(bag[stampKey] as object), because: 'A false reason.' }
    const reply = await ask('PATCH', `/api/records/${record}`, { data: held }, headers)
    expectRefusal(reply)
    expect(JSON.stringify(stamp(record))).toBe(before)
  }
})

it('4. whole data cannot remove the stamp', async () => {
  const record = records['remove']!
  await setTimes('remove', timesA)
  const before = JSON.stringify(stamp(record))
  for (const headers of [person, agent('remove')]) {
    const held = data(record)
    delete (held['extra'] as Record<string, unknown>)[stampKey]
    const reply = await ask('PATCH', `/api/records/${record}`, { data: held }, headers)
    expectRefusal(reply)
    expect(JSON.stringify(stamp(record))).toBe(before)
  }
})

it('5. whole data and dataPatch may carry an unchanged stamp', async () => {
  const record = records['carry']!
  await setTimes('carry', timesA)
  const before = JSON.stringify(stamp(record))
  const held = data(record)
  ;(held['extra'] as Record<string, unknown>)['testNote'] = 'first'
  const whole = await ask('PATCH', `/api/records/${record}`, { data: held })
  expect(whole.code, whole.body).toBe(200)
  const patch = await ask('PATCH', `/api/records/${record}`, { dataPatch: { extra: { testNote: 'second' } } })
  expect(patch.code, patch.body).toBe(200)
  expect(JSON.stringify(stamp(record))).toBe(before)
})

it('6. an agent cannot be filed with a stamp', async () => {
  const handle = 'filed-with-stamp'
  const reply = await ask('POST', '/api/records', { kind: 'agent', title: 'An agent in this test', data: { handle, extra: { [stampKey]: stamp(records['door']!) } } })
  expectRefusal(reply)
  const rows = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'agent' AND json_extract(data, '$.handle') = ? AND deleted_at IS NULL").all(handle)
  expect(rows).toHaveLength(0)
})

it('7. an earlier version with equal times and an older stamp cannot be put back', async () => {
  const record = records['revision']!
  await setTimes('revision', timesA, 'First reason.')
  const old = JSON.stringify(stamp(record))
  const seq = (t.client.sqlite.prepare('SELECT MAX(seq) AS seq FROM revisions WHERE record_id = ?').get(record) as { seq: number }).seq
  await setTimes('revision', timesB, 'Second reason.')
  await setTimes('revision', timesA, 'Third reason.')
  const current = JSON.stringify(stamp(record))
  expect(current).not.toBe(old)
  const reply = await ask('POST', `/api/records/${record}/revisions/${seq}/restore`, {})
  expectRefusal(reply)
  expect(JSON.stringify(stamp(record))).toBe(current)
})

it('8. the first-filed record cannot come back with an older stamp and equal times', async () => {
  const record = records['first']!
  await setTimes('first', timesA, 'Earlier reason.')
  const old = JSON.stringify(stamp(record))
  const newer = fileAnother('first')
  const gone = await ask('DELETE', `/api/records/${record}`)
  expect(gone.code, gone.body).toBe(200)
  const broadcast = await import('../src/server/lib/broadcast.ts')
  broadcast.syncTheBroadcastSchedules()
  await setTimes('first', timesB, 'Middle reason.')
  await setTimes('first', timesA, 'Later reason.')
  const current = JSON.stringify(stamp(newer))
  expect(current).not.toBe(old)
  const reply = await ask('POST', `/api/records/${record}/restore`)
  expectRefusal(reply)
  expect(t.api.getRecord(record)?.deletedAt).not.toBeNull()
  expect(JSON.stringify(stamp(newer))).toBe(current)
})

it('9. a later record without times cannot come back with its own different stamp', async () => {
  const record = records['later']!
  await setTimes('later', timesA, 'Current reason.')
  const current = JSON.stringify(stamp(record))
  const newer = fileAnother('later')
  const gone = await ask('DELETE', `/api/records/${newer}`, undefined, inOtherWorkspace())
  expect(gone.code, gone.body).toBe(200)
  // Only this field is written directly, as data saved before the guard existed.
  t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, json(?)) WHERE id = ?').run(`$.extra.${stampKey}`, JSON.stringify({ because: 'An older reason.' }), newer)
  const reply = await ask('POST', `/api/records/${newer}/restore`, undefined, inOtherWorkspace())
  expectRefusal(reply)
  expect(t.api.getRecord(newer)?.deletedAt).not.toBeNull()
  expect(JSON.stringify(stamp(record))).toBe(current)
})

it('10. the settings door writes a settings stamp naming who asked and why', () => {
  expect(settingsStamp(records['settings-door']!)).toMatchObject({ leadMinutes: { by: { type: 'human', id: THE_PERSON }, because: reason } })
})

it('11. dataPatch cannot change the settings stamp', async () => {
  const record = records['settings-patch']!
  await setSettings('settings-patch', { leadMinutes: 5 })
  const before = JSON.stringify(settingsStamp(record))
  for (const headers of [person, agent('settings-patch')]) {
    const reply = await ask('PATCH', `/api/records/${record}`, { dataPatch: { extra: { [settingsKey]: { leadMinutes: { because: 'A false reason.' } } } } }, headers)
    expectRefusal(reply, settingsKey)
    expect(JSON.stringify(settingsStamp(record))).toBe(before)
  }
})

it('12. whole data cannot change the settings stamp', async () => {
  const record = records['settings-whole']!
  await setSettings('settings-whole', { leadMinutes: 5 })
  const before = JSON.stringify(settingsStamp(record))
  for (const headers of [person, agent('settings-whole')]) {
    const held = data(record)
    const bag = held['extra'] as Record<string, unknown>
    const stamps = bag[settingsKey] as Record<string, unknown>
    bag[settingsKey] = { ...stamps, leadMinutes: { ...(stamps['leadMinutes'] as object), because: 'A false reason.' } }
    const reply = await ask('PATCH', `/api/records/${record}`, { data: held }, headers)
    expectRefusal(reply, settingsKey)
    expect(JSON.stringify(settingsStamp(record))).toBe(before)
  }
})

it('13. whole data cannot remove the settings stamp', async () => {
  const record = records['settings-remove']!
  await setSettings('settings-remove', { leadMinutes: 5 })
  const before = JSON.stringify(settingsStamp(record))
  for (const headers of [person, agent('settings-remove')]) {
    const held = data(record)
    delete (held['extra'] as Record<string, unknown>)[settingsKey]
    const reply = await ask('PATCH', `/api/records/${record}`, { data: held }, headers)
    expectRefusal(reply, settingsKey)
    expect(JSON.stringify(settingsStamp(record))).toBe(before)
  }
})

it('14. whole data and dataPatch may carry an unchanged settings stamp', async () => {
  const record = records['settings-carry']!
  await setSettings('settings-carry', { leadMinutes: 5 })
  const before = JSON.stringify(settingsStamp(record))
  const held = data(record)
  ;(held['extra'] as Record<string, unknown>)['testNote'] = 'first'
  const whole = await ask('PATCH', `/api/records/${record}`, { data: held })
  expect(whole.code, whole.body).toBe(200)
  const patch = await ask('PATCH', `/api/records/${record}`, { dataPatch: { extra: { testNote: 'second' } } })
  expect(patch.code, patch.body).toBe(200)
  expect(JSON.stringify(settingsStamp(record))).toBe(before)
})

it('15. an agent cannot be filed with a settings stamp', async () => {
  const handle = 'filed-with-settings-stamp'
  const reply = await ask('POST', '/api/records', { kind: 'agent', title: 'An agent in this test', data: { handle, extra: { [settingsKey]: settingsStamp(records['settings-door']!) } } })
  expectRefusal(reply, settingsKey)
  const rows = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'agent' AND json_extract(data, '$.handle') = ? AND deleted_at IS NULL").all(handle)
  expect(rows).toHaveLength(0)
})

it('16. an earlier version with equal settings and an older settings stamp cannot be put back', async () => {
  const record = records['settings-revision']!
  await setSettings('settings-revision', { leadMinutes: 5 }, 'First reason.')
  const old = JSON.stringify(settingsStamp(record))
  const seq = (t.client.sqlite.prepare('SELECT MAX(seq) AS seq FROM revisions WHERE record_id = ?').get(record) as { seq: number }).seq
  await setSettings('settings-revision', { leadMinutes: 10 }, 'Second reason.')
  await setSettings('settings-revision', { leadMinutes: 5 }, 'Third reason.')
  const current = JSON.stringify(settingsStamp(record))
  expect(current).not.toBe(old)
  const reply = await ask('POST', `/api/records/${record}/revisions/${seq}/restore`, {})
  expectRefusal(reply, settingsKey)
  expect(JSON.stringify(settingsStamp(record))).toBe(current)
})

it('17. a later record without settings or times cannot come back with its own different settings stamp', async () => {
  const record = records['settings-later']!
  await setSettings('settings-later', { leadMinutes: 5 }, 'Current reason.')
  const current = JSON.stringify(settingsStamp(record))
  const newer = fileAnother('settings-later')
  const gone = await ask('DELETE', `/api/records/${newer}`, undefined, inOtherWorkspace())
  expect(gone.code, gone.body).toBe(200)
  // Only this field is written directly, as data saved before the guard existed.
  t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, json(?)) WHERE id = ?').run(`$.extra.${settingsKey}`, JSON.stringify({ leadMinutes: { because: 'An older reason.' } }), newer)
  const reply = await ask('POST', `/api/records/${newer}/restore`, undefined, inOtherWorkspace())
  expectRefusal(reply, settingsKey)
  expect(t.api.getRecord(newer)?.deletedAt).not.toBeNull()
  expect(JSON.stringify(settingsStamp(record))).toBe(current)
})
