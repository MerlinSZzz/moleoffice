// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE REACHED FROM AN ENTRY LEADS BACK TO THE LEVEL ABOVE IT. Wave 13y round 135, item 76b.
 *
 * Every page reached from an entry has a button back to the level above it. A role card opened from the Embassy had
 * no way back to the Embassy. The visitor credential's page already had such a link: the name of the page above,
 * small, at the top left. That link is now one shared part (src/web/components/BackLink.tsx), and these pages draw it:
 *
 *   - the visitor credential, a profile and Role cards, back to the Embassy;
 *   - a new or an edited role card, back to Role cards;
 *   - one tool's manual, back to the toolset list;
 *   - the sidebar's arrangement, back to Settings opened at Looks, where its entry is.
 *
 * Gates and Office controls draw no link of their own. The frame draws a path above every page of a sidebar group
 * (WhereThisPageIs), and on these two it already leads to the group's page, Office or Developer. So the path is their
 * way back. Office controls is shown in developer mode only, and outside it neither the path nor a link is drawn.
 *
 * The link's words are the page above's own sidebar word (pageTitle), so it says one string with the sidebar in every
 * language and adds no words of its own. A card's words record is filed under Reports and notes and stays there; its
 * breadcrumb now leads to Role cards, where its entry is.
 *
 * Red before the code: all ten cases failed. Each page case found no shared back link, and the breadcrumb case found no
 * link to Role cards. The cases for Gates and Office controls were changed after the code, when the path became the
 * way back on those two pages, and were red at that code: each found the page's own link.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

type Sidebar = typeof import('../src/web/components/Sidebar.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Mode = typeof import('../src/web/lib/mode.ts')
type Work = typeof import('../src/shared/work.ts')

let sidebar: Sidebar
let i18n: I18n
let mode: Mode
let work: Work
let credential: typeof import('../src/web/pages/CredentialPage.tsx')
let profile: typeof import('../src/web/pages/ProfilePage.tsx')
let roles: typeof import('../src/web/pages/RolesPage.tsx')
let roleNew: typeof import('../src/web/pages/RoleCardNewPage.tsx')
let toolset: typeof import('../src/web/pages/ToolsetPage.tsx')
let gates: typeof import('../src/web/pages/GatesPage.tsx')
let arrangement: typeof import('../src/web/pages/SidebarArrangementPage.tsx')
let officeControls: typeof import('../src/web/pages/OfficeControlsPage.tsx')
let recordPage: typeof import('../src/web/pages/RecordPage.tsx')
let category: typeof import('../src/web/pages/CategoryPage.tsx')

const place = { hash: '', search: '' }

beforeAll(async () => {
  // The pages reach src/web/api.ts and src/web/lib/mode.ts, which touch window when they load, and the role card's page
  // reads its address from window.location.hash. This is the smallest stand-in that lets them load.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: place,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }
  sidebar = await import('../src/web/components/Sidebar.tsx')
  i18n = await import('../src/shared/i18n.ts')
  mode = await import('../src/web/lib/mode.ts')
  work = await import('../src/shared/work.ts')
  credential = await import('../src/web/pages/CredentialPage.tsx')
  profile = await import('../src/web/pages/ProfilePage.tsx')
  roles = await import('../src/web/pages/RolesPage.tsx')
  roleNew = await import('../src/web/pages/RoleCardNewPage.tsx')
  toolset = await import('../src/web/pages/ToolsetPage.tsx')
  gates = await import('../src/web/pages/GatesPage.tsx')
  arrangement = await import('../src/web/pages/SidebarArrangementPage.tsx')
  officeControls = await import('../src/web/pages/OfficeControlsPage.tsx')
  recordPage = await import('../src/web/pages/RecordPage.tsx')
  category = await import('../src/web/pages/CategoryPage.tsx')
}, 120_000)

afterEach(() => {
  i18n.setWordLanguage('en')
  mode.setMode('normal')
  place.hash = ''
})

/** Markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** Every shared back link the markup draws: where it leads and what it says. */
function backLinks(html: string): { href: string; says: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter((one) => /\bclass="back-link"/.test(one[1] ?? ''))
    .map((one) => ({ href: /\bhref="([^"]*)"/.exec(one[1] ?? '')?.[1] ?? '', says: one[2] ?? '' }))
}

/** Every link in the path the frame draws above a page: where it leads and what it says. */
function pathLinks(page: 'gates' | 'officeControls'): { href: string; says: string }[] {
  const html = body(h(category.WhereThisPageIs, { page, project: 'Test project' }))
  const path = /<nav class="px-crumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ''
  return [...path.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((one) => ({
    href: /\bhref="([^"]*)"/.exec(one[1] ?? '')?.[1] ?? '',
    says: one[2] ?? '',
  }))
}

describe('every page reached from an entry draws one link back to the level above it', () => {
  it('the visitor credential leads back to the Embassy by the shared link', () => {
    const html = body(h(credential.CredentialPage, { id: 'test-credential' }))
    expect(backLinks(html)).toEqual([{ href: '#/embassy', says: sidebar.pageTitle('embassy') }])
  })

  it('a profile leads back to the Embassy', () => {
    const html = body(h(profile.ProfilePage, { kind: 'agent', id: 'test-agent' }))
    expect(backLinks(html)).toEqual([{ href: '#/embassy', says: sidebar.pageTitle('embassy') }])
  })

  it('Role cards leads back to the Embassy', () => {
    const html = body(h(roles.RolesPage))
    expect(backLinks(html)).toEqual([{ href: '#/embassy', says: sidebar.pageTitle('embassy') }])
  })

  it('a new role card and an edited one lead back to Role cards', () => {
    for (const address of ['#/roles/new', '#/roles/added/test-role']) {
      place.hash = address
      const html = body(h(roleNew.RoleCardNewPage))
      expect(backLinks(html), address).toEqual([{ href: '#/roles', says: sidebar.pageTitle('roles') }])
    }
  })

  it("one tool's manual leads back to the toolset list, and the list itself, a sidebar row, draws none", () => {
    const manual = body(h(toolset.ToolsetPage, { slug: 'test-tool' }))
    expect(backLinks(manual)).toEqual([{ href: '#/toolset', says: sidebar.pageTitle('toolset') }])
    const list = body(h(toolset.ToolsetPage, {}))
    expect(backLinks(list)).toEqual([])
  })

  it("the sidebar's arrangement leads back to Settings opened at Looks, on its reading and its editing face", () => {
    for (const edit of [false, true]) {
      const html = body(h(arrangement.SidebarArrangementPage, { edit }))
      expect(backLinks(html), `edit ${String(edit)}`).toEqual([{ href: '#/settings/arrangesidebar', says: sidebar.pageTitle('settings') }])
    }
  })

  it('Gates draws no link of its own, on its reading and its editing face, since the path above it leads to Office', () => {
    expect(pathLinks('gates')).toEqual([{ href: '#/office', says: sidebar.pageTitle('officeCategory') }])
    for (const edit of [false, true]) {
      const html = body(h(gates.GatesPage, { edit }))
      expect(backLinks(html), `edit ${String(edit)}`).toEqual([])
    }
  })

  it('Office controls draws no link of its own: in developer mode the path above it leads to Developer, and outside it neither is drawn', () => {
    mode.setMode('inspect')
    expect(pathLinks('officeControls')).toEqual([{ href: '#/developer', says: sidebar.pageTitle('developerCategory') }])
    expect(backLinks(body(h(officeControls.OfficeControlsPage)))).toEqual([])
    mode.setMode('normal')
    expect(pathLinks('officeControls')).toEqual([])
    expect(backLinks(body(h(officeControls.OfficeControlsPage)))).toEqual([])
  })

  it('says the sidebar word of the page above in the page language', () => {
    const english = sidebar.pageTitle('roles')
    i18n.setWordLanguage('zh')
    const chinese = sidebar.pageTitle('roles')
    expect(chinese).not.toBe(english)
    place.hash = '#/roles/new'
    expect(backLinks(body(h(roleNew.RoleCardNewPage)))).toEqual([{ href: '#/roles', says: chinese }])
    expect(backLinks(body(h(profile.ProfilePage, { kind: 'agent', id: 'test-agent' })))).toEqual([
      { href: '#/embassy', says: sidebar.pageTitle('embassy') },
    ])
  })
})

describe("a card's words record's breadcrumb leads to Role cards", () => {
  it('names Role cards in the middle, and the record stays filed under its family', () => {
    // The family stays: the record is still listed with Reports and notes. Only the way back changes.
    const family = work.familyOf('role_card_words')
    expect(family).not.toBeNull()
    const html = body(h(recordPage.Crumbs, { record: { kind: 'role_card_words', title: 'Test words · A card' } }))
    expect(html).toContain('href="#/roles"')
    expect(html).toContain(`>${i18n.t('nav.roles')}<`)
    expect(html, 'the middle crumb still leads to the family page').not.toContain(`href="#/${String(family)}"`)
    expect(html).toContain('Test words · A card')
  })
})
