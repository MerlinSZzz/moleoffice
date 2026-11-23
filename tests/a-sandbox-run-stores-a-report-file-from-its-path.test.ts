// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOX RUN STORES A REPORT FILE FROM ITS PATH, AND ITS BYTES NEVER PASS THROUGH THE MODEL (19 October 2026;
 * L2e8ymzb0nDF). A run asked the office to store a picture by typing every base64 character into office_request,
 * and 13k's twelve report pictures (2.2 M characters) could not be sent at all. In a sandbox only the office tool's
 * server holds the run's key, so the server reads the file: office_request to POST /api/report-files takes
 * "bytes": {"fromFile": "<absolute path>"}, sends the file's base64, and checks the stored size and short hash against
 * the file it read.
 *
 * THE OFFICE HERE IS THE REAL DOOR (the check's refusal lvw2tRFLMmB_): an earlier stand-in answered GET /api/report-files
 * with a shape the door never gives, so this test stayed green while the tool could not work against the office. Every
 * request to /api/report-files is now answered by the real app on a fresh database, asked as the test office's owner;
 * what the run itself sent is recorded first. Case 2 lays one lie over the real answer, keeping its shape. Every key is
 * synthetic.
 *
 * Mutations, each tried alone after the control:
 *   - the server sends the {fromFile} object on unread                                   -> cases 1, 1b, 2 red
 *   - the server skips the size-and-hash comparison                                      -> case 2 red
 *   - the limit read from anywhere but the door's own answer                             -> cases 1, 1b, 2, over-the-limit red
 *   - each refusal in case 3 left out (link, link in the path, a credentials folder, a
 *     credentials file, a second name for the key file, the key file's folder, the office tool file,
 *     the office tool file's folder, not a file,
 *     empty, over the limit, the key file, relative, another door, extra keys)           -> its row red
 *   - every hidden part refused, as first designed (vmKz-CMmzsDs)                 -> case 1b red
 *   - a plain base64 string is read as a path                                            -> case 4 red
 *   - dsh sends the {fromFile} object unread, skips comparison, or skips either refusal  -> dsh cases a-d red
 *   - dsh checks the fields only after it sends the file                                 -> dsh case e red
 *
 * Cases: 1 and 1b store a file; 2 catches a false hash; 3 refuses unsafe paths and requests;
 * 4 sends base64 unchanged; dsh a stores a file, b catches a false hash, c refuses another door,
 * d refuses the office tool file, and e refuses fields it cannot give and sends nothing.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, ftruncateSync, linkSync, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { answerOfficeMessage } from '../tools/office-mcp.mjs'
import { theOfficeRequestTool } from '../tools/dsh-hooks/office-tool.mjs'
import { officeHeaders } from '../tools/sandbox-common.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const key = 'a1'.repeat(32)
const identity = { MOLE_OFFICE_AGENT: 'synthetic-worker', MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_OFFICE_WORKSPACE: 'default' }
const api = 'http://127.0.0.1:9'
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const shortHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16)

interface Heard { method: string; path: string; body: any; headers: Record<string, string> }
let dir = ''
let heard: Heard[] = []
let lie = false
let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined

/** The office: what the run sent is recorded, and /api/report-files is answered by the real door. */
const fetchImpl = (async (input: string | URL, init: RequestInit = {}) => {
  const url = new URL(String(input))
  const method = (init.method ?? 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  heard.push({ method, path: url.pathname + url.search, body, headers: Object.fromEntries(new Headers(init.headers).entries()) })
  if (url.pathname !== '/api/report-files') return new Response(JSON.stringify({ ok: true }), { status: 200 })
  const real = await app.inject({ method: method as 'GET' | 'POST', url: url.pathname + url.search, headers: PERSON, ...(body === undefined ? {} : { payload: body }) })
  let said = real.body
  if (lie && method === 'POST' && real.statusCode === 201) {
    const answer = real.json<{ file: Record<string, unknown> }>()
    said = JSON.stringify({ ...answer, file: { ...answer.file, hash: '0000000000000000' } })
  }
  return new Response(said, { status: real.statusCode })
}) as unknown as typeof fetch

const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ ...identity, MOLE_AGENT_KEY: key, MOLE_OFFICE_API: api, ...extra })
const call = async (args: object, extra: NodeJS.ProcessEnv = {}) =>
  (await answerOfficeMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'office_request', arguments: args } }, { env: env(extra), fetchImpl })) as any
const store = (path: string, name = 'picture.png') => ({ method: 'POST', path: '/api/report-files', body: { name, bytes: { fromFile: path } } })
const posts = () => heard.filter((one) => one.method === 'POST')
/** The real door's own limit, read as any client reads it. */
const theDoorsLimit = async (): Promise<number> => (await app.inject({ method: 'GET', url: '/api/report-files', headers: PERSON })).json<{ reportFile: { maxBytes: number } }>().reportFile.maxBytes

beforeAll(async () => {
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = dirname(t.file)
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(() => {
  // THE TWO THINGS A CASE CHANGES: its own folder, what the run sent, and whether the door lies.
  dir = mkdtempSync(join(tmpdir(), 'report-file-from-a-path-'))
  heard = []
  lie = false
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

describe('office_request stores a report file from its path', () => {
  // The run's own headers, built as office_request builds every request (officeHeaders reads the key from the server's own
  // environment, which a test process never has, so the key itself is tested where office_request is: a-codex-worker-asks-the-office-through-mcp).
  it('1: reads the file itself, sends its base64 with the run\'s own headers, and the real door stores what it read', async () => {
    const bytes = Buffer.from('\x89PNG\r\n\x1a\n' + 'a picture of a page, '.repeat(40))
    const path = join(dir, 'r57-1440-light.png')
    writeFileSync(path, bytes)
    const answer = await call(store(path, 'r57-1440-light.png'))
    expect(answer.result.isError, answer.result.content[0].text).toBe(false)
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toEqual({ name: 'r57-1440-light.png', bytes: bytes.toString('base64') })
    expect(posts()[0]!.headers).toMatchObject(officeHeaders({ workspace: identity.MOLE_OFFICE_WORKSPACE, agent: identity.MOLE_OFFICE_AGENT, session: identity.MOLE_OFFICE_SESSION, key: undefined }))
    const text: string = answer.result.content[0].text
    expect(text).toContain('201')
    expect(text).toContain(`The stored file matches ${path} as read: ${String(bytes.length)} bytes, hash ${shortHash(bytes)}.`)
    expect(text).not.toContain(bytes.toString('base64'))
    const stored = JSON.parse(text.split('\n')[1]!).file as { path: string }
    expect(existsSync(stored.path)).toBe(true)
  })

  // A SANDBOX'S FILES SIT UNDER THE HOST'S HIDDEN ~/.cache (vmKz-CMmzsDs), and a sandbox sees that same path, so a
  // hidden part alone is never a reason: a report picture under .cache/mole-office/sandboxes/<sandbox>/out is stored.
  it('1b: stores a picture from a sandbox out folder under a hidden .cache', async () => {
    const out = join(dir, '.cache', 'mole-office', 'sandboxes', 'w13k', 'out', 'r57')
    mkdirSync(out, { recursive: true })
    const bytes = Buffer.from('a report picture')
    writeFileSync(join(out, 'roles-390-dark.png'), bytes)
    const answer = await call(store(join(out, 'roles-390-dark.png'), 'roles-390-dark.png'))
    expect(answer.result.isError, answer.result.content[0].text).toBe(false)
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body.bytes).toBe(bytes.toString('base64'))
  })

  it('2: a stored hash that differs from the file is an error naming the file and both hashes', async () => {
    const bytes = Buffer.from('another picture')
    const path = join(dir, 'drawing.png')
    writeFileSync(path, bytes)
    lie = true
    const answer = await call(store(path, 'drawing.png'))
    expect(answer.result.isError).toBe(true)
    const text: string = answer.result.content[0].text
    expect(text).toContain(path)
    expect(text).toContain(shortHash(bytes))
    expect(text).toContain('0000000000000000')
    expect(text).not.toContain(bytes.toString('base64'))
  })

  it.each([
    ['a link', async () => { writeFileSync(join(dir, 'real.png'), 'x'); symlinkSync(join(dir, 'real.png'), join(dir, 'pointer.png')); return { args: store(join(dir, 'pointer.png')) } }, 'goes through a link'],
    ['a link in the path', async () => { mkdirSync(join(dir, 'real')); writeFileSync(join(dir, 'real', 'a.png'), 'x'); symlinkSync(join(dir, 'real'), join(dir, 'via')); return { args: store(join(dir, 'via', 'a.png')) } }, 'goes through a link'],
    ['a credentials folder', async () => { mkdirSync(join(dir, '.claude')); writeFileSync(join(dir, '.claude', 'a.png'), 'x'); return { args: store(join(dir, '.claude', 'a.png')) } }, 'credentials'],
    ['a credentials file', async () => { writeFileSync(join(dir, '.env.local'), 'x'); return { args: store(join(dir, '.env.local')) } }, 'credentials'],
    ['a second name for the key file', async () => { mkdirSync(join(dir, 'keys')); writeFileSync(join(dir, 'keys', 'key'), key, { mode: 0o600 }); mkdirSync(join(dir, 'out')); linkSync(join(dir, 'keys', 'key'), join(dir, 'out', 'a.png')); return { args: store(join(dir, 'out', 'a.png')), extra: { MOLE_AGENT_KEY_FILE: join(dir, 'keys', 'key') } } }, 'key file'],
    ['the key file\'s folder', async () => { mkdirSync(join(dir, 'keys')); writeFileSync(join(dir, 'keys', 'key'), key, { mode: 0o600 }); writeFileSync(join(dir, 'keys', 'a.png'), 'x'); return { args: store(join(dir, 'keys', 'a.png')), extra: { MOLE_AGENT_KEY_FILE: join(dir, 'keys', 'key') } } }, 'key file'],
    ['the office tool file', async () => { mkdirSync(join(dir, 'tool')); writeFileSync(join(dir, 'tool', 'config'), key, { mode: 0o600 }); return { args: store(join(dir, 'tool', 'config')), extra: { MOLE_OFFICE_TOOL_CONFIGURATION: join(dir, 'tool', 'config') } } }, 'never sent'],
    ['the office tool file\'s folder', async () => { mkdirSync(join(dir, 'tool')); writeFileSync(join(dir, 'tool', 'config'), key, { mode: 0o600 }); writeFileSync(join(dir, 'tool', 'a.png'), 'x'); return { args: store(join(dir, 'tool', 'a.png')), extra: { MOLE_OFFICE_TOOL_CONFIGURATION: join(dir, 'tool', 'config') } } }, 'never sent'],
    ['not a file', async () => { mkdirSync(join(dir, 'folder')); return { args: store(join(dir, 'folder')) } }, 'not a regular file'],
    ['an empty file', async () => { writeFileSync(join(dir, 'empty.png'), ''); return { args: store(join(dir, 'empty.png')) } }, 'empty'],
    // One byte over the real door's own limit, as a sparse file, so nothing that large is ever written or read.
    ['over the limit', async () => { const limit = await theDoorsLimit(); const fd = openSync(join(dir, 'big.png'), 'w'); ftruncateSync(fd, limit + 1); closeSync(fd); return { args: store(join(dir, 'big.png')), says: String(limit) } }, 'at most'],
    ['the run key file', async () => { writeFileSync(join(dir, 'key'), key + '\n', { mode: 0o600 }); return { args: store(join(dir, 'key')), extra: { MOLE_AGENT_KEY_FILE: join(dir, 'key') } } }, 'key file'],
    ['a relative path', async () => ({ args: store('out/picture.png') }), 'full path'],
    ['another door', async () => { writeFileSync(join(dir, 'a.png'), 'x'); return { args: { method: 'POST', path: '/api/records', body: { kind: 'note', bytes: { fromFile: join(dir, 'a.png') } } } } }, '/api/report-files'],
    ['extra keys', async () => { writeFileSync(join(dir, 'a.png'), 'x'); return { args: { method: 'POST', path: '/api/report-files', body: { name: 'a.png', bytes: { fromFile: join(dir, 'a.png'), encoding: 'hex' } } } } }, 'fromFile'],
  ] as const)('3: refuses %s with a sentence, and sends nothing', async (_which, make, says) => {
    const { args, extra, says: alsoSays } = (await make()) as { args: object; extra?: NodeJS.ProcessEnv; says?: string }
    const answer = await call(args, extra)
    expect(answer.result.isError).toBe(true)
    expect(answer.result.content[0].text).toContain(says)
    if (alsoSays !== undefined) expect(answer.result.content[0].text).toContain(alsoSays)
    expect(answer.result.content[0].text).toContain('Nothing was sent')
    expect(posts()).toHaveLength(0)
  })

  it('4: a body whose bytes are already base64 text is sent as it came', async () => {
    const answer = await call({ method: 'POST', path: '/api/report-files', body: { name: 'tiny.png', bytes: 'aGk=' } })
    expect(answer.result.isError, answer.result.content[0].text).toBe(false)
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toEqual({ name: 'tiny.png', bytes: 'aGk=' })
    expect(heard.filter((one) => one.method === 'GET')).toHaveLength(0)
  })
})

describe("dsh's office tool stores a report file from its path", () => {
  const aTool = (extra: NodeJS.ProcessEnv = {}) => theOfficeRequestTool({ defineTool: (options: unknown) => options, fetchImpl, env: env(extra) }) as {
    execute: (args: object, exec: object) => Promise<{ status: number; added: string | null }>
  }

  it('a: reads and stores the file as base64', async () => {
    const bytes = Buffer.from('a report picture')
    const path = join(dir, 'drawing.png')
    writeFileSync(path, bytes)
    const answer = await aTool().execute(store(path, 'drawing.png'), {})
    expect(answer.status).toBe(201)
    expect(answer.added).toContain('The stored file matches')
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body.bytes).toBe(bytes.toString('base64'))
  })

  it('b: refuses a stored hash that differs from the file', async () => {
    const path = join(dir, 'drawing.png')
    writeFileSync(path, 'a report picture')
    lie = true
    await expect(aTool().execute(store(path, 'drawing.png'), {})).rejects.toThrow('THE STORED FILE DOES NOT MATCH')
  })

  it('c: refuses a file on another door and sends nothing', async () => {
    const path = join(dir, 'drawing.png')
    writeFileSync(path, 'a report picture')
    await expect(aTool().execute({ method: 'POST', path: '/api/records', body: { bytes: { fromFile: path } } }, {})).rejects.toThrow('/api/report-files')
    expect(heard).toHaveLength(0)
  })

  it('d: refuses the office tool file and sends nothing', async () => {
    mkdirSync(join(dir, 'tool'))
    const path = join(dir, 'tool', 'config')
    writeFileSync(path, key, { mode: 0o600 })
    await expect(aTool({ MOLE_OFFICE_TOOL_CONFIGURATION: path }).execute(store(path), {})).rejects.toThrow('never sent')
    expect(posts()).toHaveLength(0)
  })

  it('e: refuses fields it cannot give before the file is read, and sends nothing', async () => {
    const path = join(dir, 'drawing.png')
    writeFileSync(path, 'a report picture')
    await expect(aTool().execute({ ...store(path), fields: 'no-such-mode' }, {})).rejects.toThrow('Nothing was sent')
    expect(heard).toHaveLength(0)
  })
})
