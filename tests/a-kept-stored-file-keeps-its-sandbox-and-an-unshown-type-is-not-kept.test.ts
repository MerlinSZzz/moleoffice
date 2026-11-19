// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEPT STORED FILE KEEPS ITS SANDBOX, AND A STORED FILE OF A TYPE NO PAGE SHOWS IS NOT KEPT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A message may carry a file of any type, stored in the message store under the name that store gives:
 * a fresh office id, then the file's own extension when it has one of letters and digits, and otherwise
 * none. The files here are written straight into that store under such names, so what is proved is
 * the answer to the name, whichever door stored it.
 *
 *   1. A file of a type no page shows is answered as before: no-store and no tag. That holds for a name
 *      with an extension no page shows and for a name with no extension at all.
 *   2. An HTML page and an SVG are kept a year, like every stored file a page shows. The HTML page
 *      keeps the headers that let its own scripts and styles run in an origin of its own with no
 *      way back to the office, and the SVG keeps the headers that stop it running any script at
 *      all. Both keep those headers on the kept answer and on the 304 that says the kept copy is
 *      still the file.
 *
 * Every other answer the door gives a browser about keeping a file is in
 * tests/a-stored-file-is-kept-and-a-file-at-a-path-is-checked-by-its-version.test.ts.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** What a stored file's answer says. Written out, not read from the door. */
const A_YEAR = 'private, max-age=31536000, immutable'
/** What stops a browser running an SVG it was sent. Written out, not read from the door. */
const THE_SANDBOX = "default-src 'none'; sandbox"

/**
 * What lets an HTML page run the scripts and styles written inside it, in an origin of its own that
 * cannot make a connection, send a form, open a pop-up or navigate the office's page. Written out,
 * not read from the door: this is the promise, and a test that read the promise from the door would
 * agree with whatever the door said.
 */
const THE_PAGE_POLICY =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let roots = ''

/** Each file, by what it is, at the name the message store would give it. */
const named = { unshown: '', bare: '', page: '', drawing: '' }

async function ask(path: string, more = '', headers: Record<string, string> = OWNER): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}${more}`, headers })
}

/** The headers that stop a browser running an SVG it was sent, and the type they are for. */
function expectTheSandbox(res: LightMyRequestResponse): void {
  expect(res.headers['content-security-policy']).toBe(THE_SANDBOX)
  expect(res.headers['x-content-type-options']).toBe('nosniff')
}

/** The headers that let an HTML page's own scripts and styles run and stop it reaching the office. */
function expectThePageSandbox(res: LightMyRequestResponse): void {
  expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
  expect(res.headers['x-content-type-options']).toBe('nosniff')
}

beforeAll(async () => {
  t = await freshDb()
  // THE STORES BESIDE THE DATABASE ARE PREVIEW ROOTS WHATEVER THIS SAYS, as long as it says something.
  roots = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-kept-types-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = roots
  app = (await apiApp()).app
  await app.ready()

  const { messagePictureDirectory } = await import('../src/server/lib/messagepictures.ts')
  const { anOfficeId } = await import('../src/server/db/ids.ts')
  const store = messagePictureDirectory()
  mkdirSync(store, { recursive: true })
  named.unshown = join(store, `${anOfficeId()}.xyz`)
  named.bare = join(store, anOfficeId())
  named.page = join(store, `${anOfficeId()}.html`)
  named.drawing = join(store, `${anOfficeId()}.svg`)
  writeFileSync(named.unshown, 'bytes of a kind no page shows')
  writeFileSync(named.bare, 'bytes with no extension')
  writeFileSync(named.page, '<!doctype html><p>A page sent in a message.</p>')
  writeFileSync(named.drawing, '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>')

  t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The files a message carries',
    data: {
      context: 'A module that points at each file, which is what lets the door read it.',
      parts: [],
      paths: [
        { id: 'unshown', label: 'A file of a kind no page shows', path: named.unshown, kind: 'other' },
        { id: 'bare', label: 'A file with no extension', path: named.bare, kind: 'other' },
        { id: 'page', label: 'A page', path: named.page, kind: 'other' },
        { id: 'drawing', label: 'A drawing', path: named.drawing, kind: 'image' },
      ],
    },
    actor: t.api.HUMAN,
  })
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  await app?.close()
  t?.close()
  if (roots !== '') rmSync(roots, { recursive: true, force: true })
})

describe('a stored file of a type no page shows is answered as before', () => {
  it('keeps no file whose extension no page shows, and no file with no extension', async () => {
    for (const path of [named.unshown, named.bare]) {
      const res = await ask(path)
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      expect(res.headers['cache-control'], path).toBe('no-store')
      expect(res.headers['etag'], path).toBeUndefined()
    }
  })
})

describe('a stored HTML page is kept, and keeps the policy its own scripts run under', () => {
  it('keeps the page a year, with the cut sandbox on a plain read and on the 304', async () => {
    const res = await ask(named.page)
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['cache-control']).toBe(A_YEAR)
    expectTheSandbox(res)
    const tag = res.headers['etag']
    expect(typeof tag, 'the page has a version tag').toBe('string')

    const again = await ask(named.page, '', { ...OWNER, 'if-none-match': String(tag) })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)
    expect(again.headers['cache-control']).toBe(A_YEAR)
    expectTheSandbox(again)
  })

  it('gives the page policy only to the report\'s open=1&shown=1, and keeps it a year', async () => {
    const res = await ask(named.page, '&open=1&shown=1')
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['cache-control']).toBe(A_YEAR)
    expectThePageSandbox(res)
    const tag = res.headers['etag']
    expect(typeof tag, 'the page has a version tag').toBe('string')

    const again = await ask(named.page, '&open=1&shown=1', { ...OWNER, 'if-none-match': String(tag) })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)
    expect(again.headers['cache-control']).toBe(A_YEAR)
    expectThePageSandbox(again)
  })
})

describe('a stored SVG is kept, and keeps the sandbox that runs no script', () => {
  it('keeps the drawing a year, with the old sandbox on the answer and on the 304', async () => {
    const res = await ask(named.drawing)
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['cache-control']).toBe(A_YEAR)
    expectTheSandbox(res)
    const tag = res.headers['etag']
    expect(typeof tag, 'the drawing has a version tag').toBe('string')

    const again = await ask(named.drawing, '', { ...OWNER, 'if-none-match': String(tag) })
    expect(again.statusCode).toBe(304)
    expect(again.rawPayload.length).toBe(0)
    expect(again.headers['cache-control']).toBe(A_YEAR)
    expectTheSandbox(again)
  })
})
