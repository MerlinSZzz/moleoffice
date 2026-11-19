// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Only the recipient's own door may write its rules. Synchronous record writes clear this mark in finally. */
let writing = false
export const NOTICE_RULES_KIND = 'notice_rules'
export function noticeRulesDoorIsWriting() { return writing }
export function asNoticeRulesDoor<T>(write: () => T): T {
  const before = writing
  writing = true
  try { return write() } finally { writing = before }
}
