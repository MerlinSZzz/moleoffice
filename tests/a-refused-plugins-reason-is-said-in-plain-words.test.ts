// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED PLUGIN'S REASON IS TURNED INTO PLAIN WORDS, OR SAID TO BE BEYOND THEM, ON THE SECRETARY'S
 * 2ofDpr3_ED-D.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The Settings panel draws `pluginReasonInPlainWords(reading)`, never `reading.refusal`. The reader's raw text is
 * the office's reader's own writing, such as "version: Invalid input: expected string, received undefined", and it
 * belongs in Developer mode. This file holds the cases where the function must not guess or repeat itself:
 *
 *   · a reading with no `refusedBecause` at all;
 *   · a cause written after this build, which the function does not know;
 *   · a manifest issue about no named field;
 *   · several issues about no named field, which give that one sentence once.
 *
 * Each of them says the cannot-say sentence, and never the reading's refusal text. The other causes are proved in
 * the browser by tests/the-settings-page-has-the-plugin-switches.test.ts, which reads what a page draws.
 *
 * A FAULT INSIDE A FIELD THAT IS THERE IS SAID AS THAT FAULT, NEVER AS THE FIELD MISSING (the inspector's refusal
 * zwnmGQMbxUKt of run JtwB8_PFtSv2). Before the fix, `budget: {}` read "Its plugin.json has no budget.", a page with
 * no slug read "Its plugin.json has no pages.", and a name with only Chinese read "Its plugin.json has no name.", in
 * English and in Chinese, though the file has all three fields. Each case below reads a made-up plugin.json through
 * aManifestFrom, the one reading of a manifest, and expects the true sentence in both languages: where the fault is
 * (the field, the entry of a list counted from 1, and the key inside), and what is wrong there. The Chinese is
 * spaced by the office's one spacing rule (src/shared/spacing.ts): a Latin name or a number beside a Chinese character
 * takes a space.
 *
 * THE MODULE IS IMPORTED IN beforeAll, as tests/effective-sidebar-readers.test.ts imports its files, so the
 * criterion commit that added this file ran red because the module did not exist rather than failing to compile.
 * The reading is written as a plain object because the types it will gain do not exist on that commit either.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { createI18n, setWordLanguage, type WordKey } from '../src/shared/i18n.ts'
import { aManifestFrom } from '../src/shared/plugins.ts'
import { englishWords } from '../src/shared/words/joined.ts'

type PlainWords = (reading: unknown) => string[]

let pluginReasonInPlainWords: PlainWords

/** The English the word lists hold for a key, through the page's own reader. The key must be there. */
const englishAsWritten = englishWords() as unknown as Record<string, string | undefined>
function inEnglish(key: string): string {
  expect(englishAsWritten[key], `en.ts has no word for ${key}`).toBeDefined()
  return createI18n('en').t(key as WordKey)
}

/** A refused reading as the door answers it, with whatever reason-as-data the case is about. */
function aRefusedReading(refusedBecause: unknown): unknown {
  return {
    id: 'made-up-refused',
    state: 'refused',
    nobodyChose: true,
    manifest: null,
    refusal: 'The reader wrote this: version: Invalid input: expected string, received undefined',
    refusedBecause,
  }
}

beforeAll(async () => {
  const where = '../src/web/lib/plugin-reason.ts'
  pluginReasonInPlainWords = ((await import(where)) as { pluginReasonInPlainWords: PlainWords }).pluginReasonInPlainWords
})

describe('a refused plugin reads in plain words, or says it cannot', () => {
  it('says the cannot-say sentence when the reading carries no reason as data, and never the reader’s text', () => {
    const reading = aRefusedReading(null)
    const words = pluginReasonInPlainWords(reading)
    expect(words).toEqual([inEnglish('settingsPanel.plugins.why.cannotSay')])
    expect(words.join(' ')).not.toContain('version: Invalid input')
  })

  it('says the cannot-say sentence for a cause written after this build', () => {
    const reading = aRefusedReading({ cause: 'refused-by-a-rule-from-a-later-build' })
    const words = pluginReasonInPlainWords(reading)
    expect(words).toEqual([inEnglish('settingsPanel.plugins.why.cannotSay')])
    expect(words.join(' ')).not.toContain('version: Invalid input')
  })

  it('says the cannot-say sentence for an issue about a field it cannot name, and never the reader’s text', () => {
    const reading = aRefusedReading({ cause: 'manifest-fields', fields: [{ field: '', problem: 'not-usable' }] })
    const words = pluginReasonInPlainWords(reading)
    expect(words).toEqual([inEnglish('settingsPanel.plugins.why.cannotSay')])
    expect(words.join(' ')).not.toContain('version: Invalid input')
  })

  it('says that one sentence once for several issues about no nameable field', () => {
    const reading = aRefusedReading({
      cause: 'manifest-fields',
      fields: [
        { field: '', problem: 'not-usable' },
        { field: '', problem: 'missing' },
      ],
    })
    expect(pluginReasonInPlainWords(reading)).toEqual([inEnglish('settingsPanel.plugins.why.cannotSay')])
  })
})

/** A made-up manifest the office accepts, which each case below changes in one place. */
function aGoodManifest(): Record<string, unknown> {
  return {
    id: 'made-up-refused',
    name: { en: 'The made-up plugin' },
    version: '1.0.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 200 },
  }
}

/** The plain words for a made-up plugin.json, read by aManifestFrom as the office reads one, in one language. */
function theWordsFor(manifest: object, language: 'en' | 'zh'): string[] {
  const read = aManifestFrom('made-up-refused', JSON.stringify(manifest))
  expect('refusedBecause' in read, 'the made-up manifest was accepted').toBe(true)
  setWordLanguage(language)
  try {
    return pluginReasonInPlainWords({ ...(aRefusedReading(null) as object), refusedBecause: (read as { refusedBecause: unknown }).refusedBecause })
  } finally {
    setWordLanguage('en')
  }
}

describe('a fault inside a field that is there is said as that fault, never as the field missing', () => {
  const cases: { what: string; manifest: Record<string, unknown>; en: string; zh: string }[] = [
    {
      what: 'a budget with no builtKilobytes',
      manifest: { ...aGoodManifest(), budget: {} },
      en: "Its plugin.json's budget has no builtKilobytes.",
      zh: '它的 plugin.json 里的 budget 没有 builtKilobytes。',
    },
    {
      what: 'a page with no slug',
      manifest: { ...aGoodManifest(), pages: [{ title: { en: 'Main' } }] },
      en: 'In its plugin.json, entry 1 of pages has no slug.',
      zh: '它的 plugin.json 里，pages 的第 1 项没有 slug。',
    },
    {
      what: 'a name with only Chinese',
      manifest: { ...aGoodManifest(), name: { zh: '编造的插件' } },
      en: "Its plugin.json's name has no en.",
      zh: '它的 plugin.json 里的 name 没有 en。',
    },
    {
      what: 'a key the office does not know inside the budget',
      manifest: { ...aGoodManifest(), budget: { builtKilobytes: 200, colour: 'green' } },
      en: "Its plugin.json's budget has colour, which this office does not know.",
      zh: '它的 plugin.json 里的 budget 有 colour，本办公室不认识。',
    },
    {
      what: 'a budget of no kilobytes',
      manifest: { ...aGoodManifest(), budget: { builtKilobytes: 0 } },
      en: "Its plugin.json's budget has a builtKilobytes this office cannot use.",
      zh: '它的 plugin.json 里的 budget 中的 builtKilobytes 不能用。',
    },
    {
      what: 'a key the office does not know in the second page',
      manifest: { ...aGoodManifest(), pages: [{ slug: 'main', title: { en: 'Main' } }, { slug: 'more', title: { en: 'More' }, colour: 'green' }] },
      en: 'In its plugin.json, entry 2 of pages has colour, which this office does not know.',
      zh: '它的 plugin.json 里，pages 的第 2 项有 colour，本办公室不认识。',
    },
    {
      what: 'a page called edit',
      manifest: { ...aGoodManifest(), pages: [{ slug: 'main', title: { en: 'Main' } }, { slug: 'edit', title: { en: 'Edit' } }] },
      en: 'In its plugin.json, entry 2 of pages has a slug this office cannot use.',
      zh: '它的 plugin.json 里，pages 的第 2 项中的 slug 不能用。',
    },
    {
      what: 'a view the interface does not have',
      manifest: { ...aGoodManifest(), reads: ['projects', 'made-up-view'] },
      en: 'In its plugin.json, entry 2 of reads is something this office cannot use.',
      zh: '它的 plugin.json 里，reads 的第 2 项不能用。',
    },
  ]
  for (const one of cases) {
    it(`says ${one.what} truly, in English and in Chinese`, () => {
      expect(theWordsFor(one.manifest, 'en')).toEqual([one.en])
      expect(theWordsFor(one.manifest, 'zh')).toEqual([one.zh])
    })
  }

  it('still says a field that is not there at all as missing, and a key at the top the office does not know as not known', () => {
    const withoutVersion = aGoodManifest()
    delete withoutVersion['version']
    expect(theWordsFor(withoutVersion, 'en')).toEqual(['Its plugin.json has no version.'])
    expect(theWordsFor(withoutVersion, 'zh')).toEqual(['它的 plugin.json 里没有 version。'])
    expect(theWordsFor({ ...aGoodManifest(), colour: 'green' }, 'en')).toEqual(['Its plugin.json has colour, which this office does not know.'])
  })
})
