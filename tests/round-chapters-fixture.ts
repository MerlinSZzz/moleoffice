// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import type { ChapterContent } from '../src/shared/chapter-edit.ts'
import { bytes, regulationsText, RULE_FILES, savedRoundChapters, THE_CHAPTERS_DOOR, theChaptersReadAt, THE_REGULATIONS_DOOR, type RuleFile } from '../src/shared/round-chapters/manifest.ts'
import { ROUND_CHAPTERS_POLICY_FILE } from '../src/shared/round-chapters/delivery.ts'
import { theRoundsCodeText } from '../src/shared/round-start-rules.ts'

export const ROUND_START_RULES: Record<RuleFile, string> = {
  'CODE.md': '# Fixture code\n\n## Chapter 2 — Fixture processes\nUse the recorded fixture group.\n\n## Chapter 5 — Fixture checks\nCheck the supplied fixture.\n',
  'LINE-common.md': '# Fixture line\nKeep the fixture task and its evidence.\n',
  'TERRITORIES.md': '# Fixture territory\nOnly this scratch checkout is in scope.\n',
}

/** A chapter number no record holds, as the chapters door answers it. */
const noChapter = (n: number) => ({ n, inUse: 'none', record: null, version: null, revision: null, chapter: null, stored: null, shipped: null, notUsed: null, chineseWaiting: [] })

/**
 * A MADE-UP OFFICE THAT HOLDS NO CHAPTER AND NO REGULATION: the answer a stand-in office gives for each door a round's
 * start reads its rules from. No real office gave it. Every shipped chapter number is in it, none in use, as an office
 * that copied no default chapter answers.
 */
export const THE_MADE_UP_EMPTY_OFFICE: Record<string, unknown> = {
  [THE_CHAPTERS_DOOR]: {
    chapters: SHIPPED_CHAPTER_NUMBERS.map(noChapter),
    unsupported: null,
    says: 'Made-up: this stand-in office holds no chapter.',
    records: [],
  },
  [THE_REGULATIONS_DOOR]: { regulations: [] },
}

/** The one chapter of THE_MADE_UP_OFFICE_WITH_CHAPTER_2, made up. madeUpRound's policy selects chapter 2. */
export const MADE_UP_CHAPTER_2: ChapterContent = {
  label: 'Made-up chapter 2', title: 'Made-up rules of chapter 2', conclusion: 'Made-up conclusion of chapter 2.', zh: null,
  rules: [{ id: 'r-1', heading: 'Made-up rule of chapter 2', text: 'Made-up words of the rule.', zh: null }],
}

/**
 * A MADE-UP OFFICE THAT HOLDS ONE MADE-UP CHAPTER, number 2, AND NO REGULATION, as its two rules doors would answer.
 * No real office gave it. The chapter's record is in the shape the chapters door gives a stored chapter in.
 */
export const THE_MADE_UP_OFFICE_WITH_CHAPTER_2: Record<string, unknown> = {
  [THE_CHAPTERS_DOOR]: {
    chapters: SHIPPED_CHAPTER_NUMBERS.map(n => n !== 2 ? noChapter(n) : { ...noChapter(n), inUse: 'stored', record: 'made-up-chapter-2', version: 'made-up-version', revision: 1, chapter: MADE_UP_CHAPTER_2, stored: MADE_UP_CHAPTER_2 }),
    unsupported: null,
    says: 'Made-up: this stand-in office holds one made-up chapter.',
    records: [{
      id: 'made-up-chapter-2', kind: 'module', title: MADE_UP_CHAPTER_2.title, summary: MADE_UP_CHAPTER_2.conclusion,
      data: { extra: { chapter: 2 }, shortForms: { label: { text: MADE_UP_CHAPTER_2.label } }, summaryBlocks: MADE_UP_CHAPTER_2.rules.map(({ id, heading, text }) => ({ id, type: 'text', heading, text })) },
    }],
  },
  [THE_REGULATIONS_DOOR]: { regulations: [] },
}

/**
 * A made-up office's answer body for `path`, or null when the path is not a door the rules are read from. A query is
 * not part of the door.
 */
export function theMadeUpOfficesAnswer(path: string, office: Record<string, unknown> = THE_MADE_UP_EMPTY_OFFICE): unknown {
  const door = path.split('?')[0]!
  return Object.hasOwn(office, door) ? office[door] : null
}

/**
 * A round a launcher started over a stand-in office that gave THE_MADE_UP_EMPTY_OFFICE saved the fallback selection: its
 * CODE.md is the text made from no chapter, under the door and the time it was read at, with no live regulation read at
 * that time, and the other two files are the fixture's. No chapter is checked, so the checkout given is not read. A test
 * office that holds no chapter and no regulation passes its own chapters answer as `chapters`.
 */
export function expectRoundRulesSaved(data: unknown, chapters: unknown = THE_MADE_UP_EMPTY_OFFICE[THE_CHAPTERS_DOOR]) {
  const manifest = savedRoundChapters(data)
  expect(manifest?.fallback).toBe(true)
  const at = manifest?.regulations?.at ?? '(no regulations were saved)'
  const none = regulationsText(at, [])
  expect(manifest?.regulations).toEqual({ at, live: [], text: none, bytes: bytes(none) })
  const code = theRoundsCodeText(chapters, at, tmpdir())
  expect(manifest?.sources.map(({ name, path, text, fullFile }) => ({ name, path: name === 'CODE.md' ? path : '(a file)', text, fullFile })))
    .toEqual(RULE_FILES.map(name => ({ name, path: name === 'CODE.md' ? theChaptersReadAt(at) : '(a file)', text: name === 'CODE.md' ? code : ROUND_START_RULES[name], fullFile: true })))
}

export const LEGACY_ROUND_CHAPTERS = { chapters: { named: null, mustRead: [], from: 'the role card', says: null } }

/** Keep source links cheap while the launcher still asks for the rule file in a round's checkout before it chooses where the round works. */
export function linkSourceWithLocalRoundRules(source: string, checkout: string) {
  const link = (from: string, into: string, local: string[]) => {
    mkdirSync(into, { recursive: true })
    for (const name of readdirSync(from)) {
      const target = join(into, name)
      if (name !== local[0]) symlinkSync(join(from, name), target)
      else if (local.length > 1) link(join(from, name), target, local.slice(1))
      else writeFileSync(target, ROUND_START_RULES['CODE.md'], { flag: 'wx' })
    }
  }
  link(join(source, 'src'), join(checkout, 'src'), ['config', 'rules', 'CODE.md'])
}

export function writeRoundStartRules(sandbox: string, worktree: string) {
  const root = realpathSync(sandbox) + sep
  const paths: Record<RuleFile, string> = {
    'CODE.md': join(worktree, 'src/config/rules/CODE.md'),
    'LINE-common.md': join(sandbox, 'briefs/LINE-common.md'),
    'TERRITORIES.md': join(sandbox, 'briefs/TERRITORIES.md'),
  }
  for (const name of RULE_FILES) {
    mkdirSync(dirname(paths[name]), { recursive: true })
    if (!realpathSync(dirname(paths[name])).startsWith(root)) throw new Error('Fixture rule folder resolves outside its sandbox')
    writeFileSync(paths[name], ROUND_START_RULES[name])
  }
}

const scratch: string[] = []
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }) })

export function madeUpRound() {
  const dir = mkdtempSync(join(tmpdir(), 'round-reading-')); scratch.push(dir)
  const worktree = join(dir, 'worktrees', 'synthetic')
  mkdirSync(join(worktree, 'src/config/rules'), { recursive: true })
  mkdirSync(join(dir, 'briefs'))
  const brief = join(dir, 'briefs', 'task.md')
  writeFileSync(brief, 'ORIGINAL task\nwith trailing bytes.\n')
  writeFileSync(join(worktree, 'src/config/rules/CODE.md'), '# Code\n\n## Chapter 2 — Made-up ports\nPORTS\n\n### Child\nCHILD\n\n## Chapter 5 — Made-up tests\nTESTS\n')
  writeFileSync(join(dir, 'briefs/LINE-common.md'), '# Common\nINTRO\n\n## Local\nLOCAL\n\n### Chosen\nCHOSEN\n\n### Omitted\nOMITTED\n\n## Other\nOTHER\n')
  writeFileSync(join(dir, 'briefs/TERRITORIES.md'), '# Territories\n\n## Garden\nGARDEN\n\n## Kitchen\nKITCHEN\n')
  writeFileSync(brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'] }))
  const policy = { version: 1, kinds: { synthetic: { 'CODE.md': [{ chapter: 2, descendants: true }], 'LINE-common.md': [{ path: ['Common', 'Local'] }, { path: ['Common', 'Local', 'Chosen'] }], 'TERRITORIES.md': [] } }, territories: { garden: { 'TERRITORIES.md': [{ path: ['Territories', 'Garden'] }] } } }
  writeFileSync(join(dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(policy))
  return { dir, worktree, brief, policy }
}
