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
 * A PROGRAM SENDS A WHOLE KEY; A BROWSER SENDS TWO HALVES
 * ---------------------------------------------------------------------------------------
 *
 * The local app and a tool hold a whole key and send the key header. A browser is paired once and
 * is given a device key of its own in two halves: a cookie half, and a header half the page keeps
 * in its storage and sends in a header. The two halves are joined into one key in
 * src/server/db/the-key-on-this-request-was-made-for-a-run.ts, and a key that arrived either way is
 * then compared the same way, in src/server/lib/keys.ts, which is the one place a key is compared.
 *
 * IT IS JAVASCRIPT FOR THE SAME REASON src/config/visitor-headers.mjs IS: the browser app, a tool
 * and the server all have to spell the name, and a second copy of a header name is the defect
 * CLAUDE.md names at the top of the file.
 */

/** THE SECRET THE CALLER HOLDS. Absent means the caller proved nothing and the window decides. */
export const KEY_HEADER = 'x-mole-office-key'

/**
 * THE OLD COOKIE, WHICH HELD A WHOLE KEY. It is no key now: a cookie goes to every port of its host, so
 * a whole key in it reached every page on that host. Nothing in the office reads it as a key.
 */
export const KEY_COOKIE = 'mole-office-key'

/**
 * A BROWSER'S DEVICE KEY, IN TWO HALVES. The cookie half is a cookie page JavaScript cannot read. The
 * header half is answered once, in the press's answer, and the page keeps it and sends it in this
 * header. A request is proved by the key only when it carries both halves of one key: a script that
 * reads the page's storage holds one half, and a request another site makes the browser send carries
 * the other. src/server/db/the-key-on-this-request-was-made-for-a-run.ts joins them.
 */
export const DEVICE_HALF_COOKIE = 'mole-office-device-half'

/** The header half's header, beside the cookie half above. */
export const DEVICE_HALF_HEADER = 'x-mole-office-device-half'

/**
 * Where a page keeps the header half: the key in the page's `localStorage`. The pairing page and the
 * waiting update page both read it by this name (src/web/lib/the-device-half.ts and
 * src/server/lib/the-update.ts).
 */
export const DEVICE_HALF_KEY = 'mole-office.device-half'
