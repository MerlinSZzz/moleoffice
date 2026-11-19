// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { vi } from 'vitest'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { privatePool } from '../src/server/lib/sandbox-login-addition/pool.mjs'
const homes: string[] = []
const helper = new URL('./private-sandbox-login-stand-in.py', import.meta.url).pathname
export const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12)
export const newValue = 'invented-new-subscription-value'
export function clearPrivatePoolFixtures() { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) }
export function privatePoolFixture(letters = ['A', 'B', 'C', 'D']) {
  const home = mkdtempSync(join(tmpdir(), 'invented-private-home-')); homes.push(home)
  const root = join(home, '.config/mole-office/claude-logins'); mkdirSync(root, { recursive: true, mode: 0o700 })
  const index: any = { version: 1, logins: {} }
  for (const letter of letters) { const value = 'invented-existing-' + letter; writeFileSync(join(root, letter + '.token'), value + '\n', { mode: 0o600 }); index.logins[letter] = { sha12: fingerprint(value), added: '2026-01-01 12:00', by: 'invented-owner' } }
  writeFileSync(join(root, 'index.json'), JSON.stringify(index) + '\n', { mode: 0o600 })
  const active = join(home, '.config/mole-office/sandbox-secrets.env'); writeFileSync(active, '# invented unrelated line\nCLAUDE_CODE_OAUTH_TOKEN=invented-live-sentinel\n', { mode: 0o600 })
  const runs: any[] = []
  const tool = { version: 1, executable: '/usr/bin/python3', prefixArgs: [helper], by: 'invented-owner', verified: { installed: true, privateStdin: true, noDiagnostics: true, isolation: true, flock: true, recovery: true, dumpPrevention: true, ownerWatch: true, processIdentity: true },
    execute: vi.fn(async (request: any) => { runs.push({ ...request, input: undefined }); return runPoolStandIn(root, request, '') }),
    reconcile: vi.fn(async () => ({ outcome: 'unknown' })) }
  return { home, root, active, tool, runs, pool: privatePool({ tool }) }
}
export async function runPoolStandIn(root: string, request: any, fault: string) {
  return new Promise<any>((resolve, reject) => {
    const child = spawn(request.executable, request.args, { detached: true, env: { PATH: '/usr/bin:/bin', CLAUDE_LOGIN_POOL: root, INVENTED_POOL_FAULT: fault }, stdio: ['pipe', 'pipe', 'pipe'] })
    const recordedGroup = child.pid
    const identity = recordedGroup === undefined ? '' : readFileSync('/proc/' + recordedGroup + '/stat', 'utf8').split(') ')[1]?.split(' ')[19]
    let stdout = ''; let stderr = ''
    const timeout = setTimeout(() => { if (recordedGroup !== undefined && existsSync('/proc/' + recordedGroup + '/stat') && readFileSync('/proc/' + recordedGroup + '/stat', 'utf8').split(') ')[1]?.split(' ')[19] === identity) process.kill(-recordedGroup, 'SIGTERM') }, 12_000)
    child.stdout.on('data', chunk => { stdout += String(chunk) }); child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('invented-helper-failed')); else if (stderr) resolve({ outcome: 'refused', reason: 'PoolUnsafe' }); else resolve(JSON.parse(stdout)) })
    child.stdin.end(request.input)
  })
}
