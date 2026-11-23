// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t); await fileSyntheticAlias(t) })
afterEach(() => t?.close())
const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const person = THE_TEST_OFFICES_OWNER.id

const sent = (by: string, underTheGrant?: string) => ({
  answer: { pressed: true }, by, ...(underTheGrant === undefined ? {} : { underTheGrant }), at: '2026-01-01 00:00:00', to: alias, message: 'synthetic-message',
})

describe('reading a report', () => {
  it('reads the agent an answer went to, and the sender only when it sent under the grant', async () => {
    const { readRecordIdentities } = await reader()
    const underTheGrant = { answers: { b1: { sent: sent(alias, 'synthetic-grant') } } }
    const before = rawHistory(t), copy = structuredClone(underTheGrant)
    expect(readRecordIdentities(t.client.sqlite, 'report', underTheGrant)).toEqual({
      found: [
        { path: 'data.answers.b1.sent.by', as: 'value', stored: alias, canonical, site: 'AnswerSent.by', parse: 'registry-id' },
        { path: 'data.answers.b1.sent.to', as: 'value', stored: alias, canonical, site: 'AnswerSent.to', parse: 'registry-id' },
      ],
      blocks: [],
    })
    expect(underTheGrant).toEqual(copy)
    expect(rawHistory(t)).toEqual(before)
    expect(readRecordIdentities(t.client.sqlite, 'report', { answers: { b1: { sent: sent(person) } } })).toEqual({
      found: [{ path: 'data.answers.b1.sent.to', as: 'value', stored: alias, canonical, site: 'AnswerSent.to', parse: 'registry-id' }],
      blocks: [],
    })
  })
  it('reads the writer of the short-form parts as a stamp only when an agent wrote them', async () => {
    const { readRecordIdentities } = await reader()
    const parts = (writtenBy: string, by: string = alias) => readRecordIdentities(t.client.sqlite, 'report', { shortForms: { parts: { madeFrom: { seq: 1, contentHash: 'synthetic' }, writtenBy, by, parts: [] } } })
    expect(parts('agent', canonical)).toEqual({ found: [{ path: 'data.shortForms.parts.by', as: 'value', stored: canonical, canonical, site: 'ReportParts.by', parse: 'stamp' }], blocks: [] })
    expect(parts('agent')).toEqual({ found: [], blocks: [{ path: 'data.shortForms.parts.by', reason: 'cannot-tell', why: expect.any(String) }] })
    expect(parts('human')).toEqual({ found: [], blocks: [] })
  })
  it('blocks a button or a box that names its receiver, because a handle and an id are stored alike there', async () => {
    const { readRecordIdentities } = await reader()
    const blocks = (one: Record<string, unknown>) => {
      const reading = readRecordIdentities(t.client.sqlite, 'report', { blocks: [one] })
      expect(reading.found).toEqual([])
      return reading.blocks.map(block => [block.path, block.reason])
    }
    expect(blocks({ id: 'b1', type: 'button', label: 'Synthetic press', to: alias })).toEqual([['data.blocks[0].to', 'cannot-tell']])
    expect(blocks({ id: 'b2', type: 'box', blocks: [], to: alias })).toEqual([['data.blocks[0].to', 'cannot-tell']])
    expect(blocks({ id: 'b1', type: 'button', label: 'Synthetic press' })).toEqual([])
  })
})

describe('reading a change row of a report', () => {
  it('reads a whole sent answer by its grant, and blocks the sender read without the answer around it', async () => {
    const { readChangeIdentities } = await reader()
    const read = (field: string, newValue: string) => readChangeIdentities(t.client.sqlite, { kind: 'report' }, { field, oldValue: null, newValue })
    expect(read('data.answers.b1.sent', JSON.stringify(sent(alias, 'synthetic-grant'))).found.map(one => [one.path, one.site, one.canonical])).toEqual([
      ['new_value:data.answers.b1.sent.by', 'AnswerSent.by', canonical],
      ['new_value:data.answers.b1.sent.to', 'AnswerSent.to', canonical],
    ])
    expect(read('data.answers.b1.sent.to', alias).found.map(one => [one.path, one.canonical])).toEqual([['new_value:data.answers.b1.sent.to', canonical]])
    const alone = read('data.answers.b1.sent.by', alias)
    expect(alone.found).toEqual([])
    expect(alone.blocks.map(one => [one.path, one.reason])).toEqual([['new_value:data.answers.b1.sent.by', 'no-writer-kind']])
  })
})
