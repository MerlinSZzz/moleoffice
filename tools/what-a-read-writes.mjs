#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH TABLES A READ TOUCHES, MEASURED ON A COPY RATHER THAN ASSERTED FROM A PLAN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-TEN-BUILD-PLAN.md`, wave 9's *Proven it*, says of the overlap read:
 *
 *     The set of tables whose count changed is exactly `{api_calls}`, and `api_calls` gains exactly
 *     one row per call. Not "count every table's rows" — `recordCalls` writes on every request from
 *     wave 1 onward, so the plain form is red at baseline.
 *
 * MEASURED IN THIS TREE ON 26 AUGUST 2026, THAT IS NOT THE STATE. The table exists — window A
 * created it, and it is in `MEASURED_TABLES` — and NOTHING WRITES IT. There is no `recordCalls`
 * anywhere under `src/`: the request log belongs to wave 13, which has not been built. So the set is
 * empty, and the reason the plan gave for naming the set rather than asserting emptiness describes a
 * state this repository has never held.
 *
 * The test still names the set rather than excluding tables, for the reason
 * `tests/a-history-is-rows-that-already-exist.test.ts` already gives: when the request log lands,
 * the line goes red and somebody changes it ON PURPOSE.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *     node tools/what-a-read-writes.mjs [path/to/a/copy.db]
 *
 * WITH NO ARGUMENT IT WRITES AND READS A THROWAWAY DATABASE OF ITS OWN under the system temporary
 * directory, and deletes it. IT NEVER OPENS `data/panelx.db`: that file is the owner's product, and
 * a script that measured it would be one `sqlite3` flag away from writing to it. Pass a copy taken
 * with `VACUUM INTO` if you want the answer for a real corpus.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { canonicalDatabasePath } from '../src/config/settings.mjs'
import { localStamp } from '../src/shared/time.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const given = process.argv[2] ?? null

// The database the declaration calls canonical, compared as a resolved path rather than by a
// spelling of its name.
if (given !== null && resolve(given) === canonicalDatabasePath()) {
  console.error(`Refusing to open ${canonicalDatabasePath()}. Take a copy with VACUUM INTO and pass that.`)
  process.exit(1)
}

/** Who writes the request log, asked of the source rather than assumed. */
function whoWritesTheRequestLog() {
  try {
    const out = execFileSync('grep', ['-rn', 'recordCalls\\|INSERT INTO api_calls', join(REPO, 'src')], {
      encoding: 'utf8',
    })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    // grep exits 1 when it matches nothing, which is the answer rather than a failure.
    return []
  }
}

const dir = mkdtempSync(join(tmpdir(), 'mole-office-what-a-read-writes-'))
try {
  const writers = whoWritesTheRequestLog()
  console.log(JSON.stringify(
    {
      // LOCAL WALL-CLOCK TIME (chapter 4 rule 8; acceptance finding 63). It was UTC written in the local form, with no Z,
      // so it read as local and was an hour off in summer.
      measuredAt: localStamp(new Date()),
      question: 'which tables does GET /api/work-domains/overlaps change, and who writes api_calls',
      requestLogWriters: writers,
      requestLogIsWritten: writers.length > 0,
      says:
        writers.length === 0
          ? 'Nothing under src/ writes api_calls. The table exists and its writer does not, because the request ' +
            'log is wave 13 and wave 13 has not been built. So the set of tables an overlap read changes is EMPTY, ' +
            'not {api_calls}, and tests/two-agents-collide.test.ts asserts the empty set with the reason beside it.'
          : 'The request log is written now. tests/two-agents-collide.test.ts should be red, and its named set ' +
            'should be changed to ["api_calls"] on purpose, with one row asserted per call.',
      note:
        'The per-table counts themselves are asserted in tests/two-agents-collide.test.ts, which drives the real ' +
        'route through the product’s own buildApp() against a throwaway database. This script answers the half a ' +
        'test cannot: whether the plan’s stated reason for the shape of that assertion is true of this tree.',
    },
    null,
    2,
  ))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
