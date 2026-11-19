// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESUMED CODEX ROUND KEEPS office_request. Measured on Codex 0.159.2 in sandbox acc-assets on 13 October 2026: a -c
 * given to the `resume` subcommand makes Codex drop every -c given to exec before it, so the office tool's mcp_servers
 * overrides were lost and the round could not file anything (w13r's UlOAT4HHUK2t and nMtAuX2ex7sH). The same thread
 * called office_request with no -c after resume, and with the effort's -c before resume, and the effort held there too.
 * The commands are built here the way the helper builds them: the start values first, then the office tool.
 * All names, threads and addresses are synthetic; nothing is started.
 */
import { describe, expect, it } from 'vitest'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'
import { aCommandsOfficeTool } from '../src/config/run-permissions.mjs'
import { THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'

const codexIsFast = THE_RUNTIMES_FAST_MODE.codex

const env = {
  MOLE_AGENT_KEY: 'a7'.repeat(32), MOLE_OFFICE_AGENT: 'synthetic-worker', MOLE_OFFICE_SESSION: 'synthetic-session',
  MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://synthetic.invalid',
}
const thread = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const built = (command: string[]) =>
  aCommandsOfficeTool(aCommandsStartValues(command, { runtime: 'codex', model: 'openai/gpt-6.1-sol' }).command, env).command
const configs = (argv: string[]) => argv.flatMap((word, at) => (word === '-c' ? [at] : []))

describe('A resumed Codex round keeps the office tool', () => {
  it('puts every -c of a resumed command before resume, and leaves what follows resume as it was', () => {
    const argv = built(['codex', 'exec', '--json', 'resume', thread, '-m', 'gpt-6.1-sol', '--', 'Synthetic prompt'])
    const resume = argv.indexOf('resume')
    expect(argv).toContain('mcp_servers.mole_office.enabled=true')
    expect(argv).toContain('model_reasoning_effort=xhigh')
    expect(argv.includes('service_tier=fast')).toBe(codexIsFast)
    expect(configs(argv).length).toBeGreaterThan(0)
    for (const at of configs(argv)) expect(at, argv[at + 1]).toBeLessThan(resume)
    expect(argv.slice(resume)).toEqual(['resume', thread, '-m', 'gpt-6.1-sol', '--', 'Synthetic prompt'])
  })

  it('does the same after root options and the exec alias e', () => {
    const argv = built(['/usr/bin/codex', '-s', 'danger-full-access', '-a', 'never', 'e', '--json', 'resume', thread, '--', 'Synthetic prompt'])
    const resume = argv.indexOf('resume')
    expect(argv).toContain('model_reasoning_effort=xhigh')
    for (const at of configs(argv)) expect(at, argv[at + 1]).toBeLessThan(resume)
  })

  it('leaves a new command as it was: the two values before the prompt, even when the prompt says resume', () => {
    for (const prompt of ['Synthetic prompt', 'resume the synthetic work']) {
      const argv = built(['codex', 'exec', '--json', '--', prompt])
      const effort = argv.indexOf('model_reasoning_effort=xhigh')
      expect(argv[effort - 1]).toBe('-c')
      expect(effort).toBeGreaterThan(argv.indexOf('mcp_servers.mole_office.enabled=true'))
      expect(effort).toBeLessThan(argv.indexOf('--'))
      expect(argv.at(-1)).toBe(prompt)
    }
  })

  it('does not take an option’s value named resume for the subcommand', () => {
    const argv = built(['codex', 'exec', '-p', 'resume', '--json', 'resume', thread, '--', 'Synthetic prompt'])
    const resume = argv.lastIndexOf('resume')
    expect(argv[argv.indexOf('-p') + 1]).toBe('resume')
    expect(argv).toContain('model_reasoning_effort=xhigh')
    for (const at of configs(argv)) expect(at, argv[at + 1]).toBeLessThan(resume)
    // The run names its model and the command does not, so the launcher passes -m, where it always has.
    expect(argv.slice(resume)).toEqual(['resume', thread, '-m', 'gpt-6.1-sol', '--', 'Synthetic prompt'])
  })
})
