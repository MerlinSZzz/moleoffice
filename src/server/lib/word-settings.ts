// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { installSavedWords, problemsWithASavedWord, savedWords, type SavedWord, type SavedWords } from '@shared/word-settings.ts'

export const WORD_SETTING_PREFIX = 'office.word:'
/** A saved word this release cannot use: its key, the value as stored, and why it is not used. */
export interface AStoredWordNotUsed { key: string; stored: unknown; problems: string[] }
let revisions = new Map<string, string>()
let revision = '0'
let notUsed: AStoredWordNotUsed[] = []
export function wordRevision(key: string): string { return revisions.get(key) ?? '0' }
export function savedWordsRevision(): string { return revision }
/** The saved words the last load kept out of use, sorted by key. A caller cannot change them by changing a reply. */
export function storedWordsNotUsed(): AStoredWordNotUsed[] { return structuredClone(notUsed) }
export function storedWordNotUsed(key: string): AStoredWordNotUsed | null { return structuredClone(notUsed.find(one => one.key === key) ?? null) }
/**
 * Load once at server start, and after a committed edit. A word read never queries per row.
 * A saved word this release cannot use is kept out of use and named, so the office still starts and its
 * own restore press can remove the word.
 */
export function loadSavedWords(): SavedWords {
  const choices: Record<string, SavedWord> = {}
  const refused: AStoredWordNotUsed[] = []
  for (const row of sqlite.prepare('SELECT name, value FROM runtime_settings WHERE name LIKE ? ORDER BY name').all(WORD_SETTING_PREFIX + '%') as { name: string; value: string }[]) {
    const key = row.name.slice(WORD_SETTING_PREFIX.length)
    let stored: unknown
    try { stored = JSON.parse(row.value) }
    catch { refused.push({ key, stored: row.value, problems: ['The saved choice is not readable JSON.'] }); continue }
    const problems = problemsWithASavedWord(key, stored)
    if (problems.length > 0) refused.push({ key, stored, problems })
    else choices[key] = stored as SavedWord
  }
  revisions = new Map()
  let latest = 0
  for (const row of sqlite.prepare("SELECT record_id, MAX(rowid) AS seq FROM changes WHERE record_id LIKE 'setting:word:%' GROUP BY record_id").all() as { record_id: string; seq: number }[]) {
    revisions.set(row.record_id.slice('setting:word:'.length), String(row.seq))
    latest = Math.max(latest, row.seq)
  }
  revision = String(latest)
  installSavedWords(choices, revision)
  notUsed = refused
  return savedWords()
}
