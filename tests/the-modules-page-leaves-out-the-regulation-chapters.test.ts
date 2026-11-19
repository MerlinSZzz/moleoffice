// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODULES PAGE LEAVES OUT THE REGULATION CHAPTERS. Wave 13y round 135, item 76a.
 *
 * At every start the server copies the office's default chapters into a new office as module records, each marked with
 * its chapter number at data.extra.chapter (A_CHAPTER in src/shared/office-rules.ts). The Modules page kept every module
 * record it was given, so a new office's Modules page showed Mole Office's own rules, the test chapter among them, as if
 * they were the person's modules. A chapter is read on the Regulations page. The Modules page now leaves out every
 * record that chapterNumberOf names as a chapter, and keeps every other module.
 *
 * Red before the code: cases 1 and 2 found the chapters drawn as modules. Case 3 is a guard on the one definition and
 * passed at the old code too.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import type { RecordListItem } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Modules = typeof import('../src/web/pages/family/ModulesPage.tsx')
type Rules = typeof import('../src/shared/office-rules.ts')

let modules: Modules
let rules: Rules

beforeAll(async () => {
  // The page reaches src/web/api.ts and src/web/lib/mode.ts, which touch window when they load. This is the smallest
  // stand-in that lets them load; nothing here is under test.
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
  modules = await import('../src/web/pages/family/ModulesPage.tsx')
  rules = await import('../src/shared/office-rules.ts')
})

/** Markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

function aModule(id: string, title: string, data: Record<string, unknown>): RecordListItem {
  return {
    id,
    kind: 'module' as PanelRecord['kind'],
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: '2026-11-01 09:00:00',
    updatedAt: '2026-11-02 09:00:00',
    deletedAt: null,
    incompleteCount: 0,
  }
}

const noop = () => {}

describe('the Modules page draws the modules and not the regulation chapters', () => {
  it('leaves out a chapter record and keeps the module beside it', () => {
    const subsystem = aModule('module-sensor-rig', 'Test module · Sensor rig', { context: '', parts: [], paths: [] })
    const chapter = aModule('module-chapter-five', 'Test chapter · Tests and gates', { extra: { chapter: 5 } })
    // The fixture is a chapter by the office's one definition, so the case tests the page and not the fixture.
    expect(rules.chapterNumberOf(chapter.kind, chapter.data)).toBe(5)
    expect(rules.chapterNumberOf(subsystem.kind, subsystem.data)).toBeNull()

    const html = body(h(modules.ModulesPage, { records: [subsystem, chapter], links: [], onFiled: noop }))
    expect(html).toContain('Test module · Sensor rig')
    expect(html).toContain('module-sensor-rig')
    expect(html, 'a regulation chapter is drawn as a module').not.toContain('Test chapter · Tests and gates')
    expect(html, 'a regulation chapter is linked as a module').not.toContain('module-chapter-five')
  })

  it('says it has no modules when every module record is a chapter', () => {
    const chapters = [1, 5, 10].map((n) => aModule(`module-chapter-${n}`, `Test chapter · ${n}`, { extra: { chapter: n } }))
    const html = body(h(modules.ModulesPage, { records: chapters, links: [], onFiled: noop }))
    for (const n of [1, 5, 10]) expect(html).not.toContain(`Test chapter · ${n}`)
    const alone = body(h(modules.ModulesPage, { records: [], links: [], onFiled: noop }))
    // With the chapters left out, the page is the page of an office with no modules, word for word.
    expect(html).toBe(alone)
  })

  it('keeps a module whose chapter mark is not a number, as the one definition does', () => {
    // chapterNumberOf counts a chapter only where data.extra.chapter is a number. A module holding the word "5" there is
    // not a chapter anywhere else in the office, so the page keeps it too.
    const marked = aModule('module-marked-in-words', 'Test module · Marked in words', { extra: { chapter: '5' } })
    expect(rules.chapterNumberOf(marked.kind, marked.data)).toBeNull()
    const html = body(h(modules.ModulesPage, { records: [marked], links: [], onFiled: noop }))
    expect(html).toContain('Test module · Marked in words')
  })
})
