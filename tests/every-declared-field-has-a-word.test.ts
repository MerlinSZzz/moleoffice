// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY FIELD EVERY KIND DECLARES HAS A WORD, IN ENGLISH AND IN CHINESE. This is item 5 of a
 * decision.
 *
 * The record page names a field through `fieldLabel` (src/web/pages/RecordPage.tsx): in the incomplete
 * list, on the box that writes it, and in the question before a field is cleared. A field no word list
 * names falls back to `record.field.withoutAWord`, which on a Chinese page quotes the stored key as
 * English and calls it a field: a direction's missing depth read 字段“depth”. This file asks
 * `fieldLabel` for every declared field of every kind in KIND_SPECS on a Chinese page, and fails on
 * any field that reaches that fallback. Chinese is where the fallback can be seen: in English it is the
 * key as words, which a real word may equal. A Chinese word is a word in both lists, because zh.ts
 * is type-checked against the keys of en.ts and may hold no other. So a field added to a kind without
 * a word fails here, rather than showing its key to a person.
 *
 * A Chinese label must not silently fall back to English. The product's name stays as written. A label
 * containing Chinese may also keep an abbreviation or unit from its own English source: at least two
 * capital letters distinguish those tokens from ordinary English words. No field is left out.
 *
 * THE MUTATION THAT TURNS THIS RED, after a green control run: delete `record.field.depth` from both
 * src/shared/words/en.ts and src/shared/words/zh.ts. Both cases name "direction.depth", which reads
 * 字段“depth”. Deleting it from zh.ts alone turns the second case red on "direction.depth", which reads
 * the English "depth".
 *
 * A KIND'S OWN WORD FOR A FIELD (problem gyRw1dubpNbK). One key can mean different things on two
 * kinds: a report's `read` says whether the person it is for has read it, and a message's `read` is
 * declared as NOT that. Such a field has a word of its kind, `record.field.<kind>.<key>`, and the third
 * case holds three things about every such word: its kind declares the field, the version history
 * names no field of that key (the history reads a key without its kind, so it would say the other
 * word), and `fieldLabel` draws it in English and in Chinese.
 *
 * THE MUTATION THAT TURNS THE THIRD CASE RED, after a green control run: in `fieldLabel`
 * (src/web/pages/RecordPage.tsx) delete the lookup of `record.field.<kind>.<key>`. Every kind's own
 * word is then drawn as the key's word, and the case names "message.read", which reads 是否已读.
 *
 * The fourth case reads, in Chinese, each field the sweep for problem gyRw1dubpNbK found to mean two
 * things, with its word written out. A session's `detail` is drawn as a section, so its word is a
 * section title of its kind (`sectionTitleKey` in src/web/components/sections.ts). MUTATIONS, each
 * after a green control run: the one above turns it red on message.read and the four
 * confirmed_by fields; taking `(key === 'detail' && kind === 'session')` out of `sectionTitleKey`
 * turns it red on session.detail, which reads 详细程度.
 *
 * A WORD WAITING FOR TRANSLATION. A wave's new word is written in English first and its
 * Chinese in the translation round, so until then a Chinese page draws its English. The second case lets a field
 * through only when the word that labels it, found in the order `fieldLabel` looks, is on the waiting list and
 * the Chinese label is exactly the English one. Any other English still fails, a field whose word does not wait
 * among them. THE MUTATION THAT TURNS IT RED, after a green control run: delete `record.field.depth` from
 * src/shared/words/zh.ts alone, a word that does not wait, and the case names "direction.depth", which reads "depth".
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { WORD_LISTS, type WordKey } from '../src/shared/i18n.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
let rp: RecordPage
let historyFieldName: typeof import('../src/web/components/RecordHistory.tsx').historyFieldName
let sectionTitleKey: typeof import('../src/web/components/sections.ts').sectionTitleKey

beforeAll(async () => {
  rp = await import('../src/web/pages/RecordPage.tsx')
  historyFieldName = (await import('../src/web/components/RecordHistory.tsx')).historyFieldName
  sectionTitleKey = (await import('../src/web/components/sections.ts')).sectionTitleKey
})

afterAll(() => setWordLanguage('en'))







it("draws a kind's own word for a field that means something else on that kind", () => {
  const kinds = Object.keys(KIND_SPECS)
  const own = Object.keys(WORD_LISTS.en).flatMap((word) => {
    const parts = /^record\.field\.([a-z_]+)\.(.+)$/.exec(word)
    return parts !== null && kinds.includes(parts[1] as string)
      ? [{ word: word as WordKey, kind: parts[1] as RecordKind, key: parts[2] as string }]
      : []
  })
  expect(own.map((one) => one.word), 'the message\'s read field has no word of its own').toContain('record.field.message.read')
  // A DEPARTMENT'S FIELDS ARE NAMED AS A DEPARTMENT'S (wave 13s round 281): its parent is the department above it, its
  // supervisor is the one agent that leads it, and its names and what it does are each in one language.
  for (const key of ['codes', 'nameEn', 'nameZh', 'doesEn', 'doesZh', 'parent', 'supervisor', 'mergedInto', 'restsOn']) {
    expect(own.map((one) => one.word), `the department's ${key} has no word of its own`).toContain(`record.field.department.${key}`)
  }
  // A KEY ITEM'S FIELDS ARE NAMED AS A KEY ITEM'S (wave 13s round 281): its place is its place in the order of the
  // open key items, and its hours left are an estimate, with who made it and when.
  for (const key of ['place', 'packages', 'progress', 'progressSetBy', 'progressSetAt', 'hoursLeft', 'estimatedBy', 'estimatedAt']) {
    expect(own.map((one) => one.word), `the key item's ${key} has no word of its own`).toContain(`record.field.key_item.${key}`)
  }
  const wrong = own.flatMap(({ word, kind, key }) => {
    const said: string[] = []
    if (!KIND_SPECS[kind].fields.some((field) => field.key === key)) said.push(`${kind}.${key} is not declared, yet ${word} names it`)
    setWordLanguage('en')
    if (historyFieldName(key) !== null) said.push(`the history names ${key} without its kind`)
    for (const language of ['en', 'zh'] as const) {
      setWordLanguage(language)
      const label = rp.fieldLabel(kind, key)
      if (label !== t(word)) said.push(`${kind}.${key} reads "${label}" in ${language}, not "${t(word)}"`)
    }
    return said
  })
  setWordLanguage('en')
  expect(wrong).toEqual([])
})


