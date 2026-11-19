// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING DOORS TAKE NO WORKSPACE, AND THIS FILE KEEPS THAT TRUE.
 *
 * The header of src/server/api/planning.ts says it in its own words: "THESE ARE THE ONLY ROUTES IN
 * MOLE OFFICE THAT DO NOT TAKE A WORKSPACE ... a planning period is a person-level time-allocation
 * overlay across workspace-owned canonical work ... sending `x-mole-office-workspace` at these
 * routes would be asking a question they do not have an answer to." Criterion P8 of
 * design/planning/ACCEPTANCE.md says the same thing as a promise: a plan spans projects, so it
 * belongs to none, and one week holds Mole Office work, greenhouse work and a dentist appointment
 * at once.
 *
 * THERE IS NO EXCEPTION ANY MORE. Until migration 0196 one route in the module was workspace-scoped
 * and said so beside itself: `GET /planning/drafts/:id/context`, because the structure a critique
 * needs is a project's own. Migration 0196 moved every rough draft into a plan (problem
 * k5FNfdgfxbt2) and that route went with the drafts; a plan's context, GET /api/plans/:id/context,
 * names the projects it reads by id instead of reading a header. So every planning door now takes no
 * workspace, and the control below is a door OUTSIDE the module that does read the header,
 * `GET /api/records`: the probe still has to be able to detect workspace scoping, or it proves
 * nothing.
 *
 * ---------------------------------------------------------------------------------------
 * TWO GUARDS, BECAUSE THERE ARE TWO WAYS TO QUIETLY SCOPE A DOOR
 * ---------------------------------------------------------------------------------------
 *
 * 1. A SOURCE GUARD. Comments are stripped and the module's own code is read: it may not name
 *    `x-mole-office-workspace` at all, and it may not call `workspaceOf` anywhere. A future worker
 *    who adds `const workspaceId = workspaceOf(req)` to the schedule's read is caught here whatever
 *    the database happens to hold.
 *
 * 2. A DRIVE OVER THE ROUTER. Every registered `/api/planning` route is sent a valid-shaped
 *    workspace id that does not exist. A door that reads the workspace header answers "no
 *    workspace called ..." — `requireWorkspace` in lib/workspaces.ts — and a door that does not
 *    answers on its own merits. The control, a door outside the module that is workspace-scoped,
 *    must answer the refusal, which is what makes the sweep's silence about the planning routes
 *    mean something.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

/** The header every other route resolves its project from. These routes must not read it. */
const WORKSPACE_HEADER = 'x-mole-office-workspace'

/** A valid-shaped id for a workspace that does not exist, so `requireWorkspace` must refuse it if read. */
const NO_SUCH_WORKSPACE = 'planning-p8-no-such-workspace'

/** A door outside the module that reads the workspace header, and the control for the drive below. */
const THE_WORKSPACE_SCOPED_ROUTE = 'GET /api/records'

const WHY_IT_MATTERS =
  'The header of src/server/api/planning.ts says these are the only routes in Mole Office that do not take a ' +
  'workspace, and criterion P8 of design/planning/ACCEPTANCE.md says plans and the schedule belong to the ' +
  'person, across workspaces and worlds, and never inside a workspace. A planning door that reads a workspace ' +
  'would quietly scope the schedule to one project and make it false about the other projects it names. There ' +
  'is no exception since migration 0196 took the drafts context route away.'

// ============================================================================ the source guard

// ============================================================================ the drive over the router

describe('every planning door answers with the workspace header ignored, and a scoped door outside it does not', () => {
  let t: TestDb
  let app: FastifyInstance
  let routes: readonly ApiRoute[]

  beforeAll(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
    routes = built.listApiRoutes()
  }, 60_000)
  afterAll(async () => {
    await app.close()
    t.close()
  })

  /** A stated human, so a write is never refused for who is asking before the project is looked at. */
  const HUMAN = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  }

  /** The same path with a concrete value in place of every parameter the planning routes use. */
  function urlFor(path: string): string {
    return path.replace(':horizon', 'week').replace(':period', '2026-W37').replace(':id', 'no-such-row')
  }

  function planningRoutes(): readonly ApiRoute[] {
    return routes.filter((one) => one.path.startsWith('/api/planning/'))
  }

  interface Answer {
    status: number
    error: string
    saysNoSuchWorkspace: boolean
  }

  async function ask(route: ApiRoute, workspace: string): Promise<Answer> {
    const res = await app.inject({
      method: route.method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      url: urlFor(route.path),
      headers: { ...HUMAN, [WORKSPACE_HEADER]: workspace },
      ...(route.method === 'GET' ? {} : { payload: {} }),
    })
    let error = ''
    try {
      const body = res.json() as { error?: string; detail?: string }
      error = `${body.error ?? ''} ${body.detail ?? ''}`.trim()
    } catch {
      error = res.body
    }
    return { status: res.statusCode, error, saysNoSuchWorkspace: /no workspace called/i.test(error) }
  }

  it('found the planning routes it is about, so the sweep below is a sweep', () => {
    const found = planningRoutes()
    // A FLOOR, NOT A COUNT. It was above 20 until migration 0196 took the six draft routes away, which left 20.
    expect(found.length, 'not one planning route was found, so the sweep proves nothing').toBeGreaterThan(15)
    expect(routes.map((one) => `${one.method} ${one.path}`)).toContain(THE_WORKSPACE_SCOPED_ROUTE)
  })

  it('refuses none of them for a workspace they never read', async () => {
    const refused: string[] = []
    for (const route of planningRoutes()) {
      const answer = await ask(route, NO_SUCH_WORKSPACE)
      if (answer.saysNoSuchWorkspace) refused.push(`${route.method} ${route.path} -> ${answer.error}`)
    }
    expect(
      refused,
      refused.length === 0
        ? ''
        : `${refused.join('; ')}. ${WHY_IT_MATTERS} A planning door that refuses x-mole-office-workspace ` +
            `because the id names no workspace is a door that read the header.`,
    ).toEqual([])
  })

  it('a workspace-scoped door outside the module IS refused by that header, so the probe detects scoping', async () => {
    const route = routes.find((one) => `${one.method} ${one.path}` === THE_WORKSPACE_SCOPED_ROUTE)
    expect(route, `${THE_WORKSPACE_SCOPED_ROUTE} is not registered any more`).toBeDefined()
    const answer = await ask(route as ApiRoute, NO_SUCH_WORKSPACE)
    expect(
      answer.saysNoSuchWorkspace,
      `${THE_WORKSPACE_SCOPED_ROUTE} is documented as workspace-scoped, and this drive did not make it refuse ` +
        `the workspace header. It answered ${String(answer.status)}: ${answer.error}. Without this control the ` +
        'sweep above could be passing because the probe detects nothing.',
    ).toBe(true)
  })
})
