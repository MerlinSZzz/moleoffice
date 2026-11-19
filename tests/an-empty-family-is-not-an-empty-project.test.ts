// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMPTY FAMILY PAGE DOES NOT CLAIM THE PROJECT IS EMPTY.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * `#/ideas` in a workspace holding 151 records printed "Mole Office is empty. Nothing has been recorded
 * in this workspace yet." An empty family and an empty project are different facts leading to
 * different acts, and the branch keyed on the kind filter so it could not tell them apart.
 *
 * That is USER.md invariant 5: absence beats a guess, and *nothing is there* is not the same answer as
 * *nothing of this sort is there*.
 *
 * This was one of eight unrelated subjects in the old redesign-shell test, split out so that
 * each file is about one rule.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { KIND_FAMILIES } from '../src/shared/work.ts'

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

const results = (props: Partial<Parameters<RecordsModule['RecordResults']>[0]>) =>
  renderToStaticMarkup(
    h(rp.RecordResults, {
      records: [],
      kind: '',
      query: '',
      onClearKind: noop,
      onClearQuery: noop,
      onNew: noop,
      ...props,
    } as Parameters<RecordsModule['RecordResults']>[0]),
  )

// Criterion change: plan 7FEOshq3mBGG uses a short mark; the count still names the active family.
describe('an empty family page does not claim the project is empty', () => {
  it('marks the empty family and names the active family in its count', () => {
    const html = results({ family: 'ideas' })
    expect(html).toContain('px-absent')
    expect(html).toContain(t('g7a.records.groupFilter', { group: KIND_FAMILIES.ideas.label }))
    expect(html).not.toContain('Nothing has been recorded in this project yet')
  })

  it('marks the empty catalogue without claiming a family filter is active', () => {
    const html = results({})
    expect(html).toContain('px-absent')
    expect(html).toContain('0 records')
    expect(html).not.toContain(t('g7a.records.groupFilter', { group: KIND_FAMILIES.ideas.label }))
  })
})
