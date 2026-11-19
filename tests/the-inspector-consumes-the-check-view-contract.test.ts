// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Protocol evidence with synthetic descriptors; no Docker or native protection claim. */
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runInside } from '../tools/inspector-sandbox.mjs'
import { readCheckView } from '../tools/sandbox-common.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'

let f: ReturnType<typeof inspectorViewStandIn> | undefined
afterEach(() => { f?.close(); f = undefined })
const run = () => runInside(f!.sandbox, { label: 'probe', cwd: f!.work, argv: ['true'], limitMs: 1000, launcher: f!.launcher })

it('declares complete private mounts and protected script input, then consumes controller evidence without releasing it twice', async () => {
  f = inspectorViewStandIn()
  const ran = await run()
  expect(ran.started, ran.why ?? '').not.toBeNull()
  expect(ran.code).toBe(0)
  expect(ran.out).toBe('Synthetic command output')
  expect(f.calls).toHaveLength(1)
  const call = f.calls[0]!
  expect(call.words).toContain('--no-office-variables')
  expect(call.words).toContain('--timeout')
  expect(call.spec.private).toEqual([{ host: f.work, container: '/work' }, { host: f.sandbox.home, container: '/check/home' },
    { host: join(f.sandbox.folder, 'check-views', f.sandbox.asked.check, 'tmp'), container: '/check/tmp' }])
  expect(call.spec.readOnly).toEqual([{ host: join(f.sandbox.checkDir, 'records'), container: '/inputs/records' }, { host: join(f.sandbox.checkDir, 'commands'), container: '/inputs/commands' }])
  expect(call.command).toEqual(['sh', '/inputs/commands/probe.sh'])
  const script = readFileSync(join(f.sandbox.checkDir, 'commands', 'probe.sh'), 'utf8')
  expect(script).toContain('exec ')
  expect(script).not.toMatch(/\.(out|err|exit)/)
  expect(readCheckView(call.words[call.words.indexOf('--check-view') + 1]!, { instance: f.sandbox.instance, dir: f.sandbox.folder, cwd: f.work }).spec).toEqual(call.spec)
})

it.each(['instance', 'run', 'cwd', 'command', 'view', 'digest', 'out', 'hostPgid'] as const)('refuses a mismatched descriptor %s and keeps controller evidence', async field => {
  f = inspectorViewStandIn()
  f.changeStart(start => { if (field === 'digest') start.view.sha256 = '0'.repeat(64); else start[field] = field === 'hostPgid' ? -1 : 'wrong' })
  const ran = await run()
  expect(ran.started).toBeNull()
  expect(ran.why).toContain('descriptor')
  expect(existsSync(join(f.sandbox.checkDir, 'outputs', 'command-1', 'receipt'))).toBe(true)
  expect(f.calls).toHaveLength(1)
})

it.each(['check', 'instance', 'started', 'view', 'processRow', 'innerPid', 'out', 'released', 'code'] as const)('refuses a mismatched receipt %s without trusting its verdict output', async field => {
  f = inspectorViewStandIn()
  f.changeReceipt(receipt => { receipt[field] = field === 'started' ? false : 'wrong' })
  const ran = await run()
  expect(ran.code).toBeNull()
  expect(ran.why).toContain('receipt')
  expect(ran.out).toBe('')
  expect(f.calls).toHaveLength(1)
})

it('preserves the controller timeout code and reason', async () => {
  f = inspectorViewStandIn(); f.exit(124)
  const ran = await run()
  expect(ran.code).toBe(124)
  expect(ran.stoppedByTheClock).toBe(true)
  expect(ran.why).toBe('Synthetic timeout reason')
})

it('keeps a startup refusal precise and makes no legacy exec attempt', async () => {
  f = inspectorViewStandIn()
  let count = 0
  const ran = await runInside(f.sandbox, { label: 'probe', cwd: f.work, argv: ['true'], limitMs: 1000,
    launcher: async () => { count++; return { code: 1, stdout: '', stderr: 'Check view refused: synthetic invalid mount.' } } })
  expect(ran.started).toBeNull()
  expect(ran.why).toContain('Check view refused: synthetic invalid mount.')
  expect(count).toBe(1)
})

it('mounts prompt stdin as protected input and preserves its bytes', async () => {
  f = inspectorViewStandIn()
  const prompt = join(f.sandbox.checkDir, 'commands', 'prompt.txt')
  // runInside owns this command directory; a prompt is written by the controller before launch.
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(f.sandbox.checkDir, 'commands'))
  writeFileSync(prompt, 'Measured synthetic prompt\n')
  const ran = await runInside(f.sandbox, { label: 'model', cwd: f.work, argv: ['true'], stdin: prompt as never, limitMs: 1000, launcher: f.launcher })
  expect(ran.code, ran.why ?? '').toBe(0)
  expect(readFileSync(join(f.sandbox.checkDir, 'commands', 'model.sh'), 'utf8')).toContain('/inputs/commands/prompt.txt')
  expect(readFileSync(prompt, 'utf8')).toBe('Measured synthetic prompt\n')
})

it('refuses controller evidence paths whose parent is a symlink', async () => {
  f = inspectorViewStandIn()
  f.changeStart(start => {
    const alias = join(f!.sandbox.checkDir, 'outputs', 'alias')
    symlinkSync(join(f!.sandbox.checkDir, 'outputs', 'command-1'), alias)
    for (const name of ['out', 'err', 'exit', 'receipt', 'details']) start[name] = join(alias, name)
  })
  const ran = await run()
  expect(ran.started).toBeNull()
  expect(ran.why).toContain('descriptor')
})

it.each([
  ['sandbox', ['codex', '-s', 'read-only', '-a', 'never', 'exec']],
  ['approval', ['codex', '-s', 'danger-full-access', '-a', 'on-request', 'exec']],
  ['opaque', ['sh', '-c', 'exec codex -s danger-full-access -a never exec']],
])('B18 refuses model %s before writing wrapper or view and reports no successful check', async (_kind, argv) => {
  f = inspectorViewStandIn()
  const said: string[] = []; f.sandbox.asked.say = (s: string) => { said.push(s) }
  const ran = await runInside(f.sandbox, { label: 'codex', runtime: 'codex', cwd: f.work, argv, limitMs: 1000, launcher: f.launcher })
  expect(ran.started).toBeNull()
  expect(ran.why).toMatch(/Codex.*-s danger-full-access -a never.*before exec/)
  expect(f.calls).toHaveLength(0)
  expect(existsSync(join(f.sandbox.checkDir, 'commands', 'codex.sh'))).toBe(false)
  expect(existsSync(join(f.sandbox.checkDir, 'check-view.json'))).toBe(false)
  expect(said.join(' ')).not.toContain('Codex container argv checked')
})

it.each(['fresh', 'correction', 'resume'])('B18 checks the inspector %s array and records its own evidence', async kind => {
  f = inspectorViewStandIn()
  const said: string[] = []; f.sandbox.asked.say = (s: string) => { said.push(s) }
  const argv = ['env', 'SYNTHETIC=value', 'codex', ...FULL_PERMISSIONS.codex!.args, '-C', '/work', 'exec', '--json',
    '-c', 'model_reasoning_effort=xhigh', '-c', 'service_tier=fast',
    ...(kind === 'fresh' ? [] : ['resume', '01234567-89ab-cdef-0123-456789abcdef']), '-m', 'gpt-6.1-sol', '--', '-']
  const ran = await runInside(f.sandbox, { label: 'codex', runtime: 'codex', cwd: f.work, argv, limitMs: 1000, launcher: f.launcher })
  expect(ran.code, ran.why ?? '').toBe(0)
  expect(said.join(' ')).toContain('Codex container argv checked')
  expect(f.calls).toHaveLength(1)
  expect(readFileSync(join(f.sandbox.checkDir, 'commands', 'codex.sh'), 'utf8')).toContain("'env' 'SYNTHETIC=value' 'codex' '-s' 'danger-full-access' '-a' 'never'")
})

it.each([
  ['probe', ['true'], 'claude-code'], ['build', ['npm', 'run', 'build'], 'claude-code'],
  ['claude', ['claude', '--permission-mode', 'plan', '-p', 'synthetic'], 'claude-code'],
])('B18 leaves %s available without claiming Codex verification', async (label, argv, runtime) => {
  f = inspectorViewStandIn()
  const said: string[] = []; f.sandbox.asked.say = (s: string) => { said.push(s) }
  const ran = await runInside(f.sandbox, { label: label as string, runtime: runtime as string, cwd: f.work, argv: argv as string[], limitMs: 1000, launcher: f.launcher })
  expect(ran.code, ran.why ?? '').toBe(0)
  expect(said.join(' ')).not.toContain('Codex container argv checked')
  expect(readFileSync(join(f.sandbox.checkDir, 'commands', `${label}.sh`), 'utf8')).toContain((argv as string[]).map(s => `'${s}'`).join(' '))
})
