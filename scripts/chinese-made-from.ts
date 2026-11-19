// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHINESE INVOCATION OF scripts/words-made-from.ts. It is kept because the translation tools and one test name
 * this file, and its work is now the general script's: the same list, the same record writer, the language zh.
 *
 *     node scripts/chinese-made-from.ts                    # prints the words waiting for Chinese
 *     node scripts/chinese-made-from.ts --record <key>...  # records that each key's Chinese was made from its English now
 *     node scripts/chinese-made-from.ts --begin            # writes the baseline; refuses once the record exists
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { mainFor, THE_RECORD, recordFileOf, recordedNow as recordedNowIn, theRecordAsText as theRecordAsTextIn } from './words-made-from.ts'

export { THE_RECORD }
export { recordFileOf }

/** The record as the text of zh-made-from.ts. */
export function theRecordAsText(record: Parameters<typeof theRecordAsTextIn>[0]): string {
  return theRecordAsTextIn(record, 'zh')
}

/** The record with each key's fingerprint taken from its English now. */
export function recordedNow(...args: Parameters<typeof recordedNowIn>): ReturnType<typeof recordedNowIn> {
  return recordedNowIn(...args)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  mainFor('zh', process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
