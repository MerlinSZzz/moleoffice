// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ENDPOINT, AS THE ROUTER HOLDS IT. The route table in src/server/api/kinds.ts is a list of these, and the access and
 * authority checks in src/server/lib/ read the same shape. It lives here so that those checks need not import an API
 * module to name it; src/server/api/kinds.ts re-exports it under the same name.
 */

import type { KeptHere } from './authority.ts'
import type { OperationName } from './ops.ts'
import type { Reach } from './reach.ts'

/** One endpoint, as the router holds it. */
export interface ApiRoute {
  method: string
  path: string
  /**
   * The sentence this route declared beside itself, when it declared one.
   *
   * Absent means the route said nothing, not that it has nothing to say: `apiIndex` then looks the
   * endpoint up in ALL_ROUTE_NOTES, and answers `description: null` if that has no line either.
   */
  note?: string
  /**
   * WHAT THE CALLER ASKED FOR, which is not which URL it used. Required: a route that declares no
   * operation, or one src/shared/ops.ts does not hold, does not register.
   */
  operation: OperationName
  /**
   * WHETHER ANOTHER MACHINE MAY ASK FOR THIS ROUTE. Required, for the same reason and by the same
   * check. Nothing reads it yet — src/shared/reach.ts says why the declarations land first.
   */
  reach: Reach
  /**
   * WHY ANOTHER MACHINE MAY NOT ASK FOR THIS ROUTE, AND WHAT THE ACT IS. Present exactly when
   * `reach` is `local`, and absent otherwise — a `remote` route refuses nobody for where they are,
   * so a reason on one would be a reason for nothing.
   *
   * `because` is a bucket key and never a sentence: the browser makes the words for the three
   * reasons. `act` is prose, because the acts are open-ended and a browser-side map over every act
   * in the product would be a second list with nothing keeping it in step.
   * `src/shared/authority.ts` holds both rules.
   */
  keptHere?: KeptHere
  /**
   * TRUE WHEN THE SERVER HOLDS THIS REQUEST OPEN instead of answering and closing it.
   *
   * Absent means an ordinary request. A caller has to know: a client that waits for a held-open
   * reply to finish waits for ever, and a measurement of how long requests take that counted one
   * would report a median nobody could act on. `src/server/lib/usage.ts` stores the same flag on
   * every call row, read off the same declaration.
   */
  waits?: true
}
