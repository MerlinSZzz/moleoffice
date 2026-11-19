// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSPECTOR COPIES ITS DSH CLIENT ALONE, AND THE COPIED CLIENT TAKES AN EFFORT WORD AS TYPED.
 *
 * The client runs in the check's view, in its commands folder, so the inspector copies its own client there
 * from beside itself and never from a checkout. The client imports node's own modules only, so the client
 * alone is the code the folder needs; the patch list it gives dsh is put beside it by a call of its own
 * (putTheFeaturesOffBesideTheClient in tools/inspector-dsh-acp.mjs). Nothing here starts dsh: the client is
 * given no prompt, so it stops before it would.
 *
 * Mutations: copy another file beside the client and case 1 turns red; give the client a closed list of
 * efforts again and case 2 turns red.
 */
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyTheDshClient } from '../tools/inspector-sandbox.mjs'

const TOOLS = fileURLToPath(new URL('../tools/', import.meta.url))

let scratch: string, commands: string
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-dsh-client-alone-'))
  commands = join(scratch, 'commands')
  mkdirSync(commands)
})
afterEach(() => { rmSync(scratch, { recursive: true, force: true }) })

/** The client copied into the commands folder, run from there with no prompt; its one envelope. */
function theCopiedClient(effort: string) {
  const ran = spawnSync(process.execPath, [join(commands, 'inspector-dsh-acp.mjs'), '--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', effort], {
    cwd: scratch, input: '', encoding: 'utf8', timeout: 20_000,
  })
  const last = ran.stdout.trim().split('\n').pop() ?? ''
  let envelope: { type?: string; error?: string } | null = null
  try { envelope = JSON.parse(last) } catch { envelope = null }
  return { code: ran.status, envelope, stderr: ran.stderr }
}

describe('a dsh check copies its client alone', () => {
  it('1. puts the client alone into the commands folder, read-only and the same as beside the inspector', () => {
    copyTheDshClient(commands)
    expect(readdirSync(commands)).toEqual(['inspector-dsh-acp.mjs'])
    const copy = join(commands, 'inspector-dsh-acp.mjs')
    expect(lstatSync(copy).isFile()).toBe(true)
    expect(lstatSync(copy).mode & 0o777).toBe(0o444)
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(join(TOOLS, 'inspector-dsh-acp.mjs'), 'utf8'))
  })

  it('2. the copied client reads every effort word as typed, and goes on to read its prompt', () => {
    copyTheDshClient(commands)
    for (const effort of ['off', 'high', 'medium', 'xhigh', 'a-made-up-effort']) {
      const ran = theCopiedClient(effort)
      expect(ran.envelope?.error, effort).toBe('The prompt on stdin is empty or holds only white space. dsh was not started.')
    }
  })

  it('3. replaces a link and an old read-only copy put at the client\'s name, and writes through neither', () => {
    const outside = join(scratch, 'outside.mjs')
    writeFileSync(outside, '// synthetic file outside the commands folder\n')
    symlinkSync(outside, join(commands, 'inspector-dsh-acp.mjs'))
    copyTheDshClient(commands)
    expect(readFileSync(outside, 'utf8')).toBe('// synthetic file outside the commands folder\n')
    expect(lstatSync(join(commands, 'inspector-dsh-acp.mjs')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(commands, 'inspector-dsh-acp.mjs'), 'utf8')).toBe(readFileSync(join(TOOLS, 'inspector-dsh-acp.mjs'), 'utf8'))

    rmSync(join(commands, 'inspector-dsh-acp.mjs'))
    writeFileSync(join(commands, 'inspector-dsh-acp.mjs'), '// an old copy\n', { mode: 0o444 })
    copyTheDshClient(commands)
    expect(readFileSync(join(commands, 'inspector-dsh-acp.mjs'), 'utf8')).toBe(readFileSync(join(TOOLS, 'inspector-dsh-acp.mjs'), 'utf8'))
  })
})
