// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Tell the recorded owner when an automatic round is requested or started. */
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import { AT_THE_SEAL, thePartAtTheSeal } from '@shared/merge-queue-at-the-seal.ts'
import { readNextRoundAtTheSeal } from '@shared/next-round-at-the-seal.ts'
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { THE_OFFICE } from './the-office.ts'
import { asTheOfficeWriting } from './merge-queue-fields-the-office-writes.ts'
import { type RegisteredAgent } from './participants.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { aPatchThatReplaces, createRecord, getRecord, patchRecord } from './records.ts'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

type Secretary = { to: ParticipantRef; says: null } | { to: null; says: string }

/** Read the recorded owner for each notice. */
function theNoticeRecipient(agent: RegisteredAgent, _workspaceId: string): Secretary {
  const told = whoIsToldOfTheRun(agent)
  return 'to' in told ? { to: told.to, says: null } : { to: null, says: told.because }
}

/** The line of a records-only seal never has its next round asked for by the office. */
export function whyThisRunStartsNoRound(run: PanelRecord): string | null {
  return isObject(run.data['submission']) && run.data['submission']['kind'] === 'records' ? `Run ${run.id} was sealed with records only.` : null
}

/** The words recorded when the line's secretary is unknown or ambiguous. */
export function whyNoSecretaryWasTold(agent: RegisteredAgent, workspaceId: string): string | null {
  return theNoticeRecipient(agent, workspaceId).says
}

/** Read the first physical line of the validated NEXT.md file, preserving it for the note. */
function theFirstLine(path: string): { raw: string; asks: boolean } {
  const text = readFileSync(path, 'utf8')
  const newline = text.indexOf('\n')
  const raw = newline < 0 ? text : text.slice(0, newline).replace(/\r$/, '')
  const words = raw.replace(/^\uFEFF/, '').trimStart().replace(/^#{1,6}\s+/, '').replace(/^(?:\*\*|__)/, '')
  return { raw, asks: words.startsWith('Ask the secretary first') }
}

/**
 * File one office message about the run to only the named secretary, unless the same notice already exists. The run is
 * asked in the words of its index (`STORED_FIELDS.messageAboutRun`), so SQLite reads the few messages about this run.
 */
function tellOnce(run: PanelRecord, to: ParticipantRef, body: string): void {
  const exists = sqlite.prepare(`SELECT 1 FROM records WHERE kind = 'message' AND deleted_at IS NULL AND ${theWordsOfAStoredField(STORED_FIELDS.messageAboutRun, 'data')} = ? AND json_extract(data, '$.body') = ? AND json_extract(data, '$.sentBy.id') = ? LIMIT 1`).get(run.id, body, moleOffice().id)
  if (exists) return
  createRecord({ workspaceId: run.workspaceId, kind: 'message', title: 'The next round', data: { body, to: [to], aboutRun: run.id, sentBy: moleOffice() }, actor: THE_OFFICE, senderIsMoleOffice: true })
}

/** Read NEXT.md and say whether its first line asks the secretary; write that secretary at most once. */
export function theSecretaryAskedFirst(run: PanelRecord, agent: RegisteredAgent, real: string, path: string): string | null {
  const sandbox = realpathSync(dirname(dirname(path)))
  if (!real.startsWith(sandbox + sep)) return null
  const first = theFirstLine(real)
  if (!first.asks) return null
  const secretary = theNoticeRecipient(agent, run.workspaceId)
  if (secretary.to !== null) tellOnce(run, secretary.to, `Brief ${path} asks the secretary first.`)
  const success = 'The office told its owner.'
  return `The first line of ${path} is ${JSON.stringify(first.raw)}. It asks the secretary first. ${secretary.says ?? success}`
}

/** Tell the secretary the new run and its brief, once the next round is filed. */
export function tellTheSecretaryTheRoundStarted(run: PanelRecord, agent: RegisteredAgent, next: string, brief: string): void {
  const secretary = theNoticeRecipient(agent, run.workspaceId)
  const before = thePartAtTheSeal(getRecord(run.id)?.data, 'nextRound')
  const note = readNextRoundAtTheSeal(before)
  if (isObject(before) && note?.outcome === 'asked' && (note.says ?? null) !== secretary.says) {
    const { says: _previous, ...rest } = note
    const updated = { ...rest, ...(secretary.says === null ? {} : { says: secretary.says }) }
    asTheOfficeWriting(AT_THE_SEAL, () => patchRecord(run.id, { dataPatch: { [AT_THE_SEAL]: { nextRound: aPatchThatReplaces(before, updated) } } }, THE_OFFICE))
  }
  if (secretary.to !== null) tellOnce(run, secretary.to, `Run ${next} started after run ${run.id} with brief ${brief}.`)
}
