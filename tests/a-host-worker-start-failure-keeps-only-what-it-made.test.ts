// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aMadeUpHostWorker, gitInFixture } from './a-made-up-host-worker.ts'

it('refuses OpenCode when its debug configuration does not show the office tool', async () => {
  const f = await aMadeUpHostWorker('opencode', { noTool: true })
  try {
    await f.start()
    await f.waitForExit()
    expect(existsSync(f.debug)).toBe(true)
    expect(existsSync(f.capture)).toBe(false)
    expect(f.entry().state).toBe('failed')
    expect(f.entry().failed.says).toContain('OpenCode did not show the office tool in its configuration')
  } finally { await f.close() }
}, 120_000)

it('uses an existing folder without creating a worktree or changing its branch', async () => {
  const f = await aMadeUpHostWorker('codex', { folder: true })
  const head = gitInFixture(f.repo, 'rev-parse', 'HEAD')
  const branch = gitInFixture(f.repo, 'branch', '--show-current')
  const worktrees = gitInFixture(f.repo, 'worktree', 'list', '--porcelain')
  const names = readdirSync(f.repo).sort()
  const before = f.tree(f.repo).filter((entry) => entry.path !== '')
  try {
    await f.start()
    const capture = await f.waitForProgram()
    expect(capture.cwd).toBe(f.repo)
    expect(readFileSync(join(f.repo, 'made-by-program.txt'), 'utf8')).toBe('made up')
    expect(readdirSync(f.repo).sort()).toEqual([...names, 'made-by-program.txt'].sort())
    expect(gitInFixture(f.repo, 'rev-parse', 'HEAD')).toBe(head)
    expect(gitInFixture(f.repo, 'branch', '--show-current')).toBe(branch)
    expect(gitInFixture(f.repo, 'worktree', 'list', '--porcelain')).toBe(worktrees)
    expect(f.tree(f.repo).filter((entry) => entry.path !== '' && entry.path !== '/made-by-program.txt')).toEqual(before)
    expect(f.runRecord().workerPlace.kind).toBe('folder')
    await f.end()
    expect(f.runRecord().state).toBe('crashed')
  } finally { await f.close() }
}, 120_000)

it('stops the gated group on refused registration and crashes its filed run', async () => {
  const f = await aMadeUpHostWorker('codex', { refuseProcess: true })
  try {
    await f.start()
    await f.waitForExit()
    expect(existsSync(f.capture)).toBe(false)
    const group = f.refusedGroup()
    expect(group).not.toBeNull()
    expect(() => process.kill(-group!, 0)).toThrow()
    expect(f.runRecord()).toMatchObject({ state: 'crashed', detail: expect.stringContaining('registration') })
  } finally { await f.close() }
}, 120_000)

it('removes the Claude configuration and its clean worktree when startup fails', async () => {
  const f = await aMadeUpHostWorker('claude-code', { missingProgram: true })
  try {
    await f.start()
    await f.waitForExit()
    expect(existsSync(f.capture)).toBe(false)
    expect(readdirSync(f.temp)).toEqual([])
    expect(existsSync(f.place.folder)).toBe(false)
    expect(gitInFixture(f.repo, 'branch', '--list', 'fixture-worker')).toBe('')
    expect(readFileSync(join(f.repo, 'tracked.txt'), 'utf8')).toBe('made up\n')
  } finally { await f.close() }
}, 120_000)
