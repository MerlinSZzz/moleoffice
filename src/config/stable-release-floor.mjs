// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE RELEASE'S FLOOR, declared here and spread into SETTINGS in ./settings.mjs, which reads and refuses it like
 * every other setting. It is a module of its own so the release's step can be found, and taken out, in one place.
 *
 * The shape is the one `setting()` in ./settings.mjs builds. That helper is not exported, and importing ./settings.mjs
 * from here would be a cycle, so the object is written out whole.
 */
import { SETTING_WORDS } from './word-sources.mjs'

export const THE_RELEASE_FLOOR_SETTING = 'MOLE_OFFICE_STABLE_RELEASE_FLOOR_GB'

/** @type {import('./settings.mjs').Setting[]} */
export const STABLE_RELEASE_FLOOR_SETTINGS = [
  {
    name: THE_RELEASE_FLOOR_SETTING,
    kind: 'word',
    what: SETTING_WORDS.MOLE_OFFICE_STABLE_RELEASE_FLOOR_GB,
    fallback: '30',
    absentMeans: null,
    inTemplate: true,
    notInTemplateBecause: null,
    served: true,
    notServedBecause: null,
    emptyMeans: null,
  },
]

/**
 * The sentence readSetting refuses a value of the floor with, or null when the value is one it may hold.
 * @param {string} name
 * @param {string | undefined} raw
 * @returns {string | null}
 */
export function theStableReleaseFloorRefused(name, raw) {
  if (raw === undefined) return null
  if (name !== THE_RELEASE_FLOOR_SETTING) return null
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) {
    return `${THE_RELEASE_FLOOR_SETTING} is "${raw}", and it must be a whole number of gigabytes, at least 1. Nothing was guessed from it.`
  }
  return null
}
