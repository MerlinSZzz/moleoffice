// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW PROGRAM PRINTS A REPORT'S PAGE AS A PDF, started the way the office's door starts it.
 *
 * The office prints a report's page with the app's own window program. POST /api/report-pdf writes the
 * page into a folder of its own and starts the command `theCommandThatPrints` answers
 * (src/server/api/report-pdf.ts): the program `theInstallsWindowProgram()` answers
 * (src/config/settings.mjs) and its arguments, --no-sandbox where the door's rule turns the sandbox off,
 * then the print switch, the page and the PDF to write. The print mode (src/desktop/print-a-page.mjs)
 * opens one hidden window that runs no script and lets no request leave except for the page itself and
 * data: addresses, prints the page, writes the PDF and ends.
 *
 *   1. THE PRINT MODE, started with the door's own command, which ends with the print switch, the page
 *      and the PDF. The page holds an English and a Chinese made-up line, a data: picture, and a picture, a
 *      stylesheet and two scripts aimed at a test server on 127.0.0.1. It also links, by a file: address,
 *      a stylesheet in a made-up folder of its own, whose one rule writes a Chinese character that nothing
 *      else on the page holds. The program ends with 0. The file it writes begins with %PDF-. The
 *      characters the PDF's ToUnicode maps give hold every character of both lines, white space left out,
 *      and not the stylesheet's character. The test server was asked nothing. The profile
 *      folder beside the page was made. The program is started with an office's database and data
 *      folder named by the variables an office reads, MOLE_OFFICE_DB and XDG_CONFIG_HOME
 *      (src/config/settings.mjs), both pointing into a made-up folder. The database is a file of made-up
 *      words, which is not a database. After the program ends, that file's bytes are as they were, the
 *      made-up folder holds no other file, and the data folder was not made: a print run starts no office
 *      and reads no setting.
 *   2. THE DOOR, in a made-up office: it answers 200 with application/pdf and bytes that begin with
 *      %PDF-, and it leaves no print folder behind.
 *   8. THE DOOR WITH NO SCREEN: with neither DISPLAY nor WAYLAND_DISPLAY set, the door prints under
 *      xvfb-run, found on PATH. It answers 200 with application/pdf and bytes that begin with %PDF-, and
 *      it leaves no print folder and no Xvfb process behind. The two variables are put back whatever
 *      happens. Where xvfb-run is not on PATH, the case skips and says so. Cases 3 to 7 are in
 *      tests/the-pdf-door-refuses-and-the-install-finds-its-program.test.ts.
 *
 * WHAT THE CASES LOOK AT. A test looks only at what it made. The door makes its print folder in the
 * system's temporary folder, which is TMPDIR, so cases 2 and 8 set TMPDIR to an empty folder of their
 * own and list only that. Case 8 reads only the processes started from this test's process, from their
 * own entries in /proc, while the door prints: the door's xvfb-run, its Xvfb and the window program
 * among them. After the door answers, the Xvfb it saw and xvfb-run's process group must be gone.
 *
 * THE ORDER OF THE WORDS IS NOT CHECKED. The repository holds no PDF reader, so case 1 reads the PDF
 * with the small reader below: it inflates every FlateDecode stream with node:zlib and gathers the
 * characters the ToUnicode maps give, from their bfchar and bfrange entries, the array form of bfrange
 * too. That says each character of each line was drawn with a font that maps back to it. It does not
 * say the characters stand in that order on the page. A PDF with no ToUnicode map fails case 1, and
 * says so.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *
 *   no print mode, or a print mode that does not end with 0          → case 1
 *   a command that does not end with the switch, the page and the PDF → case 1
 *   a PDF that is not written, or bytes that are not a PDF            → cases 1 and 2
 *   a page printed without its lines                                  → case 1
 *   a request from the page that reaches the network                  → case 1
 *   a page that reads a file on this computer by a file: address      → case 1
 *   the window's own folder put anywhere but beside the page          → case 1
 *   a print run that reads a setting from the office's database       → case 1
 *   a print run that changes that file or makes the office's folders  → case 1
 *   no door, or a door that answers anything but the PDF              → case 2
 *   a door that leaves its folder behind                              → cases 2 and 8
 *   a door that cannot print with no screen, where xvfb-run is found  → case 8
 *   a print under xvfb-run that leaves its Xvfb running               → case 8
 *
 * IT IS A WINDOW TEST. It names the print switch, so node tools/run-named-tests.mjs --list window takes
 * it (tests/the-test-lists.ts says how), and it opens a window only under that list's virtual display.
 * Run any other way, each case skips and says why.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { whereIsThisTool } from '../src/config/runtimes.mjs'
import { thePerUserDataFolder } from '../src/config/settings.mjs'
import { PRINT_A_PAGE_SWITCH, THE_PRINT_PROFILE_FOLDER } from '../src/desktop/print-a-page.mjs'
import { THE_PRINT_FOLDER_PREFIX, theCommandThatPrints } from '../src/server/api/report-pdf.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { stillRunning, whyNoWindowOpensHere } from './the-window-display.ts'

const WHY_NOT = whyNoWindowOpensHere()
// Printed, so the skip and its reason are in the run's log and not only in a count of skipped tests.
if (WHY_NOT !== null) console.log(`the-window-program-prints-a-page-as-a-pdf: skipped. ${WHY_NOT}`)

/** The made-up English line the page holds. */
const THE_ENGLISH_LINE = 'A made-up report page, printed by the window program'
/** The made-up Chinese line the page holds: more than four different characters, none of them in the English line. */
const THE_CHINESE_LINE = '编造的报告页面由窗口程序打印'

/**
 * The one character the stylesheet on this computer writes after the body. Neither line holds it and nothing else on
 * the page does, so it is drawn only if the print reads the stylesheet the page names by its file: address.
 */
const THE_FILE_STYLESHEETS_CHARACTER = '猫'

/** A picture of one pixel, as a data: address, which the print mode lets the page load. */
const A_DATA_PICTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * The bytes of the office database case 1 names: made-up words, which are not a database. The file is not
 * empty, because SQLite takes an empty file as an empty database and reads it with no error.
 */
const A_MADE_UP_DATABASE_FILE =
  'Made-up words in place of an office database, written by a test. SQLite cannot read this file as a database, ' +
  'so a program that tries to read a setting from it is refused.\n'

/** How long case 1 waits for the program before it stops it and fails. */
const THE_PROGRAM_MAY_TAKE_MS = 90_000

/**
 * The page to print. With `server`, it also holds a picture, a stylesheet and two scripts aimed at that
 * address, none of which may be asked for. With `fileStylesheet`, it also links the stylesheet at that file:
 * address, which may not be read.
 */
function aPageToPrint(server: string | null, fileStylesheet: string | null = null): string {
  const outside = server === null
    ? ''
    : `<link rel="stylesheet" href="${server}/a-stylesheet.css">` +
      `<script src="${server}/a-script.js"></script>` +
      `<script>fetch('${server}/a-fetch')</script>`
  const onThisComputer = fileStylesheet === null ? '' : `<link rel="stylesheet" href="${fileStylesheet}">`
  const picture = server === null ? '' : `<img src="${server}/a-picture.png" alt="">`
  return '<!doctype html><html><head><meta charset="utf-8"><title>A made-up report</title>' +
    `${outside}${onThisComputer}</head><body>` +
    `<p>${THE_ENGLISH_LINE}</p><p>${THE_CHINESE_LINE}</p>` +
    `<img src="${A_DATA_PICTURE}" alt="">${picture}` +
    '</body></html>'
}

/** The text of one UTF-16BE hex string, as a ToUnicode map writes its targets. */
function theTextOfUtf16Hex(hex: string): string {
  const units: number[] = []
  for (let at = 0; at + 4 <= hex.length; at += 4) units.push(Number.parseInt(hex.slice(at, at + 4), 16))
  return String.fromCharCode(...units)
}

/** The targets of one ToUnicode map: each bfchar target, and each code of each bfrange, in both of its forms. */
function theTargetsOfAToUnicodeMap(map: string): string[] {
  const targets: string[] = []
  for (const block of map.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of (block[1] ?? '').matchAll(/<[0-9A-Fa-f]+>\s*<([0-9A-Fa-f]*)>/g)) targets.push(theTextOfUtf16Hex(entry[1] ?? ''))
  }
  for (const block of map.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of (block[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([^\]]*)\])/g)) {
      const low = Number.parseInt(entry[1] ?? '', 16)
      const high = Number.parseInt(entry[2] ?? '', 16)
      if (entry[3] !== undefined) {
        // One target: the codes from low to high map to it and to the characters that follow it.
        const first = theTextOfUtf16Hex(entry[3])
        const last = first.charCodeAt(first.length - 1)
        for (let code = low; code <= high; code += 1) targets.push(first.slice(0, -1) + String.fromCharCode(last + code - low))
      } else {
        for (const one of (entry[4] ?? '').matchAll(/<([0-9A-Fa-f]*)>/g)) targets.push(theTextOfUtf16Hex(one[1] ?? ''))
      }
    }
  }
  return targets
}

/**
 * THE CHARACTERS A PDF'S TOUNICODE MAPS GIVE, and how many maps it holds.
 *
 * Every stream is read, and inflated with node:zlib when its dictionary names FlateDecode. A stream that
 * holds a begincmap is a ToUnicode map. This says which characters the PDF's fonts map back to, and
 * nothing about where they stand on the page.
 */
function theCharactersThePdfsMapsGive(pdf: Buffer): { maps: number; characters: Set<string> } {
  const text = pdf.toString('latin1')
  const characters = new Set<string>()
  let maps = 0
  // An object's dictionary and the start of its stream. The dictionary ends at the >> before "stream", and never
  // runs on past its own object's endobj.
  const anObjectWithAStream = /\d+\s+\d+\s+obj\s*<<((?:(?!>>\s*stream|endobj)[\s\S])*)>>\s*stream\r?\n/g
  for (let found = anObjectWithAStream.exec(text); found !== null; found = anObjectWithAStream.exec(text)) {
    const dictionary = found[1] ?? ''
    const start = found.index + found[0].length
    // A length written as a number. A length that names another object ("12 0 R") is not one, and the stream then
    // ends at its endstream.
    const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionary)
    const end = length !== null ? start + Number(length[1]) : text.indexOf('endstream', start)
    if (end < start) throw new Error(`The PDF's stream at byte ${String(start)} has no end.`)
    anObjectWithAStream.lastIndex = end
    const raw = pdf.subarray(start, end)
    const stream = /\/FlateDecode/.test(dictionary) ? inflateSync(raw).toString('latin1') : raw.toString('latin1')
    if (!stream.includes('begincmap')) continue
    maps += 1
    for (const target of theTargetsOfAToUnicodeMap(stream)) for (const character of target) characters.add(character)
  }
  return { maps, characters }
}

/** Each character of `line`, white space left out, that `characters` does not hold. */
function theCharactersMissingFrom(characters: Set<string>, line: string): string[] {
  return [...new Set(line.replace(/\s+/gu, ''))].filter((character) => !characters.has(character))
}

/**
 * THE DOOR ASKED WITH A TEMPORARY FOLDER OF THE TEST'S OWN. The door makes its print folder in the system's
 * temporary folder, which is TMPDIR. `ask` runs with TMPDIR set to a new empty folder this test made, and the
 * answer names the print folders the door left there. TMPDIR is put back and the folder removed whatever happens.
 */
async function askedWithATemporaryFolderOfItsOwn<T>(ask: () => Promise<T>): Promise<{ answer: T; printFoldersLeft: string[] }> {
  const folder = aTestDatabaseFolder('a-temporary-folder-for-the-door')
  const kept = process.env.TMPDIR
  try {
    process.env.TMPDIR = folder
    const answer = await ask()
    return { answer, printFoldersLeft: readdirSync(folder).filter((name) => name.startsWith(THE_PRINT_FOLDER_PREFIX)).sort() }
  } finally {
    if (kept === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = kept
    removeThisTestFolder(folder)
  }
}

/** What `read` answers, or null when the process it reads ended before it was read. */
function readIfStillThere<T>(read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ESRCH') return null
    throw error
  }
}

/**
 * THE PROCESSES STARTED FROM THIS TEST'S PROCESS, and theirs, by id with the name /proc gives each. Each is read from
 * its own entries in /proc, starting from this process's threads and following their children. A process that ends
 * while it is read is left out.
 */
function theProcessesStartedFromHere(): Map<number, string> {
  const found = new Map<number, string>()
  const waiting = [process.pid]
  for (let parent = waiting.pop(); parent !== undefined; parent = waiting.pop()) {
    const threads = join('/proc', String(parent), 'task')
    for (const thread of readIfStillThere(() => readdirSync(threads)) ?? []) {
      const children = readIfStillThere(() => readFileSync(join(threads, thread, 'children'), 'utf8')) ?? ''
      for (const id of children.split(/\s+/).filter((one) => one !== '').map(Number)) {
        if (found.has(id)) continue
        const name = readIfStillThere(() => readFileSync(join('/proc', String(id), 'comm'), 'utf8'))
        if (name === null) continue
        found.set(id, name.trim())
        waiting.push(id)
      }
    }
  }
  return found
}

/** Whether the process `id` is still there, or with a negative id, any process of that process group. */
function stillThere(id: number): boolean {
  try {
    process.kill(id, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    // It is there, and this process may not signal it.
    if (code === 'EPERM') return true
    throw error
  }
}

describe('the window program prints a page as a PDF', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  const folders: string[] = []
  const programs: ChildProcess[] = []
  let server: Server | undefined
  let t: TestDb | undefined
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterAll(async () => {
    for (const program of programs.filter(stillRunning)) {
      try {
        if (process.platform === 'win32' || program.pid === undefined) program.kill('SIGKILL')
        else process.kill(-program.pid, 'SIGKILL')
      } catch {
        // It ended at the last moment.
      }
    }
    await new Promise<void>((done) => (server === undefined ? done() : server.close(() => done())))
    await app?.close()
    t?.close()
    for (const folder of folders) removeThisTestFolder(folder)
  })

  it('1. the print mode, started with the door\'s own command, prints the page and lets no request leave', async () => {
    const asked: string[] = []
    const testServer = createServer((request, response) => {
      asked.push(`${request.method ?? ''} ${request.url ?? ''}`)
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('A made-up answer.')
    })
    server = testServer
    await new Promise<void>((done) => testServer.listen(0, '127.0.0.1', () => done()))
    const address = `http://127.0.0.1:${String((testServer.address() as AddressInfo).port)}`

    const folder = aTestDatabaseFolder('a-page-to-print')
    folders.push(folder)
    const page = join(folder, 'page.html')
    const pdf = join(folder, 'page.pdf')
    // A stylesheet on this computer, in a made-up folder of its own: outside the page's folder and outside the
    // made-up office folder below. Its one rule writes a character after the body.
    const elsewhere = aTestDatabaseFolder('a-stylesheet-on-this-computer')
    folders.push(elsewhere)
    const stylesheet = join(elsewhere, 'a-stylesheet.css')
    writeFileSync(stylesheet, `@charset "utf-8";\nbody::after { content: "${THE_FILE_STYLESHEETS_CHARACTER}"; }\n`)
    writeFileSync(page, aPageToPrint(address, pathToFileURL(stylesheet).href))

    // An office's database and data folder, named by the variables an office reads, point into a made-up folder.
    // This window list runs on Linux, where the data folder comes from XDG_CONFIG_HOME. The database is a file
    // that exists and is not a database. If the print run read a setting, SQLite would refuse the file, the
    // reading would throw the kept choice that could not be read, and the print run would refuse to start.
    const office = aTestDatabaseFolder('an-office-the-print-must-not-open')
    folders.push(office)
    const database = join(office, 'office.sqlite')
    writeFileSync(database, A_MADE_UP_DATABASE_FILE)
    const databaseBytes = readFileSync(database)
    const env = { ...process.env, MOLE_OFFICE_DB: database, XDG_CONFIG_HOME: join(office, 'config') }
    const dataFolder = thePerUserDataFolder(env)
    expect(dataFolder, 'the data folder the made-up variables name').toBe(join(office, 'config', 'mole-office'))

    const command = theCommandThatPrints(page, pdf)
    expect(command.args.slice(-3), 'the print switch, the page and the PDF end the door\'s command').toEqual([PRINT_A_PAGE_SWITCH, page, pdf])
    const child = spawn(command.program, command.args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
    programs.push(child)
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    const ended = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: string }>((done) => {
      const limit = setTimeout(() => done({ code: null, signal: null, error: `it did not end within ${String(THE_PROGRAM_MAY_TAKE_MS)} ms` }), THE_PROGRAM_MAY_TAKE_MS)
      child.on('error', (error) => { clearTimeout(limit); done({ code: null, signal: null, error: error.message }) })
      child.on('close', (code, signal) => { clearTimeout(limit); done({ code, signal }) })
    })

    expect(ended, `the window program's stderr:\n${stderr}`).toEqual({ code: 0, signal: null })
    expect(existsSync(pdf), `no PDF was written. The window program's stderr:\n${stderr}`).toBe(true)
    const bytes = readFileSync(pdf)
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

    const read = theCharactersThePdfsMapsGive(bytes)
    expect(read.maps, 'the PDF holds no ToUnicode map, so the characters it draws cannot be read from it').toBeGreaterThan(0)
    expect(theCharactersMissingFrom(read.characters, THE_ENGLISH_LINE), 'characters of the English line no ToUnicode map gives').toEqual([])
    expect(theCharactersMissingFrom(read.characters, THE_CHINESE_LINE), 'characters of the Chinese line no ToUnicode map gives').toEqual([])
    expect(
      read.characters.has(THE_FILE_STYLESHEETS_CHARACTER),
      'a ToUnicode map gives the character only the stylesheet on this computer writes, so the print read a file the page names by its file: address',
    ).toBe(false)

    expect(asked, 'the requests the page made to the test server').toEqual([])
    expect(existsSync(join(folder, THE_PRINT_PROFILE_FOLDER)), 'the window\'s own folder beside the page').toBe(true)
    expect(readFileSync(database).equals(databaseBytes), 'the office database the made-up variable names is as it was').toBe(true)
    // No -journal, -wal or -shm file beside it, and no data folder either.
    expect(readdirSync(office), 'the files in the made-up office folder').toEqual(['office.sqlite'])
    expect(existsSync(dataFolder), 'the office data folder the made-up variable names').toBe(false)
  }, THE_PROGRAM_MAY_TAKE_MS + 30_000)

  it('2. the door, in a made-up office, answers the PDF and leaves no print folder behind', async () => {
    const door = app
    if (door === undefined) throw new Error('The made-up office was not built, so the door cannot be asked.')
    const { answer: reply, printFoldersLeft } = await askedWithATemporaryFolderOfItsOwn(() => door.inject({
      method: 'POST',
      url: '/api/report-pdf',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'a-made-up-printer',
      },
      payload: JSON.stringify({ html: aPageToPrint(null) }),
    }))
    expect(reply.statusCode, reply.statusCode === 200 ? '' : reply.body).toBe(200)
    expect(reply.headers['content-type']).toMatch(/^application\/pdf\b/)
    expect(reply.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(printFoldersLeft, 'print folders the door left behind').toEqual([])
  }, THE_PROGRAM_MAY_TAKE_MS + 30_000)

  // Looked up on PATH, as the door looks it up at each request.
  const XVFB_RUN = whereIsThisTool('xvfb-run', process.env)
  if (XVFB_RUN === null) {
    console.log('the-window-program-prints-a-page-as-a-pdf: case 8 skipped. xvfb-run is not on PATH, so the door has nothing to print with when there is no screen.')
    it.skip('8. skipped: xvfb-run is not on PATH, so the door has nothing to print with when there is no screen', () => {})
  } else {
    it('8. with no screen, the door prints under xvfb-run, and leaves no print folder and no Xvfb behind', async () => {
      const door = app
      if (door === undefined) throw new Error('The made-up office was not built, so the door cannot be asked.')
      // Each process seen started from here while the door prints, with the last name it was seen under: a process
      // is first seen under this one's name, before it starts its own program.
      const seen = new Map<number, string>()
      const look = () => {
        for (const [id, name] of theProcessesStartedFromHere()) seen.set(id, name)
      }
      const asked = await askedWithATemporaryFolderOfItsOwn(async () => {
        const kept = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY }
        const looking = setInterval(look, 20)
        try {
          delete process.env.DISPLAY
          delete process.env.WAYLAND_DISPLAY
          return await door.inject({
            method: 'POST',
            url: '/api/report-pdf',
            headers: {
              'content-type': 'application/json',
              'x-mole-office-workspace': 'default',
              'x-mole-office-actor-type': 'agent',
              'x-mole-office-actor-id': 'a-made-up-printer',
            },
            payload: JSON.stringify({ html: aPageToPrint(null) }),
          })
        } finally {
          clearInterval(looking)
          for (const [name, value] of Object.entries(kept)) {
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
          }
        }
      })
      const reply = asked.answer
      expect(reply.statusCode, reply.statusCode === 200 ? '' : reply.body).toBe(200)
      expect(reply.headers['content-type']).toMatch(/^application\/pdf\b/)
      expect(reply.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(asked.printFoldersLeft, 'print folders the door left behind').toEqual([])

      const names = [...seen.values()]
      expect(names, 'the processes seen started from here while the door printed').toContain('xvfb-run')
      expect(names, 'the processes seen started from here while the door printed').toContain('Xvfb')
      // The door starts xvfb-run as the leader of a process group of its own, and xvfb-run's Xvfb is in that group.
      const left = [...seen]
        .filter(([id, name]) => (name === 'xvfb-run' && stillThere(-id)) || (name === 'Xvfb' && stillThere(id)))
        .map(([id, name]) => `${name} ${String(id)}`)
      expect(left, 'xvfb-run\'s process group and Xvfb, still there after the door answered').toEqual([])
    }, THE_PROGRAM_MAY_TAKE_MS + 30_000)
  }
})
