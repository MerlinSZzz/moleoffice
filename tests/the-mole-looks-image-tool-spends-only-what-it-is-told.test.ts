// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MOLE LOOKS IMAGE TOOL REFUSES UNSUITABLE REQUESTS, LIMITS SPENDING AND KEEPS ITS KEY PRIVATE.
 * A local OpenRouter stand-in and a separate tool process prove refusals, the budget boundary, masked errors,
 * chat and image answers, large images, and malformed base64. The reference is rebuilt from the village atlases.
 * The child receives a made-up key and a private home and database path, never the office or the checkout key.
 *
 * Mutations this file catches: remove the OpenAI refusal, remove the budget check, remove masking from error
 * answers, restore the old deep base64 regex, or remove either live office port refusal.
 * The guard reads the live office's ports and never types one.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { INSTANCE_FILE } from '../tools/sandbox-common.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const TOOL = join(ROOT, 'tools/mole-looks-from-openrouter.mjs')
const ASSETS = join(ROOT, 'plugins/office-map/assets')
const SPEC = JSON.parse(readFileSync(join(ROOT, 'plugins/office-map/tools/mole-looks/prompts.json'), 'utf8')) as { reference: { sha256First16: string } }
const KEY = `made-up-${randomBytes(20).toString('hex')}`
const MODEL = 'example/painter'
const CHAT = 'example/chat-painter'
const TEXT = 'example/text-only'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xQAAAAASUVORK5CYII=', 'base64')
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const imageModel = (id: string) => ({ id, architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }, supported_parameters: { aspect_ratio: { values: ['1:1'] }, input_references: { max: 1 } } })
let home = '', ref = '', port = 0, server: Server
let posts: string[] = []
let requests = 0
let answer = PNG.toString('base64')
let status = 200
let errorAnswer = false

beforeAll(async () => {
  home = aTestDatabaseFolder('mole-looks-image-tool')
  ref = join(home, 'reference.png')
  const catalog = JSON.parse(readFileSync(join(ASSETS, 'village-catalog.json'), 'utf8')) as { sprites: Record<string, { atlas: string; rect: [number, number, number, number]; trim: [number, number] }> }
  const names = ['tuft', 'fringe', 'bun', 'fan', 'crest', 'helmet', 'waves', 'part', 'beret', 'knit', 'raincoat', 'apron', 'bowtie', 'backpack', 'roll', 'flower']
  const tiles: { input: Buffer; left: number; top: number }[] = []
  for (const [i, name] of names.entries()) {
    const sprite = catalog.sprites[`stand-${name}`]!
    const [left, top, width, height] = sprite.rect
    const cut = await sharp(join(ASSETS, `${sprite.atlas}.png`)).extract({ left, top, width, height }).png().toBuffer()
    const tile = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: cut, left: sprite.trim[0], top: sprite.trim[1] }]).png().toBuffer()
    tiles.push({ input: await sharp(tile).resize(256, 256, { kernel: 'nearest' }).png().toBuffer(), left: (i % 4) * 256, top: Math.floor(i / 4) * 256 })
  }
  const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } }).composite(tiles).flatten({ background: '#ffffff' }).png().toBuffer()
  expect(digest(sheet).slice(0, 16), 'The atlas recipe no longer gives the reference named in prompts.json').toBe(SPEC.reference.sha256First16)
  writeFileSync(ref, sheet)
  server = createServer((req, res) => {
    requests++
    const send = (value: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (req.method === 'GET' && req.url === '/images/models') return send({ data: [imageModel(MODEL), imageModel('openai/example')] })
    if (req.method === 'GET' && req.url === '/models') return send({ data: [imageModel(CHAT), { id: TEXT, architecture: { output_modalities: ['text'] } }] })
    if (req.method === 'GET' && req.url?.endsWith('/endpoints')) return send({ endpoints: [] })
    if (req.method === 'POST') {
      posts.push(req.url ?? '')
      req.resume()
      req.on('end', () => {
        if (errorAnswer) return send({ error: `stand-in echoed ${KEY}`, usage: { cost: 0.12 } }, status)
        if (req.url === '/chat/completions') return send({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${answer}` } }] } }], usage: { cost: 0.12 } })
        return send({ data: [{ b64_json: answer }], usage: { cost: 0.12 } })
      })
      return
    }
    send({}, 404)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()))
  if (home) removeThisTestFolder(home)
})
beforeEach(() => { requests = 0; posts = []; answer = PNG.toString('base64'); status = 200; errorAnswer = false })

interface Ran { code: number | null; output: string }
function run(args: string[], extraEnv: Record<string, string> = {}): Promise<Ran> {
  const env = { PATH: process.env['PATH'] ?? '', HOME: home, MOLE_OFFICE_DB: join(home, 'office', 'mole-office.db'), OPENROUTER_API_KEY: KEY, ...extraEnv }
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [TOOL, ...args], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
    child.on('error', fail)
    child.on('close', (code) => { clearTimeout(timer); done({ code, output }) })
  })
}
function args(out: string, model = MODEL, reference = ref): string[] {
  return ['--models', model, '--reference', reference, '--out', out, '--most-dollars', '1', '--figures', 'gardener', '--api', `http://127.0.0.1:${port}`]
}
function files(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(folder, e.name)) : e.isFile() ? [join(folder, e.name)] : [])
}
function pictures(folder: string): string[] { return files(folder).filter((f) => f.endsWith('.png')) }

describe('the mole looks image tool', () => {
  it('refuses the checkout office port before any request', async () => {
    const out = join(home, 'checkout-port')
    const ran = await run(args(out), { MOLE_OFFICE_PORT: String(port) })
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain("the live office's port")
    expect(requests).toBe(0)
    expect(pictures(out)).toEqual([])
  })
  it('refuses the sandbox office port before any request', async () => {
    const out = join(home, 'sandbox-port')
    const sandbox = join(home, 'sandbox-with-api')
    mkdirSync(sandbox)
    writeFileSync(join(sandbox, INSTANCE_FILE), JSON.stringify({ api: `http://127.0.0.1:${port}` }))
    const ran = await run(args(out), { SANDBOX_DIR: sandbox })
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain("the live office's port")
    expect(requests).toBe(0)
    expect(pictures(out)).toEqual([])
  })
  it('refuses an unreadable sandbox office port before any request', async () => {
    const out = join(home, 'sandbox-unreadable')
    const sandbox = join(home, 'sandbox-without-api')
    mkdirSync(sandbox)
    writeFileSync(join(sandbox, INSTANCE_FILE), JSON.stringify({}))
    const ran = await run(args(out), { SANDBOX_DIR: sandbox })
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain("live office's ports could not be read")
    expect(requests).toBe(0)
    expect(pictures(out)).toEqual([])
  })
  it.each([
    ['OpenAI', 'openai/example', 'Codex subscription'],
    ['subscription', 'anthropic/claude-example', 'Claude subscription'],
    ['text only', TEXT, 'image output'],
  ])('refuses %s before any picture request', async (_name, model, words) => {
    const out = join(home, `refuse-${model.replace('/', '-')}`)
    const ran = await run(args(out, model))
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain(words)
    expect(posts).toEqual([])
    expect(pictures(out)).toEqual([])
  })
  it('refuses the wrong reference before any picture request', async () => {
    const out = join(home, 'wrong-reference')
    const ran = await run(args(out, MODEL, join(ROOT, 'plugins/office-map/tools/mole-looks/prompts.json')))
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain('wrong sha256')
    expect(posts).toEqual([])
    expect(pictures(out)).toEqual([])
  })
  it('refuses an output inside a worktree before any picture request', async () => {
    const out = join(ROOT, 'mole-looks-test-refused-output')
    expect(existsSync(out)).toBe(false)
    const ran = await run(args(out))
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain('outside every git worktree')
    expect(posts).toEqual([])
    expect(pictures(out)).toEqual([])
  })
  it('stops after the request that crosses the spending limit', async () => {
    const out = join(home, 'budget')
    const argv = args(out)
    argv[argv.indexOf('--most-dollars') + 1] = '0.2'
    argv[argv.indexOf('--figures') + 1] = 'gardener,librarian,mapmaker'
    const ran = await run(argv)
    expect(ran.code, ran.output).toBe(3)
    expect(ran.output).toContain('was not sent')
    expect(posts).toEqual(['/images', '/images'])
    expect(pictures(out)).toHaveLength(2)
  })
  it('masks a key echoed by an error in output and files', async () => {
    status = 400; errorAnswer = true
    const ran = await run(args(join(home, 'error')))
    expect(ran.code).not.toBe(0)
    expect(posts).toEqual(['/images'])
    expect(ran.output).toContain('[the key]')
    expect(ran.output).not.toContain(KEY)
    for (const file of files(home)) expect(readFileSync(file).includes(Buffer.from(KEY)), file).toBe(false)
  })
  it('uses chat for a model only in the general catalogue and saves the same bytes', async () => {
    const out = join(home, 'chat')
    const ran = await run(args(out, CHAT))
    expect(ran.code, ran.output).toBe(0)
    expect(posts).toEqual(['/chat/completions'])
    expect(readFileSync(join(out, 'example__chat-painter/raw/gardener.png'))).toEqual(PNG)
  })
  it('saves an image whose base64 answer exceeds eight megabytes intact', async () => {
    const image = await sharp(randomBytes(2400 * 900 * 3), { raw: { width: 2400, height: 900, channels: 3 } }).png().toBuffer()
    answer = image.toString('base64')
    expect(answer.length).toBeGreaterThanOrEqual(8 * 1024 * 1024)
    const out = join(home, 'large')
    const ran = await run(args(out))
    expect(ran.code, ran.output).toBe(0)
    expect(posts).toEqual(['/images'])
    expect(digest(readFileSync(join(out, 'example__painter/raw/gardener.png')))).toBe(digest(image))
  })
  it.each(['bad character', 'bad length', 'middle padding'])('refuses base64 with %s before writing a picture', async (kind) => {
    const valid = PNG.toString('base64')
    const middle = Math.floor(valid.length / 2)
    answer = kind === 'bad length' ? valid.slice(1) : valid.slice(0, middle) + (kind === 'bad character' ? '!' : '=') + valid.slice(middle + 1)
    const out = join(home, `bad-${kind.replace(' ', '-')}`)
    const ran = await run(args(out))
    expect(ran.code).not.toBe(0)
    expect(ran.output).toContain('valid image')
    expect(posts).toEqual(['/images'])
    expect(pictures(out)).toEqual([])
  })
})
