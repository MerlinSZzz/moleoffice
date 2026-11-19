// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue. The browser's doors to worlds, the embassy, pairing and faults. Wave 13y's
// round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own
// part, and src/web/api-parts/join.ts joins every part into `api`.
import { type WhatTheOfficeSays, request } from '../api.ts'
import { PAGE_SHAPE } from '@shared/short-lists.ts'
import type { EmbassyView, WhatTheEmbassyPageSays, World as WorldOnTheWire } from '@shared/worlds.ts'
import type { WhatTheHeaderOnlyCallersSay } from '@shared/headeronlycalls.ts'
import type { WhatAskingToPairSays, WhatThePairingSays } from '@shared/pairing.ts'

/** The page of the Embassy a view asks for, as a path. The view's flags are the only query it sets. */
function theEmbassyPageUrl(onThePage: Partial<EmbassyView>): string {
  const query = new URLSearchParams({ shape: PAGE_SHAPE })
  if (onThePage.everyone) query.set('everyone', '1')
  if (onThePage.retired) query.set('retired', '1')
  if (onThePage.tests) query.set('tests', '1')
  return `/api/office/embassy?${query.toString()}`
}

export const worldsDoors = {

  // ------------------------------------------------------------------ the office, criteria C2 to C8

  /** Every world this installation has had, and where the list came from. */
  worlds: () => request<WhatTheOfficeSays>('/api/office/worlds'),

  /**
   * WHO THE OFFICE KNOWS: one page of citizens and visitors, and the counts the page's presses say.
   * Criterion M52.
   *
   * ONE CALL AND NOT THREE. The roll, the trips and who is a contact are three answers, and three
   * calls would be three clocks with one page drawn from all of them.
   *
   * IT ASKS FOR THE PAGE'S SHAPE. The whole roll was megabytes and seconds on a made-up office of the
   * live size, and the page draws forty rows of it. `next` is the path of the next page, handed back
   * by the office, so the page never works out where it is. `onThePage` says which view is wanted.
   */
  embassy: (onThePage: Partial<EmbassyView> & { next?: string | null } = {}) =>
    request<WhatTheEmbassyPageSays>(onThePage.next ?? theEmbassyPageUrl(onThePage)),

  /**
   * ONE ROW, for a panel that draws one participant's keys and must not read the whole roll to find
   * it. `row` is `agent:<id>`, `person:<id>` or `credential:<id>`; the office refuses anything else.
   */
  embassyRow: (row: string) =>
    request<WhatTheEmbassyPageSays>(`${theEmbassyPageUrl({})}&row=${encodeURIComponent(row)}`),

  /**
   * A FAULT ON A PAGE, FILED AS A PROBLEM BY THE OFFICE. Criterion E4, the filing half.
   *
   * THE OFFICE FILES IT AND NOT THIS BROWSER. This call carries the person's own headers, like
   * every other call from here, and the door throws them away: the problem is written under the
   * office's own name. A problem attributed to the person would say they found and reported a fault that
   * nobody found — a page stopped, and the office wrote down what it stopped with.
   *
   * IT IS SENT ONCE PER FAULT PER READING and the door holds that rule, not this file: a repeat
   * answers with the problem it already filed, so the panel draws the same link either way.
   */
  fileAFault: (said: {
    message: string
    page: string | null
    press: string | null
    route: string | null
    reading: string
    what: 'while-drawing' | 'while-sending'
  }) =>
    request<{ problem: string; filed: boolean; says: string }>('/api/office/faults', {
      method: 'POST',
      body: JSON.stringify(said),
    }),

  /**
   * WHO HAS CALLED WITH A CLAIM AND NO KEY. Criterion P83, point 6.
   *
   * Read-only, and read by the Settings panel the person looks at before they close the window.
   */
  headerOnlyCallers: () => request<WhatTheHeaderOnlyCallersSay>('/api/office/header-only-calls'),

  /**
   * WHETHER THIS BROWSER IS PAIRED, WHETHER PAIRING IS OFFERED, WHETHER IT MAY ASK, AND WHAT IT IS
   * WAITING ON. Criterion P83, point 2, and the amendment of 13 September 2026 at 18:50.
   *
   * Read by the pairing page for all four answers, and read by the shell once so a first visit on
   * the office's own computer, or on a machine the office trusts, opens the pairing page. `offered`
   * is true only on the machine Mole Office runs on; `mayAsk` is true only for a trusted machine.
   */
  pairing: () => request<WhatThePairingSays>('/api/office/pairing'),

  /**
   * PAIR THIS BROWSER, IN ONE PRESS. The reply sets the person's key as an HttpOnly cookie and the
   * browser attaches it to every request from then on, because the transport sends credentials.
   */
  pairThisBrowser: () => request<WhatThePairingSays>('/api/office/pairing', { method: 'POST' }),

  /**
   * ASK TO PAIR FROM A MACHINE THE OFFICE TRUSTS, UNDER A NAME THIS BROWSER GIVES ITSELF. It receives
   * a person's-device credential's token as the same HttpOnly cookie and NEVER the token in the
   * reply; nothing works until the person confirms the credential at the Embassy.
   */
  askToPairThisBrowser: (device: string) =>
    request<WhatAskingToPairSays>('/api/office/pairing/ask', {
      method: 'POST',
      body: JSON.stringify({ device }),
    }),

  /** The name a person reads for a world. The identity of a world is its database and does not move. */
  renameWorld: (id: string, name: string) =>
    request<{ world: WorldOnTheWire }>(`/api/office/worlds/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  /**
   * STOP A WORLD KEPT UP FOR SOMEBODY TO LOOK AT, AND MARK IT ENDED. Criterion C32.
   *
   * It stops the processes the office recorded for the world through the one release door, which
   * names what it would end, and closes the row with the reason given. `stopped` and `couldNotStop`
   * come back so a page can say what really happened rather than assuming every process died.
   */
  stopWorld: (id: string, because: string) =>
    request<{ world: WorldOnTheWire; stopped: string[]; couldNotStop: { id: string; why: string }[] }>(
      `/api/office/worlds/${encodeURIComponent(id)}/stop`,
      { method: 'POST', body: JSON.stringify({ because }) },
    ),
}
