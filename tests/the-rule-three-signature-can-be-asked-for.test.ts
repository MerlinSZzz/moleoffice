// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULE-THREE SIGNATURE IS WRITTEN DOWN AND CAN BE ASKED FOR.
 *
 * Criterion P40 of design/permissions/ACCEPTANCE.md stands on a decision: point 8, option A,
 * agreed, on proposal `z0P3pIc9bp4F`. The hole is left open and watched
 * for, and what is wanted is the signature written down so a real case can be recognised.
 *
 * THE HOLE. An agent may not add `audience: "developers"` to a block that is already stored. The
 * rule matches by id, because per-block authorship is not stored and there is nothing else to match
 * on. So deleting the block and writing the same words back under a new id gets the mark through.
 *
 * THE SIGNATURE: a rule-3 refusal, followed in the same project by the same record gaining a marked
 * block with an id nothing had seen before.
 *
 * ONLY ONE HALF IS RECORDED, and this proves the product says so rather than implying it found the
 * signature. The refusal throws and is stored nowhere; the call log keeps the operation, the status
 * and the time of every request and not which record was refused.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const REPO = fileURLToPath(new URL('..', import.meta.url))
const QUERY = '/api/queries/rule-three-signature'
const AS_AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' }
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function ask(): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: QUERY })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** A report with one unmarked block, written by an agent. Returns the record and the block id. */
async function aReportWithABlock(title: string): Promise<{ record: string; block: string }> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AN_AGENT,
    payload: { kind: 'report', title, data: { blocks: [{ id: 'b-1', type: 'text', text: 'Words the person should see.' }] } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return { record: String((filed.json() as { record: { id: string } }).record.id), block: 'b-1' }
}

/** The documentation comment immediately above rule 3's guard, and nothing else. */
function accountBesideTheGuard(): string {
  const source = readFileSync(join(REPO, 'src', 'server', 'lib', 'records', 'patching.ts'), 'utf8')
  const guard = source.indexOf('function assertMayNotHideExistingWriting(')
  expect(guard, 'rule 3 is no longer in records/patching.ts').toBeGreaterThan(0)
  const before = source.slice(0, guard)
  const opened = before.lastIndexOf('/**')
  expect(opened, 'the guard has no account written beside it').toBeGreaterThanOrEqual(0)
  const closed = before.indexOf('*/', opened)
  expect(closed, 'the account beside the guard is not a finished comment').toBeGreaterThan(opened)
  expect(before.slice(closed + 2), 'something other than whitespace sits between the account and the guard').toMatch(/^\s*$/)
  return before.slice(opened, closed + 2)
}

/**
 * One paragraph that states the signature, with its three parts in the order the guard means.
 *
 * The paragraph is the unit so the parts cannot be gathered from unrelated paragraphs elsewhere
 * in the long account. The words are checked for meaning rather than one pinned sentence.
 */
function signatureParagraph(text: string, where: string, requiresProject: boolean): void {
  const paragraphs = text
    .split(/\n[ \t]*\*?[ \t]*\n/)
    .map((one) => one.replace(/^\s*\/?\*+\/?/gm, '').replace(/\s+/g, ' ').trim())
    .filter((one) => one !== '')
  const found = paragraphs.filter((one) => {
    const words = one.toLowerCase()
    const refusal = words.search(/\brefus(?:al|e|ed|es|ing)\b/)
    const marked = words.search(/\bmark(?:ed|ing|s)?\b[^.]{0,120}\bblocks?\b|\bblocks?\b[^.]{0,120}\bmark(?:ed|ing|s)?\b/)
    const unseen = words.search(/\b(?:new|unseen)\s+id\b|\bid\b[^.]{0,80}\b(?:nothing|nobody|no earlier revision)\b/)
    if (refusal < 0 || marked < 0 || unseen < 0) return false
    if (!(refusal < marked && marked < unseen)) return false
    if (!/\bsame record\b/.test(words)) return false
    return !requiresProject || /\bsame project\b/.test(words)
  })
  expect(
    found,
    `${where} has no paragraph stating the signature in order: refusal, then the same record's marked block under an unseen id`,
  ).not.toHaveLength(0)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the signature is written where the rule is', () => {
  it('points at the query that is served, and the query states the same ordered signature', async () => {
    const account = accountBesideTheGuard()
    expect(account, 'the account does not name the query that answers the second half').toContain(QUERY)
    const reply = await app.inject({ method: 'GET', url: QUERY })
    expect(reply.statusCode, reply.body).toBe(200)
    const caveat = String((reply.json() as Record<string, unknown>)['theHalfNothingRecords'])
    signatureParagraph(caveat, 'the query', false)
    const words = caveat.toLowerCase()
    expect(words, 'the query does not say the first half is recorded nowhere')
      .toMatch(/\b(?:first half|refusal)\b[^.]{0,200}\b(?:recorded nowhere|not recorded|nothing about it is stored|stored nowhere)\b/)
    expect(words, 'the query does not say its candidates are not the signature').toMatch(/none of these is the signature/)
  })
})

describe('rule 3 still refuses the front door', () => {
  it('refuses an agent marking a block that is already stored', async () => {
    const { record } = await aReportWithABlock('A report with something the person should see')
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { blocks: [{ id: 'b-1', type: 'text', text: 'Words the person should see.', audience: 'developers' }] } },
    })
    expect(reply.statusCode).toBe(400)
    expect(String((reply.json() as { error?: unknown }).error ?? '')).toContain('already stored')
  })

  it('writes nothing when it refuses, so the first half stays out of the ledger', async () => {
    const { record } = await aReportWithABlock('A report the refusal must leave alone')
    const readVersions = async (): Promise<number> => {
      const read = await app.inject({ method: 'GET', url: `/api/records/${record}`, headers: AS_AN_AGENT })
      expect(read.statusCode, read.body).toBe(200)
      return (read.json() as { history: { versions: number } }).history.versions
    }
    const readLedger = async (): Promise<Record<string, unknown>> => {
      const said = await ask()
      return { looked: said['looked'], candidates: said['candidates'] }
    }
    const versionsBefore = await readVersions()
    const ledgerBefore = await readLedger()
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { blocks: [{ id: 'b-1', type: 'text', text: 'Words the person should see.', audience: 'developers' }] } },
    })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(String((reply.json() as { error?: unknown }).error ?? '')).toContain('already stored')
    expect(await readVersions(), 'the refusal wrote a revision of the record it refused').toBe(versionsBefore)
    expect(await readLedger(), 'the refusal changed the ledger the query reads').toEqual(ledgerBefore)
  })
})

describe('the second half can be asked for, and says what it is', () => {
  it('finds nothing when nobody has done it, and says how much it read', async () => {
    const said = await ask()
    expect(said['candidates']).toEqual([])
    const looked = said['looked'] as { records: number; revisions: number }
    expect(looked.revisions, 'it read no revisions, so an empty answer proves nothing').toBeGreaterThan(0)
    expect(String(said['says'])).toContain('Nothing in this project matches')
  })

  it('finds the block when a record gains a marked one under an id nothing had seen', async () => {
    const { record } = await aReportWithABlock('A report whose block came back under a new id')
    // The hole, walked: the block goes, and the same words come back already marked, under a new id.
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: AS_AN_AGENT,
      payload: {
        dataPatch: { blocks: [{ id: 'b-2', type: 'text', text: 'Words the person should see.', audience: 'developers' }] },
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = await ask()
    const found = (said['candidates'] as { recordId: string; blockId: string }[]).find((one) => one.recordId === record)
    expect(found, 'the walk through the hole was not found').toBeDefined()
    expect(found?.blockId).toBe('b-2')
  })

  it('names who made that write, from the change log', async () => {
    const said = await ask()
    const one = (said['candidates'] as { by: { kind: string; id: string } | null }[])[0]
    expect(one?.by).toEqual({ kind: 'agent', id: 'builder-x' })
  })

  it('says plainly that none of these is the signature, because the other half is not stored', async () => {
    const said = await ask()
    const caveat = String(said['theHalfNothingRecords'])
    expect(caveat).toContain('RECORDED NOWHERE')
    expect(caveat).toContain('none of these is the signature')
    expect(caveat).toContain('not which record was refused')
    expect(caveat).toContain('The hole stays open')
    expect(String(said['says'])).toContain('ORDINARY BEHAVIOUR MOST OF THE TIME')
  })

  it('does not call a block a candidate when the record already held that id', async () => {
    // A person may mark a stored block, and that goes through the front door rather than the hole.
    const { record } = await aReportWithABlock('A report the person marked')
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: AS_THE_PERSON,
      payload: {
        dataPatch: { blocks: [{ id: 'b-1', type: 'text', text: 'Words the person should see.', audience: 'developers' }] },
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = await ask()
    expect((said['candidates'] as { recordId: string }[]).some((one) => one.recordId === record)).toBe(false)
  })
})
