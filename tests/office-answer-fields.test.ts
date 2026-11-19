// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { answerOfficeMessage } from '../tools/office-mcp.mjs'
import { theOfficeRequestTool } from '../tools/dsh-hooks/office-tool.mjs'
import { askTheOffice, A_KEY_SHOWN_AS, A_REFUSED_WRITE, OFFICE_REQUEST, THE_LONGEST_REPLY, officeRequestDefinition, renderOfficeAnswer } from '../tools/office-request.mjs'
import { officeHeaders } from '../tools/sandbox-common.mjs'
import { hashOfBytes } from '../src/server/lib/version.ts'

// Every office response, identity and file here is synthetic. No server or model is started.
const env = { MOLE_OFFICE_AGENT: 'fixture-worker', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: 'http://127.0.0.1:9' }
const forms = { label: { text: 'Stored label', madeFrom: { seq: 7, contentHash: 'fixture-hash' }, writtenBy: 'agent' }, parts: { conclusion: { text: 'Stored part', madeFrom: { seq: 7 }, writtenBy: 'agent' } } }
const record = { id: 'fixture-record', kind: 'report', title: 'Stored level two title', summary: 'Stored gist', data: { body: 'Full report body must be omitted.', shortForms: forms }, origin: 'fixture' }
const shortRecord = { id: record.id, kind: record.kind, title: record.title, summary: record.summary, shortForms: forms }
const envelope = (body: string, extra = {}) => ({ status: 200, location: null, body, cut: false, added: null, ...extra })
const fetchFor = (value: unknown, status = 200, headers: HeadersInit = {}) => (async () => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers })) as typeof fetch
const rpc = async (args: object, fetchImpl: typeof fetch) => (await answerOfficeMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: OFFICE_REQUEST, arguments: args } }, { fetchImpl, env })) as any
const tool = (fetchImpl: typeof fetch) => theOfficeRequestTool({ defineTool: (definition: any) => definition, fetchImpl, env }) as any
const bodyOf = (result: any) => JSON.parse(result.content[0].text.split('\n')[1])

async function projection() {
  const path = '../tools/office-answer-fields.mjs'
  let module: any = null
  try { module = await import(/* @vite-ignore */ path) } catch (error: any) {
    if (!/Cannot find|Failed to load|ERR_MODULE_NOT_FOUND/.test(String(error?.message))) throw error
  }
  expect(module, 'the pure saved-answer projector must exist').not.toBeNull()
  expect(module.projectOfficeAnswer).toBeTypeOf('function')
  return module.projectOfficeAnswer as (answer: any, fields: any, options?: any) => any
}

describe('office answer fields through the real adapters', () => {
  it('selects only requested body paths, retaining nested array shape and operational envelope', async () => {
    const source = { records: [{ ...record, data: { ...record.data, rows: [{ value: 1, hidden: true }, { value: 2 }] } }], operational: 'omit' }
    const fields = ['records.id', 'records.data.rows.value']
    const answer = await rpc({ method: 'GET', path: '/api/records', fields }, fetchFor(source, 200, { location: '/api/next' }))
    expect(answer.result.isError).toBe(false)
    expect(bodyOf(answer.result)).toEqual({ records: [{ id: record.id, data: { rows: [{ value: 1 }, { value: 2 }] } }] })
    expect(answer.result.content[0].text).toContain('200 Location: /api/next\n')
    const dsh = tool(fetchFor(source))
    const value = await dsh.execute({ method: 'GET', path: '/api/records', fields })
    expect(JSON.parse(value.body)).toEqual(bodyOf(answer.result))
    expect(dsh.output.render({ method: 'GET' }, value)).toEqual(renderOfficeAnswer({ method: 'GET' }, value))
  })

  it('returns stored short forms recursively with provenance and parts, without full data', async () => {
    const source = { records: [record], nested: { record }, next: 'cursor', checks: { ok: true } }
    for (const fields of ['short', undefined]) {
      const args = { method: 'GET', path: '/api/records', ...(fields === undefined ? {} : { fields }) }
      const mcp = await rpc(args, fetchFor(source))
      expect(mcp.result.isError).toBe(false)
      expect(bodyOf(mcp.result)).toEqual({ records: [shortRecord], nested: { record: shortRecord }, next: 'cursor', checks: { ok: true } })
      expect(mcp.result.content[0].text).not.toContain(record.data.body)
      const dsh = tool(fetchFor(source))
      expect(JSON.parse((await dsh.execute(args)).body)).toEqual(bodyOf(mcp.result))
    }
  })

  it('keeps explicit whole bytes and the internal absent-fields legacy contract', async () => {
    const raw = ' \n' + JSON.stringify({ record }, null, 2) + '\n'
    const mcp = await rpc({ method: 'GET', path: '/api/records', fields: 'whole' }, fetchFor(raw))
    expect(mcp.result.content).toEqual([{ type: 'text', text: '200\n' + raw }])
    expect((await tool(fetchFor(raw)).execute({ method: 'GET', path: '/api/records', fields: 'whole' })).body).toBe(raw)
    expect((await askTheOffice({ method: 'GET', path: '/api/records' }, { env, fetchImpl: fetchFor(raw) })).body).toBe(raw)
  })

  it('refuses unknown fields after a write visibly, retains status/location, and never retries or calls it unsent', async () => {
    const calls: unknown[] = []
    const fetchImpl = (async (...args: any[]) => { calls.push(args); return new Response(JSON.stringify({ record }), { status: 201, headers: { location: '/api/records/stored' } }) }) as typeof fetch
    const args = { method: 'POST', path: '/api/records', body: { kind: 'report' }, fields: ['record.missing'] }
    const answer = await rpc(args, fetchImpl)
    expect(answer.result.isError).toBe(true)
    const shown = answer.result.content[0].text
    expect(shown).toContain('201 Location: /api/records/stored\n')
    expect(shown).toMatch(/fields.*refused/i)
    expect(shown).toContain('record.missing')
    expect(shown).toMatch(/write was already sent.*may be stored/i)
    expect(shown).toMatch(/read it back/i)
    expect(shown).not.toMatch(/nothing was sent|write was refused|Full report body/i)
    expect(calls).toHaveLength(1)
    const dsh = tool(fetchImpl)
    const value = await dsh.execute(args)
    expect(value.body).toBe('')
    expect(dsh.output.render(args, value)[0].text).toMatch(/fields.*refused/i)
    expect(calls).toHaveLength(2)
  })

  it.each([[], '', 'record.id', null, {}, [1], [''], ['record..id'], [' record.id'], ['record.id\n'], ['records.0.id'], ['records[*].id'], ['record.__proto__.x'], ['constructor.x'], ['record.prototype'], ['record.id', 'record.id'], ['record', 'record.id']].map(fields => [fields]))('refuses malformed or unsafe fields before writes: %j', async (fields) => {
    let requests = 0
    const fetchImpl = (async () => { requests++; return new Response('{}') }) as typeof fetch
    const args = { method: 'POST', path: '/api/records', body: {}, fields }
    const answer = await rpc(args, fetchImpl)
    expect(answer.result.isError).toBe(true)
    expect(answer.result.content[0].text).toMatch(/fields.*refused/i)
    expect(answer.result.content[0].text).toMatch(/nothing was sent/i)
    expect(answer.result.content[0].text).toContain(A_REFUSED_WRITE)
    await expect(tool(fetchImpl).execute(args)).rejects.toThrow(/fields.*refused/i)
    expect(requests).toBe(0)
  })

  it('fails all selection for heterogeneous arrays, scalar ancestors, unknown own fields and empty deeper arrays', async () => {
    for (const source of [{ records: [{ id: 'one' }, {}] }, { records: [] }, { records: [{ id: 'one' }, null] }, { records: null }]) {
      const answer = await rpc({ method: 'GET', path: '/api/records', fields: ['records.id'] }, fetchFor(source))
      expect(answer.result.isError).toBe(true)
      expect(answer.result.content[0].text).toMatch(/fields.*refused/i)
      expect(answer.result.content[0].text).not.toContain('"one"')
      if (Array.isArray(source.records) && source.records.length === 0) expect(answer.result.content[0].text).toMatch(/empty array.*validat/i)
    }
    const selected = await rpc({ method: 'GET', path: '/api/records', fields: ['records'] }, fetchFor({ records: [], other: true }))
    expect(bodyOf(selected.result)).toEqual({ records: [] })
    const absent = await rpc({ method: 'GET', path: '/api/records', fields: ['toString'] }, fetchFor({}))
    expect(absent.result.isError).toBe(true)
  })

  it('marks missing forms explicitly and keeps nonrecord operational answers byte for byte', async () => {
    const missing = { ...record, data: { body: 'No forms stored' } }
    const answer = await rpc({ method: 'GET', path: '/api/records' }, fetchFor({ record: missing, receipt: { stored: true } }))
    expect(bodyOf(answer.result)).toEqual({ record: { ...shortRecord, shortForms: null }, receipt: { stored: true } })
    expect(answer.result.content[0].text).toMatch(/short forms.*missing/i)
    for (const operation of [ { message: { body: 'Keep the message reading', id: 'message' } }, { kinds: [{ kind: 'report', fields: ['body'] }] }, { checks: [{ passed: true }] }, { record: { id: 'partial', kind: 'report', title: 'Incomplete shape' } } ]) {
      const raw = JSON.stringify(operation, null, 2)
      const unchanged = await rpc({ method: 'GET', path: '/api/operation' }, fetchFor(raw))
      expect(unchanged.result.content[0].text).toBe('200\n' + raw)
    }
  })

  it('projects a narrow leaf from the full masked source before cutoff and keeps whole visibly cut', async () => {
    const key = 'b2'.repeat(32)
    const source = { huge: 'x'.repeat(THE_LONGEST_REPLY + 100), tail: { key, ok: true } }
    const args = { method: 'GET', path: '/api/records', fields: ['tail.key'] }
    const answer = await rpc(args, fetchFor(source))
    expect(bodyOf(answer.result)).toEqual({ tail: { key: A_KEY_SHOWN_AS } })
    expect(answer.result.content[0].text).not.toContain(key)
    expect(answer.result.content[0].text).toBe('200\n' + JSON.stringify({ tail: { key: A_KEY_SHOWN_AS } }))
    const whole = await tool(fetchFor(source)).execute({ ...args, fields: 'whole' })
    expect(whole.cut).toBe(true)
    expect(whole.body).toHaveLength(THE_LONGEST_REPLY)
    expect(renderOfficeAnswer(args, whole)[0]!.text).toMatch(/rest of the reply.*not shown/i)
  })

  it.each(['short', ['record.id']].map(fields => [fields]))('refuses successful non-JSON or unreadable replies by name: %j', async (fields) => {
    for (const raw of ['plain text', '{"record":']) {
      const answer = await rpc({ method: 'GET', path: '/api/records', fields }, fetchFor(raw))
      expect(answer.result.isError).toBe(true)
      expect(answer.result.content[0].text).toMatch(/non-JSON/i)
      expect(answer.result.content[0].text).not.toContain(raw)
    }
    let sends = 0
    const unreadable = (async () => { sends++; return { status: 201, headers: new Headers({ location: '/api/records/stored' }), text: async () => { throw new Error('fixture lost body') } } }) as unknown as typeof fetch
    const answer = await rpc({ method: 'POST', path: '/api/records', body: {}, fields }, unreadable)
    expect(answer.result.isError).toBe(true)
    expect(answer.result.content[0].text).toContain('201 Location: /api/records/stored\n')
    expect(answer.result.content[0].text).toMatch(/could not be read|unreadable/i)
    expect(answer.result.content[0].text).toMatch(/write was already sent.*may be stored/i)
    expect(sends).toBe(1)
  })

  it('preserves HTTP refusals, redirects, masking, identity and request semantics for every fields mode', async () => {
    const key = 'c3'.repeat(32)
    for (const fields of ['short', 'whole', ['unknown']]) {
      for (const status of [302, 403]) {
        const calls: any[] = []
        const fetchImpl = (async (input: any, init: any) => { calls.push({ input, init }); return new Response('Refused or redirected ' + key, { status, headers: { location: '/api/next?key=' + key } }) }) as typeof fetch
        const args = { method: 'PATCH', path: '/api/records?limit=2', body: { original: true }, fields, headers: { 'x-mole-office-actor-id': 'other' } }
        const answer = await rpc(args, fetchImpl)
        expect(answer.result.content[0].text).toContain(`${status} Location: /api/next?key=${A_KEY_SHOWN_AS}\nRefused or redirected ${A_KEY_SHOWN_AS}`)
        if (status >= 400) expect(answer.result.content[0].text).toContain(A_REFUSED_WRITE)
        expect(calls).toHaveLength(1)
        expect(calls[0].input).toBe(env.MOLE_OFFICE_API + args.path)
        expect(calls[0].init).toMatchObject({ method: args.method, body: JSON.stringify(args.body), headers: officeHeaders({ agent: env.MOLE_OFFICE_AGENT, session: env.MOLE_OFFICE_SESSION, workspace: env.MOLE_OFFICE_WORKSPACE, key: undefined }), redirect: 'manual' })
        expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
        expect(calls[0].init.signal.aborted).toBe(false)
      }
    }
  })

  it('masks key-shaped field paths in projection refusal notices for both adapters and internal callers', async () => {
    const key = 'd4'.repeat(32)
    const args = { method: 'GET', path: '/api/records', fields: [key] }
    const mcp = await rpc(args, fetchFor({ ok: true }))
    const dsh = tool(fetchFor({ ok: true }))
    const value = await dsh.execute(args)
    const internal = await askTheOffice(args, { env, fetchImpl: fetchFor({ ok: true }) })
    expect(mcp.result.isError).toBe(true)
    expect(value.projectionRefused).toBe(true)
    expect(internal.projectionRefused).toBe(true)
    for (const text of [mcp.result.content[0].text, value.added, internal.added, dsh.output.render(args, value)[0].text]) {
      expect(text).not.toContain(key)
      expect(text).toContain(A_KEY_SHOWN_AS)
    }
  })

  it('masks keys reconstructed by projection before the projected body cutoff', async () => {
    const key = 'f6'.repeat(32)
    const emptyPrefix = JSON.stringify({ padding: '' }).slice(0, -1) + ',"key":"'
    const padding = 'x'.repeat(THE_LONGEST_REPLY - emptyPrefix.length - key.length / 2)
    const prefix = JSON.stringify({ padding }).slice(0, -1) + ',"key":"'
    const escaped = key.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('')
    const raw = prefix + escaped + '","tail":"' + 'x'.repeat(key.length * 2) + '"}'
    const args = { method: 'GET', path: '/api/records', fields: ['padding', 'key', 'tail'] }
    const mcp = await rpc(args, fetchFor(raw))
    const value = await tool(fetchFor(raw)).execute(args)
    const internal = await askTheOffice(args, { env, fetchImpl: fetchFor(raw) })
    expect(mcp.result.isError).toBe(false)
    expect(value.cut).toBe(true)
    expect(internal.cut).toBe(true)
    const expectedPrefix = (prefix + A_KEY_SHOWN_AS).slice(0, THE_LONGEST_REPLY)
    for (const body of [mcp.result.content[0].text.split('\n')[1], value.body, internal.body]) {
      expect(body.length).toBe(THE_LONGEST_REPLY)
      expect(body.includes(key.slice(0, key.length / 2)), 'a reconstructed key fragment reached the cutoff').toBe(false)
      expect(body.startsWith(expectedPrefix)).toBe(true)
    }
  })

  it('advertises a real fields union in MCP tools/list and dsh defineTool', async () => {
    const listed = await answerOfficeMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) as any
    const schema = listed.result.tools.find((item: any) => item.name === OFFICE_REQUEST).inputSchema
    const dsh = tool(fetchFor({}))
    expect(schema.properties.fields, 'MCP fields schema').toBeDefined()
    expect(dsh.parameters.fields, 'dsh fields schema').toBeDefined()
    const { required: _required, description: _description, ...dshFields } = dsh.parameters.fields
    // Each node uses only the shared value-schema vocabulary accepted by the harness readers.
    const allowed = new Set(['type', 'oneOf', 'items', 'enum', 'description'])
    const checkVocabulary = (node: any): void => {
      for (const key of Object.keys(node)) expect(allowed.has(key), `unsupported schema keyword ${key}`).toBe(true)
      if (node.items !== undefined) checkVocabulary(node.items)
      if (node.oneOf !== undefined) for (const choice of node.oneOf) checkVocabulary(choice)
    }
    checkVocabulary(dshFields)
    const validate = new Ajv({ strict: false }).compile(schema)
    const validateDsh = new Ajv({ strict: false }).compile(dshFields)
    for (const fields of ['short', 'whole', [], ['record.id'], ['record.id', 'record.title']]) {
      expect(validate({ method: 'GET', path: '/api/records', fields }), JSON.stringify(validate.errors)).toBe(true)
      expect(validateDsh(fields), JSON.stringify(validateDsh.errors)).toBe(true)
    }
    for (const fields of ['record.id', 4, {}, [4], null]) {
      expect(validate({ method: 'GET', path: '/api/records', fields })).toBe(false)
      expect(validateDsh(fields)).toBe(false)
    }
    expect(validate({ method: 'GET', path: '/api/records' })).toBe(true)
    expect(officeRequestDefinition.parameters).toHaveProperty('fields')
  })

  it('checks upload integrity against the full answer before projecting the rendered body', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'answer-fields-upload-'))
    try {
      const bytes = Buffer.from('synthetic report attachment')
      const path = join(dir, 'attachment.txt'); writeFileSync(path, bytes)
      const hash = hashOfBytes(bytes)
      for (const mismatch of [false, true]) {
        const calls: any[] = []
        const fetchImpl = (async (_url: any, init: any) => {
          calls.push(init)
          if (init.method === 'GET') return new Response(JSON.stringify({ reportFile: { maxBytes: bytes.length + 1 } }))
          return new Response(JSON.stringify({ padding: 'x'.repeat(THE_LONGEST_REPLY + 1), file: { id: 'fixture-file', size: bytes.length, hash: mismatch ? 'wrong-hash' : hash }, record }), { status: 201 })
        }) as typeof fetch
        const args = { method: 'POST', path: '/api/report-files', body: { name: 'attachment.txt', bytes: { fromFile: path } }, fields: ['record.id'] }
        const answer = await rpc(args, fetchImpl)
        expect(answer.result.isError).toBe(mismatch)
        expect(bodyOf(answer.result)).toEqual({ record: { id: record.id } })
        expect(answer.result.content[0].text).toMatch(mismatch ? /DOES NOT MATCH/ : /stored file matches/)
        expect(calls).toHaveLength(2)
        expect(JSON.parse(calls[1].body)).toEqual({ name: 'attachment.txt', bytes: bytes.toString('base64') })
      }
      let sends = 0
      const invalid = await rpc({ method: 'POST', path: '/api/report-files', body: { bytes: { fromFile: path } }, fields: [] }, (async () => { sends++; return new Response('{}') }) as typeof fetch)
      expect(invalid.result.isError).toBe(true)
      expect(sends).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('pure saved-answer replay', () => {
  it('projects saved text without office access or input mutation and preserves notices', async () => {
    const project = await projection()
    const saved = envelope(JSON.stringify({ record, ok: true }), { added: 'Stored receipt notice', location: '/api/next' })
    const before = structuredClone(saved)
    expect(JSON.parse(project(saved, ['record.id']).body)).toEqual({ record: { id: record.id } })
    expect(project(saved, 'short').added).toBe(saved.added)
    expect(project(saved, 'short').location).toBe(saved.location)
    expect(project(saved, 'whole')).toEqual(saved)
    const failed = project(saved, ['unknown'], { write: true })
    expect(failed.body).toBe('')
    expect(failed.added).toContain(saved.added)
    expect(failed.added).toMatch(/write was already sent.*may be stored/i)
    expect(saved).toEqual(before)
  })

  it('refuses a cut source even if its prefix is valid JSON', async () => {
    const project = await projection()
    for (const fields of ['short', ['ok']]) {
      const answer = project(envelope('{"ok":true}', { cut: true }), fields)
      expect(answer.body).toBe('')
      expect(answer.added).toMatch(/cut.*cannot|cannot.*cut/i)
    }
  })
})
