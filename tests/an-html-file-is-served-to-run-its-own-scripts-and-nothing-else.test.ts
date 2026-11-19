// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN HTML FILE IS SERVED TO RUN ITS OWN SCRIPTS AND STYLES, IN AN ORIGIN OF ITS OWN THAT CANNOT
 * REACH THE OFFICE, AND EVERY OTHER FILE KEEPS TODAY'S ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A person reading the report meets an HTML file attached to one and has to download it before he
 * can see it. Today the door sends it under `default-src 'none'; sandbox`, which blocks every script
 * and style, so even a downloaded page is drawn as bare text. The work asks that the pages written
 * inside the file run, in an origin of its own and never the office's, with no connection, no form, no
 * pop-up and no top-level navigation, and that images written into the file as data still draw.
 *
 *   1. An HTML page, by either extension the office knows, keeps the cut sandbox on a plain read
 *      and on open=1 alone; only the report's open=1&shown=1 carries the page policy. That policy
 *      has the sandbox with allow-scripts, and none of allow-same-origin, allow-forms, allow-popups
 *      or allow-top-navigation.
 *   2. An SVG keeps today's `default-src 'none'; sandbox`: an SVG runs no script.
 *   3. A file of a type no page runs, and a file of a type no page shows, carry no policy at all,
 *      as today. A browser was never allowed to execute them and nothing here changes that.
 *
 * The test holds the header word for word rather than parts of it, because the whole promise is
 * the header: a directive left out is permission gained, and a test that only looked for "sandbox"
 * would pass on the policy that blocks everything.
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

/** The policy an HTML attachment is served under. Written out here, not read from the door. */
const THE_PAGE_POLICY =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"
/** The policy an SVG is served under, which is today's and does not change. */
const THE_SANDBOX = "default-src 'none'; sandbox"

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let roots = ''

/** Each file this file asks about, by the name a store would give it. */
const named = { page: '', pageShort: '', drawing: '', plain: '', unknown: '' }

async function ask(query: string, method: 'GET' | 'HEAD' = 'GET'): Promise<LightMyRequestResponse> {
  return app.inject({ method, url: query, headers: OWNER })
}

beforeAll(async () => {
  t = await freshDb()
  roots = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-html-policy-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = roots
  app = (await apiApp()).app
  await app.ready()

  const store = join(roots, 'store')
  mkdirSync(store, { recursive: true })
  named.page = join(store, 'page.html')
  named.pageShort = join(store, 'page.htm')
  named.drawing = join(store, 'drawing.svg')
  named.plain = join(store, 'notes.txt')
  named.unknown = join(store, 'archive.xyz')
  writeFileSync(named.page, '<!doctype html><p>A made-up page with <b>its own</b> words.</p>')
  writeFileSync(named.pageShort, '<!doctype html><p>A made-up page under the short extension.</p>')
  writeFileSync(named.drawing, '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>')
  writeFileSync(named.plain, 'Made-up plain words.')
  writeFileSync(named.unknown, 'Made-up bytes of a kind no page shows.')

  t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The files this door test points at',
    data: {
      context: 'A module that points at each file, which is what lets the door read it.',
      parts: [],
      paths: [
        { id: 'page', label: 'A made-up page', path: named.page, kind: 'html' },
        { id: 'pageShort', label: 'A made-up page with the short extension', path: named.pageShort, kind: 'html' },
        { id: 'drawing', label: 'A made-up drawing', path: named.drawing, kind: 'image' },
        { id: 'plain', label: 'Made-up plain words', path: named.plain, kind: 'other' },
        { id: 'unknown', label: 'Made-up bytes of no known kind', path: named.unknown, kind: 'other' },
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

describe('only the report\'s press gets the policy the HTML page\'s own scripts run under', () => {
  it('serves both HTML extensions under the cut sandbox on a plain read and on open=1 alone', async () => {
    for (const path of [named.page, named.pageShort]) {
      for (const query of [
        `/api/file?path=${encodeURIComponent(path)}`,
        `/api/file?path=${encodeURIComponent(path)}&open=1`,
      ]) {
        const res = await ask(query)
        expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
        expect(res.headers['content-security-policy'], query).toBe(THE_SANDBOX)
      }
    }
  })

  it('serves both HTML extensions under the page policy on the report\'s open=1&shown=1', async () => {
    for (const path of [named.page, named.pageShort]) {
      const res = await ask(`/api/file?path=${encodeURIComponent(path)}&open=1&shown=1`)
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toBe(THE_PAGE_POLICY)
    }
  })

  it('keeps the cut sandbox when shown is asked without open', async () => {
    const res = await ask(`/api/file?path=${encodeURIComponent(named.page)}&shown=1`)
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-security-policy']).toBe(THE_SANDBOX)
  })

  it('never lets the page be the office: no same origin, forms, pop-ups or top navigation', async () => {
    const res = await ask(`/api/file?path=${encodeURIComponent(named.page)}&open=1&shown=1`)
    const policy = String(res.headers['content-security-policy'])
    expect(policy).toContain('sandbox')
    expect(policy).toContain('allow-scripts')
    expect(policy).not.toContain('allow-same-origin')
    expect(policy).not.toContain('allow-forms')
    expect(policy).not.toContain('allow-popups')
    expect(policy).not.toContain('allow-top-navigation')
    expect(policy).toContain("connect-src 'none'")
    expect(policy).toContain("form-action 'none'")
    expect(policy).toContain("base-uri 'none'")
  })

  it('carries the cut sandbox on the HEAD the report page reads the type from', async () => {
    const res = await ask(`/api/file?path=${encodeURIComponent(named.page)}`, 'HEAD')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['content-security-policy']).toBe(THE_SANDBOX)
  })
})

describe('an SVG keeps the policy that runs no script', () => {
  it('serves the drawing under default-src none and sandbox, as before', async () => {
    const res = await ask(`/api/file?path=${encodeURIComponent(named.drawing)}`)
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe('image/svg+xml')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toBe(THE_SANDBOX)
  })
})

describe('every other file is answered as today', () => {
  it('carries no policy on a plain file or on bytes of a kind no page shows', async () => {
    for (const path of [named.plain, named.unknown]) {
      const res = await ask(`/api/file?path=${encodeURIComponent(path)}`)
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      expect(res.headers['content-security-policy'], path).toBeUndefined()
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
  })
})
