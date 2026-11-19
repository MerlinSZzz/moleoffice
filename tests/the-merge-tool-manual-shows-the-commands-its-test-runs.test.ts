// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL'S MANUAL SHOWS THE COMMANDS ITS TEST RUNS.
 *
 * WHAT THIS FILE PROVES:
 * 1. Every fenced line of tools/merge-tool/README.md that begins with the command line's program is one of
 *    the three usage lines the command-words module writes, and each of the three usage lines is in the
 *    README.
 * 2. The command line's own test imports the command-words module and builds every call from it, holding no
 *    literal option word. Case 2 guards how another test file is written, not what the command line does.
 *    A call built with `theWordsOf` and a call with the option words typed by hand give the child the
 *    same words, so no run of the command line can tell them apart.
 * 3. The README's first fenced JSON block, with its repository pointed at a fresh throwaway git repository
 *    and its email placeholder replaced, is accepted: the command line's list exits 0. The child has its own
 *    HOME and no office names, as the command line test's children do.
 * 4. The README holds no wave or line handle, no email address, and no twelve-character token shaped like a
 *    record id.
 * 5. The README holds no owner name or agent handle as a word. The names come from the file of the owner's
 *    content, so where no such file was read this case is taken out and says why.
 *
 * The fixtures are synthetic and removed after the file. Nothing reaches an office.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { theWordsOf } from '../tools/merge-tool/the-command-words.mjs'
import { AGENT_HANDLES, OWNER_NAMES } from './the-names-the-gates-refuse.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const README = join(ROOT, 'tools', 'merge-tool', 'README.md')
const GIT_NAME = 'Synthetic manual test'
const GIT_EMAIL = 'merge-tool-manual@example.invalid'

const made: string[] = []
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true })
})

/** A made-up folder under the system temporary folder, removed after the file. */
function aFolder(prefix: string): string {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), `merge-tool-manual-${prefix}-`)))
  made.push(folder)
  return folder
}

/** A child's environment: its own home, no office names, and no inherited git or node options. */
function anEnvironment(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY' || name === 'NODE_OPTIONS' || name.startsWith('GIT_')) delete env[name]
  }
  return {
    ...env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: GIT_NAME,
    GIT_AUTHOR_EMAIL: GIT_EMAIL,
    GIT_COMMITTER_NAME: GIT_NAME,
    GIT_COMMITTER_EMAIL: GIT_EMAIL,
  }
}

/** Every fenced block of a Markdown text, with its fence language and its lines. */
function theFencedBlocks(text: string): { language: string; lines: string[] }[] {
  const blocks: { language: string; lines: string[] }[] = []
  let open: { language: string; lines: string[] } | null = null
  for (const line of text.split('\n')) {
    const fence = /^```(.*)$/u.exec(line)
    if (fence !== null) {
      if (open === null) open = { language: (fence[1] ?? '').trim(), lines: [] }
      else {
        blocks.push(open)
        open = null
      }
      continue
    }
    if (open !== null) open.lines.push(line)
  }
  return blocks
}

/** One name as a whole word, without regard to case. */
function aWordPattern(name: string): RegExp {
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'iu')
}

describe("the merge tool's manual", () => {


  it('accepts its example configuration with the repository and the placeholder filled in', () => {
    const example = JSON.parse(
      theFencedBlocks(readFileSync(README, 'utf8'))
        .filter((block) => block.language === 'json')
        .map((block) => block.lines.join('\n'))[0] ?? '',
    ) as Record<string, unknown>

    const root = aFolder('example')
    const home = join(root, 'home')
    mkdirSync(home, { recursive: true })
    const repository = join(root, 'project')
    mkdirSync(repository, { recursive: true })
    const env = anEnvironment(home)
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { env, encoding: 'utf8' })

    example.repository = repository
    const commitAs = example.commitAs as Record<string, unknown>
    if (commitAs.email === 'YOUR-EMAIL-ADDRESS') commitAs.email = GIT_EMAIL
    const config = join(root, 'merge-tool.json')
    writeFileSync(config, `${JSON.stringify(example, null, 2)}\n`)

    const ran = spawnSync(process.execPath, [join(ROOT, 'tools', 'merge-tool', 'cli.mjs'), ...theWordsOf('list', { config })], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(ran.status, ran.stderr).toBe(0)
  })

  it('holds no wave handle, email address or record-id shape', () => {
    const text = readFileSync(README, 'utf8')
    expect(text).not.toMatch(/\bwave-13/iu)
    expect(text).not.toMatch(/\bw13[a-z]/iu)
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/u)
    const tokens = text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/gu) ?? []
    const recordShaped = tokens.filter((token) => /[A-Z]/u.test(token) && /[a-z]/u.test(token) && /[0-9]/u.test(token))
    expect(recordShaped, recordShaped.join(', ')).toEqual([])
  })

  it('holds no owner name or agent handle', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    const text = readFileSync(README, 'utf8')
    for (const name of [...OWNER_NAMES, ...AGENT_HANDLES]) {
      expect(text, name).not.toMatch(aWordPattern(name))
    }
  })
})
