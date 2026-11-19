// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ RECORDER NOTES IMPORTS IN ITS OWN THREAD, AND THE SHORTCUT DECIDES AS BEFORE. Under the owner's
 * decision, an entry that changes only documents no test reads lands without the suite, by the record
 * tools/record-what-tests-read.mjs keeps of what the suite read. Round 48 of wave 13j
 * moved its import hook from the loader thread that register() starts into the process's own thread, through
 * registerHooks: that thread cost every process about 35 ms, measured on 10 October 2026. This file holds the
 * two halves of that change.
 *
 * THE SAME RECORD. A program that imports through ESM, through require and from a worker thread is run twice under the
 * recorder: once as it is, and once on a Node without registerHooks, which a preload makes by hiding it, so the recorder
 * takes register() and the loader thread as it did before round 48. Both records hold the same lines, and the merge
 * tool's rule, `theSuiteReads` in src/shared/merge-queue.ts, answers the same for every file of the program.
 *
 * THE ONE THREAD. Run as it is, the recorder starts no loader thread, and so writes no `-imports.txt` file. The other
 * run does write one, which shows that the comparison was made with the old way and not with the new way twice.
 *
 * WHAT THIS CANNOT SEE. On Node 22.23 the module loaders read each file through the fs functions the recorder wraps, so
 * every import here is noted by those wrappers as well, and a hook that noted nothing would leave both records the same:
 * measured on 10 October 2026 with the hook taken out, the program's record did not change. The hook is kept so that
 * imports stay recorded if a Node reads its modules some other way; what this file sees is a hook that writes wrong lines.
 *
 * MUTATION PROOF, 10 October 2026, after a control run, each alone in tools/record-what-tests-read.mjs: the registerHooks
 * hook noting the URL's text instead of the URL, and the first case goes red on seven lines more; register() taken on
 * every Node, and the second case goes red on the `-imports.txt` files.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theSuiteReads } from '../src/shared/merge-queue.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const RECORDER = join(REPO, 'tools', 'record-what-tests-read.mjs')

/** SYNTHETIC: a program that imports four ways, and one file nothing imports. */
const PROGRAM: Record<string, string> = {
  'main.mjs': [
    "import './lib/by-esm.mjs'",
    "import { createRequire } from 'node:module'",
    "import { Worker } from 'node:worker_threads'",
    "createRequire(import.meta.url)('./lib/by-require.cjs')",
    "await new Promise((done) => new Worker(new URL('./lib/a-worker.mjs', import.meta.url)).on('exit', done))",
    '',
  ].join('\n'),
  'lib/by-esm.mjs': 'export {}\n',
  'lib/by-require.cjs': 'module.exports = 1\n',
  'lib/a-worker.mjs': "import './by-the-worker.mjs'\n",
  'lib/by-the-worker.mjs': 'export {}\n',
  'lib/never.mjs': 'export {}\n',
}

/** A preload that makes this Node one without registerHooks, as Node was before 22.15. */
const WITHOUT_REGISTER_HOOKS = [
  "import { createRequire } from 'node:module'",
  "const nodeModule = createRequire(import.meta.url)('node:module')",
  'nodeModule.registerHooks = undefined',
  'nodeModule.syncBuiltinESMExports()',
  '',
].join('\n')

let scratch = ''
let root = ''

interface Run {
  readonly files: readonly string[]
  readonly lines: readonly string[]
}

/** Run the program under the recorder, with any preload before it, and read back every file the record holds. */
function recorded(label: string, preload: string | null): Run {
  const record = join(scratch, `record-${label}`)
  const imports = [...(preload === null ? [] : [`--import=${preload}`]), `--import=${RECORDER}`].join(' ')
  const run = spawnSync(process.execPath, ['main.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, NODE_OPTIONS: imports, TEST_READ_ROOT: root, TEST_READ_RECORD: record },
  })
  expect(run.status, `the program run ${label}: ${run.stderr}`).toBe(0)
  const files = readdirSync(record).sort()
  const lines = [...new Set(files.flatMap((file) => readFileSync(join(record, file), 'utf8').split('\n')).filter((line) => line !== ''))].sort()
  return { files, lines }
}

/** The record as the merge tool folds it for the rule: a read file is an R line. */
const asTheMergeToolKeepsIt = (run: Run) => ({ files: run.lines.filter((line) => line.startsWith('R ')).map((line) => line.slice(2)), folders: [] as string[] })

let threaded: Run
let loaderThread: Run

describe('the read recorder', () => {
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-read-recorder-'))
    root = join(scratch, 'program')
    for (const [path, text] of Object.entries(PROGRAM)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const preload = join(scratch, 'without-register-hooks.mjs')
    writeFileSync(preload, WITHOUT_REGISTER_HOOKS)
    threaded = recorded('in-its-own-thread', null)
    loaderThread = recorded('in-the-loader-thread', preload)
  })

  afterAll(() => {
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  it('records the same lines in its own thread as in the loader thread, so the shortcut decides the same', () => {
    expect(asTheMergeToolKeepsIt(threaded).files).toEqual(expect.arrayContaining(['main.mjs', 'lib/by-esm.mjs', 'lib/by-require.cjs', 'lib/a-worker.mjs', 'lib/by-the-worker.mjs']))
    expect(threaded.lines).toEqual(loaderThread.lines)
    for (const path of Object.keys(PROGRAM)) {
      expect(theSuiteReads(path, asTheMergeToolKeepsIt(threaded)), path).toBe(theSuiteReads(path, asTheMergeToolKeepsIt(loaderThread)))
    }
    expect(theSuiteReads('lib/never.mjs', asTheMergeToolKeepsIt(threaded))).toBe(false)
  })

  it('starts no loader thread where registerHooks is there, and the old way does', () => {
    expect(threaded.files.filter((file) => file.endsWith('-imports.txt'))).toEqual([])
    expect(loaderThread.files.filter((file) => file.endsWith('-imports.txt')).length).toBeGreaterThan(0)
  })
})
