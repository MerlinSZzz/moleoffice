// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO SETTINGS PANELS SAY THE FACTS THE SHARED FUNCTIONS WORK OUT, AND NOTHING ELSE (problem h8wuif2xoXXG).
 *
 * The backups folder's counts and where a preview directory came from are each worked out once, in
 * src/shared/what-is-kept.ts and src/shared/preview-roots.ts. The server's English is built there. The
 * Settings panels say the same facts in the page's language. This file draws each panel from made-up
 * input and reads the same input through the shared functions, and the two must agree:
 *
 * - in English, the drawn words are exactly the shared English sentence;
 * - in Chinese, the drawn words are the Chinese for the reading the shared function chose.
 *
 * If the panel ever works a fact out again on its own and gets it different, a case here goes red.
 * Everything drawn here is made up: invented folders, repositories and people.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { setWordLanguage, t, type WordKey } from '../src/shared/i18n.ts'
import { filledWithChineseSpacing } from '../src/shared/spacing.ts'
import { howARootCameFrom, whereARootCameFrom, type PreviewRootSource } from '../src/shared/preview-roots.ts'
import {
  backupsFolderHolds,
  backupsFolderIsEmpty,
  backupsFolderParts,
  bytesSaid,
  type TheBackupsFolder,
} from '../src/shared/what-is-kept.ts'
import { chineseWords, englishWords } from '../src/shared/words/joined.ts'
import { PreviewRootsList } from '../src/web/components/PreviewRoots.tsx'
import { BackupsFolder } from '../src/web/components/WhatIsKept.tsx'

// The word lists as the pages read them: en.ts and zh.ts with every wave's part (src/shared/words/joined.ts).
const en = englishWords()
const zh = chineseWords()

afterEach(() => { setWordLanguage('en') })

/** The text inside every element with this class, with tags taken out and entities read back. */
function textsOf(markup: string, tag: string, className: string): string[] {
  const pattern = new RegExp(`<${tag} class="${className}"[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  return [...markup.matchAll(pattern)].map((match) =>
    (match[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  )
}

/** A readable backups folder holding these counts, with no newest stamp so only "In it" is drawn. */
function aFolder(count: number, filesFolders: number, leftOutLists: number): TheBackupsFolder {
  return {
    directory: '/made/up/backups',
    readable: true,
    whyUnreadable: null,
    count,
    filesFolders,
    leftOutLists,
    totalBytes: 1536 * (count + filesFolders + leftOutLists),
    newestAt: null,
    says: 'A made-up sentence the normal page does not draw.',
  }
}

/** What the "In it" line draws for this folder. */
function inIt(folder: TheBackupsFolder): string {
  const drawn = textsOf(renderToStaticMarkup(createElement(BackupsFolder, { said: folder })), 'dd', 'wik-val')
  expect(drawn, 'the panel drew no "In it" line, so nothing below is measured').toHaveLength(1)
  return drawn[0] as string
}

const COUNTS = [0, 1, 2, 5]
const EVERY_FOLDER = COUNTS.flatMap((a) => COUNTS.flatMap((b) => COUNTS.map((c) => [a, b, c] as const)))

describe('the backups folder: the panel and backupsFolderParts agree', () => {
  it('in English, the panel draws the shared sentence, or the empty mark exactly when the shared rule says empty', () => {
    setWordLanguage('en')
    for (const [files, folders, lists] of EVERY_FOLDER) {
      const folder = aFolder(files, folders, lists)
      const said = inIt(folder)
      const which = `${String(files)} files, ${String(folders)} folders, ${String(lists)} lists`
      if (backupsFolderIsEmpty(files, folders, lists)) expect(said, which).toContain(en['settingsPanel.kept.none'])
      else expect(said, which).toBe(`${backupsFolderHolds(files, folders, lists)}, ${bytesSaid(folder.totalBytes)}`)
    }
  })

  it('in Chinese, the panel draws exactly the counts backupsFolderParts names, in its order', () => {
    setWordLanguage('zh')
    const words = { files: 'settingsPanel.kept.files', filesFolders: 'settingsPanel.kept.filesFolders', leftOutLists: 'settingsPanel.kept.leftOutLists' } as const
    for (const [files, folders, lists] of EVERY_FOLDER) {
      if (backupsFolderIsEmpty(files, folders, lists)) continue
      const folder = aFolder(files, folders, lists)
      const parts = backupsFolderParts(files, folders, lists).map(({ what, n }) => t(words[what] as WordKey, { n }))
      const last = parts.pop() as string
      const holds = parts.length === 0
        ? last
        : filledWithChineseSpacing(zh['settingsPanel.kept.listAnd'] as string, { list: parts.join(zh['settingsPanel.kept.listComma'] as string), last })
      // A CHINESE WORD FILLS ITS VALUES BY THE OFFICE'S SPACING RULE (wave 13q's round 30), so the expectation does too.
      expect(inIt(folder), `${String(files)} files, ${String(folders)} folders, ${String(lists)} lists`).toBe(
        filledWithChineseSpacing(zh['settingsPanel.kept.holdsAndSize'] as string, { holds, size: bytesSaid(folder.totalBytes) }),
      )
    }
  })
})

/** Made-up sources, one of every kind, and the three ways a reason can be given by hand. */
const SOURCES: PreviewRootSource[] = [
  { kind: 'env' },
  { kind: 'checkout' },
  { kind: 'agents' },
  { kind: 'store', store: 'report-files' },
  { kind: 'repository', repositoryId: 'repo-1', repositoryName: 'kettle-notes' },
  { kind: 'workarea', repositoryId: 'repo-1', repositoryName: 'kettle-notes', workArea: 'drafts/spring' },
  { kind: 'added', addedBy: 'Rowan', addedAt: '2026-03-04 10:15', why: '' },
  { kind: 'added', addedBy: 'Rowan', addedAt: '2026-03-04 10:16', why: '   ' },
  { kind: 'added', addedBy: 'Rowan', addedAt: '2026-03-04 10:17', why: 'The moth photographs live here' },
]

/** What the panel draws beside each directory, one per source, in order. */
function drawnSources(): string[] {
  const roots = SOURCES.map((source, index) => ({ path: `/made/up/${String(index)}`, canonical: `/made/up/${String(index)}`, source }))
  const drawn = textsOf(renderToStaticMarkup(createElement(PreviewRootsList, { roots })), 'dd', 'pvr-source')
  expect(drawn, 'the panel drew a different number of rows, so nothing below is measured').toHaveLength(SOURCES.length)
  return drawn
}

describe('where a preview directory came from: the panel and howARootCameFrom agree', () => {
  it('in English, the panel draws exactly whereARootCameFrom for every source', () => {
    setWordLanguage('en')
    expect(drawnSources()).toEqual(SOURCES.map(whereARootCameFrom))
  })

  it('in Chinese, the panel draws the words for the reading howARootCameFrom chose, with its names', () => {
    setWordLanguage('zh')
    const expected = SOURCES.map((source) => {
      const { reading, ...names } = howARootCameFrom(source)
      const word = zh[`settingsPanel.roots.source.${reading}` as WordKey] as string
      return word.replace(/\{(\w+)\}/g, (_, name: string) => (names as Record<string, string>)[name] ?? `{${name}}`)
    })
    expect(drawnSources()).toEqual(expected)
  })
})
