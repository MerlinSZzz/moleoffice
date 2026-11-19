// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A CHECK RUN ON THE HOST GIVES ITS MODEL NO KEY AND NONE OF THE OFFICE'S VARIABLES, AS THE SANDBOX DOES.
 *
 * Problem YjMHEkMQkjAX, from wave 13n's sweep of the tools that call the office (report hkB1Wn5eZr-z, block b-7). The
 * check tool spawned its model on the host with its caller's whole environment, so a caller's MOLE_AGENT_KEY, a run key
 * or the office's address would have reached a model that runs untrusted tests. In the sandbox the helper keeps the
 * office's variables out of every command (--no-office-variables), and no key goes into a container.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. The model is a stand-in claude on PATH, which runs no model: it writes down the names, never
 * the values, of the variables it was given, and answers a release. Every key here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED: the caller's environment handed on whole again, and the case goes red on
 * MOLE_AGENT_KEY.
 * Problem q6BY2bnyuHV3: the host path back to the fixed list alone turns
 * "takes out the same office names on the host and with --no-office-variables" red on MOLE_OFFICE_ANYTHING.
 * That case runs the real sandbox helper with a labelled stand-in instance and a prewritten handshake row; no office
 * request or container is needed. Both paths start with the same environment.
 * Giving the isolated run's leftOut its own regular expression again, without MOLE_OFFICE_, turns
 * "leaves out the same names in an isolated run, on the host and in the sandbox helper" red on MOLE_OFFICE_ANYTHING.
 * That case calls the real exported leftOut, host environment and sandbox removal functions with synthetic values.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { leftOut, takeOutTheOfficesVariables, THE_FACTS_VARIABLE, theFactsAStartIsGiven, THE_OFFICES_VARIABLES } from '../tools/sandbox-common.mjs'
import { theModelsEnvironmentOnTheHost } from '../tools/inspector-sandbox.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const AGENT_KEY = 'synthetic-agent-key-not-a-real-one'
const RUN_KEY = 'synthetic-run-key-not-a-real-one'
const CLAUDE_TOKEN = 'synthetic-claude-token-not-a-real-one'

/** A stand-in for claude that writes down the names of what it was given, and answers a release. */
function standInModel(home: string): { bin: string; seen: string } {
  const bin = join(home, 'bin')
  mkdirSync(bin)
  const seen = join(home, 'what-the-model-was-given.json')
  const answer = { result: JSON.stringify({ verdict: 'released', check: 'A verdict this test made up. No model ran.', chaptersRead: [] }) }
  writeFileSync(
    join(bin, 'claude'),
    [
      `#!${process.execPath}`,
      '// A stand-in for claude, written by a test. It runs no model, and writes down only the names of what it was given.',
      "import { writeFileSync } from 'node:fs'",
      'process.stdin.resume()',
      "process.stdin.on('end', () => {",
      `  writeFileSync(${JSON.stringify(seen)}, JSON.stringify(Object.keys(process.env).sort()))`,
      `  process.stdout.write(${JSON.stringify(JSON.stringify(answer))})`,
      '})',
    ].join('\n'),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  return { bin, seen }
}

describe('a check run on the host', () => {
  it('takes out the same office names on the host and with --no-office-variables', async () => {
    fixture = await inspectorFixture()
    const instance = join(fixture.home, 'stand-in-instance')
    const handshake = join(instance, 'handshake')
    mkdirSync(handshake, { recursive: true })
    // A STAND-IN INSTANCE AND ROW, not a container or a real ledger entry. The helper's handshake avoids any API call.
    // The helper is given the instance's facts as the launcher on the host gives them, in its environment.
    const facts = { instance: 'stand-in', template: 'stand-in', containerRow: 'stand-in-container' }
    writeFileSync(join(instance, 'instance.json'), JSON.stringify(facts))
    writeFileSync(join(handshake, 'row.json'), JSON.stringify({ id: 'stand-in-process' }))
    const env = {
      ...withoutInheritedEffort(),
      [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts),
      HOME: fixture.home,
      MOLE_OFFICE_ANYTHING: '1',
      MOLE_OFFICE_WORKSPACE: 'panelx',
      GIT_AUTHOR_NAME: 'stand-in author',
      CLAUDE_CODE_OAUTH_TOKEN: CLAUDE_TOKEN,
    }
    const inTheSandbox = (flags: string[]): string[] => JSON.parse(execFileSync(process.execPath, [
      join(process.cwd(), 'tools/sandbox-start.mjs'), '--instance', instance, '--cwd', instance,
      '--as', 'stand-in-starter', '--session', 'stand-in-session', '--workspace', 'panelx', '--api', 'http://127.0.0.1:1',
      '--handshake', handshake, '--wait', '--timeout', '5', ...flags, '--', process.execPath,
      '-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))',
    ], { env: withAPrivateTmpToSweep(env, instance), encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] })) as string[]

    const ordinary = inTheSandbox([])
    for (const name of ['MOLE_OFFICE_ANYTHING', 'MOLE_OFFICE_WORKSPACE']) expect(ordinary).toContain(name)
    const sandboxNames = inTheSandbox(['--no-office-variables'])
    const hostNames = Object.keys(theModelsEnvironmentOnTheHost(env))
    const officeNames = ['MOLE_OFFICE_ANYTHING', ...THE_OFFICES_VARIABLES].filter((name) => name in env)
    const removed = (names: string[]) => officeNames.filter((name) => !names.includes(name)).sort()
    expect(removed(hostNames)).toEqual(officeNames.sort())
    expect(removed(sandboxNames)).toEqual(removed(hostNames))
    for (const names of [hostNames, sandboxNames]) {
      for (const name of ['HOME', 'PATH', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(names).toContain(name)
    }
    expect(env.MOLE_OFFICE_ANYTHING).toBe('1')
  })

  it('leaves out the same names in an isolated run, on the host and in the sandbox helper', () => {
    const officeNames = [
      'MOLE_OFFICE_ANYTHING', 'MOLE_OFFICE_READ_API', 'MOLE_OFFICE_',
      'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION',
      'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_COMMIT_EMAIL', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE',
      'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    ]
    const keys = ['SANDBOX_RUN_KEY']
    const keptNames = [
      'HOME', 'PATH', 'CLAUDE_CODE_OAUTH_TOKEN', 'SANDBOX_DIR', 'MOLE_OFFICE', 'X_MOLE_OFFICE_API',
      'mole_office_API', 'GIT_AUTHOR_NAME_EXTRA', 'GIT_AUTHOR', 'MOLE_AGENT_KEY_EXTRA', 'SANDBOX_RUN_KEY_EXTRA',
    ]
    const env = Object.fromEntries([...officeNames, ...keys, ...keptNames].map((name) => [name, 'synthetic=value']))
    const helperEnv = { ...env }
    takeOutTheOfficesVariables(helperEnv)
    const hostEnv = theModelsEnvironmentOnTheHost(env)
    for (const name of Object.keys(env)) {
      const office = officeNames.includes(name)
      const forbidden = office || keys.includes(name)
      expect(name in helperEnv, `sandbox helper: ${name}`).toBe(!office)
      expect(name in hostEnv, `host model: ${name}`).toBe(!forbidden)
      for (const value of ['', env[name]!]) {
        expect(leftOut(`${name}=${value}`), `isolated run: ${name}`).toBe(forbidden)
        expect(leftOut(`${name}=${value}`), `isolated run and host: ${name}`).toBe(!(name in hostEnv))
        if (!keys.includes(name)) {
          expect(leftOut(`${name}=${value}`), `isolated run and helper: ${name}`).toBe(!(name in helperEnv))
        }
      }
    }
    expect(Object.keys(env)).toHaveLength(officeNames.length + keys.length + keptNames.length)
  })

  it("hands its model the caller's environment less the office's variables and every key", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const model = standInModel(f.home)
    // THE CALLER HOLDS AN AGENT'S KEY, A RUN'S KEY AND THE OFFICE'S VARIABLES, each naming what the flags already name.
    const ran = await f.inspect(
      ['--check', aMadeUpCheckSession()],
      {
        HOME: f.home,
        PATH: `${model.bin}:${process.env['PATH'] ?? ''}`,
        MOLE_AGENT_KEY: AGENT_KEY,
        SANDBOX_RUN_KEY: RUN_KEY,
        MOLE_OFFICE_AGENT: 'fixture-inspector',
        MOLE_OFFICE_WORKSPACE: 'panelx',
        MOLE_OFFICE_COMMIT_EMAIL: 'agents@example.test',
        GIT_AUTHOR_NAME: 'somebody',
        CLAUDE_CODE_OAUTH_TOKEN: CLAUDE_TOKEN,
      },
      true,
    )
    expect(existsSync(model.seen), `the model never ran:\n${ran.err}`).toBe(true)
    const given = JSON.parse(readFileSync(model.seen, 'utf8')) as string[]
    for (const name of ['MOLE_AGENT_KEY', 'SANDBOX_RUN_KEY', ...THE_OFFICES_VARIABLES]) expect(given, `the model was given ${name}`).not.toContain(name)
    // ITS OWN LOGIN STAYS: its home, its path, and a Claude token where one is set.
    for (const name of ['HOME', 'PATH', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(given, `the model was not given ${name}`).toContain(name)
    // AND NO VALUE OF A KEY WAS PRINTED.
    for (const secret of [AGENT_KEY, RUN_KEY, CLAUDE_TOKEN]) expect(`${ran.out}${ran.err}`).not.toContain(secret)
  })
})
