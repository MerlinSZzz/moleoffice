// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The headers that name who is writing and which project the request is about.
 *
 * This file opens nothing. The HTTP reader and the database-free GET /api index both import
 * these names, so the index cannot publish a spelling the reader does not use.
 */

/**
 * The three headers Mole Office reads, spelled exactly as they have to arrive.
 *
 * ONE DECLARATION, because two things below have to agree about this list: the reader, which looks
 * each name up, and the misspelling check, which refuses everything that looks like one of them and
 * is not. Written twice they would drift, and the drift would be invisible — a name added to the
 * reader and not to the check is a header nobody is refused for getting wrong.
 *
 * Exported so a caller that has to NAME these can use them rather than retype them. The header
 * documentation in `src/server/api/kinds.ts` uses these same names for GET /api.
 */
export const ACTOR_HEADERS = {
  type: 'x-mole-office-actor-type',
  id: 'x-mole-office-actor-id',
  session: 'x-mole-office-session',
} as const

export type ActorHeaderName = (typeof ACTOR_HEADERS)[keyof typeof ACTOR_HEADERS]

/**
 * WHICH PROJECT THIS REQUEST IS WORKING IN. The one input that names a workspace.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A HEADER AND NOT A QUERY PARAMETER OR A FIELD ON THE BODY
 * ---------------------------------------------------------------------------------------
 *
 * Because it applies to every one of the fifty-odd endpoints, including the ones with no body and
 * the ones whose body is somebody else's shape — an archive, a patch, a checklist item. A field
 * would have to be added to every schema and remembered by every caller at every call; a query
 * parameter would have to be appended to every URL including the ones a person types. The actor
 * is exactly the same kind of fact — it applies to everything and belongs to no schema — and it is
 * a header for the same reason, so this is one mechanism rather than two.
 *
 * IT IS NOT AN ACTOR HEADER, and the difference is enforced by the request reader rather than
 * described. Sending it does not make an identity claim, so it does not oblige a caller to send the
 * actor pair — `x-mole-office-workspace` alone is a browser saying which project it is reading,
 * from the person typing by hand, and that is a perfectly complete request.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ABSENCE MEANS, AND WHAT BLANK MEANS
 * ---------------------------------------------------------------------------------------
 *
 * ABSENT is the STATED DEFAULT: `DEFAULT_WORKSPACE` in shared/workspaces.ts, which `GET /api`
 * names in the same words. That is the browser and it is a bare `curl`.
 *
 * PRESENT AND BLANK IS REFUSED, exactly as the three actor headers are and for the same measured
 * reason: a client that builds headers from variables sends precisely this when a variable is
 * unset, and reading it as absence would file the write into a project the caller did not name.
 *
 * A WORKSPACE THAT DOES NOT EXIST IS REFUSED TOO, by `requireWorkspace` in lib/workspaces.ts. That
 * refusal is not part of this name declaration because it needs the database and this file opens
 * none.
 */
export const WORKSPACE_HEADER = 'x-mole-office-workspace'

/**
 * WHICH PAGE A MESSAGE WAS WRITTEN ON, as the page names itself: for example `#/chat`. A message is
 * kept in the message centre and keeps the project and the page where it was written as its mark,
 * `data.writtenIn`.
 *
 * IT CHANGES NO ANSWER AND CLAIMS NOTHING. It is read only when a message is written, and only to be stored as said. So,
 * like the project header, it does not oblige a caller to send the actor pair. Present and blank is refused, as every
 * header in the HTTP reader is, because a client building headers from an unset variable sends exactly that.
 */
export const PAGE_HEADER = 'x-mole-office-page'
