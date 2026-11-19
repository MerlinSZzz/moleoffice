// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE CHANGES AND CLEARS A ROW'S NATIVE FIELDS AND ITS HOLD, IN A REAL BROWSER AGAINST A
 * THROWAWAY OFFICE.
 *
 * A native field is the model, provider and variant the program itself is given, kept apart from the
 * office's model label. A row can be held after the program refused its native selection. The page draws
 * both in the line under the row; these cases prove the page now offers the controls that change them.
 *
 * Every row here is made-up data in this test's own office: the models, providers and variants are
 * called sample-…, and the reasons say the test wrote them. No model is called.
 *
 * What this file holds:
 *   1. Save on a row with no native fields stores exactly the three values, trimmed, with an empty
 *      variant stored as null, and the row's native line shows them.
 *   2. Save with an empty native model sends nothing, changes nothing and says so.
 *   3. Clear the native fields is drawn only on a row that has them, and after the press the stored
 *      native is null and the native line is gone.
 *   4. Clear the hold is drawn only on a held row, and after the press the stored hold is null, the held
 *      line is gone, and the native fields stay.
 *   5. A refused write is drawn under the row in the page's words and nothing is stored.
 *   6. The open form on a row with native fields and a hold is photographed at 1440, 990, 660 and 390 in
 *      light and dark, in English, with no sideways scrolling of the page at any width.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
/** The test's own pictures folder: under TEST_SHOTS when it names one, otherwise temporary and deleted. */
const SHOTS = testShots('casting-native-fields')
const PAGE = '.cast'
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const

/** The test's made-up rows. */
let saving = 0
let emptyModel = 0
let clearing = 0
let held = 0
let refused = 0
let pictured = 0

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
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
  await app.page.waitForSelector(`${PAGE} .cast-table`, { timeout: 30_000 })
}

const row = (id: number) => app.page.locator(`${PAGE} tbody[data-casting="${String(id)}"]`)
const field = (id: number, label: string) => row(id).getByLabel(label)

/** The row as the door stores it, read back from GET /api/casting and never from the page. */
async function storedRow(id: number): Promise<Record<string, any>> {
  const reading = await read('/api/casting')
  for (const card of reading['roles'] as Record<string, any>[]) {
    for (const scope of card['scopes'] as Record<string, any>[]) {
      for (const casting of scope['castings'] as Record<string, any>[]) {
        if (casting['id'] === id) return casting
      }
    }
  }
  throw new Error(`The test's own office holds no casting row ${String(id)}.`)
}

async function openNative(id: number): Promise<void> {
  await row(id).getByRole('button', { name: enWave13n['casting.native'] }).click()
  await row(id).locator('.cast-form').waitFor({ state: 'visible', timeout: 15_000 })
}

async function closeNative(id: number): Promise<void> {
  await row(id).getByRole('button', { name: en['casting.cancel'] }).click()
}

/** One made-up native tuple. */
function nativeOf(word: string): { model: string; provider: string; variant: string } {
  return { model: `sample-native-${word}`, provider: `sample-native-provider-${word}`, variant: `sample-native-variant-${word}` }
}

/** Hold one row after a made-up native refusal, through the door the page writes through. */
async function hold(id: number): Promise<void> {
  const selected = (await read(`/api/casting/rows/${String(id)}/selection`))['selection'] as Record<string, any>
  const started = await post('/api/records', {
    kind: 'session',
    title: `Made-up native refusal for casting ${String(id)}`,
    data: { state: 'running', runtime: 'opencode', model: selected['model'], extra: { launcherSelection: selected } },
  })
  await post(`/api/casting/rows/${String(id)}/hold`, {
    revision: selected['casting'].revision,
    run: started['record'].id,
    refusal: { kind: 'option', code: 'invalid_option', said: 'Synthetic native program refused this selected option.' },
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-native-fields', viewport: { width: 1440, height: 1000 } })
  const add = async (body: Record<string, unknown>): Promise<number> => (await post('/api/casting/worker', body))['casting'].id as number
  const reason = "The test's own made-up casting."

  saving = await add({ program: { value: 'dsh' }, model: { value: 'sample-office-label-saving' }, why: { value: reason } })
  emptyModel = await add({ program: { value: 'dsh' }, model: { value: 'sample-office-label-empty-model' }, why: { value: reason } })
  clearing = await add({ program: { value: 'opencode' }, model: { value: 'sample-office-label-clearing' }, why: { value: reason }, native: nativeOf('clearing') })
  refused = await add({ program: { value: 'dsh' }, model: { value: 'sample-office-label-refused' }, why: { value: reason } })
  held = await add({ program: { value: 'opencode' }, model: { value: 'sample-office-label-held' }, effort: { value: 'sample-effort-held' }, why: { value: reason }, native: nativeOf('held') })
  pictured = await add({ program: { value: 'opencode' }, model: { value: 'sample-office-label-pictured' }, effort: { value: 'sample-effort-pictured' }, why: { value: reason }, native: nativeOf('pictured') })
  await hold(held)
  await hold(pictured)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Casting page changes and clears a row’s native fields and its hold', () => {
  it('saves the three native fields, trimmed, with an empty variant stored as null', async () => {
    await open()
    await openNative(saving)
    await field(saving, enWave13n['casting.nativeModel']).fill('  sample-native-model-saved  ')
    await field(saving, enWave13n['casting.nativeProvider']).fill('  sample-native-provider-saved  ')
    await field(saving, enWave13n['casting.nativeVariant']).fill('   ')
    await row(saving).getByRole('button', { name: en['casting.save'] }).click()

    await expect.poll(async () => (await storedRow(saving))['native'], { timeout: 30_000 }).toEqual({
      model: 'sample-native-model-saved',
      provider: 'sample-native-provider-saved',
      variant: null,
    })
    await app.page.waitForFunction(
      (id) => {
        const line = document.querySelector(`tbody[data-casting="${id}"] .cast-native-selection`)?.textContent ?? ''
        return line.includes('sample-native-model-saved') && line.includes('sample-native-provider-saved')
      },
      String(saving),
      { timeout: 20_000 },
    )
    const line = (await row(saving).locator('.cast-native-selection').textContent()) ?? ''
    expect(line).toContain(`${enWave13n['casting.nativeModel']}: sample-native-model-saved`)
    expect(line).toContain(`${enWave13n['casting.nativeProvider']}: sample-native-provider-saved`)
    expect(line).not.toContain(`${enWave13n['casting.nativeVariant']}:`)
  }, 120_000)

  it('says so and sends nothing when the native model is empty', async () => {
    await open()
    await openNative(emptyModel)
    await field(emptyModel, enWave13n['casting.nativeModel']).fill('   ')
    await field(emptyModel, enWave13n['casting.nativeProvider']).fill('sample-native-provider-unsent')
    await field(emptyModel, enWave13n['casting.nativeVariant']).fill('sample-native-variant-unsent')

    const sent: string[] = []
    const watch = (request: { method(): string; url(): string }) => {
      if (request.method() === 'PATCH' && request.url().includes('/api/casting/rows/')) sent.push(request.url())
    }
    app.page.on('request', watch)
    try {
      await row(emptyModel).getByRole('button', { name: en['casting.save'] }).click()
      await row(emptyModel)
        .locator('.cast-said')
        .filter({ hasText: enWave13n['casting.nativeModelNeeded'] })
        .waitFor({ state: 'visible', timeout: 10_000 })
      expect(sent, 'an empty native model sent a write').toEqual([])
    } finally {
      app.page.off('request', watch)
    }
    // A row that never carried native fields has no native key; both readings mean no native selection.
    expect((await storedRow(emptyModel))['native'] ?? null).toBeNull()
  }, 120_000)

  it('draws Clear the native fields only where the row has them, and clears them', async () => {
    await open()
    await openNative(clearing)
    expect(await row(clearing).getByRole('button', { name: enWave13n['casting.nativeClear'] }).count()).toBe(1)
    await closeNative(clearing)

    await openNative(refused)
    expect(await row(refused).getByRole('button', { name: enWave13n['casting.nativeClear'] }).count()).toBe(0)
    await closeNative(refused)

    await openNative(clearing)
    await row(clearing).getByRole('button', { name: enWave13n['casting.nativeClear'] }).click()
    await expect.poll(async () => (await storedRow(clearing))['native'], { timeout: 30_000 }).toBeNull()
    await app.page.waitForFunction(
      (id) => document.querySelector(`tbody[data-casting="${id}"] .cast-native-selection`) === null,
      String(clearing),
      { timeout: 20_000 },
    )
  }, 120_000)

  it('draws Clear the hold only on a held row, lifts it, and keeps the native fields', async () => {
    await open()
    const native = (await storedRow(held))['native']
    expect(native).not.toBeNull()

    await openNative(held)
    expect(await row(held).getByRole('button', { name: enWave13n['casting.nativeClearHold'] }).count()).toBe(1)
    await closeNative(held)

    await openNative(clearing)
    expect(await row(clearing).getByRole('button', { name: enWave13n['casting.nativeClearHold'] }).count()).toBe(0)
    await closeNative(clearing)

    await openNative(held)
    await row(held).getByRole('button', { name: enWave13n['casting.nativeClearHold'] }).click()
    await expect.poll(async () => (await storedRow(held))['hold'], { timeout: 30_000 }).toBeNull()
    await app.page.waitForFunction(
      ({ id, heldWord }) => {
        const line = document.querySelector(`tbody[data-casting="${id}"] .cast-native-selection`)?.textContent ?? ''
        return !line.includes(heldWord) && line.includes('sample-native-held')
      },
      { id: String(held), heldWord: enWave13n['casting.nativeHeld'] },
      { timeout: 20_000 },
    )
    expect((await storedRow(held))['native']).toEqual(native)
  }, 120_000)

  it('draws a refused write under the row in the page’s words and stores nothing', async () => {
    await open()
    await openNative(refused)
    await field(refused, enWave13n['casting.nativeModel']).fill('x'.repeat(65_536))
    await field(refused, enWave13n['casting.nativeProvider']).fill('sample-native-provider-refused')
    await field(refused, enWave13n['casting.nativeVariant']).fill('sample-native-variant-refused')
    await row(refused).getByRole('button', { name: en['casting.save'] }).click()

    await row(refused).locator('.cast-refuse').waitFor({ state: 'visible', timeout: 20_000 })
    const said = (await row(refused).locator('.cast-refuse').textContent()) ?? ''
    // THE TEST DOES NOT COPY THE STORED LIMIT. 65,536 characters is far longer than any field limit,
    // so the door refuses it whether the limit is 4,096 or something else it declares.
    expect(said.trim().length, 'the refusal box says something').toBeGreaterThan(0)
    expect((await storedRow(refused))['native'] ?? null).toBeNull()
  }, 120_000)

  it('photographs the open form at four widths in both themes, with nothing scrolling sideways', async () => {
    await open('?lang=en#/casting')
    await openNative(pictured)
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(sideways, `the page scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
        await row(pictured).locator('.cast-form').waitFor({ state: 'visible', timeout: 15_000 })
        // EVERY PRESS IN THE OPEN FORM IS WHOLLY IN THE VIEWPORT, not merely on the page.
        const viewportWidth = await app.page.evaluate(() => document.documentElement.clientWidth)
        const presses = row(pictured).locator('.cast-form-presses .px-btn')
        const tableBox = await app.page.locator('.cast-scroll').first().boundingBox()
        if (tableBox === null) throw new Error('the Casting table has no visible box')
        expect(await presses.count(), 'the open form draws its three presses').toBe(3)
        for (let one = 0; one < 3; one += 1) {
          const box = await presses.nth(one).boundingBox()
          expect(box, `press ${String(one + 1)} has a box at ${String(width)} in ${theme}`).not.toBeNull()
          expect(box?.x, `press ${String(one + 1)} starts inside the viewport at ${String(width)} in ${theme}`).toBeGreaterThanOrEqual(0)
          expect(
            (box?.x ?? 0) + (box?.width ?? 0),
            `press ${String(one + 1)} ends inside the viewport at ${String(width)} in ${theme}`,
          ).toBeLessThanOrEqual(viewportWidth)
          expect(box?.x, `press ${String(one + 1)} starts inside the table's visible box at ${String(width)} in ${theme}`).toBeGreaterThanOrEqual(tableBox.x)
          expect(
            (box?.x ?? 0) + (box?.width ?? 0),
            `press ${String(one + 1)} ends inside the table's visible box at ${String(width)} in ${theme}`,
          ).toBeLessThanOrEqual(tableBox.x + tableBox.width)
        }
        await app.page.screenshot({ path: `${SHOTS}/native-form-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
  }, 180_000)
})
