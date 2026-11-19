// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * What a check's own OpenCode carries in its environment: every setting the inspector gives it and the key its model's
 * provider selects (OPENCODE_CHECK_ENV and theSecretNamesOf in tools/inspector-sandbox.mjs). A check runs the tests inside
 * that process, so a test that copied its caller's environment into a child handed these on, and the child could answer
 * differently under a check than for the worker who wrote the test. Kept equal to the inspector's by
 */
export const WHAT_A_CHECKS_OPENCODE_CARRIES = Object.freeze([
  'OPENCODE_PERMISSION', 'OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX', 'XDG_STATE_HOME', 'OPENCODE_API_KEY', 'DEEPSEEK_API_KEY',
])

/**
 * A test's parent effort is not the synthetic runtime's choice, and what a check's own OpenCode carries is not the test's.
 * Explicit test values can be added after this.
 */
export function withoutInheritedEffort(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const own = { ...env }
  delete own['CLAUDE_CODE_EFFORT_LEVEL']
  delete own['CLAUDE_EFFORT']
  for (const name of WHAT_A_CHECKS_OPENCODE_CARRIES) delete own[name]
  return own
}
