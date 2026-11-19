// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DSH COMMAND ARRAY AND SESSION ID the tests that drive the real runInside with a dsh stand-in share, so two copies
 * of them cannot drift. The array is made by the inspector's own makers (tools/inspector-sandbox.mjs), so it is the one
 * the inspector sends for a DSH check: the shared full permissions, DSH_HOME inside the check's private home
 * (DSH_CHECK_ENV), and the ACP client. The provider, model and effort are made-up choices, and `A_DSH_SESSION` is a
 * made-up dsh session id shaped as the inspector accepts for the form correction's --resume.
 */
import { DSH_CHECK_ENV, aCommandWithItsEnv, theDshCheckCommand } from '../tools/inspector-sandbox.mjs'

export const A_DSH_SESSION = '01234567-89ab-cdef-0123-456789abcdef'

/** The array the inspector will send for a DSH check, with synthetic choices. */
export function nativeDshArgv({ provider = 'deepseek-official', model = 'deepseek-flash', effort = 'high' as string | null, resume = null as string | null } = {}): string[] {
  return aCommandWithItsEnv(DSH_CHECK_ENV, theDshCheckCommand({ provider, model, effort, resume }))
}
