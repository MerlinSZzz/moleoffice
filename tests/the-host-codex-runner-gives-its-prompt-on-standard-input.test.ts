// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST'S CODEX RUNNER GIVES ITS PROMPT ON STANDARD INPUT, NOT ON THE COMMAND LINE.
 *
 * A prompt used to be the last word of the command line, after `--`. On Linux one word of a command line may be at
 * most 128 KB, so a longer prompt could not start at all, and every prompt's words could be read in the process list.
 * Codex reads its prompt from standard input when the prompt word is `-`.
 *
 * WHAT IS REAL AND WHAT IS NOT. No Codex runs and no model is called. The program first on the PATH this file gives the
 * adapter is a stand-in named `codex`, in a folder of this file's own under the temporary directory. It writes down its
 * argv and everything it reads on standard input, writes a short answer to the `-o` file, prints one JSON line and
 * ends. The office the start asks is a stand-in on loopback, started by this file, which answers the start values with
 * a model and records each address it was asked. The runner makes its prompt folder in the temporary folder the
 * environment names, so this file names a folder of its own in TMPDIR for its runs and reads only that one.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CodexAdapter, lastMessagePathOf } from '../src/worker/runtimes/codex.ts'

const AGENT = 'synthetic-standard-input'
const MODEL = 'gpt-6.1-sol'
/** The prefix `startInItsOwnGroup` gives the folder it makes for the text on standard input. */
const PROMPT_FOLDER_PREFIX = 'mole-office-run-stdin-'

let office: Server
let api = ''
let folder = ''
let bin = ''
let work = ''
/** The temporary folder this file names in TMPDIR, so every prompt folder its runs make is made here. */
let promptRoot = ''
let tmpdirBefore: string | undefined
/** Every start-values address the stand-in office was asked, in order. */
const asked: string[] = []
const groups = new Set<number>()

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'codex-standard-input-'))
  bin = join(folder, 'bin')
  work = join(folder, 'work')
  mkdirSync(bin)
  mkdirSync(work)
  promptRoot = join(folder, 'tmp')
  mkdirSync(promptRoot)
  tmpdirBefore = process.env['TMPDIR']
  process.env['TMPDIR'] = promptRoot
  writeFileSync(join(bin, 'codex'), `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs')
const args = process.argv.slice(2)
const at = args.indexOf('-o')
const answer = at === -1 ? null : args[at + 1]
const stdin = fs.readFileSync(0, 'utf8')
if (answer !== null) {
  fs.writeFileSync(answer + '.argv.json', JSON.stringify(args))
  fs.writeFileSync(answer + '.stdin.txt', stdin)
  fs.writeFileSync(answer, 'Synthetic answer.\\n')
}
console.log(JSON.stringify({ type: 'thread.started', thread_id: '${randomUUID()}' }))
`, { mode: 0o755 })
  office = createServer((request, response) => {
    asked.push(request.url ?? '')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ model: MODEL, effort: 'xhigh', effortFrom: 'Casting' }))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterAll(async () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  if (tmpdirBefore === undefined) delete process.env['TMPDIR']
  else process.env['TMPDIR'] = tmpdirBefore
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(folder, { recursive: true, force: true })
})

/** A word made in this file, which no argument can hold by chance. */
function aMadeUpWord(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Start one run through the adapter's own start, with the stand-in first on the PATH, and read what it was given. */
async function startOne(run: { prompt: string; resume?: string }): Promise<{ argv: string[]; stdin: string; asked: string[] }> {
  const before = asked.length
  const outputPath = join(folder, `out-${randomUUID()}`)
  const answer = lastMessagePathOf(outputPath)
  const adapter = new CodexAdapter({ PATH: `${bin}:${process.env['PATH'] ?? ''}`, HOME: folder }, { model: MODEL, variant: null })
  const handle = await adapter.start({
    session: `synthetic-${randomUUID()}`,
    agent: AGENT,
    prompt: run.prompt,
    cwd: work,
    api,
    workspace: 'default',
    outputPath,
    ...(run.resume === undefined ? {} : { resume: run.resume }),
  })
  groups.add(handle.pgid)
  const until = Date.now() + 15_000
  while (!existsSync(answer) && Date.now() < until) await new Promise((done) => setTimeout(done, 20))
  expect(existsSync(answer), `the stand-in codex wrote no answer to ${answer}`).toBe(true)
  return {
    argv: JSON.parse(readFileSync(`${answer}.argv.json`, 'utf8')) as string[],
    stdin: readFileSync(`${answer}.stdin.txt`, 'utf8'),
    asked: asked.slice(before),
  }
}

/** The prompt folders still in this file's own temporary folder. Nothing but this file's runs makes one there. */
function promptFoldersLeft(): string[] {
  return readdirSync(promptRoot).filter((name) => name.startsWith(PROMPT_FOLDER_PREFIX))
}

describe('the host’s Codex runner gives its prompt on standard input', () => {
  it('starts a fresh exec run with no prompt word on the command line and the whole prompt on standard input', async () => {
    const word = aMadeUpWord()
    const prompt = `Synthetic: ${word}`
    const started = await startOne({ prompt })
    expect(started.argv.join('\n')).not.toContain(word)
    expect(started.argv.slice(-2)).toEqual(['--', '-'])
    expect(started.stdin).toBe(prompt)
    expect(started.asked.length).toBeGreaterThan(0)
  })

  it('starts a resumed exec run the same way, keeping the conversation id', async () => {
    const word = aMadeUpWord()
    const prompt = `Synthetic: ${word}`
    const resume = randomUUID()
    const started = await startOne({ prompt, resume })
    expect(started.argv.join('\n')).not.toContain(word)
    expect(started.argv.slice(-2)).toEqual(['--', '-'])
    expect(started.argv[started.argv.indexOf('resume') + 1]).toBe(resume)
    expect(started.stdin).toBe(prompt)
    expect(started.asked.length).toBeGreaterThan(0)
  })

  it('starts a run whose prompt is over 128 KB, and reads the whole prompt on standard input', async () => {
    const word = aMadeUpWord()
    const prompt = Array.from({ length: 7_000 }, () => word).join(' ')
    expect(Buffer.byteLength(prompt, 'utf8')).toBeGreaterThan(128 * 1024)
    const started = await startOne({ prompt })
    expect(started.stdin).toBe(prompt)
    expect(started.argv.slice(-2)).toEqual(['--', '-'])
  })

  it('leaves no prompt file or folder on disk while the run goes', async () => {
    const word = aMadeUpWord()
    const prompt = `Synthetic: ${word}`
    const started = await startOne({ prompt })
    expect(started.stdin).toBe(prompt)
    expect(promptFoldersLeft()).toEqual([])
  })
})
