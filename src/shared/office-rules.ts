// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS, READ FOR A SCREEN: THE PERSON'S REGULATIONS AND THE CHAPTERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS READING LIVES IN src/shared AND IS USED BY MORE THAN ONE CALLER
 * ---------------------------------------------------------------------------------------
 *
 * A chapter is a `module` record carrying `extra.chapter`, and that record is the only authority
 * (decision `JC_raqC0fRCh`). `tools/rules-chapters.mjs` reads the records and writes the exports
 * under src/config/rules/; the page G5 gives the regulations draws the same records over its own door.
 * Two callers reading one authority with two hand-written mappings is the repository's named
 * defect — the same fact worked out in two places, so they can drift with nothing failing. So the
 * mapping of a record to what a reader sees is written here, once, and both callers call it.
 *
 * THE SECOND COPY THE OTHER WAY ROUND IS REFUSED BY DESIGN. Neither the page nor this mapping ever
 * reads src/config/rules/chapters.json or CODE.md: those are exports, and an export is a copy. A page
 * that drew from the export would agree with the file until the records changed and then keep
 * agreeing with the file against them.
 *
 * Nothing here touches node or the network: the server, the exporter tool and the browser all
 * import this file.
 */

import { englishHash } from './english-hash.ts'
import { REGULATION_KIND } from './regulation.ts'

/** One rule of one chapter: the outline line and its text, as the record holds them. */
export interface OfficeRule {
  id: string
  name: string
  text: string
}

/** One chapter of the office regulations, as the record holds it. */
export interface OfficeChapter {
  /** The chapter number, from `extra.chapter` on the record. */
  n: number
  /** The role this chapter belongs to, from `extra.forRole`. Absent on shared chapters. */
  forRole?: string
  /** The record this was read from. */
  id: string
  /** Reading position 1, 2 to 5 words. */
  label: string
  /** Reading position 2: the record's own title. */
  title: string
  /** Reading position 3, which every screen calls the Conclusion: the record's own summary. */
  conclusion: string
  /** Reading position 4: the rules, one line each. */
  outline: OfficeRule[]
  /** Why the chapter exists. */
  context: string
  /** Where its rules live in the checkout today. */
  source: string
}

/**
 * THE SHAPE EVERY READER OF A CHAPTER RECORD WORKS FROM: the record as the API and `listRecords`
 * hand it on. The exporter and the server both hold this shape, which is what lets one mapping
 * serve both.
 */
export interface ARecordAsRead {
  id: string
  kind: string
  title: string
  summary: string | null
  data: unknown
}

/**
 * ONE CHAPTER RECORD, READ FOR A READER. Null for a module that carries no chapter number — most
 * modules are subsystems, not chapters, and answering null is how this mapping says so without the
 * caller filtering twice.
 *
 * The fields are read the way the exporter has always read them, so a chapter on the page and the
 * same chapter in src/config/rules/CODE.md are the same bytes from the same record.
 */
export function chapterFromRecord(record: ARecordAsRead): OfficeChapter | null {
  const number = chapterNumberOf(record.kind, record.data)
  if (number === null) return null
  const held = record.data as Record<string, unknown>
  const forRole = readString(held, ['extra', 'forRole'])
  const label = readString(held, ['shortForms', 'label', 'text'])
  const blocks = held['summaryBlocks']
  return {
    n: number,
    ...(forRole === '' ? {} : { forRole }),
    id: record.id,
    label,
    title: record.title,
    conclusion: record.summary ?? '',
    outline: Array.isArray(blocks)
      ? blocks.map((block) => {
          const one = (typeof block === 'object' && block !== null ? block : {}) as Record<string, unknown>
          return {
            id: typeof one['id'] === 'string' ? one['id'] : '',
            name: typeof one['heading'] === 'string' ? one['heading'] : '',
            text: typeof one['text'] === 'string' ? one['text'] : '',
          }
        })
      : [],
    context: readString(held, ['context']),
    source: readString(held, ['source']),
  }
}

/**
 * C9 limits every agent's standing chapter pointers to 1,400 bytes. A chapter marked with
 * `extra.forRole` is left out of that shared load. Its role reads it through the card's `mustRead`.
 */
export function chaptersInTheStandingLoad<T extends Pick<OfficeChapter, 'forRole'>>(chapters: readonly T[]): T[] {
  return chapters.filter((chapter) => chapter.forRole === undefined)
}

/**
 * WHAT A CHAPTER IS, ONCE. A record is a chapter when its kind is `kind` and the value its data holds
 * at `numberAt` is a number. Two readers ask it: `chapterNumberOf` below, in JavaScript, and
 * `isAChapterRow` in src/server/lib/chapter-rows.ts, in SQL, which reads `jsonPath` and counts a JSON
 * number as SQLite's `json_type` names one (`sqliteNumberTypes`). Both read this, so they cannot come to
 * mean two things; tests/one-definition-of-a-chapter.test.ts holds them to the same answer.
 */
export const A_CHAPTER = {
  kind: 'module',
  numberAt: ['extra', 'chapter'],
  jsonPath: '$.extra.chapter',
  sqliteNumberTypes: ['integer', 'real'],
} as const

/**
 * WHICH CHAPTER A RECORD IS, or null when it is not one. A chapter is a `module` record whose
 * `data.extra.chapter` is a number (`A_CHAPTER`); every other module is a subsystem. The page, the
 * exporter and the record door's Chinese check all ask this one function.
 */
export function chapterNumberOf(kind: string, data: unknown): number | null {
  if (kind !== A_CHAPTER.kind) return null
  let at: unknown = data
  for (const key of A_CHAPTER.numberAt) {
    if (typeof at !== 'object' || at === null || Array.isArray(at)) return null
    at = (at as Record<string, unknown>)[key]
  }
  return typeof at === 'number' ? at : null
}

/**
 * A CHAPTER'S OUTLINE: which chapter it is, and its rules' ids in order, each with its English heading. The owner's
 * EhNAprifszYY makes a change to it a decision, and the coordinator's AWhlI0gV62Ep says what it holds: adding, removing, renaming
 * and reordering a rule all change it. A rule's text, the Chinese, the label, title and conclusion, the neutral twins
 * and the parts are not in it. The record door's guard is `refuseAnOutlineChangeWithoutTheirDecision` in
 * src/server/lib/records/may-write.ts.
 */
export interface AChaptersOutline {
  n: number
  rules: { id: string; heading: string }[]
}

/** The outline of a chapter record, read as `chapterFromRecord` reads it, or null when the record is not a chapter. */
export function theOutlineOfAChapter(record: { kind: string; data: unknown }): AChaptersOutline | null {
  const chapter = chapterFromRecord({ id: '', title: '', summary: null, kind: record.kind, data: record.data })
  if (chapter === null) return null
  return { n: chapter.n, rules: chapter.outline.map((rule) => ({ id: rule.id, heading: rule.name })) }
}

/** Whether a write changes an outline: it makes a chapter, ends one, or leaves another outline than it found. */
export function theOutlineChanges(before: AChaptersOutline | null, after: AChaptersOutline | null): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

/** One string reached by walking keys into stored data, or the empty string when it is not one. */
function readString(held: Record<string, unknown>, keys: string[]): string {
  let at: unknown = held
  for (const key of keys) {
    if (typeof at !== 'object' || at === null || Array.isArray(at)) return ''
    at = (at as Record<string, unknown>)[key]
  }
  return typeof at === 'string' ? at : ''
}

/** Every chapter the records hold, by number. The record is the authority; the export is a copy. */
export function chaptersFromRecords(records: readonly ARecordAsRead[]): OfficeChapter[] {
  return records
    .map(chapterFromRecord)
    .filter((one): one is OfficeChapter => one !== null)
    .sort((a, b) => a.n - b.n)
}

/**
 * ---------------------------------------------------------------------------------------
 * THE CHINESE HALVES: WHERE THEY ARE STORED, WHEN ONE IS CURRENT, AND WHEN A WRITE IS REFUSED
 * ---------------------------------------------------------------------------------------
 *
 * The office's own languages change together, and an out-of-date translation never passes for the
 * current one. The English stays the source. Three places carry a Chinese half:
 *   - a chapter record: `data.zh` = { title, summary, label?, from }, the Chinese of the record's title,
 *     summary and label (reading level 1). The label is optional in the Chinese; its English is in `from` all the same;
 *   - each text block of a chapter's `data.summaryBlocks` (one rule): `zh` = { heading, text, from };
 *   - a regulation record: `data.zh` = { title, from }. Its `sentence` is the person's own words and is never translated.
 * `from` is `englishHash` (src/shared/english-hash.ts) of the English the half was written from.
 * A chapter's neutral twins (src/shared/default-set.ts) carry Chinese too: `data.neutral.zh` and each block's `neutral.zh`.
 * Its `from` is the hash of the twin's own English, never the owner's, and the record door asks it as it asks the others.
 *
 * ONLY CHAPTER RECORDS AND REGULATION RECORDS ARE READ OR CHECKED. A `zh` on any other record is
 * stored as the kinds allow and read by nothing here.
 */

/** A record's English, as a write leaves it or found it: the parts the Chinese halves translate. */
export interface TheEnglishOfARecord {
  kind: string
  title: string
  summary: string | null
  data: unknown
}

/**
 * THE ENGLISH A CHAPTER'S OWN CHINESE HALF TRANSLATES, in the order `englishHash` takes it: the title,
 * the summary (the Conclusion) and the label (reading level 1, `data.shortForms.label`), each the empty
 * string where the record holds none. Read off the chapter as `chapterFromRecord` reads it, so the page,
 * the exporter and this check read one English.
 */
function chapterEnglish(chapter: Pick<OfficeChapter, 'title' | 'conclusion' | 'label'>): string[] {
  return [chapter.title, chapter.conclusion, chapter.label]
}

/** The English a rule's Chinese half translates: its heading and its text. */
function ruleEnglish(rule: Pick<OfficeRule, 'name' | 'text'>): string[] {
  return [rule.name, rule.text]
}

/**
 * THE HASH OF A RULE'S ENGLISH, and below it a chapter's: the one place either is worked out. A rule's Chinese half
 * names it as its `from`, and so does the rule's neutral twin, so a change to the
 * owner's English leaves both visibly behind, and both are read against the same hash.
 */
export function theEnglishHashOfARule(rule: Pick<OfficeRule, 'name' | 'text'>): string {
  return englishHash(ruleEnglish(rule))
}

/** The hash of a chapter's own English: its title, Conclusion and label. See `theEnglishHashOfARule`. */
export function theEnglishHashOfAChapter(chapter: Pick<OfficeChapter, 'title' | 'conclusion' | 'label'>): string {
  return englishHash(chapterEnglish(chapter))
}

/**
 * THE ENGLISH OF A RULE'S NEUTRAL TWIN, read as a rule's own: the twin's heading and text, each the empty string where the
 * twin holds none. The twin's Chinese names `theEnglishHashOfARule` of it as its `from`.
 */
export function theEnglishOfARuleTwin(twin: unknown): Pick<OfficeRule, 'name' | 'text'> {
  const held = asObject(twin)
  return { name: readString(held, ['heading']), text: readString(held, ['text']) }
}

/** The English of a chapter's neutral twin: its title, conclusion and label. Its Chinese names `theEnglishHashOfAChapter` of it. */
export function theEnglishOfAChapterTwin(twin: unknown): Pick<OfficeChapter, 'title' | 'conclusion' | 'label'> {
  const held = asObject(twin)
  return { title: readString(held, ['title']), conclusion: readString(held, ['conclusion']), label: readString(held, ['label']) }
}

/** The hash of a regulation's English, its title, which its Chinese title's `from` names. See `theEnglishHashOfARule`. */
export function theEnglishHashOfARegulation(regulation: { title: string }): string {
  return englishHash([regulation.title])
}

/** One piece of English that may carry a Chinese half. */
interface TranslatedPart {
  /** Where its Chinese half is stored, written the way a writer names the field. */
  field: string
  /** Which part this is, to find the same part before a write: the record, or a block by its id. */
  key: string
  /** The English parts, in the order `englishHash` takes them. */
  english: string[]
  /** The hash its Chinese half's `from` must name. */
  hash: string
  /** The Chinese half as stored. Undefined or null when there is none. */
  zh: unknown
}

/** Every piece of English on a chapter or regulation record that may carry a Chinese half. */
function translatedPartsOf(record: TheEnglishOfARecord): TranslatedPart[] {
  const held = asObject(record.data)
  if (record.kind === REGULATION_KIND) {
    return [{ field: 'data.zh', key: 'record', english: [record.title], hash: theEnglishHashOfARegulation(record), zh: held['zh'] }]
  }
  const chapter = chapterFromRecord({ id: '', ...record })
  if (chapter === null) return []
  // EACH NEUTRAL TWIN'S CHINESE IS A PART OF ITS OWN, written from the twin's English and not the owner's.
  const twin = asObject(held['neutral'])
  const twinEnglish = theEnglishOfAChapterTwin(twin)
  const parts: TranslatedPart[] = [
    { field: 'data.zh', key: 'record', english: chapterEnglish(chapter), hash: theEnglishHashOfAChapter(chapter), zh: held['zh'] },
    { field: 'data.neutral.zh', key: 'neutral:record', english: chapterEnglish(twinEnglish), hash: theEnglishHashOfAChapter(twinEnglish), zh: twin['zh'] },
  ]
  const blocks = Array.isArray(held['summaryBlocks']) ? (held['summaryBlocks'] as unknown[]) : []
  chapter.outline.forEach((rule, i) => {
    const block = asObject(blocks[i])
    if (block['type'] !== 'text') return
    const key = rule.id === '' ? `#${String(i)}` : `id:${rule.id}`
    parts.push({
      field: `data.summaryBlocks[${String(i)}].zh`,
      key,
      english: ruleEnglish(rule),
      hash: theEnglishHashOfARule(rule),
      zh: block['zh'],
    })
    const ruleTwin = asObject(block['neutral'])
    const ruleTwinEnglish = theEnglishOfARuleTwin(ruleTwin)
    parts.push({
      field: `data.summaryBlocks[${String(i)}].neutral.zh`,
      key: `neutral:${key}`,
      english: ruleEnglish(ruleTwinEnglish),
      hash: theEnglishHashOfARule(ruleTwinEnglish),
      zh: ruleTwin['zh'],
    })
  })
  return parts
}

/** Stored data read as an object, or an empty one when it is not an object. */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * A CHINESE HALF, WHEN IT IS CURRENT: `from` is the hash of this English and every key named is a
 * string. Null otherwise, and never the stale Chinese.
 */
function currentHalf(
  zh: unknown,
  keys: readonly string[],
  english: readonly string[],
  sourceHash: string,
): Record<string, unknown> | null {
  const half = asObject(zh)
  if (half['from'] !== sourceHash) return null
  return keys.every((key) => typeof half[key] === 'string') ? half : null
}

/**
 * WHAT A TEXT BLOCK HOLDS IN CHINESE, ON ANY RECORD. A text block carries its Chinese in `zh`, whose `from`
 * is the hash of the English it was written from: [heading, text], a missing heading being the empty
 * string, as a chapter's rule is hashed. `current` is a Chinese a page may draw in place of the English;
 * `from another English` is one written before the English last changed, which a page never draws;
 * `none` is a block written in one language only. A report reads it here, and so does a chapter's page.
 */
export type TheChineseOfATextBlock =
  | { state: 'current'; heading: string; text: string }
  | { state: 'from another English' }
  | { state: 'none' }

export function theChineseOfATextBlock(block: { heading?: string; text: string; zh?: unknown }): TheChineseOfATextBlock {
  if (block.zh === undefined || block.zh === null) return { state: 'none' }
  const rule = { name: block.heading ?? '', text: block.text }
  const half = currentHalf(block.zh, ['heading', 'text'], ruleEnglish(rule), theEnglishHashOfARule(rule))
  if (half === null) return { state: 'from another English' }
  return { state: 'current', heading: half['heading'] as string, text: half['text'] as string }
}

/** What a write must set, when it would leave a Chinese half that was not written from the English it now sits beside. */
export interface ChineseNotFromThisEnglish {
  /** The Chinese half to set, as a writer names the field: data.zh, or data.summaryBlocks[2].zh. */
  field: string
  /** The hash its `from` must name: `englishHash` of the English this write leaves. */
  hash: string
}

/**
 * THE CHANGE-TOGETHER CHECK THE RECORD DOOR ASKS BEFORE IT WRITES. Null when the write may go ahead.
 *
 * A Chinese half is checked when this write changes its English or changes the half itself, and then
 * its `from` must be the hash of the English after the write. A half the write does not touch is not
 * asked, so an old record is never refused for a field somebody else left. A record with no Chinese
 * half at all is never refused. `before` is null for a record being filed.
 */
export function chineseNotFromThisEnglish(before: TheEnglishOfARecord | null, after: TheEnglishOfARecord): ChineseNotFromThisEnglish | null {
  const earlier = new Map((before === null ? [] : translatedPartsOf(before)).map((part) => [part.key, part]))
  for (const part of translatedPartsOf(after)) {
    if (part.zh === undefined || part.zh === null) continue
    const was = earlier.get(part.key)
    const englishMoved = was === undefined || JSON.stringify(was.english) !== JSON.stringify(part.english)
    const halfMoved = was === undefined || JSON.stringify(was.zh) !== JSON.stringify(part.zh)
    if (!englishMoved && !halfMoved) continue
    if (asObject(part.zh)['from'] !== part.hash) return { field: part.field, hash: part.hash }
  }
  return null
}

/** The Chinese of a chapter's title, Conclusion and label, as the page draws it. */
export interface ChineseOfAChapter {
  title: string
  conclusion: string
  /** Null when the Chinese half carries no label. */
  label: string | null
}

/** The Chinese of one rule, as the page draws it. */
export interface ChineseOfARule {
  name: string
  text: string
}

/** One rule, with its Chinese when the record holds a current one. */
export interface OfficeRuleInBothLanguages extends OfficeRule {
  /** Null when no Chinese is stored, or when the stored one was written from another English. */
  zh: ChineseOfARule | null
  /**
   * WHO MARKED THIS RULE AS ONLY FOR THIS OFFICE, AND WHEN, or null when it is not marked. A marked rule is left out of
   * the default regulations a new office copies.
   */
  onlyThisOffice: { by: string; at: string } | null
}

/**
 * THE RULES A CHAPTER RECORD MARKS AS ONLY FOR THIS OFFICE, by rule id, with who marked each and when. The one reader of
 * `onlyThisOffice`: the page reads it here, and src/shared/default-set.ts reads it here to leave those rules out.
 */
export function theOnlyThisOfficeMarks(data: unknown): Map<string, { by: string; at: string }> {
  const marks = asObject(data)['onlyThisOffice']
  const out = new Map<string, { by: string; at: string }>()
  if (!Array.isArray(marks)) return out
  for (const one of marks) {
    const mark = asObject(one)
    if (typeof mark['rule'] !== 'string' || mark['rule'] === '') continue
    out.set(mark['rule'], { by: typeof mark['by'] === 'string' ? mark['by'] : '', at: typeof mark['at'] === 'string' ? mark['at'] : '' })
  }
  return out
}

/** One chapter, with its Chinese where the record holds a current one. What the page draws. */
export interface OfficeChapterInBothLanguages extends Omit<OfficeChapter, 'outline'> {
  /** Null when no Chinese is stored, or when the stored one was written from another English. */
  zh: ChineseOfAChapter | null
  outline: OfficeRuleInBothLanguages[]
}

/**
 * EVERY CHAPTER WITH ITS CURRENT CHINESE, for the page. A Chinese half whose `from` is not the hash
 * of the English beside it is answered as null, never as Chinese: the record door refuses to store
 * one, and an older record that holds one anyway is drawn in English.
 *
 * `chaptersFromRecords` stays English only, because the exporter writes its answer whole into
 * src/config/rules/chapters.json and agents read the English.
 */
export function chaptersInBothLanguagesFromRecords(records: readonly ARecordAsRead[]): OfficeChapterInBothLanguages[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  return chaptersFromRecords(records).map((chapter) => {
    const held = asObject(byId.get(chapter.id)?.data)
    const blocks = Array.isArray(held['summaryBlocks']) ? (held['summaryBlocks'] as unknown[]) : []
    const marks = theOnlyThisOfficeMarks(held)
    const zh = currentHalf(held['zh'], ['title', 'summary'], chapterEnglish(chapter), theEnglishHashOfAChapter(chapter))
    return {
      ...chapter,
      zh:
        zh === null
          ? null
          : { title: zh['title'] as string, conclusion: zh['summary'] as string, label: typeof zh['label'] === 'string' ? zh['label'] : null },
      outline: chapter.outline.map((rule, i) => {
        const block = asObject(blocks[i])
        const half = block['type'] === 'text' ? currentHalf(block['zh'], ['heading', 'text'], ruleEnglish(rule), theEnglishHashOfARule(rule)) : null
        return {
          ...rule,
          zh: half === null ? null : { name: half['heading'] as string, text: half['text'] as string },
          onlyThisOffice: marks.get(rule.id) ?? null,
        }
      }),
    }
  })
}

/** Whom one regulation binds, in the words the page draws. */
export interface OneRegulation {
  id: string
  title: string
  /**
   * THE PROJECT THE RECORD IS FILED IN. Every project reads the office's regulations, wherever each is filed, but the
   * record door answers a record only in its own project, so a press on the page of
   * another project addresses this one.
   */
  filedIn: string
  /** The constraint, in the person's own words, copied exactly. */
  sentence: string
  /** "person", or "role" with the role's name beside it. */
  binds: 'person' | 'role' | 'unknown'
  /** Which role, when binds is "role". */
  role: string | null
  /** Since when it binds, as it was stored. */
  since: string | null
  /** When the person revoked it, or null while it stands. */
  revokedAt: string | null
  /** Why the person revoked it, in the person's own words, or null. */
  revokedBecause: string | null
  /** The Chinese of the title when the record holds a current one, or null. The sentence is never translated. */
  zhTitle: string | null
  /** The saved Chinese title even when its source hash no longer matches the English title. */
  storedZhTitle: string | null
  /** Whether the saved Chinese half names a different English title. */
  zhTitleIsStale: boolean
  /**
   * THE NEWEST REVISION OF ITS RECORD, or null when this office keeps no revision of it. The record's data does not say
   * it, so the server reads it from the ledger (src/server/lib/office-regulations.ts).
   */
  revision: number | null
}

/**
 * EVERY REGULATION THE RECORDS HOLD, FOR THE PAGE THAT LISTS THEM. Read defensively: a record is
 * stored as data of unknown shape and a field an older writer left out is read as absent, which is
 * the state the record actually holds. Its revision is not in the record, and the server adds it.
 */
export function regulationsFromRecords(records: readonly (ARecordAsRead & { workspaceId: string })[]): Omit<OneRegulation, 'revision'>[] {
  return records
    .filter((record) => record.kind === REGULATION_KIND)
    .map((record) => {
      const data = (typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data)
        ? record.data
        : {}) as Record<string, unknown>
      const sentence = data['sentence']
      const role = data['role']
      const since = data['since']
      const revokedAt = data['revoked_at']
      const revokedBecause = data['revoked_because']
      const chineseTitle = asObject(data['zh'])
      const englishTitle = [record.title]
      const englishTitleHash = theEnglishHashOfARegulation(record)
      const currentChineseTitle = currentHalf(data['zh'], ['title'], englishTitle, englishTitleHash)
      return {
        id: record.id,
        title: record.title,
        filedIn: record.workspaceId,
        sentence: typeof sentence === 'string' ? sentence : '',
        binds: data['binds'] === 'person' || data['binds'] === 'role' ? data['binds'] : 'unknown',
        role: typeof role === 'string' && role !== '' ? role : null,
        since: typeof since === 'string' ? since : null,
        revokedAt: typeof revokedAt === 'string' ? revokedAt : null,
        revokedBecause: typeof revokedBecause === 'string' ? revokedBecause : null,
        zhTitle: (currentChineseTitle?.['title'] as string | undefined) ?? null,
        storedZhTitle: typeof chineseTitle['title'] === 'string' ? chineseTitle['title'] : null,
        zhTitleIsStale: Object.keys(chineseTitle).length > 0 && chineseTitle['from'] !== englishTitleHash,
      }
    })
}

/**
 * A CHAPTER'S NAME, IN ENGLISH AND IN CHINESE: the one way every page and the server name a chapter (problem
 * aObarxX8mTWm; invariant 9). The English is the chapter's label, its name at reading level 1, and its title only where it
 * has none. The Chinese is the record's current Chinese label, or its Chinese title where the English fell back to the
 * title; null when the record holds no Chinese written from this English. src/config/roles.json holds no chapter name
 * at all.
 */
export function theNameOfAChapter(chapter: OfficeChapterInBothLanguages): { name: string; zh: string | null } {
  return {
    name: chapter.label === '' ? chapter.title : chapter.label,
    zh: chapter.zh === null ? null : chapter.label === '' ? chapter.zh.title : (chapter.zh.label ?? chapter.zh.title),
  }
}

/** What GET /api/office-regulations answers, and what the page draws. */
export interface WhatTheOfficeRegulationsSay {
  regulations: OneRegulation[]
  chapters: OfficeChapterInBothLanguages[]
  /** The sentence saying where this came from, so the page can say it too. */
  says: string
  workspaceId: string
  /**
   * WHICH START COPIED WHICH OF THESE CHAPTERS FROM THE DEFAULT SET, or null when no copy holds any of them.
   * A start copies each default chapter whose number the office has never held (src/server/lib/default-regulations.ts),
   * so the chapters in use may come from the first start, from a later one, or from none. Read off the chapters' own
   * `extra.copiedFromTheDefaults`, and the page says the same beside the chapters.
   */
  copiedFromTheDefaults: {
    /** Each copy that holds a chapter in use, in the order the copies ran. */
    copies: ACopyOfTheDefaults[]
    /** The numbers of the chapters in use whose records carry no copy stamp: no start of this office recorded copying them. */
    notCopied: number[]
  } | null
}

/** THE COPY STAMP A COPIED CHAPTER CARRIES in `extra.copiedFromTheDefaults`, written by the start that copied it. */
export interface CopiedFromTheDefaults {
  /** The default set's file, relative to the checkout. */
  file: string
  /** When the copy ran, in the stored form. */
  at: string
  /**
   * Whether the office held a chapter record when this copy ran. A stamp written before this field came lacks it, and
   * reads as false: until then a start copied only into an office that had never held a chapter.
   */
  officeHeldChapters?: boolean
}

/** One copy of the default set, as the door names it. */
export interface ACopyOfTheDefaults {
  file: string
  at: string
  /** True when the office held no chapter record when this copy ran, so it was the office's first copy. */
  first: boolean
  /** The numbers of the chapters in use that this copy's records hold. */
  chapters: number[]
}

/**
 * WHICH COPY EACH CHAPTER IN USE CAME FROM, as the chapter records' copy stamps say. `shown` is the numbers of the
 * chapters in use. Each one goes with the earliest stamp among the records that hold it; the copies are in the order they
 * ran, the first copy before a later one made at the same time. `notCopied` is each shown number whose records carry no
 * copy stamp. Null when no shown chapter carries one.
 */
export function copiedFromTheDefaultsOf(records: readonly ARecordAsRead[], shown: readonly number[]): WhatTheOfficeRegulationsSay['copiedFromTheDefaults'] {
  const earliest = new Map<number, Omit<ACopyOfTheDefaults, 'chapters'>>()
  for (const record of records) {
    const n = chapterNumberOf(record.kind, record.data)
    if (n === null) continue
    const extra = asObject(asObject(record.data)['extra'])
    const copied = asObject(extra['copiedFromTheDefaults'])
    if (typeof copied['file'] !== 'string' || typeof copied['at'] !== 'string') continue
    const was = earliest.get(n)
    if (was === undefined || copied['at'] < was.at) earliest.set(n, { file: copied['file'], at: copied['at'], first: copied['officeHeldChapters'] !== true })
  }
  const copies: ACopyOfTheDefaults[] = []
  const notCopied: number[] = []
  for (const n of shown) {
    const stamp = earliest.get(n)
    if (stamp === undefined) { notCopied.push(n); continue }
    const copy = copies.find(one => one.file === stamp.file && one.at === stamp.at && one.first === stamp.first)
    if (copy === undefined) copies.push({ ...stamp, chapters: [n] })
    else copy.chapters.push(n)
  }
  copies.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : Number(b.first) - Number(a.first)))
  return copies.length === 0 ? null : { copies, notCopied }
}

/**
 * THE OFFICE'S FIRST COPY, WHEN IT IS THE ONLY COPY THAT HOLDS CHAPTERS IN USE, or null. The door's sentence and the
 * page's note then say that every chapter was copied at the first start, or name the chapters with no copy stamp as
 * added later: the first copy ran when the office held no chapter, so every other chapter was filed after it.
 */
export function theOnlyCopyIsTheFirst(copied: NonNullable<WhatTheOfficeRegulationsSay['copiedFromTheDefaults']>): ACopyOfTheDefaults | null {
  const [only, ...others] = copied.copies
  return only !== undefined && others.length === 0 && only.first ? only : null
}
