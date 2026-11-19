// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENDED ENTRY'S RESOLUTION CLONE GOES A DAY AFTER IT WAS LAST WRITTEN, UNLESS AN OPEN PROBLEM OR A CURRENT FIX BRIEF
 * NAMES THE ENTRY (wave 13u round 153). A check of a resolution makes <workdir>/resolution/clone, and nothing read it
 * after the check, so each one stayed. tools/merge-tool/ended-resolutions.mjs says when one goes; the merge tool's sweep
 * (tools/merge-tool/office-keeper.mjs) gives it the office's answers and removes what it says goes.
 *
 * EVERY CASE HERE IS MADE UP: the workdirs are folders in a scratch folder, their times are set by the test, and the
 * entries, problems and runs are objects the test hands to the readers. Nothing reads an office.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the day is not waited for: the case of a folder written within the day goes red;
 *   - the clone's git folder's time is not read: the case of a git folder written within the day goes red;
 *   - an entry that has not ended is not kept: its case goes red;
 *   - a fix brief that still waits for its round does not keep the folder: its case goes red;
 *   - a fix brief whose run still runs does not keep the folder: its case goes red;
 *   - a problem nobody gave a state is read as over: its case goes red;
 *   - an open problem does not keep the folder: its case goes red;
 *   - a link at the resolution folder is followed when its time is read: the link case goes red;
 *   - the removal does not check where the folder leads: the case of a folder that leads elsewhere goes red.
 */
import { existsSync, lstatSync, lutimesSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MERGE_STATE_SPECS } from '../src/shared/merge-queue.ts'
import { A_RESOLUTION_IS_KEPT_FOR_MS, removeTheResolution, whetherTheResolutionGoes } from '../tools/merge-tool/ended-resolutions.mjs'

/** A made-up moment the cases are judged at. */
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)
const HOUR = 60 * 60 * 1000
const AN_ENTRY = 'madeUpEntryA'
const A_RUN = 'madeUpRunOne'

let workdirs = ''
let asked: string[] = []

beforeEach(() => {
  workdirs = mkdtempSync(join(tmpdir(), 'ended-resolutions-'))
  asked = []
})

afterEach(() => {
  rmSync(workdirs, { recursive: true, force: true })
})

/** Make <workdirs>/<id>/resolution/clone/.git with a file in it, then set the three folders' times to `ages` hours ago. */
function aResolution(id: string, ages: { folder: number; clone: number; git: number }): string {
  const folder = join(workdirs, id, 'resolution')
  mkdirSync(join(folder, 'clone', '.git'), { recursive: true })
  writeFileSync(join(folder, 'clone', '.git', 'HEAD'), 'ref: refs/heads/made-up\n')
  const at = (hours: number) => new Date(NOW - hours * HOUR)
  utimesSync(join(folder, 'clone', '.git'), at(ages.git), at(ages.git))
  utimesSync(join(folder, 'clone'), at(ages.clone), at(ages.clone))
  utimesSync(folder, at(ages.folder), at(ages.folder))
  return folder
}

const OLD = { folder: 30, clone: 30, git: 30 }

type Problem = { id: string; data: { state?: string } }
type Ask = { for: string; brief?: string; started?: { at: string; run: string }; ended?: { at: string; says: string } }

/** Judge entry `id` with made-up readers, recording each one asked. */
function judge(id: string, { state = 'merged', asks = [] as Ask[], problems = [] as Problem[], runs = {} as Record<string, string> } = {}) {
  return whetherTheResolutionGoes({
    id,
    workdir: join(workdirs, id),
    nowMs: NOW,
    ended: (entry: { state: string }) => (MERGE_STATE_SPECS as Record<string, { final: boolean }>)[entry.state]?.final === true,
    readEntry: async (one: string) => {
      asked.push(`entry ${one}`)
      return { id: one, state, machine: { waitsForAFixRound: { asks } } }
    },
    readRunState: async (run: string) => {
      asked.push(`run ${run}`)
      if (!(run in runs)) throw new Error(`made-up run ${run} was not given to this case`)
      return runs[run]
    },
    problemsNaming: async (one: string) => {
      asked.push(`problems ${one}`)
      return problems
    },
  })
}

describe('when an ended entry\'s resolution folder goes', () => {
  it('goes a day after it was last written, when no problem or fix brief names the entry, and the removal takes the whole folder', async () => {
    const folder = aResolution(AN_ENTRY, OLD)
    const verdict = await judge(AN_ENTRY)
    expect(verdict.goes).toBe(true)
    expect(verdict.says).toBe(`merge entry ${AN_ENTRY} is merged, its resolution folder was last written 30 hours ago, and no open problem or current fix brief names it`)
    removeTheResolution(workdirs, AN_ENTRY)
    expect(existsSync(folder)).toBe(false)
    expect(existsSync(join(workdirs, AN_ENTRY))).toBe(true)
  })

  it('is kept within the day, and no reader is asked', async () => {
    aResolution(AN_ENTRY, { folder: 23, clone: 23, git: 23 })
    const verdict = await judge(AN_ENTRY)
    expect(verdict).toEqual({ goes: false, quiet: true, says: `the resolution folder of merge entry ${AN_ENTRY} was last written 23 hours ago, within the day it is kept` })
    expect(asked).toEqual([])
    expect(A_RESOLUTION_IS_KEPT_FOR_MS).toBe(24 * HOUR)
  })

  it('is kept while the clone\'s git folder was written within the day, though the folder itself is older', async () => {
    aResolution(AN_ENTRY, { folder: 30, clone: 30, git: 2 })
    const verdict = await judge(AN_ENTRY)
    expect(verdict.goes).toBe(false)
    expect(verdict.quiet).toBe(true)
    expect(asked).toEqual([])
  })

  it('is quiet for an entry with no resolution folder', async () => {
    mkdirSync(join(workdirs, AN_ENTRY))
    expect(await judge(AN_ENTRY)).toEqual({ goes: false, quiet: true, says: `merge entry ${AN_ENTRY} has no resolution folder` })
    expect(asked).toEqual([])
  })

  it('is kept while the entry has not ended', async () => {
    aResolution(AN_ENTRY, OLD)
    const verdict = await judge(AN_ENTRY, { state: 'queued' })
    expect(verdict).toEqual({ goes: false, says: `merge entry ${AN_ENTRY} is queued, not ended, so its resolution folder is kept` })
  })

  it('goes for each final state', async () => {
    for (const state of ['merged', 'bounced', 'withdrawn', 'superseded']) {
      const id = `madeUpEntry${state}`
      aResolution(id, OLD)
      expect((await judge(id, { state })).goes).toBe(true)
    }
  })
})

describe('a current fix brief keeps the folder', () => {
  it('is kept while a fix brief for the entry still waits for its round', async () => {
    aResolution(AN_ENTRY, OLD)
    const verdict = await judge(AN_ENTRY, { asks: [{ for: 'made-up line', brief: 'briefs/made-up-fix.md' }] })
    expect(verdict).toEqual({ goes: false, says: `the fix brief briefs/made-up-fix.md for merge entry ${AN_ENTRY} still waits for its round, so the entry's resolution folder is kept` })
  })

  it('is kept while the run a fix brief started still runs, and goes once that run is finished or crashed', async () => {
    aResolution(AN_ENTRY, OLD)
    const asks = [{ for: 'made-up line', brief: 'briefs/made-up-fix.md', started: { at: '2026-11-01T08:00:00', run: A_RUN } }]
    const running = await judge(AN_ENTRY, { asks, runs: { [A_RUN]: 'running' } })
    expect(running).toEqual({ goes: false, says: `the fix brief briefs/made-up-fix.md for merge entry ${AN_ENTRY} is current: its run ${A_RUN} is running, so the entry's resolution folder is kept` })
    expect((await judge(AN_ENTRY, { asks, runs: { [A_RUN]: 'idle' } })).goes).toBe(false)
    expect((await judge(AN_ENTRY, { asks, runs: { [A_RUN]: 'finished' } })).goes).toBe(true)
    expect((await judge(AN_ENTRY, { asks, runs: { [A_RUN]: 'crashed' } })).goes).toBe(true)
  })

  it('goes once the fix brief\'s ask has ended, and an ask with no brief keeps nothing', async () => {
    aResolution(AN_ENTRY, OLD)
    const asks = [
      { for: 'made-up line', brief: 'briefs/made-up-fix.md', ended: { at: '2026-11-01T09:00:00', says: 'made-up end' } },
      { for: 'another made-up line' },
    ]
    expect((await judge(AN_ENTRY, { asks })).goes).toBe(true)
    expect(asked).not.toContain(`run ${A_RUN}`)
  })
})

describe('an open problem keeps the folder', () => {
  it('is kept while an open problem names the entry', async () => {
    aResolution(AN_ENTRY, OLD)
    const verdict = await judge(AN_ENTRY, { problems: [{ id: 'madeUpProblem', data: { state: 'open' } }] })
    expect(verdict).toEqual({ goes: false, says: `problem madeUpProblem names merge entry ${AN_ENTRY} and is open, so the entry's resolution folder is kept` })
  })

  it('is kept while a problem nobody gave a state names the entry', async () => {
    aResolution(AN_ENTRY, OLD)
    const verdict = await judge(AN_ENTRY, { problems: [{ id: 'madeUpProblem', data: {} }] })
    expect(verdict).toEqual({ goes: false, says: `problem madeUpProblem names merge entry ${AN_ENTRY} and is in no state anybody gave, so the entry's resolution folder is kept` })
  })

  it('goes once every problem that names the entry is fixed, worked around or accepted', async () => {
    aResolution(AN_ENTRY, OLD)
    const problems = ['fixed', 'worked_around', 'accepted'].map((state, at) => ({ id: `madeUpProblem${String(at)}`, data: { state } }))
    expect((await judge(AN_ENTRY, { problems })).goes).toBe(true)
  })

  it('stops when the office cannot give every problem that names the entry', async () => {
    aResolution(AN_ENTRY, OLD)
    await expect(
      whetherTheResolutionGoes({
        id: AN_ENTRY,
        workdir: join(workdirs, AN_ENTRY),
        nowMs: NOW,
        ended: () => true,
        readEntry: async () => ({ state: 'merged' }),
        readRunState: async () => 'finished',
        problemsNaming: async () => {
          throw new Error('the office could not give all matching problem records (made up)')
        },
      }),
    ).rejects.toThrow('the office could not give all matching problem records (made up)')
  })
})

describe('only a real folder at the entry\'s own place is removed', () => {
  it('refuses a link at the resolution folder, and leaves what it leads to', async () => {
    const elsewhere = join(workdirs, 'elsewhere')
    mkdirSync(join(elsewhere, 'clone', '.git'), { recursive: true })
    mkdirSync(join(workdirs, AN_ENTRY))
    symlinkSync(elsewhere, join(workdirs, AN_ENTRY, 'resolution'))
    const old = new Date(NOW - 30 * HOUR)
    utimesSync(elsewhere, old, old)
    lutimesSync(join(workdirs, AN_ENTRY, 'resolution'), old, old)
    await expect(judge(AN_ENTRY)).rejects.toThrow(`${join(workdirs, AN_ENTRY, 'resolution')} is a link, so it is left as it is`)
    expect(() => removeTheResolution(workdirs, AN_ENTRY)).toThrow('is a link, so nothing was removed')
    expect(existsSync(join(elsewhere, 'clone', '.git'))).toBe(true)
    expect(lstatSync(join(workdirs, AN_ENTRY, 'resolution')).isSymbolicLink()).toBe(true)
  })

  it('refuses a folder that leads outside the workdirs, and leaves it', () => {
    const outside = mkdtempSync(join(tmpdir(), 'ended-resolutions-outside-'))
    try {
      mkdirSync(join(outside, 'resolution', 'clone'), { recursive: true })
      symlinkSync(outside, join(workdirs, AN_ENTRY))
      expect(() => removeTheResolution(workdirs, AN_ENTRY)).toThrow(`leads to ${join(realpathSync(outside), 'resolution')}`)
      expect(existsSync(join(outside, 'resolution', 'clone'))).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('refuses a name that is not one folder', () => {
    for (const id of ['', '.', '..', 'a/b', 'a\\b']) expect(() => removeTheResolution(workdirs, id)).toThrow('is not an entry\'s folder name, so nothing was removed')
  })
})
