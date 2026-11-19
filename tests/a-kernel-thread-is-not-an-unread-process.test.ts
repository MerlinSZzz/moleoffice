// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { theProcessesNotRead, theProcessesUsing } from '../tools/scratch-folder-checks.mjs'

let root: string, proc: string, folder: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'synthetic-proc-')); proc = join(root, 'proc'); folder = join(root, 'view')
  mkdirSync(folder)
})
afterEach(() => {
  try { chmodSync(join(proc, '17', 'fd'), 0o700); chmodSync(join(proc, '17', 'stat'), 0o600) } catch { /* absent */ }
  rmSync(root, { recursive: true, force: true })
})

function syntheticProcess(command: string, flags: number, parent = 2): string {
  const at = join(proc, '17')
  mkdirSync(join(at, 'fd'), { recursive: true }); symlinkSync(root, join(at, 'cwd'))
  writeFileSync(join(at, 'comm'), `${command}\n`)
  writeFileSync(join(at, 'status'), `Name:\t${command}\nUid:\t0\t0\t0\t0\n`)
  writeFileSync(join(at, 'stat'), `17 (${command}) S ${String(parent)} 0 0 0 0 ${String(flags)} 0\n`)
  chmodSync(join(at, 'fd'), 0)
  return at
}

it('leaves out a kernel thread whose open files are refused', () => {
  syntheticProcess('kernel', 0x00200000)
  expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: [] })
})
it('keeps a user process even when its parent is pid 2', () => {
  syntheticProcess('user', 0, 2)
  expect(theProcessesUsing(folder, proc).unreadable).toHaveLength(1)
})
it('keeps a process when stat is unreadable or malformed', () => {
  const at = syntheticProcess('unknown', 0x00200000)
  chmodSync(join(at, 'stat'), 0)
  expect(theProcessesUsing(folder, proc).unreadable).toHaveLength(1)
  chmodSync(join(at, 'stat'), 0o600); writeFileSync(join(at, 'stat'), 'malformed')
  expect(theProcessesUsing(folder, proc).unreadable).toHaveLength(1)
})
it('parses the flags after the last closing parenthesis in a command', () => {
  syntheticProcess('kernel) S 2 0 0 0 0 0 ) name', 0x00200000)
  expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: [] })
})
it('preserves the existing words through five and adds the remaining count beyond five', () => {
  const names = Array.from({ length: 8 }, (_, n) => `synthetic-${String(n)}`)
  for (let count = 1; count <= 5; count += 1) {
    const list = names.slice(0, count)
    const one = theProcessesNotRead(list)
    expect(one.endsWith(list.join('; '))).toBe(true)
    expect(one).not.toContain('more')
  }
  const short = theProcessesNotRead(names)
  expect(short).toContain(names.slice(0, 5).join('; '))
  expect(short).toContain('and 3 more')
  expect(short).not.toContain(names[5])
})
