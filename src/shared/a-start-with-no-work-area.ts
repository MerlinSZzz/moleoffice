// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE SENTENCES A START CARRIES WHEN THE RUN'S AGENT HAS NO WORK AREA AND THE RUN WOULD SUBMIT GIT WORK.
 *
 * The requirement of 8 November 2026: a worker whose run ends with commits and a report but whose agent registered no
 * work area had its finish refused, and its record said running until somebody closed it by hand. Nothing told anyone
 * at the start. Both start doors (the worker door and the round start) now say it in these three sentences, read from
 * this one place, and the run still starts: this is a reminder, not a refusal.
 *
 * WHY THE HANDLE IS A PLACEHOLDER AND NOT PART OF THE WORDS: the two doors name different agents, and a test reads each
 * sentence from here rather than retyping it, so the words a person reads and the words a test looks for cannot drift.
 */
export const NO_WORK_AREA_FIRST = 'The agent {handle} has no work area, so its run cannot finish with a git submission.'
export const NO_WORK_AREA_HOW = 'Its supervisor gives it a folder under its own by naming workArea at POST /api/agents/started.'
export const NO_WORK_AREA_REMINDER = 'The run starts anyway: this is a reminder, not a refusal.'

/** The three sentences, as one answer carries them, with the agent's handle in the first. */
export function theReminderAStartWithNoWorkAreaCarries(handle: string): string {
  return `${NO_WORK_AREA_FIRST.replace('{handle}', handle)} ${NO_WORK_AREA_HOW} ${NO_WORK_AREA_REMINDER}`
}
