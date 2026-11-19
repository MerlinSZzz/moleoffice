// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH WORLD A CALLER LIVES IN, AND THE VISIT IT HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C4 of design/messages/ACCEPTANCE.md section 8: *every request from the product's own
 * clients carries the caller's home world.* Two request headers, and one response header for the
 * warning a read is answered with. This file is the only place any of the three is written or read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE NOT `x-mole-office-world`
 * ---------------------------------------------------------------------------------------
 *
 * That name is taken, in the other direction: it is the RESPONSE header criterion G3 put on every
 * reply, saying which world answered. These say which world is ASKING. One name for two opposite
 * facts would be read wrongly by whichever side saw the other's.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * The same reason src/config/world-header.mjs is, written out in full there: the browser app, the
 * session hook and the tools all have to spell these names, and the hook runs on a node that cannot
 * read TypeScript. A second copy of a header name is the defect CLAUDE.md names at the top.
 */

/** The world the caller lives in, as a database identity. Absent means a local, never refused. */
export const HOME_HEADER = 'x-mole-office-home'

/**
 * The world that is home now, on a reply that a caller's remembered home has moved.
 *
 * The request still carries HOME_HEADER with the world the page remembers. When that world is a
 * dead home of this installation, the office answers with this header naming the world that is
 * home now, so the page can rewrite what it remembers and the next request carries the new home.
 * It is a RESPONSE header, which is why it is not on the request-header list in lib/http.ts.
 */
export const HOME_MOVED_HEADER = 'x-mole-office-home-moved'

/** The visit the caller holds, by its office id. Absent means none is claimed. */
export const VISIT_HEADER = 'x-mole-office-visit'

/**
 * What a READ from another world with no visit is told, on the reply.
 *
 * A read is answered in full — a local agent and the person's own curl may read it — so a warning is what is
 * left when a refusal would be wrong. It is one line because a header is one line.
 */
export const VISIT_WARNING_HEADER = 'x-mole-office-visit-warning'
