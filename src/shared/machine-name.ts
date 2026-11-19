// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MACHINE'S NAME, AS THE OFFICE STORES ONE: the one rule, in a file that opens no database.
 *
 * The owner's table of which address is which machine comes from a decision. It is in
 * src/server/lib/machine-names.ts and stores names in this form, and tools/register-a-run.mjs checks a --machine name
 * by it before anything is sent. A tool that imported the server's file would open the office's database, so the rule
 * is here and both import it.
 */

/** The longest a machine's name may be. A word or two; anything longer is not a name. */
export const LONGEST_MACHINE_NAME = 40

/**
 * A MACHINE'S NAME IN THE ONE FORM IT IS STORED IN, or a sentence saying why these words are not one.
 *
 * Spaces around it are dropped and runs of spaces inside it become one. It must be 1 to 40 characters, with no
 * line break or other control character.
 */
export function theNameAsStored(written: string): { name: string } | { why: string } {
  const name = written.trim().replace(/\s+/g, ' ')
  if (name === '') return { why: 'The name is empty.' }
  if (name.length > LONGEST_MACHINE_NAME) {
    return { why: `The name is ${String(name.length)} characters long, and a machine's name may be at most ${String(LONGEST_MACHINE_NAME)}.` }
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return { why: 'The name holds a control character.' }
  return { name }
}
