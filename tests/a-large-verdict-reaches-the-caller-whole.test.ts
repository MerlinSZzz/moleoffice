// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LARGE VERDICT REACHES THE CALLER WHOLE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * tools/checks/verdict.mjs printed its verdict with `process.stdout.write(...)` and then called
 * `process.exit(...)` at once. When stdout is a pipe — which is how tools/the-merger.mjs runs the
 * checkers, with spawnSync — Node writes asynchronously, and `process.exit` drops whatever is still
 * queued behind the pipe buffer. A files changeset of 378 avatars produced about 1 MB of verdict;
 * the merger received only the first 146,176 bytes with exit 0, could not parse it, and bounced the
 * entry with "tools/checks/files-changeset.mjs could not run (exit 0)" (measured 22 September 2026).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS RUNS
 * ---------------------------------------------------------------------------------------
 *
 * The files checker, exactly as the merger runs it: spawnSync, stdout a pipe, encoding utf8. The
 * changeset adds several hundred small valid JSON files, which makes a verdict far larger than a
 * pipe buffer. The whole verdict has to arrive: it parses as JSON, it names every file, and the
 * checker still exits 0 because every check it decided passed.
 *
 * The checks that would fail on the truncated output are the byte count and the JSON.parse; the
 * count is there so a run that somehow produced a tiny verdict does not pass by accident.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT WAS PROVED, CONTROL FIRST (chapter 5)
 * ---------------------------------------------------------------------------------------
 *
 *   Control: green, with `writeThenExit` in tools/checks/verdict.mjs (the fix).
 *   Mutation: replace its body with `write` then `process.exit`, and this file goes red on the
 *     JSON.parse — the pipe receives less than the whole verdict. Restore, and it is green again.
 *   The commands and results are in the commit message.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'checks', 'files-changeset.mjs')

/**
 * HOW MANY FILES THE CHANGESET ADDS. Each add decides seven checks, and the verdict is printed with
 * one space of indentation, so four hundred files are several hundred kilobytes — well past the
 * roughly 64 KiB a pipe holds.
 */
const HOW_MANY_FILES = 400

const PLACE = mkdtempSync(join(tmpdir(), 'mole-office-a-large-verdict-'))

/** The sha256 of some bytes, as the manifest writes it. */
function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

interface Verdict {
  tool: string
  decided: { path: string; check: string; ok: boolean; detail: string }[]
  needsJudgment: { path: string; why: string }[]
}

afterAll(() => {
  rmSync(PLACE, { recursive: true, force: true })
})

describe('a large verdict', () => {
  it('reaches the caller whole when stdout is a pipe', () => {
    const folder = join(PLACE, 'change')
    const world = join(PLACE, 'world')
    const blobFolder = join(folder, 'blobs')
    mkdirSync(blobFolder, { recursive: true })
    mkdirSync(world, { recursive: true })

    const operations: Record<string, unknown>[] = []
    for (let index = 0; index < HOW_MANY_FILES; index += 1) {
      const name = `row-${String(index).padStart(4, '0')}.json`
      const bytes = Buffer.from(`{"n":${String(index)}}\n`)
      writeFileSync(join(blobFolder, name), bytes)
      operations.push({
        op: 'add',
        target: `data/rows/${name}`,
        blob: `blobs/${name}`,
        before_hash: 'absent',
        after_hash: sha256(bytes),
        source: `row ${String(index)}, written by this test`,
        size: bytes.length,
      })
    }
    const manifest = join(folder, 'manifest.json')
    writeFileSync(manifest, JSON.stringify({ operations }))

    // THE MERGER'S OWN CALL: spawnSync, stdout a pipe, encoding utf8, and its maxBuffer.
    const result = spawnSync(process.execPath, [TOOL, '--manifest', manifest, '--root', world], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    expect(result.status, result.stderr).toBe(0)

    const stdout = result.stdout ?? ''
    // NOT A SMALL VERDICT THAT PASSED BY ACCIDENT.
    expect(Buffer.byteLength(stdout, 'utf8')).toBeGreaterThan(64 * 1024)

    // THE WHOLE OUTPUT PARSES. A dropped tail lands here, mid-array.
    let verdict: Verdict
    try {
      verdict = JSON.parse(stdout) as Verdict
    } catch (err) {
      throw new Error(
        `the verdict did not arrive whole (${(err as Error).message}); ` +
          `${String(Buffer.byteLength(stdout, 'utf8'))} bytes arrived and ended ${JSON.stringify(stdout.slice(-80))}`,
      )
    }

    // AND IT NAMES EVERY FILE, not only the ones that fit the pipe.
    const named = new Set(verdict.decided.filter((one) => one.check === 'manifest-entry').map((one) => one.path))
    expect(named.size).toBe(HOW_MANY_FILES)
    expect(verdict.decided).toHaveLength(HOW_MANY_FILES * 7)
    expect(verdict.decided.some((one) => one.ok === false), 'a valid file was decided a failure').toBe(false)
  })
})
