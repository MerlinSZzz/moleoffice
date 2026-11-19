// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIVE GROUPS A PERSON EDITS A THEME IN, AND WHICH OF THE 201 STYLE NAMES IS IN EACH.
 *
 * This is the one place the names are sorted. The Looks tab draws one group per heading, in this
 * order, and a test holds that every style name is in exactly one group.
 *
 * - Colour: the page's own colours. Grounds, panels, borders, text, the accent, the focus ring,
 *   the pen, hover and press, the status colours, presence, the lanes and area tints, the families,
 *   the chat's ticks, the message bubbles' colours, and color-scheme, which says whether the theme
 *   is light or dark.
 * - Type: faces, weights, sizes, line heights, label case and spacing, and how a link is underlined.
 * - Shape: corners, borders, dividers, shadows and density.
 * - Modules: a module's frame, its heading, the "needs you" heading and rail, and the count's style.
 * - Controls: buttons, the round button, a chosen item, and a control's hover border.
 *
 * A module's or a control's colours are in its own group and not in Colour, because a person
 * changing how a module looks expects to find all of it in one place.
 *
 * EVERY ONE OF THE 201 FITS ONE GROUP. None is left out, so `IN_NO_GROUP` is empty; a name added
 * to the list later that fits none goes there with the reason, and the test names it.
 */
import { STYLE_NAMES, type StyleName } from './theme-style-names.ts'

export const EDIT_GROUPS = ['colour', 'type', 'shape', 'modules', 'controls'] as const
export type EditGroup = (typeof EDIT_GROUPS)[number]

/** Each group's names, by pattern, in the order they are asked: the first that matches is the group. */
const BY_PATTERN: readonly (readonly [EditGroup, RegExp])[] = [
  ['modules', /^--(module-|bare-head-|needs-|count-|panel-head-ink$|section-(space|rule|pad)$)/],
  ['controls', /^--(button-|control-hover-border$|fab-|chosen-)/],
  ['type', /^--(font-|fs-|lh-|num-weight$|title-weight$|heading-weight$|section-(weight|size|font|case)$|panel-title-size$|head-space$|link-)/],
  ['shape', /^--(look-|border-w$|focus-w$|face-radius$|divider-style$|elev-|bubble-(radius|border)$)/],
  ['colour', /^(--(area-|lanes-|bg$|panel(-2|-3)?$|border(-strong)?$|text(-2|-3|-dis)?$|accent|focus$|pen-blue$|hover$|press$|sel$|st-|presence-|chat-(read|tick)$|ask|review-|plan-|family-|bubble-(mine|theirs)-)|color-scheme$)/],
]

/** The names that fit none of the five, each with why. Empty: see the head of this file. */
export const IN_NO_GROUP: Readonly<Partial<Record<StyleName, string>>> = {}

/** Which group a style name is edited in, or null because it fits none. */
export function editGroupOf(name: StyleName): EditGroup | null {
  return BY_PATTERN.find(([, pattern]) => pattern.test(name))?.[0] ?? null
}

/** Every group's names, in the list's order. */
const inGroup = (group: EditGroup): readonly StyleName[] => STYLE_NAMES.filter((name) => editGroupOf(name) === group)
export const NAMES_IN_EACH_GROUP: Readonly<Record<EditGroup, readonly StyleName[]>> = {
  colour: inGroup('colour'), type: inGroup('type'), shape: inGroup('shape'), modules: inGroup('modules'), controls: inGroup('controls'),
}

/** The face names, which the Looks tab offers as a choice of the faces the shipped themes use rather than as free text. */
export const FACE_NAMES: readonly StyleName[] = STYLE_NAMES.filter((name) => /^--font-(sans|read|head|num)$|^--section-font$/.test(name))
