// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S NAME COMES FROM ONE PLACE, AND THAT PLACE IS THE SERVER.
 *
 * ---------------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE CLOSES
 * ---------------------------------------------------------------------------------------------
 *
 * Problem `YP_OaLwgMk-j`. The catch-all project stored the title "Unassigned" and the browser
 * replaced it with "Not in a project" as it was drawn, from a table in src/web/lib/projects.ts. So
 * one project had two names, and they had already got out of step ON SCREEN: four places drew a
 * project's name without coming through that function, so the phone bar and Home printed the stored
 * word while the sidebar printed the replacement. Two further places passed no title at all and
 * printed the raw id — "unassigned" beside a sidebar saying something else entirely.
 *
 * The owner settled the name in decision `AtiSHfG00BVV` on 16 August 2026: the project keeps the
 * name Unassigned, its title is stored plainly, and `General` is a second, empty project beside it
 * for work that is deliberately miscellaneous. So the renaming table is deleted, and every place
 * that draws a project's name draws the title the registry serves.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SIX PLACES, AND HOW EACH ONE IS CHECKED HERE
 * ---------------------------------------------------------------------------------------------
 *
 * DRAWN AND ASSERTED ON:
 *   - Home's line saying which project the bands below are about, and its buttons offering the
 *     projects that hold work — `ThisProject`.
 *   - Home's day rows, which name a project on every row — `projectNameOn`.
 *   - The record a pasted id names, on the records page — `ExactRecordHit`.
 *   - The plan drawing's list of work in other projects — `PlanGraphView`.
 *
 * MEASURED IN A REAL BROWSER, BECAUSE NEITHER CAN BE DRAWN ON ITS OWN:
 *   - The phone's top bar in src/web/App.tsx. It is inside `Shell`, which builds the whole
 *     interface and fetches from a server on the way up.
 *   - The line under a period's hours saying how they split between projects — `ProjectSplit` in
 *     src/web/components/Planning.tsx. It reads the registry through `useAsync`, which never
 *     resolves outside a browser, so a static render can only ever show the id.
 *
 * BOTH USED TO BE CHECKED BY GREPPING THE SOURCE for the exact text of a call —
 * `projectName(sight.id, sight.title)` and `projectName(project, titleOf(project))`. An ordinary
 * rename turned that red with nothing broken, and a component that called the function and then
 * drew something else would have passed. The browser section at the end makes a project whose id
 * and title share no words, and reads what each of the two places puts on the screen.
 *
 * The runner's environment is `node` and this project has ruled out jsdom, so the browser modules
 * that CAN be rendered on their own are loaded behind a window stand-in — the same way
 * tests/home-day-band.test.ts does it.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { periodKey } from '../src/shared/planning.ts'

import { UNASSIGNED_WORKSPACE, type WorkspaceReading } from '../src/shared/workspaces.ts'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { SearchReply } from '../src/server/api/search.ts'
import type { PlanGraphReply } from '../src/server/api/plan-graph.ts'

type Home = typeof import('../src/web/pages/HomePage.tsx')
type Records = typeof import('../src/web/pages/RecordsPage.tsx')
type Graph = typeof import('../src/web/components/graph/PlanGraph.tsx')

/**
 * A window stand-in, installed before any browser module is loaded.
 *
 * IT REMEMBERS A CHOSEN PROJECT, because `ThisProject` names the project this browser is reading and
 * a browser that has chosen none is reading `default`. Choosing one here is what makes the assertion
 * about a title rather than about the default's name.
 */
function installWindow(): void {
  const store = new Map<string, string>([['mole-office.workspace', 'panelx']])
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  }
}

/**
 * The installation as `GET /api/workspaces` answers it, with the catch-all pair in it.
 *
 * The two catch-alls are the pair this whole change is about, so both are here and both have a
 * title that is nothing like their id.
 */
function installation(): WorkspaceReading[] {
  const at = '2026-08-12 01:44:45'
  const rows: [string, string, number][] = [
    ['panelx', 'Mole Office', 213],
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

function reply(): WorkspacesReply {
  return {
    workspaces: installation(),
    current: { id: 'panelx', stated: true },
    choosing: 'Send the project header on every request.',
  }
}

const words = (markup: string): string => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

let home: Home
let records: Records
let graph: Graph

beforeAll(async () => {
  installWindow()
  home = await import('../src/web/pages/HomePage.tsx')
  records = await import('../src/web/pages/RecordsPage.tsx')
  graph = await import('../src/web/components/graph/PlanGraph.tsx')
})

// ============================================================================ Home

describe('Home names a project the way every other screen does', () => {
  it('says which project the bands are about by its stored title, not its stored id', () => {
    const said = words(renderToStaticMarkup(h(home.ThisProject, { records: 92, projects: reply() })))
    // `currentWorkspace()` is `panelx` here: nothing was stored, and that is the id this browser
    // sends. The line has to print what the installation calls it.
    expect(said, 'Home is naming the project it is showing by its stored id').toContain('Mole Office')
    expect(said).not.toContain('about panelx')
  })

  it('offers the other projects by title, including both catch-alls', () => {
    // This project holds nothing, which is the state that draws the buttons.
    const said = words(renderToStaticMarkup(h(home.ThisProject, { records: 0, projects: reply() })))
    expect(said).toContain('Robotics')
    expect(said).toContain('Unassigned')
    // GENERAL IS NOT OFFERED, and that is right rather than a miss: the buttons name the projects
    // that HAVE WORK IN THEM, and General is empty by design. It is here so that a change making
    // the buttons list every project is a decision somebody takes on purpose.
    expect(said, 'the buttons are offering a project that holds nothing').not.toContain('General')
    expect(said, 'a project is being offered by its stored id').not.toContain('robotics')
  })

  it('names a project on a day row by its title, and by its id only when nothing knows the title', () => {
    const named = home.projectNameOn(reply())
    expect(named(UNASSIGNED_WORKSPACE)).toBe('Unassigned')
    expect(named('general')).toBe('General')
    expect(named('robotics')).toBe('Robotics')
    // Nothing has arrived yet. The id is the true name of what this browser is asking about, and it
    // is never some other project's title.
    expect(home.projectNameOn(null)('robotics')).toBe('robotics')
    // A project the installation does not list. Absence beats a guess.
    expect(named('nobody-has-this')).toBe('nobody-has-this')
  })
})

// ============================================================================ the records page

describe('the record a pasted id names says which project it is in, by name', () => {
  const exact = (workspaceId: string): NonNullable<SearchReply['exact']> =>
    ({
      id: 'Kd3Pm8Rt5Wq2',
      kind: 'wanna_try',
      title: 'Tumbrel harness, a wanna_try nobody has tried',
      workspaceId,
      elsewhere: true,
      deleted: false,
      path: '/r/Kd3Pm8Rt5Wq2',
    }) as NonNullable<SearchReply['exact']>

  it('prints the title the page hands it', () => {
    const said = words(
      renderToStaticMarkup(h(records.ExactRecordHit, { exact: exact(UNASSIGNED_WORKSPACE), projectTitle: 'Unassigned' })),
    )
    expect(said).toContain('Unassigned')
    expect(said, 'the tag is naming a project by its stored id').not.toContain('unassigned')
  })

  it('marks a missing project title without exposing its stored id', () => {
    const said = words(renderToStaticMarkup(h(records.ExactRecordHit, { exact: exact(UNASSIGNED_WORKSPACE) })))
    // Plan 7FEOshq3mBGG: an unknown name is not permission to draw an id.
    expect(said).toContain('Unnamed project')
    expect(said).not.toContain('unassigned')
  })
})

// ============================================================================ the plan drawing

describe('the plan drawing names the projects it did not draw', () => {
  const drawing = (): PlanGraphReply =>
    ({
      from: '2026-08-10',
      to: '2026-08-16',
      period: '2026-W33',
      horizon: 'week',
      workspaceId: 'panelx',
      workspaceTitle: 'Mole Office',
      nodes: [],
      edges: [],
      omitted: [],
      elsewhere: [
        {
          recordId: 'aaaaaaaaaaaa',
          name: 'Calibrate the wrist camera',
          workspaceId: 'robotics',
          gone: false,
          allocations: [{ id: 'alloc-1', horizon: 'week', period: '2026-W33', plannedHours: 4 }],
        },
      ],
    }) as unknown as PlanGraphReply

  it('prints another project’s title when the page has read the registry', () => {
    const said = words(
      renderToStaticMarkup(h(graph.PlanGraphView, { reply: drawing(), projectTitles: installation() })),
    )
    expect(said).toContain('Robotics')
    expect(said, 'the row is naming a project by its stored id').not.toContain('robotics')
  })

  it('uses the short mark while another project has no readable title', () => {
    const said = words(renderToStaticMarkup(h(graph.PlanGraphView, { reply: drawing() })))
    expect(said).not.toContain('robotics')
    expect(said).toContain('—')
  })
})

// ============================================================ the two places only a browser can see

/**
 * THE PHONE BAR AND THE HOURS SPLIT, READ OFF THE SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * A PROJECT WHOSE ID AND TITLE SHARE NO WORDS
 * ---------------------------------------------------------------------------------------
 *
 * The whole rule is that a project is drawn by the title the registry serves, never by the id the
 * browser sends. A project called `wrist-rig` and titled `The wrist rig` would let the two pass for
 * each other in a substring check, so this one is `rig-b` titled `Tumbrel harness`. Nothing about
 * the drawn words can be true by accident.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS REPLACED TWO SOURCE GREPS
 * ---------------------------------------------------------------------------------------
 *
 * The two cases here used to read `src/web/App.tsx` and `src/web/components/Planning.tsx` as text
 * and assert that each contained an exact call — `projectName(sight.id, sight.title)` and
 * `projectName(project, titleOf(project))`. Renaming a variable turned them red while the screen
 * was right, and a component that made the call and then drew the id anyway would have passed
 * them both. This section makes the project, plans an hour against it, and reads the two screens.
 *
 * WHAT IT DOES NOT COVER. Switching between projects while the page is open is
 * tests/workspace-switch.test.ts, and the arithmetic in the hours boxes is
 * tests/hours-boxes-read-alike.test.ts. Both drive the same pages for their own questions.
 */
describe('the two places that draw a project name and cannot be rendered on their own', () => {
  const PROJECT = 'rig-b'
  const TITLE = 'Tumbrel harness'
  let app: LiveApp
  let page: Page
  let barText: string
  let splitText: string[]

  beforeAll(async () => {
    app = await liveApp({ name: 'projectname', viewport: { width: 390, height: 900 } })
    page = app.page
    const call = async (method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
      const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-mole-office-actor-type': 'human',
          'x-mole-office-actor-id': 'the project name test',
          'x-mole-office-workspace': PROJECT,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
      return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
    }

    await call('POST', '/api/workspaces', { id: PROJECT, title: TITLE })
    const made = (await call('POST', '/api/records', {
      kind: 'task',
      title: 'Fit the harness to the wrist',
      data: { state: 'doing' },
    }))['record'] as { id: string }
    await call('POST', '/api/planning/allocations', {
      horizon: 'week',
      period: periodKey('week', new Date()),
      recordId: made.id,
      plannedHours: 4,
    })

    // WHICH PROJECT THIS BROWSER IS READING, said the way the browser itself says it.
    await page.addInitScript(
      (chosen: string) => window.localStorage.setItem('mole-office.workspace', chosen),
      PROJECT,
    )

    const site = `http://127.0.0.1:${String(app.webPort)}`
    // Wave 13q round 14 changed the criterion: All records stands under All projects and its bar names no
    // project, so the bar is read on Modules, a page of the project.
    await page.goto(`${site}/#/modules`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await new Promise((r) => setTimeout(r, 1200))
    barText = (await page.textContent('.shell-bar-project')) ?? ''

    await page.goto(`${site}/#/plan`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await new Promise((r) => setTimeout(r, 1800))
    splitText = await page.$$eval('.px-pl-project', (rows) => rows.map((row) => row.textContent ?? ''))
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('draws the project in the phone bar by the title the registry serves', () => {
    expect(barText.trim(), 'the phone bar drew something other than the stored title').toBe(TITLE)
    expect(barText, 'the phone bar drew the id this browser sends').not.toContain(PROJECT)
  })

  it('draws the project in the line splitting a period’s hours by the same title', () => {
    // THE DEFECT THIS CLOSES, MEASURED ON 16 AUGUST 2026: the sidebar said "Default" and the line
    // under the week's hours said "default", on one screen, four inches apart.
    expect(splitText.length, 'the hours split drew no project line to read').toBeGreaterThan(0)
    expect(splitText.join(' '), 'the hours split drew the stored id instead of the title').toContain(TITLE)
    expect(splitText.join(' '), 'the hours split drew the stored id').not.toContain(PROJECT)
  })

  it('draws the same name in both places, which is the whole rule', () => {
    for (const line of splitText) {
      expect(line, 'one screen names this project one way and another names it another').toContain(barText.trim())
    }
  })
})
