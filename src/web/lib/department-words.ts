// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PAGE NAMES A DEPARTMENT: its name in the reader's language, and its level word with how many teams are under
 * it. The project board and the departments page both ask here, so the two say it the same way. Wave 13s round 281.
 */
import { theLevelWord, type DepartmentLevel } from '@shared/departments.ts'
import { t, wordLanguage } from '@shared/i18n.ts'

/**
 * ITS NAME IN THE READER'S LANGUAGE: the Chinese name for a Chinese reader, the English for every other, since a
 * department is named in those two only. A name missing in that language is said to be missing, and never taken from
 * the other language.
 */
export function theNameShown(name: { en: string | null; zh: string | null }): string {
  const shown = wordLanguage() === 'zh' ? name.zh : name.en
  return shown ?? t('department.name.notRecorded')
}

/** WHAT IT DOES IN THE READER'S LANGUAGE, by the rule its name follows: never taken from the other language. */
export function theDoesShown(does: { en: string | null; zh: string | null }): string {
  const shown = wordLanguage() === 'zh' ? does.zh : does.en
  return shown ?? t('department.does.notRecorded')
}

/** Its level word, and for a department how many teams are under it at any depth. */
export function theLevelShown(level: DepartmentLevel, teams: number | null): string {
  const word = t(theLevelWord(level))
  return teams === null ? word : t('department.level.withTeams', { level: word, n: teams })
}
