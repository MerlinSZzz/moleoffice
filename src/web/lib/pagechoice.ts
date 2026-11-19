// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A reply may finish its write, but it may not reopen a page the reader has since left. */
import { currentWorkspace, subscribeWorkspace } from './workspace.ts'
import { parseRoute } from '@shared/addresses.ts'

let choice = 0
let address: string | null = null
// Static render tests can provide storage on `window` without providing a browser.
const hasBrowser = typeof window !== 'undefined' && typeof window.location?.href === 'string' && typeof window.addEventListener === 'function'

function rememberAddress(next: string): void {
  if (next === address) return
  address = next
  ++choice
}

if (hasBrowser) {
  address = window.location.href
  // Read the event's address too: leaving and returning before a reply lands is still a later
  // choice. ReviewBar redispatches an address already heard; that is not another choice.
  window.addEventListener('hashchange', event => { rememberAddress(event.newURL) })
  subscribeWorkspace(() => { ++choice })
}

/** Capture before awaiting work. Checking the current address also closes the hash-event gap. */
export function stillOnThisPage(recordId?: string): () => boolean {
  if (!hasBrowser) return () => false
  // An old page can mount its error after the address has already changed but before the router
  // has rendered it. A recovery for that record must not adopt the new address as its own choice.
  if (recordId !== undefined) {
    const route = parseRoute(window.location.hash)
    if (!('id' in route) || route.id !== recordId) return () => false
  }
  rememberAddress(window.location.href)
  const began = choice
  const project = currentWorkspace()
  return () => {
    rememberAddress(window.location.href)
    return choice === began && currentWorkspace() === project
  }
}
