// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The four defects an audit found in Mole Office's SURFACE — what the API says about itself, and what
 * the module page says a module is made of.
 *
 * Every test below is written from one sentence the auditor wrote, and each one fails on the code
 * as it was found rather than on a hypothetical:
 *
 *   1. "KNOWN_MODULE_KEYS lists only context, summary, parts, paths, summaryBlocks — it omits
 *      claims, source and extra, all three documented at GET /api/kinds/module." So a module that
 *      used a documented field had it filed under a panel headed NOT PART OF A MODULE. The test
 *      here walks KIND_SPECS rather than a second list of field names, because a second
 *      hand-maintained list is what caused the defect: retyping the keys in the test would leave
 *      exactly the same hole one layer up.
 *   2. "Twelve endpoints in GET /api have description: null" — including the rebuild endpoint an
 *      agent had to guess the body of. The test builds an app with EVERY plugin src/server/index.ts
 *      registers, which is the thing tests/kinds-api.test.ts's own version of this check cannot
 *      do: it builds the stored-layer plugins only, so it was right about what it could see and
 *      blind to nine endpoints.
 *   3. "GET /api/source has no documented query parameters; ?path= and ?moduleId= were both
 *      refused as unrecognised keys." Now ?path= is a filter, and the refusal for anything else
 *      names what is accepted.
 *   4. "the committed vite config hardcodes 8787" — so the proxy and the server could not be
 *      moved together. Both ends now read one declaration, `src/config/settings.mjs`, and the test
 *      asks the config what it would proxy to rather than repeating either number.
 *
 * WHY THE SOURCE TESTS RUN AGAINST A THROWAWAY TREE. The one property a path filter has to have
 * is that "src/web" does not answer for "src/webhooks.ts", and this repository has no such near
 * miss to catch it out with. A temporary tree can have one. The filter's rule is also pinned
 * directly against `filesMatching` in lib/sourceindex.ts, which resolves a module's claims: one
 * repository must not have two meanings for "under src/web".
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { type ApiIndex, type ApiRoute } from '../src/server/api/kinds.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { filesMatching } from '../src/shared/paths.ts'
import type { SourceFile } from '../src/shared/types.ts'

type SourceIndexLib = typeof import('../src/server/lib/sourceindex.ts')
type ModuleViewModule = typeof import('../src/web/components/ModuleView.tsx')

let db: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]
let idx: SourceIndexLib
let mv: ModuleViewModule
/** The throwaway repository the path filter is exercised against. */
let root: string

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 160)}`)
  }
  return parsed as Record<string, unknown>
}

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url })
  return { status: res.statusCode, body: bodyOf(res) }
}

function filesOf(body: Record<string, unknown>): SourceFile[] {
  if (!Array.isArray(body.files)) throw new Error(`no files in ${JSON.stringify(body).slice(0, 200)}`)
  return body.files as SourceFile[]
}

const pathsOf = (body: Record<string, unknown>): string[] => filesOf(body).map((f) => f.path).sort()

/** The markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence. */
function markup(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const noSave = async () => {
  throw new Error('this test never saves')
}

/**
 * DRAWN IN DEVELOPER MODE, where a module's claimed source, its `extra` and its undeclared keys are
 * drawn (plan 7FEOshq3mBGG, G2c). The mode goes back to normal afterwards.
 */
async function inDeveloperMode(draw: () => string): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('inspect')
  try {
    return draw()
  } finally {
    setMode('normal')
  }
}

beforeAll(async () => {
  // ModuleView reaches src/web/api.ts, which reads window.localStorage the moment it is imported.
  // The smallest stand-in that lets the module load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }

  db = await freshDb()
  idx = await import('../src/server/lib/sourceindex.ts')
  mv = await import('../src/web/components/ModuleView.tsx')

  // THE PRODUCT'S OWN SURFACE, not a list retyped here.
  //
  // This used to register the eight plugins its author knew about, under a comment claiming to be
  // "EVERY registration src/server/index.ts makes". By 2026-08-10 that claim was false four times
  // over -- presentation, export and import had been added and layout had been deleted -- so the
  // test below that promises no endpoint answers with a null description was blind to the fourteen
  // endpoints most likely to have one, which is the exact defect it was written for.
  //
  // `apiApp()` calls `buildApp()` from src/server/index.ts, which is the single description of
  // what Mole Office serves and does not listen on anything.
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()

  // A repository with the near miss this project's own tree does not contain: src/web and
  // src/webhooks.ts, which a substring filter would confuse and a segment filter cannot.
  root = mkdtempSync(join(tmpdir(), 'mole-office-surface-'))
  mkdirSync(join(root, 'src/web/pages'), { recursive: true })
  mkdirSync(join(root, 'src/server/api'), { recursive: true })
  writeFileSync(join(root, 'src/web/App.tsx'), 'export const App = () => null\n')
  writeFileSync(join(root, 'src/web/pages/HomePage.tsx'), 'export const HomePage = () => null\n')
  writeFileSync(join(root, 'src/webhooks.ts'), 'export const hook = 1\n')
  writeFileSync(join(root, 'src/server/api/source.ts'), 'export const routes = 1\n')
  idx.rebuildIndex({ workspaceId: 'default', root })
})

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(root, { recursive: true, force: true })
})

// ================================================================= 2. every endpoint is described

describe('GET /api describes every endpoint this server has', () => {
  async function index(): Promise<ApiIndex> {
    return bodyOf(await app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
  }

  it('lists the sessions, resources and source endpoints, which is where the twelve nulls were', async () => {
    const listed = (await index()).endpoints.map((e) => `${e.method} ${e.path}`)
    for (const expected of [
      'GET /api/sessions',
      'GET /api/sessions/:id',
      'POST /api/sessions/discover',
      'POST /api/sessions/:id/link',
      'POST /api/resources',
      'GET /api/resources',
      'GET /api/resources/orphans',
      'GET /api/resources/scan',
      'POST /api/resources/:id/release',
      'GET /api/source',
      'GET /api/source/coverage',
      'POST /api/source/reindex',
    ]) {
      expect(listed, `${expected} is missing from GET /api`).toContain(expected)
    }
  })

  it('has a real sentence for every registered route — none is null', async () => {
    const undescribed = (await index()).endpoints
      .filter((e) => e.description === null)
      .map((e) => `${e.method} ${e.path}`)
    expect(
      undescribed,
      'these endpoints exist and nobody has said what they are for — add a line to ROUTE_NOTES or ' +
        'DERIVED_ROUTE_NOTES in src/server/api/kinds.ts',
    ).toEqual([])
  })







  it('is built from the router, so a route added later cannot slip past this file', async () => {
    const listed = (await index()).endpoints.map((e) => `${e.method} ${e.path}`).sort()
    expect(listed).toEqual(listRoutes().map((r) => `${r.method} ${r.path}`).sort())
  })
})

// ============================================= 1. the module page knows every documented field

describe('the module page understands every field the schema documents', () => {
  /** The keys GET /api/kinds/module publishes. Read, never retyped — see the header. */
  const documented = KIND_SPECS.module.fields.map((field) => field.key)

  it('has the fields the audit found missing, so this test is testing something', () => {
    // If `source` or `extra` ever leaves the schema this assertion goes first, and the loop below
    // stops silently proving nothing. `claims` WAS on this list and left the schema in window B; the
    // case below keeps the page's half of that fact, which the loop can no longer reach.
    expect(documented).toEqual(expect.arrayContaining(['source', 'extra']))
    expect(documented).not.toContain('claims')
  })

  it('still draws `claims` in its own right, though no kind declares it any more', () => {
    // A CORPUS RESTORED FROM A BACKUP TAKEN BEFORE WINDOW B STILL HOLDS THE KEY, and this page still
    // reads it into its own panel. What must not happen is it being drawn twice — once as claims and
    // once again as a key nobody declared.
    const parsed = mv.parseModule({ context: 'c', parts: [], claims: ['src/web/lib/attention.ts'] })
    expect(parsed.claims).toEqual(['src/web/lib/attention.ts'])
    expect(parsed.extras).toEqual([])
  })

  it.each(KIND_SPECS.module.fields.map((f) => [f.key, f.example] as const))(
    'does not file `%s` under "not part of a module"',
    (key, example) => {
      const parsed = mv.parseModule({ [key]: example })
      expect(
        parsed.extras.map(([k]) => k),
        `data.${key} is documented at GET /api/kinds/module and this view does not know it`,
      ).toEqual([])
      expect(parsed.problems, `data.${key}'s own documented example was read as broken`).toEqual([])
    },
  )

  it('draws the whole documented example with no "other stored fields" panel at all', () => {
    const data = { ...KIND_SPECS.module.example, source: 'design/explore.md, section 4', extra: { rig: 'bench jig 2' } }
    // Every key of it is declared, so the panel that exists for undeclared keys must not appear.
    expect(documented).toEqual(expect.arrayContaining(Object.keys(data)))

    const html = markup(
      h(mv.ModuleView, { title: 'The documented module example', summary: null, data, relations: [], editable: true, onSave: noSave }),
    )
    expect(html).not.toContain('not part of a module')
    expect(html).not.toContain('Other stored fields')
  })

  it('puts each of the three on the page in its own right, rather than merely not complaining', async () => {
    const html = await inDeveloperMode(() => markup(
      h(mv.ModuleView, {
        title: 'A module with a claim and a source',
        summary: null,
        relations: [],
        data: {
          context: 'why it exists',
          parts: [],
          claims: ['src/web/components/PanelGrid.tsx'],
          source: 'design/explore.md, section 4',
          extra: { rig: 'bench jig 2' },
        },
        editable: true,
        onSave: noSave,
      }),
    ))
    expect(html).toContain('src/web/components/PanelGrid.tsx')
    expect(html).toContain('design/explore.md, section 4')
    expect(html).toContain('bench jig 2')
    // The claims panel says what a claim IS, because `claims` and `paths` are the pair that gets
    // confused and the page is where somebody looks it up.
    expect(html).toContain('Claimed source')
  })

  it('still keeps a key nobody declared, which is the behaviour that must not be lost', async () => {
    const parsed = mv.parseModule({ context: 'c', owner_initials: 'JC' })
    expect(parsed.extras).toEqual([['owner_initials', 'JC']])

    const html = await inDeveloperMode(() => markup(
      h(mv.ModuleView, {
        title: 'A module with an undeclared key',
        summary: null,
        data: { context: 'c', owner_initials: 'JC' },
        relations: [],
        editable: true,
        onSave: noSave,
      }),
    ))
    expect(html).toContain('not one of a module’s own fields')
    expect(html).toContain('owner_initials')
  })

  it('says so when one of the three is the wrong shape, instead of dropping it', () => {
    const parsed = mv.parseModule({ claims: 'src/web', source: 7, extra: ['a'] })
    expect(parsed.problems).toHaveLength(3)
    expect(parsed.problems.join(' ')).toContain('`claims`')
    expect(parsed.problems.join(' ')).toContain('`source`')
    expect(parsed.problems.join(' ')).toContain('`extra`')
    // And it is not quietly moved to the undeclared-keys panel on the way past.
    expect(parsed.extras).toEqual([])
  })

  it('names a single claim that is not text and keeps the ones that are', () => {
    const parsed = mv.parseModule({ claims: ['src/web', 42, 'tests'] })
    expect(parsed.claims).toEqual(['src/web', 'tests'])
    expect(parsed.problems.join(' ')).toContain('Claim 2')
  })

  it('shows a module with no claims as an answer rather than as a blank', async () => {
    const html = await inDeveloperMode(() => markup(
      h(mv.ModuleView, {
        title: 'A module with no claims',
        summary: null,
        data: { context: 'c', parts: [] },
        relations: [],
        editable: true,
        onSave: noSave,
      }),
    ))
    expect(html).toContain('Claimed source')
    // WHAT THIS TEST USED TO REQUIRE, AND WHY THAT REQUIREMENT IS GONE.
    //
    // The line here was `expect(html).toContain('claims no code')`, which held the page to drawing
    // "This module claims no code in the Mole Office repository" whenever `data.claims` was empty.
    //
    // Window B emptied `data.claims` on every module in the owner's corpus and moved 152 claims into
    // `implementation_map`. So that sentence became a statement about a field that no longer holds
    // anything, made without reading the table the claims are now in — and module cegP4HnIk9nd,
    // which has a row, had its page say it claims no code. To a reader that is indistinguishable
    // from the migration having lost their work.
    //
    // The assertion is removed rather than reworded, because a wording is not what was wrong: the
    // page was asserting a fact it had not checked. What replaces it is a test that the panel reads
    // the implementation map, and it lands in the commit after this one — this commit changes the
    // criterion and does not claim to meet it.
    //
    // What stays is the half that was always right: the panel is drawn even when there is nothing in
    // it, because "this module claims nothing" is a real answer for a hardware module and an absence
    // is only informative if the panel is there to say it.
  })
})

// ================================================ 3. GET /api/source has query parameters, said

describe('GET /api/source narrows by path prefix', () => {
  it('answers with the whole index and no filter when nothing is asked for', async () => {
    const { status, body } = await get('/api/source')
    expect(status).toBe(200)
    expect(pathsOf(body)).toEqual([
      'src/server/api/source.ts',
      'src/web/App.tsx',
      'src/web/pages/HomePage.tsx',
      'src/webhooks.ts',
    ])
    // Absent, not `null` and not an empty object: the answer was not narrowed, so it makes no
    // claim about having been.
    expect(body.filter).toBeUndefined()
  })

  it('matches whole path segments — src/web is not src/webhooks.ts', async () => {
    const { status, body } = await get('/api/source?path=src/web')
    expect(status).toBe(200)
    expect(pathsOf(body)).toEqual(['src/web/App.tsx', 'src/web/pages/HomePage.tsx'])
  })

  it('means the same thing as a module claim of the same prefix', async () => {
    // One repository, one meaning for "under src/web". If these two ever diverge, a coverage
    // answer and a file listing disagree about the same directory and neither looks wrong.
    const all = (await get('/api/source')).body
    const everyPath = filesOf(all).map((f) => f.path)
    for (const prefix of ['src/web', 'src/webhooks.ts', 'src/server/api', 'src', 'src/nothing']) {
      const viaRoute = pathsOf((await get(`/api/source?path=${encodeURIComponent(prefix)}`)).body)
      const viaClaims = [...filesMatching(prefix, everyPath)].sort()
      expect(viaRoute, `?path=${prefix} disagrees with the claim matcher`).toEqual(viaClaims)
    }
  })

  it('takes one file exactly as readily as a directory', async () => {
    const { body } = await get('/api/source?path=src/webhooks.ts')
    expect(pathsOf(body)).toEqual(['src/webhooks.ts'])
  })

  it('reads a trailing slash and a leading ./ as the same prefix', async () => {
    for (const spelling of ['src/web/', './src/web', 'src/web//']) {
      const { body } = await get(`/api/source?path=${encodeURIComponent(spelling)}`)
      expect(pathsOf(body), spelling).toEqual(['src/web/App.tsx', 'src/web/pages/HomePage.tsx'])
    }
  })

  it('says what it narrowed, because the stamp still counts the whole index', async () => {
    const { body } = await get('/api/source?path=src/web')
    const filter = body.filter as { path: string; matched: number; of: number; note: string }
    expect(filter.path).toBe('src/web')
    expect(filter.matched).toBe(2)
    expect(filter.of).toBe(4)
    expect(filter.note).toContain('src/web')
    expect(filter.note).toContain('whole path segments')
  })

  it('says an empty answer is an empty answer, not an empty repository', async () => {
    const { status, body } = await get('/api/source?path=src/nothing')
    expect(status).toBe(200)
    expect(filesOf(body)).toEqual([])
    const filter = body.filter as { matched: number; note: string }
    expect(filter.matched).toBe(0)
    expect(filter.note).toContain('not because there is no code there')
  })

  it('narrows a module\'s files without inventing a stale claim', async () => {
    const module = db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'Web front end, for the filter test',
      data: {
        context: 'The browser app: panels, pages and the layout the user drags into place.',
        parts: [],
      },
      actor: db.api.HUMAN,
    })
    // THE CLAIMS ARE STATED ROWS OF THE IMPLEMENTATION MAP, in the project's one repository,
    // because that is what coverage reads (`claimsOf` in src/server/lib/sourceindex.ts). The door
    // counts each row against the stored scan of the repository it names (decision 0KSoGUNDF9ml),
    // so the repository is rooted at the scratch tree and its own scan is stored.
    const map = await import('../src/server/lib/implementation.ts')
    const repos = await import('../src/server/lib/repositories.ts')
    const repositoryId = repos.registerRepository({ workspaceId: 'default', name: 'fixture', root, actor: db.api.HUMAN }).id
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: db.api.HUMAN })
    for (const pattern of ['src/web/**', 'src/server/api']) {
      map.declareRelationship({ workspaceId: 'default', recordId: module.id, repositoryId, pattern, actor: db.api.HUMAN })
    }

    const wide = await get(`/api/source?module=${module.id}`)
    expect(pathsOf(wide.body)).toEqual([
      'src/server/api/source.ts',
      'src/web/App.tsx',
      'src/web/pages/HomePage.tsx',
    ])
    expect(wide.body.staleClaims).toEqual([])

    const narrow = await get(`/api/source?module=${module.id}&path=src/web/pages`)
    expect(pathsOf(narrow.body)).toEqual(['src/web/pages/HomePage.tsx'])
    // THE POINT OF THIS TEST. `src/server/api` still matches a file; it is simply not in the
    // slice that was asked for. Resolving claims against the filtered list would have reported it
    // as stale, and somebody would have gone looking for a file that never moved.
    expect(narrow.body.staleClaims).toEqual([])
    // In pattern order, which is the order the map hands a module's rows back in.
    expect((narrow.body.claims as { pattern: string; matched: string[] }[]).map((c) => c.pattern)).toEqual([
      'src/server/api',
      'src/web/**',
    ])
  })
})

describe('an unrecognised query parameter says what would have worked', () => {
  it('still refuses ?moduleId=, and now names the two parameters that exist', async () => {
    const { status, body } = await get('/api/source?moduleId=abc')
    expect(status).toBe(400)
    const error = String(body.error)
    expect(error).toContain('moduleId')
    expect(error).toContain('module')
    expect(error).toContain('path')
    // The near miss is offered, the same way a wrong /api path is offered the right one.
    expect(error).toContain('Did you mean "module"')
  })

  it('refuses an absolute path rather than answering with nothing', async () => {
    const { status, body } = await get(`/api/source?path=${THE_TEST_FIXTURE_ROOT}/panelx/src/web`)
    expect(status).toBe(400)
    expect(String(body.error)).toContain('relative')
  })

  it('refuses a glob, which would otherwise look like an empty directory', async () => {
    const { status, body } = await get('/api/source?path=src/**')
    expect(status).toBe(400)
    expect(String(body.error)).toContain('implementation map')
  })

  it('refuses an empty path rather than reading it as "everything"', async () => {
    const { status, body } = await get('/api/source?path=')
    expect(status).toBe(400)
    expect(String(body.error)).toContain('must not be empty')
  })
})

// ========================================================== 4. the proxy port is configuration

/**
 * The vite config is a function of the environment, so it is called rather than read.
 *
 * `defineConfig` hands back what it was given, which means the default export IS the factory and
 * a test can ask it what it would produce for a given environment — no Vite process, no port
 * bound, and no chance of the assertion drifting from what `npm run dev` really does.
 */
describe('the dev server tells the page wherever the API actually is', () => {
  interface Viteish {
    server?: { port?: number; proxy?: Record<string, string> }
    plugins?: unknown
  }

  async function configFor(env: Record<string, string | undefined>): Promise<Viteish> {
    const saved: Record<string, string | undefined> = {}
    for (const key of Object.keys(env)) {
      saved[key] = process.env[key]
      const value = env[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      const mod = await import('../vite.config.ts')
      const factory = mod.default
      if (typeof factory !== 'function') {
        throw new Error('vite.config.ts no longer exports a config function; this test cannot ask it anything')
      }
      return (await factory({ command: 'serve', mode: 'development' })) as Viteish
    } finally {
      for (const [key, was] of Object.entries(saved)) {
        if (was === undefined) delete process.env[key]
        else process.env[key] = was
      }
    }
  }

  /**
   * THE PORT THE CONFIG TELLS A PAGE THE API IS ON, read out of the module it serves it in.
   *
   * This used to read `server.proxy['/api/']`, because Vite proxied every `/api/` call the page made
   * to loopback. That proxy is gone: it made a browser on another machine look like a caller on
   * this one, which is problem `MqQjiJIdjK4a`. The page now calls the API's own door, at the host it
   * was served from and the port `virtual:mole-office-api` carries, so this asks the plugin that
   * writes that module what it would write.
   *
   * The rule under test has not changed: one declaration moves both halves of `npm run dev`, and a
   * config that ignored MOLE_OFFICE_PORT would send the page somewhere else.
   */
  const theApiPortTheConfigTellsThePage = (config: Viteish): number => {
    const plugins = (Array.isArray(config.plugins) ? config.plugins : []).flat(3) as {
      name?: string
      resolveId?: (id: string) => string | null
      load?: (id: string) => string | null
    }[]
    const plugin = plugins.find((one) => one.name === 'mole-office:serve-the-api-address')
    if (plugin?.resolveId === undefined || plugin.load === undefined) {
      throw new Error('the config no longer tells the page where the API is')
    }
    const id = plugin.resolveId('virtual:mole-office-api')
    if (id === null) throw new Error('the plugin did not resolve its own module')
    const code = plugin.load(id)
    const said = /apiPortInDevelopment = (\d+)/.exec(code ?? '')
    if (said === null) throw new Error(`the module it serves names no port: ${String(code)}`)
    return Number(said[1])
  }

  it('tells the page the port MOLE_OFFICE_PORT names', async () => {
    // 8788 rather than a far-away number on purpose: one digit from the old hardcoded value, so a
    // config that ignored the variable would still be caught.
    expect(theApiPortTheConfigTellsThePage(await configFor({ MOLE_OFFICE_PORT: '8788' }))).toBe(8788)
    expect(theApiPortTheConfigTellsThePage(await configFor({ MOLE_OFFICE_PORT: '9411' }))).toBe(9411)
  })

  it('moves the dev server itself with MOLE_OFFICE_WEB_PORT', async () => {
    expect((await configFor({ MOLE_OFFICE_WEB_PORT: '5199' })).server?.port).toBe(5199)
  })

  /**
   * THE TWO HALVES OF `npm run dev` READ ONE DECLARATION, AND THE PROXY IS ASKED TO PROVE IT.
   *
   * WHAT THIS REPLACES. A case named *falls back to 8787 and 5173 when the environment says
   * nothing* asserted `portsFrom({})` equals `{apiPort: 8787, webPort: 5173}` — the two numbers
   * retyped in this file, which made this test a second place the defaults were written down.
   * GROUND criterion G1 landed on 3 September 2026 and put both of them in one declaration,
   * `src/config/settings.mjs`, which the server, this Vite config, the tools and the test helpers
   * all read. `src/server/index.ts` used to carry its own `?? '8787'` and this config another.
   *
   * WHY THE DEFAULT IS ASKED OF `portsFrom` AND NOT OF THE FACTORY. `configFor` can SET a variable
   * and have the factory honour it, because the real environment is laid over `.env` last. It
   * cannot UNSET one: the factory reads `.env` off the disk as well, and deleting a key from
   * `process.env` does not reach a file. So the old assertion was really saying "the machine running
   * this suite has no .env", and never said so. That was true in the detached worktree the gate uses
   * and false in a checkout whose `.env` names a MOLE_OFFICE_PORT: there it failed, expecting the
   * default port and getting the one `.env` named, against code that was correct.
   *
   * WHAT IS NOT CHECKED HERE. That no second copy of either number exists anywhere in the tree is a
   * source-wide question and `tests/one-configuration-source.test.ts` asks it. Asking it twice is
   * the defect this whole change is about.
   */
  it('gives the proxy the port the server reads, for a set environment and for an empty one', async () => {
    const { portsFrom } = await import('../vite.config.ts')
    const { portFrom, settingNamed } = await import('../src/config/settings.mjs')

    // THE SAME NUMBER AT BOTH ENDS. `portFrom` is the function src/server/index.ts binds with, so a
    // config that worked its port out any other way would proxy where the server is not, and every
    // page would answer nothing while both processes looked healthy.
    for (const env of [{}, { MOLE_OFFICE_PORT: '9411' }, { MOLE_OFFICE_PORT: '8788', MOLE_OFFICE_WEB_PORT: '5199' }]) {
      const where = JSON.stringify(env)
      expect(portsFrom(env).apiPort, `the proxy and the server disagree for ${where}`).toBe(
        portFrom(env, 'MOLE_OFFICE_PORT'),
      )
      expect(portsFrom(env).webPort, `the dev server port is worked out twice for ${where}`).toBe(
        portFrom(env, 'MOLE_OFFICE_WEB_PORT'),
      )
    }

    // AND NOBODY HAS TO SET ANYTHING. The number is read from the declaration rather than typed
    // here, so this file is not a second place either default is written down.
    expect(portsFrom({}).apiPort).toBe(Number(settingNamed('MOLE_OFFICE_PORT').fallback))
    expect(portsFrom({}).webPort).toBe(Number(settingNamed('MOLE_OFFICE_WEB_PORT').fallback))
    expect(Number.isInteger(portsFrom({}).apiPort)).toBe(true)
  })

  /**
   * The defect in troubleshooting.md that has no other test: a proxy key without a trailing slash.
   *
   * Vite matches proxy keys BY PREFIX. The key `/api` therefore also matches the browser app's own
   * module at `/api.ts`, which gets forwarded to Fastify, which has no such route — so the app
   * never loads and the page is blank, with nothing in either terminal, while the production build
   * works perfectly. It cost an afternoon once and it is one character to reintroduce.
   *
   * `proxyTarget` above would notice the key being RENAMED, because it looks `/api/` up by name.
   * It would not notice a second key being added beside it, which is the likelier way back in.
   */
  /**
   * AND IT PROXIES NOTHING AT ALL, WHICH IS WHAT THE CASE ABOVE REPLACED.
   *
   * This used to require the one proxy key to end in a slash, because Vite matches proxy keys by
   * prefix and a bare `/api` also matches the app's own module at `/api.ts`, which then went to
   * Fastify and 404d — a blank page. There is no proxy now, and the reason it went is problem
   * `MqQjiJIdjK4a`: a browser on another machine reached the API through it and arrived looking like
   * a caller on this one. A proxy put back would restore that quietly, because the page would go on
   * working, so its absence is asserted rather than assumed.
   */
  it('proxies nothing, because a proxy is what made a browser on another machine look local', async () => {
    const proxy = (await configFor({})).server?.proxy
    expect(proxy, 'the /api/ proxy is back; see src/web/lib/api-address.ts for what it hid').toBeUndefined()
  })

  it('refuses a value that is not a port rather than falling back to the default', async () => {
    // A silent fallback here starts Vite, proxies to 8787, and turns a typo into a page of failed
    // API calls that looks exactly like a server nobody started.
    for (const bad of ['nine thousand', '0', '70000', '80.80']) {
      await expect(configFor({ MOLE_OFFICE_PORT: bad }), bad).rejects.toThrow('MOLE_OFFICE_PORT')
    }
    await expect(configFor({ MOLE_OFFICE_WEB_PORT: 'later' })).rejects.toThrow('MOLE_OFFICE_WEB_PORT')
  })
})
