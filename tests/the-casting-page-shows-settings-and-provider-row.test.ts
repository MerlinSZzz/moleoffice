// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE SHOWS A ROW'S OWN SETTINGS AND THE PROVIDER ROW IT NAMES, IN A REAL BROWSER.
 *
 * A Casting row's native fields hold the settings its program is given and the id of a provider-table row it
 * names. The Casting doors answer both; this file proves the page draws them, offers the providers the provider
 * door answers in the form, clears a provider row, and draws the Casting door's refusal when the row's program or
 * role cannot name one.
 *
 * Every row, provider and value here is made-up data in this test's own office. The providers name key entries the
 * test's key file does not hold, so each row says "not set"; no key's value is read or written. No model is called.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import type { ProviderRow } from '../src/shared/the-provider-table.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

let app: LiveApp
const PAGE = '.cast'
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('casting-settings-provider')

/** One provider the test added, as the provider door answered it. */
let firstProvider: ProviderRow
let secondProvider: ProviderRow
let thirdProvider: ProviderRow
/** Inspector rows: one shown with settings and a provider, one cleared, one that gains a provider. */
let shown = 0
let cleared = 0
let chosen = 0
/** Inspector rows that name a provider with a set key, one the page is told is missing, and one with none. */
let setKey = 0
let missing = 0
let unread = 0
/** A worker row whose program cannot name the provider. */
let refused = 0

const personHeaders = () => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  ...thePersonsKeyHeader(`${app.dir}/keys.json`),
})

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: personHeaders(), body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function read(path: string): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { headers: personHeaders() })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function addProvider(id: string, name: string, keyName: string): Promise<ProviderRow> {
  const added = await post('/api/casting/providers', { id, name, programs: ['dsh'], baseAddress: `https://${id}.example/v1`, keyName })
  return added['provider'] as ProviderRow
}

/** Opens the page on one role's list: the page draws one at a time, and most rows here are the inspector's. */
async function open(address = '#/casting', role = 'inspector'): Promise<void> {
  await app.page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.locator(`${PAGE} .cast-pick button[data-role="${role}"]`).click()
  await app.page.waitForSelector(`${PAGE} section.cast-role[data-role="${role}"] .cast-table`, { timeout: 30_000 })
}

const row = (id: number) => app.page.locator(`${PAGE} tbody[data-casting="${String(id)}"]`)

/** The row as the Casting door stores it, read back from GET /api/casting and never from the page. */
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

const providerChoice = (id: number) => row(id).getByLabel(enWave13n['casting.providerRowChoice'])
const save = (id: number) => row(id).getByRole('button', { name: en['casting.save'] }).click()

beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-page-settings-provider', viewport: { width: 1440, height: 1000 } })
  // A made-up value in this test office's own key file, so one provider answers set and the others not set.
  const keys = JSON.parse(readFileSync(`${app.dir}/keys.json`, 'utf8')) as { providers: Record<string, string> }
  keys.providers['sample-key-set'] = 'made-up-provider-key-this-test-wrote'
  writeFileSync(`${app.dir}/keys.json`, JSON.stringify(keys))
  firstProvider = await addProvider('sample-provider-first', 'Sample provider first', 'sample-key-first')
  secondProvider = await addProvider('sample-provider-second', 'Sample provider second', 'sample-key-set')
  thirdProvider = await addProvider('sample-provider-third', 'Sample provider third', 'sample-key-third')
  expect(firstProvider.key).toBe('not set')
  expect(secondProvider.key).toBe('set')
  expect(thirdProvider.key).toBe('not set')

  const add = async (role: string, body: Record<string, unknown>): Promise<number> => (await post(`/api/casting/${role}`, body))['casting'].id as number
  const native = (word: string, providerRow?: string) => ({
    model: `sample-native-model-${word}`,
    provider: `sample-native-provider-${word}`,
    variant: null,
    ...(providerRow === undefined ? {} : { providerRow }),
  })

  shown = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-shown' },
    effort: { value: 'sample-effort-shown' },
    native: { ...native('shown', firstProvider.id), settings: [{ name: 'bash-sandbox.timeoutMs', value: 600000 }] },
  })
  cleared = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-cleared' },
    native: { ...native('cleared', firstProvider.id), settings: [{ name: 'bash-sandbox.timeoutMs', value: 900000 }] },
  })
  chosen = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-chosen' },
    native: native('chosen'),
  })
  setKey = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-set-key' },
    native: native('set-key', secondProvider.id),
  })
  missing = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-missing' },
    native: native('missing', thirdProvider.id),
  })
  unread = await add('inspector', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-unread' },
    native: native('unread'),
  })
  refused = await add('worker', {
    program: { value: 'dsh' },
    model: { value: 'sample-office-model-refused' },
    native: native('refused'),
  })

  // A ROW THE PAGE NAMES BUT THE PROVIDER TABLE NO LONGER HOLDS: the door refuses a removal while a Casting row
  // names the row, so this test office writes its own database to stand for a row removed out of band.
  const database = new DatabaseSync(`${app.dir}/panelx.db`)
  database.prepare('DELETE FROM providers WHERE id = ?').run(thirdProvider.id)
  database.close()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Casting page shows a row’s settings and its provider row', () => {
  it('draws the settings the Casting door answers, and the provider by its id and name with the key entry’s word', async () => {
    await open()
    const stored = await storedRow(shown)
    const setting = (stored['native'] as Record<string, any>)['settings'][0] as { name: string; value: unknown }
    const providers = (await read('/api/casting/providers'))['providers'] as ProviderRow[]
    const provider = providers.find((one) => one.id === firstProvider.id)
    expect(provider, 'the provider door answers the row').not.toBeUndefined()

    await expect
      .poll(async () => (await row(shown).locator('.cast-native-selection').textContent()) ?? '', { timeout: 20_000 })
      .toContain(`${enWave13n['casting.nativeSettings']}: ${setting.name} = ${JSON.stringify(setting.value)}`)
    const line = (await row(shown).locator('.cast-native-selection').textContent()) ?? ''
    expect(line).toContain(`${enWave13n['casting.nativeProviderRow']}: ${firstProvider.id}`)
    expect(line).toContain(provider?.name ?? 'the provider door named no name')
    expect(provider?.key, 'the provider door says the key entry is not set').toBe('not set')
    expect(line).toContain(
      `${enWave13n['casting.providerKey']}: ${createI18n('en').t(provider?.key === 'set' ? 'casting.providerKeySet' : 'casting.providerKeyNotSet')}`,
    )

    // BOTH STATES ARE SHOWN THROUGH THE PAGE'S OWN WORDS, so a set key is not silence.
    const setLine = (await row(setKey).locator('.cast-native-selection').textContent()) ?? ''
    expect(secondProvider.key, 'the provider door says the second key entry is set').toBe('set')
    expect(setLine).toContain(`${enWave13n['casting.providerKey']}: ${createI18n('en').t('casting.providerKeySet')}`)
    expect(setLine).not.toContain(createI18n('en').t('casting.providerKeyNotSet'))
  }, 120_000)

  it('offers the providers the provider door answers, and clears a provider row', async () => {
    await open()
    const providers = (await read('/api/casting/providers'))['providers'] as ProviderRow[]
    await openNative(cleared)
    const select = providerChoice(cleared)
    expect(await select.inputValue(), 'the form starts on the row’s provider').toBe(firstProvider.id)
    for (const provider of providers) {
      expect(await select.locator(`option[value="${provider.id}"]`).count(), `the form offers ${provider.id}`).toBe(1)
    }
    expect(await select.locator('option[value=""]').count(), 'the form offers a way to clear the provider row').toBe(1)

    await select.selectOption('')
    await save(cleared)
    await expect.poll(async () => (await storedRow(cleared))['native']?.['providerRow'] ?? null, { timeout: 30_000 }).toBeNull()
    await expect.poll(async () => (await row(cleared).locator('.cast-native-selection').textContent()) ?? '', { timeout: 20_000 }).not.toContain(firstProvider.id)
    expect((await storedRow(cleared))['native']?.['settings'], 'the settings stay when the provider row is cleared').toEqual([
      { name: 'bash-sandbox.timeoutMs', value: 900000 },
    ])
  }, 120_000)

  it('stores a chosen provider row and draws it by the name the provider door answers', async () => {
    await open()
    await openNative(chosen)
    expect(await providerChoice(chosen).inputValue(), 'a row with no provider starts on no provider').toBe('')
    await providerChoice(chosen).selectOption(secondProvider.id)
    await save(chosen)
    await expect.poll(async () => (await storedRow(chosen))['native']?.['providerRow'] ?? null, { timeout: 30_000 }).toBe(secondProvider.id)
    await expect
      .poll(async () => (await row(chosen).locator('.cast-native-selection').textContent()) ?? '', { timeout: 20_000 })
      .toContain(`${enWave13n['casting.nativeProviderRow']}: ${secondProvider.id}`)
    expect((await row(chosen).locator('.cast-native-selection').textContent()) ?? '').toContain(secondProvider.name)
  }, 120_000)

  it('says a row’s stored provider is not in the table the page read, and its form shows the value it saves', async () => {
    await open()
    await expect
      .poll(async () => (await row(missing).locator('.cast-native-selection').textContent()) ?? '', { timeout: 20_000 })
      .toContain(enWave13n['casting.providerRowMissing'])
    const line = (await row(missing).locator('.cast-native-selection').textContent()) ?? ''
    expect(line).toContain(`${enWave13n['casting.nativeProviderRow']}: ${thirdProvider.id}`)
    expect(line).not.toContain(thirdProvider.name)

    await openNative(missing)
    expect(await providerChoice(missing).inputValue(), 'the form shows the stored id').toBe(thirdProvider.id)
    const stored = (await providerChoice(missing).locator(`option[value="${thirdProvider.id}"]`).textContent()) ?? ''
    expect(stored).toContain(thirdProvider.id)
    expect(stored).toContain(enWave13n['casting.providerRowMissing'])
  }, 120_000)

  it('draws the provider read’s refusal and says in the form that the providers could not be read', async () => {
    await app.page.route('**/api/casting/providers', (route) => route.abort())
    try {
      await open()
      await app.page.locator('.px-error').first().waitFor({ state: 'visible', timeout: 20_000 })
      const refusal = (await app.page.locator('.px-error').first().textContent()) ?? ''
      expect(refusal).toContain(enWave13n['casting.providersUnreadRefusal'])
      expect(refusal).toContain(createI18n('en').t('frameFiles.api.cannotReach'))
      expect(refusal, 'the page-wide blank sentence is not true while the Casting rows are drawn').not.toContain(
        createI18n('en').t('error.blank'),
      )

      await openNative(unread)
      await expect
        .poll(async () => (await row(unread).locator('.cast-form').textContent()) ?? '', { timeout: 20_000 })
        .toContain(enWave13n['casting.providersUnread'])
      expect(await providerChoice(unread).count(), 'a form with no stored row offers no choice of none').toBe(0)

      await openNative(shown)
      expect(await providerChoice(shown).inputValue(), 'the form keeps the stored id').toBe(firstProvider.id)
      const stored = (await providerChoice(shown).locator(`option[value="${firstProvider.id}"]`).textContent()) ?? ''
      expect(stored).toContain(enWave13n['casting.providerRowMissing'])
      expect((await row(shown).locator('.cast-form').textContent()) ?? '').toContain(enWave13n['casting.providersUnread'])
    } finally {
      await app.page.unroute('**/api/casting/providers')
    }
  }, 120_000)

  it.skipIf(!KEEP)('photographs the page and the open form at four widths in both themes, with a mock-up banner', async () => {
    const putUpTheBanner = async (): Promise<void> => {
      await app.page.evaluate(() => {
        const banner = document.createElement('div')
        banner.textContent = 'MOCK-UP: made-up rows in a test office'
        banner.setAttribute('data-mock-up', 'yes')
        Object.assign(banner.style, {
          position: 'relative', margin: '0', padding: '4px 8px',
          background: '#ffdd00', color: '#000', font: '600 14px sans-serif', textAlign: 'center',
        })
        document.body.prepend(banner)
      })
    }
    const shoot = async (name: string): Promise<void> => {
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(sideways, `${name} scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
          await app.page.screenshot({ path: `${SHOTS}/${name}-${String(width)}-${theme}.png`, fullPage: true })
        }
      }
    }

    // The provider table as it is: a set key, an unset key, and one id a row names that the table no longer holds.
    await open('?lang=en#/casting')
    await putUpTheBanner()
    await shoot('table-set-unset-missing')
    await openNative(missing)
    await shoot('table-set-unset-missing-form')

    // A provider read that fails: the page draws its refusal, and every stored provider id is said to be missing.
    await app.page.route('**/api/casting/providers', (route) => route.abort())
    await open('?lang=en#/casting')
    await putUpTheBanner()
    await shoot('table-unread')
    await openNative(shown)
    await shoot('table-unread-form')
    await app.page.unroute('**/api/casting/providers')
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
  }, 240_000)

  it('draws the Casting door’s refusal when the row’s program cannot name the provider', async () => {
    await open('#/casting', 'worker')
    await openNative(refused)
    await providerChoice(refused).selectOption(firstProvider.id)
    await save(refused)

    await row(refused).locator('.cast-refuse').waitFor({ state: 'visible', timeout: 20_000 })
    const said = (await row(refused).locator('.cast-refuse').textContent()) ?? ''
    expect(said).toContain(
      createI18n('en').t('server.castingProviderRowOnlyForTheInspector', { provider: firstProvider.id, role: 'worker' }),
    )
    expect((await storedRow(refused))['native']?.['providerRow'] ?? null, 'the refused choice stored nothing').toBeNull()
  }, 120_000)
})
