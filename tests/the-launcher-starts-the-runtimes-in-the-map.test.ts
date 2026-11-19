// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER'S RUNTIMES COME FROM THE ONE MAP, AND A RUNTIME IT CANNOT START IS REFUSED BEFORE ANYTHING HAPPENS.
 *
 * THE OLD WORDING. commandWorker and commandRound each held their own literal list, so a runtime the office's map
 * gained was refused with "worker cannot start runtime <runtime>. Nothing was started." even where the map knew it.
 * And the literal list was the only thing keeping an unknown runtime away from the Claude Code branch: the command
 * choice's bare else built the Claude Code command for anything the list let through, so a key added to the map before
 * the launcher learned to start it would have started Claude Code under that runtime's name.
 *
 * THE NEW WORDING. The launcher reads the office's map, THE_PROGRAM_A_RUNTIME_RUNS, and refuses a runtime the map does
 * not hold in names the map does hold: "worker cannot start runtime <runtime>: it starts <its runtimes>. Nothing was
 * started." A runtime the map holds but the launcher has no command for is refused in the second sentence, "worker has
 * no command for runtime <runtime>. Nothing was started.", before any run is filed, before any office call and before
 * any docker exec. The Claude Code command is built only for the runtime it belongs to.
 *
 * WHAT IS REAL AND WHAT IS NOT. The launcher runs as a process of its own, as an agent runs it. Its office is a
 * stand-in server on a free loopback port that this file starts and counts requests on; it is never the live office,
 * and no MOLE_OFFICE_* value of this test's environment reaches the launcher. The made-up runtime and its program are
 * invented for this case. A preload gives the map the made-up entry, because the map is frozen and there is no
 * behaviour-level seam for adding a key; the program writes a marker if it is ever started, and the marker must stay
 * absent. The two refusal sentences are read from src/config/launcher-selection.mjs, where the launcher reads them.
 *
 * THE MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN:
 *   - the map check changed back to the literal list: the made-up case is refused with the first sentence, red;
 *   - the early second check removed: the made-up case reaches the office or a later refusal, red;
 *   - the early second check removed and the old bare else put back at the command choice: red;
 *   - the old bare else put back alone, with the early check left in, stays green: the early check refuses first, so
 *     it is not a mutation and no case is made for it;
 *   - the removal of the launcher's detail folders taken out of the end of the file: the after-check finds one left, red.
 *
 * WHAT THIS FILE LEAVES BEHIND. A launcher refusal that happens before it knows an instance folder writes its detail
 * file into a fresh folder under the temporary directory, whose name begins mole-office-launch-. This file records
 * each such folder the launcher names to it, removes exactly those folders at the end, and fails if one is still
 * there. It removes nothing else: a folder whose name does not begin that way is left alone.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS, theRuntimeTheMapDoesNotHoldWords, theRuntimeWithNoCommandWords } from '../src/config/launcher-selection.mjs'

const TOOL = join(import.meta.dirname, '..', 'tools', 'sandbox.mjs')

let office: Server
let api = ''
let folder = ''
let brief = ''
const heard: string[] = []
/** Each launcher detail folder this file made, so the end of the file can remove it and check it is gone. */
const detailFolders = new Set<string>()

/** The data file this file adds a runtime to, without copying its entries into the test. */
const THE_MAP_LOADED_WITH_ONE_MORE_ENTRY = `
import { registerHooks } from 'node:module'
const runtime = process.env.A_MADE_UP_RUNTIME
const program = process.env.A_MADE_UP_PROGRAM
registerHooks({
  load(url, context, next) {
    const loaded = next(url, context)
    if (!url.endsWith('/src/config/runtime-native-providers.json')) return loaded
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString()
    const data = JSON.parse(source)
    data[runtime] = { program, provider: null, fastMode: false }
    return { ...loaded, source: JSON.stringify(data) }
  },
})
`

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'launcher-runtimes-'))
  brief = join(folder, 'brief')
  writeFileSync(brief, 'Synthetic brief')
  office = createServer((request, response) => {
    heard.push(`${request.method ?? ''} ${request.url ?? ''}`)
    request.resume()
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', () => done()))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(folder, { recursive: true, force: true })
  for (const made of detailFolders) rmSync(made, { recursive: true, force: true })
  const left = [...detailFolders].filter((made) => existsSync(made))
  expect(left, `The launcher's detail folders were left behind: ${left.join(', ')}`).toEqual([])
})

/** The launcher as a process of its own, with only PATH, HOME and what the case gives it: no office value of ours. */
function launcher(verb: 'worker' | 'round', runtime: string, more: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(process.execPath, [TOOL, verb, 'alpha', '--agent', 'synthetic-worker', '--runtime', runtime, '--brief', brief,
    '--sandboxes', join(folder, 'sandboxes'), '--api', api, '--workspace', 'default', '--as', 'synthetic-starter', '--session', 'synthetic-session'], {
    env: { PATH: process.env['PATH'] ?? '', HOME: folder, ...more },
  })
  let out = ''
  let err = ''
  child.stdout.on('data', (piece) => { out += String(piece) })
  child.stderr.on('data', (piece) => { err += String(piece) })
  return new Promise((done) => child.on('close', (code) => {
    const details = /Details: ([^\n]+)/.exec(err)?.[1]
    if (details !== undefined) {
      const made = dirname(details)
      if (basename(made).startsWith('mole-office-launch-')) detailFolders.add(made)
    }
    done({ code, out, err })
  }))
}

/** The refusal as it was written down whole: the short line on stderr, and the detail file it names. */
function theRefusal(ran: { err: string }): string {
  const details = /Details: ([^\n]+)/.exec(ran.err)?.[1]
  return ran.err + (details !== undefined && existsSync(details) ? readFileSync(details, 'utf8') : '')
}

describe('a runtime the map does not hold is refused by both commands, naming the map runtimes', () => {
  it('refuses the same absent runtime from worker and round', async () => {
    const absent = `absent-${String(Date.now())}-${String(process.pid)}`
    for (const verb of ['worker', 'round'] as const) {
      const ran = await launcher(verb, absent)
      expect(ran.code, ran.err).not.toBe(0)
      expect(theRefusal(ran)).toContain(theRuntimeTheMapDoesNotHoldWords(verb, absent, Object.keys(THE_PROGRAM_A_RUNTIME_RUNS)))
    }
    expect(heard).toEqual([])
  }, 30_000)
})

describe('a runtime the map holds but the launcher has no command for starts nothing', () => {
  it('passes the map check and is refused by worker and round in the second sentence', async () => {
    const made = 'a-made-up-runtime'
    const program = 'a-made-up-program'
    const marker = join(folder, 'the-made-up-program-started')
    const bin = join(folder, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, program), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.A_MADE_UP_MARKER, 'started')\n`, { mode: 0o755 })
    const preload = join(folder, 'the-map-gets-one-more-entry.mjs')
    writeFileSync(preload, THE_MAP_LOADED_WITH_ONE_MORE_ENTRY)
    const more = {
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      A_MADE_UP_RUNTIME: made,
      A_MADE_UP_PROGRAM: program,
      A_MADE_UP_MARKER: marker,
    }
    for (const verb of ['worker', 'round'] as const) {
      const ran = await launcher(verb, made, more)
      expect(ran.code, ran.err).not.toBe(0)
      expect(theRefusal(ran)).toContain(theRuntimeWithNoCommandWords(verb, made))
      expect(theRefusal(ran)).not.toContain('cannot start runtime')
    }
    expect(existsSync(marker)).toBe(false)
    expect(heard).toEqual([])
  }, 30_000)
})
