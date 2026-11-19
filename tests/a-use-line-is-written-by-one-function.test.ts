// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A USE LINE IS WRITTEN BY ONE FUNCTION, AND IT ANSWERS WHAT HAPPENED WITHOUT THROWING.
 *
 * writeAUseLine in tools/use-line.mjs is the one way a tool writes its use line on the calling run (the secretary's decision
 * Vt0GdSlApWce, point d). tools/office-copy.mjs, tools/run-named-tests.mjs and tools/sandbox.mjs worker and round all
 * call it. A small HTTP server this file starts stands in for the office. It never talks to the live office.
 *
 * What it proves:
 *   - with no shell key and no configuration named, it sends nothing and returns the exact body for office_request;
 *   - an empty caller configuration still sends nothing when the environment names a file: the caller's value wins;
 *   - the words carry that body as one line of JSON, with the method, path and the run's own authorship;
 *   - with a shell key, it still posts {tool, said} with the caller's headers and answers written (a guard);
 *   - with any one of the four missing or blank, it sends nothing and answers why, in words that name the variable;
 *   - when the office refuses (a stand-in that answers 400), it does not throw: it answers refused, with the office's
 *     own words;
 *   - when nothing answers, it does not throw either, and says the office did not answer.
 *
 * MUTATION PROOF, in the commit that adds this file: `throw` on a refusal in writeAUseLine turns the refusal case red.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { writeAUseLine } from '../tools/use-line.mjs'

/** One request the stand-in office was sent. */
interface Heard {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: Record<string, unknown>
}

/** The run the stand-in refuses, as the office refuses a session header that names no run. */
const A_REFUSED_RUN = 'a-run-the-office-refuses'
const REFUSAL = 'x-mole-office-session is "a-run-the-office-refuses", which names no record. Nothing was written.'

let office: Server
let api = ''
const heard: Heard[] = []
let keyBefore: string | undefined
let configurationBefore: string | undefined
const SHELL_KEY = 'mok_a-made-up-shell-key-for-the-use-line'

beforeAll(async () => {
  // Every key in this test is made up. Nothing goes to the live office.
  keyBefore = process.env['MOLE_AGENT_KEY']
  configurationBefore = process.env['MOLE_OFFICE_TOOL_CONFIGURATION']
  office = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: text === '' ? {} : JSON.parse(text) })
      res.setHeader('content-type', 'application/json')
      if (req.headers['x-mole-office-session'] === A_REFUSED_RUN) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: REFUSAL }))
        return
      }
      res.statusCode = 201
      res.end(JSON.stringify({ run: String(req.headers['x-mole-office-session']), uses: heard.length }))
    })
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterAll(async () => {
  if (keyBefore !== undefined) process.env['MOLE_AGENT_KEY'] = keyBefore
  else delete process.env['MOLE_AGENT_KEY']
  if (configurationBefore !== undefined) process.env['MOLE_OFFICE_TOOL_CONFIGURATION'] = configurationBefore
  else delete process.env['MOLE_OFFICE_TOOL_CONFIGURATION']
  await new Promise<void>((closed) => office.close(() => closed()))
})

beforeEach(() => {
  delete process.env['MOLE_AGENT_KEY']
  delete process.env['MOLE_OFFICE_TOOL_CONFIGURATION']
})

const named = (session: string) => ({ api: `${api}/`, workspace: 'default', agent: 'use-line-tester', session })

describe('writeAUseLine', () => {
  it.each([
    { configuration: undefined, environment: undefined },
    { configuration: '', environment: undefined },
    { configuration: undefined, environment: '' },
    { configuration: '', environment: '' },
    { configuration: '', environment: 'a-file-the-empty-caller-value-overrides.json' },
  ])('sends nothing with no key and an empty or missing selected configuration ($configuration, $environment), and returns the exact body', async ({ configuration, environment }) => {
    if (environment !== undefined) process.env['MOLE_OFFICE_TOOL_CONFIGURATION'] = environment
    const body = { tool: 'named-tests', said: 'named 1 file (a.test.ts); 1 ran, exactly those; vitest exited 0' }
    const before = heard.length
    const done = await writeAUseLine({ ...body, office: { ...named('the-calling-run'), configuration } })
    expect(heard.slice(before), 'the stand-in must receive no request at all').toEqual([])
    expect(done).toMatchObject({ written: false, why: 'not sent', body })
    expect(done.words).toContain('Nothing was sent.')
    expect(done.words).toContain('This shell holds no key and names no office tool configuration.')
    expect(done.words).toContain('office_request')
    expect(done.words).toContain('POST /api/toolset/uses')
    expect(done.words).toContain("This line is still the run's own word.")
    expect(done.words).toContain('It goes on the run that sends it.')
  })

  it('prints the exact body as one JSON line, including quotes, backslashes, line breaks and long text', async () => {
    const body = { tool: 'a-"tool\\name', said: `quoted "words", a backslash \\, a line\nbreak, and 中文: ${'long '.repeat(120)}` }
    const done = await writeAUseLine({ ...body, office: named('the-calling-run') })
    const lines = done.words.split('\n').filter((line) => line.startsWith('{'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe(JSON.stringify(body))
    expect(JSON.parse(lines[0] ?? '')).toEqual(body)
  })

  it("with a shell key, posts {tool, said} with the caller's headers, and answers written", async () => {
    process.env['MOLE_AGENT_KEY'] = SHELL_KEY
    const before = heard.length
    const done = await writeAUseLine({ tool: 'named-tests', said: 'named 1 file (a.test.ts); 1 ran, exactly those; vitest exited 0', office: named('the-calling-run') })
    expect(done).toEqual({ written: true, why: 'written', words: 'The use was written on the run the-calling-run.' })
    const posts = heard.slice(before)
    expect(posts.map((one) => `${one.method} ${one.url}`)).toEqual(['POST /api/toolset/uses'])
    expect(posts[0]?.body).toEqual({ tool: 'named-tests', said: 'named 1 file (a.test.ts); 1 ran, exactly those; vitest exited 0' })
    expect(posts[0]?.headers['x-mole-office-session']).toBe('the-calling-run')
    expect(posts[0]?.headers['x-mole-office-actor-type']).toBe('agent')
    expect(posts[0]?.headers['x-mole-office-actor-id']).toBe('use-line-tester')
    expect(posts[0]?.headers['x-mole-office-workspace']).toBe('default')
    expect(posts[0]?.headers['x-mole-office-key']).toBe(SHELL_KEY)
  })

  it('sends nothing when one of the four is missing or blank, and says which', async () => {
    const cases = [
      { office: { ...named('a-run'), api: undefined }, why: 'no office', says: 'no office was named, because MOLE_OFFICE_API is not set' },
      { office: { ...named('a-run'), api: '  ' }, why: 'no office', says: 'no office was named, because MOLE_OFFICE_API is not set' },
      { office: { ...named('a-run'), session: undefined }, why: 'no run', says: 'no run was named, because MOLE_OFFICE_SESSION is not set' },
      { office: { ...named('a-run'), session: '' }, why: 'no run', says: 'no run was named, because MOLE_OFFICE_SESSION is not set' },
      { office: { ...named('a-run'), workspace: null }, why: 'no project', says: 'no project was named, because MOLE_OFFICE_WORKSPACE is not set' },
      { office: { ...named('a-run'), agent: '' }, why: 'no agent', says: "MOLE_OFFICE_AGENT is not set, and a use is never written in the person's name" },
    ]
    const before = heard.length
    for (const one of cases) {
      const done = await writeAUseLine({ tool: 'data-copy', said: 'make: copied', office: one.office })
      expect(done.written, one.why).toBe(false)
      expect(done.why).toBe(one.why)
      expect(done.words).toContain(one.says)
    }
    expect(heard.length, 'a request was sent with one of the four missing').toBe(before)
  })

  it("with a shell key, answers refused with the office's own words when the office answers 400, and does not throw", async () => {
    process.env['MOLE_AGENT_KEY'] = SHELL_KEY
    const done = await writeAUseLine({ tool: 'sandbox', said: 'worker: run x was filed', office: named(A_REFUSED_RUN) })
    expect(done.written).toBe(false)
    expect(done.why).toBe('refused')
    expect(done.words).toBe(`The use was not written on the run ${A_REFUSED_RUN}: the office answered 400: ${REFUSAL}`)
  })

  it('with a shell key, says the office did not answer when nothing listens, and does not throw', async () => {
    process.env['MOLE_AGENT_KEY'] = SHELL_KEY
    const closed = createServer()
    await new Promise<void>((ready) => closed.listen(0, '127.0.0.1', ready))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((done) => closed.close(() => done()))
    const done = await writeAUseLine({ tool: 'sandbox', said: 'worker: run x was filed', office: { ...named('a-run'), api: `http://127.0.0.1:${String(port)}` } })
    expect(done.written).toBe(false)
    expect(done.why).toBe('no answer')
    expect(done.words).toContain(`The use was not written on any run: the office at http://127.0.0.1:${String(port)} did not answer`)
  })
})
