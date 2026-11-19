// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { isALineFile, whatChangedSinceTheVerdict } from '../src/shared/merge-queue.ts'
import { ownLinesOn } from '../tools/merge-tool/lines.mjs'

let repo = ''
afterEach(() => { if (repo) rmSync(repo, { recursive: true, force: true }); repo = '' })
function repository(path: string, content: string) {
  repo = mkdtempSync(join(tmpdir(), 'mole-round-seven-lines-'))
  // Do not inherit a caller's git directory or work tree into the temporary repository.
  const run = (...args: string[]) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete env[key]
    return execFileSync('git', ['-c', 'gc.auto=0', '-C', repo, ...args], { encoding: 'utf8', env }).trim()
  }
  run('init', '-q'); run('config', 'user.name', 'Temporary test'); run('config', 'user.email', 'test@example.invalid')
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  const commit = (text: string) => { writeFileSync(join(repo, path), text); run('add', '.'); run('commit', '-qm', 'Synthetic test content'); return run('rev-parse', 'HEAD') }
  return { run, commit, base: commit(content) }
}

it('keeps the parts re-export lines judged when another wave adds a separate line in a temporary repository', () => {
  const path = 'src/shared/words/parts.ts'
  const initial = "export * from './en-wave-a'\n\n// gap\n\nexport * from './en-wave-z'\n"
  const r = repository(path, initial)
  const own = initial.replace("export * from './en-wave-a'", "export * from './en-wave-a'\nexport * from './en-wave-b'")
  const commit = r.commit(own)
  r.run('checkout', '-q', '--detach', r.base)
  const onto = r.commit(initial.replace("export * from './en-wave-z'", "export * from './en-wave-y'\nexport * from './en-wave-z'"))
  r.run('cherry-pick', commit)
  const joined = r.run('rev-parse', 'HEAD')
  const held = { path, ...ownLinesOn(repo, { base: r.base, commit, path, onto, joined }) }
  expect(isALineFile(path)).toBe(true)
  expect(held.held).toBe(true)
  expect(whatChangedSinceTheVerdict({ [path]: 'own-content' }, { [path]: 'joined-content' }, [held])).toEqual({ kept: [path], changed: [], keptByLine: [held] })
})

it('refuses the same hunk text at a different position and accepts the position shifted by earlier changes', () => {
  const path = 'list.txt'
  const initial = 'top\nrepeat\ngap-one\ngap-two\nrepeat\nbottom\n'
  const r = repository(path, initial)
  const commit = r.commit(initial.replace('repeat', 'changed'))
  r.run('checkout', '-q', '--detach', r.base)
  const onto = r.commit('inserted\n' + initial)
  const misplaced = r.commit(('inserted\n' + initial).replace('gap-two\nrepeat', 'gap-two\nchanged'))
  expect(ownLinesOn(repo, { base: r.base, commit, path, onto, joined: misplaced })).toEqual({ held: false, why: 'its own lines do not stand unchanged on the joined tree' })
  r.run('checkout', '-q', '--detach', onto)
  r.run('cherry-pick', commit)
  expect(ownLinesOn(repo, { base: r.base, commit, path, onto, joined: r.run('rev-parse', 'HEAD') })).toEqual({ held: true, ranges: 'line 3' })
})
