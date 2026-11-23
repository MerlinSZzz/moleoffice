// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ONE TEST OF A KEY IN A LINE OF TEXT, written once for the terminal holder, the server and the page.
 *
 * A terminal reads some characters as keys rather than as text. The holder refuses them in a line it types for
 * somebody other than the person, the office refuses them in a line a secretary prepares, and the page refuses them in
 * a quick input before the holder is asked. If two of these tested differently, a line one of them let through would
 * be refused by the next, and nothing would fail to say the two differ.
 *
 * It holds the C0 controls (Enter, Tab and Escape among them), DEL, and the C1 controls U+0080 to U+009F. A terminal
 * that echoes U+009B reads it as the start of an escape sequence, so the rest of the line can be hidden on the
 * person's screen; U+0085 is the next-line control.
 *
 * It is JavaScript with no Node in it, because the holder runs on plain Node and the page imports it too.
 */

/** A character a terminal reads as a key rather than as text: a C0 control, DEL or a C1 control. */
export const A_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u
