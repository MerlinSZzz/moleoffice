// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GOAL IS CONFIRMED ON ITS OWN PAGE, IN A REAL BROWSER. The confirm press is also drawn on the
 * goal's own page, where a lead to the goal opens. A lead
 * opened the goal's record page, and the press was drawn only on the Goals page, so the page
 * the lead opened had no press.
 *
 * WHAT THIS FILE PROVES, on the record page of each goal:
 *   1. an agent's goal nobody has confirmed says who filed it and that the person has not confirmed it, with the
 *      press; pressing it writes the person's confirmation in the goal's own project, and the page then says who
 *      confirmed it and when, with no press;
 *   2. a goal a secretary confirmed on the owner's decision says who pressed, on whose word, and leads to the
 *      decision;
 *   3. a goal the person filed draws no such panel, because it never waited for anybody;
 *   4. the mark names the filer, the presser and the person from the page's short list of people and agents,
 *      GET /api/participants?shape=page. Wave 13y round 27 cut what the pages read to that list's 24 fields, and
 *      the mark reads only an id, a handle and a name, so it needs no whole read (line round 51, the fix for merge
 *      entry tDT9ocilIB3_'s bounce).
 * With TEST_SHOTS set, it photographs the first two pages at four widths in both looks, in English.
 *
 * MUTATIONS, each red here after a green control run:
 *   1. RecordPage.tsx, KindLead: drop the `goal` case. Tests 1 and 2 find no panel.
 *   2. RecordPage.tsx, the goal panel: leave out `onChanged` after the press. Test 1 waits in vain for the line
 *      that says who confirmed it.
 *   3. RecordPage.tsx, the goal panel: read a secretary's confirmation as the person's own press. Test 2 names
 *      no secretary and no decision.
 *   4. RecordPage.tsx, the goal panel: draw it on a goal with no `filed_by`. Test 3 finds a panel.
 *   5. RecordPage.tsx, the goal panel: read the whole door, `api.participants()`, in place of the page's short
 *      list. Test 4 finds the names as the registry holds them, not as the short list was answered.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'

const HERE = 'default'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let app: LiveApp
const shots = testShots('a-goal-is-confirmed-on-its-own-page')

let waiting = ''
let confirmedForThem = ''
let theirs = ''
let decision = ''
let thePersonsName = ''

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function call<T>(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as T
}

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  return (await call<{ record: { id: string } }>('POST', '/api/records', headers, { kind, title, data })).record.id
}

function aGoal(headers: Record<string, string>, title: string): Promise<string> {
  return file(headers, 'goal', title, { horizon: 'medium', what: `${title}, and anybody can check it.`, owner: THE_PERSON, state: 'open' })
}

async function open(id: string, width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: width < 700 ? 900 : 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#${recordPath(id)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('h1.rp-title').waitFor({ timeout: 30_000 })
}

async function thePanelSays(): Promise<string> {
  const panel = app.page.locator('.goal-mark')
  await panel.waitFor({ state: 'visible', timeout: 30_000 })
  return (await panel.locator('.goal-mark-said').innerText()).trim()
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-goal-is-confirmed-on-its-own-page', viewport: { width: 1440, height: 1000 }, workspace: HERE })
  await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  await call('POST', '/api/agents/started', asAgent('quill'), { handle: 'kiln-keeper', name: 'Kiln Keeper', role: 'worker', workArea: ['src'] })
  const people = await call<{ people: { id: string; name: string }[] }>('GET', '/api/participants', AS_THE_PERSON)
  thePersonsName = people.people.find((one) => one.id === THE_PERSON)!.name

  waiting = await aGoal(asAgent('kiln-keeper'), 'Every kiln shelf is checked before a firing')
  confirmedForThem = await aGoal(asAgent('kiln-keeper'), 'Every glaze bucket is labelled')
  theirs = await aGoal(AS_THE_PERSON, 'The studio floor is swept each evening')

  // THE OWNER'S DECISION, written down by the secretary from the owner's words filed as the owner's own note.
  const prepared = await file(asAgent('quill'), 'note', 'What the owner said about the glaze buckets', {
    body: 'Yes, that is the goal, said the owner on 12 October.',
    for_the_person_to_file: true,
  })
  const words = (await call<{ note: { id: string } }>('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)).note.id
  decision = await file(asAgent('quill'), 'decision', 'The glaze bucket goal is the owner’s', {
    ...governsTheWholeProject(), replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    authority_reference: words,
    option_taken: `Goal ${confirmedForThem} stands as written.`,
    because: 'The owner said so on 12 October.',
  })
  await call('PATCH', `/api/records/${confirmedForThem}`, asAgent('quill'), {
    dataPatch: { confirmed_by: { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${decision}` } },
  })

  // THE PAGE READS AS THE PERSON, in the look the address names.
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a goal is confirmed on its own page', () => {
  it('draws the mark and the press on an agent’s goal, and the press confirms it in its own project', async () => {
    await open(waiting)
    expect(await thePanelSays()).toBe('Filed by Kiln Keeper. You have not confirmed this goal yet.')
    const press = app.page.locator('.goal-mark').getByRole('button', { name: 'Confirm this goal' })
    expect(await press.count()).toBe(1)

    await press.click()
    await app.page.waitForFunction(() => (document.querySelector('.goal-mark .goal-mark-said')?.textContent ?? '').includes('Confirmed by'), undefined, {
      timeout: 30_000,
    })
    const today = (await call<{ day: string }>('GET', '/api/planning/today', AS_THE_PERSON)).day
    expect(await thePanelSays()).toBe(`Filed by Kiln Keeper. Confirmed by ${thePersonsName} on ${today}.`)
    expect(await app.page.locator('.goal-mark').getByRole('button', { name: 'Confirm this goal' }).count()).toBe(0)

    const stored = await call<{ record: { workspaceId: string; data: { confirmed_by?: unknown } } }>('GET', `/api/records/${waiting}`, AS_THE_PERSON)
    expect(stored.record.workspaceId).toBe(HERE)
    expect(stored.record.data.confirmed_by).toEqual({ by: THE_PERSON, at: today })
  }, 120_000)

  it('says who pressed, on whose word, and leads to the decision, on a goal a secretary confirmed', async () => {
    await open(confirmedForThem)
    expect(await thePanelSays()).toBe(`Filed by Kiln Keeper. Confirmed on 2026-10-12 by Quill, on the word of ${thePersonsName}.`)
    const lead = app.page.locator('.goal-mark a.goal-mark-evidence')
    expect(await lead.innerText()).toBe('The decision that says so')
    expect(await lead.getAttribute('href')).toBe(`#${recordPath(decision)}`)
    expect(await app.page.locator('.goal-mark').getByRole('button', { name: 'Confirm this goal' }).count()).toBe(0)
  }, 120_000)

  it('draws no such panel on a goal the person filed', async () => {
    await open(theirs)
    await app.page.locator('.rp-title').waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.goal-mark').count()).toBe(0)
  }, 120_000)

  it('names the filer, the presser and the person from the page’s short list of people and agents', async () => {
    // THE SHORT LIST IS ANSWERED WITH EVERY NAME CHANGED, so the sentence carries the changed names only when the mark
    // reads that list, and the registry's own names when it reads anything else.
    const theShortList = /\/api\/participants\?shape=page$/
    const changed = (name: string): string => `${name} on the short list`
    await app.page.route(theShortList, async (route) => {
      const response = await route.fetch()
      const said = (await response.json()) as { people: { name: string }[]; agents: { name: string }[] }
      for (const one of [...said.people, ...said.agents]) one.name = changed(one.name)
      await route.fulfill({ response, json: said })
    })
    try {
      await open(confirmedForThem)
      expect(await thePanelSays()).toBe(
        `Filed by ${changed('Kiln Keeper')}. Confirmed on 2026-10-12 by ${changed('Quill')}, on the word of ${changed(thePersonsName)}.`,
      )
    } finally {
      await app.page.unroute(theShortList)
    }
  }, 120_000)

  it('photographs both pages at four widths in both looks, when TEST_SHOTS names a folder', async () => {
    if ((process.env[TEST_SHOTS] ?? '') === '') return
    const another = await aGoal(asAgent('kiln-keeper'), 'Every kiln log is kept for a year')
    for (const [name, id] of [['waiting', another], ['for-them', confirmedForThem]] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const look of ['light', 'dark']) {
          await open(id, width, look)
          await thePanelSays()
          const wide = await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
          expect(wide, `the page scrolls sideways at ${String(width)} ${look} ${name}`).toBe(true)
          await app.page.screenshot({ path: join(shots, `goal-${name}-${String(width)}-${look}-en.png`), fullPage: true })
        }
      }
    }
  }, 600_000)
})
