// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE'S COUNT AND WHAT IT IS COUNTED OVER JOIN BY THE OFFICE'S SPACING RULE.
 *
 * Wave 13q's round 28, found in its pictures of the Counters page: "1 个计数器；1 个启用，0 个暂停。 只计 Default 这个项目。"
 * The count sentence ends with a full-width full stop, and the page put a typed space before the sentence that
 * says what it is counted over. The Counters page, the context bundles page and the All records page each joined
 * the two that way. The office's spacing rule (`gapBetween`, src/shared/spacing.ts) puts no space beside a
 * full-width mark, and one between two English sentences.
 *
 * Held here: `withCountedOver` in src/web/components/ProjectChoice.tsx joins a count and its "counted over" sentence
 * by that rule, in Chinese and in English.
 *
 * And the All records page's count line, which joined its own two parts with a typed space and so ended in one
 * when it had no filter to name, joins them by the same rule.
 *
 * MUTATIONS: `withCountedOver` joining with a typed space; `countLine` joining with a typed space again. Each is red.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { EVERY_PROJECT } from '../src/shared/across-projects.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'

type Choice = typeof import('../src/web/components/ProjectChoice.tsx')
type Records = typeof import('../src/web/pages/RecordsPage.tsx')
let choice: Choice
let records: Records

beforeAll(async () => {
  // The component reaches modules that touch `window` while they load; the usual stand-in.
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
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  choice = await import('../src/web/components/ProjectChoice.tsx')
  records = await import('../src/web/pages/RecordsPage.tsx')
})

afterEach(() => setWordLanguage('en'))

const TITLES = new Map([['kite', 'Kite club']])

it('joins with no space after 。 in Chinese, and one space between English sentences', () => {
  setWordLanguage('zh')
  const line = t('g7a.counters.count', { n: 1, running: 1, paused: 0 })
  expect(choice.withCountedOver(line, 'kite', TITLES)).toBe('1 个计数器；1 个启用，0 个暂停。只计 Kite club 这个项目。')
  expect(choice.withCountedOver(line, EVERY_PROJECT, TITLES)).not.toMatch(/。\s/u)
  setWordLanguage('en')
  const english = t('g7a.counters.count', { n: 1, running: 1, paused: 0 })
  expect(choice.withCountedOver(english, 'kite', TITLES)).toBe(`${english} ${t('acrossProjects.countedOne', { project: 'Kite club' })}`)
})

it('ends the All records count line with no stray space, so its counted-over sentence joins with none', () => {
  // THE PICTURES AT THE FINAL TIP still drew "20 条记录。 只计 Default 这个项目。": `countLine` joined its head to an
  // empty filter sentence with a typed space, so the line itself ended in a space.
  setWordLanguage('zh')
  const line = records.countLine({ loaded: 20, shown: 20, kind: '', query: '' })
  expect(line).toBe('20 条记录。')
  expect(choice.withCountedOver(line, 'kite', TITLES)).toBe('20 条记录。只计 Kite club 这个项目。')
  setWordLanguage('en')
  expect(records.countLine({ loaded: 20, shown: 20, kind: '', query: '' })).toBe('20 records.')
})

/** Every .ts and .tsx file under a folder. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

