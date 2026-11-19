// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER SAYS WHEN WHAT A PAGE COMPARES OR SHOWS OF THE MACHINE CHANGED, AND ONLY THEN. Wave 13w, round 25.
 *
 * A page reads `GET /api/runtime` when it loads and when its stream comes back, and after that the server pushes a
 * change. `theMachineMayHaveChanged` in src/server/api/events.ts is the look the server's clock
 * takes every fifteen seconds while a person has a page open. It takes `whatAPageHoldsOfTheMachine` from
 * src/server/lib/runtime.ts and announces `machine.changed`, naming the parts that moved since its last look.
 *
 *   1. The first look only remembers, and a look that finds nothing moved announces nothing.
 *   2. A setting the "This computer" panel shows, changed in .env's place, is announced as `settings`, once, to every
 *      open page whichever project it watches; and changed back, announced again.
 *
 * WHY A SETTING. It is the one part a test can move without touching this checkout's files, its supervisor or its
 * database: `settingValue` reads the environment before .env on every call.
 *
 * MUTATIONS (after a green control):
 *   - `theMachineMayHaveChanged` announces on its first look as well (drop `if (before === null) return []`): case 1
 *     red;
 *   - `whatAPageHoldsOfTheMachine` leaves the reply reminder out of `settings`: case 2 red;
 *   - `machine.changed` is given a workspaceId: case 2 red, the page watching another project is not sent it.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { ChannelEvent } from '../src/shared/events.ts'

const SETTING = 'MOLE_OFFICE_REPLY_REMINDER_MINUTES'
let t: TestDb
let events: typeof import('../src/server/lib/events.ts')
let look: typeof import('../src/server/api/events.ts')
let before: string | undefined

/** One page of the person, watching one project, keeping every event it was sent. */
function aPage(watching: string): ChannelEvent[] {
  const got: ChannelEvent[] = []
  events.pageOpened({ workspaceId: watching, who: { kind: 'person', id: 'someone' }, send: (one) => got.push(one.event) })
  return got
}

beforeEach(async () => {
  before = process.env[SETTING]
  delete process.env[SETTING]
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  look = await import('../src/server/api/events.ts')
  events.forgetTheChannel()
  look.forgetWhatPagesWereToldOfTheMachine()
}, 60_000)

afterEach(() => {
  if (before === undefined) delete process.env[SETTING]
  else process.env[SETTING] = before
  events.forgetTheChannel()
  t.close()
})

it('remembers on the first look and announces nothing when nothing moved', () => {
  const page = aPage('default')
  expect(look.theMachineMayHaveChanged(), 'the first look announced').toEqual([])
  expect(look.theMachineMayHaveChanged(), 'a look that found nothing moved announced').toEqual([])
  expect(page.filter((one) => one.name === 'machine.changed')).toEqual([])
})

it('announces a setting the page shows, once, to every page in every project, and again when it goes back', () => {
  const here = aPage('default')
  const elsewhere = aPage('somewhere-else')
  look.theMachineMayHaveChanged()
  process.env[SETTING] = '7'
  expect(look.theMachineMayHaveChanged()).toEqual(['settings'])
  expect(look.theMachineMayHaveChanged(), 'the same change was announced twice').toEqual([])
  delete process.env[SETTING]
  expect(look.theMachineMayHaveChanged()).toEqual(['settings'])
  const told = { name: 'machine.changed', changed: ['settings'] }
  expect(here, 'the page watching this project').toEqual([told, told])
  expect(elsewhere, 'the page watching another project: the machine is the same whichever project is open').toEqual([told, told])
})
