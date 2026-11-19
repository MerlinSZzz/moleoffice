// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO READER SEES HALF A FILE: A PUBLISHED FILE APPEARS WHOLE OR NOT AT ALL.
 *
 * A plain writeFileSync first empties the file at its path and then fills it, so a reader that comes in between reads an
 * empty or partial file. That is what made tests/the-launcher-passes-the-owners-effort.test.ts fail now and then: the
 * sandbox helper wrote start.json and end.json with a plain write while the launcher and the test read them, and the
 * test's own stand-in office wrote each run file with a plain write while the helper and the test read it.
 *
 * THE ONE WRITER is writeWhole in tools/sandbox-common.mjs: a temporary file of a new random name beside the path,
 * made new ('wx') so a link left at the temporary name is never written through, then renamed onto the path. The
 * helper publishes start.json, end.json and the handshake's end.json with it, and the stand-in office in the launcher
 * test publishes its run files with a copy of it. writeFacts, the instance's own facts file, already went through it.
 *
 * WHAT IS PROVED, AND WHY EACH PROOF CANNOT PASS BY LUCK.
 *   - The old file at the path is never written into: the test opens it before the write, and after the write the old
 *     file still holds its old bytes whole while the path names a new file (a new inode) with the new bytes whole. A
 *     plain write changes the old file's bytes and keeps its inode, so this is red under the mutation.
 *   - A symbolic link left at the path is replaced, and the file it pointed to is unchanged. A plain write follows the
 *     link and writes the target, so this is red under the mutation.
 *   - The helper's own writes are proved in a running helper, not by reading its source: a link is left at the path
 *     the helper will publish, the helper runs to its end, and the path holds a whole file while the link's target is
 *     untouched. With the helper's plain write, the target would gain the bytes and the path would stay a link.
 *
 * MUTATIONS, each alone after a control run, in the run that added this file:
 *   - writeWhole calls writeFileSync on the path itself: the first three cases go red.
 *   - the helper's start.json write goes back to a plain writeFileSync: the start case goes red.
 *   - the helper's two end.json writes go back to plain writeFileSync: the end case goes red.
 *
 * Every folder here is a fresh folder under the system's temporary folder. No test starts a server, and every child is
 * stopped by the process group id this file recorded when it started it.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THE_FACTS_VARIABLE, theFactsAStartIsGiven, writeWhole } from '../tools/sandbox-common.mjs'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const THE_HELPER = fileURLToPath(new URL('../tools/sandbox-start.mjs', import.meta.url))
const OLD_BYTES = '{"old":"the bytes that must survive"}\n'
/** The stand-in sandbox's facts, as up writes them and as the launcher gives them to the helper. */
const FACTS = { instance: 'synthetic', template: 'synthetic', containerRow: 'synthetic-container', container: { name: 'synthetic-container' } }

/** The groups this file started, stopped at the end by the group id recorded when each child was started. */
const groups = new Set<number>()
let root = ''
let instance = ''
let child: ChildProcess | null = null

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-office-half-a-file-'))
  instance = join(root, 'sandbox')
  mkdirSync(join(instance, 'handshakes'), { recursive: true })
  writeFileSync(join(instance, 'instance.json'), JSON.stringify(FACTS))
})

afterEach(() => {
  if (child !== null && child.pid !== undefined) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* the group is gone already */ }
  }
  child = null
  for (const group of groups) {
    try { process.kill(-group, 'SIGKILL') } catch { /* the group is gone already */ }
  }
  groups.clear()
  rmSync(root, { recursive: true, force: true })
})

/** Wait until `check` says yes, or fail naming what was waited for. */
async function until(check: () => boolean, what: string, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise((done) => setTimeout(done, 20))
  }
  throw new Error(`waited ${String(ms)} ms for ${what}`)
}

/** The one folder the helper made under the instance's logs/, once it is there. */
function theLogsFolder(): string {
  const logs = join(instance, 'logs')
  const names = existsSync(logs) ? readdirSync(logs) : []
  expect(names, 'the helper made no logs folder, or more than one').toHaveLength(1)
  return join(logs, names[0]!)
}

/** A link to a file holding OLD_BYTES, left at `path`. */
function aLinkOver(path: string, target: string): void {
  writeFileSync(target, OLD_BYTES)
  symlinkSync(target, path)
}

describe('the one writer publishes a file whole', () => {
  it('leaves the old file at the path untouched, and puts the new bytes whole in a new file', () => {
    const path = join(root, 'a-file.json')
    writeFileSync(path, OLD_BYTES)
    const before = statSync(path)
    // The old file is opened before the write, so its bytes are read through the handle the reader already held.
    const held = openSync(path, 'r')
    try {
      writeWhole(path, '{"new":"whole"}\n', 0o600)
      const after = statSync(path)
      expect(after.ino, 'the path was written into rather than replaced').not.toBe(before.ino)
      const buffer = Buffer.alloc(128)
      const read = readSync(held, buffer, 0, buffer.length, 0)
      expect(buffer.subarray(0, read).toString(), 'the old file changed under its reader').toBe(OLD_BYTES)
    } finally {
      closeSync(held)
    }
    expect(readFileSync(path, 'utf8')).toBe('{"new":"whole"}\n')
  })

  it('replaces a symbolic link at the path, and leaves the file it pointed to unchanged', () => {
    const path = join(root, 'a-file.json')
    const target = join(root, 'the-old-file.json')
    aLinkOver(path, target)
    writeWhole(path, '{"new":"whole"}\n', 0o644)
    expect(lstatSync(path).isSymbolicLink(), 'the link at the path was written through').toBe(false)
    expect(readFileSync(path, 'utf8')).toBe('{"new":"whole"}\n')
    expect(readFileSync(target, 'utf8'), 'the file the link pointed to changed').toBe(OLD_BYTES)
  })

  it('gives the published file the mode it was asked for, whatever was at the path before', () => {
    const path = join(root, 'a-file.json')
    writeFileSync(path, OLD_BYTES, { mode: 0o666 })
    writeWhole(path, '{"new":"whole"}\n', 0o600)
    expect(statSync(path).mode & 0o777).toBe(0o600 & ~process.umask())
    writeWhole(path, '{"newer":"whole"}\n', 0o644)
    expect(statSync(path).mode & 0o777).toBe(0o644 & ~process.umask())
  })
})

/** Run the helper against this test's instance, and answer the child and its handshake folder. */
function runTheHelper(label: string, args: string[], command: string[]): { ran: ChildProcess; handshake: string } {
  const handshake = join(instance, 'handshakes', label)
  mkdirSync(handshake, { recursive: true })
  const ran = spawn(process.execPath, [
    THE_HELPER, '--instance', instance, '--cwd', instance,
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-run', '--workspace', 'default',
    '--api', 'http://127.0.0.1:1', '--handshake', handshake, ...args, '--', ...command,
  ], { env: withAPrivateTmpToSweep({ ...withoutInheritedEffort(), [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(FACTS), SANDBOX_HANDSHAKE_LIMIT_MS: '10000' }, root), detached: true })
  child = ran
  if (ran.pid !== undefined) groups.add(ran.pid)
  return { ran, handshake }
}

/** The code the child exits with. */
function theCode(ran: ChildProcess): Promise<number | null> {
  return new Promise((done) => ran.on('close', (code) => done(code)))
}

describe('the helper publishes its own files through the writer', () => {
  it('publishes start.json whole over a link left at its path', async () => {
    const { ran, handshake } = runTheHelper('start-proof', [], [process.execPath, '-e', 'process.exit(0)'])
    await until(() => existsSync(join(handshake, 'pid.json')), 'the helper to ask the host for its row')
    const logs = theLogsFolder()
    const target = join(root, 'the-old-start.json')
    // The link is left before the row is written, so it stands at the path when the helper publishes start.json.
    aLinkOver(join(logs, 'start.json'), target)
    writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'synthetic-row' }))
    expect(await theCode(ran)).toBe(0)
    const path = join(logs, 'start.json')
    expect(lstatSync(path).isSymbolicLink(), 'start.json was written through the link').toBe(false)
    const start = JSON.parse(readFileSync(path, 'utf8')) as { instance: string; run: string | null; command: string[] }
    expect(start.instance).toBe('synthetic')
    expect(start.run).toBeNull()
    expect(start.command[0]).toBe(process.execPath)
    expect(readFileSync(target, 'utf8'), 'the file the link pointed to changed').toBe(OLD_BYTES)
  }, 30_000)

  it('publishes end.json and the handshake end.json whole over links left at their paths', async () => {
    const release = join(root, 'release-the-command')
    const waiter = join(root, 'wait-for-release.mjs')
    writeFileSync(waiter, 'import { existsSync } from "node:fs"\nconst deadline = Date.now() + 20000\nconst look = setInterval(() => {\n  if (existsSync(process.argv[2])) { clearInterval(look); process.exit(0) }\n  if (Date.now() > deadline) { clearInterval(look); process.exit(3) }\n}, 20)\n')
    const { ran, handshake } = runTheHelper('end-proof', ['--wait', '--timeout', '20'], [process.execPath, waiter, release])
    await until(() => existsSync(join(handshake, 'pid.json')), 'the helper to ask the host for its row')
    const logs = theLogsFolder()
    writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'synthetic-row' }))
    await until(() => existsSync(join(logs, 'start.json')), 'the helper to publish start.json')
    const endTarget = join(root, 'the-old-end.json')
    const handshakeTarget = join(root, 'the-old-handshake-end.json')
    aLinkOver(join(logs, 'end.json'), endTarget)
    aLinkOver(join(handshake, 'end.json'), handshakeTarget)
    // The command ends only now, so both links stand at the paths when the helper publishes the two end files.
    writeFileSync(release, '')
    expect(await theCode(ran)).toBe(0)
    for (const [path, target] of [[join(logs, 'end.json'), endTarget], [join(handshake, 'end.json'), handshakeTarget]] as const) {
      expect(lstatSync(path).isSymbolicLink(), `${path} was written through the link`).toBe(false)
      const end = JSON.parse(readFileSync(path, 'utf8')) as { exit: number }
      expect(end.exit).toBe(0)
      expect(readFileSync(target, 'utf8'), `the file the link at ${path} pointed to changed`).toBe(OLD_BYTES)
    }
  }, 30_000)
})
