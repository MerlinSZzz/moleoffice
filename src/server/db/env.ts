// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE SETTINGS COME FROM — stated once, for every command that opens the database.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `.env` is the file this project tells you to edit: README says to copy `.env.example` to it, and
 * `.env.example` documents `MOLE_OFFICE_DB` as the one setting that decides where all your work is
 * stored. Until this file existed, four of the commands that write to a database did not read it.
 *
 * Measured on 2026-08-12, on a scratch checkout whose `.env` said
 * `PANELX_DB=/…/envtest/steered.db` — the settings carried a `PANELX_` prefix then, and the whole
 * set was renamed to `MOLE_OFFICE_` on 28 August 2026 when the product was:
 *
 *     npm run db:migrate
 *     → migrations: 7 migrations applied to ./data/panelx.db
 *     → steered.db: No such file or directory
 *
 * The command created and migrated a database at the built-in default and never touched the file
 * the operator had configured. `db:seed`, `db:reset` and `reindex` did the same. So the two guards
 * that make `db:reset` safe — it refuses to delete a database holding records, and names it —
 * were refusing about a file the operator did not care about, while the file they did care about
 * sat unprotected under a name nothing had read.
 *
 * `scripts/export.ts` and `scripts/import.ts` had already worked this out and each carried its own
 * copy of the three lines, with the reason written beside it: *"A .env naming a different database,
 * unread, would mean this script backing up a file nobody uses while reporting complete success."*
 * That reasoning is correct and it is not specific to those two scripts. `scripts/reindex.ts`
 * carried the opposite rule in a comment — "IT DOES NOT LOAD .env … If .env points the server at a
 * different database, pass the same value here" — which asks every operator to keep two settings in
 * step by hand, and is the shape of defect this repository keeps deleting: two places that must
 * agree, with nothing making them agree.
 *
 * ---------------------------------------------------------------------------------------
 * SO IT IS LOADED WHERE MOLE_OFFICE_DB IS READ, NOT WHERE EACH COMMAND STARTS
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` is the only module that reads `MOLE_OFFICE_DB`, and it reads it the moment
 * it is imported. Calling this from there means a command does not have to remember anything: any
 * entry point that opens the database gets the configured file, including ones written next year.
 *
 * The alternative — a load at the top of each script — has to run BEFORE `db/client.ts` is
 * imported, and ES modules evaluate every import before the first statement of the file that
 * imports them. So in `scripts/seed.ts`, whose client import is static, a call at the top of the
 * body would run too late and do nothing, silently. A rule that is invisibly order-dependent is
 * one a reordered import breaks without a word.
 *
 * Two callers read settings that are not `MOLE_OFFICE_DB` and so cannot wait for the database to be
 * opened: `src/server/index.ts` needs the ports first, and `scripts/reset.ts` reads the path
 * itself in order to delete the file before anything opens it. Both call this directly. It is
 * idempotent, so calling it twice in one process is free and cannot produce a different answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WINS
 * ---------------------------------------------------------------------------------------
 *
 * A value already set in the real environment beats the file. That is `process.loadEnvFile`'s own
 * behaviour rather than a policy invented here, and every safety instruction this project prints
 * depends on it: `MOLE_OFFICE_DB=/tmp/scratch.db npm run db:reset` has to point at the scratch file even
 * though `.env` names the real one. Verified on 2026-08-12, under the old spelling `PANELX_DB`:
 * with it set in the shell, the shell's value survived a load of a `.env` naming a different file.
 */

import { ENV_FILE as DECLARED_ENV_FILE, gateNumber, loadEnvFileIntoProcess, settingNamed, settingValue, settingWasSet, settings } from '../../config/settings.mjs'
import type { ReplyReminderSetting } from '@shared/runtime.ts'

/**
 * The settings file: `.env` at the repository root, beside `.env.example`.
 *
 * Re-exported from the declaration rather than worked out again here. This file used to find it
 * with its own `new URL('../../../.env', import.meta.url)`, which is the same path arrived at a
 * second way — and a second way to arrive at a path is a second way to arrive at the wrong one.
 */
export const ENV_FILE = DECLARED_ENV_FILE

/** What a load did. `found: false` means there is no `.env`, which is a normal fresh clone. */
export interface EnvLoad {
  /** The absolute path looked at, whether or not anything was there. */
  file: string
  found: boolean
}

/** Set once, so a second call in the same process is a no-op rather than a second read. */
let loaded: EnvLoad | null = null

/**
 * Read `.env` into `process.env`, once per process.
 *
 * Opens no database and imports nothing that does, so it is safe to call from the top of a script
 * that is about to delete the database file.
 */
export function loadPanelEnv(): EnvLoad {
  if (loaded !== null) return loaded
  const { found } = loadEnvFileIntoProcess(ENV_FILE)
  const stale = staleSettingNames(Object.keys(process.env))
  if (stale.length > 0) throw new Error(staleSettingRefusal(stale, ENV_FILE))
  loaded = { file: ENV_FILE, found }
  return loaded
}

// ---------------------------------------------------------------------------- the old prefix

/**
 * THE SETTINGS WERE ALL RENAMED, AND A LEFTOVER OLD NAME STOPS THE PROCESS.
 *
 * Until 28 August 2026 this product was called PanelX and every one of its settings was spelled
 * `PANELX_…`. They are spelled `MOLE_OFFICE_…` now. Nothing reads the old spelling.
 *
 * WHY THIS REFUSES INSTEAD OF ACCEPTING BOTH. Accepting the old name quietly would be two names
 * for one setting, which is two sources of truth, and it would hide the day the second one was
 * removed. Accepting neither and saying nothing is worse: a server started with `PANELX_DB` still
 * set would open `./data/panelx.db` — the built-in default — while the operator believed it had
 * opened the file they named. That is a server serving the wrong database with nothing on screen
 * to say so, and it is the worst failure this rename could have produced.
 *
 * WHERE IT RUNS. Inside `loadPanelEnv`, which every command that reads a setting calls before it
 * reads one, so there is one check rather than one per entry point.
 *
 * IT SAYS WHICH SIDE THE STALE NAME CAME FROM. The shell's environment is read before `.env` is
 * loaded and again after, so a name that appears only in the second read came out of the file.
 * Those are two different things to go and edit, and an operator who is told "PANELX_DB is set"
 * without being told where will look in the wrong one first.
 *
 * WHEN THIS CAN BE DELETED. When the owner says no machine they start this on still has a `PANELX_`
 * name in a shell profile or a `.env`. It is not load-bearing after that; it is a transition aid
 * with a stated end.
 */
const OLD_SETTING_PREFIX = 'PANELX_'

/** The current prefix. Written out at every use site as well, so that a scan can find them. */
const SETTING_PREFIX = 'MOLE_OFFICE_'

/** Whichever of these names carries the prefix this product's settings no longer use. */
export function staleSettingNames(names: Iterable<string>): string[] {
  return [...names].filter((name) => name.startsWith(OLD_SETTING_PREFIX)).sort()
}

/** The name a stale setting should be given instead. */
export function currentSettingName(stale: string): string {
  return SETTING_PREFIX + stale.slice(OLD_SETTING_PREFIX.length)
}

/**
 * What to say when a setting from before the rename is still set.
 *
 * Every stale name is listed with the name to give it instead, because an operator with four of
 * them set should have to start again once, not four times.
 *
 * IT DOES NOT CLAIM WHERE THE NAME CAME FROM, and an earlier draft of it did. The plan was to read
 * the environment before and after `.env` is loaded and call the difference "set in .env". That
 * reads correctly for a server started with `tsx` and lies under Vite, which loads `.env` into
 * `process.env` while it reads its own configuration — so by the time this runs, a name that came
 * out of the file looks like one that came out of the shell. Rather than name the wrong file, this
 * names both places a person should look.
 */
export function staleSettingRefusal(stale: readonly string[], envFile: string): string {
  return [
    'Mole Office will not start while a setting from before the rename is set.',
    '',
    'This product was called PanelX until 28 August 2026 and every setting was renamed with it.',
    'Nothing reads the old names. If this started anyway it would use its own built-in defaults',
    'and you would not be told — including for the database, which decides where all your work is.',
    '',
    'Set in this process, with the name to give each one instead:',
    ...stale.map((name) => `  ${name} -> ${currentSettingName(name)}`),
    '',
    `Look in your shell first, then in ${envFile}.`,
    '.env.example lists every setting under its current name.',
  ].join('\n')
}

/**
 * The database this process will open, as an absolute path.
 *
 * The default used to be repeated here, in `db/client.ts`, in `scripts/reset.ts` and in
 * `scripts/backup.ts`, with a comment in each saying the repetition was on purpose. All four now
 * read `src/config/settings.mjs`, which declares it once: the declaration imports nothing that opens
 * a database, so the scripts that must not open one before they have read their settings still may
 * not, and there is one path rather than four spellings of it.
 */
export function databasePath(): string {
  loadPanelEnv()
  return settings().databasePath
}

/**
 * A WHOLE POSITIVE NUMBER FROM ONE SETTING, or a refusal naming the setting and what it holds. With `least` 0, a whole
 * number 0 or above. A blank value never reaches it: `settingValue` refuses one.
 *
 * The numbers below are read the same way for the same reason: a setting somebody set to a
 * word is a fact about their `.env`, and a reader that quietly fell back to the built-in default
 * would hide it. `maxAvatarBytes` in lib/avatars.ts has said this since part 2a.
 */
function wholeNumberSetting(name: string, least: 0 | 1 = 1): number {
  const said = settingValue(name)
  const n = Number(said)
  if (!Number.isInteger(n) || n < least) {
    // A PLAIN ERROR AND NOT A PanelError, ON PURPOSE. This file is loaded before the database is
    // opened — it is what says where the database is — so importing lib/records.ts for its error
    // class here builds the client early and every test that opens its own database fails on a
    // connection that is not there yet. Measured: 20 tests in three files.
    throw new Error(
      `${name} is ${JSON.stringify(said)}, which is not a whole number${least === 0 ? ' 0 or above' : ''}. Set it to one, or ` +
        'take it out to use the built-in value. Nothing was read from it.',
    )
  }
  return n
}

/** How many recent events the server remembers for a page that reconnects. */
export function eventRingSize(): number {
  return wholeNumberSetting('MOLE_OFFICE_EVENT_RING')
}

/** How many minutes of quiet before a durable agent stops reading as online. */
export function agentAliveWithinMinutes(): number {
  return wholeNumberSetting('MOLE_OFFICE_ALIVE_WITHIN_MINUTES')
}

/** How many seconds since a page said it was open before the person at it stops reading as online. */
export function personAliveWithinSeconds(): number {
  return wholeNumberSetting('MOLE_OFFICE_PERSON_ALIVE_WITHIN_SECONDS')
}

/** How often the waiter says the session answering as a durable agent is still there, in seconds. */
export function handleBeatSeconds(): number {
  return wholeNumberSetting('MOLE_OFFICE_HANDLE_BEAT_SECONDS')
}

/**
 * How many Claude supervisor runs may go at once, across every project, before the office starts no more next rounds.
 * 0 starts none; a value that is not a whole number 0 or above is refused in words, and 6 is never put in its place.
 */
export function claudeSupervisorsAtOnce(): number {
  return wholeNumberSetting('MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE', 0)
}

/**
 * WHETHER THE MESSAGE DOOR REFUSES AN AGENT SENDER A RECIPIENT NOTHING IS ANSWERING AS.
 *
 * Criterion M110. The refusal
 * on a retired or unregistered recipient needs no setting and never did. This wider one does, and the
 * reason is in the setting's own declaration: presence is not yet true for an agent started as a
 * subagent, and until M106 (Cluster B) and F9 make it true, refusing on that reading would refuse the
 * live org chart. It defaults to off until that is decided.
 */
export function theDoorRefusesAnAgentWithNoSessionAndNoRun(): boolean {
  return settingValue(THE_MESSAGE_DOOR_SETTING) === '1'
}

/** The variable that turns the refusal above on. */
export const THE_MESSAGE_DOOR_SETTING = 'MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN'

/**
 * HOW THE SETTING ABOVE IS SET, for the line on the Settings page's "This computer" panel.
 *
 * `on` is exactly when the door refuses, because it asks the function the door asks. `not set` is
 * when neither the environment nor .env holds the variable, which the door reads as off. `off` is
 * every other value, because the door refuses only on "1".
 */
export function howTheMessageDoorIsSet(): { variable: string; state: 'on' | 'off' | 'not set' } {
  const state = theDoorRefusesAnAgentWithNoSessionAndNoRun()
    ? 'on'
    : settingWasSet(THE_MESSAGE_DOOR_SETTING)
      ? 'off'
      : 'not set'
  return { variable: THE_MESSAGE_DOOR_SETTING, state }
}

/**
 * HOW MANY DAYS THE OLDEST UNCLAIMED DEAD LETTER MAY SIT before its summary is sent.
 * One day by default, as the owner decided. That decision replaced criterion
 * M111's example. The database choice wins the legacy environment. */
export function deadLetterAfterDays(): number {
  return wholeNumberSetting('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS')
}

/**
 * HOW MANY UNCLAIMED DEAD LETTERS MAY PILE UP before their summary is sent.
 * Twenty by default, as the owner decided. That decision replaced criterion
 * M111's example. The trigger is strictly greater than this count.
 */
export function deadLetterAfterCount(): number {
  return wholeNumberSetting('MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT')
}

/**
 * F13: HOW MANY HOURS AN AGENT MAY GO IDLE — nothing sent, nothing received — before the office
 * reminds it of its role and duties.
 * n is one hour to start. Sent once per idle spell (design/flows/ACCEPTANCE.md, F13 step 3: the
 * heartbeat continues, the office sends no further flow message until new work arrives).
 */
export function idleReminderHours(): number {
  return wholeNumberSetting('MOLE_OFFICE_IDLE_REMINDER_HOURS')
}

/**
 * THE TIMES OF DAY A SECRETARY BROADCASTS, in local wall-clock `HH:MM`, earliest first.
 *
 * The schedule was made by a decision. The default is declared once in
 * src/config/settings.mjs: 07:00 and 18:00 since decision `neHefMNZkJDU` of 25 September 2026. A
 * value that is not a list of times is refused with the setting's name, for the reason
 * `wholeNumberSetting` gives: a setting somebody mistyped is a fact about their `.env`, and
 * silently using the defaults would hide it. The times are sorted and de-duplicated so that two
 * spellings of one time cannot make the office remind twice for one slot.
 */
export function broadcastTimes(): string[] {
  const read = theBroadcastTimesSetting()
  if (read.wrong !== null) throw new Error(`${read.wrong} Nothing was read from it.`)
  return read.times
}

/**
 * THE OFFICE'S BROADCAST TIMES AS A PAGE AND THE REMINDERS READ THEM: the setting when it reads, else the
 * built-in times, with the sentence saying what is wrong with the setting.
 *
 * A mistyped `.env` line used to throw out of every reading of a secretary's broadcast, so the whole agent
 * page said the agent was not found. The reading goes on with the times declared in src/config/settings.mjs
 * and carries `unreadable`, so the page can say the setting is wrong rather than hide it. `broadcastTimes`
 * still refuses, for a caller that has nowhere to say it. Wave 13p round 29.
 */
export function theOfficesBroadcastTimes(): { times: string[]; unreadable: string | null } {
  const read = theBroadcastTimesSetting()
  if (read.wrong === null) return { times: read.times, unreadable: null }
  const declared = String(settingNamed('MOLE_OFFICE_BROADCAST_TIMES').fallback)
  const builtIn = declared.split(',').map((one) => one.trim())
  // THE DECLARATION ITSELF IS A BROKEN ASSUMPTION IF IT IS NOT A LIST OF TIMES, and nothing is left to fall back to.
  if (!builtIn.every(isATimeOfDay)) throw new Error(`The built-in MOLE_OFFICE_BROADCAST_TIMES ${JSON.stringify(declared)} is not a list of times of day.`)
  const times = timesInOrder(builtIn)
  return { times, unreadable: `${read.wrong} The built-in times ${times.join(', ')} are used until it is put right.` }
}

/** The setting MOLE_OFFICE_BROADCAST_TIMES read once: its times, or the sentence saying what is wrong with it. */
function theBroadcastTimesSetting(): { times: string[]; wrong: null } | { times: null; wrong: string } {
  const said = settingValue('MOLE_OFFICE_BROADCAST_TIMES')
  const parts = String(said)
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '')
  if (parts.length === 0) {
    return {
      times: null,
      wrong:
        `MOLE_OFFICE_BROADCAST_TIMES is ${JSON.stringify(said)}, which names no time. Give it one or more ` +
        'times as HH:MM separated by commas, for example 07:00,18:00.',
    }
  }
  for (const part of parts) {
    if (!isATimeOfDay(part)) {
      return {
        times: null,
        wrong:
          `MOLE_OFFICE_BROADCAST_TIMES contains "${part}", which is not a time of day. Write each time as HH:MM ` +
          'in 24-hour local time, separated by commas.',
      }
    }
  }
  return { times: timesInOrder(parts), wrong: null }
}

/**
 * WHETHER ONE STRING IS A TIME OF DAY as `HH:MM` in 24-hour local time. The office's setting and a
 * secretary's own times are both read by this one rule, so the two cannot come to accept different
 * times. A secretary's own times came in wave 13p round 27.
 */
export function isATimeOfDay(said: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(said)
}

/** Times of day sorted and de-duplicated, so two spellings of one time cannot remind twice for one slot. */
export function timesInOrder(times: readonly string[]): string[] {
  return [...new Set(times)].sort()
}

/** How many minutes before a broadcast slot the office reminds the secretary. */
export function broadcastLeadMinutes(): number {
  return wholeNumberSetting('MOLE_OFFICE_BROADCAST_LEAD_MINUTES')
}

/** One of the main world's two limit settings, as it was written; src/server/lib/main-world.ts reads it. */
export function mainWorldLimitSetting(name: 'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS' | 'MOLE_OFFICE_MAIN_WORLD_WORKERS'): string {
  return String(settingValue(name) ?? '').trim()
}

/** How many consecutive unanswered broadcasts pause a secretary's schedule. */
export function broadcastUnansweredLimit(): number {
  return gateNumber('broadcast-pause')
}

/** How many tokens a run may spend in one step of its flow before the office reminds it of its role and its step. */
export function stepReminderTokens(): number {
  return gateNumber('step-reminder-tokens')
}

/** How many minutes a run may spend in one step of its flow before the office reminds it of its role and its step. */
export function stepReminderMinutes(): number {
  return gateNumber('step-reminder-minutes')
}

/** The backup sentence the day's last broadcast reminder carries, or null when the setting is empty. */
export function broadcastBackupReminder(): string | null {
  const said = String(settingValue('MOLE_OFFICE_BROADCAST_BACKUP_REMINDER') ?? '').trim()
  return said === '' ? null : said
}

/**
 * The id of the secretary's report template, or null when nobody set one. Empty means the same as
 * not set. Whether the office holds that record is read in src/server/lib/broadcast.ts.
 */
export function broadcastReportTemplate(): string | null {
  const said = String(settingValue('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE') ?? '').trim()
  return said === '' ? null : said
}

/** The handle of the agent whose watcher reads the host GPU card, or null when nobody set one. Empty is the same. */
export function theGpuWatcherHandle(): string | null {
  const said = String(settingValue('MOLE_OFFICE_GPU_WATCHER') ?? '').trim()
  return said === '' ? null : said
}

/**
 * THE ONE SECRETARY REMINDED ABOUT EACH PROJECT'S MODULES, as project id to the agent's handle (decision aZGg6gerakM1).
 * Unset or empty is an empty map, which is a real answer: nobody is named. A part that is not project=handle, or a
 * project named twice, is refused loudly, because a guess would remind somebody nobody named.
 *
 * ONLY THE ONE READING ASKS THIS. A secretary set on the Settings page comes first, so who is reminded is read through
 * `theModuleReminderSecretaries` in lib/module-reminder-secretaries.ts, which asks this for the projects with nothing
 * set there and says a line that cannot be read instead of throwing it at the page.
 */
export function moduleReminderSecretaries(): Map<string, string> {
  return moduleReminderSecretariesFrom(String(settingValue('MOLE_OFFICE_MODULE_REMINDER_SECRETARIES') ?? '').trim())
}

/** Validate a proposed map with the same parser the reminders use. */
export function moduleReminderSecretariesFrom(said: string): Map<string, string> {
  const named = new Map<string, string>()
  for (const part of said.split(',').map((one) => one.trim()).filter((one) => one !== '')) {
    const pair = /^([^=\s]+)\s*=\s*([^=\s]+)$/.exec(part)
    if (pair === null) {
      throw new Error(
        `MOLE_OFFICE_MODULE_REMINDER_SECRETARIES contains "${part}", which is not project=handle. Write each part as ` +
          'project=handle separated by commas, for example research=clerk. Nothing was read from it.',
      )
    }
    if (named.has(pair[1]!)) {
      throw new Error(
        `MOLE_OFFICE_MODULE_REMINDER_SECRETARIES names the project "${pair[1]}" twice. Name one secretary for each ` +
          'project. Nothing was read from it.',
      )
    }
    named.set(pair[1]!, pair[2]!)
  }
  return named
}

/** How many minutes after a broadcast slot the office reminds a secretary that has sent no report. */
export function broadcastReportLateMinutes(): number {
  return wholeNumberSetting('MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES')
}

/**
 * How long a session answering as a durable agent may go quiet before a run may answer instead.
 *
 * IT MUST BE LONGER THAN THE BEAT AND THE READER SAYS SO RATHER THAN CORRECTING IT. A lapse shorter
 * than the beat means every hold is lapsed the moment after it is written, so the live session
 * would never be the one that answered and nothing on any screen would say why. Raising it here to
 * some safe multiple would be substituting a number nobody set, which is invariant 2 of USER.md.
 */
export function handleLapsesAfterSeconds(): number {
  const lapse = wholeNumberSetting('MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS')
  const beat = handleBeatSeconds()
  if (lapse <= beat) {
    throw new Error(
      `MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS is ${String(lapse)} seconds and ` +
        `MOLE_OFFICE_HANDLE_BEAT_SECONDS is ${String(beat)}. A handle would lapse before the session holding it ` +
        'could say it was still there, so no live session would ever answer. Set the lapse longer than the beat. ' +
        'Nothing was read from either.',
    )
  }
  return lapse
}

/**
 * HOW LONG A MESSAGE HANDED TO A HELD SESSION MAY STAY UNREAD, in seconds, before the handle stops
 * reading as answering.
 *
 * Problem `-MLrleDe93wM`, found by the owner on 29 September 2026 at 11:42. An agent stopped reading at
 * 06:30, and its handle still said a live session answered until the owner found it. The hold's beat comes
 * from the waiter's own process, so it says nothing about whether the session reads. The reading in
 * lib/answering.ts compares each hand-over with the session's own transcript, and this is how long a
 * hand-over may go without the transcript growing after it. The number is ten minutes.
 */
export function handleUnreadAfterSeconds(): number {
  return wholeNumberSetting('MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS')
}

/**
 * HOW MANY MINUTES A PERSON'S MESSAGE HANDED TO AN AGENT'S LIVE SESSION MAY GO WITHOUT A REPLY before the office reminds
 * the agent once. Three unless set. src/server/lib/reply-reminder.ts reads it on every tick, and the Settings page shows
 * it with `howTheReplyReminderIsSet` below.
 */
export function replyReminderMinutes(): number {
  return wholeNumberSetting(THE_REPLY_REMINDER_SETTING)
}

/** The reply reminder's variable, named once for the reader above and the line on the Settings page. */
export const THE_REPLY_REMINDER_SETTING = 'MOLE_OFFICE_REPLY_REMINDER_MINUTES'

/**
 * HOW THE REPLY REMINDER IS SET, for its read-only line on the Settings page. `minutes` is what the reminder reads, so the
 * page cannot show one number while the reminder uses another. `set` says whether the environment or .env holds the
 * variable; when it does not, the minutes are the built-in value. A value that is not a whole number gives no minutes
 * and the reader's own sentence as `problem`, because the reminder does not run on it either.
 */
export function howTheReplyReminderIsSet(): ReplyReminderSetting {
  const set = settingWasSet(THE_REPLY_REMINDER_SETTING)
  try {
    return { variable: THE_REPLY_REMINDER_SETTING, minutes: replyReminderMinutes(), set, problem: null }
  } catch (err) {
    return { variable: THE_REPLY_REMINDER_SETTING, minutes: null, set, problem: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * HOW LONG AFTER A MESSAGE IS WRITTEN ITS WRITER MAY STILL CHANGE ITS WORDS, in seconds. A
 * decision gave two minutes. Read on every change, so a test or a
 * restart can set it.
 */
export function messageEditWindowSeconds(): number {
  return wholeNumberSetting('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS')
}

/**
 * HOW LONG A HANDLE STAYS ITS SESSION'S AFTER THAT SESSION STOPS SAYING IT IS THERE, in seconds.
 *
 * Criterion M81, on problem `i05BSaUcdfXF`. The waiter for a Claude Code session EXITS in order to
 * wake it, so it stops beating every time a message arrives and starts beating again once the
 * session has answered. Measured on 7 September 2026: the gap was ninety-two seconds, the lapse
 * window was ninety, and the message worker started a run that wrote in a group as the secretary
 * while the secretary's own session was writing something else.
 *
 * So the lapse window is no longer the moment a handle is free. Past the lapse the handle is still
 * that session's until this window is up as well, and a message to the agent waits rather than
 * starting anything. The window is two minutes.
 *
 * IT MUST BE LONGER THAN THE LAPSE AND THE READER SAYS SO RATHER THAN CORRECTING IT, for the reason
 * the lapse says the same about the beat: a grace shorter than the lapse is a grace that never
 * happens, and quietly raising it would be substituting a number nobody set.
 */
export function handleGraceSeconds(): number {
  const grace = wholeNumberSetting('MOLE_OFFICE_HANDLE_GRACE_SECONDS')
  const lapse = handleLapsesAfterSeconds()
  if (grace <= lapse) {
    throw new Error(
      `MOLE_OFFICE_HANDLE_GRACE_SECONDS is ${String(grace)} seconds and ` +
        `MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS is ${String(lapse)}. A handle would be given up at the moment it ` +
        'stopped being answered, which is the state this window exists to end. Set the grace longer than the ' +
        'lapse. Nothing was read from either.',
    )
  }
  return grace
}
