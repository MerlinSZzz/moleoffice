// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY SETS ITS OWN BROADCAST SETTINGS. A secretary sets for itself, with its own key and nobody else's
 * press, whether it broadcasts, its times, its reminder's lead and its reminder's words; a GET reads each back
 * with who, how, when and why; the person can still set all four.
 *
 * WHAT THIS FILE PROVES, through the doors GET and POST /api/participants/agent/:id/broadcast-settings and the
 * times door beside them:
 *   (a) the secretary sets each of the three with its own key: 200, stored at once, in its own name;
 *   (b) the GET reads each back with who, how, when and why, and the record's revisions hold the earlier changes;
 *   (c) with nothing set, the GET answers the office's four defaults, each said to be the office's;
 *   (h) the person sets each of the four;
 *   (i) an agent that is neither its starter nor a holder of the secretary card is refused, and nothing changes;
 *   (j) the general record change door cannot change the three, as it cannot change the times;
 *   and the same request sent twice writes nothing the second time: every row of the database is the same.
 *
 * MADE-UP: the secretaries "quill" and "lark", the worker "w-one", and every reason given.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names each run.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settingNamed } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'

type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')
type PatchingLib = typeof import('../src/server/lib/records/patching.ts')

let t: TestDb
let app: FastifyInstance
let broadcast: BroadcastLib
let patching: PatchingLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The broadcast settings the office reads here, each at its declared default, whatever the checkout's `.env` says. */
const THE_SETTINGS_READ = ['MOLE_OFFICE_BROADCAST_TIMES', 'MOLE_OFFICE_BROADCAST_LEAD_MINUTES', 'MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE'] as const

const idOf: Record<string, string> = {}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

async function send(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: body as object }) })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

function settingsOf(handle: string, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  return send('GET', `/api/participants/agent/${idOf[handle]!}/broadcast-settings`, undefined, headers)
}

function setSettings(handle: string, body: Record<string, unknown>, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; said: Record<string, unknown> }> {
  return send('POST', `/api/participants/agent/${idOf[handle]!}/broadcast-settings`, body, headers)
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await send('POST', '/api/agents/started', { handle, name: handle, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** The agent record one secretary's schedule is held on. */
function theRecordOf(handle: string): string {
  return (t.client.sqlite
    .prepare('SELECT m.record_id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1')
    .get(idOf[handle]) as { id: string }).id
}

/** What the agent record's schedule stores, as stored. */
function theStoredSchedule(handle: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.broadcastSchedule') AS held FROM records WHERE id = ?").get(theRecordOf(handle)) as { held: string }
  return JSON.parse(row.held) as Record<string, unknown>
}

/** The agent record's whole stored row. */
function theStoredRow(handle: string): unknown {
  return t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(theRecordOf(handle))
}

/**
 * THE TABLES THAT MEASURE REQUESTS, one row for each request and one count for each caller in a day. Every request
 * adds to them, the one that writes nothing too, and nothing in them is authored.
 */
const THE_REQUEST_MEASURES = new Set(['api_calls', 'header_only_calls'])

/** Every row of every table but the request measures, so a request that writes nothing can be shown to have written nothing. */
function everyRow(): Record<string, string[]> {
  const tables = (t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
    .filter(({ name }) => !THE_REQUEST_MEASURES.has(name))
  // IN THE ORDER OF THEIR JSON, because a table made WITHOUT ROWID has no rowid to order by.
  return Object.fromEntries(tables.map(({ name }) => [name, t.client.sqlite.prepare(`SELECT * FROM "${name}"`).all().map((row) => JSON.stringify(row)).sort()]))
}

type ASettingRead = { value: unknown; whose: string; default: unknown; unreadable: string | null; lastChange: Record<string, unknown> | null }
type TheSettingsRead = Record<'on' | 'times' | 'leadMinutes' | 'reminderWords', ASettingRead>

beforeAll(async () => {
  for (const name of THE_SETTINGS_READ) vi.stubEnv(name, settingNamed(name).fallback ?? '')
  t = await freshDb()
  broadcast = await import('../src/server/lib/broadcast.ts')
  patching = await import('../src/server/lib/records/patching.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('quill', 'secretary')
  await register('lark', 'secretary')
  await register('w-one', 'worker')
}, 120_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('with nothing set', () => {
  it('(c) reads the office’s four defaults, each said to be the office’s', async () => {
    const { code, said } = await settingsOf('lark')
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
    expect(said['schedule']).toBe('running')
    const settings = said['settings'] as TheSettingsRead
    const theOffices = {
      on: true,
      times: String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback).split(','),
      leadMinutes: Number(settingNamed('MOLE_OFFICE_BROADCAST_LEAD_MINUTES').fallback),
      reminderWords: broadcast.THE_OFFICES_REMINDER_WORDS,
    }
    for (const [name, value] of Object.entries(theOffices)) {
      expect(settings[name as keyof TheSettingsRead], name).toEqual({ value, whose: 'the-offices-default', default: value, unreadable: null, lastChange: null })
    }
    expect(said['earlierChanges']).toBe(`GET /api/records/${theRecordOf('lark')}/revisions`)
  })
})

describe('the secretary sets its own', () => {
  it('(a) sets each of the three with its own key, and each is stored at once in its own name', async () => {
    const words = 'Check the ai-news queue before the report.'
    for (const [name, value] of [['on', false], ['leadMinutes', 10], ['reminderWords', words]] as const) {
      const { code, said } = await setSettings('quill', { [name]: value, because: `quill sets its own ${name}.` }, asAgent('quill'))
      expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
      expect(said['changed']).toEqual([name])
      expect(theStoredSchedule('quill')[name]).toEqual(value)
      const answered = (said['changes'] as Record<string, unknown>)[name]
      expect(answered).toMatchObject({ by: { type: 'agent', id: idOf['quill'] }, how: 'a-secretary', before: { stored: false }, after: { stored: true, value } })
      // WHAT THE DOOR ANSWERS IS WHAT IT STORED, so the GET reads back the same change.
      expect(((await settingsOf('quill')).said['settings'] as TheSettingsRead)[name].lastChange).toEqual(answered)
    }
    expect(broadcast.theBroadcastScheduleOf(idOf['quill']!)).toMatchObject({ on: false, leadMinutes: 10, reminderWords: words })
  })

  it('(b) reads each back with who, how, when and why, and the record’s revisions hold the earlier changes', async () => {
    const first = await setSettings('quill', { leadMinutes: 20, because: 'A longer lead for the morning.' }, asAgent('quill'))
    expect(first.code, JSON.stringify(first.said).slice(0, 400)).toBe(200)
    const { code, said } = await settingsOf('quill', asAgent('quill'))
    expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
    const settings = said['settings'] as TheSettingsRead
    expect(settings.on).toMatchObject({ value: false, whose: 'its-own', default: true, unreadable: null })
    expect(settings.leadMinutes).toMatchObject({ value: 20, whose: 'its-own', unreadable: null })
    expect(settings.reminderWords).toMatchObject({ whose: 'its-own', unreadable: null })
    for (const [name, because] of [['on', 'quill sets its own on.'], ['leadMinutes', 'A longer lead for the morning.'], ['reminderWords', 'quill sets its own reminderWords.']] as const) {
      const last = settings[name].lastChange
      expect(last, name).toMatchObject({ by: { type: 'agent', id: idOf['quill'] }, how: 'a-secretary', because })
      expect(String(last?.['at']), name).toMatch(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/)
    }
    expect(settings.leadMinutes.lastChange).toMatchObject({ before: { stored: true, value: 10 }, after: { stored: true, value: 20 } })
    // THE EARLIER CHANGE OF THE LEAD IS IN THE RECORD'S REVISIONS, which the answer names.
    const revisions = await send('GET', String(said['earlierChanges']).replace(/^GET /, ''))
    expect(revisions.code, JSON.stringify(revisions.said).slice(0, 400)).toBe(200)
    const leads = (revisions.said['revisions'] as { changed: { path: string; after: string | null }[] | null }[])
      .flatMap((one) => one.changed ?? [])
      .filter((one) => one.path.endsWith('broadcastSchedule.leadMinutes'))
      .map((one) => one.after)
    expect(leads).toEqual(['20', '10'])
  })

  it('writes nothing when the same request comes again, says so, and every row stays as it was', async () => {
    const body = { leadMinutes: 25, reminderWords: 'Say what moved since the last report.', because: 'Sent twice on purpose.' }
    const once = await setSettings('quill', body, asAgent('quill'))
    expect(once.code, JSON.stringify(once.said).slice(0, 400)).toBe(200)
    expect(once.said['changed']).toEqual(['leadMinutes', 'reminderWords'])
    const before = everyRow()
    const twice = await setSettings('quill', body, asAgent('quill'))
    expect(twice.code, JSON.stringify(twice.said).slice(0, 400)).toBe(200)
    expect(twice.said['changed']).toEqual([])
    const sentence = patching.nothingWrittenSentence({ kind: 'already-stored' })
    expect(twice.said['nothingWritten']).toBe(sentence)
    expect(twice.said['says']).toBe(sentence)
    expect(everyRow()).toEqual(before)
  })

  it('refuses a value that is wrong, names it, and writes nothing', async () => {
    const before = theStoredRow('quill')
    const longest = broadcast.THE_MOST_REMINDER_CHARACTERS
    for (const [name, value] of [
      ['on', 'no'],
      ['leadMinutes', broadcast.AN_OWN_LEAD.fewest - 1],
      ['leadMinutes', broadcast.AN_OWN_LEAD.most + 1],
      ['leadMinutes', 2.5],
      ['reminderWords', '   '],
      ['reminderWords', 'x'.repeat(longest + 1)],
    ] as const) {
      const { code, said } = await setSettings('quill', { [name]: value, because: 'A wrong value.' }, asAgent('quill'))
      expect(code, `${name} ${JSON.stringify(value).slice(0, 40)}: ${JSON.stringify(said).slice(0, 300)}`).toBe(400)
      expect(String(said['error'])).toContain(`"${name}"`)
      expect(String(said['error'])).toMatch(/Nothing was written\.$/)
    }
    const none = await setSettings('quill', { because: 'Naming nothing.' }, asAgent('quill'))
    expect(none.code, JSON.stringify(none.said).slice(0, 300)).toBe(400)
    expect(theStoredRow('quill')).toEqual(before)
    // THE MOST CHARACTERS ARE COUNTED AS A PERSON COUNTS THEM: that many Chinese characters are allowed.
    const most = await setSettings('quill', { reminderWords: '报'.repeat(longest), because: 'The longest words allowed.' }, asAgent('quill'))
    expect(most.code, JSON.stringify(most.said).slice(0, 300)).toBe(200)
    expect(theStoredSchedule('quill')['reminderWords']).toBe('报'.repeat(longest))
  })
})

describe('who else may set them', () => {
  it('(h) the person sets each of the four, and the GET says it was the person', async () => {
    const times = await send('POST', `/api/participants/agent/${idOf['lark']!}/broadcast-times`, { times: ['12:00'], because: 'The person moves lark to noon.' })
    expect(times.code, JSON.stringify(times.said).slice(0, 400)).toBe(200)
    for (const [name, value] of [['on', false], ['leadMinutes', 45], ['reminderWords', 'The person’s own words for lark.']] as const) {
      const { code, said } = await setSettings('lark', { [name]: value, because: `The person sets lark’s ${name}.` })
      expect(code, JSON.stringify(said).slice(0, 400)).toBe(200)
      expect(theStoredSchedule('lark')[name]).toEqual(value)
    }
    const settings = (await settingsOf('lark')).said['settings'] as TheSettingsRead
    expect(settings.times).toMatchObject({ value: ['12:00'], whose: 'its-own' })
    expect(settings.times.lastChange).toMatchObject({ by: { type: 'human', id: THE_PERSON }, how: 'the-owner', because: 'The person moves lark to noon.' })
    for (const name of ['on', 'leadMinutes', 'reminderWords'] as const) {
      expect(settings[name].whose, name).toBe('its-own')
      expect(settings[name].lastChange, name).toMatchObject({ by: { type: 'human', id: THE_PERSON }, how: 'the-owner', because: `The person sets lark’s ${name}.` })
    }
    // NULL HANDS EACH BACK TO THE OFFICE'S.
    const back = await setSettings('lark', { on: null, leadMinutes: null, reminderWords: null, because: 'Back to the office’s.' })
    expect(back.code, JSON.stringify(back.said).slice(0, 400)).toBe(200)
    const after = (await settingsOf('lark')).said['settings'] as TheSettingsRead
    for (const name of ['on', 'leadMinutes', 'reminderWords'] as const) {
      expect(after[name].whose, name).toBe('the-offices-default')
      expect(after[name].value, name).toEqual(after[name].default)
      expect(after[name].lastChange, name).toMatchObject({ before: { stored: true }, after: { stored: false }, because: 'Back to the office’s.' })
      expect(theStoredSchedule('lark'), name).not.toHaveProperty(name)
    }
  })

  it('(i) refuses an agent that is neither its starter nor a holder of the secretary card, and nothing changes', async () => {
    const before = theStoredRow('quill')
    for (const [name, value] of [['on', true], ['leadMinutes', 5], ['reminderWords', 'Not mine to set.']] as const) {
      const { code, said } = await setSettings('quill', { [name]: value, because: 'A worker tries.' }, asAgent('w-one'))
      expect(code, JSON.stringify(said).slice(0, 400)).toBe(403)
      expect(String(said['error'])).toMatch(/broadcast settings\. Nothing was written\.$/)
    }
    expect(theStoredRow('quill')).toEqual(before)
  })

  it('(j) the general record change door cannot change the three, for the person or the secretary, and a write leaving them alone goes through', async () => {
    const record = theRecordOf('quill')
    const before = theStoredSchedule('quill')
    for (const headers of [AS_THE_PERSON, asAgent('quill')]) {
      for (const [name, value] of [['on', true], ['leadMinutes', 5], ['reminderWords', 'Past the door.'], ['leadMinutes', null]] as const) {
        const { code, said } = await send('PATCH', `/api/records/${record}`, { dataPatch: { extra: { broadcastSchedule: { [name]: value } } } }, headers)
        expect(code, `${name}: ${JSON.stringify(said).slice(0, 400)}`).toBe(403)
        expect(String(said['error'])).toContain('POST /api/participants/agent/<id>/broadcast-settings')
      }
    }
    expect(theStoredSchedule('quill')).toEqual(before)
    const alone = await send('PATCH', `/api/records/${record}`, { dataPatch: { extra: { broadcastSchedule: { leadMinutes: before['leadMinutes'] }, reportsAt: 'noon' } } }, asAgent('quill'))
    expect(alone.code, JSON.stringify(alone.said).slice(0, 400)).toBe(200)
    expect(theStoredSchedule('quill')).toEqual(before)
  })
})
