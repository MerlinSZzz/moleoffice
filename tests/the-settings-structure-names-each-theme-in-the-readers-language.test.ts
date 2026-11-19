// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS STRUCTURE NAMES EACH OF THE SIX THEMES IN THE LANGUAGE IT WAS ASKED IN.
 *
 * A theme has an English and a Chinese name in its data (src/shared/themes.ts), and `themeName` is
 * the one place that picks between them. The structure the API serves at /api/settings/structure
 * used to give every reader the English name in `words`, so a reader asking in Chinese was told the
 * English name as though it were the Chinese one. Each theme's `words` must be `themeName` in the
 * language asked for, and `english` must stay the English name.
 *
 * Expected names are read from the theme data, never copied.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THEMES, themeName } from '../src/shared/themes.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

type Control = { key: string; words: string; english: string }
type Category = { panels: { key: string; controls: Control[] }[] }

async function theThemeControls(language: string): Promise<Control[]> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/settings/structure?lang=${language}`,
    headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-reader' },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  const look = (reply.json() as { categories: Category[] }).categories.flatMap((category) => category.panels).find((panel) => panel.key === 'settings.look')
  expect(look).toBeDefined()
  return look!.controls
}

it.each([['Chinese', 'zh'], ['English', 'en']] as const)('gives each of the six themes its name in %s, and its English name beside it', async (_language, language) => {
  const controls = await theThemeControls(language)
  for (const theme of THEMES) {
    const control = controls.find((one) => one.key === `preset.theme.${theme.id}`)
    expect(control, theme.id).toBeDefined()
    expect(control!.words, theme.id).toBe(themeName(theme, language))
    expect(control!.english, theme.id).toBe(theme.name.en)
  }
})

it('has a Chinese name for each theme that is not its English name, so the case above can tell them apart', () => {
  for (const theme of THEMES) expect(themeName(theme, 'zh'), theme.id).not.toBe(theme.name.en)
})
