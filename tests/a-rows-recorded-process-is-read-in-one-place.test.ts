// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROCESS A ROW RECORDED IS READ IN ONE PLACE: `theRecordedProcessOf` in src/config/own-rows.mjs.
 *
 * A session record keeps the process it stood for in `data.extra.discovered`, as a pid and the time that process
 * began. The session hook writes it for a run, and the office's own parts write it for their own rows. Until wave 13y
 * round 31 four functions read it back, each with its own checks:
 *
 *   - `recordedProcessOf` in src/server/lib/sessions.ts, for the sessions door, the answering, the inspection and the
 *     held-process door;
 *   - `theRecordedProcessOf` in src/config/own-rows.mjs, for the office's own rows;
 *   - `recordTheHolder` in src/server/lib/terminals.ts, inline;
 *   - `theProcessOfTheRun` in src/server/lib/terminal-agents.ts, inline, which took any number as a pid.
 *
 * If one of them changed, the others could go on reading the block the old way with nothing failing (invariant 9,
 * and the secretary's item 9.9). Now there is one.
 *
 * WHAT IS PROVED:
 *   - the one reader turns every value it cannot defend into an absence, rather than passing it on.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { theRecordedProcessOf } from '../src/config/own-rows.mjs'

/** Every source file under a folder. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? filesUnder(path) : /\.(ts|tsx|mjs|js)$/.test(name) ? [path] : []
  })
}

describe('the process a row recorded is read in one place', () => {
  it('reads a pid and a start time that can be defended', () => {
    const data = { extra: { discovered: { pid: 4242, pidStartedAt: '2026-10-14 09:00:00' } } }
    expect(theRecordedProcessOf({ data })).toEqual({ pid: 4242, pidStartedAt: '2026-10-14 09:00:00' })
  })

  it('turns every value it cannot defend into an absence', () => {
    const of = (discovered: unknown) => theRecordedProcessOf({ data: { extra: { discovered } } })
    expect(theRecordedProcessOf({ data: {} })).toEqual({ pid: null, pidStartedAt: null })
    expect(theRecordedProcessOf({ data: { extra: [] } })).toEqual({ pid: null, pidStartedAt: null })
    expect(of([4242])).toEqual({ pid: null, pidStartedAt: null })
    for (const pid of [0, -1, 1.5, '4242', null, Number.NaN]) {
      expect(of({ pid, pidStartedAt: '2026-10-14 09:00:00' }), `pid ${String(pid)}`).toEqual({ pid: null, pidStartedAt: '2026-10-14 09:00:00' })
    }
    for (const pidStartedAt of ['', 0, null, {}]) {
      expect(of({ pid: 4242, pidStartedAt }), `start ${JSON.stringify(pidStartedAt)}`).toEqual({ pid: 4242, pidStartedAt: null })
    }
  })
})
