// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESIDENT'S BRIEF CARRIES ITS MEMORY FILES. Row 17 of report rFBoQG6mAEI0: `GET /api/brief` never looked at a
 * resident's space, so a resident started without its memory unless it went and fetched it.
 *
 * The brief now carries `memory`: every file under `memory/` in the resident's space, whole, in path order, read
 * through the space's own doors. It is not on the ladder, so a long brief never drops it. A file it does not carry
 * is named in `memory.leftOut` with why and the request that reads it: a void file, a file that is not UTF-8 text,
 * and every file past 40 files or past 40 KB in all.
 *
 * WHAT IS PROVED, through the real propose, confirm, write, void and brief doors
 *   1. The resident, with its own key, is handed its memory files whole and in path order, and not the files
 *      outside `memory/`.
 *   2. A void file and a file that is not UTF-8 text are left out, each with why and the request that reads it.
 *   3. Past 40 files, and past 40 KB, the rest are left out, each with why and the request that reads it.
 *   4. A request that names the resident with no key is told its memory was not read, and is handed none.
 *   5. An agent that is not a resident is told it has no memory files, and the person's brief looks for none.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the brief stops carrying `memory`                    → cases 1 to 5
 *   the void mark is no longer read                       → case 2
 *   the file ceiling is taken out                         → case 3
 *   the residency is found from the header, not the key   → case 4
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database, and the spaces
 * are made beside it.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface MemoryFile {
  path: string
  bytes: number
  text: string
}
interface LeftOut {
  path: string
  bytes: number
  because: string
  ask: string
}
interface Memory {
  resident: boolean
  files: MemoryFile[] | null
  leftOut: LeftOut[]
  note: string
}

const agents = new Map<string, { id: string; key: string }>()

async function started(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, reply.body).toBe(201)
  const json = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
  agents.set(handle, { id: json.agent.id, key: String(json.whatToGiveIt?.key) })
}
const as = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

async function makeAResident(handle: string): Promise<void> {
  const proposed = await app.inject({
    method: 'POST',
    url: '/api/residents/proposals',
    headers: as('sec-made-up'),
    payload: { agentId: handle, because: 'It has done steady work here for weeks.', sleepTime: A_SLEEP_TIME },
  })
  expect(proposed.statusCode, proposed.body).toBe(201)
  const id = (proposed.json() as { proposal: { id: string } }).proposal.id
  const confirmed = await app.inject({ method: 'POST', url: `/api/residents/proposals/${id}/confirm`, headers: AS_THE_PERSON })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
}

async function write(handle: string, path: string, sent: { text: string } | { bytes: string }): Promise<void> {
  const reply = await app.inject({
    method: 'PUT',
    url: `/api/residents/${handle}/space/file?path=${encodeURIComponent(path)}`,
    headers: as(handle),
    payload: sent,
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function memoryIn(headers: Record<string, string>): Promise<Memory> {
  const reply = await app.inject({ method: 'GET', url: '/api/brief', headers })
  expect(reply.statusCode, reply.body.slice(0, 600)).toBe(200)
  const memory = (reply.json() as { memory?: Memory }).memory
  expect(memory, 'the brief carries no memory part').toBeDefined()
  return memory!
}

const askFor = (handle: string, path: string): string =>
  `GET /api/residents/${agents.get(handle)!.id}/space/file?path=${encodeURIComponent(path)}`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-made-up', 'secretary')
  for (const handle of ['res-keeps', 'res-full', 'not-a-resident']) await started(handle, 'worker')
  await makeAResident('res-keeps')
  await makeAResident('res-full')
  await write('res-keeps', 'memory/b-the-office.md', { text: 'The office is on port 4100 in a test.\n' })
  await write('res-keeps', 'memory/a-who-i-am.md', { text: 'I keep the kiln records.\n' })
  await write('res-keeps', 'notes/scratch.md', { text: 'Not memory.\n' })
  await write('res-keeps', 'memory/c-wrong.md', { text: 'The office is on port 9999.\n' })
  const voided = await app.inject({
    method: 'POST',
    url: '/api/residents/res-keeps/space/void',
    headers: as('res-keeps'),
    payload: { path: 'memory/c-wrong.md', because: 'The port was wrong.' },
  })
  expect(voided.statusCode, voided.body).toBe(201)
  await write('res-keeps', 'memory/d-picture.bin', { bytes: Buffer.from([0xff, 0xfe, 0x00, 0x81]).toString('base64') })
  for (let n = 1; n <= 41; n += 1) await write('res-full', `memory/n${String(n).padStart(2, '0')}.md`, { text: `Note ${String(n)}.\n` })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a resident's brief carries its memory files", () => {
  it('hands the resident its memory files whole and in path order, and nothing outside memory/', async () => {
    const memory = await memoryIn(as('res-keeps'))
    expect(memory.resident).toBe(true)
    expect(memory.files).toEqual([
      { path: 'memory/a-who-i-am.md', bytes: 25, text: 'I keep the kiln records.\n' },
      { path: 'memory/b-the-office.md', bytes: 38, text: 'The office is on port 4100 in a test.\n' },
    ])
  })

  it('leaves out a void file and a file that is not text, each with why and the request that reads it', async () => {
    const memory = await memoryIn(as('res-keeps'))
    expect(memory.leftOut).toEqual([
      { path: 'memory/c-wrong.md', bytes: 28, because: 'It is marked void: The port was wrong.', ask: askFor('res-keeps', 'memory/c-wrong.md') },
      {
        path: 'memory/d-picture.bin',
        bytes: 4,
        because: 'It is not UTF-8 text, so the brief cannot carry it as words.',
        ask: askFor('res-keeps', 'memory/d-picture.bin'),
      },
    ])
  })

  it('carries at most 40 files, and names the rest', async () => {
    const memory = await memoryIn(as('res-full'))
    expect(memory.files).toHaveLength(40)
    expect(memory.files!.at(-1)!.path).toBe('memory/n40.md')
    expect(memory.leftOut).toEqual([
      { path: 'memory/n41.md', bytes: 9, because: 'The brief carries at most 40 memory files.', ask: askFor('res-full', 'memory/n41.md') },
    ])
  })

  it('carries at most 40 KB, and names the file that would go past it', async () => {
    await write('res-full', 'memory/a-large.md', { text: 'x'.repeat(40 * 1024 - 100) })
    await write('res-full', 'memory/a-second.md', { text: 'y'.repeat(200) })
    try {
      const memory = await memoryIn(as('res-full'))
      expect(memory.files!.map((one) => one.path).slice(0, 1)).toEqual(['memory/a-large.md'])
      expect(memory.files!.reduce((sum, one) => sum + one.bytes, 0)).toBeLessThanOrEqual(40 * 1024)
      expect(memory.leftOut[0]).toEqual({
        path: 'memory/a-second.md',
        bytes: 200,
        because: 'The brief carries at most 40960 bytes of memory, and this file would go past that.',
        ask: askFor('res-full', 'memory/a-second.md'),
      })
    } finally {
      for (const path of ['memory/a-large.md', 'memory/a-second.md']) {
        await app.inject({ method: 'POST', url: '/api/residents/res-full/space/void', headers: as('res-full'), payload: { path, because: 'made by the test' } })
      }
    }
  })

  it('reads no memory for a request that names the resident with no key', async () => {
    const memory = await memoryIn(asAgent('res-keeps'))
    expect(memory).toEqual({
      resident: false,
      files: null,
      leftOut: [],
      note: "This request names a resident and carries no key that proves it, so its memory was not read. Ask again with the resident's own key.",
    })
  })

  it('tells an agent that is not a resident it has no memory files, and looks for none for the person', async () => {
    const theirs = await memoryIn(as('not-a-resident'))
    expect(theirs.resident).toBe(false)
    expect(theirs.files).toBeNull()
    expect(theirs.note).toContain('not a resident')
    const persons = await memoryIn(AS_THE_PERSON)
    expect(persons.files).toBeNull()
    expect(persons.note).toContain('not read for an agent')
  })
})
