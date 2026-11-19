// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PICTURES AND MIGRATIONS BELONG TO THE CHECKOUT, WHEREVER A PROGRAM RUNS.
 *
 * Problem ycuCb5UvwVXg: the width tool wrote into the owner's checkout and accepted missing
 * names. It must use its own module's location and refuse missing arguments before doing work.
 * Problem 59N5YwzEE-CB: the default migrations folder depended on the working directory.
 * It must name this checkout's drizzle folder, including the migrations journal.
 *
 * MUTATION PROOF, each alone after a green control: Remove the width tool's label and
 * record id check and only "the width tool refuses missing arguments before doing work" turns
 * red. Put MIGRATIONS_FOLDER back to './drizzle' and only "the default migrations folder is
 * this checkout's absolute drizzle folder and holds its journal" turns red. Restore each mutation.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { MIGRATIONS_FOLDER } from '../src/server/db/migrate.ts'

const WIDTH_TOOL = fileURLToPath(new URL('../tools/width-check.mjs', import.meta.url))
const PICTURES = join(REPO_ROOT, 'design/round-eleven/wave-a/width-shots')

function picturesWithNoLabel(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => /^undefined-.*\.png$/.test(basename(file)))
}

describe('two paths come from the checkout', () => {
  it('the width tool refuses missing arguments before doing work', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'two-paths-'))
    try {
      for (const args of [[], ['a-label']]) {
        const result = spawnSync(process.execPath, [WIDTH_TOOL, ...args], {
          cwd,
          encoding: 'utf8',
          // Room for a loaded machine: the queue's whole suite has run this machine at a load of 30 and more.
          timeout: 30_000,
          // A refusal must precede reading app settings. This invalid address also stops the
          // removed-check mutation before it can write pictures or reach a server.
          env: { ...process.env, MOLE_OFFICE_URL: '' },
        })
        expect(result.error).toBeUndefined()
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('Give a label and a record id')
        expect(result.stderr).toContain('node tools/width-check.mjs <label> <recordId> [width,width]')
        expect(picturesWithNoLabel(PICTURES)).toEqual([])
        expect(picturesWithNoLabel(cwd)).toEqual([])
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it("the default migrations folder is this checkout's absolute drizzle folder and holds its journal", () => {
    expect(isAbsolute(MIGRATIONS_FOLDER)).toBe(true)
    expect(MIGRATIONS_FOLDER).toBe(join(REPO_ROOT, 'drizzle'))
    expect(existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true)
  })
})
