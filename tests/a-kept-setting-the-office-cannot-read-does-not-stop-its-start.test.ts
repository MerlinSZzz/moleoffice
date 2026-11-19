// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEPT SETTING THE OFFICE CANNOT READ DOES NOT STOP ITS START (wave 13r round 16, item A; the secretary's
 * engineering choice in message 4MW_8wOW-hVF).
 *
 * The Office controls page says which value the running office started with, for each setting on
 * RESTART_SETTING_NAMES. The server reads those values once, when it puts up the settings door. That
 * reading threw at the first value it could not read, and the office did not start. So putting a
 * setting on the list could stop an office that starts today with the same value. Now:
 *   - the office starts;
 *   - the page's row says the setting is unreadable, in the reading's own refusal words, and says
 *     that a restart applies it;
 *   - the server's start log names the setting in one line;
 *   - a value saved later shows as waiting for a restart, not as the value the office started with.
 * The setting's own reader still fails openly where it reads the value. That is not changed here.
 *
 * MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN is the setting because only tools/serve-dev.mjs reads
 * it, so nothing else in the server refuses the empty value first. The empty value is MADE-UP here.
 *
 * MUTATIONS: the start reading lets the refusal through again: both cases red, because the office does
 * not start. It writes no line: the first case red. It keeps no start reading for the refused setting:
 * the second case red, because the saved value then shows as the value the office started with.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESTART_SETTING_NAMES } from '../src/config/runtime-settings.mjs'
import { readSetting } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

const NAME = 'MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN'
const OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

interface Row { name: string; value: string | null; source: string; currentValue: string | null; currentSource: string; pendingRestart: boolean; unreadable: string | null; restartRequired: boolean }

/** The refusal the reading itself gives for the empty value, worked out by the reading and not written here. */
function theReadingsOwnRefusal(): string {
  try { readSetting(NAME, { [NAME]: '' }) } catch (error) { return error instanceof Error ? error.message : String(error) }
  throw new Error(`${NAME} reads an empty value without a refusal, so this test holds nothing. Choose another kept setting.`)
}

buildTheFirstOfficeInAHook()

let t: TestDb | undefined
let app: FastifyInstance | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env[NAME]
  await app?.close()
  t?.close()
  app = undefined
  t = undefined
})

/** Start an office whose environment sets the kept setting empty, and keep each line it warns with. */
async function startWithTheSettingEmpty(): Promise<{ app: FastifyInstance; warned: string[] }> {
  expect(RESTART_SETTING_NAMES, `${NAME} is not a kept setting, so this test holds nothing`).toContain(NAME)
  t = await freshDb()
  const warned: string[] = []
  vi.spyOn(console, 'warn').mockImplementation((...parts: unknown[]) => { warned.push(parts.map(String).join(' ')) })
  process.env[NAME] = ''
  const built = (await apiApp()).app
  app = built
  await built.ready()
  return { app: built, warned }
}

async function theRow(office: FastifyInstance): Promise<Row> {
  const reply = await office.inject({ method: 'GET', url: '/api/office/settings', headers: OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  const row = (reply.json() as { settings: Row[] }).settings.find((one) => one.name === NAME)
  if (row === undefined) throw new Error(`GET /api/office/settings has no row for ${NAME}.`)
  return row
}

describe('a kept setting the office cannot read when it starts', () => {
  it('lets the office start, and the page and the start log say the setting is unreadable', async () => {
    const { app: office, warned } = await startWithTheSettingEmpty()
    const refusal = theReadingsOwnRefusal()
    expect(await theRow(office)).toMatchObject({ value: null, source: 'unreadable', currentValue: null, currentSource: 'unreadable', pendingRestart: false, unreadable: refusal, restartRequired: true })
    const lines = warned.filter((line) => line.includes(NAME))
    expect(lines, 'the start log names the setting once').toHaveLength(1)
    expect(lines[0], 'the line is one line, and carries the refusal').not.toContain('\n')
    expect(lines[0]).toContain(refusal)
  })

  it('shows a value saved later as waiting for a restart, and not as the value the office started with', async () => {
    const { app: office } = await startWithTheSettingEmpty()
    const saved = await office.inject({ method: 'POST', url: '/api/office/settings', headers: OWNER, payload: { changes: [{ name: NAME, value: '75' }], because: 'Made-up change reason' } })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(await theRow(office)).toMatchObject({ value: '75', source: 'the office database', currentValue: null, currentSource: 'unreadable', pendingRestart: true, unreadable: null, restartRequired: true })
  })
})
