// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIST OF THE NAMES A CODEX KEEPS, AND THE ONE FUNCTION THAT KEEPS ONLY THEM.
 *
 * Every Codex start the office makes ends by handing its environment to `theEnvironmentACodexGets` in
 * src/config/the-environment-a-codex-gets.mjs. This file tests the list itself: what it holds, that every name has its
 * reason, that no Claude Code name is on it, and that the two names it holds as words are the words their own modules
 * use. The starts themselves are tested in tests/every-codex-start-gets-only-the-kept-names.test.ts and
 * tests/a-codex-in-a-sandbox-gets-only-the-kept-names.test.ts.
 *
 * Every value here is made up. Nothing is read from this machine's environment.
 */
import { describe, expect, it } from 'vitest'
import { CODEX_OFFICE_MCP_ENV_VARS, FULL_PERMISSIONS, IN_A_SANDBOX, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { THE_NAMES_A_CODEX_KEEPS, theEnvironmentACodexGets, theNamesACodexKeepsOn } from '../src/config/the-environment-a-codex-gets.mjs'
import { THE_CODEX_PROVIDER_VARIABLES } from '../tools/inspector-sandbox.mjs'
import { THE_FACTS_VARIABLE } from '../tools/sandbox-common.mjs'
import { envFor } from '../src/worker/runtimes/adapter.ts'

const linux = theSystemFor('linux')
const windows = theSystemFor('win32')

/** The two planted names every Codex test here and in the start tests carries. Both are made up. */
const PLANTED = { CLAUDE_CODE_MESSAGING_TOKEN: 'planted-not-a-token', A_MADE_UP_SERVICE_API_KEY: 'planted-not-a-key' }

/** What the decision's item 2 keeps on one system, worked out from the modules each group names. */
function whatTheDecisionKeepsOn(system: ReturnType<typeof theSystemFor>): string[] {
  return [
    ...system.aTerminalIsGiven.names,
    'TERM', 'COLORTERM',
    ...CODEX_OFFICE_MCP_ENV_VARS,
    'OPENAI_API_KEY', 'CODEX_API_KEY',
    ...Object.values(THE_CODEX_PROVIDER_VARIABLES),
    IN_A_SANDBOX, OFFICE_TOOL_CONFIGURATION, THE_FACTS_VARIABLE, 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_AGENT_MODEL', 'MOLE_OFFICE_COMMIT_EMAIL',
    ...Object.values(FULL_PERMISSIONS).flatMap((full) => Object.keys(full.env)),
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    'npm_config_nodedir', 'NPM_CONFIG_UPDATE_NOTIFIER', 'PLAYWRIGHT_BROWSERS_PATH',
    'MOLE_OFFICE_HOME_WORLD', 'MOLE_OFFICE_VISIT',
    'BROWSER',
    'SANDBOX_PROCESS_ROW',
  ]
}

describe('the list of the names a Codex keeps', () => {
  it('keeps exactly the names the decision names, on Linux and on Windows, and nothing else', () => {
    for (const system of [linux, windows]) {
      const kept = theNamesACodexKeepsOn(system)
      expect(new Set(kept.names.map((one) => one.name)), system.platform).toEqual(new Set(whatTheDecisionKeepsOn(system)))
      expect(kept.startingWith.map((one) => one.name), system.platform).toEqual([...system.aTerminalIsGiven.startingWith])
    }
  })

  it('reads the names a shell needs from the system, and does not copy them', () => {
    const shells = THE_NAMES_A_CODEX_KEEPS.filter((entry) => 'theSystems' in entry)
    expect(shells).toHaveLength(1)
    expect(shells[0]).toMatchObject({ theSystems: 'aTerminalIsGiven' })
    for (const entry of THE_NAMES_A_CODEX_KEEPS) {
      if (!('names' in entry)) continue
      for (const name of linux.aTerminalIsGiven.names) expect(entry.names, `${name} is copied into "${entry.group}"`).not.toContain(name)
    }
  })

  it('gives every name and every group its reason', () => {
    for (const entry of THE_NAMES_A_CODEX_KEEPS) {
      expect(entry.because.trim().length, JSON.stringify(entry)).toBeGreaterThan(0)
      if ('group' in entry) expect(entry.group.trim().length, JSON.stringify(entry)).toBeGreaterThan(0)
    }
    for (const system of [linux, windows]) {
      const kept = theNamesACodexKeepsOn(system)
      for (const one of [...kept.names, ...kept.startingWith]) expect(one.because.trim().length, one.name).toBeGreaterThan(0)
    }
  })

  it('keeps no Claude Code name, in any spelling', () => {
    for (const system of [linux, windows]) {
      const kept = theNamesACodexKeepsOn(system)
      for (const one of kept.names) {
        expect(one.name.toUpperCase().startsWith('CLAUDE_CODE_'), one.name).toBe(false)
        expect(one.name.toUpperCase(), one.name).not.toBe('CLAUDECODE')
      }
      for (const start of kept.startingWith) {
        for (const name of ['CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDECODE']) expect(name.startsWith(start.name.toUpperCase()), start.name).toBe(false)
      }
    }
  })

  it('holds the provider row names as the words tools/inspector-sandbox.mjs uses', () => {
    const provider = THE_NAMES_A_CODEX_KEEPS.find((entry) => 'names' in entry && entry.names.includes('PROVIDER_ROW_API_KEY'))
    expect(provider).toBeDefined()
    expect(provider && 'names' in provider ? [...provider.names] : []).toEqual(Object.values(THE_CODEX_PROVIDER_VARIABLES))
  })

  it("holds the sandbox's facts name as the word tools/sandbox-common.mjs uses", () => {
    expect(theNamesACodexKeepsOn(linux).names.map((one) => one.name)).toContain(THE_FACTS_VARIABLE)
  })

  /**
   * CRITERION C6: the environment of a run away from home carries its home and its visit. envFor gives a run its office
   * names, and this keeps every one of them through the list, so a name envFor gains that the list does not keep fails here.
   */
  it('keeps every name envFor gives a run away from home', () => {
    const run = {
      cwd: '/made/up/checkout', api: 'http://127.0.0.1:9', workspace: 'made-up-workspace', outputPath: '/made/up/output.txt',
      key: 'made-up-run-key', home: 'aaaaaaaaaaaaaaaa', visit: 'a-made-up-visit',
    }
    const given = envFor(run, {}, {}, 'codex')
    expect(Object.keys(given)).toEqual(expect.arrayContaining(['MOLE_OFFICE_HOME_WORLD', 'MOLE_OFFICE_VISIT']))
    expect(theEnvironmentACodexGets(given, linux)).toEqual(given)
  })
})

describe('the environment a Codex gets', () => {
  it('drops the planted names and every name off the list, and keeps the listed ones with their values', () => {
    const given = {
      ...PLANTED,
      CLAUDECODE: '1',
      SANDBOX_RUN_KEY: 'made-up-run-key',
      HOME: '/made/up/home',
      PATH: '/made/up/bin',
      LC_ALL: 'C',
      OPENAI_API_KEY: 'made-up-openai-key',
      MOLE_AGENT_KEY: 'made-up-agent-key',
      CODEX_HOME: '/made/up/codex-home',
      GIT_AUTHOR_NAME: 'A Made Up Name',
      BROWSER: 'true',
      SANDBOX_PROCESS_ROW: 'a-made-up-row-id',
      NOTHING_HERE: undefined,
    }
    const out = theEnvironmentACodexGets(given, linux)
    expect(out).toEqual({
      HOME: '/made/up/home',
      PATH: '/made/up/bin',
      LC_ALL: 'C',
      OPENAI_API_KEY: 'made-up-openai-key',
      MOLE_AGENT_KEY: 'made-up-agent-key',
      CODEX_HOME: '/made/up/codex-home',
      GIT_AUTHOR_NAME: 'A Made Up Name',
      BROWSER: 'true',
      SANDBOX_PROCESS_ROW: 'a-made-up-row-id',
    })
    expect(out).not.toBe(given)
    expect(Object.keys(given)).toContain('CLAUDE_CODE_MESSAGING_TOKEN')
  })

  it('matches a name in any case on Windows, gives it as the list spells it, and keeps no LC_ name there', () => {
    const out = theEnvironmentACodexGets({
      ...PLANTED,
      claude_code_messaging_token: 'planted-not-a-token',
      Path: 'C:\\made\\up\\bin',
      openai_api_key: 'made-up-openai-key',
      LC_ALL: 'C',
    }, windows)
    expect(out).toEqual({ PATH: 'C:\\made\\up\\bin', OPENAI_API_KEY: 'made-up-openai-key' })
  })

  it('matches a name only in its own case on Linux', () => {
    expect(theEnvironmentACodexGets({ path: '/made/up/bin', openai_api_key: 'made-up-openai-key' }, linux)).toEqual({})
  })
})
