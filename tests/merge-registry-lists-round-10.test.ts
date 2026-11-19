// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { isALineFile, whatChangedSinceTheVerdict } from '../src/shared/merge-queue.ts'
import { linesMeetOn, ownLinesOn, plainRegistryList } from '../tools/merge-tool/lines.mjs'

const paths = ['src/shared/ops-list.ts', 'src/server/routes-list.ts']
let repo = ''
afterEach(() => { if (repo) rmSync(repo, { recursive: true, force: true }); repo = '' })
function repository(path: string) {
  repo = mkdtempSync(join(tmpdir(), 'mole-registry-lines-'))
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete env[key]
  const git = (...args: string[]) => execFileSync('git', ['-c', 'gc.auto=0', '-C', repo, ...args], { env, encoding: 'utf8' }).trim()
  git('init', '-q'); git('config', 'user.name', 'Temporary test'); git('config', 'user.email', 'test@example.invalid')
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  const initial = `export const ${path.includes('ops-list') ? 'OPERATION_NAMES' : 'ROUTE_GROUPS'} = [\n  'a',\n  'gapOne',\n  'gapTwo',\n  'z',\n] as const\n`
  const commit = (text: string) => { writeFileSync(join(repo, path), text); git('add', '.'); git('commit', '-qm', 'Synthetic list test'); return git('rev-parse', 'HEAD') }
  return { git, env, initial, commit, base: commit(initial) }
}

it.each(paths)('joins different-line additions to %s and keeps each rider judged by line', (path) => {
  const r = repository(path)
  const own = r.commit(r.initial.replace("  'a',", "  'a',\n  'b',"))
  r.git('checkout', '-q', '--detach', r.base)
  const onto = r.commit(r.initial.replace("  'z',", "  'y',\n  'z',"))
  expect(isALineFile(path)).toBe(true)
  expect(linesMeetOn(repo, path, r.base, { base: r.base, commit: own }, { base: r.base, commit: onto }).meet).toBe(false)
  r.git('cherry-pick', own)
  const joined = r.git('rev-parse', 'HEAD')
  const held = { path, ...ownLinesOn(repo, { base: r.base, commit: own, path, onto, joined }) }
  expect(held.held).toBe(true)
  expect(ownLinesOn(repo, { base: r.base, commit: onto, path, onto: own, joined }).held).toBe(true)
  expect(whatChangedSinceTheVerdict({ [path]: 'rider' }, { [path]: 'joined' }, [held])).toEqual({ kept: [path], changed: [], keptByLine: [held] })
})

it.each(paths)('refuses two riders touching the same line in %s', (path) => {
  const r = repository(path)
  const own = r.commit(r.initial.replace("'a'", "'b'"))
  r.git('checkout', '-q', '--detach', r.base)
  const onto = r.commit(r.initial.replace("'a'", "'c'"))
  expect(linesMeetOn(repo, path, r.base, { base: r.base, commit: own }, { base: r.base, commit: onto }).meet).toBe(true)
  const joined = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, 'cherry-pick', own], { env: r.env, encoding: 'utf8' })
  expect(joined.status).not.toBe(0)
  expect(joined.stdout).toContain('CONFLICT')
})

it.each(paths)('keeps %s pure and judges it by file if any compared tree contains code', (path) => {
  const real = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  expect(isALineFile(path)).toBe(true)
  expect(plainRegistryList(real)).toBe(true)
  for (const code of ["runCode()", "  'extra', runCode()", "  { name: 'extra', effect: 'write' },", "  ...otherNames,", "  'extra', 'second',"]) expect(plainRegistryList(real.replace('] as const', code + '\n] as const'))).toBe(false)
  const r = repository(path)
  const own = r.commit(r.initial.replace("  'a',", "  'b',"))
  r.git('checkout', '-q', '--detach', r.base)
  const onto = r.commit(r.initial.replace("  'z',", "  'y',\n  'z',") + 'runCode()\n')
  r.git('cherry-pick', own)
  expect(ownLinesOn(repo, { base: r.base, commit: own, path, onto, joined: r.git('rev-parse', 'HEAD') })).toEqual({ held: false, why: `${path} is not a plain list; judge it by file` })
  expect(linesMeetOn(repo, path, r.base, { base: r.base, commit: own }, { base: r.base, commit: onto })).toEqual({ meet: true, why: `${path} is not a plain list; judge it by file` })
})

it('leaves operation authorization, route implementation and the other candidates judged by file', () => {
  for (const path of ['src/shared/ops.ts', 'src/server/index.ts', 'src/shared/groups.ts', 'src/shared/refusal-codes.ts', 'src/shared/surfaces.ts', 'src/shared/kinds.ts']) expect(isALineFile(path)).toBe(false)
})
