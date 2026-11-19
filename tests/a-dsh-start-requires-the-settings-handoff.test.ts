// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Compatibility signals only; native execution is proved by the separate launcher stand-ins. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import * as common from '../tools/sandbox-common.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(stale: string) {
  mkdirSync('.logs', { recursive: true })
  const root = mkdtempSync(join(process.cwd(), '.logs/dsh-handoff-')); roots.push(root)
  mkdirSync(join(root, 'dsh-hooks'))
  const helper = join(root, 'sandbox-start.mjs')
  writeFileSync(helper, stale === 'helper' ? "// old valid helper accepts 'filed' but does not apply selection\n" : '// SANDBOX_DSH_SELECTION prepareDshSettings\n')
  writeFileSync(join(root, 'dsh-hooks/run-agent.sh'), stale === 'runner' ? '#!/bin/bash\nexit 0\n' : '#!/bin/bash\n# run-settings.mjs "${settings_args[@]}"\n')
  writeFileSync(join(root, 'dsh-hooks/run-settings.mjs'), stale === 'settings' ? 'export function prepareDshSettings() {}\n' : '// prepareDshSettings theNativeValidator SANDBOX_DSH_SELECTION\n')
  return helper
}
const check = (helper: string, command: string[] | null, runtime: string) => (common as any).theDshHandoffIsCurrent(helper, command, runtime)
it.each(['helper', 'runner', 'settings'])('headless DSH refuses a stale %s component', stale => {
  expect(() => check(fixture(stale), null, 'dsh')).toThrow(/DSH.*handoff.*Nothing was filed or started/)
})
it.each(['helper', 'settings'])('direct native DSH refuses a stale %s component', stale => {
  expect(() => check(fixture(stale), ['dsh', '--profile', 'office'], 'dsh')).toThrow(/DSH.*handoff/)
})
it('an env-wrapped native DSH command still requires its handoff', () => {
  expect(() => check(fixture('helper'), ['env', 'SYNTHETIC=1', 'dsh', '--profile', 'office'], 'dsh')).toThrow(/DSH.*handoff/)
})
it.each([
  { stale: 'none', command: null, runtime: 'dsh' },
  { stale: 'runner', command: ['dsh', '--profile', 'office'], runtime: 'dsh' },
  { stale: 'helper', command: ['true'], runtime: 'dsh' },
  { stale: 'helper', command: ['claude', '-p', 'Synthetic task'], runtime: 'claude-code' },
  { stale: 'helper', command: ['codex', 'exec', '--', 'Synthetic task'], runtime: 'codex' },
])('compatible or independent start keeps its existing path: %j', ({ stale, command, runtime }) => {
  expect(() => check(fixture(stale), command, runtime)).not.toThrow()
})

// A SELECTED DSH START FROM A BRIEF is the helper's own runner, tools/dsh-hooks/run-agent.sh, which hands the selection
// to dsh's settings. A Casting row with native data gives such a selection, and the runner was refused as "a shell
// command" while the same command without a selection was given the handoff. Any other shell is still refused.
// MUTATION: the selected path in aCommandsStartValues no longer knows the runner → the first case is refused.
const SELECTED_DSH = { runtime: 'dsh', model: 'deepseek/made-up-model', native: { model: 'made-up-model', provider: 'deepseek-official', variant: null, effort: null }, casting: { id: 1, revision: 'made-up-revision' } }
const THE_RUNNER = join(process.cwd(), 'tools/dsh-hooks/run-agent.sh')
it('a selected dsh start from a brief hands its selection to the runner and keeps the runner as its command', () => {
  const command = ['bash', THE_RUNNER, '/made-up/worktree', '/made-up/brief.md', '/made-up/dsh.log', 'made-up-agent', 'made-up-run', 'made-up-workspace']
  const given = (common as any).aCommandsStartValues(command, { runtime: 'dsh', model: SELECTED_DSH.model, selection: SELECTED_DSH })
  expect(given.command).toEqual(command)
  expect(JSON.parse(given.env.SANDBOX_DSH_SELECTION).selection).toEqual(SELECTED_DSH)
  expect(given.start.words).toContain('native model made-up-model on provider deepseek-official')
})
it.each([
  ['bash', '-c', 'dsh'],
  ['bash', join(process.cwd(), 'tools/dsh-hooks/run-settings.mjs')],
  ['sh', THE_RUNNER],
])('a selected dsh start through any other shell is still refused: %j', (...command) => {
  expect(() => (common as any).aCommandsStartValues(command, { runtime: 'dsh', model: SELECTED_DSH.model, selection: SELECTED_DSH })).toThrow(/A shell command cannot carry/)
})
it('a selection for another runtime is not given to the dsh runner', () => {
  const opencode = { ...SELECTED_DSH, runtime: 'opencode', model: 'opencode-go/made-up-model', native: { ...SELECTED_DSH.native, provider: 'opencode-go' } }
  expect(() => (common as any).aCommandsStartValues(['bash', THE_RUNNER, 'w', 'b', 'l', 'a', 'r', 'ws'], { runtime: 'opencode', model: opencode.model, selection: opencode })).toThrow(/A shell command cannot carry/)
})
