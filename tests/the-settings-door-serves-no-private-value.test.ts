// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS DOOR SERVES NO PRIVATE VALUE.
 *
 * Two settings hold things the office must not hand back: the place of the owner's private content file, and the
 * address of the private copy main is pushed to. A setting now says in its own declaration whether the door serves it,
 * and one that does not says why. The door leaves it out as it leaves out a key, and a reading of it alone refuses with
 * that reason rather than handing back the value.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 *   1. GET /api/office/settings answers 200, names neither private setting, and holds neither made-up value anywhere in
 *      its body, while the router setting and the release floor setting are still there.
 *   2. oneSettingReading refuses each private setting, naming it and the reason its own declaration gives; a made-up name
 *      no setting has still gets the unknown-setting refusal and neither private reason.
 *   3. every SETTINGS entry has a boolean `served` and a `notServedBecause` that is null exactly when served, and the
 *      entries with `served: false` are exactly the two private ones.
 *
 * Proved by mutation, each alone against this file:
 *   - the settings door filters on KEY alone again → the first case is red, because the private file's place comes back
 *     in a reading;
 *   - oneSettingReading ignores `served` → the second case is red, because it gives a reading instead of refusing;
 *   - a private setting loses its `notServedBecause`, or setting() marks a setting served from anything else → the
 *     third case is red, because a private name is no longer marked not served.
 *
 * Every value here is invented. The file the owner's content setting names is written in the test database's own folder
 * and holds nothing a real gate would read.
 */

import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SETTINGS } from '../src/config/settings.mjs'
import { THE_ROUTER_SETTING } from '../src/config/provider-router-settings.mjs'
import { THE_RELEASE_FLOOR_SETTING } from '../src/config/stable-release-floor.mjs'

const PRIVATE_NAMES = ['MOLE_OFFICE_OWNER_CONTENT_LIST', 'MOLE_OFFICE_PRIVATE_ORIGIN'] as const
const headers = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
let madeUp: { contentList: string; privateOrigin: string }
let saved: Record<string, string | undefined>

beforeEach(async () => {
  t = await freshDb()
  const folder = t.file.slice(0, t.file.lastIndexOf('/'))
  madeUp = {
    contentList: `${folder}/made-up-owner-content.txt`,
    privateOrigin: 'http://made-up-private-origin.invalid:1',
  }
  writeFileSync(madeUp.contentList, 'Made-up content; no gate reads it.\n')
  saved = {}
  for (const name of PRIVATE_NAMES) saved[name] = process.env[name]
  process.env.MOLE_OFFICE_OWNER_CONTENT_LIST = madeUp.contentList
  process.env.MOLE_OFFICE_PRIVATE_ORIGIN = madeUp.privateOrigin
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
  for (const name of PRIVATE_NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

/** The words a refusal throws, or a failure saying nothing was thrown. */
function theWordsThrownBy(read: () => unknown): string {
  try {
    read()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('the reading answered where it should have refused')
}

it('leaves both private settings out of the settings door and keeps the ordinary readings', async () => {
  const answer = await app.inject({ method: 'GET', url: '/api/office/settings', headers })
  expect(answer.statusCode, answer.body).toBe(200)
  const read = answer.json() as { settings: { name: string }[] }
  const names = read.settings.map((one) => one.name)
  for (const name of PRIVATE_NAMES) expect(names, name).not.toContain(name)
  expect(answer.body).not.toContain(madeUp.contentList)
  expect(answer.body).not.toContain(madeUp.privateOrigin)
  expect(names).toContain(THE_ROUTER_SETTING)
  expect(names).toContain(THE_RELEASE_FLOOR_SETTING)
})

it('refuses a declared setting the door does not serve, naming it and its own reason', async () => {
  const { oneSettingReading } = await import('../src/server/api/runtime-settings.ts')
  for (const name of PRIVATE_NAMES) {
    const declared = SETTINGS.find((one) => one.name === name)
    expect(declared, name).toBeDefined()
    const said = theWordsThrownBy(() => oneSettingReading(name))
    expect(said, name).toContain(name)
    expect(said, name).toContain(declared!.notServedBecause!)
  }

  const unknown = 'MOLE_OFFICE_MADE_UP_SETTING'
  const said = theWordsThrownBy(() => oneSettingReading(unknown))
  expect(said).toContain(`No setting is declared as ${unknown}`)
  for (const name of PRIVATE_NAMES) {
    const reason = SETTINGS.find((one) => one.name === name)!.notServedBecause!
    expect(said, name).not.toContain(reason)
  }
})

it('gives every setting served and notServedBecause, and marks exactly the two private ones not served', () => {
  for (const setting of SETTINGS) {
    expect(typeof setting.served, setting.name).toBe('boolean')
    if (setting.served) {
      expect(setting.notServedBecause, setting.name).toBeNull()
    } else {
      expect(typeof setting.notServedBecause, setting.name).toBe('string')
      expect((setting.notServedBecause as string).trim(), setting.name).not.toBe('')
    }
  }
  expect(SETTINGS.filter((one) => !one.served).map((one) => one.name).sort()).toEqual([...PRIVATE_NAMES].sort())
})
