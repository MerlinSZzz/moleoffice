// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Invariant 9: the trace vocabulary lives in releasing.ts, including the words the model is asked for. */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRefusal, readRelease, TRACED_HOW } from '../src/shared/releasing.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** Every CODE file under src/. Invariant 9 is about code spelling the words a second time. The rules'
 * own text (src/config/rules/, the regulations a fresh office copies) is prose, and its ordinary English
 * can hold a whole phrase the scan matches: chapter 8 rule 5 said that nothing
 * written in a test world is the person's word. That is not a second declaration. Merge entry Ct15r9nfLbVr
 * bounced on 2 October 2026 when src/config/rules/default-regulations.json reached main holding that
 * prose. The default set no longer carries that rule, and any rule's prose may hold such a phrase again. */
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(full) : CODE.test(entry.name) ? [relative(SRC, full)] : []
  }).sort()
}

describe('a trace reader supplies no absent evidence', () => {
  // MUTATION: return { traced: lines } when no valid line remains; this case goes red.
  it('omits traced on both releases and refusals when there is no valid line', () => {
    const by = { kind: 'agent', id: 'synthetic-checker' }
    for (const traced of [undefined, [], [null], [{ paths: [], to: 'synthetic-note', how: TRACED_HOW[0], said: 'Synthetic permission.' }]]) {
      const release = readRelease({ by, how: 'an inspector', traced })
      const refusal = readRefusal({ by, traced })
      expect(release).not.toBeNull()
      expect(refusal).not.toBeNull()
      expect(release).not.toHaveProperty('traced')
      expect(refusal).not.toHaveProperty('traced')
    }
  })
})
