// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAT MESSAGE A RUN WROTE NAMES THE MODEL THAT WROTE IT, IN THE READER'S LANGUAGE. Problem 2tbFWxiFyjtv.
 *
 * The owner had to ask which model wrote a message they were reading. A message that came out of an agent's run now carries the
 * model id its run's record holds (`ranBy.model`), and the chat's run mark names that model by its name from the one
 * table, src/shared/model-names.ts. The stored id is drawn only in developer mode. A model the table has no name for is
 * said to be one, and a run that recorded no model says so; neither is guessed.
 *
 * WHAT THIS FILE PROVES, with the server's own reply drawn by the chat's own mark, in English and in Chinese:
 *   1. a run on a model the table names: the reply carries the id, and the mark names the model in words, in each
 *      language, with the id only in developer mode;
 *   2. a provider prefix on the id does not stop the model being named;
 *   3. a model the table has no name for is said to be one, and its id is not in the plain view;
 *   4. a run that recorded no model draws the tool alone, and its sentence says the model was not recorded.
 *
 * Everybody and everything here is made up.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

let t: TestDb
let app: FastifyInstance
let mark: typeof import('../src/web/components/ChatRanBy.tsx')
let mode: typeof import('../src/web/lib/mode.ts')
// The page's own language, set the way the first-run guide sets it. The test file's own copy of the word reader is not
// the one the page's modules read, so setting that copy would draw nothing in Chinese.
let pageLanguage: typeof import('../src/web/lib/language.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const WORDS = { en, zh } as const
type Language = keyof typeof WORDS

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`)
}

/** A finished run of Claude Code, on `model` when one is given, and a message that came out of it. */
async function aMessageFromARunOn(model: string | null): Promise<string> {
  const run = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'human', id: THE_PERSON },
    kind: 'session',
    title: `A run on ${model ?? 'no recorded model'}`,
    data: { state: 'finished', runtime: 'claude-code', ...(model === null ? {} : { model }) },
  })
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'message',
      title: 'The answer from the run',
      data: { body: 'This answer came out of a run.', to: [{ kind: 'agent', id: 'kiln-reader' }], fromRun: run.id },
    },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.statusCode, filed.body).toBe(409)
  return String((filed.json() as { record: { id: string } }).record.id)
}

/** The message as the chat reads it, and its run mark drawn from that reply in one language and mode. */
async function theMark(
  id: string,
  inLanguage: Language,
  as: 'normal' | 'inspect',
): Promise<{ ranBy: { run: string; runtime: string; model: string | null }; seen: string; said: string; html: string }> {
  const read = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const ranBy = (read.json() as { message: { ranBy: { run: string; runtime: string; model: string | null } } }).message.ranBy
  expect(ranBy, 'the message names the run it came out of').not.toBeNull()
  pageLanguage.showLanguageBeforeItIsKept(inLanguage)
  mode.setMode(as)
  const html = renderToStaticMarkup(h(mark.RanBy, { ranBy: ranBy as never }))
  const seen = /<span aria-hidden="true">(.*?)<\/span><span class="px-sr">/s.exec(html)
  const said = /aria-label="([^"]*)"/.exec(html)
  expect(seen, `the mark draws its short words:\n${html}`).not.toBeNull()
  expect(said, `the mark carries its sentence:\n${html}`).not.toBeNull()
  return { ranBy, seen: seen![1]!.replace(/<[^>]+>/g, ''), said: said![1]!, html }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  mark = await import('../src/web/components/ChatRanBy.tsx')
  mode = await import('../src/web/lib/mode.ts')
  pageLanguage = await import('../src/web/lib/language.ts')
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', handle: 'kiln-reader', name: 'Morgan Vale', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
}, 90_000)

afterEach(() => {
  pageLanguage?.showLanguageBeforeItIsKept('en')
  mode?.setMode('normal')
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a chat message names the model that wrote it', () => {
  it.each(['en', 'zh'] as const)('names a model the table holds by its name, in %s, with the id only in developer mode', async (inWords) => {
    const id = await aMessageFromARunOn('claude-opus-5-5')
    const plain = await theMark(id, inWords, 'normal')
    expect(plain.ranBy.model, 'the reply carries the model its run recorded').toBe('claude-opus-5-5')
    expect(plain.said).toBe(fill(WORDS[inWords]['chat.ranBy.modelNamed'], { tool: 'Claude Code', model: 'Claude Opus 5.5' }))
    expect(plain.seen).toContain('Claude Opus 5.5')
    expect(plain.html, 'the id is not in the plain view').not.toContain('claude-opus-5-5')
    expect(plain.seen).not.toContain('claude-opus-5-5')
    const developer = await theMark(id, inWords, 'inspect')
    expect(developer.seen, 'developer mode shows the stored id').toContain('claude-opus-5-5')
  })

  it('names a model whose id carries its provider', async () => {
    const id = await aMessageFromARunOn('anthropic/claude-opus-5-5')
    const plain = await theMark(id, 'en', 'normal')
    expect(plain.said).toBe(fill(en['chat.ranBy.modelNamed'], { tool: 'Claude Code', model: 'Claude Opus 5.5' }))
  })

  it.each(['en', 'zh'] as const)('says a model it has no name for is one, in %s, and keeps its id out of the plain view', async (inWords) => {
    const id = await aMessageFromARunOn('kiln-model-9')
    const plain = await theMark(id, inWords, 'normal')
    expect(plain.said).toBe(fill(WORDS[inWords]['chat.ranBy.modelUnnamed'], { tool: 'Claude Code' }))
    expect(plain.seen).toContain(WORDS[inWords]['chat.ranBy.unnamedModel'])
    expect(plain.seen).not.toContain('kiln-model-9')
    expect((await theMark(id, inWords, 'inspect')).seen).toContain('kiln-model-9')
  })

  it.each(['en', 'zh'] as const)('draws the tool alone for a run that recorded no model, in %s, and says so', async (inWords) => {
    const id = await aMessageFromARunOn(null)
    const plain = await theMark(id, inWords, 'normal')
    expect(plain.ranBy.model).toBeNull()
    expect(plain.said).toBe(fill(WORDS[inWords]['chat.ranBy.modelNotRecorded'], { tool: 'Claude Code' }))
    expect(plain.seen).toBe('claude')
  })
})
