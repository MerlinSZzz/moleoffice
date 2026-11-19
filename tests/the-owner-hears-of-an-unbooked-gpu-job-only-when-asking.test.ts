// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER HEARS OF A GPU JOB WITH NO BOOKING ONLY WHEN ASKING FOR IT. Until then the office told the owner,
 * beside the booking's holder, of every job with no booking that left a booking no room; nine such notices reached the owner in a
 * week, one of them a service of the owner's own desktop. The owner's rule is that a person's preferences are not fixed in code, so it is a setting,
 * MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS, off by default, which the owner or any person changes on the Settings page. What
 * it does to the notices is tests/one-gpu-notice-per-job.test.ts's and tests/gpu-bookings-round-two.test.ts's (rule 11).
 *
 * WHAT THIS FILE PROVES: the switch is on the Settings page, changed there with no restart, off at the default, in plain
 * words that say what 0 and 1 mean; the door refuses a value that is not 0 or 1 and keeps nothing; a saved 1 is read back.
 * Every value and reason here is made up, in a fresh test database.
 *
 * MUTATIONS: the switch left off the runtime list (the page case red); its default made 1 (the default case red); the door's
 * check of a switch's value not reaching it (the refusal case red); its words taken out of the English list (the page case red).
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settingValue } from '../src/config/settings.mjs'

const NAME = 'MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS'
const AS_THE_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

let t: TestDb, app: FastifyInstance
let before: string | undefined
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})
beforeEach(() => {
  before = process.env[NAME]
  delete process.env[NAME]
})
afterEach(() => {
  if (before === undefined) delete process.env[NAME]
  else process.env[NAME] = before
  // Put the saved switch back, so the case that must keep nothing starts from nothing saved.
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(NAME)
})

const save = (value: string | null, because = 'Made-up reason for the switch') =>
  app.inject({ method: 'POST', url: '/api/office/settings', headers: AS_THE_OWNER, payload: { changes: [{ name: NAME, value }], because } })
const theRow = async () => ((await app.inject({ method: 'GET', url: '/api/office/settings', headers: AS_THE_OWNER })).json().settings as { name: string }[])
  .find((one) => one.name === NAME) as Record<string, unknown> | undefined

it('is off at the default, so the owner is told of no job with no booking until asking for it', () => {
  expect(settingValue(NAME, {})).toBe('0')
})

it('is on the Settings page, changed there with no restart, in plain words that say what 0 and 1 mean', async () => {
  const row = await theRow()
  expect(row, 'the switch is not on the Settings page').toBeDefined()
  expect(row).toMatchObject({ writable: true, restartRequired: false, value: '0' })
  expect(String(row!['what'])).not.toMatch(/MOLE_OFFICE_|\b[A-Z]+_[A-Z_]+\b|\b[a-z]+[A-Z]\w*/)
  expect(String(row!['what'])).toMatch(/\b1\b[^.]*\.[^]*\b0\b|\b0\b[^.]*\.[^]*\b1\b/)
  const saved = await save('1')
  expect(saved.statusCode, saved.body).toBe(200)
  expect(await theRow()).toMatchObject({ value: '1', source: 'the office database' })
})

it('refuses a value that is not 0 or 1, in a plain sentence, and keeps nothing', async () => {
  for (const value of ['2', 'on', '01']) {
    const refused = await save(value)
    expect(refused.statusCode, value).toBe(400)
    expect(refused.json().error, value).toBe('Use 1 to turn it on, or 0 to turn it off. Nothing was changed.')
  }
  expect(t.client.sqlite.prepare('SELECT name FROM runtime_settings WHERE name = ?').all(NAME)).toEqual([])
})
