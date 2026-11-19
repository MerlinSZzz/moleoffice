// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER-CONTENT GATE READS THE LINES AN ENTRY ADDS UNDER THE OFFICE-MAP PLUGIN.
 *
 * The public copy carries plugins/office-map, so a line added there ships, and the gate must read it as it reads a line
 * added under src. This case adds the same refusing line in both places and expects both to be refused.
 *
 * Mutation: take 'plugins/office-map' out of THE_PATHS_THAT_SHIP in tools/merge-tool/owner-content.mjs, and this case is
 * red: the plugin line is not read and only the src line is refused.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { screenTheAddedLines, thePatterns } from '../tools/merge-tool/owner-content.mjs'

/** A refusing pattern made from one made-up name. */
const PATTERNS = thePatterns({ names: ['quill'], realName: null, handles: [], machines: [], ports: [], researchWords: [] })

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Git in a fixture, with no system or user settings and an invented author. */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim()
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

describe('the owner-content gate reads what ships under plugins/office-map', () => {
  it('refuses a line added under the plugin as it refuses the same line added under src', () => {
    const plugin = 'plugins/office-map/src/model.ts'
    const src = 'src/server/a.ts'
    const line = "export const by = 'quill'\n"
    const dir = mkdtempSync(join(tmpdir(), 'owner-content-plugin-'))
    made.push(dir)
    git(dir, 'init', '--quiet', '-b', 'main')
    write(dir, { [plugin]: 'export const a = 1\n', [src]: 'export const a = 1\n' })
    git(dir, 'add', '-A')
    git(dir, 'commit', '--quiet', '-m', 'main')
    const base = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'checkout', '--quiet', '-b', 'entry')
    write(dir, { [plugin]: `export const a = 1\n${line}`, [src]: `export const a = 1\n${line}` })
    git(dir, 'add', '-A')
    git(dir, 'commit', '--quiet', '-m', 'entry')
    const head = git(dir, 'rev-parse', 'HEAD')

    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: PATTERNS })
    expect(screen.read).toEqual({ files: 2, lines: 2, notText: [] })
    const refused = screen.refused.map(({ file, line, pattern, words }) => ({ file, line, pattern, words }))
    expect(refused).toHaveLength(2)
    expect(refused).toEqual(expect.arrayContaining([
      { file: plugin, line: 2, pattern: 'P1', words: 'quill' },
      { file: src, line: 2, pattern: 'P1', words: 'quill' },
    ]))
  })
})
