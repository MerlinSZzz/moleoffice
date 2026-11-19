// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH MODEL LOGIN, HOW ITS USE IS READ, AND THE READING AS EVERY SURFACE RECEIVES IT. The one place these are written.
 * The reading (src/server/lib/logins-week.ts), the router (src/server/lib/casting-roll.ts), the secretary's inbox and the
 * agent page all read them from here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS KNOWN, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * THE SANDBOXES' CLAUDE LOGIN IS READ FROM WHAT IT SAID OF ITSELF (wave 13p round E, problem LeL0ssxi2jje). Each reading
 * round in a sandbox runs Claude Code with `--output-format stream-json`, and Claude Code writes into the round's output
 * a `rate_limit_event` line: whether the login's requests were allowed, and how much of its five-hour and seven-day
 * windows was used and when each resets. The office shows that, and when it was said. Until round E it summed Claude
 * Code's price figure over a declared Friday week against a measured mark; that mark was the price figure and not the
 * plan's own unit, and nobody could measure it again.
 *
 * THE OTHER THREE LOGINS write no such line. Nobody knows whether the host's Claude is the same login, nobody knows when
 * the host's Claude's or Codex's limits reset or what they are, and DeepSeek is paid per use with no known weekly limit.
 * Their use is what the runs' receipts give over the last seven days, said as the last seven days.
 */

/** The four logins, by a key that never changes. */
export const LOGINS = ['sandboxes-claude', 'host-claude', 'codex', 'deepseek'] as const
export type LoginKey = (typeof LOGINS)[number]

/** One login, as declared. */
export interface ALogin {
  login: LoginKey
  /** The word key of its plain name (src/shared/words/en.ts and zh.ts). */
  name: 'loginsWeek.login.sandboxesClaude' | 'loginsWeek.login.hostClaude' | 'loginsWeek.login.codex' | 'loginsWeek.login.deepseek'
  /** How its use is read: from the rate-limit event in the sandboxes' reading rounds, or from the runs' receipts. */
  readFrom: 'own-event' | 'receipts'
  /** Which runs' receipts are its own, by the tool each run declared, and whether it ran in a sandbox. Null for its own event. */
  runs: { tool: 'claude-code' | 'codex' | 'dsh'; where: 'on the host' | 'anywhere' } | null
}

/** The shares at which the secretaries are told, in percent, lowest first. */
export const THE_SHARES_THE_SECRETARIES_ARE_TOLD_AT = [50, 80] as const

/** How far back a login that reads receipts is read: the last seven days. */
export const THE_LAST_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** How long a reading of the sandboxes' login is current after its round's output was last written: 2 hours. */
export const A_READING_STAYS_CURRENT_MS = 2 * 60 * 60 * 1000

/** A stamp without its seconds, as a sentence writes it. */
export function minute(stamp: string): string {
  return stamp.slice(0, 16)
}

/** A share of a window as the reading, the router, the notice and the panel write it, in percent to a tenth at most: 0.63 is "63", 1.03 "103". */
export function aUseInPercent(used: number): string {
  return String(Math.round(used * 1000) / 10)
}

/** The words a rate-limit event uses in `status` for whether the login's requests were allowed. */
export const RATE_LIMIT_STATUSES = ['allowed', 'allowed_warning', 'rejected'] as const
export type RateLimitStatus = (typeof RATE_LIMIT_STATUSES)[number]

/** The limits a rate-limit event may name in `rateLimitType`. */
export const RATE_LIMIT_TYPES = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_overage_included', 'overage'] as const
export type RateLimitType = (typeof RATE_LIMIT_TYPES)[number]

export const THE_LOGINS: readonly ALogin[] = [
  { login: 'sandboxes-claude', name: 'loginsWeek.login.sandboxesClaude', readFrom: 'own-event', runs: null },
  { login: 'host-claude', name: 'loginsWeek.login.hostClaude', readFrom: 'receipts', runs: { tool: 'claude-code', where: 'on the host' } },
  { login: 'codex', name: 'loginsWeek.login.codex', readFrom: 'receipts', runs: { tool: 'codex', where: 'anywhere' } },
  { login: 'deepseek', name: 'loginsWeek.login.deepseek', readFrom: 'receipts', runs: { tool: 'dsh', where: 'anywhere' } },
]

// ---------------------------------------------------------------------------- the reading, as every surface receives it

/** What the runs' receipts gave over the last seven days. */
export interface ReceiptsRead {
  /** Runs of this login started in the window. */
  runs: number
  /** Of those, how many carried no receipt. */
  runsWithNoReceipt: number
  /** How many receipts gave a cost. */
  costGivenBy: number
  /**
   * The sessions whose cost was counted, each once: its newest figure in the window minus its figure before it. A
   * session is the conversation a run names in `providerSession`; a run that names none is its own session.
   */
  sessions: number
  /** Of the runs that gave a cost, how many named no conversation, so each was counted as a session of its own. */
  runsWithNoSession: number
  /** Sessions whose figure in the window was lower than before it, counted as 0. */
  sessionsWhoseFigureFell: number
  /** Input tokens, cached input included, or null when no receipt gave a usable count. */
  inputTokens: number | null
  /** Output tokens, or null when no receipt gave one. */
  outputTokens: number | null
}

/** One window a rate-limit event gave: the share of it used, 1 for all of it, and when it resets, a stamp in the reading's zone. */
export interface AWindowRead {
  used: number
  resetsAt: string
  /** Where the event gave it: in its own place in `unifiedWindows`, or at the top level, which named this window. */
  from: 'unifiedWindows' | 'top level'
}

/**
 * THE SANDBOXES' CLAUDE LOGIN, AS ITS NEWEST RATE-LIMIT EVENT SAID. `state` is `current` for 2 hours after the event's
 * round was last written and `stale` after; a stale reading keeps its figures. `none` is a login nobody has read, and
 * `unreadable` an event in a shape the office does not know; neither has a figure. Every stamp is in `zone`.
 */
export interface OwnEventReading {
  readFrom: 'own-event'
  login: LoginKey
  name: ALogin['name']
  state: 'current' | 'stale' | 'none' | 'unreadable'
  /** When the event's round was last written, or null for a reading of nobody. */
  readAt: string | null
  zone: string
  /** The round the event was read from, or null for a reading of nobody. */
  round: { sandbox: string; folder: string } | null
  /** What the event said at its top level: its status, the limit it named and that limit's reset. Null where it gave none. */
  status: RateLimitStatus | null
  windowType: RateLimitType | null
  resetsAt: string | null
  sevenDays: AWindowRead | null
  fiveHours: AWindowRead | null
  /** The newest reading round that gave no rate-limit event, when it is newer than the event read. */
  newerRoundWithNoEvent: { sandbox: string; folder: string; at: string } | null
  /** All of it in English, for a reader of the API. */
  says: string
}

/** A LOGIN READ FROM THE RUNS' RECEIPTS over the last seven days: its use, what is missing, and its window. */
export interface ReceiptsReading {
  readFrom: 'receipts'
  login: LoginKey
  name: ALogin['name']
  /** The window's start and end, stored stamps in `zone`. Its end is now. */
  from: string
  to: string
  zone: string
  /** The use in US dollars, or null when nothing gave a figure. */
  usd: number | null
  receipts: ReceiptsRead
  /** One English sentence saying all of it, for a reader of the API. */
  says: string
}

/** ONE LOGIN'S READING, by how it was read. */
export type LoginWeekReading = OwnEventReading | ReceiptsReading

/** Every login's reading at one moment. */
export interface LoginsWeek {
  at: string
  zone: string
  logins: LoginWeekReading[]
  /** Runs in the last seven days that declared no tool, so no login counts them. */
  runsThatDeclaredNoTool: number
  says: string
}
