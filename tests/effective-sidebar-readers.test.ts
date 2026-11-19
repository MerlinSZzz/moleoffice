// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, expect, it } from 'vitest'
import { SHIPPED_SIDEBAR, sidebarSurface, sidebarName } from '../src/shared/sidebar-arrangement.ts'
import { KIND_FAMILIES } from '../src/shared/work.ts'
let S: typeof import('../src/web/components/Sidebar.tsx')
let browser: typeof import('../src/web/lib/sidebar-arrangement.ts')
beforeAll(async () => {
  const store = new Map<string, string>(), storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} } })
  S = await import('../src/web/components/Sidebar.tsx'); browser = await import('../src/web/lib/sidebar-arrangement.ts')
})
it('whereThePageIs and coveredKinds read the same effective groups as the rail, then return to shipped', () => {
  for (const destination of S.DESTINATIONS) expect([sidebarSurface(destination.key), sidebarName(destination.key)], destination.key).toEqual([destination.surface, destination.label])
  const before = browser.sidebarReading(), next = structuredClone(before)
  const groups = { groups: SHIPPED_SIDEBAR.groups.map(group => ({ key: String(group.key), keys: [...group.keys] as string[] })) }
  groups.groups[2]!.keys = groups.groups[2]!.keys.filter(key => key !== 'roles')
  groups.groups[3]!.keys.unshift('roles')
  next.arrangement = groups; browser.installSidebarArrangement(next)
  try {
    expect(S.railGroups().find(group => group.key === 'office')?.keys[0]).toBe('roles')
    expect(S.whereThePageIs('roles')?.group.key).toBe('office')
    expect(S.whereThePageIs('roles')?.group.keys).toEqual(groups.groups[3]!.keys)
    // Isolate the covered-kinds reader with one effective family. Valid saved arrangements retain every kind;
    // this small reader fixture makes a fallback to shipped observable without changing the route contract.
    browser.installSidebarArrangement({ ...next, arrangement: { groups: [{ key: 'office', keys: ['notes'] }] } })
    expect([...S.coveredKinds()].sort()).toEqual([...KIND_FAMILIES.notes.kinds].sort())
  } finally { browser.installSidebarArrangement(before) }
  expect(S.railGroups()).toEqual(S.SHIPPED_RAIL_GROUPS)
  expect(S.whereThePageIs('roles')?.group.key).toBe('agents')
})

it('an empty project group draws no cards or module column', async () => {
  const C = await import('../src/web/pages/CategoryPage.tsx')
  const before = browser.sidebarReading()
  const groups = before.arrangement.groups.map(group => ({ key: group.key, keys: [...group.keys] }))
  groups.find(group => group.key === 'office')!.keys.push(...groups.find(group => group.key === 'project')!.keys.splice(0))
  browser.installSidebarArrangement({ ...before, changed: true, arrangement: { groups } })
  try {
    const html = renderToStaticMarkup(createElement(C.CategoryPage, { category: 'project', caption: 'Made-up empty project' })).replace(/<style[\s\S]*?<\/style>/g, '')
    expect(html).not.toContain('data-card=')
    expect(html).not.toContain('px-category-sides')
  } finally { browser.installSidebarArrangement(before) }
})
