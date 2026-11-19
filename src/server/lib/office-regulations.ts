// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS, READ FROM THE RECORDS, FOR EVERY CALLER THAT NEEDS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS EXTRACTED AND NOT WRITTEN IN THE ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * The chapters are `module` records carrying `extra.chapter` and the regulations are `regulation`
 * records. Three callers read them: `GET /api/office-regulations`, which a person's page draws, the
 * F16 outside export, which prints the chapter and rule names so an outside reader knows which rules
 * exist, and lib/chapters.ts, which names the chapters to an agent. `theTextForOutside` in
 * lib/delegation.ts needs the same chapters the route serves, and lib/chapters.ts reads the records
 * `theOfficesChapterRecords` lists.
 *
 * THE READING IS ONE FACT AND IS WORKED OUT IN ONE PLACE. `@shared/office-rules.ts` already holds
 * the mapping from a record to what a reader sees; this file holds which records are read and the
 * sentence saying where the reading came from. A second copy in the export would be a second answer
 * to "what are this office's regulations", free to drift from the page with nothing failing.
 */
import { ACROSS_WORKSPACES, GOVERNANCE_GUARDS, aRaiseCarriesIt, asTheOnlyThisOfficeDoor, assertThePersonIsProved, theSecretaryActingForThePerson, getRecord, listRecords, patchRecord, createRecord, deleteRecord, versionOf, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { readTheRoleCards, theRoleCardsAreRead, theShippedRoleCards } from './roles.ts'
import { createHash } from 'node:crypto'
import { sqlite } from '../db/client.ts'
import { getRevision } from './revisions.ts'
import { readTheDefaultRegulations } from './read-the-default-regulations.ts'
import { contentOfChapter, chapterContent, chapterWithContent, problemsWithAChapter, rulesFileWithChapter } from '@shared/chapter-check.ts'
import { chapterFromRecord, theChineseOfATextBlock, theEnglishHashOfAChapter, theEnglishHashOfARule, type OfficeChapter, type OfficeChapterInBothLanguages, type ARecordAsRead } from '@shared/office-rules.ts'
import type { ChapterContent, SelectedChapter, TheSelectedChapters, AChapterPreview, AChapterWritten, AChaptersHistory } from '@shared/chapter-edit.ts'
import { announce } from './events.ts'
import { isAChapterRow, theProjectOfTheChapters } from './chapter-rows.ts'
import { A_CHAPTER, chapterNumberOf, theOnlyCopyIsTheFirst } from '@shared/office-rules.ts'
import { theRulesOnlyForThisOffice } from '@shared/default-set.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import {
  chaptersInBothLanguagesFromRecords,
  copiedFromTheDefaultsOf,
  regulationsFromRecords,
  type WhatTheOfficeRegulationsSay,
} from '@shared/office-rules.ts'
import { refuseChapterEdit } from './refuse-chapter-edit.ts'

/**
 * THE RECORDS THE OFFICE'S CHAPTERS ARE READ FROM: every chapter record of the office, in whichever project it is filed.
 * An office holds one set of regulations, and every project of it reads that set. A fresh office files the set in `default`; the office this repository is
 * developed in files it in a project of its own. The page and every reader in lib/chapters.ts read these, so they name
 * the same chapters.
 */
export function theOfficesChapterRecords(): PanelRecord[] {
  return listRecords({ workspaceId: ACROSS_WORKSPACES, kind: A_CHAPTER.kind, alsoWhere: isAChapterRow() })
}

/** Shipped content is a recovery source. It is never used for an absent chapter. */
function shippedChapterRecords(): (ARecordAsRead & { workspaceId: string })[] {
  return readTheDefaultRegulations().map(chapter => ({
    id: `shipped-chapter-${String(chapter.n)}`, workspaceId: 'default', kind: A_CHAPTER.kind, title: chapter.title, summary: chapter.conclusion,
    data: {
      extra: { chapter: chapter.n, ...(chapter.forRole === undefined ? {} : { forRole: chapter.forRole }) }, context: chapter.context,
      shortForms: { label: { text: chapter.label } },
      summaryBlocks: chapter.outline.map(rule => ({ id: rule.id, type: 'text', heading: rule.name, text: rule.text })),
    },
  }))
}

/**
 * THE ROLE NAMES A ROLE CHAPTER'S MARK MAY NAME: the agent cards of the roles file, never a person card.
 * The server reads those cards once, at its start. A reader that runs before anything has read them asks
 * the same file reader the start does, rather than reading the file a second way.
 */
function theRoleNamesTheRolesFileHolds(): ReadonlySet<string> {
  const cards = theRoleCardsAreRead()
    ? theShippedRoleCards()
    : readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap(one => [one.actKey, one.personAct]) })
  return new Set(cards.cards.map(card => card.name))
}

/**
 * The newest revision of each record named. A record this office keeps no revision of is not in the map, and is said as
 * null. A chapter and a regulation both say it. One statement for all of them, because GET /api/after-a-compaction reads
 * every chapter and its statements are capped (tests/the-read-after-a-compaction-stays-small.test.ts).
 */
function theNewestRevisionsOf(recordIds: readonly string[]): Map<string, number> {
  if (recordIds.length === 0) return new Map()
  const rows = sqlite.prepare(`SELECT record_id AS id, max(seq) AS seq FROM revisions WHERE record_id IN (${recordIds.map(() => '?').join(', ')}) GROUP BY record_id`).all(...recordIds) as { id: string; seq: number }[]
  return new Map(rows.map((row) => [row.id, row.seq]))
}

/** Work out the content in use once, for the doors and every older reader. */
function selectChapters(checkout?: string): { answer: TheSelectedChapters; records: (ARecordAsRead & { workspaceId: string })[]; held: PanelRecord[] } {
  const live = theOfficesChapterRecords().sort((a, b) => a.id.localeCompare(b.id))
  const newest = theNewestRevisionsOf(live.map(one => one.id))
  const shipped = shippedChapterRecords()
  let used = shipped.filter(one => live.some(record => chapterNumberOf(record.kind, record.data) === chapterNumberOf(one.kind, one.data)))
  const chapters: SelectedChapter[] = []
  for (const source of shipped) {
    const defaultChapter = chapterFromRecord(source)!
    const n = defaultChapter.n
    const held = live.filter(record => chapterNumberOf(record.kind, record.data) === n)
    const first = held[0]
    const stored = first === undefined ? null : contentOfChapter(chaptersInBothLanguagesFromRecords([first])[0]!)
    const problems = held.flatMap(record => problemsWithAChapter(n, contentOfChapter(chaptersInBothLanguagesFromRecords([record])[0]!), used.map(one => chapterFromRecord(one)!), checkout).map(problem => `${record.id}: ${problem}`))
    if (held.length > 1) problems.unshift(`Chapter ${String(n)} is held by more than one live record: ${held.map(one => one.id).join(', ')}. Choose the record to keep when restoring or applying.`)
    const inUse = first === undefined ? 'none' : problems.length > 0 ? 'shipped' : 'stored'
    const record = inUse === 'stored' ? first! : source
    if (inUse === 'stored') used = used.map(one => chapterNumberOf(one.kind, one.data) === n ? record : one)
    const inUseChapter = inUse === 'none' ? null : chaptersInBothLanguagesFromRecords([record])[0]!
    chapters.push({
      n, inUse, record: first?.id ?? null,
      version: first === undefined ? null : held.length === 1 ? versionOf(first) : createHash('sha256').update(JSON.stringify(held.map(one => [one.id, versionOf(one)]))).digest('hex'),
      revision: inUse === 'stored' ? newest.get(first!.id) ?? null : null,
      chapter: inUseChapter === null ? null : contentOfChapter(inUseChapter), ...(inUseChapter?.forRole === undefined ? {} : { forRole: inUseChapter.forRole }), stored,
      shipped: contentOfChapter(defaultChapter), notUsed: problems.length === 0 ? null : { records: held.map(one => one.id), problems },
      chineseWaiting: first === undefined ? [] : [
        ...(Array.isArray(first.data['summaryBlocks']) ? (first.data['summaryBlocks'] as { id: string; heading?: string; text: string; zh?: unknown }[]).filter(one => one !== null && typeof one === 'object' && theChineseOfATextBlock(one).state === 'from another English').map(one => one.id) : []),
        ...(first.data['zh'] !== undefined && first.data['zh'] !== null && chaptersInBothLanguagesFromRecords([first])[0]?.zh === null ? ['chapter'] : []),
      ],
    })
  }
  const shippedNumbers = shipped.map(source => chapterFromRecord(source)!.n)
  const unshippedNumbers: number[] = []
  for (const record of live) {
    const number = chapterNumberOf(record.kind, record.data)
    if (number !== null && !shippedNumbers.includes(number) && !unshippedNumbers.includes(number)) unshippedNumbers.push(number)
  }
  const roleNames = unshippedNumbers.length === 0 ? new Set<string>() : theRoleNamesTheRolesFileHolds()
  const refused: { records: string[]; problems: string[] }[] = []
  for (const n of unshippedNumbers) {
    const held = live.filter(record => chapterNumberOf(record.kind, record.data) === n)
    if (held.length > 1) {
      refused.push({ records: held.map(one => one.id), problems: [`Chapter ${String(n)} is held by more than one live record: ${held.map(one => one.id).join(', ')}. Choose the record to keep when restoring or applying.`] })
      continue
    }
    const first = held[0]!
    const stored = contentOfChapter(chaptersInBothLanguagesFromRecords([first])[0]!)
    const forRole = chapterFromRecord(first)!.forRole
    if (forRole === undefined) {
      refused.push({ records: [first.id], problems: [`${first.id}: Chapter ${String(n)} is not one of the shipped chapter numbers and is not used.`] })
      continue
    }
    if (!roleNames.has(forRole)) {
      refused.push({ records: [first.id], problems: [`${first.id}: Chapter ${String(n)} is marked for the role "${forRole}", which no role card holds, and is not used.`] })
      continue
    }
    const problems = problemsWithAChapter(n, stored, used.map(one => chapterFromRecord(one)!), checkout, undefined, true, [...shippedNumbers, n]).map(problem => `${first.id}: ${problem}`)
    if (problems.length > 0) {
      refused.push({ records: [first.id], problems })
      continue
    }
    chapters.push({
      n, inUse: 'stored', record: first.id, version: versionOf(first), revision: newest.get(first.id) ?? null,
      chapter: stored, forRole, stored, shipped: null, notUsed: null,
      chineseWaiting: [
        ...(Array.isArray(first.data['summaryBlocks']) ? (first.data['summaryBlocks'] as { id: string; heading?: string; text: string; zh?: unknown }[]).filter(one => one !== null && typeof one === 'object' && theChineseOfATextBlock(one).state === 'from another English').map(one => one.id) : []),
        ...(first.data['zh'] !== undefined && first.data['zh'] !== null && chaptersInBothLanguagesFromRecords([first])[0]?.zh === null ? ['chapter'] : []),
      ],
    })
    used = [...used, first]
  }
  chapters.sort((a, b) => a.n - b.n)
  const unsupported = refused.flatMap(one => one.problems)
  const first = chapters[0]!
  const firstContent = first.chapter ?? first.shipped
  if (firstContent === null) throw new Error(`Chapter ${String(first.n)} holds no content, so the rules file cannot be measured.`)
  const size = rulesFileWithChapter(first.n, firstContent, used.map(one => chapterFromRecord(one)!), checkout)
  const says = chapters.map(chapter => chapter.inUse === 'shipped' ? chapterSelectionNotice(chapter) : chapter.inUse === 'none' ? `This office holds no chapter ${String(chapter.n)}. Restore from shipped files it.` : '').filter(Boolean).concat(unsupported, 'notMeasured' in size ? [size.notMeasured] : []).join(' ')
  return { answer: { chapters, unsupported: refused.length === 0 ? null : { records: refused.flatMap(one => one.records), problems: unsupported }, says, records: used }, records: used, held: live }
}

export function theSelectedChapters(checkout?: string): TheSelectedChapters { return selectChapters(checkout).answer }
export function selectedChapterRecords(): (ARecordAsRead & { workspaceId: string })[] { return selectChapters().records }

/** This sentence names every refused record beside the content being shown. */
export function chapterSelectionNotice(chapter: SelectedChapter): string {
  return chapter.notUsed === null ? '' : `Chapter ${String(chapter.n)} uses the shipped content. Stored records not used: ${chapter.notUsed.records.join(', ')}. ${chapter.notUsed.problems.join(' ')}`
}

export type SelectedOfficeChapter = OfficeChapterInBothLanguages & { notUsed: SelectedChapter['notUsed']; selectionNotice: string }
export function selectedChaptersInBothLanguages(selected = selectChapters()): SelectedOfficeChapter[] {
  return chaptersInBothLanguagesFromRecords(selected.records).map(chapter => {
    const choice = selected.answer.chapters.find(one => one.n === chapter.n)!
    return { ...chapter, notUsed: choice.notUsed, selectionNotice: chapterSelectionNotice(choice) }
  })
}

export function previewChapter(n: number, value: unknown, restoring = false, beforeOverride?: ChapterContent | null, target?: PanelRecord): AChapterPreview {
  const selected = theSelectedChapters()
  const choice = selected.chapters.find(one => one.n === n)
  const before = beforeOverride === undefined ? choice?.stored ?? choice?.chapter : beforeOverride
  const source = chapterContent(value)
  source.title = source.title.trim()
  const next = restoring ? source : chapterReadyToWrite(n, source, target).chapter
  const chapters = selected.chapters.flatMap(one => one.chapter === null ? [] : [chapterWithContent(one.n, one.chapter, { forRole: one.forRole })])
  // The selected numbers are the shipped ones and the role chapters', so a role chapter is edited and restored here too.
  return {
    problems: problemsWithAChapter(n, source, chapters, undefined, restoring ? undefined : { before: before ?? null }, true, selected.chapters.map(one => one.n)),
    ownWords: (() => { const own = (one: ChapterContent) => ({ label: one.label, title: one.title, conclusion: one.conclusion, zh: one.zh }); const was = own(before ?? chapterContent(null)), becomes = own(next); return JSON.stringify(was) === JSON.stringify(becomes) ? null : { was, becomes } })(),
    changes: [...new Set([...(before?.rules.map(rule => rule.id) ?? []), ...next.rules.map(rule => rule.id)])].flatMap(id => {
      const was = before?.rules.find(rule => rule.id === id), becomes = next.rules.find(rule => rule.id === id)
      if (JSON.stringify(was) === JSON.stringify(becomes)) return []
      return [{ rule: id, was: was === undefined ? null : { heading: was.heading, text: was.text, zh: was.zh }, becomes: becomes === undefined ? null : { heading: becomes.heading, text: becomes.text, zh: becomes.zh } }]
    }),
    rulesFile: rulesFileWithChapter(n, next, chapters),
  }
}

export { refuseChapterEdit } from './refuse-chapter-edit.ts'

/** Record refusals and missing revisions keep this door's code and rollback sentence. */
function refuseAChapterError(error: unknown): never {
  if (error instanceof PanelError && error.code !== 'chapterEditRefused') refuseChapterEdit(error.message, error.status)
  throw error
}

/** The record's revisions are the only history. Read one extra row to name the next page. */
export function chapterHistory(n: number, offset = 0): AChaptersHistory {
  const chapter = theSelectedChapters().chapters.find(one => one.n === n)
  if (chapter === undefined) refuseChapterEdit('That number is not a shipped chapter.', 404)
  if (chapter.record === null) return { record: null, versions: [], next: null }
  const rows = sqlite.prepare('SELECT seq FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 11 OFFSET ?').all(chapter.record, offset) as { seq: number }[]
  return {
    record: chapter.record,
    versions: rows.slice(0, 10).map(row => {
      const revision = getRevision(chapter.record!, row.seq)
      const predecessor = sqlite.prepare('SELECT seq FROM revisions WHERE record_id = ? AND seq < ? ORDER BY seq DESC LIMIT 1').get(chapter.record, row.seq) as { seq: number } | undefined
      const asChapter = (content: typeof revision.content) => contentOfChapter(chaptersInBothLanguagesFromRecords([{ id: chapter.record!, ...content }])[0] ?? chapterWithContent(n, chapterContent(null)))
      return { seq: revision.seq, at: revision.at, by: { type: revision.who.actorType, id: revision.who.actorId }, because: revision.why ?? '', before: predecessor === undefined ? null : asChapter(getRevision(chapter.record!, predecessor.seq).content), after: asChapter(revision.content) }
    }),
    next: rows.length > 10 ? offset + 10 : null,
  }
}

interface AChapterReadyToWrite {
  chapter: ChapterContent
  rules: Record<string, unknown>[]
  zh: unknown
  chineseDropped: string[]
}

/** Preview and writes choose the same record. keep chooses a target among duplicates, never a history source. */
function chapterRecordToKeep(n: number, keep?: string, version?: string | null) {
  const selected = theSelectedChapters().chapters.find(one => one.n === n)
  if (selected === undefined) refuseChapterEdit('That number is not a shipped chapter.')
  if (version !== undefined && selected.version !== version) refuseChapterEdit('The chapter changed after you read it. Read it again before applying.', 409)
  const held = theOfficesChapterRecords().filter(one => chapterNumberOf(one.kind, one.data) === n)
  if (held.length > 1 && keep === undefined) refuseChapterEdit('More than one live record holds this chapter. Name the record to keep.')
  if (keep !== undefined && !held.some(one => one.id === keep)) refuseChapterEdit('The record to keep does not hold this chapter.', 409)
  return { selected, held, record: held.find(one => one.id === keep) ?? held[0] }
}

/** A bad keep is a preview problem. The writer meets the same check as a refusal. */
export function previewAChapterEdit(n: number, value: unknown, keep?: string): AChapterPreview {
  try {
    const target = chapterRecordToKeep(n, keep).record
    const before = target === undefined ? null : contentOfChapter(chaptersInBothLanguagesFromRecords([target])[0]!)
    return previewChapter(n, value, false, before, target)
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    const preview = previewChapter(n, value, false, null)
    return { ...preview, problems: [error.message.replace(/ Nothing was changed\.$/, ''), ...preview.problems] }
  }
}

/** Work out the Chinese actually kept or dropped once, for the preview and the write. */
function chapterReadyToWrite(n: number, source: ChapterContent, record: PanelRecord | undefined, from?: 'shipped' | number, stale: string[] = []): AChapterReadyToWrite {
  source = { ...source, title: source.title.trim() }
  const oldRules = (Array.isArray(record?.data['summaryBlocks']) ? record.data['summaryBlocks'] : []) as Record<string, unknown>[]
  const chineseDropped = [...stale]
  const rules = source.rules.map(rule => {
    const old = oldRules.find(one => one !== null && one['id'] === rule.id)
    const changed = old?.['heading'] !== rule.heading || old?.['text'] !== rule.text
    const zh = from === 'shipped' ? changed ? undefined : old?.['zh']
      : rule.zh === null ? from === undefined ? old?.['zh'] : undefined
      : { ...rule.zh, from: theEnglishHashOfARule({ name: rule.heading, text: rule.text }) }
    if (from !== undefined && zh === undefined && old?.['zh'] != null) chineseDropped.push(rule.id)
    const { zh: oldChinese, ...kept } = old ?? {}
    return { ...kept, id: rule.id, type: 'text', heading: rule.heading, text: rule.text, ...(zh === undefined ? {} : { zh }) }
  })
  const ownChanged = record === undefined || record.title !== source.title || record.summary !== source.conclusion || chapterFromRecord(record)!.label !== source.label
  const zh = from === 'shipped' ? ownChanged ? undefined : record?.data['zh']
    : source.zh === null ? from === undefined ? record?.data['zh'] : undefined
    : { title: source.zh.title, summary: source.zh.conclusion, label: source.zh.label, from: theEnglishHashOfAChapter(source) }
  if (from !== undefined && zh === undefined && record?.data['zh'] != null) chineseDropped.push('chapter')
  const actual = chaptersInBothLanguagesFromRecords([{ id: record?.id ?? `chapter-${String(n)}`, kind: A_CHAPTER.kind, title: source.title, summary: source.conclusion, data: { extra: { chapter: n }, shortForms: { label: { text: source.label } }, summaryBlocks: rules, ...(zh === undefined ? {} : { zh }) } }])[0]!
  return { chapter: contentOfChapter(actual), rules, zh, chineseDropped: [...new Set(chineseDropped)] }
}

/** Resolve the same content for a restore preview and a write. History always belongs to the shown record. */
export function resolveAChapterRestore(n: number, from: 'shipped' | number, keep?: string): AChapterReadyToWrite & { before: ChapterContent | null } {
  const { selected, record: target } = chapterRecordToKeep(n, keep)
  const before = target === undefined ? null : contentOfChapter(chaptersInBothLanguagesFromRecords([target])[0]!)
  if (from === 'shipped') {
    if (selected.shipped === null) refuseChapterEdit(`Chapter ${String(n)} is not shipped, so there is no shipped text to restore it from.`, 404)
    return { ...chapterReadyToWrite(n, selected.shipped, target, from), before }
  }
  if (selected.record === null) refuseChapterEdit('This chapter has no record history to restore.', 404)
  try {
    const revision = getRevision(selected.record, from)
    const chapter = chaptersInBothLanguagesFromRecords([{ id: selected.record, ...revision.content }])[0] ?? null
    if (chapter === null || chapter.n !== n) refuseChapterEdit('That revision holds no such chapter.')
    const data = revision.content.data
    const stale = (Array.isArray(data['summaryBlocks']) ? data['summaryBlocks'] : []).filter((one: { heading?: string; text: string; zh?: unknown }) => one !== null && typeof one === 'object' && theChineseOfATextBlock(one).state === 'from another English').map((one: { id: string }) => one.id)
    if (data['zh'] !== undefined && data['zh'] !== null && chapter.zh === null) stale.push('chapter')
    return { ...chapterReadyToWrite(n, contentOfChapter(chapter), target, from, stale), before }
  } catch (error) {
    refuseAChapterError(error)
  }
}

/**
 * Chapter edits preserve neutral twins and office marks by rule id. Both writes and duplicate deletion roll back together.
 *
 * THE PERSON WRITES A CHAPTER, A SECRETARY'S GRANT CARRIES SOME WRITES HERE, AND A SECRETARY CARRYING THE OWNER'S
 * WRITTEN WORDS FOR THIS ONE CHANGE WRITES IT TOO. The card keeps both the door and the write of a regulation for the
 * person, so the grant is asked about both, and this office's list must say it presses each. The words name this one
 * change and need no list; only a secretary that uses its own key carries them.
 */
export function writeChapter(input: { n: number; version: string | null; because: string; chapter?: unknown; from?: 'shipped' | number; keep?: string; actor: Actor }): AChapterWritten {
  try {
    if (
      !thePersonIsProved(input.actor) &&
      !(input.actor.warrant !== undefined && theSecretaryActingForThePerson(input.actor)) &&
      !aRaiseCarriesIt(input.actor, { also: ['record:regulation'] })
    ) {
      // NO "Nothing was written." HERE: `refuseChapterEdit` ends every refusal of this door with "Nothing was changed."
      assertThePersonIsProved(input.actor, 'Writing a chapter', undefined, null)
    }
  } catch (error) { if (error instanceof PanelError) refuseChapterEdit(error.message, error.status); throw error }
  let answer: AChapterWritten
  try { answer = sqlite.transaction(() => {
    const { selected, held, record } = chapterRecordToKeep(input.n, input.keep, input.version)
    const restore = input.from === undefined ? null : resolveAChapterRestore(input.n, input.from, input.keep)
    const value = restore?.chapter ?? input.chapter
    const previous = record === undefined ? null : contentOfChapter(chaptersInBothLanguagesFromRecords([record])[0]!)
    const checked = previewChapter(input.n, value, input.from !== undefined, previous, record)
    if (checked.problems.length > 0) refuseChapterEdit(checked.problems.join(' '))
    const ready = restore ?? chapterReadyToWrite(input.n, chapterContent(value), record)
    const chapter = ready.chapter
    const marks = (Array.isArray(record?.data['onlyThisOffice']) ? record.data['onlyThisOffice'] : []) as Record<string, unknown>[]
    const remaining = marks.filter(mark => chapter.rules.some(rule => rule.id === mark['rule']))
    const dataPatch = { summaryBlocks: ready.rules, ...(ready.zh === undefined ? record?.data['zh'] === undefined ? {} : { zh: null } : { zh: ready.zh }), ...(marks.length === remaining.length ? {} : { onlyThisOffice: remaining.length === 0 ? null : remaining }) }
    const note = input.because
    asTheOnlyThisOfficeDoor(() => {
      let target = record
      // Restore of a missing chapter from the shipped files writes the shipped chapter's role mark. Apply writes typed content, which names no role.
      const forRole = input.from === 'shipped' ? readTheDefaultRegulations().find(one => one.n === input.n)?.forRole : undefined
      if (target === undefined) target = createRecord({ kind: A_CHAPTER.kind, title: chapter.title, summary: chapter.conclusion, data: { state: 'active', parts: [], extra: { chapter: input.n, ...(forRole === undefined ? {} : { forRole }) } }, workspaceId: theProjectOfTheChapters(), actor: input.actor })
      const newest = sqlite.prepare('SELECT seq, content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(target.id) as { seq: number; content_hash: string }
      const shortForms = { ...(target.data['shortForms'] as Record<string, unknown> ?? {}), label: { text: chapter.label, madeFrom: { seq: newest.seq, contentHash: newest.content_hash } } }
      patchRecord(target.id, { title: chapter.title, summary: chapter.conclusion, dataPatch: { ...dataPatch, shortForms } }, input.actor, { op: input.from === undefined ? 'update' : 'restore', note })
      for (const other of held) if (other.id !== target.id) deleteRecord(other.id, input.actor)
    })
    return { ...theSelectedChapters().chapters.find(one => one.n === input.n)!, written: true, chineseDropped: ready.chineseDropped }
  })() } catch (error) {
    refuseAChapterError(error)
  }
  announce({ name: 'machine.changed', changed: ['settings'] })
  return answer
}

/**
 * THE PERSON'S REGULATIONS AND THE CHAPTERS, as the office's records hold them, the same in every project. A regulation
 * is the person's constraint on themselves wherever they are working, so it is read from every project as the
 * chapters are. Where each is filed does not change, and each says where.
 * `workspaceId` is only the project the reader asked in, said back to it.
 *
 * No export is read here. src/config/rules/chapters.json and CODE.md are copies of the chapters of the office this
 * repository is developed in, and a page that drew from a copy would agree with the file until the records changed, and
 * then keep agreeing with the file against them. Shipped defaults are read only when present stored chapters fail the check, and that recovery is named.
 */
export function theOfficeRegulations(workspaceId: string): WhatTheOfficeRegulationsSay {
  const selected = selectChapters()
  const records = [...listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'regulation' }), ...selected.records]
  // WITH THEIR CURRENT CHINESE, for the page. A Chinese half written from
  // another English is answered as none. The exporter reads the same selected records, with their current Chinese.
  const chapters = selectedChaptersInBothLanguages(selected)
  const read = regulationsFromRecords(records)
  const newest = theNewestRevisionsOf(read.map((one) => one.id))
  const regulations = read.map((one) => ({ ...one, revision: newest.get(one.id) ?? null }))
  const copiedFromTheDefaults = copiedFromTheDefaultsOf(selected.held, chapters.map(one => one.n))
  const copiedSentence = copiedFromTheDefaultsSentence(copiedFromTheDefaults)
  return {
    regulations,
    chapters,
    says:
      selected.answer.says + ' ' +
      `Read from this office's records, in every project: ${String(selected.held.length)} module ` +
      `${selected.held.length === 1 ? 'record carries' : 'records carry'} a chapter number and ${String(regulations.length)} ` +
      `regulation ${regulations.length === 1 ? 'record is' : 'records are'} filed. They are this office's regulations, ` +
      'the same in every project. A file written from the chapters is a copy, and when a stored chapter passes the check, its record is right.' +
      (copiedSentence === '' ? '' : ` ${copiedSentence}`),
    workspaceId,
    copiedFromTheDefaults,
  }
}

/**
 * THE DOOR'S SENTENCE ABOUT THE COPIES, and the tests read it from here. Empty when these chapters were not copied.
 *
 * When the office's first copy is the only one that holds chapters in use (`theOnlyCopyIsTheFirst`), it says that every
 * chapter was copied then, or first names the chapters with no copy stamp as added later. Otherwise it says, for each
 * copy, which chapters it holds and whether it ran at the first start or at a later one, and then which chapters no
 * start recorded copying.
 */
export function copiedFromTheDefaultsSentence(copied: WhatTheOfficeRegulationsSay['copiedFromTheDefaults']): string {
  if (copied === null) return ''
  const chapters = (numbers: readonly number[]): string => `${numbers.length === 1 ? 'chapter' : 'chapters'} ${numbers.join(', ')}`
  const was = (numbers: readonly number[]): string => (numbers.length === 1 ? 'was' : 'were')
  const only = theOnlyCopyIsTheFirst(copied)
  if (only !== null) {
    const later = copied.notCopied
    return (later.length === 0 ? 'These chapters were' : `${later.length === 1 ? 'Chapter' : 'Chapters'} ${later.join(', ')} ${was(later)} added later. The other chapters were`) +
      ` copied from the default set (${only.file}) when this office first ` +
      `started, at ${only.at}. The owner may change any of them here.`
  }
  return [
    ...copied.copies.map(copy =>
      `${copy.chapters.length === 1 ? 'Chapter' : 'Chapters'} ${copy.chapters.join(', ')} ${was(copy.chapters)} copied from the default set (${copy.file}) ` +
      (copy.first ? `when this office first started, at ${copy.at}.` : `at a later start, at ${copy.at}, because this office did not hold ${copy.chapters.length === 1 ? 'it' : 'them'}.`)),
    ...(copied.notCopied.length === 0 ? [] : [`No start of this office recorded copying ${chapters(copied.notCopied)}.`]),
    'The owner may change any of them here.',
  ].join(' ')
}

/** What the mark on one rule is after the press. */
export interface WhatTheMarkIs {
  chapter: string
  rule: string
  onlyThisOffice: boolean
  /** False when the rule already stood as asked, so nothing was written. */
  changed: boolean
}

/**
 * THE PERSON MARKS A RULE AS ONLY FOR THIS OFFICE, OR TAKES THE MARK OFF. A marked rule is left out of the default
 * regulations a new office copies; the file is src/shared/default-set.ts. The person presses it,
 * with their own key, because this decides which of the regulations every new office gets. A secretary holding their
 * grant presses it where this office's list of what the grant carries says so; a secretary carrying the owner's written
 * words for this one mark presses it too, whatever this office's list says. The card keeps the door for the person,
 * so an office that changed nothing refuses it. It writes only
 * `onlyThisOffice` on the chapter record, under the mark's own door, so the record door lets it through and refuses
 * every other writer (`refuseAnOnlyThisOfficeMarkOutsideItsDoor` in lib/records/served-doors.ts). It takes a chapter
 * record of the office from any project, since the page shows the office's one set in every project.
 */
export function markARuleOnlyForThisOffice(input: {
  chapter: string
  rule: string
  only: boolean
  actor: Actor
}): WhatTheMarkIs {
  if (
    !thePersonIsProved(input.actor) &&
    !(input.actor.warrant !== undefined && theSecretaryActingForThePerson(input.actor)) &&
    !aRaiseCarriesIt(input.actor)
  ) {
    assertThePersonIsProved(input.actor, 'Marking a rule as only for this office')
  }
  const record = getRecord(input.chapter)
  if (record === null || chapterNumberOf(record.kind, record.data) === null) {
    throw new PanelError(`No chapter record ${input.chapter} in this office. Nothing was written.`, 404)
  }
  const blocks = Array.isArray(record.data['summaryBlocks']) ? (record.data['summaryBlocks'] as Record<string, unknown>[]) : []
  if (!blocks.some((block) => block['type'] === 'text' && block['id'] === input.rule)) {
    throw new PanelError(`Chapter record ${input.chapter} has no rule ${input.rule}. Nothing was written.`, 404)
  }
  const held = Array.isArray(record.data['onlyThisOffice']) ? (record.data['onlyThisOffice'] as Record<string, unknown>[]) : []
  const isMarked = theRulesOnlyForThisOffice(record.data).has(input.rule)
  if (isMarked === input.only) return { chapter: record.id, rule: input.rule, onlyThisOffice: isMarked, changed: false }
  const next = input.only
    ? [...held, { rule: input.rule, by: input.actor.id, at: nowStamp() }]
    : held.filter((one) => one['rule'] !== input.rule)
  asTheOnlyThisOfficeDoor(() =>
    patchRecord(record.id, { dataPatch: { onlyThisOffice: next.length > 0 ? next : null } }, input.actor),
  )
  return { chapter: record.id, rule: input.rule, onlyThisOffice: input.only, changed: true }
}
