// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENTRY THAT CHANGES THE QUEUE'S OWN CODE MAY RIDE A BUS WHEN A LANDING CHANGES NEITHER THE OFFICE NOR THE MERGE
 * TOOL (13u round 66). The rule that tests such an entry alone guards an office and a merge tool that run from the
 * checkout the entry lands on. When both run from another checkout, it may ride, as the first entry or as a rider. The
 * decision is `whetherTheQueuesOwnCodeMayRide` in tools/merge-tool/the-stable-office.mjs, and pairs.mjs asks it with
 * the office's runtime answer, the folder the merge tool runs from and the switch's position. The bus cases that run
 * the real tool are in tests/the-merger-bus.test.ts and tests/the-merger-suite.test.ts.
 *
 * WHAT THIS FILE PROVES, on throwaway folders:
 *
 *   1. It rides when the office and the merge tool both run from folders outside the lane's checkout.
 *   2. It is tested alone when the office runs from the lane's checkout, from a link to it, or from a folder in it.
 *   3. It is tested alone when the merge tool runs from the lane's checkout or from a folder in it.
 *   4. It is tested alone, and says why, when where the office runs cannot be read: no answer, no folder named, a name
 *      that is not text, or a folder that is not here. So it is when the merge tool's folder is not here.
 *   5. It is tested alone when the switch is 0, or holds anything but 1 or 0.
 *   6. The switch is a row of the process class's switches, which the person or a secretary may change, with both
 *      defaults 1. It is read through its row, and an environment of its own is read on its own.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { whetherTheQueuesOwnCodeMayRide } from '../tools/merge-tool/the-stable-office.mjs'
import { queueCodeRidesABus } from '../src/config/queue-code-rides-a-bus.mjs'
import { gateNamed } from '../src/config/gates.mjs'

const ROW = gateNamed('queue-code-rides-a-bus')

let folder: string
let lane: string
let stable: string
let tool: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'queue-code-rides-'))
  lane = join(folder, 'lane')
  stable = join(folder, 'stable')
  tool = join(folder, 'tool')
  for (const one of [lane, stable, tool]) mkdirSync(one)
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** The decision with the switch at 1, the office at `office` and the merge tool at `from`. */
function decided(office: unknown, from = tool, position: string | null = '1') {
  return whetherTheQueuesOwnCodeMayRide({ root: lane, position, setting: ROW.setting, runtime: office === undefined ? null : { repository: { path: office } }, tool: from })
}

describe("whether the queue's own code may ride a bus", () => {
  it('rides when the office and the merge tool both run from outside the lane', () => {
    expect(decided(stable)).toEqual({ rides: true, says: `the office runs from ${stable} and the merge tool from ${tool}, and a landing on ${lane} changes neither, so it may ride` })
    expect(decided(stable, stable).rides).toBe(true)
  })

  it('is tested alone when the office runs from the lane, from a link to it, or from a folder in it', () => {
    const link = join(folder, 'link-to-the-lane')
    symlinkSync(lane, link)
    const inside = join(lane, 'inside')
    mkdirSync(inside)
    for (const office of [lane, link, inside]) {
      expect(decided(office)).toEqual({ rides: false, says: `the office runs from ${office}, which a landing on ${lane} changes, so it is tested alone` })
    }
  })

  it('is tested alone when the merge tool runs from the lane or from a folder in it', () => {
    const inside = join(lane, 'tools-checkout')
    mkdirSync(inside)
    for (const from of [lane, inside]) {
      expect(decided(stable, from)).toEqual({ rides: false, says: `the merge tool runs from ${from}, which a landing on ${lane} changes, so it is tested alone` })
    }
  })

  it('is tested alone, and says so, when where the office runs cannot be read', () => {
    const noFolder = 'the office gave no runtime answer naming the folder it runs from, so it is tested alone'
    expect(whetherTheQueuesOwnCodeMayRide({ root: lane, position: '1', setting: ROW.setting, runtime: null, tool })).toEqual({ rides: false, says: noFolder })
    expect(whetherTheQueuesOwnCodeMayRide({ root: lane, position: '1', setting: ROW.setting, runtime: {}, tool })).toEqual({ rides: false, says: noFolder })
    expect(whetherTheQueuesOwnCodeMayRide({ root: lane, position: '1', setting: ROW.setting, runtime: { repository: {} }, tool })).toEqual({ rides: false, says: noFolder })
    expect(decided(7)).toEqual({ rides: false, says: noFolder })
    const gone = join(folder, 'not-here')
    expect(decided(gone)).toEqual({ rides: false, says: `the office says it runs from ${gone}, which is not a folder here, so it is tested alone` })
    expect(decided(stable, gone)).toEqual({ rides: false, says: `the merge tool runs from ${gone}, which is not a folder here, so it is tested alone` })
  })

  it('is tested alone when the switch is 0, or holds anything but 1 or 0', () => {
    expect(decided(stable, tool, '0')).toEqual({ rides: false, says: `${ROW.setting} is 0, so it is tested alone` })
    for (const position of ['yes', '', null]) {
      expect(decided(stable, tool, position)).toEqual({ rides: false, says: `${ROW.setting} is ${JSON.stringify(position)}, which is neither 1 nor 0, so it is tested alone` })
    }
  })
})

describe('the switch', () => {
  it('is a process switch the person or a secretary may change, on by default, counted by the merge tool', () => {
    expect(ROW).toMatchObject({ class: 'process', group: 'switches', positions: { kind: 'switch' }, whoMayChange: 'the-person-or-a-secretary', defaults: { buildsMoleOffice: '1', ordinary: '1' }, countedBy: 'the-merge-tool' })
  })

  it('is read through its row, and an environment of its own is read on its own', () => {
    expect(queueCodeRidesABus({})).toEqual({ id: ROW.id, setting: ROW.setting, position: '1' })
    expect(queueCodeRidesABus({ [ROW.setting]: '0' })).toEqual({ id: ROW.id, setting: ROW.setting, position: '0' })
  })
})
