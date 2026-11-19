// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER'S TWO SETTINGS, declared here and spread at the end of SETTINGS in ./settings.mjs, which reads
 * and refuses them like every other setting. They are a module of their own so the router's step can be found, and taken
 * out, in one place. Neither name holds KEY, because neither value is a secret.
 *
 * The shape is the one `setting()` in ./settings.mjs builds. That helper is not exported, and importing ./settings.mjs
 * from here would be a cycle, so the two objects are written out whole.
 */
import { SETTING_WORDS } from './word-sources.mjs'

export const THE_ROUTER_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER'
export const THE_ROUTER_CAP_SETTING = 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP'

/** @type {import('./settings.mjs').Setting[]} */
export const PROVIDER_ROUTER_SETTINGS = [
  {
    name: THE_ROUTER_SETTING,
    kind: 'word',
    what: SETTING_WORDS.MOLE_OFFICE_PROVIDER_ROUTER,
    fallback: 'off',
    absentMeans: null,
    inTemplate: true,
    notInTemplateBecause: null,
    emptyMeans: null,
  },
  {
    name: THE_ROUTER_CAP_SETTING,
    kind: 'word',
    what: SETTING_WORDS.MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP,
    fallback: null,
    absentMeans: 'no run cap is set, so the office issues no router token and no dsh run starts through the provider router',
    inTemplate: true,
    notInTemplateBecause: null,
    emptyMeans: null,
  },
]

/**
 * The sentence readSetting refuses a value of either setting with, or null when the value is one it may hold.
 * @param {string} name
 * @param {string | undefined} raw
 * @returns {string | null}
 */
export function theProviderRouterValueRefused(name, raw) {
  if (raw === undefined) return null
  if (name === THE_ROUTER_SETTING && raw !== 'on' && raw !== 'off') {
    return `${THE_ROUTER_SETTING} is "${raw}", and it must be on or off. Nothing was guessed from it.`
  }
  if (name === THE_ROUTER_CAP_SETTING && (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || !(Number(raw) > 0))) {
    return `${THE_ROUTER_CAP_SETTING} is "${raw}", and it must be a number of US dollars above 0, such as 2.5. Nothing was guessed from it.`
  }
  return null
}
