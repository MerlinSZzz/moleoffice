// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN CHECK TOOL WHOSE CLAUDE LOGIN ANSWERED THAT ITS 5-HOUR LIMIT IS HIT, for
 * tests/a-check-that-hits-the-5-hour-limit-holds-new-checks.test.ts.
 *
 * It runs no model and judges no work. It prints the secretary's sample, tests/fixtures/a-check-that-hit-the-5-hour-limit.txt,
 * with one change: the reset time in the limit's words is moved to two hours from now, in Europe/London, so the hold
 * the test reads is in force whenever the test runs. Then it exits 1, as a check that got no verdict does.
 */
import { readFileSync } from 'node:fs'

const sample = readFileSync(new URL('./fixtures/a-check-that-hit-the-5-hour-limit.txt', import.meta.url), 'utf8')
const inTwoHours = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true })
  .formatToParts(new Date(Date.now() + 2 * 3_600_000))
const part = (type) => inTwoHours.find((one) => one.type === type)?.value ?? ''
const reset = `${part('hour')}:${part('minute')}${part('dayPeriod').toLowerCase()} (Europe/London)`
if (!sample.includes('7:10pm (Europe/London)')) throw new Error('The sample no longer holds the reset time this stand-in moves.')

process.stdout.write('Synthetic check tool: the line below is a copy of a real limit answer, with its reset time moved. No model ran.\n')
process.stdout.write(sample.replace('7:10pm (Europe/London)', reset))
process.exitCode = 1
