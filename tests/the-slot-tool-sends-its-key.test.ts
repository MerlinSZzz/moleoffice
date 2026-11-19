// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEAT TOOL SENDS THE ASKER'S KEY, AND NO KEY WHEN IT HOLDS NONE.
 *
 * Every caller sends its own key (acceptance findings 14 and 79). A request with an agent's headers and no key is still
 * taken as that agent, whether the key window is open or closed, because the window covers only a claim to be the
 * person; P83's agent half will refuse a name alone, and every tool has to send its key before then. tools/slot.mjs built
 * its own headers and sent none, so every seat was taken on the agent's name alone (recover/work/keywindow). The owner
 * gave the go for the key window in a message. It now builds them with officeHeaders
 * (tools/sandbox-common.mjs), the tools' one builder of an agent's headers, which sends MOLE_AGENT_KEY as
 * x-mole-office-key.
 *
 * WHAT IS PROVED: `node tools/slot.mjs acquire` sends x-mole-office-key with the value MOLE_AGENT_KEY holds, beside the
 * agent it names, and sends no key header when the variable is not set. The office here is a stand-in that writes down
 * each request's headers and grants the seat; nothing reaches the owner's office. The key is a made-up value that no
 * office ever made.
 *
 * MUTATION PROOF, 25 September 2026, alone in tools/slot.mjs: writeHeaders building its own headers again, without
 * the key, and the first case goes red.
 */
import { spawn } from 'node:child_process'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'slot.mjs')
/** Sixty-four hex characters, the shape of a key, made up here: no office ever made it. */
const A_MADE_UP_KEY = 'f'.repeat(64)

let server: Server
let api = ''
/** The headers of every request the stand-in office was sent, in order. */
const seen: IncomingHttpHeaders[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req.headers)
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ slot: { id: 'a-seat', state: 'granted', seat: 1, position: 0 }, says: 'The seat is yours.' }))
    })
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()))
})

/** This process's environment without any agent, session, office or key of the one running the tests. */
function aCleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of ['MOLE_AGENT_KEY', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT']) delete env[name]
  return env
}

/** `node tools/slot.mjs acquire full-suite` against the stand-in office, in the environment given. */
function acquire(env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [TOOL, 'acquire', 'full-suite', '--api', api, '--workspace', 'default', '--as', 'a-test-agent', '--session', 'a-test-session', '--pid', String(process.pid)],
      { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', (code) => done({ code, stdout, stderr }))
  })
}

describe('node tools/slot.mjs acquire', () => {
  it("sends the asker's key, beside the agent it names, when MOLE_AGENT_KEY holds one", async () => {
    seen.length = 0
    const ran = await acquire({ ...aCleanEnvironment(), MOLE_AGENT_KEY: A_MADE_UP_KEY })
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.stdout.trim()).toBe('a-seat')
    expect(seen).toHaveLength(1)
    expect(seen[0]!['x-mole-office-key']).toBe(A_MADE_UP_KEY)
    expect(seen[0]!['x-mole-office-actor-id']).toBe('a-test-agent')
    expect(seen[0]!['x-mole-office-session']).toBe('a-test-session')
  })

  it('sends no key header when it holds no key', async () => {
    seen.length = 0
    const ran = await acquire(aCleanEnvironment())
    expect(ran.code, ran.stderr).toBe(0)
    expect(seen).toHaveLength(1)
    expect(seen[0]!['x-mole-office-key']).toBeUndefined()
    expect(seen[0]!['x-mole-office-actor-id']).toBe('a-test-agent')
  })
})
