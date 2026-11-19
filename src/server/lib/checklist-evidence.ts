// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN ITEM'S "DONE" MAY NAME AS EVIDENCE, OFFERED TO PICK FROM, at point 4 of a
 * decision.
 *
 * The person never types or pastes an id to mark an item done. The window asks this file for the things of
 * one evidence kind in the checklist's project, newest first, a page at a time, and the person picks one:
 *
 * - a report: a report record;
 * - a run: a session record;
 * - a commit: a landed merge entry, whose commit is where main stood after it landed;
 * - a manual section: one block of a report or a module, the two kinds that hold blocks.
 *
 * Each choice carries the evidence ready to send, so what is offered is exactly what the item door then
 * checks (`assertTheEvidenceIsThere` in ./checklists.ts). `words` keeps the choices whose title (or, for a
 * section, whose heading) holds every word given, in any case.
 *
 * ONLY THE FIELDS A CHOICE IS DRAWN FROM ARE READ, through `listRecordsWithDataAs`: a project holds thousands
 * of runs and every report's whole text, and a choice needs a title, a date and a few short fields.
 */

import { sql, type SQL } from 'drizzle-orm'

import { records } from '../db/schema.ts'
import { listRecordsWithDataAs, onlyTheseFieldsOf } from './records.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import { COMMIT_PATTERN, EVIDENCE_CHOICES_PAGE, type EvidenceChoice, type EvidenceKind } from '@shared/checklists.ts'
import { MERGE_ENTRY_KIND, INTEGRATED } from '@shared/merge-queue.ts'
import type { RecordKind } from '@shared/types.ts'
import { aBlockName, type NamedBlock } from '@shared/block-name.ts'

/** The two kinds whose blocks may be a manual section. */
const KINDS_WITH_SECTIONS = ['report', 'module'] as const satisfies readonly RecordKind[]

/** A block's id, type and the short words it is named by, and nothing of its body beyond 80 characters. */
function theBlocksNamedOf(field: string): SQL<string> {
  const path = sql.raw(`'$.${field}'`)
  return sql<string>`json_object('blocks', (SELECT json_group_array(json_object(
      'id', json_extract(block.value, '$.id'),
      'type', json_extract(block.value, '$.type'),
      'heading', json_extract(block.value, '$.heading'),
      'caption', json_extract(block.value, '$.caption'),
      'text', substr(json_extract(block.value, '$.text'), 1, 80)
    )) FROM json_each(${records.data}, ${path}) AS block))`
}

function day(stamp: string | null | undefined): string {
  return (stamp ?? '').slice(0, 16)
}

function holdsEveryWord(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return words.every((word) => lower.includes(word))
}

export { aBlockName, type NamedBlock }

/** Every choice of one kind, newest first, before the page is cut. */
function everyChoice(workspaceId: string, kind: EvidenceKind): EvidenceChoice[] {
  if (kind === 'report' || kind === 'run') {
    const recordKind: RecordKind = kind === 'report' ? 'report' : 'session'
    return listRecordsWithDataAs({ workspaceId, kind: recordKind }, onlyTheseFieldsOf([])).map((record) => ({
      evidence: { kind, record: record.id },
      title: record.title,
      detail: day(record.updatedAt),
    }))
  }
  if (kind === 'commit') {
    return listRecordsWithDataAs({ workspaceId, kind: MERGE_ENTRY_KIND as RecordKind }, onlyTheseFieldsOf(['state', INTEGRATED])).flatMap((record) => {
      const data = record.data as Record<string, unknown>
      const landed = data[INTEGRATED] as { mainAfter?: unknown; at?: unknown } | undefined
      const commit = landed?.mainAfter
      if (data['state'] !== 'landed' || typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) return []
      return [{ evidence: { kind, commit }, title: record.title, detail: `${commit.slice(0, 9)} · ${day(typeof landed?.at === 'string' ? landed.at : record.updatedAt)}` }]
    })
  }
  return KINDS_WITH_SECTIONS.flatMap((recordKind) => {
    const field = blocksFieldOf(recordKind)
    if (field === null) return []
    return listRecordsWithDataAs({ workspaceId, kind: recordKind }, theBlocksNamedOf(field)).map((record) => ({ record, blocks: (record.data as { blocks?: NamedBlock[] }).blocks ?? [] }))
  })
    .sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))
    .flatMap(({ record, blocks }) =>
      blocks
        .filter((block): block is NamedBlock & { id: string } => typeof block.id === 'string')
        .map((block) => ({ evidence: { kind, record: record.id, block: block.id }, title: aBlockName(block), detail: record.title })),
    )
}

/** One page of the choices of one evidence kind in one project, with how many match and how many are left. */
export function evidenceChoices(input: { workspaceId: string; kind: EvidenceKind; words?: string; offset?: number }): {
  choices: EvidenceChoice[]
  matched: number
  left: number
} {
  const words = (input.words ?? '').toLowerCase().split(/\s+/).filter((word) => word !== '')
  const all = everyChoice(input.workspaceId, input.kind)
  const kept = words.length === 0 ? all : all.filter((one) => holdsEveryWord(input.kind === 'manual section' ? `${one.title} ${one.detail}` : one.title, words))
  const offset = input.offset ?? 0
  const choices = kept.slice(offset, offset + EVIDENCE_CHOICES_PAGE)
  return { choices, matched: kept.length, left: Math.max(0, kept.length - offset - choices.length) }
}
