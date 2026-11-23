// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PANEL FOR THE ID SERVICE'S KEYS OFFERS ONLY THE ROWS SETTINGS SHOWS, SAYS WHAT THEY ARE FOR, AND IS TITLED FOR
 * THEM. Wave 13u, round 242.
 *
 * Each coding tool's key goes on its own key page, so the panel draws no provider whose models the coding tools run.
 * The provider table (src/config/provider-setup/providers.json) keeps its OpenAI row, marked as not shown in Settings,
 * because a program outside the office may use that key and the guided scripts still read the row. The server's list
 * passes the mark on, and the panel leaves a marked row out. The box offers only the rows Settings shows, with no
 * Another provider choice after them: the table, the server's door and the guided script keep that choice, and the
 * panel does not. The rows it draws are the DigitalOcean and Resend keys, which only an office that runs the Mole Office
 * id service and sends its sign-up mail needs, and the line under the box says so. The panel's title says the same, in
 * the words the designer and the coordinator settled, in English and in Chinese.
 *
 * HOW IT IS READ HERE. The panel's helpers are read with the table itself, and the server's list is read from the
 * table with a made-up home that it never reads. The title is read from the panel's row in the Settings declaration.
 * No door is asked and no key is saved.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import providers from '../src/config/provider-setup/providers.json'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'

let panel: typeof import('../src/web/components/settings/ProviderKeyPanel.tsx')
let i18n: typeof import('../src/shared/i18n.ts')
let server: typeof import('../src/server/lib/provider-key-setup.ts')
let declaration: typeof import('../src/shared/settings-declaration.ts')

/** The panel's title, as the designer and the coordinator settled it, in each language. */
const THE_TITLE = { en: 'Keys for the id service and its mail', zh: '账号服务和邮件用的密钥' } as const

// THE PANEL IS IMPORTED ONCE, with time to be transformed. The runner's environment is node, so a window stand-in is
// installed before the page's modules are imported.
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '#/settings/providerkeys', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
  panel = await import('../src/web/components/settings/ProviderKeyPanel.tsx')
  i18n = await import('../src/shared/i18n.ts')
  server = await import('../src/server/lib/provider-key-setup.ts')
  declaration = await import('../src/shared/settings-declaration.ts')
}, 60_000)

afterEach(() => { i18n.setWordLanguage('en') })

describe('the panel for the id service\'s keys', () => {
  it('shows no provider whose models a coding tool runs', () => {
    const theToolsProviders = Object.values(THE_PROVIDER_A_RUNTIME_RUNS)
    expect(theToolsProviders.length).toBeGreaterThan(0)
    const shown = panel.theRowsSettingsShows(providers)
    expect(shown.length).toBeGreaterThan(0)
    for (const row of shown) expect(theToolsProviders, `${row.id} is a coding tool's provider`).not.toContain(row.id)
  })

  it('keeps the OpenAI row in the table, marked as not shown in Settings, and the server\'s list passes the mark on', () => {
    expect(providers.find((row) => row.id === 'openai')?.hiddenInSettings).toBe(true)
    expect(panel.theRowsSettingsShows(providers).map((row) => row.id)).not.toContain('openai')
    const listed = server.createProviderKeySetup({ home: '/made-up/home-never-read' }).list()
    expect(listed.map((row) => row.id)).toEqual(providers.map((row) => row.id))
    expect(listed.find((row) => row.id === 'openai')?.hiddenInSettings).toBe(true)
    expect(panel.theRowsSettingsShows(listed).map((row) => row.id)).toEqual(panel.theRowsSettingsShows(providers).map((row) => row.id))
  })

  it('offers only the rows Settings shows, in order, with no Another provider choice after them', () => {
    const shown = panel.theRowsSettingsShows(providers)
    const choices = panel.theProviderChoices(shown)
    expect(choices.map((one) => one.value)).toEqual(shown.map((row) => row.id))
    expect(choices.map((one) => one.value)).not.toContain('custom')
  })

  it('says under the box what each row it offers is for, and nothing while nothing is chosen', () => {
    const shown = panel.theRowsSettingsShows(providers)
    for (const row of shown) expect(panel.whatTheChoiceIsFor(row.id), row.id).toBe(i18n.t('providerSetup.keptForTheOffice'))
    expect(panel.whatTheChoiceIsFor('')).toBeNull()
  })

  for (const language of ['en', 'zh'] as const) {
    it(`${language}: its declared title reads the settled title words`, () => {
      const declared = declaration.PANELS.find((one) => one.key === 'settings.providerkeys')
      expect(declared, 'the Settings declaration has no row for the panel').toBeDefined()
      i18n.setWordLanguage(language)
      expect(i18n.t(declared!.title)).toBe(THE_TITLE[language])
    })
  }
})
