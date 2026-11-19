// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A SEAL HAD NO REMINDER, DECLARED ONCE. src/shared/before-the-seal.ts reads the list, and
 * src/shared/kinds.ts builds the `because` type it serves from the same list.
 */
export const WHY_NOT_REMINDED = ['theLauncherAskedForNone', 'notTheRunsOwnKey', 'noAgent', 'theGateIsOff', 'unknown'] as const
export type WhyNotReminded = (typeof WHY_NOT_REMINDED)[number]
