// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PDF IS SERVED UNDER A SANDBOX POLICY ONLY WHEN THE PAGE ASKS TO SHOW IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The office's page asks for a PDF attached to a report with open=1&shown=1, reads its bytes and
 * draws its pages itself. The same address opened on its own is drawn by the browser's own reader,
 * and there the reply is what holds the document: a policy of `default-src 'none'; sandbox`.
 *
 *   1. A PDF asked for by the report's own press, open=1&shown=1, arrives as application/pdf under
 *      `default-src 'none'; sandbox` and still says nosniff. The policy has `sandbox` and has
 *      neither allow-scripts nor allow-same-origin.
 *   2. The same PDF asked for plainly, for download, or for metadata carries no policy: every other
 *      answer keeps exactly what it has today.
 *   3. A file that is not a PDF asks with open=1 and carries no PDF policy. The policy is for this
 *      one type and this one way of asking, not for everything the door opens.
 *   4. THE CHAT'S OPEN IS THE ANSWER AT THE CUT: open=1 alone is the raw PDF, with no policy. That
 *      is what whereAFileOpens asks, and it is not the report's press.
 *
 * The mutation this holds is the removal of `sandbox` from the PDF header: the exact-header
 * assertion is what turns red, and nothing else has to move.
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

/** What a PDF reply carries when the page asks to show it. Written out, not read from the door. */
const THE_PDF_POLICY = "default-src 'none'; sandbox"
/** The type the door must keep saying, so the browser's own reader takes it and not a download. */
const THE_PDF_TYPE = 'application/pdf'

let t: TestDb
let app: FastifyInstance
let previousRoots: string | undefined
let roots = ''

const named = { pdf: '', plain: '', page: '' }

async function ask(query: string, method: 'GET' | 'HEAD' = 'GET'): Promise<LightMyRequestResponse> {
  return app.inject({ method, url: query, headers: OWNER })
}

beforeAll(async () => {
  t = await freshDb()
  roots = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-pdf-policy-')))
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = roots
  app = (await apiApp()).app
  await app.ready()

  const store = join(roots, 'store')
  mkdirSync(store, { recursive: true })
  named.pdf = join(store, 'made-up.pdf')
  named.plain = join(store, 'made-up.txt')
  named.page = join(store, 'made-up.html')
  writeFileSync(named.pdf, '%PDF-1.4\n%%EOF\n')
  writeFileSync(named.plain, 'Made-up words in a file that is not a PDF.')
  writeFileSync(named.page, '<!doctype html><p>A made-up page.</p>')

  t.api.createRecord({
    workspaceId: HERE,
    kind: 'module',
    title: 'The files this PDF door test points at',
    data: {
      context: 'A module that points at each file, which is what lets the door read it.',
      parts: [],
      paths: [
        { id: 'pdf', label: 'A made-up PDF', path: named.pdf, kind: 'pdf' },
        { id: 'plain', label: 'Made-up words', path: named.plain, kind: 'other' },
        { id: 'page', label: 'A made-up page', path: named.page, kind: 'html' },
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

function thePath(path: string, more = ''): string {
  return `/api/file?path=${encodeURIComponent(path)}${more}`
}

describe('a PDF asked for by the page to show carries the PDF sandbox', () => {
  it('answers open=1 as application/pdf under default-src none; sandbox, and says nosniff', async () => {
    const res = await ask(thePath(named.pdf, '&open=1&shown=1'))
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PDF_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PDF_POLICY)
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(res.headers['content-security-policy']).not.toContain('allow-scripts')
    expect(res.headers['content-security-policy']).not.toContain('allow-same-origin')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('carries the same policy on the HEAD the report page reads the type from', async () => {
    const res = await ask(thePath(named.pdf, '&open=1&shown=1'), 'HEAD')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PDF_TYPE)
    expect(res.headers['content-security-policy']).toBe(THE_PDF_POLICY)
  })
})

describe('the chat\'s Open is the answer at the cut', () => {
  it('answers open=1 alone as the raw PDF with no policy', async () => {
    const res = await ask(thePath(named.pdf, '&open=1'))
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    expect(res.headers['content-type']).toBe(THE_PDF_TYPE)
    expect(res.headers['content-security-policy']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.rawPayload.equals(Buffer.from('%PDF-1.4\n%%EOF\n'))).toBe(true)
  })
})

describe('every other way of asking for a PDF is answered as today', () => {
  it('carries no policy on a plain read, a save or a metadata read', async () => {
    for (const more of ['', '&download=1', '&metadata=1']) {
      const res = await ask(thePath(named.pdf, more))
      expect(res.statusCode, more).toBe(200)
      expect(res.headers['content-security-policy'], more).toBeUndefined()
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
  })

  it('gives the metadata read its JSON type and not the PDF type', async () => {
    const res = await ask(thePath(named.pdf, '&metadata=1'))
    expect(res.headers['content-type']).toBe('application/json')
  })
})

describe('the PDF policy is for one type and one way of asking', () => {
  it('gives no PDF policy to another file asked with open=1', async () => {
    const plain = await ask(thePath(named.plain, '&open=1'))
    expect(plain.statusCode, plain.body.slice(0, 300)).toBe(200)
    expect(plain.headers['content-security-policy']).toBeUndefined()

    // THE HTML FILE HAS THE CUT'S OWN SANDBOX on open=1, which happens to be the same string as
    // the PDF's policy. It is not the PDF's policy being spread: the PDF policy is added only for
    // application/pdf, and the HTML answer is the sandbox HTML had at 73084220c. The page policy
    // is only on the HTML file's own shown=1 answer.
    const page = await ask(thePath(named.page, '&open=1'))
    expect(page.statusCode, page.body.slice(0, 300)).toBe(200)
    expect(page.headers['content-security-policy']).toBe("default-src 'none'; sandbox")
  })
})
