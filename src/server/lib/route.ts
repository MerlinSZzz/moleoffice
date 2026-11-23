// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUTE'S OWN DECLARATIONS, IN THE SHAPE FASTIFY CARRIES TO THE onRoute HOOK.
 *
 * Every /api route says three things about itself beside its handler: a sentence for GET /api,
 * the operation a caller is asking for, and whether another machine may ask for it.
 * `trackApiRoutes` in src/server/api/kinds.ts collects all three as the route registers, and
 * refuses to register a route that left either of the last two out.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT EIGHT
 * ---------------------------------------------------------------------------------------
 *
 * Eight route files each held their own private copy of a `note(sentence)` helper, identical to
 * the character, each with the same comment above it. That was survivable while the thing it
 * built was one string. It stopped being survivable when the declaration grew to three fields
 * from two closed vocabularies: eight copies is eight places to update and eight places to get
 * out of step, which is the defect CLAUDE.md names as this codebase's own. They are one function
 * now, and it lives here because every route file may import from lib and api/kinds.ts may not
 * import from a route file.
 *
 * A route that also sets a body limit spreads this into its options, which is why it returns the
 * whole `{ config }` wrapper rather than the config alone.
 */
import type { OperationName } from '@shared/ops.ts'
import type { Reach } from '@shared/reach.ts'
import type { KeptHere } from '@shared/authority.ts'

/**
 * What a route declares beside itself. `note` is optional; `operation` and `reach` are not.
 *
 * `because` is required exactly when `reach` is `local`, and that is not expressible on one
 * interface — the two overloads below are how the type system says it, and `becauseOn` in
 * api/kinds.ts is how a config built by hand is told the same thing at registration.
 */
export interface RouteDeclaration {
  operation: OperationName
  reach: Reach
  /** Present exactly when `reach` is `local`: why the act stays here, and what the act is. */
  keptHere?: KeptHere
  note?: string
  /**
   * THE DOOR ASKS THE CALLER'S CARD ITSELF, so the role gate's hook leaves this route alone. Set by
   * `theDoorAsksTheCard` below and by nothing else. Such a door asks `whatTheCallersOwnKeyProvesForThisAct` in
   * lib/rolegate.ts, which reads the same declaration the hook reads, and gives its own coded refusal, which a
   * page can draw in its own language. The hook's refusal has no code, and it takes an agent's name without its
   * key before the key window closes. The Casting table's four write doors are the ones that set it
   * .
   */
  theDoorAsksTheCard?: true
  /**
   * THE DOOR CHANGES SOMETHING THOUGH ITS METHOD IS GET, always (`true`) or when its query asks it to (the
   * function). Set by `itChangesSomething` below and by nothing else. A request a listener carried to such a door must
   * carry the office's mark, as every other method must: lib/a-write-a-website-could-send.ts.
   */
  changesSomething?: true | ((query: Readonly<Record<string, unknown>>) => boolean)
}

/**
 * Declare one route: what a caller is asking for, which machines may ask, and the sentence.
 *
 * The short words come first and the sentence last, because a route's sentence is often twenty
 * lines and anything written after it would never be read.
 *
 * A route with no sentence of its own leaves the last argument out. Its line then lives in
 * ROUTE_NOTES in src/server/api/kinds.ts, which is where the older route groups keep theirs.
 *
 * THE KEY IS OMITTED RATHER THAN SET TO UNDEFINED, and that is not tidiness. `noteOn` in
 * api/kinds.ts asks `'note' in config` and throws when the key is there and is not a usable
 * sentence, so `{ note: undefined }` would refuse to register every route that has no sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `local` TAKES ONE MORE WORD THAN `remote`
 * ---------------------------------------------------------------------------------------
 *
 * A route kept on this machine is a refusal a caller elsewhere will meet, and `GET /api/access`
 * publishes it so the browser can decline to draw the control rather than drawing it and being
 * refused. That publication carries WHY, in one of three keys, and the only person who reliably
 * knows which is the one writing `local` in the first place.
 *
 * The two overloads are the whole of the rule: `remote` takes no reason because it refuses nobody,
 * and `local` cannot be written without one. Anything that builds the config object by hand meets
 * the same rule at registration, in `becauseOn`.
 */
export function route(operation: OperationName, reach: 'remote', sentence?: string): { config: RouteDeclaration }
export function route(
  operation: OperationName,
  reach: 'local',
  keptHere: KeptHere,
  sentence?: string,
): { config: RouteDeclaration }
export function route(
  operation: OperationName,
  reach: Reach,
  third?: KeptHere | string,
  fourth?: string,
): { config: RouteDeclaration } {
  const keptHere = reach === 'local' ? (third as KeptHere) : undefined
  const sentence = reach === 'local' ? fourth : (third as string | undefined)
  return {
    config: {
      operation,
      reach,
      ...(keptHere === undefined ? {} : { keptHere }),
      ...(sentence === undefined ? {} : { note: sentence }),
    },
  }
}

/**
 * MARK A ROUTE WHOSE DOOR ASKS THE CALLER'S CARD ITSELF. See `theDoorAsksTheCard` above: the role gate's hook
 * then leaves the route alone, and the door must ask the card before it writes anything.
 */
export function theDoorAsksTheCard(declared: { config: RouteDeclaration }): { config: RouteDeclaration } {
  return { config: { ...declared.config, theDoorAsksTheCard: true } }
}

/**
 * MARK A GET ROUTE WHOSE DOOR CHANGES SOMETHING. See `changesSomething` above. With no `when`, every request to the
 * door changes something; with one, a request changes something when `when` says so of its query.
 */
export function itChangesSomething(
  declared: { config: RouteDeclaration },
  when?: (query: Readonly<Record<string, unknown>>) => boolean,
): { config: RouteDeclaration } {
  return { config: { ...declared.config, changesSomething: when ?? true } }
}
