// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** The hourly Claude login reading: a counter requests it, and tools/run-the-login-reading.mjs answers it. */

/** The registered job the hourly counter requests. */
export const LOGIN_READING_JOB = 'sandboxes-claude.login-reading'
/** The sandbox the reading round runs in, kept for this reading alone. */
export const LOGIN_READING_SANDBOX = 'login-reading'
/** Seconds coreutils timeout lets the round run inside the sandbox before it stops it; nothing outside waits. */
export const LOGIN_READING_LIMIT_SECONDS = 300
/** The reading round as the sandbox runs it: one short Claude reply, whose stream carries the login's rate-limit event. */
export const LOGIN_READING_COMMAND = Object.freeze(['timeout', String(LOGIN_READING_LIMIT_SECONDS), 'claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose'])
/** The one counter that requests a reading each hour. Nobody may add to it, so it is a timer and fires with no count. */
export const LOGIN_READING_COUNTER = Object.freeze({ title: 'Hourly Claude login reading', label: 'Hourly login reading', counts: 'One login reading round each hour.', mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'every', hours: 1 }], action: { kind: 'job', job: LOGIN_READING_JOB } })
