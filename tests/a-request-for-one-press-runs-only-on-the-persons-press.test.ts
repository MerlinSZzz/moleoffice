// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST FOR ONE PRESS RUNS ITS ACT ONLY ON THE PERSON'S PRESS, AND ONCE. A decision, wave 13n
 * round 45. The rule is src/server/lib/one-press.ts and the doors are src/server/api/one-press.ts.
 *
 *   1. An agent files a request to change one setting. Nothing changes until the person agrees; then the setting is the
 *      new value, the request says what it did, and a second press is refused and changes nothing, even after the
 *      person has set the setting again by hand.
 *   2. An agent's press is refused in words, both Agree and Refuse, and so is any press in a test world.
 *   3. An act outside the list cannot be requested, a setting on the excluded list is refused with its reason, and a
 *      value the Settings page would refuse is refused. Nothing is filed.
 *   4. The second known act: an agent asks the person to grant a card ask at the door, and the person's press grants it.
 *   5. Only the asker withdraws its own request, and a withdrawn request cannot be agreed to.
 *   6. A request is filed only by an agent proved by its own key.
 *   7. The value the setting holds is read when the person reads and again at the press, never stored as words (check
 *      Gp2bKURlLvYh, round 45b): (a) another press changes it before the person reads, and the popup's and Home's
 *      sentence says the new value; (b) it changes between the read and the press, and the press sets exactly the asked
 *      value and says what it was; (c) it already holds the asked value at the press, and the press says so and
 *      changes nothing.
 *
 * MUTATIONS, each named in the commit that meets this file, after a control run: the person check on Agree is taken
 * out (case 2 goes red); the test-world refusal is taken out (case 2 goes red); both waiting guards are taken out, the
 * check before the act and the state on the update, since either alone holds (case 1 goes red: the second press sets
 * the value back); the known-acts check is taken out (case 3 goes red); the check for an excluded panel is taken out
 * (case 3 goes red).
 * Round 45b's, each after a control run and restored byte for byte: round 45's defect is put back, the sentence with
 * the value of the moment written at filing and served from the row (7a goes red); the press says only the new value,
 * as round 45's did (7b goes red); the check for a value already held is taken out (7c goes red).
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ONE_PRESS_REQUEST } from '../src/shared/one-press.ts'

let t: TestDb
let app: FastifyInstance
// freshDb starts the server's modules anew, so the world's reading is forgotten in the instance the server uses.
let forgetTheWorldsOwnAuthority: () => void = () => undefined
const PERSON_KEY = randomBytes(32).toString('hex')
const keys = new Map<string, string>()

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function startAnAgent(handle: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { handle, name: handle, workArea: ['src'] })
  expect(made.status, made.raw).toBe(201)
  const key = (made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''
  expect(key, `no key was given to ${handle}`).not.toBe('')
  keys.set(handle, key)
}

async function backupsToKeep(): Promise<number | null> {
  const read = await call('GET', '/api/office/what-is-kept', PERSON)
  const one = (read.body['numbers'] as { key: string; inForce: number; nobodyChose: boolean }[]).find((n) => n.key === 'keepBackups')
  return one === undefined || one.nobodyChose ? null : one.inForce
}

type Filed = { id: string; state: string; shows: string; outcome: string | null }

async function aSettingRequest(by: string, value: number): Promise<Filed> {
  const filed = await call('POST', '/api/one-press', asAgent(by), {
    act: 'change-a-setting',
    inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value },
    because: 'The backups folder is near its line.',
  })
  expect(filed.status, filed.raw).toBe(201)
  return filed.body['request'] as Filed
}

function requestsFiled(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM one_press_requests').get() as { n: number }).n
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await startAnAgent('guide-op')
  await startAnAgent('other-op')
  await startAnAgent('asker-op')
}, 60_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  forgetTheWorldsOwnAuthority()
  await app.close()
  t.close()
})

describe('a request for one press', () => {
  it('changes a setting only when the person agrees, and once', async () => {
    const before = await backupsToKeep()
    const request = await aSettingRequest('guide-op', 21)
    expect(request.state).toBe('waiting')
    expect(request.shows).toMatch(/^Change "Backups to keep" from .+ to 21\.$/)
    expect(await backupsToKeep(), 'the setting changed before the person pressed').toBe(before)

    const agreed = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
    expect(agreed.status, agreed.raw).toBe(200)
    const was = before === null ? '3, the default nobody chose,' : String(before)
    expect(agreed.body['request']).toMatchObject({ state: 'done', outcome: `"Backups to keep" was ${was} and is now 21.` })
    expect(await backupsToKeep()).toBe(21)

    // THE PERSON SETS IT AGAIN BY HAND, and a second press on the same request must not set it back.
    expect((await call('POST', '/api/office/what-is-kept', PERSON, { keepBackups: 40 })).status).toBe(200)
    const again = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
    expect(again.status, again.raw).toBe(409)
    expect(String(again.body['error'])).toContain('cannot be answered again')
    expect(await backupsToKeep(), 'the act ran twice').toBe(40)
  })

  it("refuses an agent's press and any press in a test world, in words", async () => {
    const request = await aSettingRequest('guide-op', 22)
    for (const press of ['agree', 'refuse'] as const) {
      const byAnAgent = await call('POST', `/api/one-press/${request.id}/${press}`, asAgent('other-op'))
      expect(byAnAgent.status, byAnAgent.raw).toBe(403)
      expect(String(byAnAgent.body['error'])).toContain("is the person's own act")
      const byItsAsker = await call('POST', `/api/one-press/${request.id}/${press}`, asAgent('guide-op'))
      expect(byItsAsker.status, byItsAsker.raw).toBe(403)
    }
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'a-test-world-starter'
    forgetTheWorldsOwnAuthority()
    try {
      const inAWorld = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
      expect(inAWorld.status, inAWorld.raw).toBe(409)
      expect(String(inAWorld.body['error'])).toContain('This Mole Office is a test world')
    } finally {
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
      forgetTheWorldsOwnAuthority()
    }
    expect(await backupsToKeep(), 'a refused press changed the setting').toBe(40)
    const still = await call('GET', `/api/one-press/${request.id}`, PERSON)
    expect((still.body['request'] as Filed).state).toBe('waiting')
    // THE PERSON REFUSES IT, and nothing runs.
    const refused = await call('POST', `/api/one-press/${request.id}/refuse`, PERSON)
    expect(refused.status, refused.raw).toBe(200)
    expect((refused.body['request'] as Filed).state).toBe('refused')
    expect(await backupsToKeep()).toBe(40)
  })

  it('refuses an act outside the list, an excluded setting with its reason, and a value the page refuses', async () => {
    const count = requestsFiled()
    const outside = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'run-a-command', inputs: { command: 'rm -rf /' } })
    expect(outside.status, outside.raw).toBe(400)
    expect(String(outside.body['error'])).toContain('"run-a-command" is not one of the acts the office knows')

    const inject = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'change-a-setting', inputs: { panel: 'settings.inject', setting: 'on', value: 1 } })
    expect(inject.status, inject.raw).toBe(409)
    expect(String(inject.body['error'])).toContain('"settings.inject" is not one of the settings a request may change: it changes who may do what')

    const keysPanel = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'change-a-setting', inputs: { panel: 'settings.keys', setting: 'person', value: 1 } })
    expect(keysPanel.status, keysPanel.raw).toBe(409)
    expect(String(keysPanel.body['error'])).toContain('it is about a key, a login or a summons')

    // The word table is changed on the Settings page itself since settings round 2, so it is not "only shown" there.
    const wordsPanel = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'change-a-setting', inputs: { panel: 'settings.words', setting: 'nav.home', value: 1 } })
    expect(wordsPanel.status, wordsPanel.raw).toBe(409)
    expect(String(wordsPanel.body['error'])).toContain('"settings.words" is not one of the settings a request may change: no request has been built for it yet')

    const tooLow = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 0 } })
    expect(tooLow.status, tooLow.raw).toBe(400)
    expect(String(tooLow.body['error'])).toContain('is not a value "Backups to keep" accepts')

    expect(requestsFiled(), 'a refused request was filed').toBe(count)
  })

  it('grants a card ask at the door on the person\'s press', async () => {
    const ask = await call('POST', '/api/roles/requests', asAgent('asker-op'), { asking: 'supervisor', because: 'To start a worker.' })
    expect(ask.status, ask.raw).toBe(201)
    const askId = ask.body['request'] as string
    const filed = await call('POST', '/api/one-press', asAgent('guide-op'), { act: 'answer-an-ask-at-the-door', inputs: { request: askId, answer: 'grant' } })
    expect(filed.status, filed.raw).toBe(201)
    const request = filed.body['request'] as Filed
    expect(request.shows).toBe('Give "asker-op" the supervisor card it asked for.')
    const agreed = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
    expect(agreed.status, agreed.raw).toBe(200)
    expect((agreed.body['request'] as Filed).state).toBe('done')
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(askId) as { data: string }
    expect((JSON.parse(stored.data) as { answer: string }).answer).toBe('granted')
  })

  it('is withdrawn only by its asker, and a withdrawn request cannot be agreed to', async () => {
    const request = await aSettingRequest('guide-op', 23)
    const waiting = await call('GET', '/api/waiting', PERSON)
    const row = (waiting.body['items'] as { id: string; kind: string; theOnePress?: { shows: string } }[]).find((one) => one.id === request.id)
    expect(row?.kind).toBe(ONE_PRESS_REQUEST)
    expect(row?.theOnePress?.shows).toBe(request.shows)

    const byAnother = await call('POST', `/api/one-press/${request.id}/withdraw`, asAgent('other-op'))
    expect(byAnother.status, byAnother.raw).toBe(403)
    const byItsAsker = await call('POST', `/api/one-press/${request.id}/withdraw`, asAgent('guide-op'))
    expect(byItsAsker.status, byItsAsker.raw).toBe(200)
    expect((byItsAsker.body['request'] as Filed).state).toBe('withdrawn')
    const agreed = await call('POST', `/api/one-press/${request.id}/agree`, PERSON)
    expect(agreed.status, agreed.raw).toBe(409)
    expect(await backupsToKeep()).toBe(40)
    const after = await call('GET', '/api/waiting', PERSON)
    expect((after.body['items'] as { id: string }[]).map((one) => one.id)).not.toContain(request.id)
  })

  it('is filed only by an agent proved by its own key', async () => {
    const noKey = await call('POST', '/api/one-press', { ...asAgent('guide-op'), 'x-mole-office-key': '' }, {
      act: 'change-a-setting',
      inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 24 },
    })
    expect(noKey.status, noKey.raw).toBe(403)
    const byThePerson = await call('POST', '/api/one-press', PERSON, { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 24 } })
    expect(byThePerson.status, byThePerson.raw).toBe(403)
  })

  it('reads the value the setting holds when the person reads and again at the press', async () => {
    const waitingRow = async (id: string): Promise<{ title?: string; theOnePress?: { shows: string } } | undefined> => {
      const waiting = await call('GET', '/api/waiting', PERSON)
      return (waiting.body['items'] as { id: string; title?: string; theOnePress?: { shows: string } }[]).find((one) => one.id === id)
    }
    expect((await call('POST', '/api/office/what-is-kept', PERSON, { keepBackups: 40 })).status).toBe(200)
    const asked = await aSettingRequest('guide-op', 30)
    expect(asked.shows).toBe('Change "Backups to keep" from 40 to 30.')

    // (a) ANOTHER PRESS CHANGES IT BEFORE THE PERSON READS.
    const another = await aSettingRequest('other-op', 25)
    expect((await call('POST', `/api/one-press/${another.id}/agree`, PERSON)).status).toBe(200)
    const row = await waitingRow(asked.id)
    expect(row?.theOnePress?.shows, 'the popup').toBe('Change "Backups to keep" from 25 to 30.')
    expect(row?.title, 'Home').toBe('Change "Backups to keep" from 25 to 30.')
    expect((await call('GET', `/api/one-press/${asked.id}`, PERSON)).body['request']).toMatchObject({ shows: 'Change "Backups to keep" from 25 to 30.' })

    // (b) IT CHANGES BETWEEN THE READ AND THE PRESS.
    expect((await call('POST', '/api/office/what-is-kept', PERSON, { keepBackups: 27 })).status).toBe(200)
    const agreed = await call('POST', `/api/one-press/${asked.id}/agree`, PERSON)
    expect(agreed.status, agreed.raw).toBe(200)
    expect(agreed.body['request']).toMatchObject({ state: 'done', outcome: '"Backups to keep" was 27 and is now 30.' })
    expect(await backupsToKeep()).toBe(30)

    // (c) IT ALREADY HOLDS THE ASKED VALUE AT THE PRESS.
    const already = await aSettingRequest('guide-op', 30)
    const changesBefore = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
    const pressed = await call('POST', `/api/one-press/${already.id}/agree`, PERSON)
    expect(pressed.status, pressed.raw).toBe(200)
    expect(pressed.body['request']).toMatchObject({ state: 'done', outcome: '"Backups to keep" was already 30, so nothing was changed.' })
    expect(await backupsToKeep()).toBe(30)
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n, 'a change was written down').toBe(changesBefore)
  })
})
