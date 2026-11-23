// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTE OF A NEXT ROUND THE OFFICE ASKED FOR DRAWS ITS BRIEF ON A ROW OF ITS OWN, and no sentence holds the brief.
 *
 * A run's page draws, in its atTheSeal section, what the office did about the run's next round
 * (src/web/components/MergeQueueAtTheSeal.tsx). When the office asked for one, the note said so in one sentence, "The
 * office asked for the next round at {at}, with the brief {path}.", and the brief's path sat in the sentence. This test
 * asks that the note draws two labelled rows instead, the time it asked and the brief, each in the office's code style,
 * and that the sentence is gone and no sentence holds the path.
 *
 * THE WORLD. The block drawn with renderToStaticMarkup, as tests/the-run-page-draws-both-notes-of-the-seal-as-one-section.test.ts
 * draws it, from a made-up run whose atTheSeal note says the office asked. Every word is read by its key.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

type Block = typeof import('../src/web/components/MergeQueueAtTheSeal.tsx')

const en = createI18n('en')
const NOW = '2026-10-25 17:30:00'
const A_BRIEF = 'briefs/made-up-next-round.md'
/** The note the office writes when it asks for the next round. Every value here is made up. */
const ASKED = { outcome: 'asked', moment: 'seal', brief: { path: A_BRIEF, sha256: 'c0ffee'.repeat(10) + 'beef' }, at: NOW }

/** A window, so the modules that read a setting at import time can be imported at all. */
async function boot(): Promise<Block> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return (await import('../src/web/components/MergeQueueAtTheSeal.tsx')) as Block
}

function aRun(): PanelRecord {
  return {
    id: 'run-one',
    workspaceId: 'panelx',
    kind: 'session',
    title: 'A made-up run',
    summary: null,
    data: { state: 'finished', atTheSeal: { nextRound: ASKED } },
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  }
}

/** The part of the block that draws the asked note, as markup. */
async function theAskedNote(): Promise<string> {
  const block = await boot()
  const run = aRun()
  const html = renderToStaticMarkup(h(block.TheSealInTheQueue, { record: run, sections: sectionsOf({ ...run, relations: [] }) }))
  const at = html.indexOf('data-next-at-the-seal="asked"')
  expect(at, 'the asked note was not drawn').toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<', at))
}

/** Each row's label, with the tag and text of the first element in its value. */
function theRows(markup: string): { label: string; tag: string; value: string }[] {
  return [...markup.matchAll(/<dt>([^<]*)<\/dt><dd><(\w+)[^>]*>([^<]*)<\/\2>/g)].map((m) => ({ label: m[1]!, tag: m[2]!, value: m[3]! }))
}

/** The text of each sentence in this markup. */
function theSentences(markup: string): string[] {
  return [...markup.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''))
}

describe('the note of a next round the office asked for', () => {
  it('draws the time it asked and the brief as rows in the code style, and no sentence holds the brief', async () => {
    const note = await theAskedNote()
    const rows = theRows(note)
    expect(rows.map((row) => [row.label, row.tag])).toEqual([
      [en.t('nextAtTheSeal.row.askedAt' as WordKey), 'code'],
      [en.t('nextAtTheSeal.row.brief' as WordKey), 'code'],
    ])
    expect(rows[1]!.value).toBe(A_BRIEF)
    expect(rows[0]!.value, 'the time it asked is not on its row').not.toBe('')
    for (const said of theSentences(note)) expect(said, 'a sentence holds the brief').not.toContain(A_BRIEF)
    const theOldSentence = en.t('nextAtTheSeal.asked', { at: rows[0]!.value, path: A_BRIEF })
    expect(note.replace(/<[^>]+>/g, ''), 'the sentence that held the brief is still drawn').not.toContain(theOldSentence)
  })
})
