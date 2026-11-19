// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { fileURLToPath } from 'node:url'
import shipped from '../config/rules/default-regulations.json' with { type: 'json' }
import { aRulesSourceMissingFrom, rulesSize, rulesTextsFrom } from './rules-text.ts'
import type { ChapterContent, ChapterRulesFileSize } from './chapter-edit.ts'
import type { OfficeChapter, OfficeChapterInBothLanguages } from './office-rules.ts'

/** The three code readers and the chapter check share these references. */
export const RULES_THE_CODE_NAMES = [
  { reader: 'question', chapter: 7, rule: 'r-8' },
  { reader: 'lost', chapter: 9, rule: 'r-8' },
  { reader: 'inspection', chapter: 7, rule: 'r-8' },
] as const

export const SHIPPED_CHAPTER_NUMBERS = shipped.chapters.map(one => one.n)
const CHECKOUT = fileURLToPath(new URL('../../', import.meta.url))
const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''

/** Read bad input without guessing words or throwing before preview can name its problems. */
export function chapterContent(value: unknown): ChapterContent {
  const one = object(value)
  return {
    label: text(one['label']), title: text(one['title']), conclusion: text(one['conclusion']),
    zh: one['zh'] === null || one['zh'] === undefined ? null : { label: text(object(one['zh'])['label']), title: text(object(one['zh'])['title']), conclusion: text(object(one['zh'])['conclusion']) },
    rules: Array.isArray(one['rules']) ? one['rules'].map(value => {
      const rule = object(value)
      return { id: text(rule['id']), heading: text(rule['heading']), text: text(rule['text']), zh: rule['zh'] === null || rule['zh'] === undefined ? null : { heading: text(object(rule['zh'])['heading']), text: text(object(rule['zh'])['text']) } }
    }) : [],
  }
}

export function contentOfChapter(chapter: OfficeChapter): ChapterContent {
  const bilingual = chapter as OfficeChapterInBothLanguages
  return { label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, zh: bilingual.zh === undefined || bilingual.zh === null ? null : { label: bilingual.zh.label ?? '', title: bilingual.zh.title, conclusion: bilingual.zh.conclusion }, rules: chapter.outline.map((rule, i) => ({ id: rule.id, heading: rule.name, text: rule.text, zh: bilingual.outline[i]?.zh === undefined || bilingual.outline[i]?.zh === null ? null : { heading: bilingual.outline[i]!.zh!.name, text: bilingual.outline[i]!.zh!.text } })) }
}

/** The original's role mark is kept, so a measured or written rules file leaves a marked chapter out as a run does. */
export function chapterWithContent(n: number, content: ChapterContent, original?: Partial<Pick<OfficeChapter, 'id' | 'context' | 'source' | 'forRole'>>): OfficeChapter {
  return { n, id: original?.id ?? `shipped-chapter-${String(n)}`, ...(original?.forRole === undefined ? {} : { forRole: original.forRole }), context: original?.context ?? '', source: original?.source ?? '', label: content.label, title: content.title, conclusion: content.conclusion, outline: content.rules.map(rule => ({ id: rule.id, name: rule.heading, text: rule.text })) }
}

/**
 * Measure exactly the files the run generator writes, with the proposed chapter in place, and answer the larger.
 * A developer checkout writes AGENTS.md. An installation writes AGENTS.md and a marked CLAUDE.md, and message
 * TxINgmO9H6gu keeps that CLAUDE.md under the same limit, so both are measured. A missing source is named, never guessed past.
 */
function measureRulesFileWithChapter(n: number, content: ChapterContent, chapters: readonly OfficeChapter[], checkout = CHECKOUT): { file: ChapterRulesFileSize; tooBig: boolean } {
  const missing = aRulesSourceMissingFrom(checkout)
  if (missing !== null) return { file: { notMeasured: `The size of the rules a run reads was not measured, because ${missing}, which they are written from, is not in this installation.` }, tooBig: false }
  const next = [...chapters.filter(one => one.n !== n), chapterWithContent(n, content, chapters.find(one => one.n === n))].sort((a, b) => a.n - b.n)
  const size = rulesTextsFrom(checkout, next).map(one => rulesSize(one.text)).reduce((larger, one) => one.bytes > larger.bytes ? one : larger)
  return { file: { bytes: size.bytes, most: size.limit - size.headroom }, tooBig: size.tooBig }
}

export function rulesFileWithChapter(n: number, content: ChapterContent, chapters: readonly OfficeChapter[], checkout = CHECKOUT): ChapterRulesFileSize {
  return measureRulesFileWithChapter(n, content, chapters, checkout).file
}

/** The one check for stored chapters, proposed writes, restores and file readers. `numbers` are the chapter numbers the chapter may have: the shipped ones, or the ones the default file being read declares. */
export function problemsWithAChapter(n: number, value: unknown, chapters: readonly OfficeChapter[], checkout = CHECKOUT, translations?: { before: ChapterContent | null }, withRulesFile = true, numbers: readonly number[] = SHIPPED_CHAPTER_NUMBERS): string[] {
  const one = chapterContent(value)
  const problems: string[] = []
  if (!numbers.includes(n)) problems.push(`Chapter ${String(n)} is not one of the shipped chapter numbers.`)
  for (const key of ['label', 'title', 'conclusion'] as const) if (one[key].trim() === '') problems.push(`The chapter has no ${key}.`)
  if (one.rules.length === 0) problems.push('The chapter has no rules.')
  const seen = new Set<string>()
  for (const [i, rule] of one.rules.entries()) {
    if (!/^r-[1-9]\d*$/.test(rule.id)) problems.push(`Rule ${String(i + 1)} needs an id such as r-1, with a positive whole number.`)
    if (seen.has(rule.id)) problems.push(`Two rules share the id ${rule.id}.`)
    seen.add(rule.id)
    if (rule.heading.trim() === '') problems.push(`Rule ${rule.id || String(i + 1)} has no heading.`)
    if (rule.text.trim() === '') problems.push(`Rule ${rule.id || String(i + 1)} has no text.`)
  }
  for (const id of new Set(RULES_THE_CODE_NAMES.filter(rule => rule.chapter === n).map(rule => rule.rule))) if (!seen.has(id)) problems.push(`Chapter ${String(n)} needs rule ${id}, which the code reads.`)
  // The office languages change together, as a decision says.
  // The decision id stays out of page problems.
  if (translations !== undefined) {
    const before = translations.before
    const ownChanged = before === null || ['label', 'title', 'conclusion'].some(key => one[key as 'label'] !== before[key as 'label'])
    if ((ownChanged || one.zh !== null) && (one.zh === null || Object.values(one.zh).some(value => value.trim() === ''))) problems.push('The chapter label, title and conclusion need their Chinese in the same change.')
    for (const rule of one.rules) {
      const old = before?.rules.find(held => held.id === rule.id)
      if ((old === undefined || old.heading !== rule.heading || old.text !== rule.text || rule.zh !== null) && (rule.zh === null || rule.zh.heading.trim() === '' || rule.zh.text.trim() === '')) problems.push(`Rule ${rule.id} needs its Chinese heading and text in the same change.`)
    }
  }
  if (withRulesFile) {
    const measured = measureRulesFileWithChapter(n, one, chapters, checkout)
    const file = measured.file
    if ('bytes' in file && measured.tooBig) problems.push(`The run's rules file would be ${String(file.bytes)} bytes. It must stay below ${String(file.most)} bytes so Codex reads it with 512 bytes of headroom.`)
  }
  return problems
}
