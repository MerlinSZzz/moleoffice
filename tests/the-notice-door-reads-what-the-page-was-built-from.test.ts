// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { whetherThePageIsTheCommits } from '../src/config/build-stamp.mjs'
import { forgetTheWalks } from '../src/config/import-graph.mjs'

const root = mkdtempSync(join(tmpdir(), 'mole-page-is-its-commit-'))

function write(name: string, text: string): void {
  const path = join(root, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  forgetTheWalks()
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function commit(message: string): string {
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}

git('init', '-q')
git('config', 'user.name', 'Page Inputs Fixture')
git('config', 'user.email', 'page-inputs@example.invalid')
write('src/web/index.html', '<script type="module" src="./main.ts"></script>\n')
write('src/web/main.ts', "export const page = 'first'\n")
write('vite.config.ts', "export default { build: { outDir: 'dist' } }\n")
write('package.json', '{"name":"page-inputs-fixture","version":"1.0.0"}\n')
write('package-lock.json', '{"name":"page-inputs-fixture","lockfileVersion":3}\n')
write('tsconfig.json', '{"compilerOptions":{"strict":true}}\n')
write('public/icon.txt', 'first icon\n')
write('src/server/x.ts', "export const x = 'first'\n")
const A = commit('A')

write('src/server/x.ts', "export const x = 'second'\n")
const B = commit('B changes only a server file')

write('src/web/main.ts', "export const page = 'second'\n")
const C = commit('C changes a page source')

write('package-lock.json', '{"name":"page-inputs-fixture","lockfileVersion":3,"packages":{}}\n')
const locked = commit('D changes only the lock file')

write('public/icon.txt', 'second icon\n')
const icon = commit('E changes only a public file')

write('vite.config.ts', "export default { build: { outDir: 'dist', sourcemap: true } }\n")
const vite = commit('F changes only the vite config')

write('src/web/extra.ts', "export const extra = 'new page file'\n")
write('src/web/main.ts', "import { extra } from './extra.ts'\nexport const page = `second ${extra}`\n")
const added = commit('G adds a page file and imports it')

afterAll(() => rmSync(root, { recursive: true, force: true }))

it('calls the page the same when its build names the commit itself', () => {
  expect(whetherThePageIsTheCommits(root, A, A)).toEqual({ same: true })
})

it('calls the page the same when only a file outside what it is built from changed', () => {
  expect(whetherThePageIsTheCommits(root, A, B)).toEqual({ same: true })
})

it('refuses a commit that changed a page source, and names the file', () => {
  const answer = whetherThePageIsTheCommits(root, A, C)
  expect(answer.same).toBe(false)
  if (answer.same) throw new Error('fixture')
  expect(answer.why).toContain('src/web/main.ts')
})

it('refuses a commit that changed only the lock file, a public file or the vite config', () => {
  const cases: [string, string, string][] = [
    [A, locked, 'package-lock.json'],
    [locked, icon, 'public/icon.txt'],
    [icon, vite, 'vite.config.ts'],
  ]
  for (const [from, to, file] of cases) {
    const answer = whetherThePageIsTheCommits(root, from, to)
    expect(answer.same).toBe(false)
    if (answer.same) throw new Error('fixture')
    expect(answer.why).toContain(file)
  }
})

it('refuses a commit that adds a page file and imports it', () => {
  const answer = whetherThePageIsTheCommits(root, A, added)
  expect(answer.same).toBe(false)
  if (answer.same) throw new Error('fixture')
  expect(answer.why).toContain('src/web/extra.ts')
})

it("refuses a well-formed commit the repository does not have, with git's words", () => {
  const answer = whetherThePageIsTheCommits(root, 'f'.repeat(40), A)
  expect(answer.same).toBe(false)
  if (answer.same) throw new Error('fixture')
  expect(answer.why).toContain('Git could not compare the two commits')
  expect(answer.why).toMatch(/fatal:/)
})

it('refuses a built commit that is not 40 lowercase hex characters', () => {
  const answer = whetherThePageIsTheCommits(root, 'abc', A)
  expect(answer.same).toBe(false)
  if (answer.same) throw new Error('fixture')
  expect(answer.why).toContain('40 lowercase hex characters')
})
