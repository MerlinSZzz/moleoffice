// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE OF THE AGENTS AT WORK IS CALLED "AGENTS AT WORK", 在岗智能体 IN CHINESE, as point 1 of a decision
 * says.
 *
 * Wave 13y round 120, item 55. The page that stayed after the older built-in map was deleted was still called
 * "Office Map", the name of the map it used to draw, at the address `#/working`. Its name is now "Agents at work"
 * in English and 在岗智能体 in Chinese, and no phrasing built on who, nobody or somebody may come into the new
 * words.
 *
 * WHAT THIS FILE HOLDS, from the address map, with no browser:
 *   3. The address. The page is at `#/agents-at-work`. `#/working` lands on it, and the shell writes the new
 *      address in the bar.
 *
 * tests/app-routes.test.ts holds the renamed addresses as a table. This file holds the address the rename gave it.
 *
 * CONTROL: red before the change, all four cases: the English is "Office Map", the Chinese 办公地图 and
 * 正在工作的智能体, `#/agents-at-work` is not an address, and the category line begins "Who is working".
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   3. The line `working: 'agents-at-work'` is taken out of RENAMED_ADDRESSES. Case 3 goes red.
 *
 * WHAT IS REAL: the address map as the router reads it. Nothing is made up.
 */
import { describe, expect, it } from 'vitest'
import { parseRoute, pathFor, renamedAddress } from '../src/web/components/router.tsx'

describe('the page of the agents at work', () => {
  it('3. is at #/agents-at-work, and #/working lands there', () => {
    expect(pathFor('working')).toBe('/agents-at-work')
    expect(parseRoute('#/agents-at-work')).toEqual({ name: 'working' })
    expect(parseRoute('#/working')).toEqual(parseRoute('#/agents-at-work'))
    expect(renamedAddress('#/working')).toBe('/agents-at-work')
  })
})
