// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPENROUTER TOOL REVIEWS A VIDEO, CHECKS THE LIMITS FIRST, RECORDS THE COST AFTER, AND SHOWS ITS KEY TO NOBODY.
 *
 * tools/openrouter.mjs is the one way an agent uses OpenRouter, by a decision, the brief for
 * wave 13s round 41, and the answers RStB5cUMmluT, vbDf83UQeVOh and RFQuMw4h09jZ. Each test here runs the tool as a
 * process of its own and reads what it printed, what it sent and what it wrote:
 *   - a call sends the video inline, as a base64 data URL in a video_url part, asks for usage, and prints the answer;
 *   - the receipt holds OpenRouter's cost and tokens and neither the prompt nor the answer, in a 0700 folder and a 0600
 *     file, and says when an answer carried no usage;
 *   - the key is the office's own, read beside the database MOLE_OFFICE_DB names, never the sandboxes' secret, and
 *     with no key there the tool refuses and names where it looked;
 *   - the key appears in no output and no file, even when OpenRouter's error body echoes it;
 *   - every refusal says why, exits 2 and sends nothing to the model;
 *   - an error status or no answer at all exits 75;
 *   - --processing goes on the video part when it is given and not at all when it is not, and only with a Google model;
 *   - a model one of our subscriptions carries is refused before anything is asked, with words naming the subscription
 *     and the program to use instead (round 43), and a Google model still goes
 *     through;
 *   - with no shell key or configuration, the exact use body is printed for office_request, without the prompt;
 *   - a process the test suite started cannot reach OpenRouter itself;
 *   - the toolset's entry for OpenRouter is built, and its example is a call the tool takes;
 *   - the Settings page's sentence about the office's OpenRouter key names every tool that reads it (2dNSGdlbH3wc).
 *
 * NO TEST HERE CALLS OPENROUTER. A small HTTP server this file starts, on a port the system gives it, stands in for
 * OpenRouter and for the office. The tool is aimed at it through main()'s `api`, which the tool's command line never
 * sets. Every key is made up: the office's, in a key file beside a database path under a folder made for each test,
 * and a different one in a sandboxes' secrets file in the same folder's home, which the tool must never read.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { keysPathFrom } from '../src/config/settings.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { OFFICE_KEY_MEANS } from '../src/shared/office-keys.ts'
import { localStamp } from '../src/shared/time.ts'
import { chineseWords } from '../src/shared/words/joined.ts'
import { ANSWER_TOKEN_CAP, dollars, THE_SLUG, theEstimate } from '../tools/openrouter.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const TOOL = fileURLToPath(new URL('../tools/openrouter.mjs', import.meta.url))
const MODEL = 'google/gemini-3.8-flash'
/** The stand-in's prices for MODEL, in dollars a token, as OpenRouter's list writes them. */
const PRICES = { prompt: '0.00000075', completion: '0.00000375' }
const WORDS_ONLY = 'stand-in/words-only'
/** An alias OpenRouter's list holds for Google's newest Flash model (read on 13 October 2026), which takes video. */
const GEMINI_ALIAS = '~google/gemini-flash-latest'
const ANSWER = 'The arm reaches the cup at 0:12, and the light flickers once at 0:31.'
const USAGE = { prompt_tokens: 3210, completion_tokens: 87, total_tokens: 3297, cost: 0.00273 }
/** A word only the prompt holds, so a file or a line that holds it holds the prompt. */
const PROMPT_MARK = `prompt-mark-${randomBytes(6).toString('hex')}`
const PROMPT = `Say whether the robot moves, and when. ${PROMPT_MARK}`
const SECONDS = 40

// ============================================================================ the stand-in

interface Asked {
  method: string
  path: string
  authorization: string | undefined
  headers: Record<string, string | string[] | undefined>
  body: string
}

interface Stage {
  key: { status: number; body: string }
  chat: { status: number; body: string } | 'hang'
}

function aStage(): Stage {
  return {
    key: { status: 200, body: JSON.stringify({ data: { label: 'stand-in', limit: null, limit_remaining: null, usage: 0.22 } }) },
    chat: {
      status: 200,
      body: JSON.stringify({ id: 'gen-stand-in', model: MODEL, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: ANSWER } }], usage: USAGE }),
    },
  }
}

let server: Server
let port = 0
let stage: Stage = aStage()
let asked: Asked[] = []
const hanging: ServerResponse[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const path = req.url ?? ''
      asked.push({ method: req.method ?? '', path, authorization: req.headers.authorization, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
      const send = (status: number, body: string) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(body)
      }
      if (req.method === 'GET' && path === '/api/v1/models') {
        send(200, JSON.stringify({ data: [
          { id: MODEL, architecture: { input_modalities: ['text', 'image', 'audio', 'video'] }, pricing: PRICES },
          { id: WORDS_ONLY, architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' } },
          { id: GEMINI_ALIAS, architecture: { input_modalities: ['text', 'image', 'audio', 'video'] }, pricing: PRICES },
        ] }))
      } else if (req.method === 'GET' && path === '/api/v1/key') send(stage.key.status, stage.key.body)
      else if (req.method === 'POST' && path === '/api/v1/chat/completions') {
        if (stage.chat === 'hang') hanging.push(res)
        else send(stage.chat.status, stage.chat.body)
      } else if (req.method === 'POST' && path === '/api/toolset/uses') send(201, JSON.stringify({ written: true, run: 'stand-in-run' }))
      else send(404, '{"error":"The stand-in has no such door."}')
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  for (const res of hanging) res.destroy()
  server.closeAllConnections()
  await new Promise<void>((done) => server.close(() => done()))
})

// ============================================================================ a home, a key and a video

let home = ''
let key = ''
/** The key's own random part: shown anywhere, even without its prefix, it is the key shown. */
let keyTail = ''
/** The sandboxes' key, a different one, which the tool must never read or send. */
let sandboxKey = ''

/** The database path the tool is given. Its key file is beside it, where keysPathFrom says. */
function database(): string {
  return join(home, 'office', 'mole-office.db')
}

/** The Codex model cache made for this test process. The tool only reads it. */
function writeCodexModels(slugs: string[] = ['gpt-6-astra']): string {
  const folder = join(home, '.codex')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const file = join(folder, 'models_cache.json')
  writeFileSync(file, `${JSON.stringify({ models: slugs.map((slug) => ({ slug })) }, null, 2)}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

/** Every file under this test's Codex home, with the size and modification time the tool must leave alone. */
function filesUnderCodex(folder = join(home, '.codex')): { path: string; size: number; mtimeMs: number }[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = join(folder, entry.name)
    if (entry.isDirectory()) return filesUnderCodex(file)
    const stat = statSync(file)
    return [{ path: file, size: stat.size, mtimeMs: stat.mtimeMs }]
  })
}

/** An opencode command on this test's PATH. It prints only the list the test gives it. */
function writeOpenCodeStandIn(): void {
  const bin = join(home, 'bin')
  mkdirSync(bin, { recursive: true, mode: 0o700 })
  const file = join(bin, 'opencode')
  writeFileSync(file, [
    '#!/bin/sh',
    'if [ "$1" != "models" ] || [ "$2" != "opencode-go" ]; then printf "%s\\n" "unexpected opencode arguments" >&2; exit 64; fi',
    'if [ -n "$OPENROUTER_TEST_OPENCODE_SLEEP_SECONDS" ]; then sleep "$OPENROUTER_TEST_OPENCODE_SLEEP_SECONDS"; fi',
    'if [ "$OPENROUTER_TEST_OPENCODE_EXIT" != "0" ]; then printf "%s\\n" "$OPENROUTER_TEST_OPENCODE_STDERR" >&2; exit "$OPENROUTER_TEST_OPENCODE_EXIT"; fi',
    'printf "%s\\n" "$OPENROUTER_TEST_OPENCODE_MODELS"',
    '',
  ].join('\n'), { mode: 0o700 })
  chmodSync(file, 0o700)
}

function keyFile(): string {
  return keysPathFrom({ MOLE_OFFICE_DB: database() })
}

/** The office's key file, in the shape src/server/lib/keys.ts writes, holding these providers. */
function writeTheKeyFile(providers: Record<string, string>): void {
  mkdirSync(join(home, 'office'), { recursive: true, mode: 0o700 })
  const contents = { person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers }
  writeFileSync(keyFile(), `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 })
  chmodSync(keyFile(), 0o600)
}

function secretsFile(): string {
  return join(home, '.config/mole-office/sandbox-secrets.env')
}

function folder(): string {
  return join(home, '.cache/mole-office/openrouter')
}

function receiptLines(): Record<string, unknown>[] {
  const file = join(folder(), 'receipts.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

beforeEach(() => {
  stage = aStage()
  asked = []
  home = aTestDatabaseFolder('openrouter-home')
  writeCodexModels()
  writeOpenCodeStandIn()
  keyTail = randomBytes(24).toString('hex')
  key = `sk-or-v1-stand-in-${keyTail}`
  writeTheKeyFile({ openrouter: key })
  sandboxKey = `sk-or-v1-sandbox-stand-in-${randomBytes(24).toString('hex')}`
  mkdirSync(join(home, '.config/mole-office'), { recursive: true, mode: 0o700 })
  writeFileSync(secretsFile(), `OTHER_KEY=not-this-one\nOPENROUTER_API_KEY=${sandboxKey}\n`, { mode: 0o600 })
  chmodSync(secretsFile(), 0o600)
})

afterEach(() => {
  removeThisTestFolder(home)
})

/** One MP4 box: its size, its type, and what it holds. */
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}

/** A small MP4 file: a file-type box, then a movie header that says `seconds`, then some data. */
function anMp4(seconds: number, withFileType = true): Buffer {
  const fileType = box('ftyp', Buffer.from('isom', 'latin1'), Buffer.from([0, 0, 2, 0]), Buffer.from('isommp41', 'latin1'))
  const header = Buffer.alloc(100)
  header.writeUInt32BE(1000, 12)
  header.writeUInt32BE(seconds * 1000, 16)
  const movie = box('moov', box('mvhd', header))
  return Buffer.concat([...(withFileType ? [fileType] : []), movie, box('mdat', randomBytes(4096))])
}

function aVideo(name: string, data: Buffer = anMp4(SECONDS)): string {
  const path = join(home, 'clips', name)
  mkdirSync(join(home, 'clips'), { recursive: true })
  writeFileSync(path, data)
  return path
}

// ============================================================================ running the tool

interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * The tool, as a process of its own: main() with the stand-in's address, so nothing reaches OpenRouter. Its
 * environment is made here, with nothing of this process's: a home of its own, the database path whose key file it
 * reads, an agent's name, and the test mark. `.env` is a file that does not exist, so the checkout's is never read.
 * `noNetwork` replaces fetch with one that says it was asked and fails, for the test that leaves the address out.
 */
function run(args: string[], options: {
  env?: Record<string, string>
  waitMs?: number
  api?: boolean
  noNetwork?: boolean
  noOpenCode?: boolean
  opencodeModels?: string[]
  opencodeExit?: number
  opencodeStderr?: string
  opencodeSleepSeconds?: string
  opencodeTimeoutMs?: number
} = {}): Promise<Ran> {
  const over = {
    ...(options.api === false ? {} : { api: `http://127.0.0.1:${String(port)}/api/v1` }),
    waitMs: options.waitMs ?? 20_000,
    ...(options.opencodeTimeoutMs === undefined ? {} : { opencodeTimeoutMs: options.opencodeTimeoutMs }),
    envFile: join(home, 'no-such.env'),
  }
  const stub = options.noNetwork === true
    ? "globalThis.fetch = async (url) => { process.stderr.write(`A FETCH WAS ASKED FOR ${String(url)}\\n`); throw new TypeError('This test has no network.') };"
    : ''
  const code = `${stub} const { main } = await import(${JSON.stringify(pathToFileURL(TOOL).href)}); const [over, ...argv] = process.argv.slice(1); process.exitCode = await main(argv, JSON.parse(over))`
  const env = {
    PATH: options.noOpenCode === true ? join(home, 'empty-path') : `${join(home, 'bin')}:${process.env['PATH'] ?? ''}`,
    HOME: home,
    MOLE_OFFICE_DB: database(),
    MOLE_OFFICE_AGENT: 'quill',
    OPENROUTER_TEST_OPENCODE_MODELS: (options.opencodeModels ?? []).join('\n'),
    OPENROUTER_TEST_OPENCODE_EXIT: String(options.opencodeExit ?? 0),
    OPENROUTER_TEST_OPENCODE_STDERR: options.opencodeStderr ?? 'stand-in opencode error',
    OPENROUTER_TEST_OPENCODE_SLEEP_SECONDS: options.opencodeSleepSeconds ?? '',
    [THE_TEST_MARK]: String(process.pid),
    ...options.env,
  }
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, '--', JSON.stringify(over), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
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

function chatCalls(): Asked[] {
  return asked.filter((one) => one.path === '/api/v1/chat/completions')
}

function theChatBody(): { model: string; max_tokens: number; usage: unknown; messages: { role: string; content: Record<string, unknown>[] }[] } {
  const calls = chatCalls()
  expect(calls, 'the tool did not make exactly one call to the model').toHaveLength(1)
  return JSON.parse((calls[0] as Asked).body)
}

/** Refused, with these words, and nothing went to the model. */
function expectRefused(ran: Ran, words: string): void {
  expect(ran.stderr).toContain('OpenRouter video review refused: ')
  expect(ran.stderr).toContain(words)
  expect(ran.stderr).toContain('Nothing was sent to the model.')
  expect(ran.code).toBe(2)
  expect(ran.stdout).toBe('')
  expect(chatCalls()).toHaveLength(0)
  expect(receiptLines()).toHaveLength(0)
}

const TIME = 60_000

// ============================================================================ the call

describe('a call sends the video inline and prints the answer', () => {
  it('sends the file as a base64 video_url beside the prompt, with usage asked for, and prints what came back', async () => {
    const clip = anMp4(SECONDS)
    const ran = await run(['video-review', '--file', aVideo('clip.mp4', clip), '--prompt', PROMPT])

    expect(ran.stderr).not.toContain('refused')
    expect(ran.code).toBe(0)
    expect(ran.stdout).toBe(`${ANSWER}\n`)
    const body = theChatBody()
    expect(body.model).toBe(MODEL)
    expect(body.usage).toEqual({ include: true })
    expect(body.max_tokens).toBe(ANSWER_TOKEN_CAP)
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0]?.content).toEqual([
      { type: 'text', text: PROMPT },
      { type: 'video_url', video_url: { url: `data:video/mp4;base64,${clip.toString('base64')}` } },
    ])
    // HOW DENSELY THE VIDEO WAS SEEN, and that there is no cap of our own.
    expect(ran.stderr).toContain("80 prompt tokens per second of video (3210 over 40.0 s). The prompt's own words are counted in them.")
    expect(ran.stderr).toContain('Monthly cap: none of our own (MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD is 0)')
    expect(ran.stderr).toContain("costing $0.00273 by OpenRouter's answer")
    // THE KEY WENT WITH THE TWO CALLS THAT NEED IT, AND NOT WITH THE PUBLIC LIST.
    expect(asked.map((one) => `${one.method} ${one.path} ${one.authorization === `Bearer ${key}` ? 'with the key' : one.authorization === undefined ? 'without a key' : 'with something else'}`)).toEqual([
      'GET /api/v1/models without a key',
      'GET /api/v1/key with the key',
      'POST /api/v1/chat/completions with the key',
    ])
    // NO OFFICE IS NAMED, SO NO USE LINE, AND THE TOOL SAYS SO.
    expect(ran.stderr).toContain('The use was not written on any run: no office was named, because MOLE_OFFICE_API is not set.')
  }, TIME)
})

// ============================================================================ the receipt

describe('the receipt holds what OpenRouter charged and nothing that was said', () => {
  it('writes the cost and the tokens, and neither the prompt nor the answer, in a 0700 folder and a 0600 file', async () => {
    const fenced = '```json\n{"moves": true, "flicker_at": "0:31"}\n```'
    stage.chat = { status: 200, body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: fenced } }], usage: USAGE }) }
    writeFileSync(join(home, 'prompt.txt'), PROMPT)
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', `@${join(home, 'prompt.txt')}`, '--json'])

    expect(ran.code).toBe(0)
    const out = JSON.parse(ran.stdout) as Record<string, unknown>
    expect(out).toMatchObject({
      answer: { moves: true, flicker_at: '0:31' },
      answerIs: 'json inside a code fence',
      model: MODEL,
      processing: null,
      tokens: { prompt: 3210, completion: 87 },
      cost: 0.00273,
      videoSeconds: 40,
      promptTokensPerVideoSecond: 80,
      cut: false,
    })
    const lines = receiptLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      id: out['receipt'],
      agent: 'quill',
      command: 'video-review',
      model: MODEL,
      file: 'clip.mp4',
      videoSeconds: 40,
      processing: null,
      promptTokens: 3210,
      completionTokens: 87,
      cost: 0.00273,
      usage: 'carried',
      outcome: 'answered',
    })
    const text = readFileSync(join(folder(), 'receipts.jsonl'), 'utf8')
    expect(text).not.toContain(PROMPT_MARK)
    expect(text).not.toContain('flicker_at')
    expect(text).not.toContain(home)
    expect(statSync(folder()).mode & 0o777).toBe(0o700)
    expect(statSync(join(folder(), 'receipts.jsonl')).mode & 0o777).toBe(0o600)
  }, TIME)

  it('says in the receipt when an answer carried no usage, and gives no cost of its own', async () => {
    stage.chat = { status: 200, body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: ANSWER } }] }) }
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])

    expect(ran.code).toBe(0)
    expect(receiptLines()[0]).toMatchObject({ promptTokens: null, completionTokens: null, cost: null, usage: 'none: the answer carried no usage' })
    expect(ran.stderr).toContain("OpenRouter's answer carried no usage, so the receipt has no tokens and no cost.")
  }, TIME)
})

// ============================================================================ the key

describe('the key appears nowhere but in the requests to OpenRouter', () => {
  it('masks the key in the words for a 401 whose body echoes it, and writes it into no file', async () => {
    stage.chat = {
      status: 401,
      body: JSON.stringify({ error: { message: `No auth credentials found for Bearer ${key}`, key, start: key.slice(0, 30), user_id: 'stand-in' } }),
    }
    const answered = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])
    expect(answered.code).toBe(75)
    expect(answered.stderr).toContain('OpenRouter video review got no answer: OpenRouter (/api/v1/chat/completions) answered 401: ')
    expect(answered.stderr).toContain('[the key]')

    stage.key = { status: 401, body: JSON.stringify({ error: { message: `Key ${key} is not valid` } }) }
    const refusedAtTheKey = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])
    expect(refusedAtTheKey.code).toBe(75)
    expect(refusedAtTheKey.stderr).toContain('OpenRouter (/api/v1/key) answered 401: ')

    // THE STAND-IN WAS SENT THE KEY, so the test is not passing because no key was read.
    expect(asked.filter((one) => one.authorization === `Bearer ${key}`).length).toBeGreaterThan(0)
    const everything = [
      answered.stdout,
      answered.stderr,
      refusedAtTheKey.stdout,
      refusedAtTheKey.stderr,
      readFileSync(join(folder(), 'receipts.jsonl'), 'utf8'),
      readFileSync(join(folder(), 'models.json'), 'utf8'),
    ].join('\n')
    expect(everything.includes(key), 'the key was shown or written').toBe(false)
    expect(everything.includes(keyTail.slice(0, 12)), 'part of the key was shown or written').toBe(false)
  }, TIME)
})

// ============================================================================ where the key comes from

describe("the key is the office's own, from the key file beside its database", () => {
  it("sends the office's key, says which store it came from, and never reads the sandboxes' secret", async () => {
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])
    expect(ran.code).toBe(0)
    expect(ran.stderr).toContain(`Key: the office's own OpenRouter key, from the office's key file ${keyFile()}.`)
    const keyed = asked.filter((one) => one.authorization !== undefined)
    expect(keyed.map((one) => one.path)).toEqual(['/api/v1/key', '/api/v1/chat/completions'])
    for (const one of keyed) expect(one.authorization).toBe(`Bearer ${key}`)
    expect(JSON.stringify(asked).includes(sandboxKey), "the sandboxes' key was sent").toBe(false)
  }, TIME)

  it('takes OPENROUTER_API_KEY only when the key file holds no OpenRouter key, and says so', async () => {
    writeTheKeyFile({})
    const fromTheEnvironment = `sk-or-v1-environment-stand-in-${randomBytes(24).toString('hex')}`
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT], { env: { OPENROUTER_API_KEY: fromTheEnvironment } })
    expect(ran.code).toBe(0)
    expect(ran.stderr).toContain(`Key: the office's own OpenRouter key, from OPENROUTER_API_KEY, because the office's key file ${keyFile()} holds no OpenRouter key.`)
    expect(chatCalls()[0]?.authorization).toBe(`Bearer ${fromTheEnvironment}`)
    expect(ran.stderr.includes(fromTheEnvironment)).toBe(false)
  }, TIME)

  it("refuses, naming where it looked, when no office key file is beside the database, though the sandboxes' secret holds one", async () => {
    const elsewhere = join(home, 'a-worktree', 'data', 'mole-office.db')
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT], { env: { MOLE_OFFICE_DB: elsewhere } })
    const looked = keysPathFrom({ MOLE_OFFICE_DB: elsewhere })
    expectRefused(ran, `No OpenRouter key was found. The tool looked in the office's key file ${looked}, and then for OPENROUTER_API_KEY in the environment and in ${join(home, 'no-such.env')}, which does not exist.`)
    expect(ran.stderr).toContain(`It found: the office key file ${looked} is not there yet.`)
    expect(ran.stderr).toContain("The sandboxes' secrets file holds another key, and this tool does not read it.")
    expect(asked, 'the tool asked OpenRouter something with no key of its own').toHaveLength(0)
  }, TIME)
})

// ============================================================================ the refusals

describe('a refusal says why, exits 2 and sends nothing to the model', () => {
  it('refuses a file over 20 MiB', async () => {
    const big = aVideo('big.mp4')
    truncateSync(big, 21 * 1024 * 1024)
    expectRefused(await run(['video-review', '--file', big, '--prompt', PROMPT]), 'big.mp4 is 22020096 bytes. The most video-review sends is 20 MiB (20971520 bytes).')
  }, TIME)

  it('refuses a file not named .mp4, even when it holds an MP4', async () => {
    expectRefused(await run(['video-review', '--file', aVideo('clip.mov'), '--prompt', PROMPT]), 'clip.mov is not named .mp4. video-review sends MP4 files only.')
  }, TIME)

  it('refuses a file named .mp4 that does not begin with an MP4 file-type box', async () => {
    const fake = aVideo('fake.mp4', anMp4(SECONDS, false))
    expectRefused(await run(['video-review', '--file', fake, '--prompt', PROMPT]), 'fake.mp4 does not begin with an MP4 file-type box, so it is not an MP4 file.')
  }, TIME)

  it("refuses a model OpenRouter's list says does not take video", async () => {
    expectRefused(
      await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT, '--model', WORDS_ONLY]),
      `${WORDS_ONLY} does not take video, by OpenRouter's model list.`,
    )
  }, TIME)

  it("refuses a call the key's remaining limit at OpenRouter cannot cover, and says the figure", async () => {
    const estimate = theEstimate({ seconds: SECONDS, promptBytes: Buffer.byteLength(PROMPT), prices: { prompt: Number(PRICES.prompt), completion: Number(PRICES.completion) } })
    expect(estimate).toBeGreaterThan(0.03)
    stage.key = { status: 200, body: JSON.stringify({ data: { label: 'stand-in', limit: 5, limit_remaining: 0.03, usage: 4.97 } }) }
    expectRefused(
      await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT]),
      `OpenRouter says this key has $0.03 of its limit left, and this call may cost up to ${dollars(estimate)}.`,
    )
  }, TIME)

  it("refuses a call that would take this month's receipts over the monthly cap", async () => {
    mkdirSync(folder(), { recursive: true, mode: 0o700 })
    const now = localStamp(new Date())
    const earlier = [
      { id: 'one', at: now, cost: 0.5, outcome: 'answered' },
      { id: 'two', at: now, cost: 0.45, outcome: 'answered' },
    ]
    writeFileSync(join(folder(), 'receipts.jsonl'), earlier.map((row) => `${JSON.stringify(row)}\n`).join(''), { mode: 0o600 })
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT], { env: { MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD: '1' } })
    expect(ran.stderr).toContain("This month's receipts hold $0.95, and this call may cost up to $")
    expect(ran.stderr).toContain('together over the monthly cap of $1.00 (MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD).')
    expect(ran.code).toBe(2)
    expect(chatCalls()).toHaveLength(0)
    expect(receiptLines()).toHaveLength(2)
  }, TIME)
})

// ============================================================================ no answer

describe('no answer from OpenRouter exits 75 and says which', () => {
  it('exits 75 when OpenRouter answers 503, and keeps a receipt of the call', async () => {
    stage.chat = { status: 503, body: JSON.stringify({ error: { message: 'The provider is overloaded.' } }) }
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])
    expect(ran.stderr).toContain('OpenRouter video review got no answer: OpenRouter (/api/v1/chat/completions) answered 503: {"error":{"message":"The provider is overloaded."}}.')
    expect(ran.code).toBe(75)
    expect(ran.stdout).toBe('')
    expect(receiptLines()[0]).toMatchObject({ outcome: 'no answer: OpenRouter answered 503', usage: 'none: there was no answer', cost: null })
  }, TIME)

  it('exits 75 when OpenRouter does not answer in time', async () => {
    stage.chat = 'hang'
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT], { waitMs: 1500 })
    expect(ran.stderr).toContain('OpenRouter video review got no answer: nothing came back from OpenRouter (/api/v1/chat/completions) within 1.5 s.')
    expect(ran.code).toBe(75)
    expect(receiptLines()[0]).toMatchObject({ outcome: 'no answer: no answer within 1.5 s' })
  }, TIME)
})

// ============================================================================ --processing

describe("--processing is OpenRouter's one video setting, for Gemini only", () => {
  it('puts processing on the video part when it is given, and not at all when it is not', async () => {
    const given = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT, '--processing', 'agentic'])
    expect(given.code).toBe(0)
    const sent = theChatBody().messages[0]?.content[1] as { video_url: Record<string, unknown> }
    expect(sent.video_url['processing']).toBe('agentic')
    expect(receiptLines()[0]).toMatchObject({ processing: 'agentic' })
    expect(given.stderr).toContain('Processing: agentic.')

    asked = []
    const left = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT])
    expect(left.code).toBe(0)
    const unsent = theChatBody().messages[0]?.content[1] as { video_url: Record<string, unknown> }
    expect(Object.keys(unsent.video_url)).toEqual(['url'])
    expect(left.stderr).toContain("Processing: not given, so OpenRouter sends none and Gemini's own default applies.")
  }, TIME)

  it('refuses --processing with a model that is not Google', async () => {
    expectRefused(
      await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT, '--model', 'openai/stand-in-video', '--processing', 'static']),
      '--processing is a Gemini setting at OpenRouter, and openai/stand-in-video is not a Google model.',
    )
  }, TIME)
})

// ============================================================================ a model a subscription carries

/**
 * OPENROUTER IS ONLY FOR A MODEL NONE OF OUR SUBSCRIPTIONS CARRIES (round 43). Luna's row is
 * also under another decision. Every id below but one is an id OpenRouter's public model list
 * held on 13 October 2026. moonshotai/kimi-k4 is made up here: a newer Kimi than the list holds, which the family's row
 * must still catch.
 *
 * MUTATIONS, each after a control run:
 *   1. main() does not check the model against the subscriptions. "refused before anything is asked" goes red: the
 *      stand-in is asked for the model list.
 *   2. Every model is refused. "a Google model still goes through" goes red.
 *   3. The refusal says only "refused". "the words name the subscription" goes red.
 *   4. Luna's row says OpenCode Go only. "Luna's words say Codex first" goes red.
 */
const ELSEWHERE = 'OpenRouter is only for a model we need that none of our subscriptions carries, such as Gemini for video review.'
const LUNA = "The Codex subscription carries GPT-6 Luna, so use it through codex first. Only when Codex rate-limits Luna, use OpenCode Go's opencode-go/gpt-6-luna through opencode."
const CODEX = 'The Codex subscription carries GPT-6 Astra and GPT-6.1 Sol, so use them through codex.'

/** Each id, and the exact words of its refusal. */
const CARRIED: [string, string][] = [
  ['openai/gpt-6-astra', `openai/gpt-6-astra is a GPT-6 model. ${CODEX} ${ELSEWHERE}`],
  ['openai/gpt-6.1-sol', `openai/gpt-6.1-sol is a GPT-6 model. ${CODEX} ${ELSEWHERE}`],
  ['~openai/gpt-astra-latest', `~openai/gpt-astra-latest is a GPT-6 model. ${CODEX} ${ELSEWHERE}`],
  ['openai/gpt-6-luna', `openai/gpt-6-luna is a GPT-6 Luna model. ${LUNA} ${ELSEWHERE}`],
  ['~openai/gpt-luna-latest', `~openai/gpt-luna-latest is a GPT-6 Luna model. ${LUNA} ${ELSEWHERE}`],
  ['moonshotai/kimi-k3', `moonshotai/kimi-k3 is a Kimi model. The OpenCode Go subscription carries Kimi, so use it through opencode. ${ELSEWHERE}`],
  ['moonshotai/kimi-k4', `moonshotai/kimi-k4 is a Kimi model. The OpenCode Go subscription carries Kimi, so use it through opencode. ${ELSEWHERE}`],
  ['z-ai/glm-5v-turbo', `z-ai/glm-5v-turbo is a GLM model. The OpenCode Go subscription carries GLM, so use it through opencode. ${ELSEWHERE}`],
  ['xiaomi/mimo-v2.6-pro', `xiaomi/mimo-v2.6-pro is a MiMo model. The OpenCode Go subscription carries MiMo, so use it through opencode. ${ELSEWHERE}`],
  ['deepseek/deepseek-v4-pro', `deepseek/deepseek-v4-pro is a DeepSeek model. The OpenCode Go subscription carries DeepSeek, so use it through opencode, or through dsh. ${ELSEWHERE}`],
  ['anthropic/claude-opus-5.5', `anthropic/claude-opus-5.5 is a Claude model. The Claude subscription carries Claude, so use it through claude (Claude Code). ${ELSEWHERE}`],
]


/** The tool, asked for this model, with an office named, so a use line would reach the stand-in if one were sent. */
function runWithModel(model: string, options: Parameters<typeof run>[1] = {}): Promise<Ran> {
  const office = { MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`, MOLE_OFFICE_SESSION: 'stand-in-run', MOLE_OFFICE_WORKSPACE: 'stand-in-project' }
  return run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT, '--model', model], { ...options, env: { ...office, ...options.env } })
}

describe('a model one of our subscriptions carries is refused, and a Google model is not', () => {
  it('refuses each family with exit 2 before anything is asked: the stand-in sees no request, not even the model list', async () => {
    for (const [model] of CARRIED) {
      asked = []
      const ran = await runWithModel(model)
      expect(ran.code, `${model}: ${ran.stderr}`).toBe(2)
      expect(asked.map((one) => `${one.method} ${one.path}`), model).toEqual([])
      expect(ran.stdout, model).toBe('')
      expect(receiptLines(), model).toHaveLength(0)
    }
  }, TIME)

  it('lets a Google model that takes video through to the stand-in, the alias for the newest Flash included', async () => {
    for (const model of [MODEL, GEMINI_ALIAS]) {
      asked = []
      const ran = await runWithModel(model)
      expect(ran.stderr, model).not.toContain('refused')
      expect(ran.code, model).toBe(0)
      expect(theChatBody().model).toBe(model)
    }
  }, TIME)


})

// ============================================================================ the subscription lists

describe('the OpenRouter subscription lists are read before the model list', () => {
  it('refuses a Codex-only model and names the read-only cache and where it was read', async () => {
    const file = writeCodexModels(['gpt-5.5'])
    const ran = await runWithModel('openai/gpt-5.5')

    expectRefused(ran, `openai/gpt-5.5 is on Codex's list, read from ~/.codex/models_cache.json at ${file}. Use it through codex.`)
    expect(ran.stderr).toContain(`${ELSEWHERE} Nothing was sent to the model.`)
    expect(asked).toHaveLength(0)
  }, TIME)

  it('refuses a Grok id only on OpenCode Go and names the list id to use', async () => {
    writeCodexModels([])
    const ran = await runWithModel('x-ai/grok-4.2', { opencodeModels: ['opencode-go/grok-4-2'] })

    expectRefused(ran, 'x-ai/grok-4.2 is on OpenCode Go\'s list from `opencode models opencode-go`. Use it through opencode as `opencode-go/grok-4-2`.')
    expect(ran.stderr).toContain(`${ELSEWHERE} Nothing was sent to the model.`)
    expect(asked).toHaveLength(0)

    writeCodexModels([])
    const luna = await runWithModel('openai/gpt-6-luna', { opencodeModels: ['opencode-go/gpt-6-luna'] })
    expectRefused(luna, 'openai/gpt-6-luna is on OpenCode Go\'s list')
    expect(luna.stderr).toContain(LUNA)
    expect(luna.stderr).toContain('Use it through opencode as `opencode-go/gpt-6-luna` only when Codex rate-limits Luna.')
    expect(luna.stderr).toContain(`${ELSEWHERE} Nothing was sent to the model.`)
    expect(asked).toHaveLength(0)
  }, TIME)

  it('falls back to the family table with both unreadable lists named, including a short timeout', async () => {
    const file = writeCodexModels([])
    writeFileSync(file, '{"models": [')
    const missing = await runWithModel('moonshotai/kimi-k4', { noOpenCode: true })

    expectRefused(missing, 'The OpenCode Go subscription carries Kimi, so use it through opencode.')
    expect(missing.stderr).toContain(`The family table answered instead because Codex's list could not be read from ~/.codex/models_cache.json at ${file}: the JSON is bad`)
    expect(missing.stderr).toContain("OpenCode Go's list could not be read using `opencode models opencode-go`: opencode is not on PATH")

    writeCodexModels([])
    const timedOut = await runWithModel('moonshotai/kimi-k4', { opencodeSleepSeconds: '0.2', opencodeTimeoutMs: 20 })
    expectRefused(timedOut, 'The OpenCode Go subscription carries Kimi, so use it through opencode.')
    expect(timedOut.stderr).toContain('opencode timed out after 20 milliseconds')
    expect(timedOut.stderr).toContain('The family table answered instead')
  }, TIME)

  it('lets the default Gemini video model reach the stand-in OpenRouter', async () => {
    const ran = await runWithModel(MODEL)

    expect(ran.stderr).not.toContain('refused')
    expect(ran.code).toBe(0)
    expect(theChatBody().model).toBe(MODEL)
    expect(asked.some((one) => one.path === '/api/v1/chat/completions')).toBe(true)
  }, TIME)

  it('leaves every Codex cache file size and mtime unchanged on a refusal and a call that goes through', async () => {
    writeCodexModels(['gpt-5.5'])
    const before = filesUnderCodex()

    const refused = await runWithModel('openai/gpt-5.5')
    expectRefused(refused, `${ELSEWHERE} Nothing was sent to the model.`)
    const afterRefusal = filesUnderCodex()
    expect(afterRefusal, 'Codex files after the refused call (path, size and mtime)').toEqual(before)

    const passed = await runWithModel(MODEL)
    expect(passed.code).toBe(0)
    expect(chatCalls()).toHaveLength(1)
    const afterCall = filesUnderCodex()
    expect(afterCall, 'Codex files after the call that went through (path, size and mtime)').toEqual(before)
  }, TIME)
})

// ============================================================================ the use line

describe('a use is one line on the calling run', () => {
  it('prints the unsent use body, with what the receipt holds and none of the prompt', async () => {
    const office = { MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`, MOLE_OFFICE_SESSION: 'stand-in-run', MOLE_OFFICE_WORKSPACE: 'stand-in-project' }
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT, '--processing', 'agentic'], { env: office })

    expect(ran.code).toBe(0)
    const uses = asked.filter((one) => one.path === '/api/toolset/uses')
    expect(uses).toHaveLength(0)
    const body = ran.stderr.split('\n').find((line) => line.startsWith('{')) ?? ''
    const line = JSON.parse(body) as { tool: string; said: string }
    expect(line.tool).toBe(THE_SLUG)
    const receipt = receiptLines()[0] as { id: string }
    expect(line.said).toBe(
      `video-review of clip.mp4 (40 s of video) on ${MODEL}, processing agentic: answered; 3210 prompt and 87 completion tokens; $0.00273; receipt ${receipt.id}`,
    )
    expect(body).not.toContain(PROMPT_MARK)
    expect(body).not.toContain(ANSWER)
    expect(ran.stderr).not.toContain(keyTail.slice(0, 12))
    expect(ran.stderr).toContain('Nothing was sent.')
    expect(ran.stderr).toContain('POST /api/toolset/uses')
  }, TIME)
})

// ============================================================================ the test mark

describe('a process the test suite started cannot reach OpenRouter itself', () => {
  it('refuses before anything is asked when no stand-in is named', async () => {
    const ran = await run(['video-review', '--file', aVideo('clip.mp4'), '--prompt', PROMPT], { api: false, noNetwork: true })
    expect(ran.stderr).toContain('A process the test suite started may not call OpenRouter itself.')
    expect(ran.stderr).not.toContain('A FETCH WAS ASKED FOR')
    expect(ran.code).toBe(2)
  }, TIME)
})

// ============================================================================ the toolset


// ============================================================================ the Settings page

describe("the Settings page names every tool that spends the office's OpenRouter key", () => {
  it('names video review beside the two picture tools, in English and in Chinese, and no other tool reads the key', () => {
    // WHO READS THE OFFICE'S KEYS: every tool that imports the one reader. A new one goes red here. When it spends the
    // OpenRouter key, the sentence below is the one to change with it. tools/the-inspector.mjs reads only the entry a dsh
    // check's Casting provider row names, and a row may not name openrouter (theKeyName in
    // src/server/lib/the-provider-table.ts), so the sentence does not name it.
    const tools = fileURLToPath(new URL('../tools/', import.meta.url))
    const readers = readdirSync(tools)
      .filter((name) => name.endsWith('.mjs'))
      .filter((name) => /from '\.\.\/src\/config\/provider-keys\.mjs'/u.test(readFileSync(join(tools, name), 'utf8')))
      .sort()
    expect(readers).toEqual(['avatars-from-openrouter.mjs', 'openrouter.mjs', 'portraits-from-openrouter.mjs', 'the-inspector.mjs'])
    expect(OFFICE_KEY_MEANS.openrouter).toBe('The office uses this for its OpenRouter tools: the two picture tools for avatars and portraits, and video review.')
    expect(chineseWords()['settingsPanel.keys.means.openrouter']).toBe('办公室的 OpenRouter 工具用它：两个生成头像和肖像的图片工具，以及视频审阅。')
  })
})
