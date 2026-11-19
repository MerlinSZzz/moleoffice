// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE ADDS A ROW WITH ITS NATIVE FIELDS, IN A REAL BROWSER AGAINST A THROWAWAY OFFICE.
 *
 * A native field is the model, provider and variant the program itself is given, kept apart from the
 * office's model label. The add form under a role takes them beside the cells, so a new row does not
 * need a second write.
 *
 * Every row here is made-up data in this test's own office: the values are called sample-…, and each
 * comment says the test wrote it. No model is called.
 *
 * What this file holds:
 *   1. An add with a native model, provider and an empty variant stores exactly the three values,
 *      trimmed, with an empty variant stored as null, and the row's native line shows them.
 *   2. An add with all three native fields empty adds the row and stores no native fields.
 *   3. An add with a provider and an empty native model says the model is needed, sends nothing and
 *      adds no row.
 *   4. A native value the door refuses is drawn in the add form's own refusal box, and no row is added.
 *   5. The open add form with its native fields filled in is photographed at 1440, 990, 660 and 390 in
 *      light and dark, in English. Nothing scrolls sideways and every field and press is wholly in the
 *      viewport, measured from each element's own box and not from the window's width.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
/** The test's own pictures folder: under TEST_SHOTS when it names one, otherwise temporary and deleted. */
const SHOTS = testShots('casting-add-native')
const PAGE = '.cast'
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const ROLE = 'supervisor'

/** The test's made-up cell values. */
const ADDED = 'sample-office-model-added'
const NO_NATIVE = 'sample-office-model-no-native'
const UNNAMED = 'sample-office-model-unnamed'
const REFUSED = 'sample-office-model-refused'
const PICTURED = 'sample-office-model-pictured'

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function read(path: string): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { headers })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function open(address = '#/casting'): Promise<void> {
  await app.page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  // THE PAGE DRAWS ONE ROLE'S LIST AT A TIME, so the role's press opens it.
  await app.page.locator(`${PAGE} .cast-pick button[data-role="${ROLE}"]`).click()
  await app.page.waitForSelector(`${PAGE} section.cast-role[data-role="${ROLE}"] .cast-add`, { timeout: 30_000 })
}

const role = () => app.page.locator(`${PAGE} section.cast-role[data-role="${ROLE}"]`)
const form = () => role().locator('.cast-add .cast-form')
const row = (id: number) => app.page.locator(`${PAGE} tbody[data-casting="${String(id)}"]`)

/** The test's own rows of the supervisor role, read back from the door and never from the page. */
async function rowsOfTheRole(): Promise<Record<string, any>[]> {
  const reading = await read('/api/casting')
  const card = (reading['roles'] as Record<string, any>[]).find((one) => one['role'] === ROLE)
  return ((card?.['scopes'] as Record<string, any>[] | undefined) ?? []).flatMap(
    (scope) => scope['castings'] as Record<string, any>[],
  )
}

/** The row whose office model cell holds this value, or undefined when the door holds none. */
async function rowWithOfficeModel(value: string): Promise<Record<string, any> | undefined> {
  return (await rowsOfTheRole()).find((one) => one['cells']?.['model']?.['value'] === value)
}

async function openTheAddForm(address = '#/casting'): Promise<void> {
  await open(address)
  await role().getByRole('button', { name: en['casting.add'] }).click()
  await form().waitFor({ state: 'visible', timeout: 15_000 })
}

/** One cell of the add form, by the id the page gives it. */
const cell = (name: string) => form().locator(`#cast-add-${ROLE}-${name}`)

/** One of the add form's three native boxes, by the label a person reads. */
const nativeField = (label: string) => form().getByLabel(label)

const save = () => form().getByRole('button', { name: en['casting.save'] }).click()

beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-add-native', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Casting page adds a row with its native fields', () => {
  it('stores the three native fields trimmed, with an empty variant as null, and shows them on the new row', async () => {
    await openTheAddForm()
    await cell('model').fill(ADDED)
    await nativeField(enWave13n['casting.nativeModel']).fill('  sample-native-model-added  ')
    await nativeField(enWave13n['casting.nativeProvider']).fill('  sample-native-provider-added  ')
    await nativeField(enWave13n['casting.nativeVariant']).fill('   ')
    await save()

    // THE STORED ROW COMES FROM THE DOOR, not from the page the test just pressed.
    await expect.poll(async () => (await rowWithOfficeModel(ADDED))?.['native'] ?? 'the door holds no such row', {
      timeout: 30_000,
    }).toEqual({
      model: 'sample-native-model-added',
      provider: 'sample-native-provider-added',
      variant: null,
    })
    const added = await rowWithOfficeModel(ADDED)
    const id = Number(added?.['id'])
    await row(id).locator('.cast-native-selection').waitFor({ state: 'visible', timeout: 20_000 })
    const line = (await row(id).locator('.cast-native-selection').textContent()) ?? ''
    expect(line).toContain(`${enWave13n['casting.nativeModel']}: sample-native-model-added`)
    expect(line).toContain(`${enWave13n['casting.nativeProvider']}: sample-native-provider-added`)
    expect(line).not.toContain(`${enWave13n['casting.nativeVariant']}:`)
  }, 120_000)

  it('adds the row with no native fields when all three are empty', async () => {
    await openTheAddForm()
    // THE ADD FORM DRAWS THE THREE NATIVE BOXES, and all three are left empty.
    for (const label of [enWave13n['casting.nativeModel'], enWave13n['casting.nativeProvider'], enWave13n['casting.nativeVariant']]) {
      expect(await nativeField(label).count(), `the add form draws ${label}`).toBe(1)
      expect(await nativeField(label).inputValue(), `${label} starts empty`).toBe('')
    }
    await cell('model').fill(NO_NATIVE)
    await save()

    await expect.poll(async () => (await rowWithOfficeModel(NO_NATIVE))?.['id'] ?? null, { timeout: 30_000 }).not.toBeNull()
    const added = await rowWithOfficeModel(NO_NATIVE)
    expect(added?.['native'] ?? null).toBeNull()
    await row(Number(added?.['id'])).waitFor({ state: 'visible', timeout: 20_000 })
  }, 120_000)

  it('says the native model is needed and sends nothing when only a provider is given', async () => {
    await openTheAddForm()
    await cell('model').fill(UNNAMED)
    await nativeField(enWave13n['casting.nativeProvider']).fill('sample-native-provider-unsent')

    const sent: string[] = []
    const watch = (request: { method(): string; url(): string }) => {
      if (request.method() === 'POST' && request.url().includes(`/api/casting/${ROLE}`)) sent.push(request.url())
    }
    app.page.on('request', watch)
    try {
      await save()
      await form()
        .locator('.cast-said')
        .filter({ hasText: enWave13n['casting.nativeModelNeeded'] })
        .waitFor({ state: 'visible', timeout: 10_000 })
      expect(sent, 'an empty native model sent a write').toEqual([])
    } finally {
      app.page.off('request', watch)
    }
    expect(await rowWithOfficeModel(UNNAMED), 'a row with the unsent cell value was added').toBeUndefined()
  }, 120_000)

  it('draws the door’s refusal in the add form’s own refusal box and adds no row', async () => {
    await openTheAddForm()
    await cell('model').fill(REFUSED)
    // THE TEST DOES NOT COPY THE STORED LIMIT. 65,536 characters is far longer than any field limit,
    // so the door refuses it whatever its own limit is.
    await nativeField(enWave13n['casting.nativeModel']).fill('x'.repeat(65_536))
    await nativeField(enWave13n['casting.nativeProvider']).fill('sample-native-provider-refused')
    await nativeField(enWave13n['casting.nativeVariant']).fill('sample-native-variant-refused')
    await save()

    await form().locator('.cast-refuse').waitFor({ state: 'visible', timeout: 20_000 })
    const said = (await form().locator('.cast-refuse').textContent()) ?? ''
    expect(said.trim().length, 'the add form’s refusal box says something').toBeGreaterThan(0)
    expect(await rowWithOfficeModel(REFUSED), 'a row with the refused cell value was added').toBeUndefined()
  }, 120_000)

  it('photographs the open add form with native fields at four widths in both themes, with every field and press in view', async () => {
    await openTheAddForm('?lang=en#/casting')
    await cell('model').fill(PICTURED)
    await nativeField(enWave13n['casting.nativeModel']).fill('  sample-native-model-pictured  ')
    await nativeField(enWave13n['casting.nativeProvider']).fill('  sample-native-provider-pictured  ')
    await nativeField(enWave13n['casting.nativeVariant']).fill('  sample-native-variant-pictured  ')
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(sideways, `the page scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
        await form().waitFor({ state: 'visible', timeout: 15_000 })

        // EVERY FIELD AND PRESS IS MEASURED BY ITS OWN BOX, not by the window's width: a press can run
        // past the edge while the window's own reading says nothing is wrong.
        const addBox = await role().locator('.cast-add').boundingBox()
        if (addBox === null) throw new Error('the add form has no visible box')
        const viewportWidth = await app.page.evaluate(() => document.documentElement.clientWidth)
        const parts = role().locator('.cast-add input, .cast-add select, .cast-add textarea, .cast-add button')
        const count = await parts.count()
        expect(count, 'the open add form draws its fields and presses').toBeGreaterThan(0)
        for (let one = 0; one < count; one += 1) {
          const part = parts.nth(one)
          const name = (await part.getAttribute('id')) ?? (await part.textContent()) ?? `part ${String(one + 1)}`
          const box = await part.boundingBox()
          expect(box, `${name} has a box at ${String(width)} in ${theme}`).not.toBeNull()
          expect(box?.x, `${name} starts inside the viewport at ${String(width)} in ${theme}`).toBeGreaterThanOrEqual(0)
          expect(
            (box?.x ?? 0) + (box?.width ?? 0),
            `${name} ends inside the viewport at ${String(width)} in ${theme}`,
          ).toBeLessThanOrEqual(viewportWidth)
          expect(box?.x, `${name} starts inside the add form at ${String(width)} in ${theme}`).toBeGreaterThanOrEqual(addBox.x - 0.5)
          expect(
            (box?.x ?? 0) + (box?.width ?? 0),
            `${name} ends inside the add form at ${String(width)} in ${theme}`,
          ).toBeLessThanOrEqual(addBox.x + addBox.width + 0.5)
        }
        await app.page.screenshot({ path: `${SHOTS}/add-native-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
  }, 180_000)
})
