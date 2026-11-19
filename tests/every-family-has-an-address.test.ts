// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY FAMILY IS A PLACE, AND ITS KEY IS THE ADDRESS THAT OPENS IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * The family pages were undiscoverable. Their headings were links drawn as captions, in the same
 * column as "Tools", which goes nowhere. A reviewer looking straight at five of them could not find
 * any. What this file refuses is the version of that which would still hurt: a family whose address
 * opens nothing, leaving its kinds reachable only by filtering the Everything list.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ADDRESS IS SHARED ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `#/decisions` is registered twice over. Section 3 of design/UX-ROUND-THREE.md gives Decisions a
 * page of its own that spans every project; section 4 makes `decisions` a reading family, and a
 * family's key IS its address. The router checks its flat pages before its families, so that
 * address opens the person-level page.
 *
 * THAT IS THE RIGHT ANSWER AND NOT A COLLISION TO REPAIR, because a reader must never meet two
 * pages called Decisions. So every key must parse to a real page, and a key that does not open its
 * own family page must open a flat page of the same name.
 *
 * This was one of eight unrelated subjects in the old redesign-shell test, split out so that
 * each file is about one rule.
 */

import { describe, expect, it } from 'vitest'
import { KIND_FAMILIES } from '../src/shared/work.ts'
import { parseRoute, renamedAddress } from '../src/web/components/router.tsx'

describe('every family is a place, and the rail says so', () => {
  it('gives each family an address that opens a page, and never the not-found page', () => {
    /**
     * A FAMILY WHOSE ADDRESS OPENS A PAGE OF ITS OWN, AND WHICH PAGE THAT IS.
     *
     * `decisions` is the one: `#/decisions` was its own page, that page grew into the governance
     * queue, and the address is kept as a redirect onto it. So the family is still reachable, still
     * from its own key, and the page it opens is named here rather than assumed to share the key.
     */
    const OPENS: Readonly<Record<string, string>> = { decisions: 'governance' }
    for (const key of Object.keys(KIND_FAMILIES)) {
      const route = parseRoute(`#/${key}`)
      expect(route.name, `#/${key} opens the not-found page`).not.toBe('unknown')
      if (route.name === 'family') {
        expect(route.family).toBe(key)
      } else {
        expect(route.name, `#/${key} opens a page that is not about ${key}`).toBe(OPENS[key] ?? key)
      }
    }
  })

  it('sends every address the vocabulary pass renamed to the page that replaced it', () => {
    // An address is a label too — it is what a person pastes to a colleague — so a bookmark to the
    // old one lands on the right page and the shell then rewrites the bar. `#/belief` held four
    // kinds under one word and is now two pages; it lands on Decisions, because a question waiting
    // on you is the only thing in the old family that was ever urgent.
    expect(parseRoute('#/belief').name).toBe('governance')
    expect(parseRoute('#/maybe')).toEqual({ name: 'family', family: 'ideas' })
    expect(parseRoute('#/happened')).toEqual({ name: 'family', family: 'notes' })
    // And the new addresses are not themselves renamed, which would send a reader round a loop.
    expect(renamedAddress('#/ideas')).toBe(null)
    expect(renamedAddress('#/notes')).toBe(null)
    // `#/decisions` IS ITSELF RENAMED NOW, onto the queue that absorbed it — so `#/belief` points
    // at the queue rather than at it, because a rename whose destination is itself renamed would
    // send a reader round a loop and the router refuses that outright.
    expect(renamedAddress('#/decisions')).toBe('/governance')
    expect(renamedAddress('#/governance')).toBe(null)
  })

  it('parses #/plan/today as its own route rather than as a period', () => {
    // The bug this closes: "today" and "day" resolved to the identical address, so the day pill
    // drew as current, the today pill never could, and pressing it fired no navigation at all.
    const route = parseRoute('#/plan/today')
    expect(route.name).toBe('plan')
    expect(route.name === 'plan' ? route.today : undefined).toBe(true)
    expect(route.name === 'plan' ? route.period : 'set').toBeUndefined()
  })

  it('still refuses a period that is a typo, which is what the today case must not weaken', () => {
    expect(parseRoute('#/plan/next-week').name).toBe('unknown')
  })
})
