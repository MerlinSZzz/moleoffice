// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A dsh WORKER ASKS THE OFFICE THROUGH ITS OWN TOOL, office_request, WHICH HOLDS THE RUN'S KEY SO THE MODEL NEVER DOES.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Problem jgTM-z-63Vls, 28 September 2026. dsh's subprocess guard leaves every variable named like a key out of the
 * commands a dsh agent runs, so MOLE_AGENT_KEY never reached a DeepSeek worker's curl, every write it tried was refused,
 * and the workers went looking for a key in files (problem 946YWnWvfPA8, keys left in a sandbox's files). The tool in
 * tools/dsh-hooks/office-tool.mjs runs inside the dsh process and asks for the model; the secretary set its four rules (message
 * KIfELcvSJ12h).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   1. A request carries the run's own identity and key, and nothing the model sends sets or overrides them.
 *   2. A redirect is handed back as it came and followed nowhere, so the key goes nowhere the answer points.
 *   3. A path that is not the office's, read as the office will read it, is refused and nothing is sent; a path with a
 *      query is sent as it is.
 *   4. Every 64-hex key in a reply's body, its Location and an error line is replaced, and nothing else is changed.
 *   5. A key that straddles the cut of a long reply is replaced whole, so no part of it reaches the model. The inspector
 *      refused the first version of this tool for that (run AOBa-MRkNg5_, 28 September 2026): it cut the reply first,
 *      and a key across the cut was left as 63 hex characters, which the key pattern does not match.
 *   6. A body sent as a string is refused and nothing is sent; the refusal says the caller sent it so, and that the
 *      write is never to be sent another way (problem fO_gBrFz9Ax9; 1vBcuEtghSIh and hquhMXN0XZpJ).
 *   7. dsh's own render of an answer that refused a write says the same, and says nothing more for a read.
 *   8. An office that does not answer: a write says it may or may not be stored and names the one way to read it back,
 *      a read says only that nothing answered, and neither message is a second send of the request (the secretary's eILVKeOHc0ts).
 *   9. The body is declared a JSON object with any keys, in the one definition dsh and MCP both read. dsh's own compile
 *      of that shape to type object, and its refusal of a string body, were seen by hand on dsh 0.1.5-rc.2 on
 *      17 Oct 2026, and are not tested here.
 *  10. dsh refuses arguments that do not fit the definition itself, before the tool runs (ToolArgsError, code
 *      INVALID_ARGS), so its words are its own: "invalid arguments: \"body\" must be an object". dsh hands that
 *      refusal to the tool's finalizeContent, and for a write the tool adds the words never to send it another way. It
 *      adds nothing to a read, to an answer, or to a refusal of the tool's own, which carries them already. That the
 *      real registry hands the refusal to finalizeContent was seen by hand on dsh 0.1.5-rc.2 on 17 Oct 2026
 *      (round zq9ZwpqLKHqz, s3-dsh-args-refusal-probe.mjs), and is not tested here.
 *  13. A write that may seal the run is answered in a shape that fits the output schema dsh validates it against:
 *      every key it holds is declared. From 9 to 12 November 2026 such an answer also held a sentence under
 *      `handedOver`, and the schema declared that key, because dsh had refused the sealing answer while the key was
 *      undeclared ("value.handedOver" is not a declared property). The code that wrote the sentence is deleted, so
 *      neither the answer nor the schema holds it now. The schema's refusal is applied in the case from the rules it
 *      is declared with: a key that is not a property is refused, as dsh refused it; a required key must be there; a
 *      declared key must have its type. THE VALIDATOR IS A STAND-IN, not dsh: dsh is not in this checkout, so the case
 *      applies those rules itself and reproduces the refusal dsh gave; it does not call dsh's own validator.
 *
 * THE OFFICE IS A STAND-IN on this computer, and a second stand-in is where a redirect points; the key is made up.
 * dsh's own defineTool is stood in for by one that hands back what it is given, so the tool's own execute and render are
 * what run. That the real defineTool takes the same options was seen on 28 September 2026 on the host's dsh, by hand.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. The redirect followed (redirect: 'follow'). Case 2 goes red.
 *   2. The check for an encoded dot, slash or backslash taken out. Case 3 goes red.
 *   3. The check for a doubled slash taken out. Case 3 goes red.
 *   4. The dot-segment check and the read-back taken out together; either alone still refuses a dot segment, since
 *      the other catches it. Case 3 goes red.
 *   5. Keys handed to the model as they came. Cases 2, 4 and 5 go red.
 *   6. The model's own headers merged over the run's. Case 1 goes red.
 *   7. The reply cut before its keys are replaced, as the refused version did. Case 5 goes red.
 *   8. The string-body refusal taken out of askTheOffice, or the string parsed for the caller instead. Case 6 goes red.
 *   9. renderOfficeAnswer adds nothing to a refused write, or reads the method as it came, in lower case. Case 7 goes red.
 *  10. The catch throws "The office did not answer (...)." for every method again. Case 8 goes red.
 *  11. The catch gives the write sentence to a read as well. Case 8 goes red.
 *  12. The body declared as json again ({ type: 'json' }), as it was before 1f28da370. Case 9 goes red.
 *  13. finalizeContent taken out of the tool. Case 10 goes red.
 *  14. The words added to every refused outcome, not only to dsh's INVALID_ARGS, so the tool's own refusal says them
 *      twice. Case 10 goes red.
 *  15. The words added to dsh's refusal of a read as well. Case 10 goes red.
 *  16. `handedOver` declared in the output schema again. Case 13 goes red.
 *  17. The answer to a sealing write given a key the output schema does not declare. Case 13 goes red.
 *
 * ARGUED, NOT TESTED: the check that the request stays on the office's own origin, and the refusal of a scheme, a space
 * or a backslash. A path must start with /api/, and the read-back refuses what the URL parser would change, so no path
 * reaches either check alone.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { A_KEY_SHOWN_AS, OFFICE_REQUEST, THE_LONGEST_REPLY, theOfficeRequestTool, withoutKeys } from '../tools/dsh-hooks/office-tool.mjs'
import { askTheOffice } from '../tools/office-request.mjs'
import { officeHeaders } from '../tools/sandbox-common.mjs'
import { PURPOSES } from '../src/shared/ops.ts'

const THE_RUNS_KEY = 'a1'.repeat(32)
const A_KEY_IN_A_REPLY = 'b2'.repeat(32)
const THE_RUN = { agent: 'a-dsh-worker', session: 'a-session-id', workspace: 'default' }

type Heard = { method: string; url: string; headers: IncomingHttpHeaders; body: string }
const heard: Heard[] = []
const heardElsewhere: Heard[] = []
let office: Server
let elsewhere: Server
let officeAt = ''
let elsewhereAt = ''
const before: Record<string, string | undefined> = {}

function listen(server: Server): Promise<string> {
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`)))
}

function aStandIn(into: Heard[], answer: (h: Heard) => { status: number; headers?: Record<string, string>; body?: string }): Server {
  return createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => {
      const h = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body }
      into.push(h)
      const a = answer(h)
      res.writeHead(a.status, { 'content-type': 'application/json', ...(a.headers ?? {}) })
      res.end(a.body ?? '')
    })
  })
}

// THE TOOL AS dsh WOULD HOLD IT, made with a stand-in defineTool that hands back what it is given.
const aTool = (fetchImpl?: typeof fetch) =>
  theOfficeRequestTool({ defineTool: (options: unknown) => options, ...(fetchImpl === undefined ? {} : { fetchImpl }) }) as {
    name: string
    parameters: { body: unknown }
    execute: (args: unknown) => Promise<{ status: number; location: string | null; body: string; cut: boolean; added: string | null }>
    output: {
      schema: { type: 'object'; additionalProperties: false; properties: Record<string, { type?: string; required?: boolean; oneOf?: { type: string }[] }> }
      render: (args: unknown, value: unknown) => Array<{ type: string; text: string }>
    }
    finalizeContent: (exec: unknown, result: unknown) => Array<{ type: string; text: string }> | undefined
  }

/** A value's type as the output schema names it. */
const theTypeOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value

/**
 * WHY dsh WOULD REFUSE AN ANSWER, in the rules the output schema is declared with: a key that is no declared property
 * is refused with `"value.<name>" is not a declared property`, a required key must be there, and a declared key must
 * have its type. It is the rule dsh applied when the sealing answer carried an undeclared `handedOver`.
 * @param {ReturnType<typeof aTool>['output']['schema']} schema
 * @param {Record<string, unknown>} answer
 * @returns {string[]}
 */
function theSchemaRefuses(schema: ReturnType<typeof aTool>['output']['schema'], answer: Record<string, unknown>): string[] {
  const refused: string[] = []
  for (const [name, declared] of Object.entries(schema.properties)) {
    if (declared.required === true && !Object.hasOwn(answer, name)) refused.push(`"value.${name}" is required`)
  }
  for (const [name, held] of Object.entries(answer)) {
    const declared = schema.properties[name]
    if (declared === undefined) {
      refused.push(`"value.${name}" is not a declared property`)
      continue
    }
    const types = (declared.oneOf ?? [{ type: declared.type }]).map((one) => one.type)
    if (!types.includes(theTypeOf(held))) refused.push(`"value.${name}" is ${theTypeOf(held)}, and the schema declares ${types.join(' or ')}`)
  }
  return refused
}

beforeAll(async () => {
  elsewhere = aStandIn(heardElsewhere, () => ({ status: 200, body: '{"elsewhere":true}' }))
  elsewhereAt = await listen(elsewhere)
  office = aStandIn(heard, (h) => {
    if (h.url === '/api/a-redirect') return { status: 302, headers: { location: `${elsewhereAt}/api/taken?key=${A_KEY_IN_A_REPLY}` } }
    if (h.url.startsWith('/api/a-key')) {
      return { status: 201, body: JSON.stringify({ agent: { id: 'x' }, whatToGiveIt: { key: A_KEY_IN_A_REPLY }, not: { short: 'c3'.repeat(31) + 'c', long: 'd4'.repeat(33) } }) }
    }
    // A LONG REPLY WITH A KEY ACROSS THE CUT: it starts 63 characters before it, as in the inspector's probe. The 1000
    // characters after keep the reply longer than the cut once the key is replaced. No x or y is a hex character.
    if (h.url === '/api/a-long-reply') return { status: 200, body: 'x'.repeat(THE_LONGEST_REPLY - 63) + A_KEY_IN_A_REPLY + 'y'.repeat(1000) }
    // A SEALING WRITE IS STORED, as the records door answers one: a number in newSeq.
    if (h.method === 'PATCH' && h.url === `/api/records/${THE_RUN.session}`) return { status: 200, body: '{"newSeq":4}' }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })
  officeAt = await listen(office)
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'MOLE_AGENT_KEY']) before[name] = process.env[name]
  process.env['MOLE_OFFICE_API'] = officeAt
  process.env['MOLE_OFFICE_AGENT'] = THE_RUN.agent
  process.env['MOLE_OFFICE_SESSION'] = THE_RUN.session
  process.env['MOLE_OFFICE_WORKSPACE'] = THE_RUN.workspace
  process.env['MOLE_AGENT_KEY'] = THE_RUNS_KEY
})

afterAll(async () => {
  for (const [name, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  await Promise.all([office, elsewhere].map((s) => new Promise((done) => s?.close(done))))
})

describe(`${OFFICE_REQUEST}, the office's own tool for a dsh worker`, () => {
  it("1: sends the run's own identity and key, and nothing the model sends sets or overrides them", async () => {
    heard.length = 0
    const answer = await aTool().execute({
      method: 'POST',
      path: '/api/records',
      body: { kind: 'note', 'x-mole-office-actor-id': 'somebody-else' },
      headers: { 'x-mole-office-actor-id': 'somebody-else', 'x-mole-office-key': 'e5'.repeat(32), 'x-mole-office-workspace': 'another' },
    })
    expect(answer.status).toBe(200)
    expect(heard).toHaveLength(1)
    const sent = heard[0]!.headers
    expect(sent['x-mole-office-actor-type']).toBe('agent')
    expect(sent['x-mole-office-actor-id']).toBe(THE_RUN.agent)
    expect(sent['x-mole-office-session']).toBe(THE_RUN.session)
    expect(sent['x-mole-office-workspace']).toBe(THE_RUN.workspace)
    expect(sent['x-mole-office-key']).toBe(THE_RUNS_KEY)
    expect(JSON.parse(heard[0]!.body)).toEqual({ kind: 'note', 'x-mole-office-actor-id': 'somebody-else' })
  })

  it('2: hands a redirect back as it came, follows none, and so sends the key nowhere it points', async () => {
    heard.length = 0
    heardElsewhere.length = 0
    const answer = await aTool().execute({ method: 'GET', path: '/api/a-redirect' })
    expect(answer.status).toBe(302)
    expect(answer.location).toBe(`${elsewhereAt}/api/taken?key=${A_KEY_SHOWN_AS}`)
    expect(heardElsewhere, 'the redirect was followed, with the run\'s key').toHaveLength(0)
  })

  it("3: refuses a path that is not the office's, read as the office will read it, and sends nothing", async () => {
    heard.length = 0
    for (const path of [
      '/api/../x',
      '/api/records/../../x',
      '/api/%2e%2e/x',
      '/api/x%2fy',
      '/api/x%5cy',
      '/api//x',
      '//127.0.0.1:1/api/x',
      `${elsewhereAt}/api/x`,
      '/x',
      'api/x',
      '',
    ]) {
      await expect(aTool().execute({ method: 'GET', path }), `the path ${JSON.stringify(path)} was sent`).rejects.toThrow(/The path was refused/)
    }
    expect(heard, 'a refused path reached the office').toHaveLength(0)
    const fine = await aTool().execute({ method: 'GET', path: '/api/records?kind=problem&limit=2' })
    expect(fine.status).toBe(200)
    expect(heard.map((h) => h.url)).toEqual(['/api/records?kind=problem&limit=2'])
  })

  it('4: replaces every 64-hex key in a body, a Location and an error line, and changes nothing else', async () => {
    const answer = await aTool().execute({ method: 'POST', path: '/api/a-key', body: {} })
    expect(answer.status).toBe(201)
    expect(answer.body).not.toContain(A_KEY_IN_A_REPLY)
    const read = JSON.parse(answer.body) as { whatToGiveIt: { key: string }; not: { short: string; long: string } }
    expect(read.whatToGiveIt.key).toBe(A_KEY_SHOWN_AS)
    // NOTHING ELSE CHANGES: 63 and 66 hex characters are not a key's shape.
    expect(read.not).toEqual({ short: 'c3'.repeat(31) + 'c', long: 'd4'.repeat(33) })
    expect(aTool().output.render({}, answer)[0]!.text).not.toContain(A_KEY_IN_A_REPLY)
    // AN ERROR LINE, from an office that answered nothing but named a key.
    const failing = aTool((() => Promise.reject(new Error(`connect refused at ${A_KEY_IN_A_REPLY}`))) as unknown as typeof fetch)
    await expect(failing.execute({ method: 'GET', path: '/api/records' })).rejects.toThrow(A_KEY_SHOWN_AS)
    await failing.execute({ method: 'GET', path: '/api/records' }).catch((err: Error) => expect(err.message).not.toContain(A_KEY_IN_A_REPLY))
    expect(withoutKeys(`${THE_RUNS_KEY} and ${THE_RUNS_KEY}`)).toBe(`${A_KEY_SHOWN_AS} and ${A_KEY_SHOWN_AS}`)
  })

  it('5: replaces a key that straddles the cut of a long reply, so no part of it reaches the model', async () => {
    const answer = await aTool().execute({ method: 'GET', path: '/api/a-long-reply', fields: 'whole' })
    expect(answer.cut).toBe(true)
    expect(answer.body).toHaveLength(THE_LONGEST_REPLY)
    // CUT FIRST, the reply would end in the key's first 63 hex characters.
    expect(answer.body, 'part of a key that straddled the cut reached the model').not.toMatch(/[0-9A-Fa-f]{8}/)
    expect(answer.body.slice(THE_LONGEST_REPLY - 63)).toBe(A_KEY_SHOWN_AS + 'y'.repeat(63 - A_KEY_SHOWN_AS.length))
  })

  it('6: refuses a body sent as a string, says the caller sent it so, and sends nothing', async () => {
    heard.length = 0
    for (const method of ['POST', 'PUT', 'PATCH']) {
      await expect(aTool().execute({ method, path: '/api/records', body: '{"kind":"note"}' }), method).rejects.toThrow(A_STRING_BODY_IS_REFUSED)
    }
    expect(heard, 'a body sent as a string reached the office').toHaveLength(0)
  })

  it('7: renders an answer that refused a write with the words never to send it another way, and a read without them', () => {
    const refused = { status: 400, location: null, body: '{"error":"A synthetic refusal."}', cut: false, added: null }
    expect(aTool().output.render({ method: 'patch', path: '/api/records/x' }, refused)[0]!.text).toBe(`400\n{"error":"A synthetic refusal."}\n(${A_REFUSED_WRITE})`)
    expect(aTool().output.render({ method: 'GET', path: '/api/records/x' }, refused)[0]!.text).toBe('400\n{"error":"A synthetic refusal."}')
    expect(aTool().output.render({ method: 'PATCH', path: '/api/records/x' }, { ...refused, status: 200 })[0]!.text).toBe('200\n{"error":"A synthetic refusal."}')
  })

  it('8: says a write the office did not answer may or may not be stored and is read back before it is sent again, sends it once, and says no such thing of a read', async () => {
    const heardBy: string[] = []
    const silent = createServer((req) => {
      heardBy.push(req.method ?? '')
      req.socket.destroy()
    })
    await new Promise<void>((ready) => silent.listen(0, '127.0.0.1', () => ready()))
    /** The message a call throws, since the stand-in never answers. */
    const messageOf = async (args: { method: string; path: string; body?: unknown }): Promise<string> => {
      try {
        await aTool().execute(args)
      } catch (err) {
        return (err as Error).message
      }
      throw new Error('the office answered, though the stand-in answers nothing')
    }
    try {
      process.env['MOLE_OFFICE_API'] = `http://127.0.0.1:${String((silent.address() as AddressInfo).port)}`
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const said = await messageOf({ method, path: '/api/records/x', ...(method === 'DELETE' ? {} : { body: { title: 'x' } }) })
        expect(said.replace(/\(.+\)/, '(…)'), method).toBe(A_WRITE_THE_OFFICE_DID_NOT_ANSWER)
      }
      const read = await messageOf({ method: 'GET', path: '/api/records/x' })
      expect(read).toMatch(/^The office did not answer \(.+\)\.$/)
      expect(read).not.toContain('may or may not be stored')
      expect(heardBy, 'a request that did not answer was sent twice').toEqual(['POST', 'PUT', 'PATCH', 'DELETE', 'GET'])
    } finally {
      process.env['MOLE_OFFICE_API'] = officeAt
      await new Promise<void>((done) => silent.close(() => done()))
    }
  })

  it('9: declares the body as a JSON object with any keys, which dsh compiles to type object', () => {
    expect(aTool().parameters.body).toEqual({ type: 'object', additionalProperties: true, description: 'The JSON body, for POST, PUT and PATCH.' })
  })

  it("10: adds the words never to send it another way to dsh's own refusal of a write's arguments, and nothing to a read's, an answer or the tool's own refusal", () => {
    // dsh's own refusal, as its registry hands it on (the words were measured on dsh 0.1.5-rc.2; see the header).
    const refusedByDsh = (violation: string) => ({
      isError: true,
      content: [{ type: 'text', text: `Error: invalid arguments: ${violation}` }],
      error: { message: `invalid arguments: ${violation}`, info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    const aStringBody = refusedByDsh('"body" must be an object')
    const finalize = aTool().finalizeContent
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'patch']) {
      expect(finalize({ arguments: { method, path: '/api/records', body: '{}' } }, aStringBody), method).toEqual([
        ...aStringBody.content,
        { type: 'text', text: `(${A_REFUSED_WRITE})` },
      ])
    }
    expect(finalize({ arguments: { method: 'GET', path: '/api/records', body: '{}' } }, aStringBody), 'a read').toBeUndefined()
    const refusedByTheTool = {
      isError: true,
      content: [{ type: 'text', text: `Error: Nothing was sent. ${A_REFUSED_WRITE}` }],
      error: { message: `Nothing was sent. ${A_REFUSED_WRITE}` },
    }
    expect(finalize({ arguments: { method: 'POST', path: '/api/records', body: {} } }, refusedByTheTool), "the tool's own refusal").toBeUndefined()
    const answered = { isError: false, content: [{ type: 'text', text: '400\n{}' }] }
    expect(finalize({ arguments: { method: 'POST', path: '/api/records', body: {} } }, answered), 'an answer').toBeUndefined()
  })

  // THE TRACE (chapter 4 rule 11, decision hzszLdEZPyfL). An untraced call is kept 7 days, so its use of a door cannot be
  // counted later. A caller that names its own trace keeps it; otherwise the trace names the run and the purpose.
  it('11: sends a trace on a read and on a write, naming the run and the purpose, and keeps a trace its caller names', async () => {
    heard.length = 0
    await aTool().execute({ method: 'GET', path: '/api/records/a-record' })
    await aTool().execute({ method: 'POST', path: '/api/records', body: { kind: 'note' } })
    expect(heard.map((h) => h.method)).toEqual(['GET', 'POST'])
    for (const h of heard) expect(h.headers['x-mole-office-trace'], h.method).toBe(`${THE_RUN.session}-${String(h.headers['x-mole-office-purpose'])}`)
    heard.length = 0
    await askTheOffice({ method: 'GET', path: '/api/records/a-record' }, { trace: 'a-callers-own-trace' })
    expect(heard[0]!.headers['x-mole-office-trace'], 'through the tool').toBe('a-callers-own-trace')
    expect(officeHeaders({ ...THE_RUN, trace: 'a-callers-own-trace' })['x-mole-office-trace'], 'where it is built').toBe('a-callers-own-trace')
  })

  it('12: gives two purposes two traces, each naming the run and its purpose', () => {
    const [one, two] = PURPOSES.filter((purpose) => purpose !== 'normal')
    const sent = [one, two].map((purpose) => officeHeaders({ ...THE_RUN, purpose }))
    expect(sent.map((headers) => headers['x-mole-office-purpose'])).toEqual([one, two])
    expect(sent.map((headers) => headers['x-mole-office-trace'])).toEqual([`${THE_RUN.session}-${String(one)}`, `${THE_RUN.session}-${String(two)}`])
  })

  it("13: a sealing write's answer fits the output schema dsh validates, and the schema declares no handed-over sentence", async () => {
    heard.length = 0
    const answer = await aTool().execute({ method: 'PATCH', path: `/api/records/${THE_RUN.session}`, body: { dataPatch: { state: 'finished' } } })
    const schema = aTool().output.schema
    expect(answer).not.toHaveProperty('handedOver')
    expect(theSchemaRefuses(schema, answer as unknown as Record<string, unknown>), 'dsh would refuse the sealing answer').toEqual([])
    // A READ FITS THE SCHEMA THE SAME WAY.
    heard.length = 0
    const read = await aTool().execute({ method: 'GET', path: '/api/records/a-record' })
    expect(read).not.toHaveProperty('handedOver')
    expect(theSchemaRefuses(schema, read as unknown as Record<string, unknown>), 'dsh would refuse a read').toEqual([])
    expect(schema.properties).not.toHaveProperty('handedOver')
  })
})

// THE WORDS, written out here so that a change to them is a change to this file.
const A_REFUSED_WRITE = 'This write was refused. Fix it and send it again through office_request, or end the step and name the refusal; never send it another way.'
// The reason a fetch gives is replaced with (…), so this compares the sentence around it.
const A_WRITE_THE_OFFICE_DID_NOT_ANSWER =
  'The office did not answer (…), so this write may or may not be stored. Read it back through office_request before you send it again; never send it another way.'
const A_STRING_BODY_IS_REFUSED = 'The body was refused, and nothing was sent: it reached office_request as a string, as its caller sent it, ' +
  'and this tool never turns a body into a string. Send the body as a JSON object, not as JSON text in quotes. ' + A_REFUSED_WRITE
