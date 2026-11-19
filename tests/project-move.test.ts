// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A RECORD TO ANOTHER PROJECT FROM THE BROWSER, and what the catch-all project is called.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO STATES THIS EXISTS FOR, both measured on the live corpus on 14 August 2026
 * ---------------------------------------------------------------------------------------
 *
 * ONE. `POST /api/records/:id/workspace` had existed since the project boundary was built and NO
 * BROWSER CODE CALLED IT. Nothing a person could press moved a record out of the project it was
 * filed in. tests/workspace-move.test.ts proves the verb; it cannot see whether anything reaches
 * it, and "nothing called anything" was the defect the verb itself was written for.
 *
 * TWO. 92 records were in a project whose title is "Unassigned" — a word about Mole Office's own filing.
 * Reading them, they are ordinary notes, messages, tasks and things to try.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH GROUP BELOW PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `what a project is called` is the display name and the one place it is decided.
 *
 * `the line on every record page` is that name reaching a screen. A test of `projectName` alone
 * would prove the function and not the line, and the line is where the reader meets it.
 *
 * `what the panel says` is the sentences a person reads before pressing, and the destinations they
 * are offered. Rendered with react-dom/server, as every component test in this repository is: the
 * runner's environment is `node` and there is no DOM, so what these CANNOT see is anything behind a
 * press. That is the next group's job.
 *
 * `the requests the panel sends` closes that gap by taking the two bodies the panel builds and
 * giving them to the REAL server over HTTP. Both bodies carry a rule that is refused when it is
 * wrong — a move needing companions must name them, and an empty `also` is refused rather than read
 * as "none" — so a test that hand-wrote the body would be checking its own copy of the rule.
 */

import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { UNASSIGNED_WORKSPACE, type WorkspaceReading } from '../src/shared/workspaces.ts'
import type { MoveReport } from '../src/server/lib/move.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Projects = typeof import('../src/web/components/projects.tsx')
type RecordPageModule = typeof import('../src/web/pages/RecordPage.tsx')

let projects: Projects
let rp: RecordPageModule

beforeAll(async () => {
  // These modules reach api.ts and router.tsx, which touch `window` while they are being
  // evaluated. The smallest stand-in that lets them load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  projects = await import('../src/web/components/projects.tsx')
  rp = await import('../src/web/pages/RecordPage.tsx')
})

/** Markup with the hoisted style blocks removed, so a class named in the CSS is not evidence. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** Markup with the tags taken out, so a sentence is matched as a reader sees it. */
function words(el: ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

let seq = 0
function record(over: Partial<PanelRecord> = {}): PanelRecord {
  seq += 1
  return {
    id: 'rec-' + String(seq),
    kind: 'note',
    workspaceId: UNASSIGNED_WORKSPACE,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: 'Morning, back at the desk',
    summary: null,
    data: {},
    createdAt: '2026-08-09 08:10:00',
    updatedAt: '2026-08-09 08:10:00',
    deletedAt: null,
    ...over,
  }
}

/**
 * The installation as `GET /api/workspaces` answers it, with the live corpus's own counts.
 *
 * GENERAL IS IN IT AND HOLDS NOTHING, which is what decision `AtiSHfG00BVV` established:
 * two catch-all projects that mean different things. Unassigned holds the 92
 * records nobody could place; General is where somebody deliberately files work that does not
 * deserve a project of its own, and it starts empty.
 */
function installation(): WorkspaceReading[] {
  const at = '2026-08-12 01:44:45'
  const rows: [string, string, number][] = [
    ['panelx', 'Mole Office', 167],
    ['robotics', 'Robotics', 185],
    [UNASSIGNED_WORKSPACE, 'Unassigned', 92],
    ['general', 'General', 0],
  ]
  return rows.map(([id, title, records]) => ({
    id,
    title,
    note: null,
    reviewLevel: null,
    packageInspection: null,
    createdAt: at,
    updatedAt: at,
    records,
    isDefault: false,
  }))
}

// ============================================================================ the name

describe('what a project is called', () => {
  /**
   * THE CATCH-ALL IS CALLED WHAT THE SERVER STORES IT AS, and until 16 August 2026 it was not.
   *
   * This file used to assert the opposite: that the browser replaced the stored title "Unassigned"
   * with "Not in a project" on the way to the screen. That made one project's name a fact worked
   * out in two places, and it had already gone wrong — four places drew the stored word — so both
   * names were on screen at once. Problem `YP_OaLwgMk-j`.
   *
   * The owner settled it in decision `AtiSHfG00BVV`: the project keeps the name Unassigned, that
   * title is stored plainly, and General is a second, empty project beside it for work that is
   * deliberately miscellaneous. So the browser renames nothing and this asserts that.
   */
  it('calls the catch-all project what the server stores, with nothing renaming it on the way', () => {
    expect(projects.projectName(UNASSIGNED_WORKSPACE, 'Unassigned')).toBe('Unassigned')
  })

  it('calls the other catch-all project General, and tells the two apart by title alone', () => {
    expect(projects.projectName('general', 'General')).toBe('General')
    expect(projects.projectName('general', 'General')).not.toBe(
      projects.projectName(UNASSIGNED_WORKSPACE, 'Unassigned'),
    )
  })

  it('prints every other project under the title somebody chose for it', () => {
    expect(projects.projectName('robotics', 'Robotics')).toBe('Robotics')
    expect(projects.projectName('panelx', 'Mole Office')).toBe('Mole Office')
  })

  it('prints the id when no title is known, never another project’s title', () => {
    expect(projects.projectName('robotics')).toBe('robotics')
    expect(projects.projectName('robotics', null)).toBe('robotics')
  })
})

// ============================================================================ the header line

describe('the line on every record page', () => {
  const head = (r: PanelRecord): ReactElement =>
    h(rp.RecordHead, {
      record: r,
      // NOTHING IS JOINED TO IT, which is a statement about this fixture and not a gap in it.
      relations: [],
      projects: installation(),
      incomplete: [],
      deleted: false,
      editing: false,
      busy: false,
      onSaved: () => {},
      onDelete: async () => {},
    })

  it('says which project the record is in', () => {
    expect(words(head(record({ workspaceId: 'robotics' })))).toContain('in Robotics')
  })

  it('prints the catch-all project’s stored title, and never its stored id', () => {
    const said = words(head(record({ workspaceId: UNASSIGNED_WORKSPACE })))
    expect(said).toContain('in Unassigned')
    // The id is what every row holds and what every request carries, and it is not a name. A page
    // printing it means nobody handed the title over.
    expect(said, 'the record page is naming a project by its stored id').not.toContain('unassigned')
  })

  it('offers a way into a project on a record that is in none, and not on one that is', () => {
    expect(words(head(record({ workspaceId: UNASSIGNED_WORKSPACE })))).toContain('Put it in a project')
    expect(words(head(record({ workspaceId: 'robotics' })))).not.toContain('Put it in a project')
  })
})

// ============================================================================ what the panel says

describe('what the panel says before anything is pressed', () => {
  const panel = (r: PanelRecord, list = installation()): ReactElement =>
    h(projects.MoveToProject, { record: r, projects: list })

  it('says a record is in one project at a time, and what moving takes it out of', () => {
    const said = words(panel(record({ workspaceId: 'robotics' })))
    expect(said).toContain('This record is in Robotics')
    expect(said).toContain('one project at a time')
    expect(said).toContain('takes it out of this one')
  })

  it('answers the question about links in words, not in a comment', () => {
    const said = words(panel(record()))
    expect(said).toContain('A link cannot join two projects')
    expect(said).toContain('has to move with it')
    expect(said).toContain('Nothing is ever unlinked to make a move possible')
  })

  it('says what being in Unassigned means, on the records that are in it', () => {
    // THE SENTENCE THAT TELLS UNASSIGNED FROM GENERAL. Both are catch-alls and their names do not
    // say the difference, so the one screen where somebody chooses between them says it.
    expect(words(panel(record({ workspaceId: UNASSIGNED_WORKSPACE })))).toContain(projects.unassignedMeans())
    expect(words(panel(record({ workspaceId: 'robotics' })))).not.toContain(projects.unassignedMeans())
    // And it is not said about General, which is the other catch-all and means the opposite: work
    // somebody deliberately put there.
    expect(words(panel(record({ workspaceId: 'general' })))).not.toContain(projects.unassignedMeans())
  })

  it('offers every other project by its plain name and its size, and never the one it is in', () => {
    const said = words(panel(record({ workspaceId: UNASSIGNED_WORKSPACE })))
    expect(said).toContain('Mole Office — 167 records')
    expect(said).toContain('Robotics — 185 records')
    // GENERAL IS OFFERED THOUGH IT HOLDS NOTHING. That is the whole point of it: a record moves out
    // of Unassigned into General when somebody decides it is deliberately miscellaneous, and this
    // panel is where they decide it.
    expect(said).toContain('General — 0 records')
    expect(said).not.toContain('Unassigned — 92 records')
  })

  it('says so when there is nowhere to move it to, instead of an empty list', () => {
    const alone = installation().filter((w) => w.id === 'robotics')
    const said = words(panel(record({ workspaceId: 'robotics' }), alone))
    expect(said).toContain('is the only project this installation has')
    expect(said).not.toContain('Move it to')
  })
})

// ============================================================================ the requests

describe('the requests the panel sends, against the real server', () => {
  let t: TestDb
  let app: FastifyInstance

  const human = (workspaceId: string): Record<string, string> => ({
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': workspaceId,
  })

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    for (const [id, title] of [
      [UNASSIGNED_WORKSPACE, 'Unassigned'],
      ['robotics', 'Robotics'],
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
      expect(res.statusCode, res.body).toBe(201)
    }
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  async function file(workspaceId: string, title: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: human(workspaceId),
      payload: { kind: 'note', title, data: { date: '2026-08-09', body: title } },
    })
    expect(res.statusCode, res.body).toBe(201)
    return (JSON.parse(res.body) as { record: { id: string } }).record.id
  }

  async function ask(id: string, workspaceId: string, payload: unknown): Promise<{ code: number; body: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records/' + id + '/workspace',
      headers: human(workspaceId),
      payload: payload as Record<string, unknown>,
    })
    return { code: res.statusCode, body: res.body }
  }

  it('checks without writing, then moves — a record that moves alone', async () => {
    const id = await file(UNASSIGNED_WORKSPACE, 'Morning, back at the desk')

    const checked = await ask(id, UNASSIGNED_WORKSPACE, projects.checkRequest('robotics'))
    expect(checked.code, checked.body).toBe(200)
    const report = JSON.parse(checked.body) as MoveReport
    expect(report.dryRun).toBe(true)
    expect(report.needsAlso).toEqual([])

    // Nothing was written by the check: the record is still where it was.
    const still = await app.inject({
      method: 'GET',
      url: '/api/records/' + id,
      headers: human(UNASSIGNED_WORKSPACE),
    })
    expect(still.statusCode).toBe(200)

    const made = await ask(id, UNASSIGNED_WORKSPACE, projects.moveRequest(report))
    expect(made.code, made.body).toBe(200)
    const done = JSON.parse(made.body) as MoveReport
    expect(done.dryRun).toBe(false)

    // THE SCREEN THAT FOLLOWS, drawn from the report the server really sent. It has to quote what
    // happened, name both projects in the reader's words, and say that the rest of the page is a
    // moment old — that last one is what keeps it from being a page that looks current and is not.
    const said = words(h(projects.Moved, { report: done, projects: installation() }))
    expect(said).toContain(done.note)
    expect(said).toContain('This record is in Robotics now')
    // BOTH PROJECTS BY THE TITLE THE SERVER STORES. This said "Not in a project" until the owner
    // settled decision `AtiSHfG00BVV` and the browser stopped renaming the catch-all.
    expect(said).toContain('You are reading Unassigned')
    expect(said).toContain('the rest of this page is what was read from Unassigned a moment ago')
    expect(said).toContain('Read Robotics')

    const there = await app.inject({ method: 'GET', url: '/api/records/' + id, headers: human('robotics') })
    expect(there.statusCode, there.body).toBe(200)
    const gone = await app.inject({
      method: 'GET',
      url: '/api/records/' + id,
      headers: human(UNASSIGNED_WORKSPACE),
    })
    expect(gone.statusCode).toBe(404)
  })

  it('carries the record that is linked to it, and is refused without naming it', async () => {
    const id = await file(UNASSIGNED_WORKSPACE, 'Definition of release, attempt three')
    const other = await file(UNASSIGNED_WORKSPACE, 'Relabel the 240 clips')
    const linked = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: human(UNASSIGNED_WORKSPACE),
      payload: { fromId: other, toId: id, type: 'blocks' },
    })
    expect(linked.statusCode, linked.body).toBe(201)

    const checked = await ask(id, UNASSIGNED_WORKSPACE, projects.checkRequest('robotics'))
    expect(checked.code, checked.body).toBe(200)
    const report = JSON.parse(checked.body) as MoveReport
    expect(report.needsAlso).toEqual([other])

    // WITHOUT the companions the panel repeats back, the server refuses. This is what proves
    // `moveRequest` is doing work rather than passing a destination through.
    const bare = await ask(id, UNASSIGNED_WORKSPACE, { to: 'robotics' })
    expect(bare.code).toBe(409)

    const made = await ask(id, UNASSIGNED_WORKSPACE, projects.moveRequest(report))
    expect(made.code, made.body).toBe(200)
    for (const each of [id, other]) {
      const there = await app.inject({ method: 'GET', url: '/api/records/' + each, headers: human('robotics') })
      expect(there.statusCode, there.body).toBe(200)
    }
  })

  it('never sends an empty `also`, which the server refuses as a request built wrong', async () => {
    const id = await file(UNASSIGNED_WORKSPACE, 'Camera-to-bench residual 0.71 px')
    const report = JSON.parse(
      (await ask(id, UNASSIGNED_WORKSPACE, projects.checkRequest('robotics'))).body,
    ) as MoveReport
    expect(projects.moveRequest(report)).not.toHaveProperty('also')

    const wrong = await ask(id, UNASSIGNED_WORKSPACE, { to: 'robotics', also: [] })
    expect(wrong.code).toBe(400)
  })
})
