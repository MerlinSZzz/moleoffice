// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The discovery endpoints, tested the way the caller who needs them uses them.
 *
 * Every assertion below is written from one failure. An agent was asked to record a project's
 * history through this API and could not find out what to write: GET /api, /api/schema and
 * /api/kinds were all 404 with no alternatives, so it read the source instead — and then wrote
 * `data.blocks` where the code reads `data.summaryBlocks`, got a 201, and only found out by
 * looking at a screenshot of a module page with 700 lines of raw JSON where a chart should be.
 *
 * So these tests do not check that the endpoint returns 200. They check that what comes back
 * over the wire is enough to write a correct record without reading any source:
 *
 *   - the served bytes are parsed from `res.body`, not read off the object, because an example
 *     that cannot survive JSON.stringify is no use to a caller on the other end of a socket;
 *   - every example served is fed back through `validateData`, so the documentation cannot
 *     describe a record the server would refuse;
 *   - the module page's `summaryBlocks` has its own test, by name, because not knowing that key
 *     is the specific thing that destroyed a page.
 *
 * TWO APPS ARE BUILT HERE. The first registers only the discovery plugin and touches no
 * database, which is the point of api/kinds.ts importing nothing that opens one. The second
 * registers every route the real server has, against a throwaway database, so the index and the
 * 404 can be checked against the actual route table rather than a list typed into a test.
 *
 * "EVERY ROUTE THE REAL SERVER HAS" IS NOW MEANT LITERALLY. It used to be five of the nine route
 * groups, retyped here, and this file said so in a comment claiming they were the same ones
 * src/server/index.ts registers. They were not, and that is how eight endpoints reached the
 * product with no description at all. The second app is now `buildApp()` from
 * src/server/index.ts, reached through `apiApp` in tests/helpers.ts, so it IS the server's
 * surface — the not-found handler and the health route come with it rather than being restated.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import {
  ROUTE_NOTES,
  apiIndex,
  discoveryRoutes,
  noSuchEndpoint,
  shapesFor,
  trackApiRoutes,
  type ApiIndex,
  type ApiRoute,
} from '../src/server/api/kinds.ts'
import { KIND_SPECS, SHAPE_SPECS, describeKinds, validateData } from '../src/shared/kinds.ts'
import { HUMAN_ONLY_KINDS, LINK_TYPES, RECORD_KINDS, SUMMARY_BLOCK_TYPES, type LinkType, type RecordKind } from '../src/shared/types.ts'
import { CONSEQUENCE_BEARERS } from '../src/shared/work.ts'

// -------------------------------------------------------------------------------- helpers

/** Parse a response body the way a caller does: from the bytes, not from the handler's object. */
function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 120)}`)
  }
  return parsed as Record<string, unknown>
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected ${what} to be an array, got ${JSON.stringify(value)}`)
  return value
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`expected ${what} to be an object, got ${JSON.stringify(value)}`)
  }
  return value as Record<string, unknown>
}

/** "GET /api/kinds" for every endpoint in an index body. */
function endpointKeys(index: ApiIndex): string[] {
  return index.endpoints.map((e) => `${e.method} ${e.path}`)
}

// ================================================================== the schema, with no database

describe('GET /api/kinds', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    const listRoutes = trackApiRoutes(app)
    await app.register(discoveryRoutes, { prefix: '/api', listRoutes, currentWorkspace: () => ({ current: 'default', stated: false }) })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers at all — the endpoint whose absence sent an agent to read the source', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds' })
    expect(res.statusCode).toBe(200)
  })

  it('describes every kind Mole Office has, with nothing left out', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const kinds = asArray(body.kinds, 'kinds')

    expect(kinds.map((k) => asObject(k, 'kind').kind)).toEqual([...RECORD_KINDS])
    // Served whole, not a picked-over copy: a second selection here is a second place to drift.
    expect(body.kinds).toEqual(JSON.parse(JSON.stringify(describeKinds().kinds)))
  })

  it('says of each kind what it is for and when to write one, in sentences', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    for (const raw of asArray(body.kinds, 'kinds')) {
      const spec = asObject(raw, 'kind spec')
      const name = String(spec.kind)
      // A one-word purpose ("a module") is the documentation equivalent of "invalid input".
      expect(String(spec.purpose).length, `${name}.purpose`).toBeGreaterThan(30)
      expect(String(spec.whenToRecord).length, `${name}.whenToRecord`).toBeGreaterThan(30)
      expect(asArray(spec.fields, `${name}.fields`).length).toBeGreaterThan(0)
    }
  })

  it('gives every field a type, a requiredness and a description of what to write', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    for (const raw of asArray(body.kinds, 'kinds')) {
      const spec = asObject(raw, 'kind spec')
      for (const rawField of asArray(spec.fields, 'fields')) {
        const field = asObject(rawField, 'field')
        const where = `${String(spec.kind)}.${String(field.key)}`
        expect(typeof field.type, `${where}.type`).toBe('string')
        expect(typeof field.required, `${where}.required`).toBe('boolean')
        expect(String(field.description).length, `${where}.description`).toBeGreaterThan(20)
        // `example` may legitimately be false or 0, so its presence is what is checked.
        expect(Object.hasOwn(field, 'example'), `${where} has an example`).toBe(true)
      }
    }
  })

  it('serves an example for every kind that the server would actually accept', async () => {
    // This is the test that makes the endpoint trustworthy. The examples arrive as JSON, so
    // anything the specs hold that does not survive the wire is caught here, and each one is
    // then put through the same checker a POST goes through.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    for (const raw of asArray(body.kinds, 'kinds')) {
      const spec = asObject(raw, 'kind spec')
      const kind = String(spec.kind) as RecordKind
      const result = validateData(kind, spec.example)
      const complaint = result.ok ? '' : result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
      expect(result.ok, `the example served for ${kind} is refused by validateData — ${complaint}`).toBe(true)
    }
  })

  it('names the kinds an agent is not allowed to write, so a 403 can be predicted', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    expect(body.humanOnly).toEqual([...HUMAN_ONLY_KINDS])

    const humanOnlyFlags = asArray(body.kinds, 'kinds')
      .map((k) => asObject(k, 'kind spec'))
      .filter((spec) => spec.humanOnly === true)
      .map((spec) => spec.kind)
    expect(humanOnlyFlags).toEqual([...HUMAN_ONLY_KINDS])
  })

  it('carries the nested shapes, so a field typed ModulePart[] can be filled in', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const names = asArray(body.shapes, 'shapes').map((s) => asObject(s, 'shape').name)
    expect(names).toContain('ModulePart')
    expect(names).toContain('SummaryBlock')
    expect(names).toContain('ChartSpec')
  })

  it('serves the shapes whole, out of the same specification that enforces writes', async () => {
    // The two must not be able to drift: a caller that cannot see the source writes what this
    // endpoint says, and gets a 400 from SHAPE_SPECS if the two ever disagree about a shape.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    expect(body.shapes).toEqual(JSON.parse(JSON.stringify(describeKinds().shapes)))
  })

  it('serves the shapes a record needs to say who is hurt and what it waits on', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const names = asArray(body.shapes, 'shapes').map((s) => asObject(s, 'shape').name)
    for (const name of ['Consequence', 'Pause', 'PauseUntil']) {
      expect(names, `${name} must reach a caller who cannot read the source`).toContain(name)
    }
  })

  it('serves the six consequence bearers, so nobody has to guess one', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const bearer = asArray(body.shapes, 'shapes')
      .map((s) => asObject(s, 'shape'))
      .find((s) => s.name === 'Consequence')
      ?.fields
    const spec = asObject(asArray(bearer, 'Consequence.fields')[0], 'Consequence.bearer')

    // The vocabulary comes over the wire as the declared type, not only as prose: a caller reads
    // `type` to know what values exist, and a wrong one is a 400 they cannot predict otherwise.
    for (const word of CONSEQUENCE_BEARERS) {
      expect(String(spec.type), `the type names "${word}"`).toContain(`'${word}'`)
      expect(String(spec.description), `the description explains "${word}"`).toContain(word)
    }
  })

  it('serves the rules that a nested shape enforces with a function nobody can read', async () => {
    // A rule kept only in code is a rule an agent breaks, is refused for, and cannot diagnose.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const withRules = asArray(body.shapes, 'shapes')
      .map((s) => asObject(s, 'shape'))
      .filter((s) => Array.isArray(s.rules) && s.rules.length > 0)
      .map((s) => String(s.name))

    // Every shape that has a cross-key rule in kinds.ts must be in this list. If one is added
    // there without a sentence, this is what fails.
    const declared = Object.values(SHAPE_SPECS).filter((s) => (s.rules?.length ?? 0) > 0).map((s) => s.name)
    expect(withRules.sort()).toEqual(declared.sort())
    expect(withRules).toContain('PauseUntil')
  })

  it('offers consequence and paused on every kind whose record can need attention', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const byKind = new Map(
      asArray(body.kinds, 'kinds')
        .map((k) => asObject(k, 'kind spec'))
        .map((spec) => [String(spec.kind), asArray(spec.fields, 'fields').map((f) => String(asObject(f, 'field').key))]),
    )
    for (const kind of ['task', 'obligation', 'problem', 'purchase', 'module', 'pipeline', 'claim', 'direction']) {
      expect(byKind.get(kind), `${kind}.consequence`).toContain('consequence')
      expect(byKind.get(kind), `${kind}.paused`).toContain('paused')
    }
  })

  it('says how to file one, because knowing the fields is not knowing the request', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    expect(String(body.writing)).toContain('POST /api/records')
    // The escape hatch has to be named here or an agent with a measurement and no field for it
    // invents a key, is refused, and writes a markdown file instead.
    expect(String(body.writing)).toContain('extra')
  })

  it('says that parts can be drawn beside each other, because a block nobody is told about is never written', async () => {
    // COUNTED IN THE DATABASE, 29 August 2026: 766 records, of which FIVE hold a `beside` block —
    // four throwaway records written by the steps that built the block, and the report written to
    // photograph it. Nothing else in the corpus has ever written one. An agent writing a report
    // reads this page and writes what it names, so the sentence has to name the block and the two
    // preferences a part may state, or the composition layer stays unreachable to the only writers
    // this product has.
    //
    // The names are read out of the shapes rather than typed here, so renaming a shape or one of
    // its fields turns this red rather than leaving a sentence pointing at nothing. What a `share`
    // or a `measure` MEANS is not asserted here and is not said there: it is said once, in these
    // two shapes, and the sentence only points at them.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const writing = String(body.writing)
    const part = SHAPE_SPECS.BesidePart
    const block = SHAPE_SPECS.BesideBlock
    if (part === undefined || block === undefined) {
      throw new Error('BesidePart or BesideBlock is not a declared shape any more, so this test cannot ask its question.')
    }
    const partFields = part.fields.map((f) => f.key)

    expect(writing).toContain(block.name)
    expect(writing).toContain(part.name)
    for (const key of ['share', 'measure']) {
      expect(partFields, `BesidePart.${key}`).toContain(key)
      expect(writing, `writing names ${key}`).toContain(key)
    }
  })
})

// ================================================================== one kind, and the module bug

describe('GET /api/kinds/:kind', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = Fastify()
    const listRoutes = trackApiRoutes(app)
    await app.register(discoveryRoutes, { prefix: '/api', listRoutes, currentWorkspace: () => ({ current: 'default', stated: false }) })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('answers for every kind there is', async () => {
    for (const kind of RECORD_KINDS) {
      const res = await app.inject({ method: 'GET', url: `/api/kinds/${kind}` })
      expect(res.statusCode, `GET /api/kinds/${kind}`).toBe(200)
      expect(asObject(bodyOf(res).kind, 'kind').kind).toBe(kind)
    }
  })

  it('names summaryBlocks on the module — the key whose absence destroyed a module page', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/module' }))
    const spec = asObject(body.kind, 'kind')
    const keys = asArray(spec.fields, 'fields').map((f) => asObject(f, 'field').key)

    expect(keys).toContain('summaryBlocks')
    // `blocks` was the guess that was silently accepted. It must not be a field, and the caller
    // must be told so where they are looking, not in a source comment they cannot see.
    expect(keys).not.toContain('blocks')

    const field = asArray(spec.fields, 'fields')
      .map((f) => asObject(f, 'field'))
      .find((f) => f.key === 'summaryBlocks')
    expect(field, 'module has a summaryBlocks field').toBeDefined()
    expect(String(field?.description)).toContain('blocks')
  })

  it('shows a worked example of summaryBlocks, not just its type', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/module' }))
    const spec = asObject(body.kind, 'kind')

    // In the field's own example, with real block objects in it.
    const field = asArray(spec.fields, 'fields')
      .map((f) => asObject(f, 'field'))
      .find((f) => f.key === 'summaryBlocks')
    const blocks = asArray(field?.example, 'summaryBlocks example')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.map((b) => asObject(b, 'block').type)).toContain('chart')

    // And in the whole-record example, which is the thing a caller copies wholesale.
    const example = asObject(spec.example, 'module example')
    expect(Object.hasOwn(example, 'summaryBlocks'), 'the module example uses summaryBlocks').toBe(true)
    expect(validateData('module', example).ok).toBe(true)
  })

  it('follows the nesting down, so a chart can be written from this one response', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/module' }))
    const names = asArray(body.shapes, 'shapes').map((s) => asObject(s, 'shape').name)

    // SummaryBlock alone would be a dead end: it has no fields of its own, only variants.
    expect(names).toContain('SummaryBlock')
    expect(names).toContain('ChartBlock')
    expect(names).toContain('ChartSpec')
    expect(names).toContain('ChartSeries')
    expect(names).toContain('ChartPoint')
    expect(names).toContain('ModulePart')
    expect(names).toContain('ProgressItem')
  })

  it('lists the variants of a discriminated shape and where the choice is made', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/module' }))
    const summaryBlock = asArray(body.shapes, 'shapes')
      .map((s) => asObject(s, 'shape'))
      .find((s) => s.name === 'SummaryBlock')
    const discriminator = asObject(summaryBlock?.discriminator, 'SummaryBlock.discriminator')

    expect(discriminator.key).toBe('type')
    // Read from the list rather than written out again: the served variants and the list a refusal
    // offers a caller are the same twenty words, and a twenty-first added to one of the two would
    // otherwise be published without being checked, or checked without being published.
    expect(Object.keys(asObject(discriminator.variants, 'variants')).sort()).toEqual(
      [...SUMMARY_BLOCK_TYPES].sort(),
    )
  })

  it('sends a caller asking about a pipeline to the block kind and the two links', async () => {
    // A PIPELINE NO LONGER REACHES DOWN TO A NESTED SHAPE, because it has none: `blockIds` is a
    // list of record ids. So what this has to check is that the caller is told where the rest of a
    // pipeline lives — the block kind, and the two link types that carry what used to be fields.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/pipeline' }))
    const kind = asObject(body.kind, 'kind')
    const blockIds = asArray(kind.fields, 'pipeline fields')
      .map((f) => asObject(f, 'field'))
      .find((f) => f.key === 'blockIds')
    expect(String(blockIds?.description)).toContain('/blocks')
    expect(String(blockIds?.description)).toContain('`blocks` link')

    const block = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/block' }))
    const rules = asArray(asObject(block.kind, 'kind').rules, 'block rules').map(String).join(' ')
    expect(rules).toContain('implements')
    expect(rules).toContain('\u203a')

    // The served example is still a thing a caller can copy wholesale and have accepted.
    const example = asObject(kind.example, 'pipeline example')
    expect(validateData('pipeline', example).ok).toBe(true)
    expect(validateData('block', asObject(asObject(block.kind, 'kind').example, 'block example')).ok).toBe(true)
  })

  it('carries chaptersReadUnreadable on both the Release and the Refusal shape of a session', async () => {
    // The correction to the handback: the field is not on a `check` kind — there is no such
    // record kind, and GET /api/kinds/check is a 404 — it is served under the `session` kind, on the
    // two shapes a check writes. Both declarations have to carry it, or one path loses the record of
    // what the check could not read.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/session' }))
    const shapes = asArray(body.shapes, 'session shapes').map((s) => asObject(s, 'shape'))
    for (const name of ['Release', 'Refusal']) {
      const shape = shapes.find((s) => s.name === name)
      expect(shape, `${name} is served for the session kind`).toBeDefined()
      const keys = asArray(shape?.fields, `${name}.fields`).map((f) => asObject(f, 'field').key)
      expect(keys, `${name} carries chaptersReadUnreadable`).toContain('chaptersReadUnreadable')
    }
  })

  it('follows a task down to Pause and PauseUntil, not one level and stop', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/task' }))
    const names = asArray(body.shapes, 'shapes').map((s) => asObject(s, 'shape').name)
    expect(names).toContain('Consequence')
    expect(names).toContain('Pause')
    // Pause names PauseUntil and nothing else does. Stopping at Pause would hand back a field
    // typed PauseUntil with no description of what may go in it.
    expect(names).toContain('PauseUntil')
  })

  it('does not send shapes a kind has nothing to do with', async () => {
    // A note takes prose. Handing back the chart vocabulary too would bury the two fields that
    // matter under twelve shapes that do not apply.
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/note' }))
    const names = asArray(body.shapes, 'shapes').map((s) => asObject(s, 'shape').name)
    expect(names).not.toContain('ChartSpec')
  })

  it('answers 404 for a name that is not a kind, and says what the kinds are', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds/nosuch' })
    expect(res.statusCode).toBe(404)

    const body = bodyOf(res)
    expect(String(body.error)).toContain('nosuch')
    // The list goes in the body, not only in the sentence: the caller that got the name wrong is
    // exactly the caller with nowhere else to read it.
    expect(body.kinds).toEqual([...RECORD_KINDS])
    for (const kind of RECORD_KINDS) expect(String(body.error)).toContain(kind)
  })

  it('suggests the kind a near miss was meant to be', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds/modul' }))
    expect(String(body.error)).toContain('module')
    expect(String(body.error)).toMatch(/did you mean/i)
  })

  it('never claims a shape it cannot then describe', () => {
    // shapesFor throws if a discriminator names a shape that was never declared. Walking every
    // kind here means that mistake fails the suite rather than one request in a month's time.
    for (const kind of RECORD_KINDS) {
      const shapes = shapesFor(KIND_SPECS[kind])
      for (const shape of shapes) {
        expect(typeof shape.name, `${kind} -> shape name`).toBe('string')
      }
    }
  })
})

// ================================================================== the index and the 404

describe('the endpoint index, built from the real route table', () => {
  let db: TestDb
  let app: FastifyInstance
  let listRoutes: () => readonly ApiRoute[]

  beforeAll(async () => {
    // A throwaway database first: every route module except api/kinds.ts opens one the moment it
    // is imported, and helpers.freshDb points that at a temporary file.
    db = await freshDb()

    // The product's own surface, built by the product. The not-found handler and the health route
    // come with it rather than being written again here.
    const built = await apiApp()
    app = built.app
    listRoutes = built.listApiRoutes
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    db.close()
  })

  it('answers on /api, which used to be a 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api' })
    expect(res.statusCode).toBe(200)
  })

  /**
   * A SEVENTEEN-NAME LIST USED TO BE HERE, AND IT WAS THE DEFECT IT WAS MEANT TO CATCH.
   *
   * It was titled "lists every endpoint this server has, including the ones added last" and it
   * checked seventeen endpoint names by hand. It could not have kept that promise: a subset check
   * is silent about everything it does not name, so the eight `/api/presentation` endpoints that
   * shipped describing themselves as nothing were outside it, and so were `/api/export`,
   * `/api/import`, `/api/attention` and the block routes. It also had to be edited by hand — twice
   * over, once per endpoint — when the layout route group was deleted.
   *
   * What replaced it is one line down: the index is compared against the app's own route table,
   * which is every endpoint rather than seventeen of them. Whether the app HAS every route group
   * is tests/server-wiring.test.ts's question; it compares what `buildApp()` registered against
   * every route group on disk and fails with the group's name.
   */
  it('is built from the router, not from a list — every registered route appears', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    expect(endpointKeys(index).sort()).toEqual(listRoutes().map((r) => `${r.method} ${r.path}`).sort())
    // Both sides come from the same route table, so an app that registered nothing would satisfy
    // the equality above with two empty lists. This is what stops that reading as a pass.
    expect(
      endpointKeys(index).length,
      'GET /api listed no endpoints, so the comparison above compared nothing',
    ).toBeGreaterThan(40)
  })

  it('has a sentence for every endpoint', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const undescribed = index.endpoints.filter((e) => e.description === null).map((e) => `${e.method} ${e.path}`)
    expect(
      undescribed,
      'these endpoints exist and nobody has said what they are for — declare the sentence beside the route as ' +
        "config: { note: '…' }, the way src/server/api/presentation.ts does",
    ).toEqual([])
  })

  it('describes no endpoint that does not exist', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const real = new Set(endpointKeys(index))
    const stale = Object.keys(ROUTE_NOTES).filter((key) => !real.has(key))
    expect(stale, 'ROUTE_NOTES describes endpoints this server does not have').toEqual([])
  })

  it('serves the sentence a route declared beside itself, not only the ones in the map', async () => {
    // The channel that ends the two-file edit. `PUT /api/presentation/:scope/nodes/:target` has no
    // line in ROUTE_NOTES and never will: its sentence is written in api/presentation.ts, in the
    // same statement that declares the endpoint, and arrives here through the route table.
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const node = index.endpoints.find(
      (e) => e.method === 'PUT' && e.path === '/api/presentation/:scope/nodes/:target',
    )
    expect(node?.description, 'the note declared beside the route did not reach GET /api').toContain('step:<step id>')
    expect(Object.keys(ROUTE_NOTES)).not.toContain('PUT /api/presentation/:scope/nodes/:target')
  })

  it('lists /api and /api/ once, not twice', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const keys = endpointKeys(index)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.filter((k) => k === 'GET /api').length).toBe(1)
  })

  it('leaves out HEAD and the CORS preflight, which nobody chooses to send', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    expect(index.endpoints.map((e) => e.method)).not.toContain('HEAD')
    expect(index.endpoints.map((e) => e.method)).not.toContain('OPTIONS')
  })

  it('points a caller who knows nothing at the schema first', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    expect(index.startHere).toContain('/api/kinds')
  })

  it('documents the attribution headers with the defaults the server really applies', async () => {
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex

    // Write a record with no headers at all, then read back who the server said wrote it. If
    // those defaults ever change, this test fails rather than the index quietly lying about them.
    const created = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'note', title: 'who wrote this', data: { body: 'no headers were sent' } },
    })
    expect(created.statusCode, created.body).toBe(201)
    const id = String(asObject(bodyOf(created).record, 'record').id)

    const changes = asArray(bodyOf(await app.inject({ method: 'GET', url: `/api/changes?recordId=${id}` })).changes, 'changes')
    const first = asObject(changes[0], 'change')

    expect(String(index.attribution['x-mole-office-actor-type'])).toContain(String(first.actorType))
    // THE ID DEFAULT IS THE OFFICE'S OWNER, whoever the installer named, so the index says it in those
    // words and no code names a person. The change row must carry exactly that owner's id.
    const { theOfficeOwner } = await import('../src/server/lib/owner.ts')
    expect(String(index.attribution['x-mole-office-actor-id'])).toContain("Absent means the office's owner")
    expect(String(first.actorId)).toBe(theOfficeOwner().id)
  })

  /**
   * THE SECOND OF THE THREE TABLES WAS SERVED BY NO ENDPOINT.
   *
   * `supersedes` appeared nowhere in GET /api and nowhere in GET /api/kinds, which are the two
   * endpoints the README sends a caller to. The only way to learn the eleven words from a running
   * server was to send a wrong one and read the list out of the 400 — four of the seven agents who
   * recorded this pass through the API went looking, and the skill they were given carries a copy
   * of the list that says, in it, that nothing keeps the copy correct.
   *
   * This test lives in the app-with-a-database half of the file because of its last assertion:
   * which type may carry a gate is enforced in src/server/lib/records.ts, and importing that opens
   * a database.
   */
  it('serves the link vocabulary, which only a refusal used to answer', async () => {
    const body = bodyOf(await app.inject({ method: 'GET', url: '/api/kinds' }))
    const served = asArray(body.linkTypes, 'linkTypes')

    // Every type, in the contract's order. Compared against LINK_TYPES rather than a list typed
    // here, so a twelfth type is served or this fails; a list here would be the copy again.
    expect(served.map((raw) => asObject(raw, 'link type').type)).toEqual(Object.keys(LINK_TYPES))

    for (const raw of served) {
      const spec = asObject(raw, 'link type')
      const declared = LINK_TYPES[String(spec.type) as LinkType]
      // Both readings of the ONE stored row: how it reads on the record it starts from, and how
      // the same row reads from the other end. Without the reverse a caller cannot tell what its
      // link will look like on the record it is not holding.
      expect(spec.forward, `${String(spec.type)}.forward`).toBe(declared.forward)
      expect(spec.reverse, `${String(spec.type)}.reverse`).toBe(declared.reverse)
      expect(spec.symmetric, `${String(spec.type)}.symmetric`).toBe(declared.symmetric)
    }

    // WHICH ONE MAY CARRY A GATE, pinned to the constant the write path really refuses on.
    // api/kinds.ts writes that fact a second time because it must not import the server library
    // that holds it. This is what stops the two drifting apart in silence.
    const { GATED_LINK_TYPE } = await import('../src/server/lib/records.ts')
    const gated = served
      .map((raw) => asObject(raw, 'link type'))
      .filter((spec) => spec.mayCarryGate === true)
      .map((spec) => spec.type)
    expect(gated).toEqual([GATED_LINK_TYPE])
  })

  /**
   * "EVERY ROW CARRIES `reason`" WAS TRUE OF TWO GROUPS OUT OF FIVE.
   *
   * Measured on the live workspace: 7 of 7 rows in `visible` carried one and 0 of the 159 rows in
   * `unclassified` and `noState` did. An agent wrote code against the promise, got nothing back,
   * and went looking for the bug in its own code — in the one document the README tells a caller
   * to trust instead of the source.
   *
   * The check is against the reply, not against a retyped idea of it: a sentence that names
   * `reason` as a key is a promise about rows, and it may not name a group whose rows have none.
   */
  it('promises `reason` only of the attention rows that carry one', async () => {
    // Enough overdue promises to overflow the visible list, so `remainder` and `remainderByGroup`
    // both have rows and the claim is checked against something. Twelve is more than any row cap
    // this rule has had; the count is not read from the rule, so a changed cap cannot make this
    // test pass by making it vacuous — the assertions below fail instead.
    for (let n = 0; n < 12; n += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/records',
        payload: {
          kind: 'obligation',
          title: `owed to the ESA review, part ${n}`,
          data: { due: '2020-03-01', owedTo: 'the ESA grant review', state: 'open' },
        },
      })
      expect(res.statusCode, res.body).toBe(201)
    }
    // And a kind with no state field at all, which is the other shape of question.
    await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: { kind: 'note', title: 'a note has no state to read', data: { body: 'nothing to classify' } },
    })

    // THE WHOLE ANSWER IS ASKED FOR BY NAME: the door's default is now the narrow reading, and this
    // case reads `reason` off the rows to tell the groups that carry one from the groups that do not.
    const reply = bodyOf(await app.inject({ method: 'GET', url: '/api/attention?shape=full' }))

    // Group by group, out of the reply itself: the arrays of rows it really served, and whether
    // those rows carry `reason`. An empty group is left out — it can say nothing either way.
    const groups = Object.entries(reply).map(([name, value]): [string, unknown] => [name,
      typeof value === 'object' && value !== null && !Array.isArray(value) && 'rows' in value
        ? (value as { rows: unknown }).rows : value,
    ]).filter(
      (entry): entry is [string, Record<string, unknown>[]] =>
        Array.isArray(entry[1]) &&
        entry[1].length > 0 &&
        entry[1].every((row) => typeof row === 'object' && row !== null && !Array.isArray(row)),
    )
    const has = (rows: Record<string, unknown>[], yes: boolean) =>
      rows.every((row) => Object.prototype.hasOwnProperty.call(row, 'reason') === yes)
    const carries = groups.filter(([, rows]) => has(rows, true)).map(([name]) => name)
    const carriesNone = groups.filter(([, rows]) => has(rows, false)).map(([name]) => name)

    expect(carries, 'the selected rows').toContain('visible')
    expect(carries, 'the selected rows').toContain('remainder')
    expect(carriesNone.length, 'the fixture served no rows without a reason, so nothing is checked')
      .toBeGreaterThan(0)

    // The claim, as GET /api serves it to the caller who reads it.
    const index = bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const note =
      index.endpoints.find((e) => `${e.method} ${e.path}` === 'GET /api/attention')?.description ?? ''
    const promises = note.split(/(?<=\.)\s+/).filter((sentence) => sentence.includes('`reason`'))
    expect(promises.length, 'nothing published says which attention rows carry a `reason`').toBeGreaterThan(0)

    const overpromised: string[] = []
    for (const sentence of promises) {
      const named = [...sentence.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map(([, name]) => String(name))
      // A promise has to say WHOSE rows it is about. "Every row carries `reason`" named no scope,
      // which is how it came to cover 159 rows that have never had one.
      expect(
        named.some((name) => carries.includes(name)),
        `"${sentence.trim()}" promises \`reason\` without naming the rows that carry it`,
      ).toBe(true)
      for (const name of named) if (carriesNone.includes(name)) overpromised.push(`${name} in "${sentence.trim()}"`)
    }
    expect(
      overpromised,
      'a published sentence promises `reason` of a group whose rows carry none. Either the prose is ' +
        'stale — that is what this test was written for — or that group has grown a reason, in which ' +
        'case the rule changed and this is the news.',
    ).toEqual([])
  })
})

describe('an /api path that matches nothing', () => {
  const routes: ApiRoute[] = [
    { method: 'GET', path: '/api', operation: 'project.index', reach: 'remote' },
    { method: 'GET', path: '/api/kinds', operation: 'project.schema', reach: 'remote' },
    { method: 'GET', path: '/api/kinds/:kind', operation: 'project.schema', reach: 'remote' },
    { method: 'GET', path: '/api/records', operation: 'record.list', reach: 'remote' },
    { method: 'POST', path: '/api/records', operation: 'record.write', reach: 'remote' },
  ]

  it('still says what was wrong, and keeps the sentence about GET /api', () => {
    const body = noSuchEndpoint('GET', '/api/schema', routes)
    expect(body.error).toContain('No such endpoint')
    expect(body.error).toContain('/api/schema')
    expect(body.error).toContain('GET /api')
  })

  it('hands back the families, not all 370 door names', () => {
    // The middle level that was decided on: a lost caller gets the families and
    // how to open one, because the whole catalogue is what it could not afford to read.
    const body = noSuchEndpoint('GET', '/api/schema', routes)
    expect(body.endpoints).toBeUndefined()
    expect(body.families?.map((family) => family.name)).toEqual(['api', 'kinds', 'records'])
    expect(body.families?.find((family) => family.name === 'records')?.doors).toBe(2)
    expect(body.opening).toContain('/api/families/')
  })

  it('names one family\'s doors when the unknown path\'s first segment is a family', () => {
    // The caller was close, so the answer is the doors it was looking for rather than the list of
    // families it already found.
    const body = noSuchEndpoint('GET', '/api/records/one/two/three', routes)
    expect(body.families).toBeUndefined()
    expect(body.endpoints).toEqual(['GET /api/records', 'POST /api/records'])
    expect(body.error).toContain('records')
  })

  it('suggests the path a near miss was meant to be', () => {
    const body = noSuchEndpoint('GET', '/api/record', routes)
    expect(body.error).toContain('/api/records')
  })

  it('ignores the query string when looking for a near miss', () => {
    // /api/recordz?kind=module is a wrong path, not a wrong filter. Comparing the whole string
    // would find nothing close and offer no way out.
    const body = noSuchEndpoint('GET', '/api/recordz?kind=module', routes)
    expect(body.error).toContain('/api/records')
  })

  it('offers nothing when nothing is close, rather than a confident wrong guess', () => {
    const body = noSuchEndpoint('GET', '/api/completely-different-thing', routes)
    expect(body.error).not.toMatch(/did you mean/i)
  })
})

describe('apiIndex', () => {
  it('still lists an endpoint nobody has described, rather than hiding it', () => {
    // The operation and the reach are on every registered route and neither is read here, so
    // they are filled in with a real name rather than left out.
    const index = apiIndex(
      [{ method: 'GET', path: '/api/brand-new', operation: 'project.index', reach: 'remote' }],
      { current: 'default', stated: false },
    )
    expect(index.endpoints).toEqual([{ method: 'GET', path: '/api/brand-new', description: null }])
  })

  it('keeps the endpoints in the order the route table gave them', () => {
    const index = apiIndex(
      [
        { method: 'GET', path: '/api', operation: 'project.index', reach: 'remote' },
        { method: 'GET', path: '/api/kinds', operation: 'project.schema', reach: 'remote' },
      ],
      { current: 'default', stated: false },
    )
    expect(index.endpoints.map((e) => e.path)).toEqual(['/api', '/api/kinds'])
  })
})
