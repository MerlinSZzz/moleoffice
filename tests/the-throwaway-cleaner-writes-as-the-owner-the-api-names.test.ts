// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THROWAWAY CLEANER WRITES AS THE OWNER THE RUNNING OFFICE NAMES, NOBODY BUILT IN.
 *
 * `scripts/remove-the-throwaway-records.mjs` talks to a running office and sends the person's actor
 * headers. It used to send a fixed person id. An office whose owner has another id would then read
 * every request as coming from somebody it does not hold. Now the script asks the office who its owner
 * is (GET /api/office/owner) and sends that id.
 *
 * This file starts a small fake office on 127.0.0.1, on a port the system picks. It answers the owner
 * door, the workspaces and the records, and writes down the headers of every request. The script runs
 * in its dry mode, which only reads. Every name here is made up.
 *
 * MUTATION PROOF (after a green control), in scripts/remove-the-throwaway-records.mjs: put a fixed id
 * back in place of the owner's id in `headersFor`. The first case is red.
 */

import { execFile } from 'node:child_process'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(REPO, 'scripts', 'remove-the-throwaway-records.mjs')

type Seen = { path: string; headers: IncomingHttpHeaders }

let server: Server | null = null

afterEach(async () => {
  const s = server
  server = null
  if (s !== null) await new Promise<void>((done) => s.close(() => done()))
})

/** Start the fake office. `owner` is what the owner door answers, or null for a 500. */
async function aFakeOffice(owner: Record<string, unknown> | null): Promise<{ address: string; seen: Seen[] }> {
  const seen: Seen[] = []
  const s = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? ''
    seen.push({ path, headers: req.headers })
    const answer = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (path === '/api/office/owner') {
      if (owner === null) answer(500, { error: 'the fake office cannot say' })
      else answer(200, owner)
    } else if (path === '/api/workspaces') answer(200, { workspaces: [{ id: 'default' }, { id: 'second' }] })
    else if (path === '/api/records') {
      answer(200, { records: [{ id: 'aaaaaaaaaaaa', kind: 'note', title: 'THROWAWAY made-up record' }] })
    } else answer(404, { error: 'the fake office has no such door' })
  })
  server = s
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', () => done()))
  const { port } = s.address() as AddressInfo
  return { address: `http://127.0.0.1:${String(port)}`, seen }
}

/** Run the script in its dry mode against `address`, without blocking the fake office. */
function theCleaner(address: string): Promise<{ code: number; out: string }> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('MOLE_OFFICE_')) env[key] = value
  }
  env['MOLE_OFFICE_API'] = address
  return new Promise((done) => {
    execFile(process.execPath, [SCRIPT], { cwd: REPO, env, encoding: 'utf8', timeout: 60_000 }, (err, stdout, stderr) => {
      const code = err === null ? 0 : typeof err.code === 'number' ? err.code : 1
      done({ code, out: `${stdout}${stderr}` })
    })
  })
}

describe('the throwaway cleaner', () => {
  it('sends, as the person, the id the running office names as its owner', async () => {
    const office = await aFakeOffice({ id: 'odile-made-up', name: 'Odile Made-Up', named: true, placeholder: 'You', guide: '#/welcome' })
    const run = await theCleaner(office.address)
    expect(run.code, run.out).toBe(0)
    expect(run.out).toContain('Nothing was written.')
    const reads = office.seen.filter((s) => s.path !== '/api/office/owner')
    // The workspaces once, and the records once in each of the two workspaces.
    expect(reads.map((s) => s.path)).toEqual(['/api/workspaces', '/api/records', '/api/records'])
    for (const s of reads) {
      expect(s.headers['x-mole-office-actor-type'], s.path).toBe('human')
      expect(s.headers['x-mole-office-actor-id'], s.path).toBe('odile-made-up')
    }
  }, 90_000)

  it('stops, and reads nothing else, when the office does not say who its owner is', async () => {
    const office = await aFakeOffice(null)
    const run = await theCleaner(office.address)
    expect(run.code).not.toBe(0)
    expect(office.seen.map((s) => s.path)).toEqual(['/api/office/owner'])
  }, 90_000)

  it('stops when the owner door answers without an id', async () => {
    const office = await aFakeOffice({ name: 'Odile Made-Up' })
    const run = await theCleaner(office.address)
    expect(run.code).not.toBe(0)
    expect(office.seen.map((s) => s.path)).toEqual(['/api/office/owner'])
  }, 90_000)
})
