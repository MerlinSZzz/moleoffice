// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEMO CORPUS NAMES NONE OF THE OWNER'S PROJECTS, PEOPLE, FOLDERS OR MACHINES.
 *
 * The demo data is written anew, so it no longer maps back to the owner's research (problems lHuoCvTKOeez and
 * sqPRXgx-wMXF), as item 2 of a decision says. The corpus that shipped until then was the
 * owner's robotics work with the words swapped: the owner's project folders, the owner's findings and numbers, paths
 * under the owner's home folder. This file reads what a fresh clone seeds, scripts/seed-corpus/public.json and the seed
 * program scripts/seed.ts, and fails if either names any of the following:
 *
 *   - the owner's project and folder names, and the names the earlier reskin used for them;
 *   - the owner's names and the owner's account, from the file of the owner's content, in a case of
 *     their own that is taken out, and says why, where no such file was read. That case lets through the seed
 *     program's copyright header, which only the clean version carries and which names the copyright holder, by
 *     isTheCopyrightHeader in tests/the-owners-copyright-line.ts;
 *   - any path under /home/;
 *   - a private network address (the 100.64/10 range the owner's machines use, 10.x, 192.168.x) or the
 *     host name the inventory found;
 *   - a fragment of a title copied from the owner's live office;
 *   - anything shaped like a Mole Office record id, which would be an id copied from a real office.
 *
 * NEVER READS THE LIVE OFFICE. The forbidden names are written here as plain strings, from problem
 * lHuoCvTKOeez and the inventory (report X8UHfSEhYLn2, block r15-2). The title fragments are short
 * on purpose: this file is public too, so it carries no finding whole.
 *
 * MUTATION PROOF (after a green control): put one of the forbidden names into one record's title in the
 * corpus. The first case is red and names the record.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { aWordPattern, OWNER_NAMES, THE_OWNERS_ACCOUNT } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { isTheCleanVersion, isTheCopyrightHeader } from './the-owners-copyright-line.ts'

const CORPUS = 'scripts/seed-corpus/public.json'
const PROGRAM = 'scripts/seed.ts'

/** Whether this checkout is the clean version, where the seed program starts with the copyright header. */
const IN_THE_CLEAN_VERSION = isTheCleanVersion(fileURLToPath(new URL('..', import.meta.url)))

/** The owner's project and folder names (lHuoCvTKOeez), the office project's own name, and the earlier reskin's names. */
const THE_OWNERS_PROJECTS = [
  'proj_1st_baseline', 'proj_slam', 'gelsight', 'cap_yumi', 'yumi', 'isaac', 'apron', 'panelx',
  'greenhouse', 'leafcam', 'soilpen', 'growlab', 'tray clamp', 'potting rig', 'velodyne',
]

/** Fragments of titles from the owner's live office (lHuoCvTKOeez quotes them whole; this file does not). */
const THE_OWNERS_TITLE_FRAGMENTS = ['0.63 mm', 'udev autosuspend', 'gauge quotes', '50mm 立方体']

/** Private addresses and the host name the inventory found, as patterns. */
const PRIVATE_ADDRESSES: readonly RegExp[] = [
  /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\b192\.168\.\d{1,3}\.\d{1,3}\b/,
  /\bbirch\b/i,
]

/** Every string anywhere in a JSON value, with where it is. */
function stringsIn(value: unknown, where: string, out: { where: string; text: string }[]): void {
  if (typeof value === 'string') out.push({ where, text: value })
  else if (Array.isArray(value)) value.forEach((item, i) => stringsIn(item, `${where}[${String(i)}]`, out))
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      stringsIn(key, `${where} (key)`, out)
      stringsIn(item, `${where}.${key}`, out)
    }
  }
}

/** What in `text` is forbidden, as one sentence each. */
function whatItNames(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const name of THE_OWNERS_PROJECTS) if (lower.includes(name)) found.push(`names "${name}"`)
  for (const fragment of THE_OWNERS_TITLE_FRAGMENTS) if (text.includes(fragment)) found.push(`quotes "${fragment}"`)
  if (/\/home\//.test(text)) found.push('holds a path under /home/')
  for (const pattern of PRIVATE_ADDRESSES) if (pattern.test(text)) found.push(`holds a private address or host (${String(pattern)})`)
  return found
}


describe('the demo corpus a fresh clone seeds', () => {
  it('names none of the owner\'s projects, people, folders, addresses or titles', () => {
    const corpus = JSON.parse(readFileSync(CORPUS, 'utf8')) as { records: { key: string; title: string }[] }
    const strings: { where: string; text: string }[] = []
    stringsIn(corpus, 'corpus', strings)
    const problems = strings.flatMap(({ where, text }) => whatItNames(text).map((what) => `${where} ${what}`))
    expect(problems, problems.slice(0, 20).join('\n')).toEqual([])
  })


  it("names neither the owner nor the owner's account, in the corpus or the seed program", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (OWNER_NAMES.length === 0 || THE_OWNERS_ACCOUNT === null) {
      throw new Error("The file of the owner's content was read, and it gave no names or no account.")
    }
    const theOwner = aWordPattern([...OWNER_NAMES, THE_OWNERS_ACCOUNT.name])
    const strings: { where: string; text: string }[] = []
    stringsIn(JSON.parse(readFileSync(CORPUS, 'utf8')) as unknown, 'corpus', strings)
    readFileSync(PROGRAM, 'utf8')
      .split('\n')
      .forEach((line, i, lines) => {
        if (!isTheCopyrightHeader(lines, i, IN_THE_CLEAN_VERSION)) strings.push({ where: `${PROGRAM}:${String(i + 1)}`, text: line })
      })
    const found = strings.filter(({ text }) => theOwner.test(text)).map(({ where }) => `${where} names the owner or the owner's account`)
    expect(found, found.slice(0, 20).join('\n')).toEqual([])
  })

  it('and the seed program names none of them either', () => {
    const lines = readFileSync(PROGRAM, 'utf8').split('\n')
    const problems = lines.flatMap((line, i) => whatItNames(line).map((what) => `${PROGRAM}:${String(i + 1)} ${what}`))
    expect(problems, problems.slice(0, 20).join('\n')).toEqual([])
  })
})
