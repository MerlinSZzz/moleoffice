// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO OPENROUTER IMAGE TOOLS WRITE INTO THE FOLDER THEY ARE TOLD, AND NOWHERE ELSE.
 *
 * Both tools used to write only into the repository's public folders, so no test could start them. Each now takes
 * `--out <folder>` for its whole output root: the avatar tool writes one PNG there, and the portrait tool writes its
 * picture, its ledger and its README block there. A stand-in office answers the tool token and the carrying route, and
 * every picture the tools are given is made up in this file.
 *
 * THE REPOSITORY'S OWN PUBLIC FOLDERS ARE READ BEFORE AND AFTER EACH WRITING CASE, so "where they are told, and
 * nowhere else" is proved and not only said. The stand-in token door can answer a token, the office's unpriced-model
 * refusal, or another refusal: the unpriced case proves the narrow fallback, and the refused case proves the fallback
 * does not happen for anything else.
 *
 * NO REAL KEY, NO LIVE OFFICE, NO PROVIDER. Every key and token is made up for this file. The tools are started as
 * processes of their own, with only the stand-in office in their environment.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const AVATARS = fileURLToPath(new URL('../tools/avatars-from-openrouter.mjs', import.meta.url))
const PORTRAITS = fileURLToPath(new URL('../tools/portraits-from-openrouter.mjs', import.meta.url))
const PUBLIC_AVATARS = fileURLToPath(new URL('../public/avatars/generated/', import.meta.url))
const PUBLIC_PORTRAITS = fileURLToPath(new URL('../public/portraits/', import.meta.url))

/** A one-pixel PNG, made up for this file: the stand-in image model returns it, and the portrait tool keeps it whole. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_BASE64 = PNG.toString('base64')
const COST = 0.0123

/** The two sentences the stand-in token door can refuse with; the office owns the words and this file only stands in. */
const NO_PRICE_TABLE = "No price table is set, so the office cannot count this run's spend against its cap. Nothing was issued."
const NOT_THE_RUNS_KEY = "This key is not the run's own key. Nothing was issued."

const AGENT = 'image-tools-stand-in'
const RUN = `run-${randomUUID()}`
const RUN_KEY = randomBytes(32).toString('hex')
const TOOL_TOKEN = `mrt_${randomBytes(32).toString('base64url')}`

interface Asked {
  provider: string
  path: string
  body: { prompt?: string; input_references?: unknown[] }
}

let office: Server
let officePort = 0
let home = ''
let minted: { run: string; provider: string; model: string }[] = []
let asked: Asked[] = []
let keyHeaders: (string | undefined)[] = []

/** What the stand-in token door answers: a token, the office's unpriced-model refusal, or another refusal. */
type TokenDoor = 'token' | 'unpriced' | 'refused'
let tokenDoor: TokenDoor = 'token'

function theBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => done(Buffer.concat(parts).toString('utf8')))
    req.on('error', failed)
  })
}

beforeAll(async () => {
  office = createServer((req, res) => {
    void theBody(req).then((body) => {
      const send = (status: number, answer: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
      keyHeaders.push(req.headers['x-mole-office-key'] as string | undefined)
      if (req.method === 'POST' && req.url === '/api/provider-router/tool-tokens') {
        if (tokenDoor === 'unpriced') return send(409, { error: NO_PRICE_TABLE })
        if (tokenDoor === 'refused') return send(403, { error: NOT_THE_RUNS_KEY })
        const token = JSON.parse(body) as { run: string; provider: string; model: string }
        minted.push(token)
        if (req.headers['x-mole-office-key'] !== RUN_KEY) return send(403, { error: 'the stand-in office did not get the run key' })
        return send(201, { token: TOOL_TOKEN, run: token.run, provider: token.provider, model: token.model })
      }
      if (req.method === 'POST' && req.url === '/api/provider-router/tool-requests') {
        if (req.headers.authorization !== `Bearer ${TOOL_TOKEN}`) return send(401, { error: 'the stand-in office did not get the tool token' })
        const carried = JSON.parse(body) as Asked
        asked.push(carried)
        return send(200, { data: [{ b64_json: PNG_BASE64, media_type: 'image/png' }], usage: { cost: COST } })
      }
      send(404, { error: 'the stand-in office has no such door' })
    })
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  officePort = (office.address() as AddressInfo).port
  home = mkdtempSync(join(tmpdir(), 'mole-office-image-tools-'))
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office?.close(() => done()))
  rmSync(home, { recursive: true, force: true })
})

interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

/** One tool, started as a process of its own, with the environment built here and nothing else inherited. */
function runTool(script: string, args: string[]): Promise<Ran> {
  const env: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: process.env['HOME'] ?? home,
    TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
    MOLE_OFFICE_API: `http://127.0.0.1:${String(officePort)}`,
    MOLE_OFFICE_WORKSPACE: 'panelx',
    MOLE_OFFICE_AGENT: AGENT,
    MOLE_OFFICE_SESSION: RUN,
    MOLE_AGENT_KEY: RUN_KEY,
    // THE KEY FILE IS BESIDE THE DATABASE NAMED HERE, under this test's own home, so the office's real key file is
    // never read. OPENROUTER_API_KEY is set to an empty value on purpose: the tool loads the checkout's .env, and a
    // name already in this child's environment is not overwritten by that load, so the real key cannot reach the
    // provider through the key-file path either.
    MOLE_OFFICE_DB: join(home, 'office', 'mole-office.db'),
    OPENROUTER_API_KEY: '',
  }
  if (process.env['PLAYWRIGHT_BROWSERS_PATH'] !== undefined) env['PLAYWRIGHT_BROWSERS_PATH'] = process.env['PLAYWRIGHT_BROWSERS_PATH']
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    const late = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.on('error', failed)
    child.on('close', (exit) => {
      clearTimeout(late)
      done({ code: exit, stdout, stderr })
    })
  })
}

/** The width and height in a PNG's own header. */
function pngSide(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * Every file in a folder, by name and by the SHA-256 of its bytes: names alone cannot tell one picture from another.
 * The digest and not the bytes, because toEqual on the 16 MB of the repository's avatars took 18 seconds each time.
 */
function thePicturesIn(folder: string): { name: string; sha256: string }[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, sha256: createHash('sha256').update(readFileSync(join(folder, entry.name))).digest('hex') }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// EACH CASE WAITS FOR A TOOL PROCESS THAT runTool KILLS AFTER 60 SECONDS, so each case's bound is longer than that, and
// a tool that is slow to start under load is not a timeout. The avatar tool starts Chromium to resize its picture.
describe('the image tools write where they are told', { timeout: 90_000 }, () => {
  it('writes an avatar into the --out folder at 512 square, through the office carrying route', async () => {
    tokenDoor = 'token'
    minted = []
    asked = []
    keyHeaders = []
    const publicAvatarsBefore = thePicturesIn(PUBLIC_AVATARS)
    const out = join(home, 'avatars')
    const prompt = 'A made-up mole holding a made-up spanner.'
    const ran = await runTool(AVATARS, ['made-up-avatar', prompt, '--out', out])
    expect(ran.code, ran.stderr.slice(0, 2_000)).toBe(0)
    const file = join(out, 'made-up-avatar.png')
    expect(existsSync(file), `${file} was not written`).toBe(true)
    const bytes = readFileSync(file)
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(pngSide(bytes)).toEqual({ width: 512, height: 512 })
    expect(ran.stdout).toContain(file)
    // AND NOWHERE ELSE: the repository's own generated-avatar folder is exactly as it was.
    expect(thePicturesIn(PUBLIC_AVATARS)).toEqual(publicAvatarsBefore)
    expect(readdirSync(PUBLIC_AVATARS)).not.toContain('made-up-avatar.png')
    // The mint named the tool's provider and the run, and the carrying route held its one image path.
    expect(keyHeaders).toEqual([RUN_KEY, RUN_KEY])
    expect(minted).toEqual([{ run: RUN, provider: 'openrouter', model: expect.any(String) }])
    expect(asked.map((one) => `${one.provider} ${one.path}`)).toEqual(['openrouter /images'])
    expect(asked[0]?.body.prompt).toBe(prompt)
    // Neither secret is printed.
    expect(`${ran.stdout}${ran.stderr}`).not.toContain(RUN_KEY)
    expect(`${ran.stdout}${ran.stderr}`).not.toContain(TOOL_TOKEN)
  })

  it('writes a portrait, its ledger and its README block into the --out folder', async () => {
    tokenDoor = 'token'
    minted = []
    asked = []
    keyHeaders = []
    const out = join(home, 'portraits')
    mkdirSync(join(out, 'reference'), { recursive: true })
    writeFileSync(join(out, 'reference/moleagents.png'), PNG)
    writeFileSync(join(out, 'README.md'), '# Made-up portraits\n\n<!-- runs:start -->\n<!-- runs:end -->\n')
    // BEFORE THE RUN, the repository's own ledger, README and worker picture, byte for byte.
    const publicPortraitBefore = {
      ledger: readFileSync(join(PUBLIC_PORTRAITS, 'runs.json')),
      readme: readFileSync(join(PUBLIC_PORTRAITS, 'README.md')),
      picture: readFileSync(join(PUBLIC_PORTRAITS, 'worker/worker-1.png')),
    }
    const ran = await runTool(PORTRAITS, ['worker', '1', '--out', out])
    expect(ran.code, ran.stderr.slice(0, 2_000)).toBe(0)
    // AND NOWHERE ELSE: those three repository files are byte-identical after the run.
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'runs.json'))).toEqual(publicPortraitBefore.ledger)
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'README.md'))).toEqual(publicPortraitBefore.readme)
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'worker/worker-1.png'))).toEqual(publicPortraitBefore.picture)
    const file = join(out, 'worker', 'worker-1.png')
    expect(existsSync(file), `${file} was not written`).toBe(true)
    expect(readFileSync(file)).toEqual(PNG)
    // The ledger says what was asked, what it cost and that the reference went with it.
    const ledger = JSON.parse(readFileSync(join(out, 'runs.json'), 'utf8')) as {
      file: string
      role: string
      n: number
      run: number
      model: string
      referenceSent: boolean
      cost: number
      bytes: number
      prompt: string
      replaced: boolean
    }[]
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      file: 'worker/worker-1.png',
      role: 'worker',
      n: 1,
      run: 1,
      model: expect.any(String),
      referenceSent: true,
      cost: COST,
      bytes: PNG.length,
      replaced: false,
    })
    expect(ledger[0]?.prompt.length).toBeGreaterThan(0)
    // The README block was rendered in that same folder, between its own markers.
    const readme = readFileSync(join(out, 'README.md'), 'utf8')
    expect(readme).toContain('<!-- runs:start -->')
    expect(readme).toContain('worker/worker-1.png')
    expect(readme).toContain(`$${COST.toFixed(4)}`)
    expect(readme).toContain('<!-- runs:end -->')
    expect(keyHeaders).toEqual([RUN_KEY, RUN_KEY])
    expect(asked.map((one) => `${one.provider} ${one.path}`)).toEqual(['openrouter /images'])
    expect(asked[0]?.body.input_references).toHaveLength(1)
    expect(`${ran.stdout}${ran.stderr}`).not.toContain(RUN_KEY)
    expect(`${ran.stdout}${ran.stderr}`).not.toContain(TOOL_TOKEN)
  })

  it('falls back to the key file for an unpriced avatar, and refuses when the key is empty', async () => {
    tokenDoor = 'unpriced'
    minted = []
    asked = []
    keyHeaders = []
    const publicAvatarsBefore = thePicturesIn(PUBLIC_AVATARS)
    const out = join(home, 'unpriced-avatars')
    const ran = await runTool(AVATARS, ['made-up-unpriced-avatar', 'A made-up mole for an unpriced model.', '--out', out])
    expect(ran.code, ran.stderr.slice(0, 2_000)).toBe(2)
    // THE REASON IS NOT HIDDEN: the office's own sentence is on stdout, and the tool says where it goes next.
    expect(ran.stdout).toContain(NO_PRICE_TABLE)
    expect(ran.stdout).toMatch(/key file/u)
    // The key-file path refuses the empty value this child was given, before any provider call.
    expect(ran.stderr).toContain('OPENROUTER_API_KEY')
    expect(ran.stderr).toMatch(/empty/iu)
    // Nothing was minted or carried, and no file was written where it was told or anywhere else.
    expect(minted).toEqual([])
    expect(asked).toEqual([])
    expect(keyHeaders).toEqual([RUN_KEY])
    expect(existsSync(join(out, 'made-up-unpriced-avatar.png'))).toBe(false)
    expect(thePicturesIn(PUBLIC_AVATARS)).toEqual(publicAvatarsBefore)
    expect(readdirSync(PUBLIC_AVATARS)).not.toContain('made-up-unpriced-avatar.png')
  })

  it('falls back to the key file for an unpriced portrait, and refuses when the key is empty', async () => {
    tokenDoor = 'unpriced'
    minted = []
    asked = []
    keyHeaders = []
    const out = join(home, 'unpriced-portraits')
    mkdirSync(join(out, 'reference'), { recursive: true })
    writeFileSync(join(out, 'reference/moleagents.png'), PNG)
    writeFileSync(join(out, 'README.md'), '# Made-up portraits\n\n<!-- runs:start -->\n<!-- runs:end -->\n')
    const readmeBefore = readFileSync(join(out, 'README.md'))
    const publicPortraitBefore = {
      ledger: readFileSync(join(PUBLIC_PORTRAITS, 'runs.json')),
      readme: readFileSync(join(PUBLIC_PORTRAITS, 'README.md')),
      picture: readFileSync(join(PUBLIC_PORTRAITS, 'worker/worker-1.png')),
    }
    const ran = await runTool(PORTRAITS, ['worker', '1', '--out', out])
    expect(ran.code, ran.stderr.slice(0, 2_000)).toBe(2)
    // THE REASON IS NOT HIDDEN: the office's own sentence is on stdout, and the tool says where it goes next.
    expect(ran.stdout).toContain(NO_PRICE_TABLE)
    expect(ran.stdout).toMatch(/key file/u)
    // The key-file path refuses the empty value this child was given, before any provider call.
    expect(ran.stderr).toContain('OPENROUTER_API_KEY')
    expect(ran.stderr).toMatch(/empty/iu)
    // Nothing was minted or carried, and no picture, ledger or README block was written.
    expect(minted).toEqual([])
    expect(asked).toEqual([])
    expect(keyHeaders).toEqual([RUN_KEY])
    expect(existsSync(join(out, 'worker', 'worker-1.png'))).toBe(false)
    expect(existsSync(join(out, 'runs.json'))).toBe(false)
    expect(readFileSync(join(out, 'README.md'))).toEqual(readmeBefore)
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'runs.json'))).toEqual(publicPortraitBefore.ledger)
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'README.md'))).toEqual(publicPortraitBefore.readme)
    expect(readFileSync(join(PUBLIC_PORTRAITS, 'worker/worker-1.png'))).toEqual(publicPortraitBefore.picture)
  })

  it('does not fall back when the token door refuses for another reason', async () => {
    tokenDoor = 'refused'
    minted = []
    asked = []
    keyHeaders = []
    const publicAvatarsBefore = thePicturesIn(PUBLIC_AVATARS)
    const out = join(home, 'refused-avatars')
    const ran = await runTool(AVATARS, ['made-up-refused-avatar', 'A made-up mole the office refused.', '--out', out])
    expect(ran.code, ran.stderr.slice(0, 2_000)).toBe(2)
    // THE OFFICE'S SENTENCE IS SHOWN, the key-file path is never entered, and no fallback line is printed.
    expect(ran.stderr).toContain(NOT_THE_RUNS_KEY)
    expect(ran.stderr).not.toContain('OPENROUTER_API_KEY')
    expect(ran.stdout).not.toContain(NO_PRICE_TABLE)
    expect(ran.stdout).not.toMatch(/key file/u)
    // Nothing was minted or carried, and no file was written where it was told or anywhere else.
    expect(minted).toEqual([])
    expect(asked).toEqual([])
    expect(keyHeaders).toEqual([RUN_KEY])
    expect(existsSync(join(out, 'made-up-refused-avatar.png'))).toBe(false)
    expect(thePicturesIn(PUBLIC_AVATARS)).toEqual(publicAvatarsBefore)
    expect(readdirSync(PUBLIC_AVATARS)).not.toContain('made-up-refused-avatar.png')
  })
})
