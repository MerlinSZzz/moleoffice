// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The first handoff proves the real settings only after it writes the pairing line. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { fixture } from './stable-bootstrap-step-fixture.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const folders = theFoldersThisFileMakes()
const launcher = new URL('../tools/stable/stable-bootstrap-launcher.mjs', import.meta.url).href
const execution = new URL('../tools/stable/stable-bootstrap-execution.mjs', import.meta.url).href
afterEach(() => folders.removeEveryOne())

function realSettings() {
  const root = folders.make('settings-proof'), dev = join(root, 'development'), stable = join(root, 'stable'), marker = join(root, 'loader-ran')
  mkdirSync(join(dev, '.git'), { recursive: true }); mkdirSync(join(stable, '.git'), { recursive: true })
  copyBootstrapSettings(stable)
  writeFileSync(join(stable, 'package.json'), '{"name":"synthetic-settings-proof","version":"1.0.0"}\n')
  const module = join(stable, 'src/config/settings.mjs')
  writeFileSync(module, readFileSync(module, 'utf8') + `\nimport {writeFileSync as writeLoadedMarker} from 'node:fs';writeLoadedMarker(${JSON.stringify(marker)},'Synthetic loader observation.');\n`)
  const file = join(dev, '.env')
  writeFileSync(file, '# Synthetic original settings.\n', { mode: 0o600 })
  return { dev, stable, marker, file, c: { developmentRepository: dev, stableCheckout: stable } }
}

it('checks the real file without loading stable, then loads it after the pairing line is written', async () => {
  const { verifyBootstrapSettingsSource } = await import(/* @vite-ignore */ launcher)
  const f = realSettings()
  const checked = verifyBootstrapSettingsSource(f.c, { prepared: true })
  expect(checked.fileCheck).toEqual({ found: true, path: f.file })
  expect(checked.resolution).toBeUndefined()
  expect(checked.moduleResolution).toBeUndefined()
  expect(existsSync(f.marker)).toBe(false)
  writeFileSync(f.file, `# Synthetic paired settings.\nMOLE_OFFICE_STABLE_CHECKOUT=${f.stable}\n`)
  const proof = verifyBootstrapSettingsSource(f.c, { prepared: true, paired: true })
  expect(proof.resolution).toEqual({ found: true, path: f.file, dataRoot: f.dev })
  expect(proof.moduleResolution).toEqual({ ENV_FILE: f.file, DATA_ROOT: `${f.dev}/` })
  expect(existsSync(f.marker)).toBe(true)
})

it('prepares with a file check and retains the loader answers only in the pairing journal', async () => {
  const f = await fixture(), result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('published')
  const state = JSON.parse(readFileSync(f.valid.config.prepared.path, 'utf8'))
  expect(state.settingsFileCheck).toEqual({ found: true, path: f.envFile })
  expect(state).not.toHaveProperty('settingsResolution')
  expect(state).not.toHaveProperty('settingsModuleResolution')
  const first = f.settingsChecks.findIndex(check => check.paired)
  expect(first).toBeGreaterThan(0)
  expect(f.settingsChecks.slice(0, first).every(check => !check.line && !check.expectRefusal)).toBe(true)
  expect(f.settingsChecks.filter(check => check.paired).every(check => check.line)).toBe(true)
  expect(f.settingsChecks[first]!.serving).toBeNull()
  const rows = readFileSync(f.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const observed = rows.find(row => row.step === 'pair-development-with-stable' && row.phase === 'observed')
  expect(observed.settingsResolution).toEqual({ found: true, path: f.envFile, dataRoot: f.valid.config.developmentRepository })
  expect(observed.settingsModuleResolution).toEqual({ ENV_FILE: f.envFile, DATA_ROOT: f.valid.config.developmentRepository + '/' })
})

it('restores the settings and original service when the paired loader proof fails after the line', async () => {
  const f = await fixture()
  f.failPairedProof()
  const result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(result.failure).toContain('Synthetic paired loader proof failed after the line.')
  expect(f.settingsChecks.some(check => check.paired && check.line && check.serving === null)).toBe(true)
  expect(readFileSync(f.envFile)).toEqual(f.originalEnv)
  expect(f.serving()).toBe(f.valid.config.developmentRepository)
})

it('proves and records that stable refuses pairing after recovery puts the original file back', async () => {
  const f = await fixture([{ step: 'pair-development-with-stable', phase: 'after' }]), result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('restored')
  const restoredHash = createHash('sha256').update(f.originalEnv).digest('hex')
  const checks = f.settingsChecks.filter(check => check.expectRefusal)
  expect(checks).toHaveLength(1)
  expect(checks[0]).toMatchObject({ line: false, sha256: restoredHash, serving: null })
  const rows = readFileSync(f.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const restored = rows.find(row => row.step === 'restore-development-settings' && row.phase === 'observed')
  expect(restored.settingsRefusal).toEqual({ code: 'DEVELOPMENT_CHECKOUT_INVALID' })
  expect(f.serving()).toBe(f.valid.config.developmentRepository)
})

it('uses the real loader to prove refusal after the pairing line is removed', async () => {
  const { verifyBootstrapSettingsSource } = await import(/* @vite-ignore */ launcher)
  const f = realSettings()
  writeFileSync(f.file, `MOLE_OFFICE_STABLE_CHECKOUT=${f.stable}\n`)
  verifyBootstrapSettingsSource(f.c, { prepared: true, paired: true })
  rmSync(f.marker)
  writeFileSync(f.file, '# Synthetic restored original settings.\n')
  const restored = verifyBootstrapSettingsSource(f.c, { prepared: true, expectRefusal: true })
  expect(restored.refusal).toEqual({ code: 'DEVELOPMENT_CHECKOUT_INVALID' })
  expect(restored.moduleResolution).toBeUndefined()
  expect(existsSync(f.marker)).toBe(false)
})

it('refuses an older prepared state without its separate file check before stopping development', async () => {
  const f = await fixture(), prepared = await f.prepare()
  expect(prepared.state, JSON.stringify(prepared)).toBe('PREPARED')
  const state = JSON.parse(readFileSync(prepared.prepared.path, 'utf8'))
  delete state.settingsFileCheck
  state.settingsResolution = { found: true, path: f.envFile, dataRoot: f.valid.config.developmentRepository }
  const bytes = JSON.stringify(state, null, 2) + '\n'
  writeFileSync(prepared.prepared.path, bytes)
  f.valid.config.prepared = { ...prepared.prepared, sha256Base64: createHash('sha256').update(bytes).digest('base64') }
  const { readPreparedBootstrapState } = await import(/* @vite-ignore */ execution)
  await expect(readPreparedBootstrapState(f.valid.config, f.paths)).rejects.toThrow('This preparation has no settings file check, because an older bootstrap made it. Prepare the handoff again.')
  expect(f.serving()).toBe(f.valid.config.developmentRepository)
  expect(f.events.some(event => event.step === 'stop-original-supervisor')).toBe(false)
})
