// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN OF NAMED TESTS NEVER BECOMES A RUN OF THE WHOLE SUITE.
 *
 * Only the merge queue may run the whole suite, because the machine is shared.
 * On 25 September 2026 it was started by mistake three times (message
 * `gW8q_YsksEFZ`). Twice tools/q.mjs joined its words and handed them to a shell, so a quoted
 * `-t "a pattern"` reached vitest as several words, which it read as file filters (problem
 * `Lu7-0gPjXnvJ`). Once a script built an empty file list, and `vitest run` with no files runs
 * everything.
 *
 * Every vitest run here uses a config of its own over a temporary folder holding two tiny test
 * files, never this checkout's tests/. Each tiny file writes a mark when it starts, so "no test file
 * started" is read from the folder and not from vitest's own words. The config names this
 * checkout's real check, tests/the-whole-suite-is-asked-for-by-name.ts, under `globalSetup`.
 *
 * MUTATION PROOF, 25 September 2026, each alone (the commit message has the logs):
 * - `process.exit(1)` and the sentence taken out of the check: the no-files case goes red.
 * - `MOLE_OFFICE_WHOLE_SUITE=yes` taken out of package.json's "test" script: the queue's case goes red.
 * - `spawn(args.join(' '), { shell: true })` put back into tools/q.mjs: the q.mjs case goes red.
 * - 26 September 2026: tools/q.mjs made to print its command whole again (`shownCommand = command`):
 *   the case of a long command goes red.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import config from '../vitest.config.ts'
import { NO_FILE_NAMED, WHOLE_SUITE_VARIABLE } from './the-whole-suite-is-asked-for-by-name.ts'

const REPO = join(import.meta.dirname, '..')
const VITEST = join(REPO, 'node_modules', 'vitest', 'vitest.mjs')
const CHECK = join(REPO, 'tests', 'the-whole-suite-is-asked-for-by-name.ts')

let folder = ''

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'named-tests-'))
  writeFileSync(
    join(folder, 'vitest.config.mjs'),
    `export default { test: { root: ${JSON.stringify(folder)}, include: ['*.test.ts'], globals: true, globalSetup: [${JSON.stringify(CHECK)}] } }\n`,
  )
  for (const name of ['one', 'two']) {
    writeFileSync(
      join(folder, `${name}.test.ts`),
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(join(folder, `started-${name}`))}, 'yes')\ntest('${name}', () => {})\n`,
    )
  }
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** The environment of this test, without the variable that asks for the whole suite. */
function withoutTheAsk(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env[WHOLE_SUITE_VARIABLE]
  return env
}

/** Runs vitest over the temporary folder with the given words after `run`. */
function vitest(words: string[], env: NodeJS.ProcessEnv) {
  const ran = spawnSync(process.execPath, [VITEST, 'run', '--config', join(folder, 'vitest.config.mjs'), ...words], {
    cwd: folder,
    env,
    encoding: 'utf8',
  })
  return { code: ran.status, said: `${ran.stdout}${ran.stderr}` }
}

function started(): string[] {
  return ['one', 'two'].filter((name) => existsSync(join(folder, `started-${name}`)))
}

describe('a vitest run with no named file', () => {
  it('refuses before any test file starts, and says why in one sentence', () => {
    const run = vitest([], withoutTheAsk())
    expect(run.said).toContain(NO_FILE_NAMED)
    expect(run.code).toBe(1)
    expect(started()).toEqual([])
  })

  it('starts every file when the whole suite is asked for by name', () => {
    const run = vitest([], { ...withoutTheAsk(), [WHOLE_SUITE_VARIABLE]: 'yes' })
    expect(run.code, run.said).toBe(0)
    expect(started()).toEqual(['one', 'two'])
  })

  it("starts every file when run the way the merge queue runs it: npm test's own script, then the queue's flags", () => {
    // npm runs a script with `sh -c` and node_modules/.bin on the PATH. Doing the same here, in the
    // temporary folder, runs package.json's real "test" script without ever reaching this checkout's tests/.
    const script = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts['test']!
    const ran = spawnSync('sh', ['-c', `${script} --config ${JSON.stringify(join(folder, 'vitest.config.mjs'))} --maxWorkers=1 --reporter=default`], {
      cwd: folder,
      env: { ...withoutTheAsk(), PATH: `${join(REPO, 'node_modules', '.bin')}:${process.env['PATH'] ?? ''}` },
      encoding: 'utf8',
    })
    expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
    expect(started()).toEqual(['one', 'two'])
  })

  it("is named in this checkout's own config", () => {
    expect(config.test?.globalSetup).toContain('./tests/the-whole-suite-is-asked-for-by-name.ts')
  })
})

describe('a vitest run with named files', () => {
  it('starts only the file it names', () => {
    const run = vitest(['one'], withoutTheAsk())
    expect(run.code, run.said).toBe(0)
    expect(started()).toEqual(['one'])
  })

  it('lets `vitest list` name the cases of a file, because listing runs no test', () => {
    // In list mode vitest keeps no file filters where the check reads them, so without its own
    // rule for `list` the check refused this named command (found when a worker's list test
    // met this check on the wave branch, 25 September 2026).
    const out = join(folder, 'list.json')
    const ran = spawnSync(
      process.execPath,
      [VITEST, 'list', '--config', join(folder, 'vitest.config.mjs'), `--json=${out}`, 'one'],
      { cwd: folder, env: withoutTheAsk(), encoding: 'utf8' },
    )
    expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
    const listed = JSON.parse(readFileSync(out, 'utf8')) as { name: string }[]
    expect(listed.map((one) => one.name)).toEqual(['one'])
  })

  it('says "No test files found" and exits non-zero when the name matches nothing', () => {
    const run = vitest(['matches-nothing'], withoutTheAsk())
    expect(run.said).toContain('No test files found')
    expect(run.code).not.toBe(0)
    expect(started()).toEqual([])
  })
})

describe('tools/q.mjs', () => {
  it('hands a quoted argument to the program as one argument, read by no shell', () => {
    const print = join(folder, 'print-argv.mjs')
    writeFileSync(print, 'console.log(JSON.stringify(process.argv.slice(2)))\n')
    const ran = spawnSync(process.execPath, [join(REPO, 'tools', 'q.mjs'), process.execPath, print, '-t', 'two words', '$HOME'], {
      cwd: folder,
      encoding: 'utf8',
    })
    expect(ran.status, ran.stdout + ran.stderr).toBe(0)
    expect(ran.stdout).toContain(JSON.stringify(['-t', 'two words', '$HOME']))
  })

  it('cuts a long command on its first line at 300 characters, and says how much it cut', () => {
    // tools/run-named-tests.mjs hands vitest an absolute path for every file, so the whole-tree
    // list makes a command of about 13,000 characters.
    const print = join(folder, 'print-nothing.mjs')
    writeFileSync(print, '\n')
    const long = 'x'.repeat(1000)
    const ran = spawnSync(process.execPath, [join(REPO, 'tools', 'q.mjs'), process.execPath, print, long], {
      cwd: folder,
      encoding: 'utf8',
    })
    expect(ran.status, ran.stdout + ran.stderr).toBe(0)
    const first = ran.stdout.split('\n')[0]!
    const command = `${process.execPath} ${print} ${long}`
    expect(first).toContain(`${command.slice(0, 300)} …(+${command.length - 300} chars)`)
    expect(first).not.toContain(long)
  })
})
