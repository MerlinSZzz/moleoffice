// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Delayed writes may finish; their old destination loses to a later page or project choice. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const project = vi.hoisted(() => ({ id: 'first', changed: () => {} }))
vi.mock('../src/web/lib/workspace.ts', () => ({
  currentWorkspace: () => project.id,
  subscribeWorkspace: (changed: () => void) => { project.changed = changed; return () => {} },
}))

let browser: EventTarget & { location: { href: string; readonly hash: string } }
let stillOnThisPage: typeof import('../src/web/lib/pagechoice.ts').stillOnThisPage
beforeEach(async () => {
  vi.resetModules()
  project.id = 'first'
  browser = Object.assign(new EventTarget(), { location: { href: 'http://fixture/#/records', get hash() { return new URL(this.href).hash } } })
  vi.stubGlobal('window', browser)
  ;({ stillOnThisPage } = await import('../src/web/lib/pagechoice.ts'))
})
afterEach(() => vi.unstubAllGlobals())

function go(path: string): void {
  const oldURL = browser.location.href
  const newURL = `http://fixture/#${path}`
  browser.location.href = newURL
  browser.dispatchEvent(Object.assign(new Event('hashchange'), { oldURL, newURL }))
}

it('allows a completion on its page, but cancels it even after leaving and returning', () => {
  const mayOpen = stillOnThisPage()
  expect(mayOpen()).toBe(true)
  go('/project')
  go('/records')
  expect(mayOpen()).toBe(false)
  expect(stillOnThisPage()()).toBe(true)
})

it('does not mistake the review panel redispatching the same address for another choice', () => {
  go('/project')
  const mayOpen = stillOnThisPage()
  browser.dispatchEvent(Object.assign(new Event('hashchange'), {
    oldURL: 'http://fixture/#/records', newURL: browser.location.href,
  }))
  expect(mayOpen()).toBe(true)
  // A reply can land before the browser delivers the next hash event.
  browser.location.href = 'http://fixture/#/report/later'
  expect(mayOpen()).toBe(false)
})

it('cancels when the project changes and returns, even with the same address', () => {
  const mayOpen = stillOnThisPage()
  project.id = 'second'
  project.changed()
  project.id = 'first'
  project.changed()
  expect(mayOpen()).toBe(false)
})

it('rejects an old record recovery first mounted after a new address was chosen', () => {
  go('/report/new-report')
  expect(stillOnThisPage('old-report')()).toBe(false)
  expect(stillOnThisPage('new-report')()).toBe(true)
  go('/checklists/new-checklist')
  expect(stillOnThisPage('old-report')()).toBe(false)
  expect(stillOnThisPage('new-checklist')()).toBe(true)
})
