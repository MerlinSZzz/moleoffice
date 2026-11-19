// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW A RUNTIME'S COMMAND LINE TAKES A REASONING EFFORT, the effort the owner's rule or the run's Casting row gives it.
 *
 * THIS IS NOT WHAT THE RUNTIME PASSES ON OF THE OFFICE'S CHOICE. `whatItPassesOn` in
 * src/worker/runtimes/what-a-runtime-passes-on.ts says which runtimes pass on the effort the office chose, and only
 * opencode does. This table says by which option or setting a runtime's own program is given an effort at all, and
 * Claude Code and Codex are given one here although they pass on none of the office's. The launcher writes the effort
 * this way and refuses a caller's own effort written this way with another value (`aCommandsStartValues` in
 * sandbox-start-values.mjs beside this file), and the opencode adapter writes its default variant this way.
 *
 * `option` is the option the effort follows, `<option> <effort>`. `setting` is the configuration setting the effort is
 * set as, `-c <setting>=<effort>`. Each line has one of the two. `environment` is the variable the program also reads
 * the effort from, which is how a shell-wrapped command that the launcher cannot add an option to still gets it.
 *
 * IT IS JAVASCRIPT, AND IMPORTS NOTHING, because the launcher's file reads it and the session hook loads that file
 * under a Node that cannot read TypeScript. src/worker/runtimes/what-a-runtime-passes-on.ts hands it on, and checks
 * that it has a line for every runtime the office dispatches.
 *
 * EVERY LINE IN IT IS ALSO A LAUNCHER COMMAND, because the launcher writes the effort onto the command by it. A change
 * to a line needs the yes of the launcher's owner, the infrastructure agent, on the exact lines as well.
 */
export const HOW_EACH_COMMAND_TAKES_AN_EFFORT = Object.freeze({
  'claude-code': Object.freeze({ option: '--effort', setting: null, environment: 'CLAUDE_CODE_EFFORT_LEVEL' }),
  codex: Object.freeze({ option: null, setting: 'model_reasoning_effort', environment: null }),
  opencode: Object.freeze({ option: '--variant', setting: null, environment: null }),
  // None: a kimi command names a program the launcher does not start (THE_PROGRAM_A_RUNTIME_RUNS has no kimi), so
  // `aCommandsStartValues` hands it back as it came before it reads this table.
  kimi: null,
})
