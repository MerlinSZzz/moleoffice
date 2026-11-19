// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LAYOUT, IN THE ONE MODULE THAT DEFINES IT. Home has three parts: Needs you, Agents at work and
 * Schedule. A layout puts each of them once in one of three places: a band across the whole width, the
 * first column or the second. The door that keeps a person's layout and the page that draws it both
 * read src/shared/home-layout.ts, so this file holds the shapes, the check of a stored layout and
 * every move in one place.
 */
import { describe, expect, it } from 'vitest'
import {
  HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C, HOME_PARTS, applyMenuMove, homeLayoutSettingName,
  menuMovesFor, movePart, placeOf, problemsWithTheHomeLayout, stackedOrder, type HomeLayout,
} from '../src/shared/home-layout.ts'

const PICTURES: readonly HomeLayout[] = [HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C]

describe('each person\'s row', () => {
  it('keeps each person in a row of their own', () => {
    expect(homeLayoutSettingName('made-up-one')).not.toBe(homeLayoutSettingName('made-up-two'))
    expect(homeLayoutSettingName('made-up-one')).toContain('made-up-one')
  })
})

describe('the check of a stored layout', () => {
  it('finds a problem in a layout that leaves out a part, places one twice, names something unknown or is no layout, and none in the three pictures', () => {
    const bad: unknown[] = [
      null,
      'needs',
      [],
      { band: [], first: ['needs', 'agents'], second: [] },
      { band: [], first: ['needs', 'agents', 'schedule'], second: ['needs'] },
      { band: [], first: ['needs', 'agents', 'schedule', 'made-up-part'], second: [] },
      { band: [], first: ['needs', 'agents', 'schedule'], second: [], third: [] },
      { first: ['needs', 'agents', 'schedule'], second: [] },
      { band: 'agents', first: ['needs', 'schedule'], second: [] },
      { band: [], first: ['needs', 'agents', 7], second: ['schedule'] },
    ]
    for (const value of bad) expect(problemsWithTheHomeLayout(value), JSON.stringify(value)).not.toEqual([])
    for (const layout of PICTURES) expect(problemsWithTheHomeLayout(layout), JSON.stringify(layout)).toEqual([])
  })
})

describe('a move', () => {
  it('takes a dragged part out of where it was and puts it at the place and position it was dropped on, so drags make B from A and C from B', () => {
    const one = movePart(HOME_LAYOUT_A, 'agents', 'second', 0)
    expect(one).toEqual({ band: [], first: ['needs', 'schedule'], second: ['agents'] })
    // The owner's pictures B and C, as the drags make them.
    const b = movePart(one, 'schedule', 'second', 1)
    expect(b).toEqual({ band: [], first: ['needs'], second: ['agents', 'schedule'] })
    expect(b).toEqual(HOME_LAYOUT_B)
    const c = movePart(HOME_LAYOUT_B, 'agents', 'band', 0)
    expect(c).toEqual({ band: ['agents'], first: ['needs'], second: ['schedule'] })
    expect(c).toEqual(HOME_LAYOUT_C)
    expect(movePart(HOME_LAYOUT_A, 'schedule', 'first', 0)).toEqual({ band: [], first: ['schedule', 'needs', 'agents'], second: [] })
    expect(movePart(HOME_LAYOUT_A, 'needs', 'first', 99)).toEqual({ band: [], first: ['agents', 'schedule', 'needs'], second: [] })
    // The layout it was handed is left as it was.
    expect(HOME_LAYOUT_A).toEqual({ band: [], first: ['needs', 'agents', 'schedule'], second: [] })
  })

  it('offers each part up, down, to the band and to the other column only where the move changes something', () => {
    expect(menuMovesFor(HOME_LAYOUT_A, 'needs')).toEqual(['down', 'band', 'second'])
    expect(menuMovesFor(HOME_LAYOUT_A, 'agents')).toEqual(['up', 'down', 'band', 'second'])
    expect(menuMovesFor(HOME_LAYOUT_A, 'schedule')).toEqual(['up', 'band', 'second'])
    expect(menuMovesFor(HOME_LAYOUT_B, 'schedule')).toEqual(['up', 'band', 'first'])
    expect(menuMovesFor(HOME_LAYOUT_C, 'agents')).toEqual(['first', 'second'])
  })

  it('makes each menu move, and every move from every picture makes a layout with no problem', () => {
    expect(applyMenuMove(HOME_LAYOUT_A, 'agents', 'up')).toEqual({ band: [], first: ['agents', 'needs', 'schedule'], second: [] })
    expect(applyMenuMove(HOME_LAYOUT_A, 'agents', 'down')).toEqual({ band: [], first: ['needs', 'schedule', 'agents'], second: [] })
    expect(applyMenuMove(HOME_LAYOUT_A, 'needs', 'second')).toEqual({ band: [], first: ['agents', 'schedule'], second: ['needs'] })
    expect(applyMenuMove(HOME_LAYOUT_B, 'agents', 'band')).toEqual(HOME_LAYOUT_C)
    expect(applyMenuMove(HOME_LAYOUT_C, 'agents', 'second')).toEqual({ band: [], first: ['needs'], second: ['schedule', 'agents'] })
    for (const layout of PICTURES) {
      for (const part of HOME_PARTS) {
        for (const move of menuMovesFor(layout, part)) {
          const moved = applyMenuMove(layout, part, move)
          expect(problemsWithTheHomeLayout(moved), `${part} ${move}`).toEqual([])
          expect(moved, `${part} ${move}`).not.toEqual(layout)
        }
      }
    }
  })
})

describe('where a part is, and the order on a narrow screen', () => {
  it('says the place of each part', () => {
    expect(placeOf(HOME_LAYOUT_C, 'agents')).toBe('band')
    expect(placeOf(HOME_LAYOUT_C, 'needs')).toBe('first')
    expect(placeOf(HOME_LAYOUT_C, 'schedule')).toBe('second')
  })

  it('stacks the band, then the first column, then the second', () => {
    expect(stackedOrder(HOME_LAYOUT_A)).toEqual(['needs', 'agents', 'schedule'])
    expect(stackedOrder(HOME_LAYOUT_B)).toEqual(['needs', 'agents', 'schedule'])
    expect(stackedOrder(HOME_LAYOUT_C)).toEqual(['agents', 'needs', 'schedule'])
    expect(stackedOrder({ band: [], first: ['schedule'], second: ['needs', 'agents'] })).toEqual(['schedule', 'needs', 'agents'])
  })
})
