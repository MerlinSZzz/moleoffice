// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The dormant queue gate. It never produces or authorizes a release receipt. */
import { gatePosition } from './settings.mjs'
import { redMergeAuthorizesLanding } from '../shared/merge-class.ts'
import { wholeSuiteRedAuthorizesLanding } from '../shared/whole-suite-red.ts'

/**
 * Read when it is used. With no environment, or this process's own, as the fix-round programs pass, a choice saved on
 * the Settings page wins, then the environment, then .env: the merge tool reads it the same way (wave 13r round 19).
 * Any other environment belongs to its caller; it never inherits this checkout's .env and opens no database.
 * @param {Record<string, string | undefined>} [env]
 */
export function wholeSuiteFixRoundIsOn(env) {
  return gatePosition('whole-suite-fix-round', env) === '1'
}

/** The fix-round part alone, so the tested step never asks a broader landing rule for admission. */
/** @param {any} tested @param {string} [tip] @param {string} [tree] @param {boolean} [landingAlreadyAuthorized] */
export function fixRoundAuthorizesLanding(tested, tip, tree, landingAlreadyAuthorized = false) {
  return (landingAlreadyAuthorized || wholeSuiteFixRoundIsOn()) && wholeSuiteRedAuthorizesLanding(tested, tip, tree)
}

/** The office supplies its current house-rule and feature-red positions; the tool follows the stored office decision.
 * The existing durable landing state may finish after the switch is off. No new landing may begin. */
/** @param {any} tested @param {string} [tip] @param {string} [tree] @param {boolean} [landingAlreadyAuthorized] @param {string} [houseRulesPosition] @param {string} [fewFeatureRedsPosition] @param {string} [wideRedPosition] */
export function mergeTestsAuthorizeLanding(tested, tip, tree, landingAlreadyAuthorized = false, houseRulesPosition, fewFeatureRedsPosition, wideRedPosition) {
  return tested?.green === true || redMergeAuthorizesLanding(tested, tip, landingAlreadyAuthorized ? undefined : { houseRules: houseRulesPosition, fewFeatureReds: fewFeatureRedsPosition, wideRed: wideRedPosition }) || fixRoundAuthorizesLanding(tested, tip, tree, landingAlreadyAuthorized)
}
