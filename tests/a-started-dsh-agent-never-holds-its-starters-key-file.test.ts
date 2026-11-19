// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A DSH AGENT STARTED THROUGH tools/dsh-hooks/run-agent.sh IS GIVEN ITS RUN'S KEY AS A FILE, AND NEVER ITS STARTER'S.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Every node tool an agent runs reads its key from the file MOLE_AGENT_KEY_FILE names, or from MOLE_AGENT_KEY
 * (for-agents/agent-key.mjs), and so do the kit's Python tools. run-agent.sh handed the run's own key on as its value,
 * in MOLE_AGENT_KEY, and it refused only a starter's MOLE_AGENT_KEY. A starter given its key as a file passed that file
 * on: with the run's key beside it every tool the agent ran refused both, and with no run key the agent acted on its
 * starter's key. Now the run's key goes on as a file and no key value is left in the agent's environment.
 * tests/a-started-dsh-agent-never-holds-its-starters-key.test.ts proves the same for a starter's MOLE_AGENT_KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * The real run-agent.sh, against a fake dsh in a scratch dsh folder of this test's own. The fake dsh writes down both
 * variables it was started with, whether any variable holds a key's value, and the key the agent's tools read: the
 * node reader in for-agents/agent-key.mjs and the Python reader in for-agents/send-message.py, each run as it is. The
 * keys are made up here, and no office is reached: the address given is one nothing answers. Every environment is
 * built here, never read off the machine.
 *
 *   1. On the host, the starter's key file and no run key file: nothing is started, and it says why.
 *   2. On the host, the starter's key file and the run's own key file: the agent holds no key value and the run's key
 *      file's name, never the starter's, and both readers read the run's key from it.
 *   3. In a sandbox, the run's own key in MOLE_AGENT_KEY and a key file beside it: nothing is started.
 *   4. A run key file other users may read: nothing is started, in the reader's own words. The words expected are
 *      read from the reader in for-agents/agent-key.mjs, so a change to its sentence changes them here too.
 *   5. A run key file named by a path from the starter's folder: the agent is given its full path.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone, in tools/dsh-hooks/run-agent.sh
 * ---------------------------------------------------------------------------------------
 *
 *   a. The run key file not exported: case 2 goes red, the agent holding the starter's key file, and case 5 on the
 *      path, which is unset.
 *   b. The run's key exported as its value beside the file: cases 2 and 5 go red on the exit, because the settings
 *      step (tools/dsh-hooks/run-settings.mjs) reads the key too and refuses both.
 *   c. The run's key printed on stderr: case 2 goes red on its last check.
 *   d. The refusal of a key file with no run key file taken out: case 1 goes red, an agent started. Case 3 goes red
 *      on the sentence, because the settings step refused both and said only that it could not prepare.
 *   d2. As d, and the settings step not given the file: cases 1 and 3 go red, an agent started.
 *   e. The reader's judgement of the run key file taken out: case 4 goes red on the sentence, because the settings
 *      step refused the file and said only that it could not prepare.
 *   e2. As e, and the settings step not given the file: case 4 goes red, an agent started.
 *   f. The full path not made: case 5 goes red on the exit, the reader refusing a path that is not a full one.
 *   g. The runner ending with exit 3 after the agent ends: cases 2 and 5 go red on their first check.
 *   h. The refusal of a key file with no run key file ending 1: cases 1 and 3 go red on the exit.
 *   i. That refusal's sentence not naming the variable: cases 1 and 3 go red on the sentence.
 *   j. That refusal printing the starter's key: case 1 goes red on the printed key.
 *   k. The reader's refusal ending 1: case 4 goes red on the exit.
 *   l. The reader's sentence replaced by one of the runner's own: case 4 goes red on the sentence.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aSecretFromTheEnvironment, THE_AGENT_KEY } from '../for-agents/agent-key.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')
const AGENT_KEY = join(REPO, 'for-agents', 'agent-key.mjs')
const SEND_MESSAGE = join(REPO, 'for-agents', 'send-message.py')
const UNREACHABLE_API = 'http://127.0.0.1:9'
/** Two made-up keys: the starter's, and the run's own. Neither is a key of any office. */
const THE_STARTERS_KEY = 'c'.repeat(64)
const THE_RUNS_KEY = 'd'.repeat(64)

/** This process's environment without a sandbox, either key variable, an agent's identity or a DeepSeek key. */
function theHostWithout(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const leftOut = ['SANDBOX_DIR', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'DEEPSEEK_API_KEY', 'DSH_PERMISSION_MODE']
  for (const [key, value] of Object.entries(withoutInheritedEffort())) if (!leftOut.includes(key)) out[key] = value
  return out
}

let dir = ''
beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  dir = mkdtempSync(join(REPO, '.cache', 'starters-key-file-'))
})
afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

/** What the fake dsh found: both variables ("unset" when one is not), and what each reader read ("none" for no key). */
interface Held {
  key: string
  file: string
  aValueHoldsAKey: boolean
  read: string
  readByPython: string
}

interface Ran {
  code: number | null
  stderr: string
  /** What the fake dsh found, or null because it never ran. */
  held: Held | null
}

/** The Python reader, run as a tool of the agent's would run it: the key it read, "none", or why it refused. */
const THE_PYTHON_READ = `
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("the_message_script", sys.argv[1])
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)
try:
    key = script.the_agent_key(os.environ, "")
    print("none" if key is None else key)
except ValueError as why:
    print("refused: " + str(why))
`

/** The fake dsh: a node program that writes down what it holds and what both readers read, then ends. */
function theFakeDsh(heldFile: string): string {
  return [
    '#!/usr/bin/env node',
    "const { writeFileSync } = require('node:fs')",
    "const { spawnSync } = require('node:child_process')",
    `const KEYS = ${JSON.stringify([THE_STARTERS_KEY, THE_RUNS_KEY])}`,
    ';(async () => {',
    `  const { theAgentKey } = await import(${JSON.stringify(AGENT_KEY)})`,
    '  let read',
    "  try { read = theAgentKey() ?? 'none' } catch (why) { read = 'refused: ' + why.message }",
    `  const python = spawnSync('python3', ['-B', '-c', ${JSON.stringify(THE_PYTHON_READ)}, ${JSON.stringify(SEND_MESSAGE)}], { encoding: 'utf8', timeout: 20000 })`,
    '  writeFileSync(' + JSON.stringify(heldFile) + ', JSON.stringify({',
    "    key: process.env.MOLE_AGENT_KEY ?? 'unset', file: process.env.MOLE_AGENT_KEY_FILE ?? 'unset',",
    '    aValueHoldsAKey: Object.values(process.env).some((value) => KEYS.some((key) => String(value).includes(key))),',
    "    read, readByPython: python.stdout.trim() || 'python3 printed nothing: ' + python.stderr.trim(),",
    '  }))',
    '})()',
    '',
  ].join('\n')
}

/** Run the real run-agent.sh against the fake dsh, with `env` and the arguments given. */
async function runTheRunner(name: string, env: NodeJS.ProcessEnv, runKeyFile?: string): Promise<Ran> {
  const at = join(dir, name)
  const worktree = join(at, 'a-worktree')
  const brief = join(at, 'the-brief.md')
  const log = join(at, 'the-run.log')
  const dshDir = join(at, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const heldFile = join(at, 'held.json')
  for (const folder of [join(at, 'home'), worktree, bin, join(dshDir, 'home')]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(dshDir, 'env'), '')
  writeFileSync(brief, 'a brief for the key file test\n')
  writeFileSync(log, '')
  writeFileSync(join(bin, 'dsh'), theFakeDsh(heldFile))
  chmodSync(join(bin, 'dsh'), 0o755)

  const args = [RUN_AGENT, worktree, brief, log, 'the-started-agent', 'the-run', 'default', ...(runKeyFile === undefined ? [] : [runKeyFile])]
  const child: ChildProcess = spawn('bash', args, {
    cwd: REPO,
    env: { ...env, HOME: join(at, 'home'), MOLE_OFFICE_AGENT_MODEL: 'deepseek-v4.1-flash', SANDBOX_DSH_NATIVE_READER: syntheticDshReader(at), MOLE_OFFICE_DSH_DIR: dshDir, MOLE_OFFICE_API: UNREACHABLE_API },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
  child.stdout?.resume()
  const code = await new Promise<number | null>((settled) => child.on('close', settled))
  return { code, stderr, held: existsSync(heldFile) ? (JSON.parse(readFileSync(heldFile, 'utf8')) as Held) : null }
}

/** A key file holding `key` and a line end, mode `mode`, as tools/register-a-run.mjs and a starter's setup write one. */
function aKeyFile(name: string, key: string, mode = 0o600): string {
  const path = join(dir, `${name}.key`)
  writeFileSync(path, `${key}\n`, { mode })
  chmodSync(path, mode)
  return path
}

/** The reader's own refusal of the key file at `path`, ending with run-agent.sh's sentence, as run-agent.sh asks it. */
function theReadersRefusal(path: string): string {
  try {
    aSecretFromTheEnvironment(THE_AGENT_KEY, { MOLE_AGENT_KEY_FILE: path }, 'No agent was started.')
  } catch (why) {
    return why instanceof Error ? why.message : String(why)
  }
  return 'the reader refused nothing'
}

describe('a dsh agent started through run-agent.sh is given its run’s key as a file, and never its starter’s', () => {
  it('case 1: on the host, with the starter’s key file and no run key file, starts nothing and says why', async () => {
    const ran = await runTheRunner('no-run-key', { ...theHostWithout(), MOLE_AGENT_KEY_FILE: aKeyFile('the-starters-1', THE_STARTERS_KEY) })

    expect(ran.held, 'an agent was started holding its starter’s key file').toBeNull()
    expect(ran.code).toBe(2)
    expect(ran.stderr).toContain('MOLE_AGENT_KEY_FILE')
    expect(ran.stderr.includes(THE_STARTERS_KEY), 'the key was printed').toBe(false)
  })

  it('case 2: on the host, with the run’s own key file, gives the agent no key value and the file, which its tools read', async () => {
    const starters = aKeyFile('the-starters-2', THE_STARTERS_KEY)
    const runs = aKeyFile('the-runs-2', THE_RUNS_KEY)
    const ran = await runTheRunner('with-run-key', { ...theHostWithout(), MOLE_AGENT_KEY_FILE: starters }, runs)

    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.held).toEqual({ key: 'unset', file: runs, aValueHoldsAKey: false, read: THE_RUNS_KEY, readByPython: THE_RUNS_KEY })
    expect(ran.stderr.includes(THE_RUNS_KEY), 'the key was printed').toBe(false)
  })

  it('case 3: in a sandbox, with the run’s own key and a key file beside it, starts nothing', async () => {
    const sandbox = join(dir, 'an-instance')
    mkdirSync(sandbox, { recursive: true })
    const ran = await runTheRunner('in-a-sandbox', {
      ...theHostWithout(),
      SANDBOX_DIR: sandbox,
      MOLE_AGENT_KEY: THE_RUNS_KEY,
      MOLE_AGENT_KEY_FILE: aKeyFile('the-starters-3', THE_STARTERS_KEY),
      DEEPSEEK_API_KEY: 'not-a-real-provider-key',
    })

    expect(ran.held, 'an agent was started with a key file beside the run’s key').toBeNull()
    expect(ran.code).toBe(2)
    expect(ran.stderr).toContain('MOLE_AGENT_KEY_FILE')
  })

  it('case 4: with a run key file other users may read, starts nothing, in the reader’s own words', async () => {
    const runs = aKeyFile('the-runs-4', THE_RUNS_KEY, 0o644)
    const ran = await runTheRunner('a-readable-file', theHostWithout(), runs)

    expect(ran.held, 'an agent was started with a key file its tools refuse').toBeNull()
    expect(ran.code).toBe(2)
    expect(ran.stderr).toContain(`run-agent.sh: ${theReadersRefusal(runs)}`)
  })

  it('case 5: with a run key file named from the starter’s folder, gives the agent its full path', async () => {
    const runs = aKeyFile('the-runs-5', THE_RUNS_KEY)
    const ran = await runTheRunner('a-path-from-here', theHostWithout(), relative(REPO, runs))

    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.held?.file, 'the agent was given a path its tools refuse').toBe(runs)
  })
})
