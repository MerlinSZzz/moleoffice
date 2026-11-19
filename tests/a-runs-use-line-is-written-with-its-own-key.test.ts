// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S USE LINE IS WRITTEN WITH THE RUN'S OWN KEY WHEN ITS SHELL HOLDS NONE. Problems rB33NQrssDEu and 4aX9F5p2XbDx;
 * the coordinator agreed the way in message I7tf4M-nNaER.
 *
 * The launcher takes MOLE_AGENT_KEY out of a Claude Code run's shell, so tools/run-named-tests.mjs, started from that
 * shell, wrote its use line with no key, and the office answered 403 after every result. Now writeAUseLine
 * (tools/use-line.mjs) reads the run's key from the run's office tool configuration, the file
 * MOLE_OFFICE_TOOL_CONFIGURATION names, through theRunsKeyFromItsOfficeToolFile (src/config/run-permissions.mjs): the
 * one reading the run's hooks use too. The key is read at the moment of the write and sent in that one request.
 *
 * WHAT IS PROVED
 *   1. A configuration naming this agent and this run, kept from everyone else, gives the key: the stand-in office
 *      hears it in the key header, answers 201, and the line says it was written. The words never hold the key.
 *   2. One naming another run, or another agent, sends nothing, and the words say which.
 *   3. MOLE_AGENT_KEY in the environment still wins over the file.
 *   4. No key and no file named: nothing is sent. The body is returned for the run to send through office_request.
 *   5. The file is refused, in words, unless it is the run's own and kept from everyone else: a file others may read,
 *      and a link, are each refused and named as such. (A file another user owns cannot be made without root, so that
 *      check is read, not run.)
 *   6. The run's hooks read the key through the same function: a file others may read gives them no key either.
 *
 * HOW. A server this file starts on 127.0.0.1 stands in for the office, keeps the key header of each request and
 * answers 201. The configuration is written in the shape tools/sandbox-start.mjs writes (aClaudeCommandsOfficeTool), in
 * a folder of its own. Every key here is made up; nothing reaches an office.
 *
 * EARLIER MUTATIONS, each proved red in the run that adds this file: the use line never reads the run's key (1); the run
 * is not compared (2); the file's key goes even when the environment holds one (3); the mode is not asked (5); a link is
 * not refused (5); the hooks read the file as before, with no check of who may read it (6).
 * Case 4 now requires no request, under the wave 13j criterion. The direct function test proves the exact printed body.
 */

import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { aClaudeCommandsOfficeTool, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { theRunsKeyFromItsOfficeTool } from '../tools/dsh-hooks/office.mjs'
import { writeAUseLine } from '../tools/use-line.mjs'

const AGENT = 'a-worker'
const RUN = 'aRunOfItsOwn'
const THE_RUNS_KEY = 'mok_a-made-up-key-of-the-run-0001'
const THE_SHELLS_KEY = 'mok_a-made-up-key-in-the-shell-02'

let server: Server | null = null
let api = ''
let heard: (string | undefined)[] = []
let folder = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    const key = req.headers['x-mole-office-key']
    req.resume()
    req.on('end', () => {
      heard.push(Array.isArray(key) ? key.join(',') : key)
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ run: RUN }))
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', () => done()))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  if (server !== null) await new Promise<void>((done) => server?.close(() => done()))
  server = null
})

beforeEach(() => {
  heard = []
  folder = mkdtempSync(join(tmpdir(), 'mole-office-a-runs-key-'))
  delete process.env['MOLE_AGENT_KEY']
  delete process.env[OFFICE_TOOL_CONFIGURATION]
})

afterEach(() => {
  delete process.env['MOLE_AGENT_KEY']
  delete process.env[OFFICE_TOOL_CONFIGURATION]
  rmSync(folder, { recursive: true, force: true })
})

/** The configuration the launcher writes for `agent`'s run `session`, holding `key`, written with `mode`. */
function aConfiguration(name: string, { agent = AGENT, session = RUN, key = THE_RUNS_KEY, mode = 0o600 } = {}): string {
  const answered = aClaudeCommandsOfficeTool(['claude', '-p', 'words'], { MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: session, MOLE_AGENT_KEY: key, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: 'panelx' }, 'office-mcp.json')
  expect(answered.configuration, 'the launcher gives a Claude Code command an office tool configuration').not.toBeNull()
  const path = join(folder, name)
  writeFileSync(path, `${JSON.stringify(answered.configuration)}\n`, { mode: 0o600 })
  chmodSync(path, mode)
  return path
}

/** One use line, as run-named-tests writes it from a run's shell. */
async function aUse(configuration: string | undefined): Promise<{ written: boolean; why: string; words: string }> {
  return writeAUseLine({ tool: 'named-tests', said: 'ran one file', office: { api, workspace: 'panelx', agent: AGENT, session: RUN, configuration } })
}

describe("a run's use line is written with the run's own key when its shell holds none", () => {
  it("sends the run's key from its own configuration, and the office writes the line", async () => {
    const answer = await aUse(aConfiguration('office-mcp.json'))
    expect(answer).toMatchObject({ written: true, why: 'written' })
    expect(heard).toEqual([THE_RUNS_KEY])
    expect(answer.words).not.toContain(THE_RUNS_KEY)
  })

  it('sends nothing for a configuration naming another run or another agent, and says which', async () => {
    const another = await aUse(aConfiguration('another-run.json', { session: 'anotherRun01' }))
    expect(another).toMatchObject({ written: false, why: 'no key' })
    expect(another.words).toContain('it names the run anotherRun01, not this one (aRunOfItsOwn)')
    const someoneElse = await aUse(aConfiguration('another-agent.json', { agent: 'another-worker' }))
    expect(someoneElse).toMatchObject({ written: false, why: 'no key' })
    expect(someoneElse.words).toContain('it names the agent another-worker, not this one (a-worker)')
    expect(heard).toEqual([])
    expect(`${another.words} ${someoneElse.words}`).not.toContain(THE_RUNS_KEY)
  })

  it("lets MOLE_AGENT_KEY in the environment win over the file's key", async () => {
    process.env['MOLE_AGENT_KEY'] = THE_SHELLS_KEY
    const answer = await aUse(aConfiguration('office-mcp.json'))
    expect(answer).toMatchObject({ written: true, why: 'written' })
    expect(heard).toEqual([THE_SHELLS_KEY])
  })

  it('returns the unsent line when the shell holds no key and names no configuration', async () => {
    const answer = await aUse(undefined)
    expect(heard).toEqual([])
    expect(answer).toMatchObject({ written: false, why: 'not sent', body: { tool: 'named-tests', said: 'ran one file' } })
  })

  it('reads the file this process names when the caller passes none', async () => {
    process.env[OFFICE_TOOL_CONFIGURATION] = aConfiguration('office-mcp.json')
    expect(await aUse(undefined)).toMatchObject({ written: true })
    expect(heard).toEqual([THE_RUNS_KEY])
  })

  it('refuses, in words, a file others may read and a link, and sends nothing', async () => {
    const open = aConfiguration('open.json', { mode: 0o644 })
    const opened = await aUse(open)
    expect(opened).toMatchObject({ written: false, why: 'no key' })
    expect(opened.words).toContain(`the office tool configuration ${open} may be read or written by others than its owner (mode 644)`)
    const link = join(folder, 'a-link.json')
    symlinkSync(aConfiguration('office-mcp.json'), link)
    const linked = await aUse(link)
    expect(linked).toMatchObject({ written: false, why: 'no key' })
    expect(linked.words).toContain(`the office tool configuration ${link} is not a plain file`)
    expect(heard).toEqual([])
  })

  it("gives the run's hooks the key through the same reading, and no key from a file others may read", () => {
    const id = { handle: AGENT, session: RUN, workspace: 'panelx' }
    process.env[OFFICE_TOOL_CONFIGURATION] = aConfiguration('office-mcp.json')
    expect(theRunsKeyFromItsOfficeTool(id)).toBe(THE_RUNS_KEY)
    process.env[OFFICE_TOOL_CONFIGURATION] = aConfiguration('open.json', { mode: 0o644 })
    expect(theRunsKeyFromItsOfficeTool(id)).toBeNull()
  })
})
