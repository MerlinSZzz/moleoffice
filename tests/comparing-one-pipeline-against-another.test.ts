// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PIPELINE AGAINST ANOTHER: WHAT IS IN ONE AND NOT IN THE OTHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Step 58 §9 pressed the evolution panel and found there was no way to put two pipelines side by
 * side. That is CAF-10's first clause. This file holds the projection, the route and the drawing
 * for it, and every assertion here is about what a person can do or what is drawn — never about
 * what is stored.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE FACT THAT DECIDES THE WHOLE DESIGN
 * ---------------------------------------------------------------------------------------
 *
 * A block belongs to exactly one pipeline. `kinds.ts` refuses a block id that another pipeline
 * already lists, so two pipelines share NO block record ids at all. Matching by id would report
 * that every step of each pipeline is missing from the other, which is true and tells a reader
 * nothing. So the two sides are matched on the step's own name inside its pipeline, and the answer
 * says so: `matchedOn` names the rule and `sharedRecordIds` is a measured number beside it. The
 * first test below is the one that would go red if anybody ever changed that to a guess.
 *
 * Every pipeline and block here is written through the ordinary write path, so what the projection
 * reads is what the product writes.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { compositionAgainst, type Composition, type CompositionAgainst } from '../src/shared/composition.ts'

let t: TestDb
let app: FastifyInstance

// The drawing reaches api.ts, which reads window.localStorage the moment it is imported to find
// out which project this browser is looking at. This is the smallest stand-in that lets the module
// load; nothing here is under test, and the panel itself is rendered with data handed to it.
beforeAll(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  }
})

const AGENT = { type: 'agent', id: 'claude-code' } as const
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-against',
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * A pipeline with the named steps in the named order, built the way the product builds one.
 *
 * The block titles come out as `<pipeline title> › <step name>`, which is what makes the step name
 * recoverable exactly rather than by a guess at a separator.
 */
async function aPipeline(title: string, steps: readonly string[]): Promise<string> {
  const { createRecord } = await import('../src/server/lib/records.ts')
  const { addBlock } = await import('../src/server/lib/blocks.ts')
  const pipeline = createRecord({
    kind: 'pipeline',
    title,
    summary: `${title}, written by a test`,
    data: { blockIds: [] },
    workspaceId: 'default',
    actor: AGENT,
  })
  for (const name of steps) addBlock(pipeline.id, { name, state: 'todo' }, AGENT)
  return pipeline.id
}

/** The two compositions the projection compares, read back through the route that serves them. */
async function twoSides(leftId: string, rightId: string): Promise<{ left: Composition; right: Composition }> {
  const read = async (id: string): Promise<Composition> => {
    const res = await app.inject({ method: 'GET', url: `/api/composition/${id}`, headers: AS_AGENT })
    expect(res.statusCode).toBe(200)
    return (JSON.parse(res.body) as { at: Composition }).at
  }
  return { left: await read(leftId), right: await read(rightId) }
}

// ============================================================ the projection

describe('what is in one pipeline and not the other', () => {
  it('pairs the two sides on the step name, and says that is what it did', async () => {
    const left = await aPipeline('Fiducial route', ['Read the camera', 'Find the marker', 'Plan the grasp'])
    const right = await aPipeline('Point cloud route', ['Read the camera', 'Segment the cloud', 'Plan the grasp'])
    const sides = await twoSides(left, right)
    const against = compositionAgainst(sides.left, sides.right)

    expect(against.matchedOn).toBe('stepName')
    // THE NUMBER, NOT A CLAIM. A block belongs to one pipeline, so this is zero, and it is measured
    // on every answer rather than written into a sentence somebody could leave behind.
    expect(against.sharedRecordIds).toBe(0)
    expect(against.counts).toEqual({ inBoth: 2, onlyLeft: 1, onlyRight: 1 })

    const marker = one(
      against.rows.filter((row) => row.name === 'Find the marker'),
      'the row for the step only the left has',
    )
    expect(marker.left?.name).toBe('Find the marker')
    expect(marker.right).toBeNull()

    const cloud = one(
      against.rows.filter((row) => row.name === 'Segment the cloud'),
      'the row for the step only the right has',
    )
    expect(cloud.left).toBeNull()
    expect(cloud.right?.name).toBe('Segment the cloud')

    const camera = one(against.rows.filter((row) => row.name === 'Read the camera'), 'the shared first step')
    expect(camera.left?.recordId).not.toBe(camera.right?.recordId)
    expect(camera.left?.position).toBe(0)
    expect(camera.right?.position).toBe(0)
  })

  it('reads the step name off the pipeline it is in, so a step named like a title is not mis-cut', async () => {
    // The stored title is `Route › Undistort › rectify`, so the separator appears twice. Cutting at
    // the LAST one would call this step `rectify` and pair it with the wrong thing.
    const left = await aPipeline('Route', ['Undistort › rectify'])
    const right = await aPipeline('Other route', ['rectify'])
    const sides = await twoSides(left, right)
    const against = compositionAgainst(sides.left, sides.right)
    expect(against.rows.map((row) => row.name)).toEqual(['Undistort › rectify', 'rectify'])
    expect(against.counts).toEqual({ inBoth: 0, onlyLeft: 1, onlyRight: 1 })
  })

  it('keeps the order of the left, then adds what only the right has, in the right order', async () => {
    const left = await aPipeline('First route', ['One', 'Two', 'Three'])
    const right = await aPipeline('Second route', ['Three', 'Four', 'Five'])
    const sides = await twoSides(left, right)
    const against = compositionAgainst(sides.left, sides.right)
    expect(against.rows.map((row) => row.name)).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
  })

  it('names a step that appears twice on one side rather than pairing one of them', async () => {
    const left = await aPipeline('Retried route', ['Settle', 'Check'])
    const right = await aPipeline('Plain route', ['Settle'])
    const sides = await twoSides(left, right)
    // Two members of the left carry the same step name. Nothing stored says which of them the
    // right's `Settle` is, so neither is paired and the ambiguity is reported by name.
    const doubled: Composition = {
      ...sides.left,
      members: [...sides.left.members, { ...sides.left.members[0]!, recordId: 'a-second-one', position: 2 }],
    }
    const against = compositionAgainst(doubled, sides.right)
    expect(against.ambiguous).toEqual([{ name: 'Settle', left: 2, right: 1 }])
    const settle = against.rows.filter((row) => row.name === 'Settle')
    expect(settle).toHaveLength(3)
    expect(settle.every((row) => row.left === null || row.right === null)).toBe(true)
  })
})

// ============================================================ the route a person's browser calls

describe('the route that answers one pipeline against another', () => {
  it('answers with both titles and the rows', async () => {
    const left = await aPipeline('Fiducial route', ['Read the camera', 'Find the marker'])
    const right = await aPipeline('Point cloud route', ['Read the camera'])
    const res = await app.inject({
      method: 'GET',
      url: `/api/composition/${left}/against?other=${right}`,
      headers: AS_AGENT,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as {
      left: { id: string; title: string }
      right: { id: string; title: string }
      against: CompositionAgainst
    }
    expect(body.left.title).toBe('Fiducial route')
    expect(body.right.title).toBe('Point cloud route')
    expect(body.against.counts).toEqual({ inBoth: 1, onlyLeft: 1, onlyRight: 0 })
  })

  it('refuses to compare a pipeline with a record that is not one, and names the kind', async () => {
    const left = await aPipeline('Fiducial route', ['Read the camera'])
    const { createRecord } = await import('../src/server/lib/records.ts')
    const note = createRecord({
      kind: 'note',
      title: 'not a pipeline',
      data: { body: 'x' },
      workspaceId: 'default',
      actor: AGENT,
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/composition/${left}/against?other=${note.id}`,
      headers: AS_AGENT,
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('note')
  })

  it('refuses to compare a pipeline with itself rather than drawing an empty difference', async () => {
    const left = await aPipeline('Fiducial route', ['Read the camera'])
    const res = await app.inject({
      method: 'GET',
      url: `/api/composition/${left}/against?other=${left}`,
      headers: AS_AGENT,
    })
    expect(res.statusCode).toBe(400)
  })
})

// ============================================================ what is drawn

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The text a reader sees, with the tags taken out, so an assertion is about words on a screen. */
function words(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('the drawing puts the two side by side', () => {
  it('draws both names, every step of each, and a gap where one has nothing', async () => {
    const { PipelinesAgainst } = await import('../src/web/components/graph/Against.tsx')
    const leftId = await aPipeline('Fiducial route', ['Read the camera', 'Find the marker'])
    const rightId = await aPipeline('Point cloud route', ['Read the camera', 'Segment the cloud'])
    const sides = await twoSides(leftId, rightId)
    const against = compositionAgainst(sides.left, sides.right)
    const drawn = h(PipelinesAgainst, {
      left: { id: leftId, title: 'Fiducial route', origin: 'authored' },
      right: { id: rightId, title: 'Point cloud route', origin: 'authored' },
      against,
      carrierNames: {},
      workspaceId: 'default',
    })

    const markup = body(drawn)
    const text = words(drawn)

    // Both pipelines are named, so a reader never has to remember which side is which.
    expect(text).toContain('Fiducial route')
    expect(text).toContain('Point cloud route')

    // Every step of both is drawn. Nothing is summarised away.
    for (const step of ['Read the camera', 'Find the marker', 'Segment the cloud']) expect(text).toContain(step)

    // THE GAP IS DRAWN, which is the whole point: the row for a step only one side has carries a
    // cell marked as having nothing in it, rather than the row simply being absent.
    expect(markup).toMatch(/data-px-against-row="Find the marker"[^>]*>[\s\S]*?data-px-against-gap="right"/)
    expect(markup).toMatch(/data-px-against-row="Segment the cloud"[^>]*>[\s\S]*?data-px-against-gap="left"/)
    // And a step both have carries no gap on either side.
    const shared = /data-px-against-row="Read the camera"([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? ''
    expect(shared).not.toContain('data-px-against-gap')

    // The counts are drawn as numerals beside the names, so "one more than the other" is readable.
    expect(markup).toContain('data-px-against-counts="1-1-1"')
  })

  it('says what it matched on, and shows the number of shared records rather than claiming one', async () => {
    const { PipelinesAgainst } = await import('../src/web/components/graph/Against.tsx')
    const leftId = await aPipeline('Fiducial route', ['Read the camera'])
    const rightId = await aPipeline('Point cloud route', ['Read the camera'])
    const sides = await twoSides(leftId, rightId)
    const drawn = h(PipelinesAgainst, {
      left: { id: leftId, title: 'Fiducial route', origin: 'authored' },
      right: { id: rightId, title: 'Point cloud route', origin: 'authored' },
      against: compositionAgainst(sides.left, sides.right),
      carrierNames: {},
      workspaceId: 'default',
    })
    const markup = body(drawn)
    expect(markup).toContain('data-px-against-matched="stepName"')
    expect(markup).toContain('data-px-against-shared="0"')
  })

  it('marks a made-up example on every row that names one, on both sides', async () => {
    const { PipelinesAgainst } = await import('../src/web/components/graph/Against.tsx')
    const leftId = await aPipeline('Fiducial route', ['Read the camera'])
    const rightId = await aPipeline('Point cloud route', ['Read the camera'])
    const sides = await twoSides(leftId, rightId)
    const against = compositionAgainst(sides.left, sides.right)
    const madeUp: CompositionAgainst = {
      ...against,
      rows: against.rows.map((row) => ({
        ...row,
        left: row.left === null ? null : { ...row.left, origin: 'fixture' },
        right: row.right === null ? null : { ...row.right, origin: 'fixture' },
      })),
    }
    const drawn = h(PipelinesAgainst, {
      left: { id: leftId, title: 'Fiducial route', origin: 'fixture' },
      right: { id: rightId, title: 'Point cloud route', origin: 'fixture' },
      against: madeUp,
      carrierNames: {},
      workspaceId: 'default',
    })
    // Step 44's acceptance line, handed forward: made-up content drawn without its mark is made-up
    // content reading as observed history. Two rows name a record, so the mark appears twice in
    // them, plus once on each of the two column heads.
    const marks = body(drawn).match(/Made-up example/g) ?? []
    expect(marks.length).toBeGreaterThanOrEqual(4)
  })
})
