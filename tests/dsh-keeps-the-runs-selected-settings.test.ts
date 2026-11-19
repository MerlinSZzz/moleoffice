// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic homes, settings, keys and native program only. No DSH plugin or model is booted. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { syntheticDshReader, CAPTURE_DSH_SELECTION } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { DSH_FEATURES_OFF } from '../tools/harness-features-off.mjs'

const roots: string[] = []
const saved = `agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-pro
  reasoningEffort: low
llm-deepseek:
  reasoningEffort: low
  baseURL: https://synthetic.invalid/deepseek
unrelated: &synthetic-kept
  theme: synthetic-kept-theme
  nested: [one, two]
  infinite: .inf
  negativeInfinite: -.inf
  notANumber: .nan
anchor-copy: *synthetic-kept
`
// The exact start sentence the launcher writes when nothing selected a model, there for both the sandbox handoff and the standalone ask.
const NO_MODEL_WORDS = 'model not named; no Office effort selected; fast mode off; headless DSH starts a fresh native session; Office ancestry is not native resume'
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

async function runDsh({ settings = saved, effort = 'max', model = 'deepseek-v4.1-flash', reader = 'valid', selection = 'sandbox', refuse = false }: { settings?: string | null; effort?: string | null; model?: string | null; reader?: string; selection?: 'sandbox' | 'standalone'; refuse?: boolean } = {}) {
  mkdirSync('.logs', { recursive: true })
  const root = mkdtempSync(join(process.cwd(), '.logs/dsh-selected-')); roots.push(root)
  for (const part of ['home', 'scratch', 'worktree', 'dsh/home', 'dsh/npm/node_modules/.bin']) mkdirSync(join(root, part), { recursive: true })
  const readerPath = syntheticDshReader(root)
  if (reader === 'changed') writeFileSync(readerPath, 'export class FileSettingsProvider {}')
  if (reader === 'missing') rmSync(readerPath)
  if (reader === 'mismatch') writeFileSync(readerPath, readFileSync(readerPath, 'utf8').replace('return result', "if (result['agent-default-model']?.model === 'deepseek-flash') result['agent-default-model'].model = 'synthetic-different-native-model'; return result"))
  const savedFile = join(root, 'dsh/home/settings.yaml')
  if (settings !== null) writeFileSync(savedFile, settings, { mode: 0o600 })
  const brief = join(root, 'brief'); writeFileSync(brief, 'Synthetic task.\nThe final line has no newline.')
  const record = join(root, 'native.json')
  // It imitates the words the real dsh printed when it was handed an effort its model does not support.
  const refusing = refuse
    ? `\nprocess.stderr.write('dsh: UNSUPPORTED_REASONING_EFFORT: provider "deepseek-official" model "deepseek-flash" does not support reasoning effort "' + settings['llm-deepseek'].reasoningEffort + '"\\n')\nprocess.exit(1)\n`
    : ''
  writeFileSync(join(root, 'dsh/npm/node_modules/.bin/dsh'), `#!${process.execPath}
${CAPTURE_DSH_SELECTION}
const fs = require('node:fs'), args = process.argv.slice(2)
const patches = args.flatMap((word, i) => word === '--patch' ? [args[i + 1]] : [])
const file = patches.find(file => file.endsWith('.json') && file !== ${JSON.stringify(DSH_FEATURES_OFF[1])})
let patch, settings, settingsText, mode, patchMode, settingsPath
if (file) { patch = JSON.parse(fs.readFileSync(file, 'utf8')); patchMode = fs.statSync(file).mode & 0o777; settingsPath = patch.find(row => row.id === 'settings').config.path; settingsText = fs.readFileSync(settingsPath, 'utf8'); settings = captureDshSelection(settingsText); mode = fs.statSync(settingsPath).mode & 0o777 }
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, patch, settingsText, settings, settingsPath, mode, patchMode, cwd: process.cwd(), brief: fs.readFileSync(args.at(-1), 'utf8'), run: process.env.MOLE_OFFICE_SESSION, agent: process.env.MOLE_OFFICE_AGENT }))${refusing}
`, { mode: 0o755 })
  const preload = join(root, 'office.mjs')
  writeFileSync(preload, `globalThis.fetch = async (url) => { if (String(url).includes('/run-models/')) throw new Error('A selected effort must not be asked again'); return new Response(JSON.stringify({ record: { id: 'synthetic-brief-note' } }), { status: 201 }) }`)
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), HOME: join(root, 'home'), TMPDIR: join(root, 'scratch'), SANDBOX_DIR: root, MOLE_OFFICE_DSH_DIR: join(root, 'dsh'), MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_AGENT_KEY: 'd'.repeat(64), DEEPSEEK_API_KEY: 'synthetic-key', NODE_OPTIONS: '--import=' + preload,
    SANDBOX_DSH_NATIVE_READER: readerPath, ...(selection === 'standalone' ? {} : { SANDBOX_DSH_SELECTION: JSON.stringify({ runtime: 'dsh', model, effort, requestedEffort: effort, effortFrom: effort === null ? 'none' : 'Casting', words: model === null ? NO_MODEL_WORDS : 'Synthetic selected effort; fresh native session; Office ancestry is not native resume' }) }) }
  if (selection === 'standalone') delete env.SANDBOX_DSH_SELECTION
  if (selection === 'standalone' || model === null) for (const name of ['MOLE_OFFICE_AGENT_MODEL', 'MOLE_OFFICE_INSPECTION_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_EFFORT']) delete env[name]
  const child = spawn('bash', ['tools/dsh-hooks/run-agent.sh', join(root, 'worktree'), brief, join(root, 'dsh.log'), 'synthetic-dsh-agent', 'synthetic-own-run', 'synthetic-workspace'], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk }); child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  return { root, savedFile, code, out, err, log: existsSync(join(root, 'dsh.log')) ? readFileSync(join(root, 'dsh.log'), 'utf8') : '', native: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null }
}

it.each(['off', 'low', 'high', 'max', 'medium', 'xhigh', null])('selected effort %s overlays only present Office values and keeps unrelated settings', async effort => {
  const ran = await runDsh({ effort })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.settings['agent-default-model']).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: effort ?? 'low' })
  expect(ran.native.settings['llm-deepseek']).toEqual({ baseURL: 'https://synthetic.invalid/deepseek', reasoningEffort: effort ?? 'low' })
  expect(ran.native.settingsText).toContain(saved.slice(saved.indexOf('unrelated:')))
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(saved)
  expect(ran.native.mode).toBe(0o600)
  expect(ran.native.patchMode).toBe(0o600)
  expect(ran.native.settingsPath.startsWith(join(ran.root, 'scratch') + '/')).toBe(true)
  expect(ran.native).toMatchObject({ cwd: join(ran.root, 'worktree'), run: 'synthetic-own-run', agent: 'synthetic-dsh-agent', brief: 'Synthetic task.\nThe final line has no newline.' })
  expect(ran.native.args).not.toContain('--model')
  expect(ran.out + ran.err + ran.log).not.toContain('synthetic-kept-theme')
  expect(ran.out + ran.err + ran.log).not.toContain('deepseek-v4-pro')
})

it('missing saved settings uses selected namespaces and says so once', async () => {
  const ran = await runDsh({ settings: null })
  expect(ran.code, ran.err).toBe(0)
  expect(Object.keys(ran.native.settings).sort()).toEqual(['agent-default-model', 'llm-deepseek'])
  expect((ran.out + ran.err).match(/saved DSH settings.*missing/g)).toHaveLength(1)
  expect(existsSync(ran.savedFile)).toBe(false)
})

it('a sandbox handoff with no selected model passes no settings patch, never the start sentence', async () => {
  const ran = await runDsh({ model: null, effort: null })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.args).toEqual(['--profile', 'office', '--patch', join(process.cwd(), 'tools/dsh-hooks/brief-by-path.patch.yml'), ...DSH_FEATURES_OFF, join(ran.root, 'brief')])
  expect(ran.native.args.some((word: string) => word.includes('no Office effort selected'))).toBe(false)
  expect(ran.native.patch).toBeUndefined()
  expect(ran.native.settingsText).toBeUndefined()
  expect(ran.native).toMatchObject({ cwd: join(ran.root, 'worktree'), run: 'synthetic-own-run', agent: 'synthetic-dsh-agent', brief: 'Synthetic task.\nThe final line has no newline.' })
  expect(ran.out + ran.log).toContain(NO_MODEL_WORDS)
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(saved)
})

it('a standalone run with no model setting and no Office answer passes no settings patch, never the start sentence', async () => {
  const ran = await runDsh({ selection: 'standalone' })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.args).toEqual(['--profile', 'office', '--patch', join(process.cwd(), 'tools/dsh-hooks/brief-by-path.patch.yml'), ...DSH_FEATURES_OFF, join(ran.root, 'brief')])
  expect(ran.native.args.some((word: string) => word.includes('no Office effort selected'))).toBe(false)
  expect(ran.native.patch).toBeUndefined()
  expect(ran.native.settingsText).toBeUndefined()
  expect(ran.native).toMatchObject({ cwd: join(ran.root, 'worktree'), run: 'synthetic-own-run', agent: 'synthetic-dsh-agent', brief: 'Synthetic task.\nThe final line has no newline.' })
  expect(ran.out + ran.log).toContain(NO_MODEL_WORDS)
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(saved)
})

it.each(['unrelated: [SYNTHETIC_SECRET_CANARY', '- SYNTHETIC_SECRET_CANARY', 'SYNTHETIC_SECRET_CANARY', 'x: 1\nx: SYNTHETIC_SECRET_CANARY', 'x: 1\n---\nx: SYNTHETIC_SECRET_CANARY'])('unparseable saved settings refuses without contents or a native start (%s)', async settings => {
  const ran = await runDsh({ settings })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('saved DSH settings could not be parsed')
  expect(ran.err).not.toContain(settings)
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(settings)
})

it.each([{ model: 'deepseek-v4-pro' }, { model: 'opencode-go/deepseek-v4.1-flash' }])('an unknown explicit model refuses %j', async selection => {
  const ran = await runDsh(selection)
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err).toMatch(/DSH.*model/)
})

it.each(['--x', 'high\nx', 'high x'])('an effort that is not a plain word (%j) is refused before dsh starts', async effort => {
  const ran = await runDsh({ effort })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err).toContain('DSH was not handed the selected Office effort, because it is not a plain word; nothing was started.')
})

it('an effort dsh refuses is said in dsh\'s own words in the run\'s log, and the run ends with dsh\'s exit', async () => {
  const ran = await runDsh({ effort: 'medium', refuse: true })
  expect(ran.code).toBe(1)
  expect(ran.native.settings['llm-deepseek'].reasoningEffort).toBe('medium')
  expect(ran.log).toContain('dsh: UNSUPPORTED_REASONING_EFFORT: provider "deepseek-official" model "deepseek-flash" does not support reasoning effort "medium"')
  expect(ran.log).toMatch(/=== dsh agent end .* exit 1\n/)
})


it('the established Office provider form uses the same explicit native pair', async () => {
  const ran = await runDsh({ model: 'deepseek/deepseek-v4.1-flash' })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.settings['agent-default-model']).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-flash' })
})

it('no Office effort and no saved effort leaves native effort absent', async () => {
  const ran = await runDsh({ effort: null, settings: 'unrelated: synthetic-held' })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.settings['agent-default-model']).not.toHaveProperty('reasoningEffort')
  expect(ran.native.settings['llm-deepseek']).not.toHaveProperty('reasoningEffort')
})

it('saved disabled thinking conflicts explicitly with selected max before any native start', async () => {
  const ran = await runDsh({ settings: saved + 'llm-extra: SYNTHETIC_SECRET_CANARY\n', effort: 'max' })
  expect(ran.code, ran.err).toBe(0)
  const conflict = await runDsh({ settings: 'llm-deepseek:\n  thinking: disabled\n  unrelated: SYNTHETIC_SECRET_CANARY\n', effort: 'max' })
  expect(conflict.code).not.toBe(0)
  expect(conflict.native).toBeNull()
  expect(conflict.err.trim().split('\n')).toHaveLength(1)
  expect(conflict.err).toContain('thinking is disabled')
  expect(conflict.err + conflict.out + conflict.log).not.toContain('SYNTHETIC_SECRET_CANARY')
})


it.each(['missing', 'changed'])('missing or changed installed validator refuses %s without native start', async reader => {
  const ran = await runDsh({ reader })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('native settings validator')
})

it.each(['agent-default-model: { model: synthetic-flow }\n', 'agent-default-model:\n  model: &selected synthetic-model\n', 'agent-default-model:\n  model: synthetic-model\n    continued-value\n'])('an unusual selected shape refuses without replacing or losing bytes (%s)', async settings => {
  const ran = await runDsh({ settings })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('simple scalar')
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(settings)
})


it('native validator output and warnings never reveal an unrelated secret canary', async () => {
  const tail = '? [SYNTHETIC_NATIVE_DIAGNOSTIC, SYNTHETIC_SECRET_CANARY]\n: synthetic-value\n'
  const ran = await runDsh({ settings: saved + tail })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.settingsText).toContain(tail)
  expect(ran.out + ran.err + ran.log).not.toContain('SYNTHETIC_SECRET_CANARY')
})

it.each(['unrelated: synthetic-value\n...\n', '"agent-default-model":\n  model: synthetic-model\n'])('the edited document is validated before native start (%s)', async settings => {
  const ran = await runDsh({ settings })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(settings)
})

it.each([
  'agent-default-model:\n  model: deepseek-v4-pro#SYNTHETIC_SUFFIX\n',
  'llm-deepseek:\n  reasoningEffort: low#SYNTHETIC_SUFFIX\n',
  'llm-deepseek:\n  reasoningEffort:low\n',
])('an unproved scalar separator refuses before native start (%s)', async settings => {
  const ran = await runDsh({ settings })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('simple scalar')
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(settings)
})

it('spaced inline comments retain their bytes and the exact selected native values', async () => {
  const settings = saved.replace('model: deepseek-v4-pro', 'model: deepseek-v4-pro  # SYNTHETIC_MODEL_COMMENT')
    .replaceAll('reasoningEffort: low', 'reasoningEffort: low \t# SYNTHETIC_EFFORT_COMMENT')
  const ran = await runDsh({ settings })
  expect(ran.code, ran.err).toBe(0)
  expect(ran.native.settings['agent-default-model']).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' })
  expect(ran.native.settings['llm-deepseek'].reasoningEffort).toBe('max')
  expect(ran.native.settingsText).toContain('model: deepseek-flash  # SYNTHETIC_MODEL_COMMENT')
  expect(ran.native.settingsText.match(/ \t# SYNTHETIC_EFFORT_COMMENT/g)).toHaveLength(2)
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(settings)
})


it('valid syntax whose native parsed selection differs refuses before native start', async () => {
  const ran = await runDsh({ reader: 'mismatch' })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('selected native model and effort')
  expect(readFileSync(ran.savedFile, 'utf8')).toBe(saved)
})


it('YAML 1.1 off parsed as boolean refuses instead of changing selected effort semantics', async () => {
  const ran = await runDsh({ settings: '%YAML 1.1\n---\n' + saved, effort: 'off' })
  expect(ran.code).not.toBe(0)
  expect(ran.native).toBeNull()
  expect(ran.err.trim().split('\n')).toHaveLength(1)
  expect(ran.err).toContain('selected native model and effort')
  expect(readFileSync(ran.savedFile, 'utf8')).toBe('%YAML 1.1\n---\n' + saved)
})
