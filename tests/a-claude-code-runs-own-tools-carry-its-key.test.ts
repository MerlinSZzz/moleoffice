// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLAUDE CODE RUN'S OWN TOOLS CARRY ITS KEY (bpcCcAsV0sGn, 10 November 2026). The launcher takes MOLE_AGENT_KEY
 * out of a Claude Code run's shell and leaves only the path of the run's office tool configuration
 * (MOLE_OFFICE_TOOL_CONFIGURATION; src/config/run-permissions.mjs says why). So an agent's tools/slot.mjs at 10:00
 * asked for the full-suite seat with no key and was refused (403), and so was the helper's ledger write for a named batch:
 * both build their headers with tools/sandbox-common.mjs's officeHeaders, which read only the environment. Now, when the
 * environment holds no key, officeHeaders reads the run's own key from that file, by theRunsKeyFromItsOfficeToolFile,
 * which takes it only from a file kept from everyone else that names this very agent and run.
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { officeHeaders } from '../tools/sandbox-common.mjs'

const AGENT = 'clerk', RUN = 'HZvzjRCyMqyF'
const KEY = 'a'.repeat(64), OTHER = 'b'.repeat(64)
let dir: string
beforeEach(() => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  dir = mkdtempSync(join(process.cwd(), '.logs/run-office-tool-key-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** The run's office tool configuration as the launcher writes it for a Claude Code run, with the given mode. */
function aConfiguration(env: Record<string, string>, mode = 0o600): string {
  const path = join(dir, 'mcp.json')
  writeFileSync(path, JSON.stringify({ mcpServers: { mole_office: { command: 'node', args: ['office-mcp.mjs'], env } } }))
  chmodSync(path, mode)
  return path
}
const theRunsOwn = () => aConfiguration({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: KEY })
const asked = { workspace: 'panelx', agent: AGENT, session: RUN }

describe("officeHeaders in a Claude Code run's shell", () => {
  it("takes the run's own key from its office tool configuration when the shell holds none", () => {
    const headers = officeHeaders({ ...asked, env: { MOLE_OFFICE_TOOL_CONFIGURATION: theRunsOwn() } })
    expect(headers['x-mole-office-key']).toBe(KEY)
    expect(headers['x-mole-office-actor-id']).toBe(AGENT)
    expect(headers['x-mole-office-session']).toBe(RUN)
  })

  it('takes no key from a configuration that names another agent or another run, and sends none', () => {
    for (const env of [{ MOLE_OFFICE_AGENT: 'someone-else', MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: KEY },
      { MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: 'anotherRun01', MOLE_AGENT_KEY: KEY }]) {
      const headers = officeHeaders({ ...asked, env: { MOLE_OFFICE_TOOL_CONFIGURATION: aConfiguration(env) } })
      expect(headers['x-mole-office-key']).toBeUndefined()
      expect(headers['x-mole-office-actor-id']).toBe(AGENT)
    }
  })

  it('takes no key from a configuration that others may read', () => {
    const headers = officeHeaders({ ...asked, env: { MOLE_OFFICE_TOOL_CONFIGURATION: aConfiguration({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: KEY }, 0o644) } })
    expect(headers['x-mole-office-key']).toBeUndefined()
  })

  it("keeps the key in the environment first, and a key the caller passes before both", () => {
    const path = theRunsOwn()
    expect(officeHeaders({ ...asked, env: { MOLE_AGENT_KEY: OTHER, MOLE_OFFICE_TOOL_CONFIGURATION: path } })['x-mole-office-key']).toBe(OTHER)
    expect(officeHeaders({ ...asked, key: 'c'.repeat(64), env: { MOLE_OFFICE_TOOL_CONFIGURATION: path } })['x-mole-office-key']).toBe('c'.repeat(64))
  })

  it('sends no key when there is neither a key in the environment nor a configuration', () => {
    expect(officeHeaders({ ...asked, env: {} })['x-mole-office-key']).toBeUndefined()
  })
})

/**
 * THE SEAT, AS THE INTEGRATOR ASKS FOR IT: tools/slot.mjs acquire with --resource, in a shell that holds only the
 * configuration's path, against a stand-in office on loopback that records what it was sent.
 */
describe("tools/slot.mjs in a Claude Code run's shell", () => {
  it("asks for the seat with the run's own key from its office tool configuration", async () => {
    const seen: Array<{ url: string; key: string | undefined; actor: string | undefined }> = []
    const server = createServer((request: IncomingMessage, answer) => {
      seen.push({ url: request.url ?? '', key: request.headers['x-mole-office-key'] as string | undefined, actor: request.headers['x-mole-office-actor-id'] as string | undefined })
      answer.setHeader('content-type', 'application/json')
      answer.end(JSON.stringify({ slot: { id: 'slotStandIn1', state: 'granted', pool: 'full-suite' }, says: 'Granted: seat 1 of 1 in full-suite.' }))
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
    const port = (server.address() as { port: number }).port
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_OFFICE_TOOL_CONFIGURATION: theRunsOwn() }
    delete env.MOLE_AGENT_KEY
    delete env.MOLE_AGENT_KEY_FILE
    try {
      const ran = await new Promise<{ code: number | null; err: string }>((done) => {
        const child = spawn(process.execPath, ['tools/slot.mjs', 'acquire', 'full-suite', '--resource', 'rowStandIn01', '--api', `http://127.0.0.1:${port}`], { env })
        let err = ''
        child.stderr.on('data', (chunk) => (err += String(chunk)))
        child.on('close', (code) => done({ code, err }))
      })
      expect(ran.code, ran.err).toBe(0)
      const acquire = seen.find((one) => one.url.startsWith('/api/slots/acquire'))
      expect(acquire?.key).toBe(KEY)
      expect(acquire?.actor).toBe(AGENT)
    } finally {
      server.close()
    }
  }, 30_000)
})
