// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LINE THE DEV SUPERVISOR PRINTS WHEN ITS STARTUP IS DONE, IN ONE PLACE FOR BOTH SIDES.
 *
 * `tools/serve-dev.mjs` prints it once its server answers and its own row in the ledger of what is
 * running is confirmed. Until then its startup can still end, and a supervisor whose startup ends
 * stops the server it started. So `tools/stable/stable-upgrade-transaction.mjs` reads the line out of
 * an ordinary start's own log before it says a release is published or the old version is
 * restored. On 14 November 2026 it said published from the health answer alone, and the office
 * stopped five seconds later.
 *
 * THE WORDS HAVE NOT CHANGED SINCE 4 SEPTEMBER 2026, and they must not. A way back starts the
 * serve-dev of an older version, which prints them as they were. In new words here, the upgrade
 * tool would wait for a line the older serve-dev never prints, and every way back to it would fail.
 *
 * Matched as a whole line. JavaScript for the reason guard-refusal.mjs is: both programs run
 * without the TypeScript in the checkout.
 */

/**
 * @param {number} pid the supervisor's own process id
 * @param {number} port the port whose server it supervises
 * @returns {string}
 */
export function theSupervisorsStartupIsDone(pid, port) {
  return `[dev] written into the ledger as process ${String(pid)}, supervising port ${String(port)}.`
}

/**
 * WHETHER A START'S LOG HOLDS THAT LINE, FOR THIS SUPERVISOR AND THIS PORT.
 *
 * @param {string} log the whole text of the log
 * @param {number} pid the supervisor's process id
 * @param {number} port the port it supervises
 * @returns {boolean}
 */
export function theLogSaysTheStartupIsDone(log, pid, port) {
  const line = theSupervisorsStartupIsDone(pid, port)
  return log.split('\n').some((one) => one.trim() === line)
}
