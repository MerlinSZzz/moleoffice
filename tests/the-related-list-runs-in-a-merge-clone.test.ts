// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELATED LIST WORKS INSIDE A MERGE CLONE, AND THE OFFICE'S OWN PAIRING CHECK STILL REFUSES.
 *
 * The merge queue asks for an entry's related tests with `run-named-tests --list related --print --at-most-half
 * --root <clone>`. It runs that tool from the stable checkout, paired with the development checkout through
 * MOLE_OFFICE_DEVELOPMENT_CHECKOUT, because the tool's start check stops an unpaired start at a dated stable tag. The
 * tool then started the whole-tree list script, tests/the-test-lists.ts, inside the clone with its own environment,
 * the pairing included. The clone's settings refused to load: the development .env names the stable checkout, and
 * the clone is another folder. So the related list never ran in the queue, and every entry kept the whole suite.
 *
 * THE FIXTURE, under the temporary directory, with made-up paths:
 *   - a stable-like checkout: a git repository of this checkout's code and tests as they are on disk, with no .env;
 *   - a development-like checkout: a .git folder and a made-up .env that names the stable-like checkout, a port and a
 *     database, neither of which is opened;
 *   - a merge clone made as the queue makes one: a shared clone of the stable-like checkout, with node_modules linked
 *     and no .env, and one made-up entry commit on top that adds a test file.
 *
 * WHAT IS PROVED, by case:
 *   - the related list: the stable-like checkout's run-named-tests, paired, lists the clone's related tests, with the
 *     queue's own options, and the made-up test file is among them;
 *   - the office's own check: the stable-like checkout's settings take a pairing whose .env names it. They refuse a
 *     pairing whose .env names another checkout, and they refuse the clone named as the development checkout. The
 *     clone's settings refuse the pairing too, so the clone is taken for neither checkout. The clone named as the
 *     development checkout is refused by two rules at once (its folder has no .env, so none names the stable
 *     checkout), so no single-line change turns that row red.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   run-named-tests hands its children the pairing again                → the related list case is red.
 *   settings take a pairing whose .env names another checkout           → the office's own check case is red.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
/** What the stable-like checkout holds: the code, and the tests, which the clone's whole-tree list reads. */
const COPIED = ['src', 'scripts', 'tools', 'for-agents', 'tests', 'package.json', 'tsconfig.json', 'vitest.config.ts']
const THE_PAIRING = 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT'
const A_MADE_UP_TEST = 'a-made-up-entry-adds-this.test.ts'
/**
 * The related walk reads every test file and is bound by the processor. It took 11 s on a quiet machine, and this
 * machine runs three suites at once, so the case gets the hook's budget rather than the thirty seconds of a test that
 * starts something.
 */
const THE_WALKS_BUDGET = 240_000

let root: string, home: string, stable: string, development: string, other: string, clone: string, base: string

function environment(pairing?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  if (pairing !== undefined) env[THE_PAIRING] = pairing
  return env
}

function git(cwd: string, ...args: string[]): string {
  const ran = spawnSync('git', ['-c', 'user.name=Made-up merge clone fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env: environment(), encoding: 'utf8', timeout: 60_000 })
  expect(ran.status, `git ${args.join(' ')}: ${ran.stderr}`).toBe(0)
  return ran.stdout.trim()
}

/** A development-like checkout: a .git folder and a .env that names `stable` as its stable checkout. */
function aDevelopmentCheckout(folder: string, stableNamed: string) {
  mkdirSync(join(folder, 'data'), { recursive: true })
  git(folder, 'init', '--quiet', '-b', 'main')
  writeFileSync(join(folder, '.env'), `MOLE_OFFICE_PORT=1\nMOLE_OFFICE_DB=${join(folder, 'data', 'never-opened.sqlite')}\nMOLE_OFFICE_STABLE_CHECKOUT=${stableNamed}\n`)
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'related-list-in-a-clone-')))
  home = join(root, 'home'); stable = join(root, 'stable'); development = join(root, 'development')
  other = join(root, 'another-development'); clone = join(root, 'merge-clone')
  mkdirSync(home)
  mkdirSync(stable)
  for (const name of COPIED) cpSync(join(SOURCE, name), join(stable, name), { recursive: true })
  git(stable, 'init', '--quiet', '-b', 'main')
  git(stable, 'add', '--', ...COPIED)
  git(stable, 'commit', '--quiet', '-m', 'Made-up main')
  symlinkSync(realpathSync(join(SOURCE, 'node_modules')), join(stable, 'node_modules'))
  aDevelopmentCheckout(development, stable)
  // The queue's clone (tools/merge-tool): shared, checked out after, node_modules linked, no .env.
  git(root, 'clone', '--quiet', '--shared', '--no-checkout', stable, clone)
  git(clone, 'checkout', '--quiet', 'main')
  symlinkSync(realpathSync(join(SOURCE, 'node_modules')), join(clone, 'node_modules'))
  base = git(clone, 'rev-parse', 'HEAD')
  writeFileSync(join(clone, 'tests', A_MADE_UP_TEST), "import { expect, it } from 'vitest'\n\nit('is a made-up entry', () => { expect(true).toBe(true) })\n")
  git(clone, 'add', '--', join('tests', A_MADE_UP_TEST))
  git(clone, 'commit', '--quiet', '-m', 'A made-up entry')
  aDevelopmentCheckout(other, clone)
})

afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

it('the stable checkout\'s run-named-tests, paired, lists the related tests of an entry inside a merge clone', () => {
  const ran = spawnSync(process.execPath, [join(stable, 'tools', 'run-named-tests.mjs'), '--list', 'related', '--print', '--root', clone, '--base', base, '--at-most-half'], {
    cwd: clone, env: environment(development), encoding: 'utf8', timeout: THE_WALKS_BUDGET, maxBuffer: 64 * 1024 * 1024,
  })
  expect(ran.error, String(ran.error)).toBeUndefined()
  expect(ran.status, ran.stderr).toBe(0)
  expect(ran.stdout.split('\n')).toContain(join(clone, 'tests', A_MADE_UP_TEST))
}, THE_WALKS_BUDGET)

/** What `checkout`'s own settings make of `pairing`: the development checkout they take, or the code they refuse with. */
function whatTheSettingsSay(checkout: string, pairing: string): { took: string | null } | { refused: string | null } {
  const script = [
    `try { const settings = await import(${JSON.stringify(join(checkout, 'src', 'config', 'settings.mjs'))})`,
    'console.log(JSON.stringify({ took: settings.THE_DEVELOPMENT_CHECKOUT }))',
    '} catch (error) { console.log(JSON.stringify({ refused: error?.code ?? null })) }',
  ].join('\n')
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: checkout, env: environment(pairing), encoding: 'utf8', timeout: 60_000 })
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout.trim().split('\n').at(-1) ?? 'null') as { took: string | null } | { refused: string | null }
}

it('the office\'s own settings still take only the pairing whose .env names them, and the clone is taken for neither checkout', () => {
  expect(whatTheSettingsSay(stable, development), 'the pairing whose .env names this checkout').toEqual({ took: development })
  expect(whatTheSettingsSay(stable, other), 'a pairing whose .env names another checkout').toEqual({ refused: 'DEVELOPMENT_CHECKOUT_INVALID' })
  expect(whatTheSettingsSay(stable, clone), 'the clone named as the development checkout').toEqual({ refused: 'DEVELOPMENT_CHECKOUT_INVALID' })
  expect(whatTheSettingsSay(clone, development), 'the clone given the stable checkout\'s pairing').toEqual({ refused: 'DEVELOPMENT_CHECKOUT_INVALID' })
})
