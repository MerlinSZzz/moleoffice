// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUESTION ABOUT A RECORD, AND THE ANSWER TO IT, ARE FINDABLE FROM THAT RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P63 of `design/permissions/ACCEPTANCE.md`: *The asking and the answer are records.*
 * When a brief or a person's words can be read two ways, the agent asks up its chain and does not
 * choose, and somebody meeting the record later can see that it was read two ways once and how it
 * was settled.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT P55 ALREADY DOES, AND WHAT THIS FILE ADDS
 * ---------------------------------------------------------------------------------------
 *
 * The P55 path (`confirmed_by`, `src/shared/confirming.ts`) records WHO relayed a question and
 * WHEN — the path. It does not require that the ambiguity itself, and its resolution, are findable
 * afterwards from the thing they were about. This file proves the smallest honest way to make that
 * true, reusing what exists: the question and the answer are ordinary `message` records, each
 * linked to the record whose words were unclear with an `about` link, and the record's own read
 * (`GET /api/records/:id`) already returns its links. No new record kind is invented; the message
 * and the link carry it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the `links` key from the question's create in `aQuestion()` below → the ambiguous
 *   record's own read no longer lists the question, and the first case goes red. The answer's link
 *   is filed separately, so the mutation is proved to be about the question's link.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** One record as the ordinary read returns it. */
interface ReadBack {
  record: { data: Record<string, unknown> }
  links: { type: string; isBacklink: boolean; other: { id: string; kind: string; title: string } }[]
}

/** A registered agent, with the runtime P88 asks every registration to declare. */
async function register(headers: Record<string, string>, handle: string, name: string, role?: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...WORKSPACE, ...headers },
    payload: { handle, name, ...(role === undefined ? {} : { role }), runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** File a record over HTTP, as somebody. Returns the new id. */
async function file(who: Record<string, string>, body: Record<string, unknown>, expected = 201): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...WORKSPACE, ...who, 'content-type': 'application/json' },
    payload: body,
  })
  expect(reply.statusCode, reply.body).toBe(expected)
  return (reply.json() as { record: { id: string } }).record.id
}

/** One record as the ordinary read returns it. */
async function read(id: string): Promise<ReadBack> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: WORKSPACE })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as ReadBack
}

/** A record whose words can be read two ways. Returns its id. */
async function aBrief(): Promise<string> {
  return file(PERSON, {
    kind: 'problem',
    title: 'the arm holds short of the stop',
    data: { symptom: 'on some runs the arm stops short of the stop and nobody has said whether that is the fault' },
  })
}

/**
 * The question the worker asked its starter about that record, as a message linked to it.
 *
 * THE LINK IS THE FEATURE UNDER TEST, and the mutation above drops it.
 *
 * NOTHING HOLDS THE STARTER IN THIS TEST OFFICE, so the office stores the message, routes it and answers 409 rather
 * than 201. The message and its link are stored all the same.
 */
async function aQuestion(ambiguousId: string): Promise<string> {
  return file(asAgent('builder-pa'), {
    kind: 'message',
    title: 'Two readings of "the arm holds short of the stop"',
    data: {
      body:
        'I read the brief two ways and the readings lead to different work. (1) The stop is the hard limit and ' +
        'the short hold is a fault. (2) The stop is advisory and the short hold is the intended clearance. ' +
        'Which did you mean?',
      to: [{ kind: 'agent', id: 'sup-one' }],
    },
    links: [{ type: 'about', toId: ambiguousId }],
  }, 409)
}

/**
 * The starter's answer, a message that names the question it answers and links the same record.
 *
 * NOTHING HOLDS THE WORKER IN THIS TEST OFFICE EITHER, so this send answers 409 too, and is stored all the same.
 */
async function anAnswer(ambiguousId: string, questionId: string): Promise<string> {
  return file(asAgent('sup-one'), {
    kind: 'message',
    title: 'Re: Two readings of "the arm holds short of the stop"',
    data: {
      body: 'The stop is the hard limit. A short hold is a fault: report it and do not adjust the clearance.',
      to: [{ kind: 'agent', id: 'builder-pa' }],
      inReplyTo: questionId,
    },
    links: [{ type: 'about', toId: ambiguousId }],
  }, 409)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(PERSON, 'sup-one', 'Supervisor One', 'supervisor')
  await register(asAgent('sup-one'), 'builder-pa', 'Builder PA', 'worker')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a question and its answer are findable from the record they are about', () => {
  it('shows both on the record, under the link type that says a message is about it', async () => {
    const brief = await aBrief()
    const question = await aQuestion(brief)
    const answer = await anAnswer(brief, question)

    const said = await read(brief)
    const about = said.links.filter((one) => one.type === 'about')
    const reached = about.map((one) => one.other.id)
    expect(reached, 'the record does not list the question that was asked about it').toContain(question)
    expect(reached, 'the record does not list the answer that settled it').toContain(answer)
    expect(about.every((one) => one.other.kind === 'message')).toBe(true)
  })

  it('keeps the two readings in the question, and the answer names the question it answers', async () => {
    const brief = await aBrief()
    const question = await aQuestion(brief)
    const answer = await anAnswer(brief, question)

    const asked = await read(question)
    expect(String(asked.record.data['body'])).toContain('(1)')
    expect(String(asked.record.data['body'])).toContain('(2)')

    const settled = await read(answer)
    expect(settled.record.data['inReplyTo']).toBe(question)
  })
})
