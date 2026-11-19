// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEFAULT REGULATIONS, MADE FROM THE OWNER'S CHAPTER RECORDS.
 *
 * A fresh office copies src/config/rules/default-regulations.json into its own chapter records at its first run
 * (src/server/lib/default-regulations.ts). That file follows the owner's own chapters, in neutral words:
 *   - each rule of a chapter record may carry its NEUTRAL TWIN, `neutral` on the rule's text block: the rule in neutral
 *     words, in English and Chinese, written once by an agent when the rule is agreed, beside the owner's own words;
 *   - each chapter record carries the chapter's own words in neutral form, as `neutral` on the record;
 *   - each twin's Chinese carries `from`, the hash of the twin's own English, so a Chinese written from other English is
 *     seen. A twin written before that has none, and is named and taken as it is;
 *   - the person may mark a rule as ONLY FOR THIS OFFICE (`onlyThisOffice` on the record, written only by the person's
 *     own press), and a marked rule is left out of the default set.
 *
 * This file is the one place that turns records into the file. tools/rules-chapters.mjs writes the file with it; the
 * tests make it from a test world with it; scripts/write-the-neutral-twins.mjs reads the twins out of today's file with
 * `theTwinsInTheDefaultSet`. Nothing here reaches a database, a file or the network.
 */
import {
  chapterFromRecord,
  chapterNumberOf,
  theEnglishHashOfAChapter,
  theEnglishHashOfARule,
  theEnglishOfAChapterTwin,
  theEnglishOfARuleTwin,
  theOnlyThisOfficeMarks,
  type ARecordAsRead,
} from './office-rules.ts'

/** The two answers a rule's `zhFrom` may give: where its Chinese came from. */
export const WHERE_A_RULES_CHINESE_CAME_FROM = ['the chapter records', 'written for the default set'] as const

/** One rule as the default set holds it. */
export interface DefaultSetRule {
  id: string
  name: string
  text: string
  zh: { name: string; text: string }
  zhFrom: (typeof WHERE_A_RULES_CHINESE_CAME_FROM)[number]
}

/** One chapter as the default set holds it. */
export interface DefaultSetChapter {
  n: number
  forRole?: string
  label: string
  title: string
  conclusion: string
  context: string
  outline: DefaultSetRule[]
  zh: { label: string; title: string; conclusion: string }
}

/** A rule the owner marked as only for their office, which the set therefore leaves out. */
export interface ARuleLeftOut {
  chapter: number
  rule: string
}

/** The whole file. `leftOut` is written only when it names a rule. */
export interface TheDefaultSet {
  about: string
  chapters: DefaultSetChapter[]
  leftOut?: ARuleLeftOut[]
}

/** What the file says about itself. One sentence per idea; the file is read by whoever opens it. */
export const WHAT_THE_DEFAULT_SET_SAYS =
  'The default office regulations. A fresh Mole Office copies them into its own chapter records at its first run ' +
  '(src/server/lib/default-regulations.ts), and its owner may then change them on the regulations page. ' +
  'tools/rules-chapters.mjs writes this file from the chapter records of the office it is run against: ' +
  'each rule\'s neutral words, written beside that office\'s own words, chapter by chapter, with the rule ids kept. ' +
  'A rule that office\'s owner marked as only for their own office is left out, and leftOut names it. ' +
  'Every chapter and every rule has its Chinese. A rule\'s zhFrom says where its Chinese came from: ' +
  '"the chapter records" when it started from the Chinese of the owner\'s own chapter record, made neutral and made to ' +
  'say what this set\'s English says, and "written for the default set" when the record had none.'

/** Why the set cannot be made: every rule with neither a twin nor the mark, and every chapter with no neutral words. */
export interface WhyTheSetCannotBeMade {
  rules: { chapter: number; record: string; rule: string; heading: string }[]
  chapters: { chapter: number; record: string }[]
  /** Rules whose twin was written from English the owner has since changed: its `from` is not the current hash. */
  staleRules: { chapter: number; record: string; rule: string; heading: string }[]
  /** Chapters whose own neutral words were written from a title, Conclusion or label that has since changed. */
  staleChapters: { chapter: number; record: string }[]
  /** Rules whose twin's Chinese names other English than the twin's own: its `from` is not the hash of the twin's English. */
  staleRuleChinese: { chapter: number; record: string; rule: string; heading: string }[]
  /** Chapters whose own twin's Chinese names other English than the twin's own title, conclusion and label. */
  staleChapterChinese: { chapter: number; record: string }[]
}

/**
 * The twins whose Chinese has no `from`, as every twin's had before a twin's Chinese named its English: rule twins by
 * chapter and rule id, chapters' own twins by chapter. They stop nothing; `whichTwinsHaveNoChineseFrom` names them.
 */
export interface TwinsWithNoChineseFrom {
  rules: { chapter: number; rule: string }[]
  chapters: number[]
}

/**
 * The answer: the set and its text, or why it cannot be made. `anyTwinOrMark` says whether the office has begun. Both
 * answers name the twins whose Chinese has no `from`.
 */
export type MakingTheDefaultSet =
  | { made: true; set: TheDefaultSet; text: string; anyTwinOrMark: true; twinsWithNoChineseFrom: TwinsWithNoChineseFrom }
  | { made: false; why: WhyTheSetCannotBeMade; anyTwinOrMark: boolean; twinsWithNoChineseFrom: TwinsWithNoChineseFrom }

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The rule ids a chapter record marks as only for this office, read by `theOnlyThisOfficeMarks`. */
export function theRulesOnlyForThisOffice(data: unknown): Set<string> {
  return new Set(theOnlyThisOfficeMarks(data).keys())
}

/**
 * MAKE THE DEFAULT SET FROM THE CHAPTER RECORDS. Every rule of every chapter is either in the set, through its twin,
 * or left out, because the person marked it. A rule with neither, or a chapter whose own neutral words are missing,
 * makes the set impossible, and the answer names each one, so an agreed rule cannot be left out by forgetting.
 * A chapter all of whose rules are marked is left out whole, with its rules in leftOut. A twin whose Chinese names other
 * English than the twin's own stops the set too; one whose Chinese names none is taken, and named.
 */
export function theDefaultSetFromRecords(records: readonly ARecordAsRead[]): MakingTheDefaultSet {
  const chapters = records
    .map((record) => ({ record, n: chapterNumberOf(record.kind, record.data) }))
    .filter((one): one is { record: ARecordAsRead; n: number } => one.n !== null)
    .sort((a, b) => a.n - b.n)
  const why: WhyTheSetCannotBeMade = { rules: [], chapters: [], staleRules: [], staleChapters: [], staleRuleChinese: [], staleChapterChinese: [] }
  const noChineseFrom: TwinsWithNoChineseFrom = { rules: [], chapters: [] }
  const made: DefaultSetChapter[] = []
  const leftOut: ARuleLeftOut[] = []
  let anyTwinOrMark = false
  for (const { record, n } of chapters) {
    const data = asObject(record.data)
    const only = theRulesOnlyForThisOffice(data)
    if (only.size > 0) anyTwinOrMark = true
    const blocks = Array.isArray(data['summaryBlocks']) ? data['summaryBlocks'].map(asObject) : []
    const outline: DefaultSetRule[] = []
    for (const block of blocks) {
      if (block['type'] !== 'text') continue
      const id = asText(block['id'])
      if (only.has(id)) {
        leftOut.push({ chapter: n, rule: id })
        continue
      }
      const twin = asObject(block['neutral'])
      if (Object.keys(twin).length > 0) anyTwinOrMark = true
      const zh = asObject(twin['zh'])
      const zhFrom = twin['zhFrom']
      const whole =
        asText(twin['heading']) !== '' && asText(twin['text']) !== '' && asText(zh['heading']) !== '' && asText(zh['text']) !== '' &&
        (WHERE_A_RULES_CHINESE_CAME_FROM as readonly unknown[]).includes(zhFrom)
      if (!whole) {
        why.rules.push({ chapter: n, record: record.id, rule: id, heading: asText(block['heading']) })
        continue
      }
      // A TWIN KNOWS THE ENGLISH IT WAS WRITTEN FROM. When the owner's rule has changed since, the twin says something the
      // rule no longer says, and the set is not made from it.
      if (asText(twin['from']) !== theEnglishHashOfARule({ name: asText(block['heading']), text: asText(block['text']) })) {
        why.staleRules.push({ chapter: n, record: record.id, rule: id, heading: asText(block['heading']) })
        continue
      }
      // ITS CHINESE KNOWS THE ENGLISH IT WAS WRITTEN FROM: the twin's own. A twin stale by the owner's English is named
      // above only, because it is written again Chinese and all.
      if (zh['from'] === undefined) noChineseFrom.rules.push({ chapter: n, rule: id })
      else if (zh['from'] !== theEnglishHashOfARule(theEnglishOfARuleTwin(twin))) {
        why.staleRuleChinese.push({ chapter: n, record: record.id, rule: id, heading: asText(block['heading']) })
        continue
      }
      outline.push({
        id,
        name: asText(twin['heading']),
        text: asText(twin['text']),
        zh: { name: asText(zh['heading']), text: asText(zh['text']) },
        zhFrom: zhFrom as DefaultSetRule['zhFrom'],
      })
    }
    if (outline.length === 0) continue
    const own = asObject(data['neutral'])
    const ownZh = asObject(own['zh'])
    if (Object.keys(own).length > 0) anyTwinOrMark = true
    const words = [own['label'], own['title'], own['conclusion'], own['context'], ownZh['label'], ownZh['title'], ownZh['conclusion']].map(asText)
    if (words.some((one) => one === '')) {
      why.chapters.push({ chapter: n, record: record.id })
      continue
    }
    const english = chapterFromRecord(record)
    if (english === null || asText(own['from']) !== theEnglishHashOfAChapter(english)) {
      why.staleChapters.push({ chapter: n, record: record.id })
      continue
    }
    if (ownZh['from'] === undefined) noChineseFrom.chapters.push(n)
    else if (ownZh['from'] !== theEnglishHashOfAChapter(theEnglishOfAChapterTwin(own))) {
      why.staleChapterChinese.push({ chapter: n, record: record.id })
      continue
    }
    made.push({
      n,
      ...(english.forRole === undefined ? {} : { forRole: english.forRole }),
      label: words[0]!,
      title: words[1]!,
      conclusion: words[2]!,
      context: words[3]!,
      outline,
      zh: { label: words[4]!, title: words[5]!, conclusion: words[6]! },
    })
  }
  const stopped = Object.values(why).some((list) => list.length > 0)
  if (stopped || !anyTwinOrMark) return { made: false, why, anyTwinOrMark, twinsWithNoChineseFrom: noChineseFrom }
  const set: TheDefaultSet = { about: WHAT_THE_DEFAULT_SET_SAYS, chapters: made, ...(leftOut.length > 0 ? { leftOut } : {}) }
  return { made: true, set, text: `${JSON.stringify(set, null, 2)}\n`, anyTwinOrMark: true, twinsWithNoChineseFrom: noChineseFrom }
}

/** The refusal, in words, naming every rule and chapter that stops the set being made. */
export function whyTheDefaultSetCannotBeMade(why: WhyTheSetCannotBeMade): string {
  const rules = why.rules.map((one) => `chapter ${String(one.chapter)} rule ${one.rule} ("${one.heading}", record ${one.record})`)
  const chapters = why.chapters.map((one) => `chapter ${String(one.chapter)} (record ${one.record})`)
  const staleRules = why.staleRules.map((one) => `chapter ${String(one.chapter)} rule ${one.rule} ("${one.heading}", record ${one.record})`)
  const staleChapters = why.staleChapters.map((one) => `chapter ${String(one.chapter)} (record ${one.record})`)
  const staleRuleChinese = why.staleRuleChinese.map((one) => `chapter ${String(one.chapter)} rule ${one.rule} ("${one.heading}", record ${one.record})`)
  const staleChapterChinese = why.staleChapterChinese.map((one) => `chapter ${String(one.chapter)} (record ${one.record})`)
  return (
    'The default regulations cannot be written, so default-regulations.json was not changed. ' +
    (rules.length === 0
      ? ''
      : `These rules have no neutral words and are not marked as only for this office: ${rules.join('; ')}. ` +
        'Write each rule\'s neutral words on its block as neutral, or the person marks it on the regulations page. ') +
    (chapters.length === 0
      ? ''
      : `These chapters have no neutral words of their own: ${chapters.join('; ')}. Write them on the record as neutral. `) +
    (staleRules.length === 0
      ? ''
      : `These rules' neutral words were written from English the owner has since changed: ${staleRules.join('; ')}. ` +
        'Write each one\'s neutral words again from the rule as it reads now, with from set to theEnglishHashOfARule of it. ') +
    (staleChapters.length === 0
      ? ''
      : `These chapters' own neutral words were written from a title, Conclusion or label that has since changed: ` +
        `${staleChapters.join('; ')}. Write them again from the chapter as it reads now, with from set to theEnglishHashOfAChapter. `) +
    (staleRuleChinese.length === 0
      ? ''
      : `These rules' neutral words have a Chinese written from other English than their own: ${staleRuleChinese.join('; ')}. ` +
        'Write each one\'s Chinese again from its neutral heading and text, with zh.from set to theEnglishHashOfARule of them. ') +
    (staleChapterChinese.length === 0
      ? ''
      : `These chapters' own neutral words have a Chinese written from other English than their own: ` +
        `${staleChapterChinese.join('; ')}. Write each one's Chinese again from its neutral title, conclusion and label, ` +
        'with zh.from set to theEnglishHashOfAChapter of them.')
  ).trim()
}

/**
 * THE TWINS WHOSE CHINESE HAS NO `from`, in one sentence, or null when there is none. They are in the set as they are,
 * so this stops nothing: it says which Chinese nothing yet shows was written from the English beside it.
 */
export function whichTwinsHaveNoChineseFrom(twins: TwinsWithNoChineseFrom): string | null {
  const numbers = [...new Set([...twins.chapters, ...twins.rules.map((one) => one.chapter)])].sort((a, b) => a - b)
  const named = numbers.flatMap((n) => [
    ...(twins.chapters.includes(n) ? [`chapter ${String(n)}'s own words`] : []),
    ...twins.rules.filter((one) => one.chapter === n).map((one) => `chapter ${String(n)} rule ${one.rule}`),
  ])
  if (named.length === 0) return null
  return (
    `The Chinese of these neutral words has no from, so nothing shows which English it was written from: ${named.join('; ')}. ` +
    'They are in the default regulations as they are. Set each one\'s zh.from, the hash of the neutral English beside it, ' +
    'when its Chinese is next written.'
  )
}

/**
 * THE TWINS IN TODAY'S DEFAULT SET, chapter by chapter, for the first writing of the twins into the chapter records.
 * The neutral words are the file's own, so nothing new is written in the owner's name: each rule's twin is its entry
 * in the file, and each chapter's neutral words are its entry's name, title, conclusion, reason and Chinese.
 */
export function theTwinsInTheDefaultSet(set: TheDefaultSet): Map<number, { chapter: Record<string, unknown>; rules: Map<string, Record<string, unknown>> }> {
  const out = new Map<number, { chapter: Record<string, unknown>; rules: Map<string, Record<string, unknown>> }>()
  for (const chapter of set.chapters) {
    out.set(chapter.n, {
      chapter: { label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, context: chapter.context, zh: { ...chapter.zh } },
      rules: new Map(
        chapter.outline.map((rule) => [
          rule.id,
          { heading: rule.name, text: rule.text, zh: { heading: rule.zh.name, text: rule.zh.text }, zhFrom: rule.zhFrom },
        ]),
      ),
    })
  }
  return out
}

/** What giving one chapter record its twins comes to: the write, or null when nothing is missing; and the stale twins. */
export interface GivingARecordItsTwins {
  /** The write, or null when the record already holds every twin, or holds only twins that are stale. */
  write: { neutral: Record<string, unknown>; summaryBlocks: Record<string, unknown>[] } | null
  /**
   * The twins already on the record that this does not touch because they are not today's file's twin of the owner's
   * current English: a different twin, or one whose `from` is not the current hash. "the chapter's own words" for the
   * record's own, and the rule id for a rule. A stale twin is never written over: rewriting it from the file would
   * pin old neutral words to new English. A twin that is the file's but for no `from` on its Chinese is not stale.
   */
  stale: string[]
}

/**
 * THE WRITE THAT GIVES ONE CHAPTER RECORD ITS TWINS, from today's default set: `neutral` on the record, and `neutral` on
 * each rule's text block, every other part of each block kept as it is stored. Each twin carries `from`, the hash of
 * the owner's English it was written beside as the record holds it now (`theEnglishHashOfARule`,
 * `theEnglishHashOfAChapter`), and its Chinese carries `from`, the hash of the twin's own English. A twin is written only
 * where none is stored; one already stored is kept when it is the file's twin with the current hash, with or without
 * the `from` on its Chinese that twins written before had not, and named as stale otherwise, and in neither case written
 * over. It refuses, naming
 * the rules, when a rule of the record has no twin in the set and is not marked as only for this office, and when the
 * set holds a rule the record does not.
 */
export function theWriteThatGivesARecordItsTwins(
  record: ARecordAsRead,
  twins: ReturnType<typeof theTwinsInTheDefaultSet>,
): GivingARecordItsTwins {
  const n = chapterNumberOf(record.kind, record.data)
  if (n === null) throw new Error(`Record ${record.id} is not a chapter record, so it takes no neutral words.`)
  const these = twins.get(n)
  if (these === undefined) throw new Error(`The default set holds no chapter ${String(n)}, so record ${record.id} was given no neutral words.`)
  const data = asObject(record.data)
  const only = theRulesOnlyForThisOffice(data)
  const blocks = Array.isArray(data['summaryBlocks']) ? data['summaryBlocks'].map(asObject) : []
  const ruleIds = blocks.filter((block) => block['type'] === 'text').map((block) => asText(block['id']))
  const unmatched = ruleIds.filter((id) => !these.rules.has(id) && !only.has(id))
  const extra = [...these.rules.keys()].filter((id) => !ruleIds.includes(id))
  if (unmatched.length > 0 || extra.length > 0) {
    throw new Error(
      `Chapter ${String(n)} (record ${record.id}) and the default set do not agree rule for rule, so no neutral words were ` +
        `written to it.` +
        (unmatched.length > 0 ? ` On the record with no twin in the set: ${unmatched.join(', ')}.` : '') +
        (extra.length > 0 ? ` In the set and not on the record: ${extra.join(', ')}.` : ''),
    )
  }
  const stale: string[] = []
  let writes = false
  /**
   * The twin to store: the file's, with the hash of the English beside it now, and its Chinese with the hash of the
   * twin's own English. The stored one is kept as it is.
   */
  const settle = (stored: unknown, fromTheFile: Record<string, unknown>, hash: string, chineseFrom: string, name: string): unknown => {
    const wanted = { ...fromTheFile, zh: { ...asObject(fromTheFile['zh']), from: chineseFrom }, from: hash }
    if (stored === undefined || stored === null) {
      writes = true
      return wanted
    }
    const asWrittenBefore = { ...fromTheFile, from: hash }
    if (JSON.stringify(stored) !== JSON.stringify(wanted) && JSON.stringify(stored) !== JSON.stringify(asWrittenBefore)) stale.push(name)
    return stored
  }
  const english = chapterFromRecord(record)
  const neutral = settle(
    data['neutral'],
    these.chapter,
    english === null ? '' : theEnglishHashOfAChapter(english),
    theEnglishHashOfAChapter(theEnglishOfAChapterTwin(these.chapter)),
    "the chapter's own words",
  )
  const summaryBlocks = blocks.map((block) => {
    const twin = these.rules.get(asText(block['id']))
    if (block['type'] !== 'text' || twin === undefined) return block
    const hash = theEnglishHashOfARule({ name: asText(block['heading']), text: asText(block['text']) })
    return { ...block, neutral: settle(block['neutral'], twin, hash, theEnglishHashOfARule(theEnglishOfARuleTwin(twin)), asText(block['id'])) }
  })
  return { write: writes ? { neutral: neutral as Record<string, unknown>, summaryBlocks } : null, stale }
}
