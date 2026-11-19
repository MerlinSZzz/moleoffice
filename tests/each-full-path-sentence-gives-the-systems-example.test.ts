// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH SENTENCE THAT ASKS FOR A FULL PATH GIVES AN EXAMPLE OF ONE ON THE SYSTEM IT RUNS ON (wave 13t, round W39).
 *
 * WHY. Three sentences said that a full path starts with "/", which is not true on Windows: register-myself's refusal
 * of --start-folder, the office tool's refusal of a report file's path, and the English of
 * server.terminalFolderNotAbsolute. register-myself also refused every --start-folder on Windows, because its check
 * was that the folder starts with "/", while the office on Windows keeps a folder that begins with a drive letter.
 *
 * WHAT IS CHECKED. Windows and the Mac are stood in by naming 'win32' and 'darwin'; process.platform is never changed.
 *   1. howAFullPathIsWritten (src/config/the-paths-of-a-system.mjs) gives, after "such as", an example that is a full
 *      path by that system's rules (path.win32.isAbsolute on Windows, path.posix.isAbsolute on the others) and ends in
 *      the name asked for. On a Mac it is in /Users. On Windows it holds no "/".
 *   2. register-myself, run as a child process on Linux, refuses a relative --start-folder and a drive-letter one with
 *      exit 2, in a sentence that names the folder and gives a Linux example. It sends a folder that begins with "/".
 *   3. register-myself, run as a child process with the per-system layer's system stood in as Windows, refuses a
 *      relative --start-folder and one that begins with "/", in a sentence with a Windows example, and sends a
 *      drive-letter one. The stand-in is a module hook that loads src/config/the-paths-of-a-system.mjs with
 *      THIS_PLATFORM set to 'win32'; it fails the case if that line is not there to set.
 *   4. The office tool's refusal of a report file's path gives the example of the system the layer names: Windows,
 *      and Linux.
 * Each sentence is checked for what it must do, and none is copied here.
 *
 * WHAT IT DOES NOT SHOW. Nothing ran on Windows or a Mac. Whether the office on Windows keeps the folder that
 * register-myself sends is the office's own check (src/config/start-folder.mjs), which its own tests cover. Here a
 * stand-in office takes the registration and refuses it.
 *
 * MUTATIONS, after a control run, each restored:
 *   a. register-myself's check back to `startsWith('/')`: case 3 goes red (the drive-letter folder is refused).
 *   b. howAFullPathIsWritten giving the Linux example on Windows: cases 1, 3 and 4 go red.
 *   c. howAFullPathIsWritten giving /home on a Mac: case 1 goes red.
 *   d. register-myself's sentence without the example: cases 2 and 3 go red.
 *   e. the office tool's sentence back to "starting with /": case 4 goes red on Windows.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { howAFullPathIsWritten } from '../src/config/the-paths-of-a-system.mjs'
import { aReportFileRead } from '../tools/office-mcp.mjs'

/**
 * THE SYSTEM THE LAYER NAMES WHEN IT IS GIVEN NONE, stood in only while `layer.system` is set, for case 4. The other
 * cases give the system to the layer, or run in a child process this does not reach.
 */
const layer = vi.hoisted(() => ({ system: null as null | string }))
vi.mock('../src/config/the-paths-of-a-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-paths-of-a-system.mjs')>()
  return {
    ...real,
    howAFullPathIsWritten: (name: string, platform?: string) => real.howAFullPathIsWritten(name, platform ?? layer.system ?? real.THIS_PLATFORM),
  }
})

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(CHECKOUT, 'for-agents', 'register-myself.mjs')
const THE_LAYER = 'src/config/the-paths-of-a-system.mjs'

/** The line of the layer that names this process's system, and what the stand-in puts in its place. */
const THE_SYSTEM_LINE = 'export const THIS_PLATFORM = process.platform'
const WINDOWS_STOOD_IN = "export const THIS_PLATFORM = 'win32'"

type System = 'win32' | 'darwin' | 'linux'

/**
 * WHAT A SENTENCE THAT ASKS FOR A FULL PATH MISSES, on one system. It must give after "such as" an example that is a
 * full path by that system's rules, and name what it was given when it was given something. The Mac keeps a person's
 * home folder in /Users, so there the example is in /Users. On Windows the sentence must not say "starting with /".
 */
function whatTheSentenceMisses(sentence: string, system: System, given?: string): string[] {
  const misses: string[] = []
  if (given !== undefined && !sentence.includes(given)) misses.push(`it does not name ${JSON.stringify(given)}`)
  const example = /such as (\S+?)[,.]?(?:\s|$)/u.exec(sentence)?.[1]
  if (example === undefined) return [...misses, 'it gives no example after "such as"']
  const isFull = system === 'win32' ? win32.isAbsolute(example) && /^[A-Za-z]:\\/u.test(example) : posix.isAbsolute(example)
  if (!isFull) misses.push(`its example ${JSON.stringify(example)} is not a full path on ${system}`)
  if (system === 'darwin' && !example.startsWith('/Users/')) misses.push(`its example ${JSON.stringify(example)} is not in /Users`)
  if (system === 'win32' && sentence.includes('starting with /')) misses.push('it says "starting with /" on Windows')
  return misses
}

// A STAND-IN OFFICE that keeps the start folder of each registration it is sent and refuses it.
let office: Server
let url = ''
const sent: unknown[] = []
let scratch = ''
let standIn = ''
let runs = 0
beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-full-path-'))
  office = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => (body += chunk))
    request.on('end', () => {
      sent.push((JSON.parse(body) as { startFolder?: unknown }).startFolder)
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'The stand-in office refuses every registration.' }))
    })
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  // THE WINDOWS STAND-IN for the child process: a hook that loads the layer with its system named 'win32'.
  const hooks = join(scratch, 'windows-stood-in-hooks.mjs')
  writeFileSync(
    hooks,
    [
      `const LINE = ${JSON.stringify(THE_SYSTEM_LINE)}`,
      'export async function load(url, context, nextLoad) {',
      '  const loaded = await nextLoad(url, context)',
      `  if (!url.endsWith(${JSON.stringify(`/${THE_LAYER}`)})) return loaded`,
      "  const source = typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source)",
      '  if (!source.includes(LINE)) throw new Error(`the Windows stand-in found no line "${LINE}" in ${url}`)',
      `  return { ...loaded, source: source.replace(LINE, ${JSON.stringify(WINDOWS_STOOD_IN)}) }`,
      '}',
    ].join('\n'),
  )
  standIn = join(scratch, 'windows-stood-in.mjs')
  writeFileSync(standIn, `import { register } from 'node:module'\nregister(${JSON.stringify(pathToFileURL(hooks).href)})\n`)
})
afterEach(() => {
  layer.system = null
  sent.length = 0
})
afterAll(async () => {
  await new Promise<void>((resolve) => office.close(() => resolve()))
  rmSync(scratch, { recursive: true, force: true })
})

/** This process's environment without the office it may be pointed at, and with a home of its own. */
function withoutTheLiveOffice(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch }
  delete env['MOLE_OFFICE_API']
  delete env['MOLE_OFFICE_WORKSPACE']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_OFFICE_AGENT']
  return env
}

/** register-myself with one start folder, on this system or with Windows stood in. */
async function register(startFolder: string, system: 'this one' | 'win32'): Promise<{ code: number | null; stderr: string; out: string }> {
  runs += 1
  const node = system === 'win32' ? ['--import', pathToFileURL(standIn).href] : []
  const args = [
    ...node,
    TOOL,
    '--handle', 'a-full-path-newcomer',
    '--name', 'A full-path newcomer',
    '--dir', scratch,
    '--key-file', join(scratch, `key-${String(runs)}`),
    '--start-folder', startFolder,
    '--workspace', 'default',
    '--api', url,
  ]
  return await new Promise((resolve) => {
    execFile(process.execPath, args, { encoding: 'utf8', env: withoutTheLiveOffice(), timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
      resolve({ code, stderr, out: `${stdout}${stderr}` })
    })
  })
}

/** The first line of what the tool wrote to stderr: the sentence of a refusal, before the usage. */
const theFirstLine = (stderr: string): string => stderr.split('\n')[0] ?? ''

describe('each sentence that asks for a full path gives an example of one on the system it runs on', () => {
  it('1: howAFullPathIsWritten gives a full path of each system, ending in the name asked for', () => {
    for (const system of ['win32', 'darwin', 'linux'] as const) {
      const words = howAFullPathIsWritten('a-folder', system)
      expect(whatTheSentenceMisses(words, system), `${system}: ${words}`).toEqual([])
      const example = /such as (\S+)$/u.exec(words)?.[1] ?? ''
      expect(example.endsWith(`${system === 'win32' ? '\\' : '/'}a-folder`), `${system}: ${words}`).toBe(true)
    }
    expect(howAFullPathIsWritten('a-folder', 'win32')).not.toContain('/')
  })

  it('2: register-myself on Linux refuses a relative and a drive-letter start folder with a Linux example, and sends a full one', async () => {
    for (const folder of ['work', 'C:\\work']) {
      const run = await register(folder, 'this one')
      expect(run.code, run.out).toBe(2)
      expect(whatTheSentenceMisses(theFirstLine(run.stderr), 'linux', `"${folder}"`), run.out).toEqual([])
    }
    expect(sent).toEqual([])
    const full = await register('/srv/work', 'this one')
    expect(full.code, full.out).toBe(1)
    expect(sent).toEqual(['/srv/work'])
  }, 60_000)

  it('3: register-myself with Windows stood in refuses a relative and a "/" start folder with a Windows example, and sends a drive-letter one', async () => {
    for (const folder of ['work', '/srv/work']) {
      const run = await register(folder, 'win32')
      expect(run.code, run.out).toBe(2)
      expect(whatTheSentenceMisses(theFirstLine(run.stderr), 'win32', `"${folder}"`), run.out).toEqual([])
    }
    expect(sent).toEqual([])
    const full = await register('C:\\Users\\you\\work', 'win32')
    expect(full.code, full.out).toBe(1)
    expect(sent).toEqual(['C:\\Users\\you\\work'])
  }, 60_000)

  it("4: the office tool's refusal of a report file's path gives the example of the system the layer names", async () => {
    for (const system of ['win32', 'linux'] as const) {
      layer.system = system
      const why = await aReportFileRead('report.md').then(
        () => 'the relative path was read',
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      )
      expect(whatTheSentenceMisses(why, system, JSON.stringify('report.md')), `${system}: ${why}`).toEqual([])
    }
  })
})
