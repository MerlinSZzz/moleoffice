// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Generated sandbox settings execute the real hook against a synthetic office, never a live model or office. */
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { prepareClaudeRunHome } from '../tools/sandbox-common.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'

let root: string, instance: string, database: string, api: string, office: Server
const repo = process.cwd(), id = 'abcdefgh1234'
let data: Record<string, unknown>, created: number
beforeEach(async () => {
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/sandbox-session-'))
  instance = join(root, 'instance'); mkdirSync(join(instance, 'home'), { recursive: true })
  symlinkSync(repo, join(instance, 'repo'))
  database = join(root, 'synthetic.db'); writeFileSync(database, 'synthetic identity only')
  data = { state: 'running', runtime: 'claude-code' }; created = 0
  office = createServer((req, res) => {
    const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
      if (req.method === 'POST' && req.url === '/api/records') created++
      if (req.method === 'PATCH' && req.url === `/api/records/${id}`) data = { ...data, ...body.dataPatch }
      res.setHeader(WORLD_HEADER, formatWorldHeader({ database: databaseIdentity(database).id, repository: repo, port: '12345', head: 'synthetic', standing: 'scratch' }))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url?.startsWith('/api/after-a-compaction')
        ? { answeredAt: '2026-10-14 10:00:00', role: { says: 'Synthetic role' }, rules: {}, handover: {}, run: { id, title: 'Synthetic launcher run', ...data, stamped: true } }
        : req.url === `/api/records/${id}` ? { record: { id, kind: 'session', title: 'Synthetic launcher run', workspaceId: 'default', data, deletedAt: null } }
          : req.method === 'POST' && req.url === '/api/records' ? { record: { id: 'synthetic-second-run', kind: 'session', title: 'Synthetic second run' } }
            : req.url === '/api/health' ? { ok: true } : {}))
    })
  })
  await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
  const address = office.address(); if (!address || typeof address === 'string') throw new Error('No synthetic office port')
  api = `http://127.0.0.1:${address.port}`
  prepareClaudeRunHome(join(instance, 'home'), join(instance, 'repo'))
})
afterEach(async () => { await new Promise<void>(done => office.close(() => done())); rmSync(root, { recursive: true, force: true }) })
async function sessionStart(source: string) {
  const settings = JSON.parse(readFileSync(join(instance, 'home/.claude/settings.json'), 'utf8'))
  const commands: string[] = (settings.hooks.SessionStart ?? []).flatMap((group: { hooks: { command: string }[] }) => group.hooks.map(hook => hook.command))
  let output = ''
  for (const command of commands) output += await new Promise<string>((done, fail) => {
    const env = { ...process.env, HOME: join(instance, 'home'), MOLE_OFFICE_API: api, MOLE_OFFICE_PORT: '12345', MOLE_OFFICE_DB: database,
      MOLE_OFFICE_SESSION: id, MOLE_OFFICE_WORKSPACE: 'default', MOLE_HOOK_DETAILS_FOLDER: join(root, 'details') }
    for (const key of ['MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY', 'TMUX_PANE']) delete env[key as keyof typeof env]
    const child = spawn('/bin/sh', ['-c', command], { cwd: repo, env })
    let out = '', err = ''; child.stdout.on('data', bytes => out += bytes); child.stderr.on('data', bytes => err += bytes)
    child.on('error', fail); child.on('close', code => code === 0 ? done(out) : fail(new Error(err)))
    child.stdin.end(JSON.stringify({ session_id: 'synthetic-sandbox-conversation', source, cwd: join(instance, 'repo') }))
  })
  return output
}
it('a sandbox compact SessionStart appends to its own launcher run', async () => {
  const out = await sessionStart('compact')
  expect(out).toContain(`This compaction is recorded on run ${id}`)
  expect(data.compactions).toEqual([{ at: '2026-10-14 10:00:00', what: 'Claude Code reported a compaction (SessionStart source compact)' }])
  expect(created).toBe(0)
})
it('a launcher ordinary SessionStart uses MOLE_OFFICE_SESSION and creates no second run', async () => {
  const out = await sessionStart('startup')
  expect(out).toContain(`This session is filed as record ${id}, the run its environment names`)
  expect(created).toBe(0)
  expect(data.compactions).toBeUndefined()
})
