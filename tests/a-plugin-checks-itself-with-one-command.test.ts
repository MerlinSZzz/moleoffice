// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN CHECKS ITSELF WITH ONE COMMAND: ITS FOUR SLOT CHECKS, ITS TYPE CHECK, ITS OWN TESTS AND ITS BUILD. Wave 13x
 * round 16, step 4 of the plugin pipeline udGnc-Bsr15R (block 1Asl25_3DvQM), as the plan VlQueUhVQQmi says in its
 * Checks block. The command is `node tools/check-a-plugin.mjs <id>`.
 *
 * Every plugin here is made up, in a temporary tree of this file's own: plugins/<id>/, a copy of the published read
 * types at src/shared/plugin-read.ts, and a link to this checkout's node_modules. The command is pointed at it with
 * --root, and says what it did as one JSON object with --json.
 *
 * WHAT THIS FILE PROVES:
 * 1. A good plugin passes every step, in order, and its pages are built into plugins/<id>/dist, where the office serves
 *    them from.
 * 2. A manifest the office refuses fails the manifest check, in the office's own words.
 * 3. A view its interface does not have fails the views check, and nothing else in the manifest is blamed for it.
 * 4. Built files over the manifest's budget fail the size check.
 * 5. An import of office code, by path or by the office's alias, and an import that cannot be read before it runs, fail
 *    the imports check. The published read types, a package and a file of its own are allowed.
 * 6. A type error fails the type check, and a failing test fails the tests step.
 * 7. A plugin with no tests fails the tests step, because a check that ran nothing is not a check.
 * 8. An id with no folder fails, and says so.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const ROOT = join(import.meta.dirname, '..')
const scratch = aTestDatabaseFolder('a-plugin-checks-itself')
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

interface AStep {
  step: 'manifest' | 'views' | 'imports' | 'types' | 'tests' | 'build' | 'size'
  outcome: 'passed' | 'failed' | 'not run'
  says: string
}
interface TheCheck {
  plugin: string
  folder: string
  passed: boolean
  steps: AStep[]
}

const EVERY_STEP = ['manifest', 'views', 'imports', 'types', 'tests', 'build', 'size']

/** A manifest this office accepts, for the made-up plugin `id`, with `more` laid over it. */
function aManifest(id: string, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: { en: 'A made-up plugin' },
    version: '1.0.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects', 'work'],
    budget: { builtKilobytes: 50 },
    ...more,
  }
}

/** The files of a good made-up plugin, by path inside its folder. `change` replaces some and adds others. */
function aGoodPlugin(id: string, change: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    'plugin.json': JSON.stringify(aManifest(id)),
    'main.html': '<!doctype html><html><body><p id="count"></p><script type="module" src="./main.ts"></script></body></html>\n',
    'main.ts': [
      "import type { PluginWorkView } from '../../src/shared/plugin-read.ts'",
      "import { count } from './count.ts'",
      'const none: PluginWorkView[\'work\'] = []',
      "document.getElementById('count')!.textContent = String(count(none))",
      '',
    ].join('\n'),
    'count.ts': 'export function count(rows: readonly unknown[]): number {\n  return rows.length\n}\n',
    'tests/count.test.ts': [
      "import { expect, it } from 'vitest'",
      "import { count } from '../count.ts'",
      "it('counts the rows', () => {",
      '  expect(count([1, 2])).toBe(2)',
      '})',
      '',
    ].join('\n'),
    ...change,
  }
}

/** A tree of this file's own holding the plugin `id`, and the command's answer about it. */
function check(id: string, files: Record<string, string | null> | null): { code: number | null; said: TheCheck; out: string } {
  const tree = mkdtempSync(join(scratch, 'tree-'))
  mkdirSync(join(tree, 'src', 'shared'), { recursive: true })
  copyFileSync(join(ROOT, 'src', 'shared', 'plugin-read.ts'), join(tree, 'src', 'shared', 'plugin-read.ts'))
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'))
  mkdirSync(join(tree, 'plugins'))
  for (const [path, text] of Object.entries(files ?? {})) {
    if (text === null) continue
    const file = join(tree, 'plugins', id, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  // THE COMMAND STARTS ITS OWN TEST RUNNER, so this runner's own variables are not handed to it.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST') && name !== 'NODE_ENV'))
  const ran = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-a-plugin.mjs'), id, '--root', tree, '--json'], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 })
  const out = `${ran.stdout}\n${ran.stderr}`
  const line = ran.stdout.trim().split('\n').at(-1) ?? ''
  let said: TheCheck
  try {
    said = JSON.parse(line) as TheCheck
  } catch {
    throw new Error(`The command did not end with one JSON line. It said:\n${out.slice(-3000)}`)
  }
  return { code: ran.status, said, out }
}

const stepOf = (said: TheCheck, step: AStep['step']): AStep => {
  const found = said.steps.find((one) => one.step === step)
  if (found === undefined) throw new Error(`No step ${step} in ${JSON.stringify(said)}`)
  return found
}
const outcomes = (said: TheCheck): Record<string, string> => Object.fromEntries(said.steps.map((one) => [one.step, one.outcome]))

describe('a plugin checks itself with one command', () => {
  it('1. passes a good plugin on every step, in order, and builds its pages into plugins/<id>/dist', () => {
    const { code, said, out } = check('made-up', aGoodPlugin('made-up'))
    expect(said.steps.map((one) => one.step)).toEqual(EVERY_STEP)
    expect(outcomes(said), out.slice(-3000)).toEqual(Object.fromEntries(EVERY_STEP.map((step) => [step, 'passed'])))
    expect(said.passed).toBe(true)
    expect(code).toBe(0)
    expect(existsSync(join(said.folder, 'dist', 'main.html'))).toBe(true)
    expect(stepOf(said, 'size').says).toMatch(/of 50 KB/u)
    expect(stepOf(said, 'tests').says).toMatch(/1 test/u)
  }, 150_000)

  it('2. fails a manifest the office refuses, in the office\'s own words', () => {
    const { code, said } = check('made-up', aGoodPlugin('made-up', { 'plugin.json': JSON.stringify(aManifest('made-up', { store: 'a table' })) }))
    expect(code).toBe(1)
    expect(said.passed).toBe(false)
    expect(stepOf(said, 'manifest')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(said, 'manifest').says).toMatch(/^plugin\.json is not a manifest this office accepts\./u)
    expect(stepOf(said, 'views').outcome, 'the views are fine').toBe('passed')
    expect(stepOf(said, 'build').outcome, 'nothing says which pages to build').toBe('not run')
    expect(stepOf(said, 'size').outcome).toBe('not run')
  }, 150_000)

  it('3. fails a view its interface does not have, on the views check alone', () => {
    const { code, said } = check('made-up', aGoodPlugin('made-up', { 'plugin.json': JSON.stringify(aManifest('made-up', { reads: ['projects', 'rooms'] })) }))
    expect(code).toBe(1)
    expect(stepOf(said, 'views')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(said, 'views').says).toMatch(/rooms/u)
    expect(stepOf(said, 'views').says).toMatch(/office-read\/1/u)
    expect(stepOf(said, 'manifest').outcome, 'the rest of the manifest is fine').toBe('passed')
  }, 150_000)

  it('4. fails built files over the budget', () => {
    // A STRING THE BUILD CANNOT SHORTEN, of about 3 KB, against a budget of 1 KB.
    const long = Array.from({ length: 300 }, (_, index) => `w${String(index * 7919 % 10007)}`).join(' ')
    const { code, said } = check('made-up', aGoodPlugin('made-up', {
      'plugin.json': JSON.stringify(aManifest('made-up', { budget: { builtKilobytes: 1 } })),
      'main.ts': `document.body.textContent = ${JSON.stringify(long)}\n`,
    }))
    expect(code).toBe(1)
    expect(stepOf(said, 'build').outcome).toBe('passed')
    expect(stepOf(said, 'size')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(said, 'size').says).toMatch(/of 1 KB/u)
  }, 150_000)

  it('5. fails an import of office code, and allows the published types, a package and its own files', () => {
    const byPath = check('made-up', aGoodPlugin('made-up', { 'count.ts': "import { PLUGIN_ID } from '../../src/shared/plugins.ts'\nexport function count(rows: readonly unknown[]): number {\n  return PLUGIN_ID.source.length + rows.length\n}\n" }))
    expect(stepOf(byPath.said, 'imports')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(byPath.said, 'imports').says).toMatch(/count\.ts.*src\/shared\/plugins\.ts/u)
    const byAlias = check('made-up', aGoodPlugin('made-up', { 'count.ts': "import type { PluginManifest } from '@shared/plugins.ts'\nexport function count(rows: readonly PluginManifest[]): number {\n  return rows.length\n}\n" }))
    expect(stepOf(byAlias.said, 'imports')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(byAlias.said, 'imports').says).toMatch(/@shared\/plugins\.ts/u)
    const unread = check('made-up', aGoodPlugin('made-up', { 'count.ts': "export async function count(name: string): Promise<number> {\n  return Object.keys(await import(name)).length\n}\n" }))
    expect(stepOf(unread.said, 'imports')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(unread.said, 'imports').says).toMatch(/cannot be read before it runs/u)
    // THE GOOD PLUGIN OF TEST 1 IMPORTS THE PUBLISHED TYPES AND ITS OWN FILE; ITS TEST IMPORTS A PACKAGE.
    const allowed = check('made-up', aGoodPlugin('made-up', { 'count.ts': "import { z } from 'zod'\nexport function count(rows: readonly unknown[]): number {\n  return z.array(z.unknown()).parse(rows).length\n}\n" }))
    expect(stepOf(allowed.said, 'imports').outcome, stepOf(allowed.said, 'imports').says).toBe('passed')
  }, 300_000)

  it('6. fails a type error on the type check, and a failing test on the tests step', () => {
    const typed = check('made-up', aGoodPlugin('made-up', { 'count.ts': "export function count(rows: readonly unknown[]): number {\n  return 'many'\n}\n" }))
    expect(stepOf(typed.said, 'types')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(typed.said, 'types').says).toMatch(/count\.ts/u)
    const red = check('made-up', aGoodPlugin('made-up', { 'tests/count.test.ts': "import { expect, it } from 'vitest'\nimport { count } from '../count.ts'\nit('counts wrong', () => {\n  expect(count([1])).toBe(2)\n})\n" }))
    expect(stepOf(red.said, 'tests')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(red.said, 'tests').says).toMatch(/counts wrong/u)
    expect(red.code).toBe(1)
  }, 300_000)

  it('7. fails a plugin with no tests, because a check that ran nothing is not a check', () => {
    const { code, said } = check('made-up', aGoodPlugin('made-up', { 'tests/count.test.ts': null }))
    expect(code).toBe(1)
    expect(stepOf(said, 'tests')).toMatchObject({ outcome: 'failed' })
    expect(stepOf(said, 'tests').says).toMatch(/no test/iu)
  }, 150_000)

  it('8. fails an id with no folder, and says so', () => {
    const { code, said } = check('not-here', null)
    expect(code).toBe(1)
    expect(said.passed).toBe(false)
    expect(stepOf(said, 'manifest').says).toMatch(/no folder/u)
  }, 60_000)
})
