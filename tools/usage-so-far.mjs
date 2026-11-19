#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE A CLAUDE CODE RUN'S USAGE SO FAR, AND WHAT SERVED IT, ONTO THE RUN, just before it seals itself.
 *
 *     node tools/usage-so-far.mjs
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Milestone M8 (report 4IoRUKizcZXb) gives every run a usage receipt. tools/sandbox-start.mjs writes it from the
 * run's -p envelope when the command exits. A supervisor round seals itself before that, and the seal revokes the
 * run's key, so the launcher's write at exit is refused, and what served the run was lost the same way. The answer
 * chosen (messages 5gg-Q_azbInF and fWNeIBeL3Meu): no write is accepted after the seal; instead the run writes
 * both while its key is still good. This tool is that write. A run that never runs it seals as before, with no
 * receipt; nothing refuses the seal.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES
 * ---------------------------------------------------------------------------------------
 *
 * One PATCH of the calling run (MOLE_OFFICE_SESSION) with `usageReceipt` and `served`, read from the run's own Claude
 * Code transcripts by src/config/usage.mjs and src/config/claude-code-served.mjs, the readers the launcher uses. Only
 * lines stamped at or after the run's record was filed count, because a round that continues a conversation shares
 * its transcript with the rounds before it. The transcript gives no cost, so the cost is absent ("not reported"), and
 * the receipt says it was read before the seal: the run's last reply, after this, is not in it. Which login paid,
 * where it ran, and any outside spending already on the receipt are kept.
 *
 * The run's key is read as the dsh hooks read it (theHeaders in tools/dsh-hooks/office.mjs): the agent's own key, or
 * the one in the office tool configuration MOLE_OFFICE_TOOL_CONFIGURATION names. It is never printed.
 *
 * Exit 0 when both were written. Exit 1, with one sentence on stderr, when they were not; the run may seal anyway.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { theLoginThatPaid } from '../src/config/claude-code-login.mjs'
import { theServedOfAClaudeCodeRun, theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { claudeTranscriptUsage, keepingTheOutsideSpend, whereItRan } from '../src/config/usage.mjs'
import { clockStamp, parseStoredStamp } from '../src/shared/time.ts'
import { apiAddress, ask, identity, theHeaders } from './dsh-hooks/office.mjs'

/** One sentence on stderr, and exit 1. */
function notWritten(why) {
  process.stderr.write(`usage-so-far: the run's usage so far was not written: ${why}. The run may seal anyway.\n`)
  process.exit(1)
}

const id = identity()
if (id === null) notWritten('MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE do not all name the run')
const api = apiAddress()
const read = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, { headers: theHeaders(id) })
if (read === null) notWritten(`Mole Office did not answer at ${api}`)
if (!read.ok) notWritten(`reading run ${id.session} was answered ${String(read.status)}`)
const record = read.body?.record ?? read.body
const cwd = record?.data?.workingDirectory
if (typeof cwd !== 'string' || cwd === '') notWritten(`run ${id.session} names no working directory, so its transcripts cannot be found`)
const sinceMs = parseStoredStamp(String(record.createdAt ?? ''))
if (sinceMs === null) notWritten(`run ${id.session}'s filing time ${JSON.stringify(record.createdAt)} is not a stamp`)

const folder = theTranscriptFolder(process.env, cwd)
/** @type {string[]} */
const texts = []
if (folder !== null && existsSync(folder)) {
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name)
    if (!name.endsWith('.jsonl') || !statSync(path).isFile() || statSync(path).mtimeMs < sinceMs) continue
    texts.push(readFileSync(path, 'utf8'))
  }
}
const readNow = clockStamp()
const readAt = readNow.instant
const fromTheTranscripts = claudeTranscriptUsage(texts, sinceMs)
const usageReceipt = keepingTheOutsideSpend(record.data?.usageReceipt, {
  ...fromTheTranscripts,
  says: `${fromTheTranscripts.says} Read at ${readAt}, before the run sealed itself: its last reply, after this, is not in it.`,
  paidBy: theLoginThatPaid(process.env),
  ranIn: whereItRan(process.env),
  readAt: readNow.stamp,
})
const { served } = theServedOfAClaudeCodeRun({ outPath: null, env: process.env, cwd, startedAt: clockStamp(() => new Date(sinceMs)).instant, briefPath: null })

const wrote = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, {
  method: 'PATCH',
  headers: theHeaders(id),
  body: { dataPatch: { usageReceipt, served } },
})
if (wrote === null) notWritten(`Mole Office did not answer at ${api}`)
if (!wrote.ok) notWritten(`the write on run ${id.session} was answered ${String(wrote.status)}: ${String(wrote.body?.error ?? '').slice(0, 300)}`)
process.stdout.write(
  `usage-so-far: run ${id.session} now holds its usage so far, read from ${texts.length} transcript(s) in ${folder ?? 'no folder'}: ` +
    `${JSON.stringify(usageReceipt)}; and what served it: ${JSON.stringify(served)}.\n`,
)
