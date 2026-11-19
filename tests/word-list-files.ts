// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES OF A WORD LIST, for a test that reads a list as text or by its path, from wave 13j's round
 * 41.
 *
 * The English list is en.ts and every part beside it: en-no-wave.ts and en-wave-13x.ts. The Chinese list is
 * zh.ts and its parts. A word may be in any of them, so a test that looks for a word in the text, or asks
 * which file writes it, reads them all. The parts are found by their names, the same pattern wave 13v's
 * merge queue reads, so a wave that adds a file is read with no change here.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))

export const THE_WORD_LISTS_FOLDER = 'src/shared/words'

/** The files of one list, from the repository, the old list first and then its parts by name. */
export function theWordListFiles(language: 'en' | 'zh'): string[] {
  const parts = readdirSync(join(REPO, THE_WORD_LISTS_FOLDER))
    .filter((name) => new RegExp(`^${language}-(no-wave|wave-1[34][a-z]+)\\.ts$`).test(name))
    .sort()
  return [`${language}.ts`, ...parts].map((name) => `${THE_WORD_LISTS_FOLDER}/${name}`)
}

/** The text of one list: every file of it, one after another. */
export function theWordListText(language: 'en' | 'zh'): string {
  return theWordListFiles(language)
    .map((file) => readFileSync(join(REPO, file), 'utf8'))
    .join('\n')
}
