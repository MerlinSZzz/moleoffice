// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VARIABLES AN AGENT'S RUN CARRIES THAT NO TEST MAY INHERIT: the office's address and identity, the
 * git identity of the agent it serves, and the session the runner was started from. Acceptance findings 34
 * and 44, 23 September 2026.
 *
 * THE TWO CLAUDE VARIABLES WERE ADDED ON 24 SEPTEMBER 2026. Claude Code puts `CLAUDE_PID` and
 * `CLAUDE_CODE_SESSION_ID` into every shell it starts, and they survive `setsid`, so a test runner started
 * from a Claude Code shell hands its own claude process and conversation to everything it starts. A test of
 * the waiter would then record the RUNNER'S session as the process of the session it is pretending to be.
 *
 * THE COMMIT ADDRESS WAS ADDED ON 26 SEPTEMBER 2026. The sandbox launcher now hands a run the host's
 * MOLE_OFFICE_COMMIT_EMAIL (problem 9CulCZNdUgiu), and a run's command keeps it, so that a run it starts in turn
 * commits at the same address. A test runner an agent starts would inherit it with the rest.
 *
 * THE RUN'S OFFICE TOOL CONFIGURATION WAS ADDED ON 6 OCTOBER 2026 TOO. The launcher names a Claude Code run's
 * configuration in MOLE_OFFICE_TOOL_CONFIGURATION, and a use line now reads the run's key from it (tools/use-line.mjs): a
 * test inheriting it would send the runner's own run's key to the test's office.
 *
 * THE ADDRESS'S FOLDER WAS ADDED ON 6 OCTOBER 2026. The launcher hands a run MOLE_OFFICE_API_ROOT beside the address
 * (problem JQ3yaANBi1JC): only a git checkout inside that folder takes the address from the environment. A test that
 * starts a copy of the tools in a folder of its own would be refused by a folder it never named.
 *
 * THE SANDBOX'S FACTS WERE ADDED ON 17 OCTOBER 2026. Since wave 13s round 61 the launcher hands every command in a sandbox
 * the sandbox's facts in SANDBOX_FACTS, and a helper started from inside takes them from there. A test runner started
 * inside, a supervisor's shell or the merge suite's, inherited them, and a test that starts the helper as if from a plain
 * shell handed it the runner's facts (found by wave 13j's run 4Uywa3xu3C2U). The name is written here like the others, so
 * that this stays a list; the test that proves it is taken out holds it to tools/sandbox-common.mjs's THE_FACTS_VARIABLE.
 *
 * A list and nothing else, so that importing it changes nothing. The setup file that takes them out is
 * tests/a-test-sees-no-agents-environment.ts; the test that proves it is taken out imports this, never the setup file.
 */
export const THE_AGENTS_VARIABLES = [
  'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_COMMIT_EMAIL',
  'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_TOOL_CONFIGURATION',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'CLAUDE_PID', 'CLAUDE_CODE_SESSION_ID',
  'SANDBOX_FACTS',
] as const
