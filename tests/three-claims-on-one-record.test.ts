// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE AGENTS ON ONE RECORD: THREE GROUPS THAT READ APART, AND EVERY ONE OF THEM DRAWN.
 *
 * Problem `qpjjRnnfo-4i`, found by the verifier of messages part 2e on 4 September 2026. Two faults,
 * one on each side.
 *
 * ON THE SERVER, a group opened for a conflict was named after the thing alone — *Two claims on
 * PanelX — server wiring and the published endpoint list* — so a third agent claiming the same record
 * opened two more groups with that same one name, and the chat panel listed three rows a reader could
 * not tell apart. The overlap a group is opened for is a pair and a thing; only the thing was in the
 * name.
 *
 * ON THE PAGE, `conflictOf` in src/web/components/Claims.tsx was a map keyed by claim id, so a claim
 * in two conflicts kept whichever was written last: each row named one group where there were two,
 * and the other was drawn nowhere at all.
 *
 * AND A THIRD THING, WHICH IS WHY THE NAME IS BUILT AND NOT CONCATENATED. A group name has a maximum
 * length, and a record with a long title took the old name past it. The name was then refused, and
 * the refusal came out of `POST /api/claims` — so filing the second claim on a record with a long
 * title failed, after the claim row had already been written. The last block below is that case.
 *
 * WHY THIS NEEDS A BROWSER FOR THE SECOND HALF. The map was on the page, and a page that fetched
 * every overlap and drew one of them would pass every kind of test but this one.
 *
 * Criterion M13 of design/messages/ACCEPTANCE.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { GROUP_NAME_MAX } from '../src/shared/groups.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page
let theModule = ''
/** The three agents' handles, in the order they claimed. */
const HANDLES = ['builder-one', 'builder-two', 'builder-three'] as const
/** Every group the three claims opened, by id, with the name it was opened under. */
let named: { id: string; name: string }[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return await res.json()
}

/** Register a durable agent with a display name of its own, and give back the run it works in. */
async function anAgentWithARun(handle: string, name: string, doing: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: name, data: { handle, state: 'active', runtime: 'claude-code', workArea: ['src'] } }, AS_THE_OWNER)
  const run = (await post(
    '/api/records',
    { kind: 'session', title: doing, data: { state: 'running', runtime: 'claude-code' } },
    asAgent(handle),
  )) as { record: { id: string } }
  return run.record.id
}

async function theGroups(): Promise<{ id: string; name: string }[]> {
  const read = (await (await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })).json()) as {
    groups: { id: string; name: string }[]
  }
  return read.groups
}

beforeAll(async () => {
  app = await liveApp({ name: 'three-claims-on-one-record', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const made = (await post(
    '/api/records',
    { kind: 'module', title: 'The gripper module', summary: 'Calibrating effort into grip force.', data: {} },
    AS_THE_OWNER,
  )) as { record: { id: string } }
  theModule = made.record.id

  // THREE AGENTS CLAIM THE SAME MODULE, one after another. The second claim opens one group and the
  // third opens two more, one per new pair: one overlap per pair per thing, which is the rule at
  // `overlapsIn` in src/server/lib/claims.ts.
  const opened: string[] = []
  for (const [index, handle] of HANDLES.entries()) {
    const run = await anAgentWithARun(handle, `Building agent ${handle}`, `${handle} on the gripper`)
    const filed = (await post(
      '/api/claims',
      { run, things: [{ what: 'record', id: theModule }] },
      asAgent(handle),
    )) as { groupsOpened: string[] }
    expect(filed.groupsOpened, `the groups the claim of ${handle} opened`).toHaveLength(index)
    opened.push(...filed.groupsOpened)
  }
  expect(opened, 'three agents on one record are three pairs, so three groups').toHaveLength(3)
  const all = await theGroups()
  named = opened.map((id) => {
    const found = all.find((one) => one.id === id)
    if (found === undefined) throw new Error(`the group ${id} was opened and then could not be read back`)
    return found
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the three groups a record full of claims opens read apart', () => {
  it('names each one after the two claims it is about, and the thing they both claimed', () => {
    for (const group of named) {
      expect(group.name, 'a group over one record has to say which two claims it holds').toContain(
        'The gripper module',
      )
      expect(group.name.length, 'a name too long for a group name would be refused').toBeLessThanOrEqual(
        GROUP_NAME_MAX,
      )
    }
    const pairs: readonly (readonly [string, string])[] = [
      [HANDLES[0], HANDLES[1]],
      [HANDLES[0], HANDLES[2]],
      [HANDLES[1], HANDLES[2]],
    ]
    for (const [first, second] of pairs) {
      const found = named.filter((one) => one.name.includes(first) && one.name.includes(second))
      expect(found, `exactly one group is named for ${first} and ${second}`).toHaveLength(1)
    }
  })

  it('gives no two of them the same name', () => {
    expect(new Set(named.map((one) => one.name)).size, 'three rows a reader cannot tell apart').toBe(3)
  })
})

describe('the record page names every group a claim is in', () => {
  it('draws three claims, all in conflict, and two group names under each', async () => {
    await page.goto(`${app.site}/#/r/${theModule}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.claims-row', { timeout: 30_000 })
    const drawn = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('.claims-row')].map((one) => one.getAttribute('data-conflict')),
      conflict: [...document.querySelectorAll('.claims-conflict')].map((one) => (one as HTMLElement).innerText),
    }))
    expect(drawn.rows).toHaveLength(3)
    expect(drawn.rows.every((one) => one === 'yes')).toBe(true)
    expect(drawn.conflict).toHaveLength(3)
    for (const line of drawn.conflict) {
      // THE COUNT IS THE ONE ON THE PAGE. Three agents holding live claims on one record is three
      // agents, and *two agents* there would be a false sentence.
      expect(line, 'the line says how many agents are on it').toContain(
        '3 agents are working on this at the same time.',
      )
      expect(line, 'a claim in two conflicts is in two groups').toContain('They are sorting it out in the groups ')
    }
    for (const group of named) {
      const naming = drawn.conflict.filter((line) => line.includes(group.name))
      expect(naming, `the two claims in the group "${group.name}" both name it`).toHaveLength(2)
    }
  }, 120_000)
})

// THE CLAIMS PAGE, one press from Home's Agents at work. The approved Home drew the claims
// inside Agents at work; another decision moved them to a page of their own in wave 13w round
// 21. The same three rows and the same two names under each are looked for there.
describe('the claims page names every group a claim is in', () => {
  it('draws the same three rows with the same two names under each', async () => {
    await page.goto(`${app.site}/#/claims`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('[data-away-from-home="claims"] .hm-claim', { timeout: 30_000 })
    const drawn = await page.evaluate(() => {
      const section = document.querySelector('[data-away-from-home="claims"]')!
      return {
        rows: [...section.querySelectorAll('.hm-claim')].map((one) => one.getAttribute('data-conflict')),
        conflict: [...section.querySelectorAll('.hm-claim-conflict')].map((one) => (one as HTMLElement).innerText),
        colour: [...section.querySelectorAll('.hm-claim-conflict')].map((one) => getComputedStyle(one).color),
      }
    })
    expect(drawn.rows).toHaveLength(3)
    expect(drawn.rows.every((one) => one === 'yes')).toBe(true)
    for (const group of named) {
      expect(drawn.conflict.filter((line) => line.includes(group.name)), `the group "${group.name}"`).toHaveLength(2)
    }
    const ordinary = await page.evaluate(() => getComputedStyle(document.body).color)
    expect(drawn.colour[0], 'a conflict is drawn in the colour that means something').not.toBe(ordinary)
  }, 120_000)
})

describe('a record with a long title still opens a group', () => {
  it('keeps the name inside the limit rather than refusing the second claim', async () => {
    const title =
      'A module whose title is long enough on its own to fill a group name twice over, which is what a ' +
      'title written as a sentence does'
    const made = (await post('/api/records', { kind: 'module', title, data: {} }, AS_THE_OWNER)) as {
      record: { id: string }
    }
    const opened: string[] = []
    for (const handle of ['long-one', 'long-two']) {
      const run = await anAgentWithARun(handle, `Building agent ${handle}`, `${handle} on the long one`)
      const filed = (await post(
        '/api/claims',
        { run, things: [{ what: 'record', id: made.record.id }] },
        asAgent(handle),
      )) as { groupsOpened: string[] }
      opened.push(...filed.groupsOpened)
    }
    expect(opened, 'the second claim on a long title must open its group like any other').toHaveLength(1)
    const all = await theGroups()
    const group = all.find((one) => one.id === opened[0])
    expect(group?.name.length ?? 0).toBeLessThanOrEqual(GROUP_NAME_MAX)
    expect(group?.name, 'both claimants survive, because they are what tells one group from another').toContain(
      'long-one',
    )
    expect(group?.name).toContain('long-two')
    expect(group?.name, 'what was cut says it was cut').toContain('…')
  }, 120_000)
})
