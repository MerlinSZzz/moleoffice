// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLOUD-SUITE DOOR GETS THE MERGE TOOL'S OWN ENVIRONMENT, AND NEITHER OF ITS TWO SETTINGS FROM THE OFFICE.
 *
 * The door, tools/cloud-suite.mjs, reads MOLE_OFFICE_CLOUD_RUNNER_FILE and MOLE_OFFICE_CLOUD_TRANSPORT only from the
 * environment it was started with. The office's .env is not a source for either. The merge tool starts the door, in
 * tools/merge-tool/testing.mjs through tools/merge-tool/cloud-suite-door.mjs. So what the door gets is decided in
 * two places, and this file pins each of them:
 *   1. the merge tool hands the door its own environment unchanged, through cleanEnvironment in
 *      tools/merge-tool/git.mjs, and testing.mjs's door call adds nothing to it;
 *   2. the worker starts the merge tool with neither setting, even when the worker's own environment has them
 *      (envFor in src/worker/runtimes/adapter.ts).
 * Everything here is synthetic: the two values, the folders and the stand-in door. No change to the code came with it.
 * MUTATION PROOFS: kept with the round's report.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withoutComments } from '../src/config/import-graph.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { MERGE_TOOL_RUNTIME } from '../src/shared/merge-queue.ts'
import { envFor } from '../src/worker/runtimes/adapter.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** Named through their declarations, so this file fails at import if either is no longer declared. */
const RUNNER_FILE = settingNamed('MOLE_OFFICE_CLOUD_RUNNER_FILE').name
const TRANSPORT = settingNamed('MOLE_OFFICE_CLOUD_TRANSPORT').name

let scratch: string

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'cloud-suite-door-environment-'))
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * WHAT A STAND-IN DOOR WAS GIVEN, when the merge tool's own environment is `env`. The
 * stand-in tool is a separate process started with the merge tool's arguments, so tools/merge-tool/git.mjs loads as it
 * does in a real run. It starts the stand-in door the way testing.mjs's door call does: git.mjs's `run`, with
 * `env: cleanEnvironment()`. The door writes down the two values it found, or null for one it did not.
 */
function whatTheDoorWasGiven(label: string, env: NodeJS.ProcessEnv): { runnerFile: string | null; transport: string | null } {
  const at = join(scratch, label)
  mkdirSync(at)
  const door = join(at, 'door.mjs')
  const said = join(at, 'the-door-was-given.json')
  writeFileSync(
    door,
    "import { writeFileSync } from 'node:fs'\n" +
      `writeFileSync(process.argv[2], JSON.stringify({ runnerFile: process.env[${JSON.stringify(RUNNER_FILE)}] ?? null, transport: process.env[${JSON.stringify(TRANSPORT)}] ?? null }))\n`,
  )
  const tool = join(at, 'the-merge-tool.mjs')
  writeFileSync(
    tool,
    `const { cleanEnvironment, run } = await import(${JSON.stringify(pathToFileURL(join(REPO, 'tools', 'merge-tool', 'git.mjs')).href)})\n` +
      `const called = await run('door', process.execPath, [${JSON.stringify(door)}, ${JSON.stringify(said)}], { cwd: ${JSON.stringify(at)}, timeoutMs: 60000, env: cleanEnvironment() })\n` +
      'if (called.code !== 0) { process.stderr.write(`the stand-in door ended with ${JSON.stringify(called)}\\n`); process.exit(1) }\n',
  )
  execFileSync(
    process.execPath,
    [
      tool, '--entry', 'a-synthetic-entry', '--session', 'a-synthetic-session', '--api', 'http://127.0.0.1:9',
      '--workspace', 'a-synthetic-workspace', '--workdir', join(at, 'workdir'), '--sandboxes', at,
    ],
    { cwd: REPO, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 },
  )
  return JSON.parse(readFileSync(said, 'utf8')) as { runnerFile: string | null; transport: string | null }
}

describe('the cloud-suite door gets the merge tool\'s own environment', () => {
  it('hands both settings to the door unchanged when the merge tool\'s own environment names them, and neither when it does not', () => {
    const runnerFile = join(scratch, 'a-synthetic-runner.env')
    const transport = join(scratch, 'a-synthetic-transport')
    expect(whatTheDoorWasGiven('named', { ...process.env, [RUNNER_FILE]: runnerFile, [TRANSPORT]: transport })).toEqual({ runnerFile, transport })
    const { [RUNNER_FILE]: _runnerFile, [TRANSPORT]: _transport, ...withNeither } = process.env
    expect(whatTheDoorWasGiven('not-named', withNeither)).toEqual({ runnerFile: null, transport: null })
  })

  it('starts the door with the run that takes cleanEnvironment(), and adds nothing to it', () => {
    const testing = withoutComments(readFileSync(join(REPO, 'tools', 'merge-tool', 'testing.mjs'), 'utf8'))
    const retainedCalls = [...testing.matchAll(/runRetainedSuite\(\{([\s\S]*?)\n\s*\}\)/gu)].map((match) => match[1] ?? '')
    expect(retainedCalls, 'testing.mjs starts the retained suite in one place').toHaveLength(1)
    const retained = retainedCalls[0] ?? ''
    expect(retained).toMatch(/^\s*door: THE_CLOUD_SUITE_DOOR,$/mu)
    const runs = retained.split('\n').filter((line) => /^\s*run:/u.test(line))
    expect(runs).toEqual(['        run: (name, program, words, options) => run(name, program, words, { ...options, env: cleanEnvironment() }),'])

    const attempt = withoutComments(readFileSync(join(REPO, 'tools', 'merge-tool', 'suite-attempt.mjs'), 'utf8'))
    const calls = [...attempt.matchAll(/aSuiteOnTheBoxOrHere\(\{([\s\S]*?)\n\s*\}\)/gu)].map((match) => match[1] ?? '')
    expect(calls, 'suite-attempt.mjs starts the cloud-suite door in one place').toHaveLength(1)
    const call = calls[0] ?? ''
    expect(call).toMatch(/^\s*run: async \(\.\.\.args\) => \{$/mu)
    expect(call, 'the door gets the run the tool was given, and no second environment').not.toMatch(/^\s*env:/mu)
  })

  it('is started by the worker with neither setting, even when the worker\'s environment has them', () => {
    const elsewhere = mkdtempSync(join(scratch, 'a-paired-checkout-'))
    const run = { cwd: REPO, api: 'http://127.0.0.1:9', workspace: 'a-synthetic-workspace', outputPath: join(scratch, 'output.txt') }
    const worker = { PATH: process.env['PATH'] ?? '', [RUNNER_FILE]: join(scratch, 'a-runner.env'), [TRANSPORT]: join(scratch, 'a-transport') }
    for (const from of [worker, { ...worker, MOLE_OFFICE_DEVELOPMENT_CHECKOUT: elsewhere }]) {
      const given = envFor(run, from, {}, MERGE_TOOL_RUNTIME)
      expect(given['MOLE_OFFICE_API']).toBe(run.api)
      expect(Object.keys(given).filter((name) => name === RUNNER_FILE || name === TRANSPORT)).toEqual([])
    }
  })
})
