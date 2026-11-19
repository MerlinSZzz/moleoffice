// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A DSH AGENT STARTED THROUGH tools/dsh-hooks/run-agent.sh NEVER HOLDS ITS STARTER'S KEY. Problem bxJ0SwInDFtW
 * (29 September 2026).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * An agent started a dsh supervisor through run-agent.sh from a shell holding its own MOLE_AGENT_KEY, and the key
 * passed through to the agent: the office rightly refused the supervisor's own name with it, and the supervisor then
 * filed two reports and a message as that agent. The secretary: a started agent must never hold its starter's key; run-agent.sh
 * passes only the run's own key (the file tools/register-a-run.mjs --run-key-file wrote) and refuses to start an agent
 * with the starter's key in its environment.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * The real run-agent.sh, against a fake dsh in a scratch dsh folder of this test's own that writes down the
 * MOLE_AGENT_KEY it was started with. The keys are made up here, never the machine's, and no office is reached: the
 * address given is one nothing answers. EVERY ENVIRONMENT IS BUILT HERE, never read off the machine, because the suite
 * also runs inside a sandbox, where SANDBOX_DIR is set for everything.
 *
 *   1. On the host, the starter's key in the environment and no run key file: nothing is started, and it says why.
 *   2. On the host, the starter's key in the environment and the run's own key file: the agent holds no key value,
 *      so never the starter's. It is given the run's key as a file, which
 *      tests/a-started-dsh-agent-never-holds-its-starters-key-file.test.ts reads.
 *   3. On the host, no key and no file: the agent starts with no key, as before.
 *   4. In a sandbox, MOLE_AGENT_KEY is the run's own key, which tools/sandbox-start.mjs put there in place of the
 *      starter's: it is kept.
 *   5. A run key file that is a link, or that holds no key: nothing is started, and it says why.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone, in tools/dsh-hooks/run-agent.sh
 * ---------------------------------------------------------------------------------------
 *
 *   a. The host's refusal taken out: case 1 goes red, the agent started holding the starter's key.
 *   b. The starter's MOLE_AGENT_KEY not taken out beside a run key file: case 2 goes red on its second check. Both
 *      key variables are then set, tools/dsh-hooks/run-settings.mjs prepares no settings, and nothing is started.
 *   c. The refusal asked in a sandbox too: case 4 goes red, nothing started.
 *   d. A run key file that is a link taken as one: case 5 goes red on its words. The agent's own reader still refuses
 *      the link, in its own words, so nothing is started.
 *   e. A run key file taken whatever it holds: case 5 goes red on its words. The agent's own reader still refuses
 *      the file, in its own words, so nothing is started.
 *   f. The run's key exported in MOLE_AGENT_KEY as well as in its file: case 2 goes red on its second check.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')
const UNREACHABLE_API = 'http://127.0.0.1:9'
/** Two made-up keys: the starter's, and the run's own. Neither is a key of any office. */
const THE_STARTERS_KEY = 'a'.repeat(64)
const THE_RUNS_KEY = 'b'.repeat(64)

/** This process's environment without a sandbox, a key, an agent's identity or a DeepSeek key of its own. */
function theHostWithout(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const leftOut = ['SANDBOX_DIR', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'DEEPSEEK_API_KEY', 'DSH_PERMISSION_MODE']
  for (const [key, value] of Object.entries(withoutInheritedEffort())) if (!leftOut.includes(key)) out[key] = value
  return out
}

let dir = ''
beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  dir = mkdtempSync(join(REPO, '.cache', 'starters-key-'))
})
afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

interface Ran {
  code: number | null
  stderr: string
  /** The MOLE_AGENT_KEY the fake dsh was started with ("unset" when none), or null because it never ran. */
  held: string | null
}

/** Run the real run-agent.sh against a fake dsh that writes down the key it holds, with `env` and the arguments given. */
async function runTheRunner(name: string, env: NodeJS.ProcessEnv, runKeyFile?: string): Promise<Ran> {
  const at = join(dir, name)
  const worktree = join(at, 'a-worktree')
  const brief = join(at, 'the-brief.md')
  const log = join(at, 'the-run.log')
  const dshDir = join(at, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const heldFile = join(at, 'held.txt')
  for (const folder of [join(at, 'home'), worktree, bin, join(dshDir, 'home')]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(dshDir, 'env'), '')
  writeFileSync(brief, 'a brief for the key test\n')
  writeFileSync(log, '')
  writeFileSync(join(bin, 'dsh'), ['#!/usr/bin/env bash', `printf '%s' "\${MOLE_AGENT_KEY-unset}" > ${JSON.stringify(heldFile)}`, ''].join('\n'))
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
  return { code, stderr, held: existsSync(heldFile) ? readFileSync(heldFile, 'utf8') : null }
}

/** A run key file as tools/register-a-run.mjs writes one: the key and a line end, mode 0600. */
function aRunKeyFile(name: string, words = `${THE_RUNS_KEY}\n`): string {
  const path = join(dir, `${name}.run-key`)
  writeFileSync(path, words, { mode: 0o600 })
  return path
}

describe('a dsh agent started through run-agent.sh never holds its starter’s key', () => {
  it('on the host, with the starter’s key and no run key file, starts nothing and says why', async () => {
    const ran = await runTheRunner('no-file', { ...theHostWithout(), MOLE_AGENT_KEY: THE_STARTERS_KEY })

    expect(ran.held, 'an agent was started holding its starter’s key').toBeNull()
    expect(ran.code).toBe(2)
    expect(ran.stderr).toContain('MOLE_AGENT_KEY is set, and on the host that is the key of whoever started this')
    expect(ran.stderr).toContain('Nothing was started.')
    expect(ran.stderr.includes(THE_STARTERS_KEY), 'the key was printed').toBe(false)
  })

  it('on the host, with the run’s own key file, gives the agent no key value and never the starter’s', async () => {
    const ran = await runTheRunner('with-file', { ...theHostWithout(), MOLE_AGENT_KEY: THE_STARTERS_KEY }, aRunKeyFile('with-file'))

    expect(ran.held, 'the agent holds its starter’s key').not.toBe(THE_STARTERS_KEY)
    expect(ran.held, 'the run’s key was handed on as its value').toBe('unset')
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.stderr.includes(THE_RUNS_KEY), 'the key was printed').toBe(false)
  })

  it('on the host, with no key and no file, starts the agent with no key, as before', async () => {
    const ran = await runTheRunner('no-key', theHostWithout())

    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.held).toBe('unset')
  })

  it('in a sandbox, keeps the run’s own key the helper put in MOLE_AGENT_KEY', async () => {
    const sandbox = join(dir, 'an-instance')
    mkdirSync(sandbox, { recursive: true })
    const ran = await runTheRunner('in-a-sandbox', {
      ...theHostWithout(),
      SANDBOX_DIR: sandbox,
      MOLE_AGENT_KEY: THE_RUNS_KEY,
      DEEPSEEK_API_KEY: 'not-a-real-provider-key',
    })

    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.held).toBe(THE_RUNS_KEY)
  })

  it('refuses a run key file that is a link, or that holds no key, and starts nothing', async () => {
    const linked = join(dir, 'a-link.run-key')
    symlinkSync(aRunKeyFile('behind-the-link'), linked)
    const throughALink = await runTheRunner('through-a-link', { ...theHostWithout(), MOLE_AGENT_KEY: THE_STARTERS_KEY }, linked)
    expect(throughALink.held, 'an agent was started with a key read through a link').toBeNull()
    expect(throughALink.code).toBe(2)
    expect(throughALink.stderr).toContain('is not a regular file, so no agent was started')

    const noKey = await runTheRunner('no-key-in-it', { ...theHostWithout(), MOLE_AGENT_KEY: THE_STARTERS_KEY }, aRunKeyFile('no-key-in-it', 'not a key\n'))
    expect(noKey.held, 'an agent was started with a file that holds no key').toBeNull()
    expect(noKey.code).toBe(2)
    expect(noKey.stderr).toContain('does not hold one key, so no agent was started')
  })
})
