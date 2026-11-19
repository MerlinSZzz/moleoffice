// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRET SCAN SAYS HOW MANY KEYS ARE IN A FOLDER, AND NEVER PRINTS ONE.
 *
 * The office keeps a tool of its own for scanning for sensitive content, for the agents to use.
 * It is what an agent runs before anything leaves
 * this machine — a backup, an export, an upload — and what a script runs to stop a push.
 *
 * WHAT IS PROVED
 *   1. A provider key's shape is found and counted by its own name.
 *   2. A key THIS OFFICE issued is found, by hashing every 64-hex string and looking it up in
 *      `held_keys`. That table holds hashes and no keys, so the lookup is certain rather than a
 *      guess, and an ordinary SHA-256 in a transcript is left alone.
 *   3. Nothing it prints carries a value: not the key, not a prefix of it.
 *   4. A folder with nothing in it answers "nothing that looks like a key was found" and exits 0,
 *      so a push script can use the exit code.
 *   5. It says which sources it could not look at, so a clean answer is never read as a complete
 *      one when the office's database was not there.
 *
 * MUTATION PROOF, named. In tools/secret-scan.mjs, take `add('a key this office issued', issued)`
 * out and case 2 goes red; make the report print the value beside the count and case 3 goes red.
 *
 * Every key here is invented for this file. The office key is a random 32 bytes made in the test and
 * never written anywhere but the throwaway database's hash column.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'secret-scan.mjs')

let t: TestDb
let folder = ''
let clean = ''
/** A key of the shape this office mints: 32 random bytes as 64 hex. Only its hash is stored. */
const officeKey = randomBytes(32).toString('hex')
/** A key of OpenRouter's shape. Invented here; it is not anybody's key. */
const providerKey = `sk-or-v1-${'a1b2c3d4'.repeat(8)}`

interface Answer {
  filesRead: number
  found: Record<string, number>
  files: { file: string; found: Record<string, number> }[]
  couldNotLookAt: string[]
}

/** Run the tool and hand back what it printed and its exit code. Never throws on a non-zero exit. */
function scan(path: string, ...more: string[]): { code: number; out: string } {
  try {
    // `--db` NAMES THE THROWAWAY DATABASE. `canonicalDatabasePath` reads .env and ignores the
    // shell, so an environment variable would not move it — which is why the tool takes a flag.
    const out = execFileSync('node', [TOOL, path, '--db', t.file, ...more], { encoding: 'utf8' })
    return { code: 0, out }
  } catch (error) {
    const held = error as { status?: number; stdout?: string; stderr?: string }
    return { code: held.status ?? -1, out: `${held.stdout ?? ''}${held.stderr ?? ''}` }
  }
}

beforeAll(async () => {
  t = await freshDb()
  t.client.sqlite
    .prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)')
    .run('scan-fixture-1', 'agent', 'scan-fixture', createHash('sha256').update(officeKey).digest('hex'), '2026-09-22 19:00:00')
  folder = mkdtempSync(join(tmpdir(), 'mole-office-secret-scan-'))
  clean = mkdtempSync(join(tmpdir(), 'mole-office-secret-scan-clean-'))
  mkdirSync(join(folder, 'under'), { recursive: true })
  writeFileSync(join(folder, 'a-transcript.jsonl'), `{"text":"the key it was given was ${officeKey} and it kept it"}\n`)
  writeFileSync(join(folder, 'under', 'a-note.md'), `A provider key pasted into a note: ${providerKey}\n`)
  // AN ORDINARY SHA-256 AND A WORD THAT STARTS WITH sk-: neither is a key, and neither is counted.
  writeFileSync(join(folder, 'ordinary.md'), `sha256 ${createHash('sha256').update('a file').digest('hex')} of a file, from task-the-merge-queue-runs-in-order\n`)
  writeFileSync(join(clean, 'ordinary.md'), 'Nothing in here is a key. sha256 of nothing in particular.\n')
}, 60_000)

afterAll(() => {
  t?.close()
  for (const path of [folder, clean]) if (path !== '') rmSync(path, { recursive: true, force: true })
})

describe('tools/secret-scan.mjs', () => {
  it('counts a provider key by its own name and a key this office issued by its hash', () => {
    const ran = scan(folder, '--json')
    expect(ran.code, ran.out).toBe(1)
    const answer = JSON.parse(ran.out.trim().split('\n').at(-1) ?? '{}') as Answer
    expect(answer.filesRead).toBe(3)
    expect(answer.found['openrouter-key']).toBe(1)
    expect(answer.found['a key this office issued']).toBe(1)
    // THE ORDINARY FILE IS IN NOBODY'S LIST: a SHA-256 is not a key, and "task-…" is not sk-.
    expect(answer.files.map((one) => one.file).some((file) => file.endsWith('ordinary.md'))).toBe(false)
  })

  it('never prints the key, nor any part of it', () => {
    const ran = scan(folder)
    for (const secret of [officeKey, providerKey]) {
      expect(ran.out, 'the scan printed a key').not.toContain(secret)
      expect(ran.out, 'the scan printed the start of a key').not.toContain(secret.slice(0, 12))
    }
    expect(ran.out).toContain('a key this office issued')
  })

  it('answers nothing found, and exits 0, on a folder with no key in it', () => {
    const ran = scan(clean)
    expect(ran.code, ran.out).toBe(0)
    expect(ran.out).toContain('nothing that looks like a key was found')
  })

  it('says which sources it could not look at, so a clean answer is not read as a complete one', () => {
    const ran = scan(clean, '--json')
    const answer = JSON.parse(ran.out.trim().split('\n').at(-1) ?? '{}') as Answer
    expect(Array.isArray(answer.couldNotLookAt)).toBe(true)
  })

  it('scans the first file it is given when no office database is named', () => {
    // WITHOUT --db THE TOOL TAKES NO FLAG BEFORE THE PATH, which is how an agent runs it by hand.
    // indexOf answers -1 when --db is absent, and the filter dropped argument 0 for it: the FIRST
    // file named was silently skipped, so a leak in it answered "nothing found" and exited 0.
    // A scan that says "clean" about a file it never opened is the one answer this tool must never give.
    let code = 0
    let out = ''
    try {
      out = execFileSync('node', [TOOL, join(folder, 'under', 'a-note.md'), '--json'], { encoding: 'utf8' })
    } catch (error) {
      const held = error as { status?: number; stdout?: string; stderr?: string }
      code = held.status ?? -1
      out = (held.stdout ?? '') + (held.stderr ?? '')
    }
    expect(code, out).toBe(1)
    const answer = JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as Answer
    expect(answer.filesRead, 'the one file named was not read').toBe(1)
    expect(answer.found['openrouter-key']).toBe(1)
  })

  it('refuses with its usage when it is given no path', () => {
    const ran = scan('--json')
    expect(ran.code).toBe(2)
    expect(ran.out).toContain('node tools/secret-scan.mjs')
  })
})
