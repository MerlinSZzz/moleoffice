// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROFILE PAGE SHOWS HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED, AND A PERSON EDITS THEIR OWN.
 * This follows a decision. A second decision says the values are content and are never
 * translated.
 *
 * The field is declared once, in src/shared/address-as.ts. The door is
 * PUT /api/participants/:kind/:id/address-as. The page is src/web/pages/ProfilePage.tsx: the panel
 * `HowToAddress` on every profile, and the editor `YourAddressAs` in the panel of what a person may
 * change, on their own page only.
 *
 * WHAT IS PROVED HERE, in a real browser against an office of this test's own:
 *
 *   1. With no part set, the person's own page draws the four labels and the short word for "not
 *      set" under each, and the editor opens with four empty boxes.
 *   2. The person types four parts and saves. The server holds them as typed, and the page draws
 *      them as written.
 *   3. An empty box clears that part: the server no longer holds it and the page draws the short
 *      word for it again.
 *   4. A value the door refuses is refused with the door's own sentence, drawn on the page, and
 *      nothing is stored.
 *   5. An agent's page draws the parts the agent set as written, the short word for the ones it did
 *      not, and no editor.
 *
 * The values are made up. None is the owner's own.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   - draw a sentence for an empty part: in `HowToAddress`, `missing={PROFILE_WORDS.addressAsNotSet}`
 *     becomes `missing="Nobody has said how to address them."`. Cases 1, 3 and 5 go red.
 *   - draw the editor on an agent's page: in `TheProfile`, `yours` becomes
 *     `(kind === 'person' && actor.type === 'human' && actor.id === who.id) || kind === 'agent'`.
 *     Case 5 goes red.
 *
 * PICTURES. When ADDRESS_AS_SHOTS names a folder, the test photographs the page at 1440, 990, 660
 * and 390 wide, light and dark: the person's page with no part set, with the editor open, with all
 * four parts set, and the agent's page. The mutation runs leave it unset and take no picture.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readsAsASentence } from './sentences.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ADDRESS_AS_PARTS, ADDRESS_AS_PART_MAX_CHARACTERS } from '../src/shared/address-as.ts'
import { ADDRESS_PROFILE_WORDS as PROFILE_WORDS, ADDRESS_AS_PART_WORDS } from '../src/shared/words/en.ts'
import { whoPath } from '../src/web/components/router.tsx'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The agent this test registers, and the key it sets its own parts with. */
const AGENT_HANDLE = 'quill-of-tests'
let agentId = ''

/** Four made-up parts, one of them in a script other than English, to show a value is drawn as written. */
const FOUR_PARTS = { name: 'Rowan Ashby', secondPerson: 'thou', thirdPerson: 'xe', title: '总工程师' }

/** The parts the agent sets. Second person and title are left unset on purpose. */
const THE_AGENTS_PARTS = { name: 'Quill', thirdPerson: 'it' }

async function ask(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const response = await fetch(app.api + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: response.status, json, text }
}

/** How the server says the person wishes to be addressed right now. */
async function storedForThePerson(): Promise<Record<string, string>> {
  const read = await ask('GET', `/api/participants/person/${THE_PERSON}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return (read.json['participant'] as { addressAs: Record<string, string> }).addressAs
}

/** The label and value of each row of the panel, in the order drawn, and whether the row is marked empty. */
async function theRowsDrawn(): Promise<{ label: string; value: string; empty: string | null }[]> {
  await app.page.waitForSelector('.prof-address-as', { timeout: 20_000 })
  return app.page.$$eval('.prof-address-as .prof-fact', (rows) =>
    rows.map((row) => ({
      label: row.querySelector('.prof-label')?.textContent ?? '',
      value: row.querySelector('.prof-value')?.textContent ?? '',
      empty: row.querySelector('.prof-value')?.getAttribute('data-empty') ?? null,
    })),
  )
}

/**
 * Open the page afresh. A move to the same address with only a hash is not a new page load, so the
 * page is left first: without that, an editor left open by the case before would still be open.
 */
async function openThePage(kind: 'person' | 'agent', id: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#${whoPath(kind, id)}`)
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
}

async function photograph(name: string): Promise<void> {
  const dir = process.env['ADDRESS_AS_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const was = app.page.viewportSize()
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/${name}-${String(width)}-${theme}.png`, fullPage: true })
    }
  }
  if (was !== null) await app.page.setViewportSize(was)
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'address-as-page', viewport: { width: 1440, height: 1000 } })

  // A MADE-UP NAME FOR THE PERSON, so no picture carries the owner's own.
  const renamed = await ask('PATCH', `/api/participants/person/${THE_PERSON}`, AS_THE_PERSON, { name: 'Morgan Vale' })
  expect(renamed.status, renamed.text).toBe(200)

  // THE AGENT, registered by the person, which answers its own key once. The agent then sets its own
  // parts with that key, which is the only way an agent's are set.
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
    handle: AGENT_HANDLE,
    name: 'Quill of tests',
    role: 'worker',
  })
  expect(started.status, started.text).toBe(201)
  agentId = (started.json['agent'] as { id: string }).id
  const key = String((started.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  const set = await ask(
    'PUT',
    `/api/participants/agent/${agentId}/address-as`,
    {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': AGENT_HANDLE,
      'x-mole-office-key': key,
    },
    THE_AGENTS_PARTS,
  )
  expect(set.status, set.text).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a person’s own page shows how they wish to be addressed, and they edit it there', () => {
  it('with no part set, draws the four labels and the short word under each, and opens four empty boxes', async () => {
    // THE CONTROL: nothing is stored yet, so every mark on the page stands for nothing stored.
    expect(await storedForThePerson()).toEqual({})

    await openThePage('person', THE_PERSON)
    const rows = await theRowsDrawn()
    expect(rows.map((row) => row.label)).toEqual(ADDRESS_AS_PARTS.map((part) => ADDRESS_AS_PART_WORDS[part]))
    for (const row of rows) {
      expect(row.empty, `the ${row.label} row is not drawn as empty`).toBe('yes')
      expect(row.value, `the ${row.label} row draws something other than the short word`).toBe(PROFILE_WORDS.addressAsNotSet)
      expect(readsAsASentence(row.value), `the ${row.label} row draws a sentence for a part nobody set`).toBe(false)
    }
    await photograph('person-none-set')

    // THE EDITOR OPENS WITH EMPTY BOXES: nothing is put in a box the person did not write.
    await app.page.click(`button:has-text("${PROFILE_WORDS.changeAddressAs}")`)
    await app.page.waitForSelector('.prof-address-as-form', { timeout: 20_000 })
    for (const part of ADDRESS_AS_PARTS) {
      const value = await app.page.inputValue(`.prof-address-as-form input[name="${part}"]`)
      expect(value, `the ${part} box is filled in before anybody wrote in it`).toBe('')
    }
    await photograph('person-editor-open')
  }, 240_000)

  it('saves four typed parts through the door, and draws them as written', async () => {
    await openThePage('person', THE_PERSON)
    await app.page.click(`button:has-text("${PROFILE_WORDS.changeAddressAs}")`)
    await app.page.waitForSelector('.prof-address-as-form', { timeout: 20_000 })
    for (const part of ADDRESS_AS_PARTS) {
      await app.page.fill(`.prof-address-as-form input[name="${part}"]`, FOUR_PARTS[part])
    }
    await app.page.click(`.prof-address-as-form button:has-text("${PROFILE_WORDS.saveAddressAs}")`)

    // READ BACK FROM THE SERVER, not from the screen.
    await expect.poll(async () => storedForThePerson(), { timeout: 20_000 }).toEqual(FOUR_PARTS)

    await expect
      .poll(async () => (await theRowsDrawn()).map((row) => [row.value, row.empty]), { timeout: 20_000 })
      .toEqual(ADDRESS_AS_PARTS.map((part) => [FOUR_PARTS[part], 'no']))
    expect(await app.page.$('.prof-address-as-form'), 'the editor stayed open after a save').toBeNull()
    await photograph('person-all-set')
  }, 180_000)

  it('clears a part whose box is emptied, and draws the short word for it again', async () => {
    await openThePage('person', THE_PERSON)
    await app.page.click(`button:has-text("${PROFILE_WORDS.changeAddressAs}")`)
    await app.page.waitForSelector('.prof-address-as-form', { timeout: 20_000 })
    // The boxes open on what is stored.
    expect(await app.page.inputValue('.prof-address-as-form input[name="title"]')).toBe(FOUR_PARTS.title)
    await app.page.fill('.prof-address-as-form input[name="title"]', '')
    await app.page.click(`.prof-address-as-form button:has-text("${PROFILE_WORDS.saveAddressAs}")`)

    const { title: _cleared, ...theRest } = FOUR_PARTS
    await expect.poll(async () => storedForThePerson(), { timeout: 20_000 }).toEqual(theRest)
    await expect
      .poll(async () => (await theRowsDrawn()).find((row) => row.label === ADDRESS_AS_PART_WORDS.title), { timeout: 20_000 })
      .toEqual({ label: ADDRESS_AS_PART_WORDS.title, value: PROFILE_WORDS.addressAsNotSet, empty: 'yes' })
  }, 180_000)

  it('shows the door’s own sentence when the door refuses, and nothing is stored', async () => {
    const before = await storedForThePerson()
    const tooLong = 'x'.repeat(ADDRESS_AS_PART_MAX_CHARACTERS + 1)

    // WHAT THE DOOR SAYS to this same body, asked directly. The page must draw these words, not its own.
    const direct = await ask('PUT', `/api/participants/person/${THE_PERSON}/address-as`, AS_THE_PERSON, {
      ...before,
      name: tooLong,
    })
    expect(direct.status, direct.text).toBe(400)
    const doorSays = String(direct.json['error'])
    expect(doorSays.length, 'the door gave no sentence').toBeGreaterThan(0)

    await openThePage('person', THE_PERSON)
    await app.page.click(`button:has-text("${PROFILE_WORDS.changeAddressAs}")`)
    await app.page.waitForSelector('.prof-address-as-form', { timeout: 20_000 })
    await app.page.fill('.prof-address-as-form input[name="name"]', tooLong)
    await app.page.click(`.prof-address-as-form button:has-text("${PROFILE_WORDS.saveAddressAs}")`)

    // The card draws a refusal through ErrorNote since wave 13k round 12 (a coded refusal in the page's
    // language). This refusal has no code, so the door's own sentence is what ErrorNote draws.
    const fault = await app.page.waitForSelector('.prof-address-as-failure .px-error-msg', { timeout: 20_000 })
    expect(await fault.textContent()).toContain(doorSays)
    expect(await storedForThePerson(), 'a refused save changed what is stored').toEqual(before)
  }, 180_000)
})

describe('an agent’s page shows how it wishes to be addressed, and draws no editor', () => {
  it('draws the parts it set as written, the short word for the others, and no editor', async () => {
    await openThePage('agent', agentId)
    const rows = await theRowsDrawn()
    expect(rows.map((row) => row.label)).toEqual(ADDRESS_AS_PARTS.map((part) => ADDRESS_AS_PART_WORDS[part]))
    const setByTheAgent: Record<string, string | undefined> = THE_AGENTS_PARTS
    for (const [at, part] of ADDRESS_AS_PARTS.entries()) {
      const wanted = setByTheAgent[part]
      const row = rows[at]!
      if (wanted === undefined) {
        expect(row.value, `the agent's ${part} row draws something other than the short word`).toBe(
          PROFILE_WORDS.addressAsNotSet,
        )
        expect(row.empty).toBe('yes')
      } else {
        expect(row.value).toBe(wanted)
        expect(row.empty).toBe('no')
      }
    }
    expect(await app.page.$('.prof-address-as-edit'), 'an agent’s page draws the editor').toBeNull()
    expect(await app.page.$(`button:has-text("${PROFILE_WORDS.changeAddressAs}")`)).toBeNull()
    await photograph('agent-some-set')
  }, 180_000)
})
