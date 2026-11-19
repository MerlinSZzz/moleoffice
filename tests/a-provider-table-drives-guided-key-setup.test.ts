// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { customKey } from '../src/config/provider-setup/custom-key.mjs'
import { keyFileFor } from '../src/server/lib/provider-key-setup.ts'
import { copyTheFilesTheGuidedCommandsRead } from './the-files-the-guided-commands-read.ts'

const roots: string[] = []
const invented = 'trial_FAKE_VALUE_84209_EXAMPLE'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'provider-table-test-'))
  roots.push(root)
  const home = join(root, 'home'), tools = join(root, 'tools', 'key-setup')
  const table = join(root, 'src', 'config', 'provider-setup')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(join(root, 'tools'), { recursive: true })
  mkdirSync(join(root, 'src', 'config'), { recursive: true })
  cpSync(resolve('tools/key-setup'), tools, { recursive: true })
  copyTheFilesTheGuidedCommandsRead(resolve('.'), root)
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, KEY_SETUP_NODE: process.execPath, KEY_SETUP_LANG: 'en' }
  return { root, home, tools, table, env }
}
function run(f: ReturnType<typeof fixture>, args: string[], input = '', extra: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('bash', [join(f.tools, 'setup-provider.sh'), ...args], { input, encoding: 'utf8', env: { ...f.env, ...extra }, timeout: 10000 })
  if (result.error) throw result.error
  return { status: result.status, output: result.stdout + result.stderr }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })


it('offers a provider added as a data row and keeps its guided steps resumable', () => {
  const f = fixture(), tableFile = join(f.table, 'providers.json')
  const rows = JSON.parse(readFileSync(tableFile, 'utf8'))
  rows.push({ id: 'sample', name: 'Sample provider', page: 'https://example.invalid/keys', documentation: 'https://example.invalid/docs', instructions: 'Choose read-only access.', scopes: 'read-only', folder: 'sample-private', file: 'api-key', prefix: 'trial_', min: 12, trial: null })
  writeFileSync(tableFile, JSON.stringify(rows))
  const choices = run(f, ['--providers'])
  expect(choices.status).toBe(0)
  expect(choices.output.includes('Sample provider')).toBe(true)
  const steps = run(f, ['sample', '--list'])
  expect(steps.status).toBe(0)
  expect(steps.output.includes('--from')).toBe(true)
  expect(steps.output.includes('4.')).toBe(true)
  const saved = run(f, ['sample', '--from', '3'], `${invented}\n\n`)
  expect(saved.status).toBe(0)
  expect(saved.output.includes(invented)).toBe(false)
  const file = join(f.home, '.config', 'sample-private', 'api-key')
  expect(readFileSync(file, 'utf8') === invented).toBe(true)
  expect(statSync(file).mode & 0o7777).toBe(0o600)
  expect(statSync(join(f.home, '.config', 'sample-private')).mode & 0o7777).toBe(0o700)
  const quit = run(f, ['sample', '--from', '3'], 'q\n')
  expect(quit.status).toBe(0)
  expect(readFileSync(file, 'utf8') === invented).toBe(true)
})

it('refuses a wrongly shaped value without writing or displaying it', () => {
  const f = fixture(), wrong = 'invalid_FAKE_VALUE_84209_EXAMPLE'
  const result = run(f, ['openai', '--from', '3'], `${wrong}\n`)
  expect(result.status).not.toBe(0)
  expect(result.output.includes(wrong)).toBe(false)
  expect(result.output.toLowerCase().includes('prefix')).toBe(true)
})

it('sends the trial only to the declared stand-in and never prints its response', async () => {
  const f = fixture(), tableFile = join(f.table, 'providers.json')
  const rows = JSON.parse(readFileSync(tableFile, 'utf8'))
  let received = false
  const server = createServer((req, res) => { received = req.method === 'GET' && req.headers.authorization === `Bearer ${invented}`; res.writeHead(200); res.end(invented) })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No test server address')
    rows.push({ id: 'sample', name: 'Sample provider', page: 'https://example.invalid/keys', documentation: 'https://example.invalid/docs', instructions: 'Choose read-only access.', scopes: 'read-only', folder: 'sample-private', file: 'api-key', prefix: 'trial_', min: 12, trial: { url: `http://127.0.0.1:${address.port}/read`, method: 'GET' } })
    writeFileSync(tableFile, JSON.stringify(rows))
    const result = await new Promise<{ status: number | null; output: string }>((ok, reject) => {
      const child = spawn('bash', [join(f.tools, 'setup-provider.sh'), 'sample', '--from', '3'], { env: f.env, timeout: 8000 })
      let output = ''
      child.stdout.on('data', (chunk) => { output += chunk })
      child.stderr.on('data', (chunk) => { output += chunk })
      child.on('error', reject); child.on('close', (status) => ok({ status, output }))
      child.stdin.end(`${invented}\n\n`)
    })
    expect(result.status).toBe(0)
    expect(received).toBe(true)
    expect(result.output.includes(invented)).toBe(false)
  } finally { await new Promise<void>((ok) => server.close(() => ok())) }
}, 15000)


it('saves a custom key without contacting a provider and refuses unsafe names', () => {
  const f = fixture()
  const saved = run(f, ['custom', 'personal-service', '--from', '3'], `${invented}\n\n`)
  expect(saved.status).toBe(0)
  expect(saved.output.includes(invented)).toBe(false)
  expect(readFileSync(keyFileFor(f.home, customKey('personal-service')), 'utf8') === invented).toBe(true)
  expect(run(f, ['custom', '../escape', '--from', '3'], `${invented}\n`).status).not.toBe(0)
})



it.each(['digitalocean', 'resend', 'openai'])('the existing %s guide reads its file and shape from the provider row', (id) => {
  const f = fixture(), tableFile = join(f.table, 'providers.json')
  const rows = JSON.parse(readFileSync(tableFile, 'utf8'))
  const row = rows.find((one: { id: string }) => one.id === id)
  expect(row).toBeDefined()
  Object.assign(row, { folder: `fixture-${id}`, file: 'fixture.key', prefix: 'trial_', min: 12 })
  writeFileSync(tableFile, JSON.stringify(rows))
  const result = spawnSync('bash', [join(f.tools, `setup-${id}.sh`), '--from', '3'], {
    input: `${invented}\nq\n`, encoding: 'utf8', env: f.env, timeout: 10000,
  })
  if (result.error) throw result.error
  expect(result.status).toBe(0)
  expect((result.stdout + result.stderr).includes(invented)).toBe(false)
  expect(readFileSync(join(f.home, '.config', row.folder, row.file), 'utf8') === invented).toBe(true)
})




