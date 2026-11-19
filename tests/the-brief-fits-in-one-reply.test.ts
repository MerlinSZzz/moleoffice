// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BRIEF FITS IN ONE REPLY ON AN OFFICE OF THE LIVE SIZE, AND EVERY PART OF A MODULE IS ONE REQUEST AWAY.
 *
 * Round 47 of wave 13q. On 11 October 2026 the live brief was cut at the
 * 60,000 characters a reply is cut at: its modules part alone was 43 KB, the context and summary of
 * 54 modules. What fell past the cut was the brief's size, its opening and the owner's words.
 *
 * `LIVE_MODULES` is the live office's 54 modules as lengths only: the title, the context and the
 * summary in characters, the state, and how many summary blocks and parts each has. The text is made
 * up here to those lengths. No row is copied from any office.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** The cut on a reply: past this many characters an agent's tool shows nothing. */
const THE_CUT = 60_000

/** [title, context, summary or null, state or null, summary blocks, parts], in the live order. */
const LIVE_MODULES: readonly (readonly [number, number, number | null, string | null, number, number])[] = [
  [36, 548, 397, 'active', 0, 8], [80, 544, 344, 'active', 0, 4], [86, 386, 292, 'active', 0, 4],
  [40, 699, 184, 'active', 0, 4], [36, 683, 175, 'active', 0, 4], [37, 725, 215, 'active', 0, 5],
  [49, 689, 152, 'active', 0, 4], [53, 743, 173, 'active', 0, 5], [39, 680, 173, 'active', 0, 5],
  [52, 713, 173, 'active', 0, 5], [55, 368, 224, 'active', 0, 4], [69, 245, null, 'active', 5, 0],
  [78, 1367, null, 'active', 7, 0], [28, 147, 93, 'active', 7, 1], [22, 162, 120, 'stable', 4, 4],
  [16, 222, 81, 'active', 5, 3], [14, 91, 42, 'stable', 4, 3], [13, 91, 61, 'stable', 4, 2],
  [69, 289, null, 'active', 5, 0], [64, 258, null, 'active', 8, 0], [60, 261, null, 'active', 6, 0],
  [68, 282, null, 'active', 8, 0], [92, 299, null, 'active', 14, 0], [73, 243, null, 'active', 4, 0],
  [72, 308, null, 'active', 3, 0], [58, 258, null, 'active', 5, 0], [24, 434, null, 'active', 0, 0],
  [32, 665, null, null, 0, 0], [24, 532, null, null, 0, 0], [41, 394, null, null, 0, 0],
  [30, 358, null, null, 0, 0], [36, 367, null, null, 0, 0], [27, 391, null, null, 0, 0],
  [18, 297, null, null, 0, 0], [31, 338, null, null, 0, 0], [20, 402, null, null, 0, 0],
  [29, 331, null, null, 0, 0], [19, 65, null, 'active', 0, 0], [46, 339, null, null, 3, 1],
  [58, 834, null, null, 0, 1], [39, 811, null, null, 0, 1], [44, 955, null, null, 0, 3],
  [45, 736, null, null, 0, 1], [54, 715, null, null, 0, 1], [39, 798, null, null, 0, 1],
  [44, 767, null, null, 0, 1], [68, 770, null, null, 0, 1], [52, 827, null, null, 0, 1],
  [67, 936, null, null, 0, 1], [46, 925, null, null, 0, 0], [52, 752, null, null, 0, 1],
  [30, 799, null, null, 0, 0], [43, 884, null, null, 0, 0], [34, 848, null, null, 0, 0],
]

/** The live office's ten newest decisions, as the bytes each took in the brief. */
const LIVE_DECISION_BYTES = [1076, 715, 1674, 661, 306, 962, 677, 1045, 814, 988]

/** Made-up words of exactly `length` characters, in sentences, numbered so no two are the same. */
function madeUp(length: number, n: number): string {
  const sentence = `Made up for this test, number ${String(n)}: the tray clamp holds the part while the camera looks. `
  return sentence.repeat(Math.ceil(length / sentence.length) + 1).slice(0, length)
}

let t: TestDb
let app: FastifyInstance
let AS_THE_OWNER: Record<string, string>
const made: { id: string; context: string; summary: string | null; blocks: number }[] = []

async function ask(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<{ status: number; body: string }> {
  const reply = await app.inject({ method, url, headers: AS_THE_OWNER, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: reply.statusCode, body: reply.body }
}

async function post(payload: unknown): Promise<string> {
  const reply = await ask('POST', '/api/records', payload)
  expect(reply.status, reply.body.slice(0, 300)).toBe(201)
  return String((JSON.parse(reply.body) as { record: { id: string } }).record.id)
}

/** Each top-level part of the brief, in bytes, largest first, for a failure message. */
function byPart(wire: string): string {
  const brief = JSON.parse(wire) as Record<string, unknown>
  return Object.entries(brief)
    .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value), 'utf8')] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([key, bytes]) => `${key} ${String(bytes)}`)
    .join(', ')
}

beforeAll(async () => {
  t = await freshDb()
  const http = await import('../src/server/lib/http.ts')
  AS_THE_OWNER = {
    'content-type': 'application/json',
    [http.WORKSPACE_HEADER]: 'default',
    [http.ACTOR_HEADERS.type]: 'human',
    [http.ACTOR_HEADERS.id]: THE_PERSON,
  }
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const [n, [title, context, summary, state, blocks, parts]] of LIVE_MODULES.entries()) {
    const data = {
      context: madeUp(context, n),
      ...(summary === null ? {} : { summary: madeUp(summary, n) }),
      ...(state === null ? {} : { state }),
      ...(blocks === 0 ? {} : { summaryBlocks: Array.from({ length: blocks }, (_, b) => ({ id: `b${String(b)}`, type: 'text', text: madeUp(120, n) })) }),
      parts: Array.from({ length: parts }, (_, p) => ({ id: `p${String(p)}`, name: `Part ${String(p)}`, items: [] })),
    }
    const id = await post({ kind: 'module', title: madeUp(title, n), data })
    made.push({ id, context: data.context, summary: summary === null ? null : data.summary!, blocks })
  }
  for (const [n, bytes] of LIVE_DECISION_BYTES.entries()) {
    await post({ kind: 'decision', title: madeUp(90, n), data: { option_taken: madeUp(Math.max(50, bytes - 300), n), replaces: [] } })
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the brief on an office of the live size', () => {
  it('fits in one reply with room to spare, and carries its size, its opening and the owner\'s words', async () => {
    const reply = await ask('GET', '/api/brief')
    expect(reply.status).toBe(200)
    // WELL UNDER THE CUT: within the brief's own budget of 48,000 characters, so the parts this
    // made-up office does not hold (an agent's group news, its notebook) still have 12,000 to spare.
    expect(reply.body.length, `the brief is ${String(reply.body.length)} characters. By part: ${byPart(reply.body)}`).toBeLessThan(48_000)
    expect(reply.body.length).toBeLessThan(THE_CUT)
    const brief = JSON.parse(reply.body) as Record<string, unknown>
    for (const key of ['size', 'head', 'hisWords', 'leftOut']) expect(brief, `the brief has no ${key}`).toHaveProperty(key)
  })

  it('carries every module by its name, state and line, and every other field is one request away', async () => {
    const brief = JSON.parse((await ask('GET', '/api/brief')).body) as {
      modules: { id: string; title: string; state: string | null; line: string | null; lineFrom: string | null }[]
      modulesSecondLevel: { ask: { oneModule: string; everyModule: string } }
    }
    expect(brief.modules.map((one) => one.id).sort()).toEqual(made.map((one) => one.id).sort())
    for (const one of made) {
      const carried = brief.modules.find((module) => module.id === one.id)!
      // THE LINE IS THE SUMMARY'S FIRST SENTENCE, never a piece of the context.
      if (one.summary !== null) {
        expect(carried.lineFrom).toBe('summary')
        expect(one.summary.startsWith(carried.line!)).toBe(true)
      } else {
        // NOTHING CURATED IS A NULL LINE, and the context is not borrowed to fill it.
        expect(carried.lineFrom).toBe(one.blocks === 0 ? null : 'summaryBlocks')
        if (one.blocks === 0) expect(carried.line).toBeNull()
      }
      // ONE REQUEST AWAY, by the very words the brief gives.
      const whole = await ask('GET', brief.modulesSecondLevel.ask.oneModule.replace(/^GET /, '').replace('<the module id>', one.id))
      expect(whole.status).toBe(200)
      const data = (JSON.parse(whole.body) as { record: { data: { context: string; summary?: string } } }).record.data
      expect(data.context).toBe(one.context)
      expect(data.summary ?? null).toBe(one.summary)
    }
    // EVERY MODULE, A PAGE AT A TIME, by the words the brief gives.
    const pages: string[] = []
    for (let offset = 0; offset < made.length; offset += 25) {
      const url = brief.modulesSecondLevel.ask.everyModule.replace(/^GET /, '').replace(/, then .*$/, '') + `&offset=${String(offset)}`
      const page = await ask('GET', url)
      expect(page.status, page.body.slice(0, 300)).toBe(200)
      expect(page.body.length).toBeLessThan(THE_CUT)
      pages.push(...(JSON.parse(page.body) as { records: { id: string }[] }).records.map((record) => record.id))
    }
    expect(pages.sort()).toEqual(made.map((one) => one.id).sort())
  })
})
