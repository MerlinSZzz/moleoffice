// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SET OF RULES, WRITTEN ONCE, READ BY THREE TOOLS.
 *
 * `design/messages/ACCEPTANCE.md` M10: *The rules an agent reads are generated for each runtime from
 * one source, so the three never drift apart.*
 *
 * Claude Code reads `CLAUDE.md`; Codex and OpenCode read `AGENTS.md`. Two names, one set of rules,
 * and nothing in a file system makes two files agree. So `AGENTS.md` is generated from `CLAUDE.md`
 * and the Mole Office skill, by `src/worker/rules.ts`, into the working directory of a run.
 *
 * THAT IS A DEVELOPER CHECKOUT, whose `CLAUDE.md` starts with the developer heading, so every checkout
 * this file makes writes that heading first. A folder without that file is an installation, which
 * carries no `CLAUDE.md` and whose rules are written from the user part, the
 * chapters and the skill; `tests/an-installed-office-writes-the-general-rules-for-each-tool.test.ts`
 * checks that shape, and the empty folder below is read as one.
 *
 * THE THINGS THAT MAKE THAT TRUE, and they are what this file checks:
 *
 *   1. The generated file really is made of the sources. Change a source, change what every agent
 *      reads.
 *   3. `AGENTS.md` is not in the repository. A committed copy is a second source, and it would go
 *      stale the first time anybody edited `CLAUDE.md`.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  CHAPTERS_END,
  CHAPTERS_SOURCE,
  CHAPTERS_START,
  RULES_SOURCE,
  SKILL_SOURCE,
  USER_PART_REFERENCE,
  USER_PART_SOURCE,
  rulesTextFrom,
  sectionOf,
  writeRulesInto,
} from '../src/worker/rules.ts'
import type { CodeOfLaw } from '../src/worker/rules.ts'
import { THE_DEVELOPER_HEADING } from '../scripts/no-development-material.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let checkout: string

/**
 * ONE CHAPTER OF A CODE OF LAW, so that a checkout of this test's own has the shape a real one has.
 *
 * The general file carries a pointer line per chapter and the generator builds those lines from the
 * chapters rather than from the file (criterion C4), so a checkout with no chapters is a checkout
 * the rules cannot be written from. Here that machinery is only scenery.
 */
const A_CODE: CodeOfLaw = {
  generatedBy: 'tests/one-set-of-rules.test.ts',
  from: 'a chapter written by this test',
  at: '2026-09-06 12:00:00',
  chapters: [
    {
      n: 1,
      id: 'aChapterRecord',
      label: 'A chapter of the code',
      title: 'What this chapter governs',
      conclusion: 'The one sentence a pointer line carries.',
      outline: [{ id: 'r-1', name: 'A rule', text: 'What the rule says in full.' }],
      context: 'Why the chapter exists.',
      source: 'Where its rules live today.',
    },
  ],
}

/** The two markers, and nothing between them: what a general file carries before it is generated. */
const A_CHAPTER_BLOCK = `${CHAPTERS_START}\n${CHAPTERS_END}`

/** The user part, which the general file reads by reference. */
const A_USER_PART = '# Rules for every agent\n\nA line for any agent working in an office.\n'

/**
 * A checkout of this repository's shape, with sources of this test's own that it can edit. Its CLAUDE.md
 * starts with the developer heading, as this repository's does, because that heading is how the rules
 * writer tells a developer checkout from an installation.
 */
function makeCheckout(rules: string, skill: string, code: CodeOfLaw = A_CODE): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-rules-'))
  writeFileSync(join(dir, RULES_SOURCE), `${THE_DEVELOPER_HEADING}\n\n${rules}`, 'utf8')
  mkdirSync(dirname(join(dir, USER_PART_SOURCE)), { recursive: true })
  writeFileSync(join(dir, USER_PART_SOURCE), A_USER_PART, 'utf8')
  mkdirSync(dirname(join(dir, SKILL_SOURCE)), { recursive: true })
  writeFileSync(join(dir, SKILL_SOURCE), skill, 'utf8')
  mkdirSync(dirname(join(dir, CHAPTERS_SOURCE)), { recursive: true })
  writeFileSync(join(dir, CHAPTERS_SOURCE), JSON.stringify(code), 'utf8')
  return dir
}

const A_SKILL = [
  '# Mole Office',
  '',
  '## Non-negotiable operating rules',
  '',
  'Record what you actually observed.',
  '',
  '## Write in plain language. This is a rule, not a preference.',
  '',
  'One idea per sentence.',
  '',
  '## Shapes come from the API, never from this skill',
  '',
  'Read GET /api/kinds.',
  '',
  '## Decide what you can, and report after',
  '',
  'File the fork, not the choice.',
  '',
  '## When somebody asks you to take them to a page',
  '',
  'File a lead. It is a field on the message you send back.',
  '',
  '## How a message is handed to you',
  '',
  'WHO SENT IT, IN PROJECT and THE MESSAGE, record <id>: come from one declaration.',
  '',
  '## How to start',
  '',
  'Read GET /api first.',
  '',
].join('\n')

beforeAll(() => {
  checkout = makeCheckout(`${USER_PART_REFERENCE}\n\nTruth before convenience.\n\n${A_CHAPTER_BLOCK}\n`, A_SKILL)
})

afterAll(() => {
  rmSync(checkout, { recursive: true, force: true })
})

describe('the rules a tool reads are made of the sources, so editing a source changes them', () => {
  it('refuses to write the rules when CLAUDE.md has lost the line that reads the user part', () => {
    const lost = makeCheckout(`Truth before convenience.\n\n${A_CHAPTER_BLOCK}\n`, A_SKILL)
    try {
      expect(() => rulesTextFrom(lost)).toThrow(/user part of the rules/)
    } finally {
      rmSync(lost, { recursive: true, force: true })
    }
  })

  it('follows an edit to a source rather than keeping what it said before', () => {
    const edited = makeCheckout(
      `${USER_PART_REFERENCE}\n\nA rule nobody had written yesterday.\n\n${A_CHAPTER_BLOCK}\n`,
      A_SKILL,
    )
    try {
      expect(rulesTextFrom(edited)).toContain('A rule nobody had written yesterday.')
    } finally {
      rmSync(edited, { recursive: true, force: true })
    }
  })

})

describe('a missing source stops the run instead of writing half the rules', () => {
  it('reads a folder with no CLAUDE.md as an installation, and refuses naming the user part it lacks', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mole-office-rules-none-'))
    try {
      expect(() => rulesTextFrom(empty, A_CODE.chapters)).toThrow(/src\/config\/rules\/USER\.md is not there/)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('refuses when the skill has lost a section, and names the heading', () => {
    const short = makeCheckout(`${USER_PART_REFERENCE}\n\n${A_CHAPTER_BLOCK}\n`, '# Mole Office\n\n## Something else\n\nnothing\n')
    try {
      expect(() => rulesTextFrom(short)).toThrow(/no longer has a section headed/)
    } finally {
      rmSync(short, { recursive: true, force: true })
    }
  })

  it('cuts a section at the next heading of the same depth and not at a deeper one', () => {
    const document = ['# top', '', '## one', '', 'first', '', '### inside one', '', 'still one', '', '## two', '', 'second', ''].join('\n')
    const cut = sectionOf(document, '## one')
    expect(cut).toContain('still one')
    expect(cut).not.toContain('second')
    expect(sectionOf(document, '## nowhere')).toBeNull()
  })
})

describe('there is one writer, and the file it writes is not in the repository', () => {
  it('writes AGENTS.md for a tool that reads that name, and writes nothing for Claude Code', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'mole-office-rules-run-'))
    try {
      const wrote = writeRulesInto(runDir, checkout, 'AGENTS.md')
      expect(wrote.written).toBe(true)
      expect(readFileSync(join(runDir, 'AGENTS.md'), 'utf8')).toContain('Truth before convenience.')

      const left = writeRulesInto(runDir, checkout, 'CLAUDE.md')
      expect(left.written).toBe(false)
      expect(left.because).toContain('is the source')
    } finally {
      rmSync(runDir, { recursive: true, force: true })
    }
  })

  it('is ignored by git, so no copy of it can be committed', () => {
    const said = execFileSync('git', ['check-ignore', '-v', 'AGENTS.md'], { cwd: REPO, encoding: 'utf8' })
    expect(said).toContain('.gitignore')
  })
})
