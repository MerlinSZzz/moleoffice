// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A WORK SWITCH MAY HOLD. Wave 13q item 17. The settings door checks every change to one of the new work switches
 * here (validateRuntimeValue in ../api/runtime-settings.ts), and the read call checks every stored value here, so the
 * two take the same values and nothing stored is read as some other list.
 *
 * A SKIP LIST holds one entry on each line, with no empty line, no carriage return and no entry twice. A check tag is
 * letters, digits and dashes, and starts with a letter or a digit. A run id is a record id's shape: twelve characters
 * from letters, digits, _ and -. Neither has a space or a comma, so no other way of separating them is taken.
 *
 * THE RECEIPT PRODUCER'S UNFINISHED ATTEMPT is the absolute path of the attempt, on one line.
 */
import { isAbsolute } from 'node:path'

import { AN_ID_SHAPE } from '@shared/messages.ts'
import { OWN_RELEASE_SKIP_RUNS, OWN_RELEASE_SKIP_TAGS, RECEIPT_PRODUCER_PENDING } from '@shared/work-switches.mjs'

const A_CHECK_TAG = /^[A-Za-z0-9][A-Za-z0-9-]*$/

/** What is wrong with a value for one of the new work switches, or null when it may be stored. Any other setting is null. */
export function whatIsWrongWithAWorkSwitch(name: string, value: string): string | null {
  if (name === OWN_RELEASE_SKIP_TAGS) return whatIsWrongWithAList(value, 'check tag', A_CHECK_TAG, 'letters, digits and dashes, starting with a letter or a digit')
  if (name === OWN_RELEASE_SKIP_RUNS) return whatIsWrongWithAList(value, 'run id', AN_ID_SHAPE, '12 characters from letters, digits, _ and -')
  if (name === RECEIPT_PRODUCER_PENDING) {
    if (/[\r\n]/.test(value)) return 'The unfinished attempt is one path on one line.'
    if (!isAbsolute(value)) return `The unfinished attempt is the absolute path of the attempt, and ${JSON.stringify(value)} is not an absolute path.`
  }
  return null
}

function whatIsWrongWithAList(value: string, what: string, shape: RegExp, shapeInWords: string): string | null {
  const seen = new Set<string>()
  for (const [at, entry] of value.split('\n').entries()) {
    const line = `Line ${String(at + 1)}`
    if (entry === '') return `${line} is empty. Put one ${what} on each line, with no empty line.`
    if (!shape.test(entry)) return `${line}, ${JSON.stringify(entry)}, is not a ${what}. A ${what} is ${shapeInWords}, with one on each line.`
    if (seen.has(entry)) return `${line} repeats the ${what} ${entry}. Put each ${what} on the list once.`
    seen.add(entry)
  }
  return null
}

/** The entries of a skip list the check has taken, in the order they were written. No list is no entries. */
export function theEntriesOf(value: string | null): string[] {
  return value === null ? [] : value.split('\n')
}
