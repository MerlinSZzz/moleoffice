// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** frbukDZtsdvB: run the real shell over a stand-in tool in a temporary checkout and home. */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WAITER = fileURLToPath(new URL('../tools/kit/waiter.sh', import.meta.url))
const PART = 'WHO SENT IT: agent fake\nTHE MESSAGE, record CUT:\n字 halfway'

async function runTheWaiter(sequence: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'cut-off-waiter-'))
  for (const path of ['for-agents', 'bin', '.nvm']) mkdirSync(join(dir, path))
  writeFileSync(join(dir, '.nvm', 'nvm.sh'), 'nvm() { :; }\n')
  // Record requested delays and scale only the test's sleep command. Production still waits 20 s.
  writeFileSync(join(dir, 'bin', 'sleep'), '#!/bin/bash\nprintf "%s\\n" "$1" >> "$HOME/sleeps"\n/bin/sleep 0.02\n')
  chmodSync(join(dir, 'bin', 'sleep'), 0o755)
  writeFileSync(join(dir, 'for-agents', 'hold-the-handle.mjs'), `
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const n = existsSync('attempts') ? Number(readFileSync('attempts', 'utf8')) : 0
writeFileSync('attempts', String(n + 1))
const kind = ${JSON.stringify(sequence)}[n] ?? 'stopped'
const text = kind === 'cut' ? ${JSON.stringify(PART)}
  : kind === 'silent' ? ''
  : kind === 'refused' ? 'exiting: refused: fake office says no\\n'
  : kind === 'error' ? 'exiting: error: fake office is away\\n'
  : kind === 'delivered' ? 'a whole message\\nexiting: delivered WHOLE\\n'
  : 'exiting: stopped\\n'
process.stdout.write(text)
process.exitCode = kind === 'cut' || kind === 'silent' ? 1 : 0
`)
  const out = join(dir, 'waiter.out')
  const child = spawn('bash', [WAITER, 'fake', 'fake-session', 'default', out], {
    detached: true,
    env: { PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, HOME: dir,
      MOLE_OFFICE_CHECKOUT: dir, MOLE_OFFICE_API: 'http://127.0.0.1:1' },
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const killGroup = () => { if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGKILL') } catch { /* ended */ } } }
  const timer = setTimeout(killGroup, 10_000)
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    expect(code, stderr).toBe(0)
    return { written: readFileSync(out, 'utf8'), attempts: Number(readFileSync(join(dir, 'attempts'), 'utf8')),
      sleeps: existsSync(join(dir, 'sleeps')) ? readFileSync(join(dir, 'sleeps'), 'utf8').trim().split('\n') : [] }
  } finally {
    clearTimeout(timer)
    killGroup()
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('the waiter keeps holding after cut-off output', () => {
  it('treating a missing exiting line as stop loses the retry and loud byte-count line', async () => {
    const run = await runTheWaiter(['cut', 'stopped'])
    expect(run.attempts).toBe(2)
    expect(run.written).toContain(PART)
    expect(run.written).toContain(`=== waiter: the tool's output ended with no exiting line (${Buffer.byteLength(PART)} bytes); running it again in 20 seconds`)
    expect(run.written.indexOf(PART)).toBeLessThan(run.written.indexOf('=== waiter:'))
    expect(run.sleeps).toEqual(['20'])
    expect(run.written.trimEnd().split('\n').at(-1)).toMatch(/^=== waiter ended /)
  })

  it('raising the three-run limit lets a tool with no exiting line run a fourth time', async () => {
    const run = await runTheWaiter(['cut', 'silent', 'cut', 'stopped'])
    expect(run.attempts).toBe(3)
    expect(run.written.match(/running it again in 20 seconds/g)).toHaveLength(2)
    expect(run.written).toContain('no exiting line (0 bytes)')
    expect(run.written.match(/WHO SENT IT: agent fake/g)).toHaveLength(2)
    expect(run.written.trimEnd().split('\n').at(-1)).toMatch(/^=== waiter ended .*no exiting line 3 runs in a row$/)
    expect(run.sleeps).toEqual(['20', '20'])
  })

  it.each(['delivered', 'error'])('removing the reset after an exiting: %s line stops the next incomplete run too soon', async (normal) => {
    const run = await runTheWaiter(['cut', 'cut', normal, 'cut', 'cut', 'stopped'])
    expect(run.attempts).toBe(6)
    expect(run.written.match(/running it again in 20 seconds/g)).toHaveLength(4)
    expect(run.written).not.toContain('no exiting line 3 runs in a row')
    expect(run.sleeps).toEqual(normal === 'delivered' ? ['20', '20', '1', '20', '20'] : ['20', '20', '20', '20', '20'])
  })

  it('retrying a refusal runs the tool again instead of stopping at once', async () => {
    const run = await runTheWaiter(['refused', 'cut', 'stopped'])
    expect(run.attempts).toBe(1)
    expect(run.written).toContain('exiting: refused: fake office says no')
    expect(run.written.trimEnd().split('\n').at(-1)).toMatch(/^=== waiter ended /)
    expect(run.written).not.toContain('no exiting line')
    expect(run.sleeps).toEqual([])
  })
})
