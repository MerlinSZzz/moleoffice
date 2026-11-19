// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE ABOUT ONE KIND CANNOT BE FILTERED, OR CLEARED, OUT OF ITS OWN IDENTITY.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * An independent reviewer drove the product and found `#/modules` offering all sixteen kinds and a
 * live "Clear both". One press put every record in the project under the heading "Modules". The
 * count line above the rows was the whole project's, which is how a page called Modules came to
 * report 151 records.
 *
 * A kind-locked page is about one kind by design. What it is about is a statement, not a control
 * that can only be used wrong.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY
 * ---------------------------------------------------------------------------------------
 *
 * It was one of eight unrelated subjects in the old redesign-shell test, and the case about the
 * count asserted only that one record title appeared on the page. That would have passed with the
 * count-locking deleted, which CLAUDE.md says is not a test. Eight subjects in one file is why
 * nobody noticed. The count case now reads the sentence a person reads, and compares the locked
 * page against the same page unlocked, so the locking itself is what the assertion is about.
 *
 * THE MUTATION: in `src/web/pages/RecordsPage.tsx`, stop passing `locked` to `countLine` — change
 * `...(only === undefined ? {} : { locked: true })` to `...(only === undefined ? {} : {})`. The
 * first case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { kindWord } from '../src/shared/words.ts'
import type { RecordListItem } from '../src/web/api.ts'

type RecordsModule = typeof import('../src/web/pages/RecordsPage.tsx')

let rp: RecordsModule

beforeAll(async () => {
  // The runner's environment is `node` and this project has ruled out jsdom, so a window stand-in
  // is installed before the modules are imported, exactly as tests/shell-nav.test.ts does it.
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
  rp = (await import('../src/web/pages/RecordsPage.tsx')) as RecordsModule
})

const noop = () => {}

function record(over: Partial<RecordListItem> = {}): RecordListItem {
  return {
    id: 'r1',
    kind: 'module' as PanelRecord['kind'],
    title: 'The gripper',
    summary: null,
    state: null,
    createdAt: '2026-08-01 10:00:00',
    updatedAt: '2026-08-01 10:00:00',
    incompleteCount: 0,
    ...over,
  } as RecordListItem
}

const TWO_MODULES = [record(), record({ id: 'r2', title: 'The wrist camera' })]

const results = (props: Partial<Parameters<RecordsModule['RecordResults']>[0]>) =>
  renderToStaticMarkup(
    h(rp.RecordResults, {
      records: TWO_MODULES,
      kind: 'module' as PanelRecord['kind'],
      query: '',
      onClearKind: noop,
      onClearQuery: noop,
      onNew: noop,
      ...props,
    } as Parameters<RecordsModule['RecordResults']>[0]),
  )

/** The words a reader sees, with the stylesheets and the tags gone. */
const words = (markup: string): string =>
  markup
    .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2018;|&#x2019;/g, "'")
    .replace(/&#x201c;|&#x201d;/g, '"')
    .replace(/\s+/g, ' ')

describe('a page about one kind', () => {
  it('counts what the page is about, and does not report a filter the reader did not set', () => {
    // TWO SENTENCES, SIDE BY SIDE. The same two records and the same kind, on a page locked to that
    // kind and on the catalogue with that kind chosen in the filter. The catalogue is filtered and
    // says so, because a filter you have forgotten you set is a lie about the data. The locked page
    // is not filtered: a reader went to Modules on purpose, and telling them the other fifteen
    // kinds were never fetched describes the implementation to somebody who did not ask.
    const locked = words(results({ only: 'module' as PanelRecord['kind'] }))
    const filtered = words(results({}))

    expect(locked, 'the locked page no longer counts its records').toContain('2 records.')
    // Plan 7FEOshq3mBGG keeps this internal omission explanation off the normal page.
    expect(locked, 'the normal page explains its internal omission rule').not.toContain(
      'Deleted records are never in this list',
    )
    expect(
      locked,
      'the locked page tells the reader a kind filter is holding records back, which nobody set',
    ).not.toContain(t('g7a.records.kindFilter', { kind: kindWord('module').text }))

    // THE CONTROL. Without it this would pass on a page that had lost the sentence everywhere,
    // which is a different fault drawn the same way.
    expect(filtered, 'the catalogue stopped saying that a chosen kind hides the other kinds').toContain(
      t('g7a.records.kindFilter', { kind: kindWord('module').text }),
    )
  })

  it('draws no empty family panels beside the one it is about', () => {
    const html = results({ only: 'module' as PanelRecord['kind'] })
    expect(html, 'four empty families stood between the heading and the records').not.toContain(
      'Nothing is recorded in Work yet',
    )
  })
})
