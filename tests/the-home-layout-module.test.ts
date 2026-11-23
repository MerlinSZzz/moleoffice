// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LAYOUT, IN THE ONE MODULE THAT DEFINES IT. Home has parts: the key items, Needs you, Agents at work,
 * Schedule and the figures. A layout puts each of them once in one of four places: a band across the whole width,
 * the first column, the second column, or hidden. It also keeps which projects Home shows: every project, or one.
 * The door that keeps a person's layout and the page that draws it both read src/shared/home-layout.ts, so this
 * file holds the shapes, the check of a stored layout, the reading of an older kept layout and every move.
 */
import { describe, expect, it } from 'vitest'
import { EVERY_PROJECT } from '../src/shared/across-projects.ts'
import {
  HOME_DRAWN_PLACES, HOME_FIGURES, HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C, HOME_PARTS, applyMenuMove, chooseTheProject,
  drawnPlaces, homeLayoutSettingName, menuMovesFor, movePart, placeOf, problemsWithTheHomeLayout, stackedOrder,
  theHomeLayoutReadIn, type HomeLayout,
} from '../src/shared/home-layout.ts'

const PICTURES: readonly HomeLayout[] = [HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C]
const HIS_NUMBERS = ['myChecklist', 'myDecisions', 'myDecisionTime'] as const
const HIDDEN_AT_FIRST = ['packagesByLine', 'packagesDone', 'timeToLive', 'suiteMinutes'] as const

describe('each person\'s row', () => {
  it('keeps each person in a row of their own', () => {
    expect(homeLayoutSettingName('made-up-one')).not.toBe(homeLayoutSettingName('made-up-two'))
    expect(homeLayoutSettingName('made-up-one')).toContain('made-up-one')
  })
})

describe('the parts and the first layout', () => {
  it('has the key items, the three parts, his three numbers and the four figures, each once', () => {
    expect(HOME_PARTS).toEqual(['keyItems', 'needs', 'agents', 'schedule', ...HOME_FIGURES])
    expect(HOME_FIGURES).toEqual([...HIS_NUMBERS, ...HIDDEN_AT_FIRST])
    expect(new Set(HOME_PARTS).size).toBe(HOME_PARTS.length)
  })

  it('draws the key items first, then his three numbers after the schedule, hides the other figures, and shows every project', () => {
    expect(HOME_LAYOUT_A).toEqual({
      band: [], first: ['keyItems', 'needs', 'agents', 'schedule', ...HIS_NUMBERS], second: [],
      hidden: [...HIDDEN_AT_FIRST], project: EVERY_PROJECT,
    })
    for (const layout of PICTURES) {
      expect(stackedOrder(layout)[0] === 'keyItems' || layout.band.length > 0, JSON.stringify(layout)).toBe(true)
      expect(layout.project).toBe(EVERY_PROJECT)
    }
  })
})

describe('the check of a layout the door is asked to keep', () => {
  it('finds a problem in a layout that leaves out a part, places one twice, names something unknown, has no project or is no layout, and none in the three pictures', () => {
    const whole = { band: [], first: [...HOME_PARTS], second: [], hidden: [], project: EVERY_PROJECT }
    const bad: unknown[] = [
      null,
      'needs',
      [],
      { ...whole, first: HOME_PARTS.filter(part => part !== 'schedule') },
      { ...whole, second: ['needs'] },
      { ...whole, first: [...HOME_PARTS, 'made-up-part'] },
      { ...whole, third: [] },
      { band: [], first: [...HOME_PARTS], second: [], hidden: [] },
      { band: [], first: [...HOME_PARTS], second: [], project: EVERY_PROJECT },
      { ...whole, project: '' },
      { ...whole, project: 7 },
      { ...whole, band: 'agents' },
      { ...whole, first: [...HOME_PARTS, 7] },
    ]
    for (const value of bad) expect(problemsWithTheHomeLayout(value), JSON.stringify(value)).not.toEqual([])
    for (const layout of PICTURES) expect(problemsWithTheHomeLayout(layout), JSON.stringify(layout)).toEqual([])
    expect(problemsWithTheHomeLayout(whole)).toEqual([])
    expect(problemsWithTheHomeLayout({ ...whole, project: 'made-up-project' })).toEqual([])
  })
})

describe('an older kept layout, read into today\'s shape', () => {
  it('reads a layout kept with three parts and no hidden list or project: nothing it held is lost, and nothing is refused', () => {
    const old = { band: ['agents'], first: ['schedule'], second: ['needs'] }
    const read = theHomeLayoutReadIn(old)
    expect(read.problems).toEqual([])
    expect(read.layout.band.slice(0, 1)).toEqual(['agents'])
    expect(read.layout.first.slice(0, 1)).toEqual(['schedule'])
    expect(read.layout.second).toEqual(['needs'])
    expect(read.layout.project).toBe(EVERY_PROJECT)
    expect([...read.filledIn].sort()).toEqual(['keyItems', ...HOME_FIGURES].sort())
    // Each part it did not hold goes where layout A puts it.
    for (const part of read.filledIn) expect(placeOf(read.layout, part), part).toBe(placeOf(HOME_LAYOUT_A, part))
    expect(problemsWithTheHomeLayout(read.layout)).toEqual([])
    // The value read is left as it was.
    expect(old).toEqual({ band: ['agents'], first: ['schedule'], second: ['needs'] })
  })

  it('reads a layout kept with only some of the old parts, and one in today\'s shape as it is', () => {
    const some = theHomeLayoutReadIn({ band: [], first: ['needs'], second: [] })
    expect(some.problems).toEqual([])
    expect(some.layout.first[0]).toBe('needs')
    expect(problemsWithTheHomeLayout(some.layout)).toEqual([])
    const today = { ...HOME_LAYOUT_B, project: 'made-up-project' }
    expect(theHomeLayoutReadIn(today)).toEqual({ layout: today, filledIn: [], problems: [] })
  })

  it('cannot read a value that is no layout, holds a part Home does not have, or holds a part twice, and draws A', () => {
    for (const value of [null, 'needs', { first: ['needs'] }, { band: [], first: ['made-up-part'], second: [] }, { band: ['needs'], first: ['needs'], second: [] }]) {
      const read = theHomeLayoutReadIn(value)
      expect(read.problems, JSON.stringify(value)).not.toEqual([])
      expect(read.layout).toEqual(HOME_LAYOUT_A)
    }
  })
})

describe('a move', () => {
  it('takes a dragged part out of where it was and puts it at the place and position it was dropped on, so drags make B from A and C from B', () => {
    const one = movePart(HOME_LAYOUT_A, 'agents', 'second', 0)
    expect(drawnPlaces(one)).toEqual({ band: [], first: ['keyItems', 'needs', 'schedule', ...HIS_NUMBERS], second: ['agents'] })
    const b = movePart(one, 'schedule', 'second', 1)
    expect(b).toEqual(HOME_LAYOUT_B)
    const c = movePart(HOME_LAYOUT_B, 'agents', 'band', 0)
    expect(c).toEqual(HOME_LAYOUT_C)
    expect(movePart(HOME_LAYOUT_A, 'needs', 'first', 0).first.slice(0, 2)).toEqual(['needs', 'keyItems'])
    // The layout it was handed is left as it was.
    expect(HOME_LAYOUT_A.first).toEqual(['keyItems', 'needs', 'agents', 'schedule', ...HIS_NUMBERS])
  })

  it('hides a drawn part from its menu, and shows a hidden part in one of the three drawn places', () => {
    expect(menuMovesFor(HOME_LAYOUT_A, 'keyItems')).toEqual(['down', 'band', 'second', 'hidden'])
    expect(menuMovesFor(HOME_LAYOUT_A, 'myDecisionTime')).toEqual(['up', 'band', 'second', 'hidden'])
    expect(menuMovesFor(HOME_LAYOUT_C, 'agents')).toEqual(['first', 'second', 'hidden'])
    expect(menuMovesFor(HOME_LAYOUT_A, 'suiteMinutes')).toEqual([...HOME_DRAWN_PLACES])
    const hidden = applyMenuMove(HOME_LAYOUT_A, 'needs', 'hidden')
    expect(hidden.hidden).toEqual([...HIDDEN_AT_FIRST, 'needs'])
    expect(stackedOrder(hidden)).not.toContain('needs')
    const shown = applyMenuMove(HOME_LAYOUT_A, 'packagesDone', 'second')
    expect(shown.second).toEqual(['packagesDone'])
    expect(shown.hidden).not.toContain('packagesDone')
  })

  it('makes each menu move, and every move from every picture makes a layout with no problem that keeps its project', () => {
    for (const layout of [...PICTURES, chooseTheProject(HOME_LAYOUT_B, 'made-up-project')]) {
      for (const part of HOME_PARTS) {
        for (const move of menuMovesFor(layout, part)) {
          const moved = applyMenuMove(layout, part, move)
          expect(problemsWithTheHomeLayout(moved), `${part} ${move}`).toEqual([])
          expect(moved, `${part} ${move}`).not.toEqual(layout)
          expect(moved.project, `${part} ${move}`).toBe(layout.project)
        }
      }
    }
  })
})

describe('the choice of projects', () => {
  it('keeps the places as they were and changes only the project', () => {
    const one = chooseTheProject(HOME_LAYOUT_C, 'made-up-project')
    expect(one).toEqual({ ...HOME_LAYOUT_C, project: 'made-up-project' })
    expect(chooseTheProject(one, EVERY_PROJECT)).toEqual(HOME_LAYOUT_C)
  })
})

describe('where a part is, and the order on a narrow screen', () => {
  it('says the place of each part, hidden included', () => {
    expect(placeOf(HOME_LAYOUT_C, 'agents')).toBe('band')
    expect(placeOf(HOME_LAYOUT_C, 'needs')).toBe('first')
    expect(placeOf(HOME_LAYOUT_C, 'schedule')).toBe('second')
    expect(placeOf(HOME_LAYOUT_C, 'timeToLive')).toBe('hidden')
  })

  it('stacks the band, then the first column, then the second, and leaves the hidden parts out', () => {
    expect(stackedOrder(HOME_LAYOUT_A)).toEqual(['keyItems', 'needs', 'agents', 'schedule', ...HIS_NUMBERS])
    expect(stackedOrder(HOME_LAYOUT_B)).toEqual(['keyItems', 'needs', ...HIS_NUMBERS, 'agents', 'schedule'])
    expect(stackedOrder(HOME_LAYOUT_C)).toEqual(['agents', 'keyItems', 'needs', ...HIS_NUMBERS, 'schedule'])
  })
})
