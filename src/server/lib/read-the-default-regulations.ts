// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `readTheDefaultRegulations` was moved byte for byte out of src/server/lib/default-regulations.ts, with no change of behaviour.
 * `THE_DEFAULT_REGULATIONS_FILE` was moved byte for byte out of src/server/lib/default-regulations.ts, with no change of behaviour.
 * `THE_DEFAULT_REGULATIONS_PATH` was moved byte for byte out of src/server/lib/default-regulations.ts, with no change of behaviour.
 * `theChaptersListedIn` was moved byte for byte out of src/server/lib/default-regulations.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { join } from 'node:path'
import { WHERE_A_RULES_CHINESE_CAME_FROM } from '../../shared/default-set.ts'
import { contentOfChapter, problemsWithAChapter } from '../../shared/chapter-check.ts'
import type { DefaultRule, DefaultChapter } from './default-regulations.ts'
import { REPO_ROOT } from '../../config/settings.mjs'
import { readFileSync } from 'node:fs'

/**
 * THE DEFAULT SET, READ AND CHECKED. It throws, naming the file and what is wrong, on anything that is
 * not the declared shape: a start that copied half a chapter would give the office a regulation that
 * nobody wrote.
 */
export function readTheDefaultRegulations(file = THE_DEFAULT_REGULATIONS_PATH, checkout?: string): DefaultChapter[] {
  const { wrong, chapters, numbers } = theChaptersListedIn(file)
  const text = (value: unknown, where: string): string => {
    if (typeof value !== 'string' || value.trim() === '') throw wrong(`${where} is not a piece of text`)
    return value
  }
  const parsed = chapters.map((c, i): DefaultChapter => {
    const n = numbers[i]!
    const outline = c['outline']
    if (!Array.isArray(outline) || outline.length === 0) throw wrong(`chapter ${String(n)} has no rules`)
    const zh = (typeof c['zh'] === 'object' && c['zh'] !== null ? c['zh'] : {}) as Record<string, unknown>
    return {
      n,
      ...(c['forRole'] === undefined ? {} : { forRole: text(c['forRole'], `chapter ${String(n)}'s role`) }),
      label: text(c['label'], `chapter ${String(n)}'s label`),
      title: text(c['title'], `chapter ${String(n)}'s title`),
      conclusion: text(c['conclusion'], `chapter ${String(n)}'s conclusion`),
      context: text(c['context'], `chapter ${String(n)}'s context`),
      outline: outline.map((rule: unknown, r) => {
        const one = (typeof rule === 'object' && rule !== null ? rule : {}) as Record<string, unknown>
        const at = `chapter ${String(n)}'s rule ${String(r + 1)}`
        const zh = (typeof one['zh'] === 'object' && one['zh'] !== null ? one['zh'] : {}) as Record<string, unknown>
        const from = one['zhFrom']
        if (!(WHERE_A_RULES_CHINESE_CAME_FROM as readonly unknown[]).includes(from)) {
          throw wrong(`${at}'s zhFrom is not one of ${WHERE_A_RULES_CHINESE_CAME_FROM.map((w) => `"${w}"`).join(' or ')}`)
        }
        return {
          id: text(one['id'], `${at}'s id`),
          name: text(one['name'], `${at}'s name`),
          text: text(one['text'], `${at}'s text`),
          zh: { name: text(zh['name'], `${at}'s Chinese name`), text: text(zh['text'], `${at}'s Chinese text`) },
          zhFrom: from as DefaultRule['zhFrom'],
        }
      }),
      zh: {
        label: text(zh['label'], `chapter ${String(n)}'s Chinese label`),
        title: text(zh['title'], `chapter ${String(n)}'s Chinese title`),
        conclusion: text(zh['conclusion'], `chapter ${String(n)}'s Chinese conclusion`),
      },
    }
  })
  const readable = parsed.map(chapter => ({ ...chapter, id: `shipped-chapter-${String(chapter.n)}`, source: THE_DEFAULT_REGULATIONS_FILE }))
  // A chapter's number comes from the file it is read from, not from the shipped list built into the program.
  const declared = parsed.map(chapter => chapter.n)
  for (const chapter of readable) {
    const problems = problemsWithAChapter(chapter.n, contentOfChapter(chapter), readable, checkout, undefined, true, declared)
    if (problems.length > 0) throw wrong(problems.join(' ').replace(/\.$/, ''))
  }
  return parsed
}
/** The default set, relative to the checkout, as each copied chapter names it. */
export const THE_DEFAULT_REGULATIONS_FILE = 'src/config/rules/default-regulations.json'
/** The default set in this checkout, which a start reads. */
export const THE_DEFAULT_REGULATIONS_PATH = join(REPO_ROOT, THE_DEFAULT_REGULATIONS_FILE)
/**
 * THE DEFAULT SET'S CHAPTERS AND THEIR NUMBERS, the part of the file every start reads. It throws, naming the file,
 * when the file is not JSON, holds no `chapters` list, or gives a chapter no whole number of at least 1 or a number
 * twice. Nothing else in the file is read here.
 */
export function theChaptersListedIn(file: string): { wrong: (what: string) => Error; chapters: Record<string, unknown>[]; numbers: number[] } {
  const wrong = (what: string): Error => new Error(`The default regulations in ${file} cannot be copied: ${what}.`)
  let held: unknown
  try {
    held = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw wrong(`the file could not be read as JSON (${(error as Error).message})`)
  }
  const listed = (held as { chapters?: unknown }).chapters
  if (!Array.isArray(listed) || listed.length === 0) throw wrong('it holds no `chapters` list')
  const chapters = listed.map((one: unknown) => (typeof one === 'object' && one !== null ? one : {}) as Record<string, unknown>)
  const seen = new Set<number>()
  const numbers = chapters.map((c, i) => {
    const n = c['n']
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw wrong(`chapter ${String(i + 1)} in the list has no chapter number`)
    if (seen.has(n)) throw wrong(`chapter ${String(n)} appears twice`)
    seen.add(n)
    return n
  })
  return { wrong, chapters, numbers }
}
