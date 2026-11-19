// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTEGRATION READS A TEST GIVES, AND THE OFFICE FUNCTIONS A TEST GIVES WITH THEM.
 *
 * THE_INTEGRATION_READS_A_TEST_GIVES is what a test gives pinGit and integrateGit in place of arguments.mjs's
 * THE_INTEGRATION_READS: each reader reads its gate's position or the commit setting's declared default when it is
 * called, never when this object is made.
 *
 * THE_INTEGRATION_A_TEST_GIVES adds the six office functions beside those reads. Each office function is looked up on
 * office-keeper.mjs when it is called, never when the object is made, so a test's own mock of office-keeper.mjs is what
 * integrate then reaches. A mock that leaves a function out raises vitest's missing-export error only if that function
 * is called, as it does today.
 *
 * A test that imports this file mocks office-keeper.mjs and arguments.mjs.
 */
import { settingNamed } from '../src/config/settings.mjs'
import {
  integratedBuildPosition,
  ownerContentPosition,
  pinnedCommitPosition,
  placeholderAddressesPosition,
  resolutionRefPosition,
} from '../src/config/integration-guards.mjs'
import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'

/** The six reads pinGit and integrateGit take from their caller, read when they are called. */
export const THE_INTEGRATION_READS_A_TEST_GIVES = Object.freeze({
  pinnedCommitPosition: () => pinnedCommitPosition(),
  resolutionRefPosition: () => resolutionRefPosition(),
  ownerContentPosition: () => ownerContentPosition(),
  placeholderAddressesPosition: () => placeholderAddressesPosition(),
  integratedBuildPosition: () => integratedBuildPosition(),
  commitAddressFallback: () => settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback,
})

/** The six reads and the six office functions a test gives pinGit and integrateGit, each read when it is called. */
export const THE_INTEGRATION_A_TEST_GIVES = Object.freeze({
  ...THE_INTEGRATION_READS_A_TEST_GIVES,
  ask: (method: any, path: any, body?: any, options?: any): any => officeKeeper.ask(method, path, body, options),
  countAGateMet: (id: any, position: any): any => officeKeeper.countAGateMet(id, position),
  runInSandbox: (...args: any[]): any => officeKeeper.runInSandbox(...args),
  step: (...args: any[]): any => officeKeeper.step(...args),
  theSandbox: (...args: any[]): any => officeKeeper.theSandbox(...args),
  theSeal: (...args: any[]): any => officeKeeper.theSeal(...args),
})
