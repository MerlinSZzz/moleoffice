// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE POSITIONS OF THE MERGE TOOL'S GUARDS WITH A ROW. Three are the integrate step's: the owner-content guard and the
 * build of the integrated tree (wave 13r round L), and the commit-address gate, guard 5 (wave 13q). Five more are the
 * tool's own steps (wave 13r round Z2): the pinned commit, the resolution's ref, the tested clone, the plugin pages and
 * the office's health after a landing. Each is read where the guard would act, as gatePosition reads every gate. A value
 * the row does not allow is refused by name, and nothing is guessed in its place.
 */
import { gatePosition } from './settings.mjs'

/** An explicit environment is read on its own; the process environment uses the saved office choice.
 * @param {Record<string, string | undefined>} [env]
 */
export function ownerContentPosition(env) {
  return gatePosition('owner-content-in-what-ships', env)
}

/** @param {Record<string, string | undefined>} [env] */
export function integratedBuildPosition(env) {
  return gatePosition('integrated-tree-builds', env)
}

/** Block only. @param {Record<string, string | undefined>} [env] */
export function pinnedCommitPosition(env) {
  return gatePosition('pinned-commit-is-what-was-sealed', env)
}

/** Block only. @param {Record<string, string | undefined>} [env] */
export function resolutionRefPosition(env) {
  return gatePosition('resolution-replayed-from-its-own-ref', env)
}

/** Block only. @param {Record<string, string | undefined>} [env] */
export function testedClonePosition(env) {
  return gatePosition('tested-clone-is-the-integrated-result', env)
}

/** Block or remind. @param {Record<string, string | undefined>} [env] */
export function pluginPagesPosition(env) {
  return gatePosition('plugin-pages-built-before-landing', env)
}

/** Block or remind. @param {Record<string, string | undefined>} [env] */
export function officeHealthPosition(env) {
  return gatePosition('office-healthy-after-landing', env)
}

/** Read only when the screen found a commit at the placeholder domain (tools/merge-tool/commit-addresses.mjs).
 * @param {Record<string, string | undefined>} [env]
 */
export function placeholderAddressesPosition(env) {
  return gatePosition('placeholder-addresses', env)
}
