// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE UNDER REGISTER ON SETTINGS' REPOSITORIES PANEL IS DRAWN IN THE PAGE'S LANGUAGE.
 *
 * In Developer mode the panel drew the repositories read's own note under the Register press. The server writes
 * that note in English, for an agent, so a Chinese page showed one English sentence in a Chinese panel. The panel
 * now writes the line from its own words, settingsPanel.repos.noneRegistered and settingsPanel.repos.registeredCount,
 * still in Developer mode only.
 *
 * MADE-UP REPLIES, in the shape the repositories read answers: none registered, and two registered. Each note is a
 * made-up sentence, so a page that draws the server's note is caught by its words.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { RepositoriesReply, RepositoryOut } from '../src/server/api/implementation.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { drawnText } from './drawn.ts'

type RepositoriesModule = typeof import('../src/web/components/Repositories.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')
type I18nModule = typeof import('../src/shared/i18n.ts')

let rp: RepositoriesModule
let mode: ModeModule
let i18n: I18nModule

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  rp = await import('../src/web/components/Repositories.tsx')
  mode = await import('../src/web/lib/mode.ts')
  i18n = await import('../src/shared/i18n.ts')
})

// The mode and the language are module-level state, and a leak would change every case below.
afterEach(() => {
  mode.setMode('normal')
  i18n.setWordLanguage('en')
})

function aRepository(name: string): RepositoryOut {
  return {
    id: `made-up-${name}`,
    name,
    note: null,
    root: null,
    hasRoot: false,
    indexed: false,
    builtAt: null,
    fileCount: 0,
    createdAt: '2026-11-22 00:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
  }
}

const NONE: RepositoriesReply = {
  repositories: [],
  note: 'A made-up note for an empty project, in the words a server writes for an agent.',
}

const TWO: RepositoriesReply = {
  repositories: [aRepository('kiln-controller'), aRepository('glaze-tables')],
  note: 'A made-up note for two repositories, in the words a server writes for an agent.',
}

function draw(reply: RepositoriesReply): string {
  return drawnText(
    renderToStaticMarkup(
      h(rp.RepositoriesRead, { reply, adding: false, scanning: null, onScan: () => {}, onRegistered: () => {} }),
    ),
  )
}

/** The two lines in one language, read from the word list and not copied here. */
function theLines(language: 'en' | 'zh'): { none: string; two: string } {
  i18n.setWordLanguage(language)
  return {
    none: i18n.t('settingsPanel.repos.noneRegistered'),
    two: i18n.t('settingsPanel.repos.registeredCount', { n: 2 }),
  }
}

it('draws the line in Chinese on a Chinese page, and never the server note', () => {
  const english = theLines('en')
  const chinese = theLines('zh')
  expect(chinese.none, 'the line for an empty project has no Chinese').not.toBe(english.none)
  expect(chinese.two, 'the line for two repositories has no Chinese').not.toBe(english.two)
  mode.setMode('inspect')
  i18n.setWordLanguage('zh')
  const none = draw(NONE)
  expect(none).toContain(chinese.none)
  expect(none).not.toContain(NONE.note)
  const two = draw(TWO)
  expect(two).toContain(chinese.two)
  expect(two).not.toContain(TWO.note)
})

it('draws the line in English on an English page, and never the server note', () => {
  const english = theLines('en')
  mode.setMode('inspect')
  i18n.setWordLanguage('en')
  const none = draw(NONE)
  expect(none).toContain(english.none)
  expect(none).not.toContain(NONE.note)
  const two = draw(TWO)
  expect(two).toContain(english.two)
  expect(two).not.toContain(TWO.note)
})

it('draws no line in Normal mode, in either language', () => {
  for (const language of ['en', 'zh'] as const) {
    const lines = theLines(language)
    i18n.setWordLanguage(language)
    expect(draw(NONE), `the line for an empty project was drawn in Normal mode, in ${language}`).not.toContain(lines.none)
    expect(draw(TWO), `the line for two repositories was drawn in Normal mode, in ${language}`).not.toContain(lines.two)
  }
})
