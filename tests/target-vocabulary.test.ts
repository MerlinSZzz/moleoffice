// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DECLARATION OF WHAT A PERSON CAN POINT AT, AND EVERYTHING ELSE DERIVED FROM IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Round seven could point at three things, and a fourth needed coordinated edits in about ten
 * places: the stored shape, the shape that validates a write, the reader that says whether the
 * thing is still there, the key two comments about one thing are grouped by, the words the screen
 * draws, and the browser's own copy of all of it. Nobody made those ten edits, so the owner tried
 * to point at a paragraph of a report and could not.
 *
 * `TARGET_SPECS` in src/shared/targets.ts is now the one declaration. This file is what makes that
 * true rather than aspirational: it walks the vocabulary and fails when any entry is missing any of
 * the things everything else derives from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST WOULD CATCH
 * ---------------------------------------------------------------------------------------
 *
 *   NO WORDS          — a target kind with no noun or no sentence draws a blank chip on screen.
 *   NO READER         — a target kind nothing can look up resolves to silence rather than to a
 *                       refusal, so a comment is stored that Mole Office can never speak about again.
 *   NO PUBLISHED SHAPE — an agent reading GET /api/kinds cannot write an annotation about it.
 *   NO ROUND TRIP     — an element saying what it is cannot be read back, so the browser walking up
 *                       from a selection finds an attribute it cannot use.
 *
 * NO DATABASE for most of it: the declaration is a pure read. The one test that needs one is the
 * refusal a kind nothing can resolve gets, because a refusal is a fact about the write path.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY, WHY_A_DRAFT_IS_NOT_ON_THE_SERVER } from '../src/shared/targets.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  TARGET_ATTRIBUTE,
  TARGET_KINDS,
  TARGET_SPECS_BY_KIND,
  TEXT_FIELD_ATTRIBUTE,
  TEXT_OFFSET_ATTRIBUTE,
  isTargetKind,
  nameTarget,
  targetAttributeValue,
  targetAttributes,
  targetFromAttributeValue,
  targetKey,
  targetSpec,
  textAttributes,
  type Target,
} from '../src/shared/targets.ts'
import { SHAPE_SPECS } from '../src/shared/kinds.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** One valid target of every declared kind, built from the declaration's own examples. */
function oneOfEach(): Target[] {
  return TARGET_KINDS.map((kind) => {
    const ids: Record<string, string> = { kind }
    for (const field of targetSpec(kind).identifies) ids[field.key] = field.example
    return ids as unknown as Target
  })
}

describe('every thing a person can point at is declared once, with everything else read off it', () => {
  it('really walks the whole vocabulary, so a test that found nothing cannot pass quietly', () => {
    // The guard on every test below: each iterates over TARGET_KINDS, and a walk over an empty list
    // would look exactly like sixteen agreements.
    //
    // SIXTEEN ON 31 AUGUST 2026, up from fifteen. `change` was added — one write to one field of
    // one record, as the ledger keeps it — because every press inside a record's change log
    // answered the whole record from eight to fifteen levels up, and a change row is not a place
    // the page had no name for. This number is a tripwire and not a fact about the design: it is
    // here so that a kind cannot arrive without somebody reading the tests below and deciding they
    // still cover it.
    expect(TARGET_KINDS.length).toBe(17)
    for (const kind of [
      'record',
      'reportBlock',
      'tableRow',
      'tableCell',
      'planLine',
      'planLineFact',
      'draft',
      'page',
      'uiSurface',
      'change',
    ]) {
      expect(TARGET_KINDS, `the vocabulary lost ${kind}`).toContain(kind)
    }
  })

  it('gives every one of them words a person reads, so nothing draws blank on a screen', () => {
    // THE TEST THE DESIGN ASKED FOR BY NAME: it fails when a target kind has no words. A chip above
    // the composer says what is being pointed at, and it says it with the noun below. A kind with
    // no noun would draw an empty chip, which is the interface saying nothing while looking as
    // though it had said something.
    const missing: string[] = []
    for (const kind of TARGET_KINDS) {
      const spec = TARGET_SPECS_BY_KIND[kind]
      if (spec.noun.trim() === '') missing.push(`${kind} has no noun: nothing can name it in a sentence`)
      if (spec.what.trim().length < 20) missing.push(`${kind} has no sentence saying what it is`)
      // Written for a reader, so it is not the stored word with the underscores taken out.
      if (spec.noun === kind && kind !== 'record' && kind !== 'plan' && kind !== 'page') {
        missing.push(`${kind}'s noun is the stored word itself, which is a leak from the database onto a screen`)
      }
    }
    expect(missing, missing.join(' | ')).toEqual([])
  })

  it('says what identifies every one of them, in plain English, with a real example', () => {
    const missing: string[] = []
    for (const kind of TARGET_KINDS) {
      const spec = TARGET_SPECS_BY_KIND[kind]
      if (spec.identifies.length === 0) missing.push(`${kind} says nothing about what identifies it`)
      for (const field of spec.identifies) {
        if (field.key.trim() === '') missing.push(`${kind} declares an identifier with no key`)
        if (field.what.trim().length < 10) missing.push(`${kind}.${field.key} has no sentence saying what goes in it`)
        if (field.example.trim() === '') missing.push(`${kind}.${field.key} has no example`)
      }
    }
    expect(missing, missing.join(' | ')).toEqual([])
  })

  it('names the identifier that holds a record id wherever it claims to have one', () => {
    // `recordIdentifier` is what makes `context.revision` answerable: revisions are of records, so a
    // target that names no record cannot say which revision it was written against. A key naming a
    // field the target does not have would send the revision check looking at nothing.
    for (const kind of TARGET_KINDS) {
      const spec = TARGET_SPECS_BY_KIND[kind]
      if (spec.recordIdentifier === null) continue
      expect(
        spec.identifies.map((f) => f.key),
        `${kind} says its record id is in "${spec.recordIdentifier}" and declares no such field`,
      ).toContain(spec.recordIdentifier)
    }
    // And the claim is really being made by somebody, or the loop above checked nothing.
    expect(TARGET_KINDS.filter((k) => TARGET_SPECS_BY_KIND[k].recordIdentifier !== null).length).toBeGreaterThan(3)
  })

  it('publishes a shape for every one of them at GET /api/kinds, built from the same declaration', () => {
    // An agent that cannot see the source learns what an annotation's `context` takes from the
    // published shapes. A kind in the vocabulary with no shape is a kind nothing can be written
    // about, and the failure would be a 400 on a target the schema never mentioned.
    const union = SHAPE_SPECS['Target']
    expect(union, 'the Target shape is not published at all').toBeDefined()
    const variants = union?.discriminator?.variants ?? {}
    for (const kind of TARGET_KINDS) {
      const name = variants[kind]
      expect(name, `the published Target shape has no variant for ${kind}`).toBeDefined()
      const shape = SHAPE_SPECS[name ?? '']
      expect(shape, `${kind} selects the shape ${String(name)}, which is not published`).toBeDefined()
      const keys = (shape?.fields ?? []).map((f) => f.key)
      expect(keys, `${String(name)} does not declare its own kind key`).toContain('kind')
      for (const field of targetSpec(kind).identifies) {
        expect(keys, `${String(name)} does not declare ${field.key}, which is what identifies a ${kind}`).toContain(
          field.key,
        )
      }
    }
  })

  it('writes every one of them onto an element and reads it back unchanged', () => {
    // THE DOM CONTRACT. An element is addressable because it says what it is, on itself, and the
    // browser walking up from a selection reads the attribute back. A value that does not round
    // trip is an element the walk finds and cannot use.
    for (const target of oneOfEach()) {
      const value = targetAttributeValue(target)
      const read = targetFromAttributeValue(value)
      expect(read, `${target.kind} did not read back: ${JSON.stringify(read)}`).toEqual({ target })
      // The key two comments about one thing share is the same string the element carries. One
      // spelling, both sides.
      expect(targetKey(target)).toBe(value)
      expect(targetAttributes(target)).toEqual({ [TARGET_ATTRIBUTE]: value })
    }
  })

  it('survives a value holding the separator, because a page route is full of them', () => {
    const target = { kind: 'page', route: '/records?kind=report#top' } as const
    const read = targetFromAttributeValue(targetAttributeValue(target))
    expect(read).toEqual({ target })
  })

  it('reports an attribute it cannot read rather than guessing at what the element meant', () => {
    // A guess here opens a composer pointed at a record id that is really a block id.
    const wrongCount = targetFromAttributeValue('tableCell/rec1/b-1')
    expect('problem' in wrongCount && wrongCount.problem).toContain('4 values')
    const unknownKind = targetFromAttributeValue('sofa/rec1')
    expect('problem' in unknownKind && unknownKind.problem).toContain('not a thing anybody can point at')
    const blank = targetFromAttributeValue('record//panelx')
    expect('problem' in blank && blank.problem).toContain('recordId')
  })

  it('names the two attributes an element holding rendered text carries', () => {
    // Rendered Markdown is not the string it was rendered from, so a selection maps back to a source
    // range by ARITHMETIC — the element's offset plus the characters before the selection inside it.
    // Without the offset a quote taken off the screen has to be searched for, which is guessing when
    // the same words appear twice.
    expect(textAttributes('data.blocks[#b-1].text', 0)).toEqual({
      [TEXT_FIELD_ATTRIBUTE]: 'data.blocks[#b-1].text',
      [TEXT_OFFSET_ATTRIBUTE]: '0',
    })
    expect(textAttributes('summary', 41)[TEXT_OFFSET_ATTRIBUTE]).toBe('41')
  })

  it('names every one of them in a sentence, from its ids alone, for when nothing can be read', () => {
    for (const target of oneOfEach()) {
      const said = nameTarget(target)
      expect(said.trim().length, `${target.kind} names itself as nothing`).toBeGreaterThan(5)
      expect(said, `${target.kind} names itself with an underscore, which is a leak from the database`).not.toContain(
        '_',
      )
    }
  })

  it('answers about its own words and nothing else', () => {
    expect(isTargetKind('reportBlock')).toBe(true)
    expect(isTargetKind('sofa')).toBe(false)
    // `toString` is on every object and is not a target kind. `hasOwnProperty` rather than `in`.
    expect(isTargetKind('toString')).toBe(false)
  })
})

// ---------------------------------------------------------------- a kind nothing can resolve yet

describe('a kind Mole Office cannot look up yet is refused, and the refusal says what is missing', () => {
  let t: TestDb
  let app: FastifyInstance
  const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  async function thread(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Round eight, pointing at things', mode: 'review' },
    })
    expect(res.statusCode, res.body).toBe(201)
    return (res.json() as { thread: { id: string } }).thread.id
  }

  it('refuses a draft, a graph node and a proposed action, each naming what Mole Office does not store', async () => {
    // THE HONEST ANSWER FOR A KIND NOTHING CAN RESOLVE IS A REFUSAL SAYING SO — not a guess, and not
    // silence. Storing the comment would store something Mole Office can never say anything about again.
    const id = await thread()
    const rowsBefore = (t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_messages').get() as { n: number }).n
    const cases = [
      // The two that have a shared sentence are asserted against it, so a rewording of the reason is
      // one edit rather than three. `graphNode` has no shared constant because it is the only one of
      // the three whose reason is genuinely about one kind.
      { target: { kind: 'draft', draftId: 'd1' }, expect: WHY_A_DRAFT_IS_NOT_ON_THE_SERVER },
      { target: { kind: 'graphNode', recordId: 'r1', drawing: 'plan-graph' }, expect: 'which drawing a node is in' },
      { target: { kind: 'proposedAction', interpretationId: 'i1', actionId: 'a-1' }, expect: WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY },
    ]
    for (const one of cases) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${id}/messages`,
        headers: HUMAN,
        payload: { intent: 'ask', body: 'What about this?', context: { target: one.target } },
      })
      expect(res.statusCode, res.body).toBe(400)
      expect((res.json() as { error: string }).error, one.target.kind).toContain(one.expect)
      expect((res.json() as { error: string }).error).toContain('nothing was stored')
    }
    // AND NOTHING WAS STORED, which is the half a refusal can still get wrong. The office is shared
    // by the file, so this is the count taken when the case began, which is what it added.
    const rowsAfter = (t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_messages').get() as { n: number }).n
    expect(rowsAfter - rowsBefore).toBe(0)
  })

  it('accepts a page, because a route is the whole of what a page target records', async () => {
    // The fallback target, for when nothing more precise was under the pointer. It holds no stored
    // text, so there is nothing to look up and nothing to quote — and that is a complete answer
    // rather than a gap.
    const id = await thread()
    const res = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${id}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'This page is confusing.', context: { target: { kind: 'page', route: '/records' } } },
    })
    expect(res.statusCode, res.body).toBe(201)
    const reading = (res.json() as { message: { reading: { state: string; says: string } } }).message.reading
    expect(reading.state).toBe('there')
    expect(reading.says).toContain('/records')
  })

  it('refuses a quote taken inside a page, because a page holds no stored string', async () => {
    const id = await thread()
    const res = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${id}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'These words.',
        context: {
          target: { kind: 'page', route: '/records' },
          span: { quote: 'Everything filed', from: 0, to: 16 },
        },
      },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect((res.json() as { error: string }).error).toContain('holds no stored text')
  })
})
