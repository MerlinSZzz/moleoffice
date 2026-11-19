// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FlatRoute } from '@shared/addresses.ts'
import { pageTitle } from './Sidebar.tsx'
import { pathFor, RouteLink } from './router.tsx'

/**
 * THE WAY BACK FROM A PAGE REACHED FROM AN ENTRY. Wave 13y round 135.
 *
 * Every page reached from an entry has a button back to the level above it. The visitor credential's page already had
 * such a link: the name of the page above, small and muted, at the top left. This is that link, shared.
 *
 * It says the page above's own sidebar word, through pageTitle, so it says what the sidebar says in every language
 * and has no words of its own. `to` is for a page above that opens at one place, as Settings opens at Looks for the
 * sidebar's arrangement; without it the link goes to the page's own address.
 */
export function BackLink({ page, to }: { page: FlatRoute['name']; to?: string }) {
  return (
    <>
      <style href="mole-office-back-link" precedence="default">
        {BACK_LINK_CSS}
      </style>
      <RouteLink to={to ?? pathFor(page)} className="back-link">
        {pageTitle(page)}
      </RouteLink>
    </>
  )
}

const BACK_LINK_CSS = `
.back-link { align-self: flex-start; justify-self: start; font-size: var(--fs-1); color: var(--text-3); }
`
