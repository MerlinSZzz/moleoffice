// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE JOIN IS TRIED BEFORE THE WAIT (wave 13v round 15, item 1). `canItJoin` replays an entry's commits onto main the
 * way the queue's rebase will, into unreferenced objects, and says which commit stopped, on which paths and at which
 * lines. A conflict only in migration files is marked as one the rebase may renumber, so nothing sends it back early.
 * Synthetic commit histories in a real temporary repository. No office or remote is used.
 */
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, expect, it} from 'vitest'
import {canItJoin} from '../tools/merge-tool/early-conflicts.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}) })

function aRepository() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-join-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim()
  const write = (files: Record<string, string>) => { for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), text) } }
  const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
  git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid')
  const probe = (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}); return {status: r.status, stdout: r.stdout, stderr: r.stderr} }
  return {root, git, write, commit, probe}
}

it('names the commit that stops, each conflicted path and the lines of its conflict markers, and moves no ref', () => {
  const {root, git, write, commit, probe} = aRepository()
  write({'src/a.txt': 'one\ntwo\nthree\nfour\nfive\n', 'src/b.txt': 'b\n'}); commit('Synthetic base')
  git('checkout', '-qb', 'entry')
  write({'src/own.txt': 'own\n'}); commit('Synthetic first entry commit joins')
  write({'src/a.txt': 'one\ntwo by the entry\nthree\nfour\nfive\n', 'src/b.txt': 'b by the entry\n'}); const stops = commit('Synthetic second entry commit conflicts')
  git('checkout', '-q', 'main')
  write({'src/a.txt': 'one\ntwo by main\nthree\nfour\nfive\n', 'src/b.txt': 'b by main\n'}); const main = commit('Synthetic main moves')
  const before = git('show-ref')
  expect(canItJoin(root, main, stops, probe)).toEqual({
    joins: false, commit: stops, files: ['src/a.txt', 'src/b.txt'], mayRenumber: false,
    lines: [{path: 'src/a.txt', ranges: '2-6'}, {path: 'src/b.txt', ranges: '1-5'}],
  })
  expect(git('show-ref')).toBe(before)
})

it('marks a conflict only in migration files as one the rebase may renumber', () => {
  const {root, git, write, commit, probe} = aRepository()
  write({'drizzle/meta/_journal.json': '{"entries":[0]}\n', 'tests/migration.test.ts': 'base\n'}); commit('Synthetic base')
  git('checkout', '-qb', 'entry')
  write({'drizzle/meta/_journal.json': '{"entries":[0,"entry"]}\n', 'tests/migration.test.ts': 'base\nentry\n', 'drizzle/0001_entry.sql': 'SELECT 1;\n'}); const tip = commit('Synthetic entry migration')
  git('checkout', '-q', 'main')
  write({'drizzle/meta/_journal.json': '{"entries":[0,"main"]}\n', 'tests/migration.test.ts': 'base\nmain\n'}); const main = commit('Synthetic main migration')
  expect(canItJoin(root, main, tip, probe)).toMatchObject({joins: false, mayRenumber: true, files: ['drizzle/meta/_journal.json', 'tests/migration.test.ts']})
})

it('says an entry joins when every commit replays cleanly', () => {
  const {root, git, write, commit, probe} = aRepository()
  write({'src/a.txt': 'a\n'}); commit('Synthetic base')
  git('checkout', '-qb', 'entry'); write({'src/own.txt': 'own\n'}); const tip = commit('Synthetic entry')
  git('checkout', '-q', 'main'); write({'src/a.txt': 'a by main\n'}); const main = commit('Synthetic main moves')
  expect(canItJoin(root, main, tip, probe)).toEqual({joins: true})
})
