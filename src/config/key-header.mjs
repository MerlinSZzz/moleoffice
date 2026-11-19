// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE A CALLER CARRIES THE OFFICE'S KEY. Criterion P83, point 1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A KEY IS, AND WHY IT IS NOT AN ACTOR HEADER
 * ---------------------------------------------------------------------------------------
 *
 * The three actor headers say who a write is ATTRIBUTED to. They are the caller's own word for
 * itself and they refuse nothing by themselves. A key is different: a request is the person only
 * when it carries the person's key, and the person's own doors ask for it. The two are separate
 * facts and this file is the one declaration of the second one's names.
 *
 * ---------------------------------------------------------------------------------------
 * THE HEADER AND THE COOKIE ARE THE SAME SECRET
 * ---------------------------------------------------------------------------------------
 *
 * The local app holds the key and sends the header. The local browser is paired once and the office
 * sets the cookie; the pairing page is a later piece, and this name is where it will write. A key
 * that arrived either way is compared the same way, in src/server/lib/keys.ts, which is the one
 * place a key is read or compared.
 *
 * IT IS JAVASCRIPT FOR THE SAME REASON src/config/visitor-headers.mjs IS: the browser app, a tool
 * and the server all have to spell the name, and a second copy of a header name is the defect
 * CLAUDE.md names at the top of the file.
 */

/** THE SECRET THE CALLER HOLDS. Absent means the caller proved nothing and the window decides. */
export const KEY_HEADER = 'x-mole-office-key'

/**
 * THE SAME SECRET, AS THE COOKIE THE PAIRING PAGE WILL SET. The pairing page is not built in this
 * piece; the name is declared here so the door can read it the day it is.
 */
export const KEY_COOKIE = 'mole-office-key'
