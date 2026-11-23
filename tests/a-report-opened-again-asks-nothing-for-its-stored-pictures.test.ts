// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT OPENED AGAIN ASKS NOTHING FOR ITS STORED PICTURES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The page is served here by the office itself, `buildApp` with `production: true`, as the live
 * office serves it, so the page and the files come from one address. Requests are counted where the
 * office answers them, because the browser's own request event fires for a copy it kept as well.
 * Bytes are read from the browser: what crossed the connection, and nothing for a kept copy.
 *
 *   1. A report with ten pictures from the report store, opened a second time in the same browser,
 *      asks the office for none of them, and moves at most 5 % of the bytes the first opening moved.
 *      One take, in a browser that has kept nothing yet.
 *   2. A picture at a path is drawn again from the browser's copy for ten seconds. After that the
 *      browser asks again with the picture's version tag and is answered 304. When the file changes,
 *      a page opened afterwards draws the new picture within ten seconds of the last answer, and the
 *      time from the change to the new picture is measured in three takes.
 *
 * What the door answers, header by header and reader by reader, is in
 * tests/a-stored-file-is-kept-and-a-file-at-a-path-is-checked-by-its-version.test.ts.
 *
 * Set W13Y_PICTURE_CACHE_MEASURE to a file outside the checkout to keep the numbers. Each opening and
 * each change adds one JSON line.
 */

import { appendFileSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { freshDb, openRecordPagesAt, theBrowserThisWorkerShares, theBuiltPage, waitForThePage, type TestDb } from './helpers.ts'

const measure = process.env['W13Y_PICTURE_CACHE_MEASURE']

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The stored file's answer says a browser may keep it this long, and the path's answer this long. */
const TEN_SECONDS = 10_000
/** The longest a page takes to open and draw its picture here. Measured below 2 s; this is the margin. */
const AN_OPENING = 3_000

/** A PNG of random colours, so it is as large compressed as it is drawn, as a photograph is. */
function aPicture(width: number, height: number, seed: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, check])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8
  head[9] = 2
  const row = width * 3 + 1
  const rows = Buffer.alloc(row * height)
  let state = seed >>> 0 || 1
  for (let at = 0; at < rows.length; at += 1) {
    if (at % row === 0) continue
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    rows[at] = state & 0xff
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let t: TestDb | undefined
let office: FastifyInstance | undefined
let origin = ''
let previousRoots: string | undefined
/** The one folder of paths this file may read, outside every store. */
let paths = ''
/** The report of ten stored pictures, and the report of one picture at a path. */
let stored = ''
let atAPath = ''
let thePath = ''

/** Every file the office answered, with its status, in order. */
const answered: { path: string; status: number; at: number; cache: string }[] = []

/** How big this made-up office is on disk: its database and its stores. */
function theOfficeOnDisk(): { databaseBytes: number; storeBytes: number } {
  if (t === undefined) return { databaseBytes: 0, storeBytes: 0 }
  const folder = join(t.file, '..')
  let databaseBytes = 0
  let storeBytes = 0
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const size = statSync(join(entry.parentPath, entry.name)).size
    if (entry.parentPath === folder) databaseBytes += size
    else storeBytes += size
  }
  return { databaseBytes, storeBytes }
}

async function aReport(title: string, pictures: string[]): Promise<string> {
  const filed = await fetch(`${origin}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title,
      summary: 'Pictures for a browser to keep or ask again for.',
      data: { blocks: pictures.map((path, n) => ({ id: `b-${String(n + 1)}`, type: 'image', path, alt: `Picture ${String(n + 1)}` })) },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  t = await freshDb()
  const folder = await theBuiltPage()
  paths = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-kept-pictures-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = paths
  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir: folder, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  office.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/file?')) return
    answered.push({
      path: new URL(request.url, 'http://office').searchParams.get('path') ?? '',
      status: reply.statusCode,
      at: Date.now(),
      cache: String(reply.getHeader('cache-control') ?? ''),
    })
  })
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('the office is not listening on a port')
  origin = `http://127.0.0.1:${String(address.port)}`

  const kept: string[] = []
  for (let n = 1; n <= 10; n += 1) {
    const sent = await fetch(`${origin}/api/report-files`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ bytes: aPicture(400, 300, n).toString('base64'), name: `shot-${String(n)}.png` }),
    })
    expect(sent.status, await sent.clone().text()).toBe(201)
    kept.push(((await sent.json()) as { file: { path: string } }).file.path)
  }
  stored = await aReport('A report with ten stored pictures', kept)
  thePath = join(paths, 'chart.png')
  writeFileSync(thePath, aPicture(2, 2, 1))
  atAPath = await aReport('A report with a picture at a path', [thePath])
}, 240_000)

afterAll(async () => {
  await office?.close()
  t?.close()
  if (paths !== '') rmSync(paths, { recursive: true, force: true })
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
}, 60_000)

async function aBrowser(): Promise<BrowserContext> {
  const browser = await theBrowserThisWorkerShares()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await openRecordPagesAt(context, 'full')
  return context
}

type Opening = {
  /** The statuses the office answered for files, in order. */
  files: number[]
  /** The bytes that crossed the connection, for everything and for the files. */
  bytes: number
  fileBytes: number
  /** File requests the browser answered from its own copy. */
  keptCopies: number
  /** The width each drawn picture has, in order. */
  widths: number[]
  ms: number
}

/** Open a report in a new page of this browser, wait until every picture is drawn, and say what it cost. */
async function anOpening(context: BrowserContext, id: string, pictures: number): Promise<Opening> {
  const page = await context.newPage()
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    const fileRequests = new Set<string>()
    const keptByTheBrowser = new Set<string>()
    let bytes = 0
    let fileBytes = 0
    cdp.on('Network.requestWillBeSent', (event) => {
      if (event.request.url.includes('/api/file?')) fileRequests.add(event.requestId)
    })
    cdp.on('Network.requestServedFromCache', (event) => keptByTheBrowser.add(event.requestId))
    cdp.on('Network.responseReceived', (event) => {
      if (event.response.fromDiskCache === true) keptByTheBrowser.add(event.requestId)
    })
    cdp.on('Network.loadingFinished', (event) => {
      if (keptByTheBrowser.has(event.requestId)) return
      bytes += event.encodedDataLength
      if (fileRequests.has(event.requestId)) fileBytes += event.encodedDataLength
    })
    const from = answered.length
    const start = Date.now()
    await page.goto(`${origin}/#${recordPath(id)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForFunction(
      (count) => {
        const drawn = [...document.querySelectorAll<HTMLImageElement>('.sb-image img')]
        return drawn.length >= count && drawn.every((img) => img.complete && img.naturalWidth > 0)
      },
      pictures,
      { timeout: 60_000 },
    )
    const ms = Date.now() - start
    // A request still on its way would be counted against the next opening.
    await page.waitForTimeout(500)
    const widths = await page.$$eval('.sb-image img', (drawn) => drawn.map((img) => (img as HTMLImageElement).naturalWidth))
    return {
      files: answered.slice(from).map((one) => one.status),
      bytes,
      fileBytes,
      keptCopies: [...fileRequests].filter((one) => keptByTheBrowser.has(one)).length,
      widths,
      ms,
    }
  } finally {
    await page.close()
  }
}

function keep(line: Record<string, unknown>): void {
  if (measure === undefined) return
  appendFileSync(measure, `${JSON.stringify({ ...line, ...theOfficeOnDisk() })}\n`)
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

it('1. a report of ten stored pictures, opened again, asks for none of them and moves at most 5 % of the first bytes', async () => {
  const takes: { take: number; first: Opening; second: Opening }[] = []
  for (let take = 1; take <= 1; take += 1) {
    const context = await aBrowser()
    try {
      const first = await anOpening(context, stored, 10)
      const second = await anOpening(context, stored, 10)
      takes.push({ take, first, second })
      const door = answered.find((one) => one.path !== thePath)?.cache ?? ''
      keep({ case: 'stored', take, opening: 'first', door, ...first })
      keep({ case: 'stored', take, opening: 'second', door, ...second })
    } finally {
      await context.close()
    }
  }
  for (const { take, first, second } of takes) {
    expect(first.files.filter((status) => status === 200).length, `take ${String(take)}: the first opening did not fetch the ten pictures`).toBeGreaterThanOrEqual(10)
    expect(second.files, `take ${String(take)}: the second opening asked the office for files`).toEqual([])
    expect(second.fileBytes, `take ${String(take)}: the second opening moved bytes of files`).toBe(0)
    expect(second.bytes, `take ${String(take)}: the second opening moved more than 5 % of ${String(first.bytes)} bytes`).toBeLessThanOrEqual(first.bytes * 0.05)
  }
}, 300_000)

it('2. a picture at a path is drawn from the kept copy for ten seconds, asked again by its tag after, and drawn new within ten seconds of a change, in three takes', async () => {
  const context = await aBrowser()
  try {
    const first = await anOpening(context, atAPath, 1)
    const fetchedAt = answered.at(-1)?.at ?? Date.now()
    const soon = await anOpening(context, atAPath, 1)
    const soonAfter = Date.now() - fetchedAt
    keep({ case: 'path', opening: 'first', ...first })
    keep({ case: 'path', opening: 'again, within ten seconds', msAfterTheAnswer: soonAfter, ...soon })
    await sleep(Math.max(0, fetchedAt + TEN_SECONDS + 500 - Date.now()))
    const later = await anOpening(context, atAPath, 1)
    keep({ case: 'path', opening: 'again, after ten seconds', msAfterTheAnswer: Date.now() - fetchedAt, ...later })

    const changes: { take: number; width: number; msToTheNewPicture: number | null; msAfterTheLastAnswer: number | null; looks: number[][] }[] = []
    for (let take = 1; take <= 3; take += 1) {
      const lastAnswer = answered.at(-1)?.at ?? Date.now()
      const width = take + 2
      writeFileSync(thePath, aPicture(width, 2, take + 1))
      const changedAt = Date.now()
      const looks: number[][] = []
      let shownAt: number | null = null
      while (shownAt === null && Date.now() - changedAt < TEN_SECONDS * 2) {
        const look = await anOpening(context, atAPath, 1)
        looks.push(look.files)
        if (look.widths[0] === width) shownAt = Date.now()
        else await sleep(1_000)
      }
      const change = {
        take,
        width,
        msToTheNewPicture: shownAt === null ? null : shownAt - changedAt,
        msAfterTheLastAnswer: shownAt === null ? null : shownAt - lastAnswer,
        looks,
      }
      changes.push(change)
      keep({ case: 'path changed', ...change })
    }

    expect(first.files).toEqual([200])
    expect(first.widths).toEqual([2])
    expect(soonAfter, 'the second look came too late to be inside the ten seconds').toBeLessThan(TEN_SECONDS)
    expect(soon.files, 'the picture was asked for again inside the ten seconds').toEqual([])
    expect(later.files, 'after ten seconds the picture was not asked again by its tag').toEqual([304])
    expect(later.widths).toEqual([2])
    for (const change of changes) {
      expect(change.msAfterTheLastAnswer, `take ${String(change.take)}: the new picture was not drawn within ten seconds of the last answer`).not.toBeNull()
      expect(change.msAfterTheLastAnswer ?? Infinity).toBeLessThanOrEqual(TEN_SECONDS + AN_OPENING)
    }
  } finally {
    await context.close()
  }
}, 300_000)
