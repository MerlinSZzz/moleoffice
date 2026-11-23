// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A failed attempt to run git cannot establish that the inspector changed a checkout, or that it
 * stayed unchanged (problem KnzNaTunRXbT). Run the real tool against a labelled stand-in office and
 * model. A preload changes only the chosen git read's PATH, after assembly or after the model ran;
 * the operating system produces the error. Every folder belongs to this file's fixture.
 *
 * The inspector reads a checkout with the guard of src/config/guarded-git.mjs, so the git command comes after the
 * guard's options and `-C <folder>`. It compares the files with HEAD itself and not with `git status`, which would run
 * a filter the checkout names; `ls-files` is the read that lists the files there, and fails here as status did.
 *
 * Mutation proofs: treating process failures as checkout contents again fails the unreadable cases.
 * Skipping the checkout-change refusal fails both cases where the model adds a file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

const CHECK = aMadeUpCheckSession()
const UNREADABLE = 'This check is not posted, because the checkout could not be read'
const CHANGED = 'This check is not posted, because the inspector changed the work it was checking'
type Fixture = Awaited<ReturnType<typeof inspectorFixture>>

function standInModel(fixture: Fixture, body = '') {
  const bin = join(fixture.home, 'bin')
  mkdirSync(bin)
  const modelRan = join(fixture.home, 'the-model-ran')
  const answer = { result: JSON.stringify({ verdict: 'released', check: 'A verdict this test made up. No model ran.', chaptersRead: [] }) }
  writeFileSync(join(bin, 'claude'), [
    `#!${process.execPath}`,
    '// A stand-in for claude. It runs no model and writes only into this test fixture.',
    "import { writeFileSync, renameSync } from 'node:fs'",
    'process.stdin.resume()',
    "process.stdin.on('end', () => {",
    `  writeFileSync(${JSON.stringify(modelRan)}, 'The stand-in ran.\\n')`,
    body,
    `  process.stdout.write(${JSON.stringify(JSON.stringify(answer))})`,
    '})',
  ].join('\n'))
  chmodSync(join(bin, 'claude'), 0o755)
  return { modelRan, env: { HOME: fixture.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` } }
}

function failOneGitRead(fixture: Fixture, target: string, read: 'rev-parse' | 'ls-files', error: 'ENOENT' | 'EACCES') {
  const bin = join(fixture.home, 'unusable-git')
  mkdirSync(bin)
  if (error === 'EACCES') {
    writeFileSync(join(bin, 'git'), '#!/bin/sh\n# This test file cannot be executed.\n')
    chmodSync(join(bin, 'git'), 0o600)
  }
  const preload = join(fixture.home, 'fail-one-git-read.mjs')
  const triggered = join(fixture.home, 'the-failed-read')
  writeFileSync(preload, [
    '// A test stand-in: restrict PATH only for the selected checkout read.',
    "import childProcess from 'node:child_process'",
    "import { syncBuiltinESMExports } from 'node:module'",
    "import { existsSync, writeFileSync } from 'node:fs'",
    'const run = childProcess.execFileSync',
    'childProcess.execFileSync = (command, args, options) => {',
    "  const from = args.indexOf('-C') < 0 ? args : args.slice(args.indexOf('-C') + 2)",
    "  const asked = from.slice(from.findIndex((one) => !one.startsWith('--')))",
    `  if (command === 'git' && asked[0] === ${JSON.stringify(read)} && options?.cwd === ${JSON.stringify(target)} && existsSync(${JSON.stringify(join(fixture.home, 'fail-git'))})) {`,
    `    writeFileSync(${JSON.stringify(triggered)}, JSON.stringify(asked))`,
    `    return run(command, args, { ...options, env: { ...process.env, ...options.env, PATH: ${JSON.stringify(bin)} } })`,
    '  }',
    '  return run(command, args, options)',
    '}',
    'syncBuiltinESMExports()',
  ].join('\n'))
  return { triggered, NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(preload).href}` }
}

function noVerdictWasPosted(fixture: Fixture) {
  expect(fixture.state.writes.map(({ path }) => path)).toEqual([
    `/api/checks/${fixture.run}/prompt`,
    `/api/checks/${fixture.run}/assembled`,
  ])
}

describe('a check that cannot read a checkout with git', () => {
  it.each([
    { tree: 'check', read: 'rev-parse', error: 'ENOENT', when: 'after' },
    { tree: 'check', read: 'ls-files', error: 'ENOENT', when: 'after' },
    { tree: 'worker', read: 'ls-files', error: 'ENOENT', when: 'after' },
    { tree: 'worker', read: 'ls-files', error: 'EACCES', when: 'after' },
    { tree: 'worker', read: 'ls-files', error: 'ENOENT', when: 'before' },
  ] as const)('refuses $error in $tree $read $when the model without calling it a change', async ({ tree, read, error, when }) => {
    const fixture = await inspectorFixture()
    try {
      const fail = join(fixture.home, 'fail-git')
      const target = tree === 'worker' ? fixture.checkout : fixture.pathFor(CHECK)
      const model = standInModel(fixture, `  writeFileSync(${JSON.stringify(fail)}, 'Fail the next read.\\n')`)
      const { triggered, NODE_OPTIONS } = failOneGitRead(fixture, target, read, error)
      if (when === 'before') fixture.state.onAssembled = async () => { writeFileSync(fail, 'Fail before the model.\n') }
      const ran = await fixture.inspect(['--check', CHECK], { ...model.env, NODE_OPTIONS }, true)
      expect(ran.code, ran.err).toBe(1)
      expect(ran.err).toContain(UNREADABLE)
      expect(ran.err).toContain(target)
      expect(ran.err).toContain(`git could not be run for ${read === 'ls-files' ? 'the files against HEAD' : 'rev-parse HEAD'}`)
      expect(ran.err).toContain(`spawnSync git ${error}`)
      if (error === 'ENOENT') expect(ran.err).toContain('ENOENT can mean git is missing or the checkout folder is missing.')
      expect(ran.err).not.toContain(CHANGED)
      const asked = JSON.parse(readFileSync(triggered, 'utf8')) as string[]
      if (read === 'ls-files') expect(asked.slice(0, 5)).toEqual(['ls-files', '-z', '-t', '--cached', '--others'])
      else expect(asked).toEqual(['rev-parse', 'HEAD'])
      expect(existsSync(model.modelRan)).toBe(when === 'after')
      noVerdictWasPosted(fixture)
    } finally {
      await fixture.close()
    }
  })

  it('says the worker checkout could not be read when its directory disappears', async () => {
    const fixture = await inspectorFixture()
    try {
      const model = standInModel(fixture, `  renameSync(${JSON.stringify(fixture.checkout)}, ${JSON.stringify(join(fixture.home, 'moved-worker'))})`)
      const ran = await fixture.inspect(['--check', CHECK], model.env, true)
      expect(ran.code, ran.err).toBe(1)
      expect(ran.err).toContain(UNREADABLE)
      expect(ran.err).toContain(fixture.checkout)
      expect(ran.err).toContain('spawnSync git ENOENT')
      expect(ran.err).not.toContain(CHANGED)
      expect(existsSync(model.modelRan)).toBe(true)
      noVerdictWasPosted(fixture)
    } finally {
      await fixture.close()
    }
  })

  it.each(['check', 'worker'] as const)('still refuses a real change in the %s checkout with the old words', async (tree) => {
    const fixture = await inspectorFixture()
    try {
      const target = tree === 'worker' ? fixture.checkout : fixture.pathFor(CHECK)
      const added = join(target, 'a-file-the-inspector-added')
      const model = standInModel(fixture, `  writeFileSync(${JSON.stringify(added)}, 'A change made by the stand-in.\\n')`)
      const ran = await fixture.inspect(['--check', CHECK], model.env, true)
      expect(ran.code, ran.err).toBe(1)
      expect(ran.err).toContain(CHANGED)
      expect(ran.err).toContain(tree === 'worker' ? "in the worker's own checkout" : 'in the worktree this check cut')
      expect(ran.err).toContain('a-file-the-inspector-added')
      expect(ran.err).not.toContain(UNREADABLE)
      expect(readFileSync(added, 'utf8')).toContain('A change made by the stand-in.')
      noVerdictWasPosted(fixture)
    } finally {
      await fixture.close()
    }
  })
})
