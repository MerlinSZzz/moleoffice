// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST SEES NONE OF THE AGENT'S ENVIRONMENT, even when the runner is started inside it. Acceptance
 * findings 34 and 44, 23 September 2026: under an agent's own run, tests took the live office's address and
 * the agent's git identity from the environment, went red for it, and wrote into the live office.
 *
 * The first case is what every test file now sees. The second starts the runner itself with an agent's
 * variables set, the way a worker's run starts it, and asks the first case to hold there too: without the
 * setup file it would be green plain and red in an agent's run, which is the whole of finding 34.
 *
 * MUTATION PROOF, 23 September 2026: take tests/a-test-sees-no-agents-environment.ts out of setupFiles, and
 * the second case goes red, the variables reaching the test.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// THE LIST ONLY, never the setup file: importing that would take the variables out itself, and this file
// would pass whether or not the runner ever ran the setup (it did, on its first mutation, 23 September 2026).
import { THE_AGENTS_VARIABLES } from './the-agents-variables.ts'
// The launcher's own name for the sandbox's facts, so that renaming it reaches the case that names it below.
import { THE_FACTS_VARIABLE } from '../tools/sandbox-common.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))

describe("a test sees none of the agent's environment", () => {
  it('runs with no office address, office identity or git identity', () => {
    for (const name of THE_AGENTS_VARIABLES) expect(process.env[name], `${name} reached a test`).toBeUndefined()
  })

  /**
   * BY NAME, NOT THROUGH THE LIST. The case above walks `THE_AGENTS_VARIABLES`, so it follows the list
   * wherever the list goes: taking a name out would take the assertion out with it, and the case would stay
   * green. These two are named here in full, so removing either from the list is a red test.
   *
   * WHY THESE TWO. Claude Code puts them in every shell it starts and they survive `setsid`. A test of the
   * waiter that inherited them would send the RUNNER'S own claude process to the office as the process of
   * the session it is pretending to be, and the office would believe it, because it really is a running
   * claude program. Run this file from a Claude Code shell and both are set outside the runner.
   */
  it('runs with neither claude variable, each named here rather than taken from the list', () => {
    expect(process.env['CLAUDE_PID'], 'CLAUDE_PID reached a test').toBeUndefined()
    expect(process.env['CLAUDE_CODE_SESSION_ID'], 'CLAUDE_CODE_SESSION_ID reached a test').toBeUndefined()
  })

  /**
   * THE ADDRESS'S FOLDER AND THE RUN'S OFFICE TOOL CONFIGURATION, BY NAME TOO (problems JQ3yaANBi1JC and rB33NQrssDEu). A
   * sandbox's command carries MOLE_OFFICE_API_ROOT beside the address, and a test that inherited it would have a copy of
   * the tools it starts in a folder of its own refused by a folder it never named. A Claude Code run's shell carries
   * MOLE_OFFICE_TOOL_CONFIGURATION, and a test that inherited it would send that run's key to its test office. The name
   * begins as the first case's does, so the case below, which runs that name in a runner started with both set, runs
   * this one too.
   */
  it('runs with no office address folder and no run configuration, each named here rather than taken from the list', () => {
    expect(process.env['MOLE_OFFICE_API_ROOT'], 'MOLE_OFFICE_API_ROOT reached a test').toBeUndefined()
    expect(process.env['MOLE_OFFICE_TOOL_CONFIGURATION'], 'MOLE_OFFICE_TOOL_CONFIGURATION reached a test').toBeUndefined()
  })

  /**
   * THE SANDBOX'S FACTS, BY THE LAUNCHER'S OWN NAME (17 October 2026; found by wave 13j's run 4Uywa3xu3C2U). Since wave 13s
   * round 61 the launcher hands every command in a sandbox the sandbox's facts in this variable, and a helper started from
   * inside takes them from there. A runner started inside, a supervisor's shell or the merge suite's, inherited them, and
   * tests/sandbox-launcher.test.ts's "a start given no facts is refused" handed the runner's facts to the helper it started
   * as if from a plain shell, and went red. The name comes from tools/sandbox-common.mjs rather than being written here, so
   * the list is held to the launcher's spelling.
   */
  it("runs with no sandbox facts, the list naming them by the launcher's own name", () => {
    expect(THE_AGENTS_VARIABLES as readonly string[]).toContain(THE_FACTS_VARIABLE)
    expect(process.env[THE_FACTS_VARIABLE], `${THE_FACTS_VARIABLE} reached a test`).toBeUndefined()
  })

  it("holds when the runner itself is started in an agent's environment", () => {
    const agents = { MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_API_ROOT: '/a-sandbox', MOLE_OFFICE_TOOL_CONFIGURATION: '/a-run/office-mcp.json', MOLE_OFFICE_WORKSPACE: 'panelx', MOLE_OFFICE_SESSION: 'a-session', MOLE_OFFICE_AGENT: 'an-agent', GIT_AUTHOR_NAME: 'an-agent', GIT_AUTHOR_EMAIL: 'an-agent@example.invalid', [THE_FACTS_VARIABLE]: '{"container":"another-sandbox"}' }
    const ran = spawnSync(process.execPath, [join(REPO, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/a-test-sees-no-agents-environment.test.ts', '-t', 'runs with no office address'], {
      cwd: REPO, env: { ...process.env, ...agents }, encoding: 'utf8', timeout: 60_000,
    })
    expect(ran.status, `${ran.stdout}\n${ran.stderr}`.slice(-1500)).toBe(0)
  })
})
