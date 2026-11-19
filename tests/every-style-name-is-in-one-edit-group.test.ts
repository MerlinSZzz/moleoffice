// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ONE OF THE STYLE NAMES IS EDITED IN ONE OF THE FIVE GROUPS, OR NAMED AS FITTING NONE.
 *
 * theme-groups.ts is the one place the names are sorted. A name added to the list later is either
 * given a group there or named in IN_NO_GROUP with why; it is never left out of the Looks tab unseen.
 */
import { describe, expect, it } from 'vitest'
import { EDIT_GROUPS, FACE_NAMES, IN_NO_GROUP, NAMES_IN_EACH_GROUP, editGroupOf } from '../src/shared/theme-groups.ts'
import { STYLE_NAMES } from '../src/shared/theme-style-names.ts'

describe('the edit groups', () => {
  it('are Colour, Type, Shape, Modules and Controls, in that order', () => {
    expect(EDIT_GROUPS).toEqual(['colour', 'type', 'shape', 'modules', 'controls'])
  })

  it('hold every style name once, and the names in no group are exactly the ones named with a reason', () => {
    const grouped = EDIT_GROUPS.flatMap((group) => NAMES_IN_EACH_GROUP[group])
    expect(new Set(grouped).size).toBe(grouped.length)
    const inNone = STYLE_NAMES.filter((name) => editGroupOf(name) === null)
    expect(inNone).toEqual(Object.keys(IN_NO_GROUP))
    expect(grouped.length + inNone.length).toBe(STYLE_NAMES.length)
    for (const reason of Object.values(IN_NO_GROUP)) expect(reason?.trim()).not.toBe('')
  })

  it('puts the faces in Type, a module\'s count style in Modules and a button in Controls', () => {
    for (const face of FACE_NAMES) expect(editGroupOf(face), face).toBe('type')
    expect(FACE_NAMES.length).toBeGreaterThan(0)
    for (const name of STYLE_NAMES.filter((one) => one.startsWith('--count-'))) expect(editGroupOf(name), name).toBe('modules')
    for (const name of STYLE_NAMES.filter((one) => one.startsWith('--button-'))) expect(editGroupOf(name), name).toBe('controls')
    expect(editGroupOf('color-scheme')).toBe('colour')
  })

  it('gives every group at least one name', () => {
    for (const group of EDIT_GROUPS) expect(NAMES_IN_EACH_GROUP[group].length, group).toBeGreaterThan(0)
  })
})
