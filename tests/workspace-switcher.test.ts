// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER'S HALF OF THE PROJECT BOUNDARY: which project it says it is reading, on every
 * request, and what the frame prints about it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD GO WRONG, AND WHY A TYPE CHECK CANNOT SEE ANY OF IT
 * ---------------------------------------------------------------------------------------
 *
 * A Mole Office installation holds several isolated projects (src/shared/workspaces.ts). The server
 * scopes every read and every write to the workspace `x-mole-office-workspace` names, and a request
 * that names none is answered from the stated default. So:
 *
 *   1. A TRANSPORT THAT DOES NOT SEND THE HEADER reads and writes another project, successfully,
 *      for ever. There were FOUR transports in this app — api.ts and three copies of it written
 *      while api.ts belonged to another agent — and a header added to one of them is a header
 *      missing from three. Nothing fails: every reply is a valid reply about somewhere else.
 *   2. THE HEADER NAME IS WRITTEN IN TWO PLACES. The browser may not import a value from
 *      src/server, so `WORKSPACE_HEADER` in web/lib/workspace.ts and `WORKSPACE_HEADER` in
 *      server/lib/http.ts are two strings with nothing making them equal. If they part, every
 *      screen in the product answers about `default` while the sidebar says Robotics.
 *   3. A FRAME THAT CANNOT SAY WHICH PROJECT IT IS SHOWING makes every number on every page
 *      unreadable — "184 records" and "7 need you" are different claims per project and neither
 *      says so itself.
 *
 * None of the three is a type error and none of them makes a request fail.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE LOOKS AT THEM
 * ---------------------------------------------------------------------------------------
 *
 * NOT by comparing strings. `fetch` is pointed at the REAL server through `app.inject`, exactly as
 * tests/panels-follow.test.ts does it, and the browser's own wrappers are called. So "the header
 * agrees with the server" is proved the only way that means anything: the browser asks for one
 * project and gets that project's records back, and would get the other's — or nothing — if any
 * part of the chain had drifted.
 *
 * The runner's environment is `node`: no DOM, and adding one would be a dependency this project
 * has ruled out. src/web/api.ts reads window.localStorage while it is being evaluated, so the
 * smallest stand-in for a window is installed before anything web is imported, and components are
 * rendered to static markup with react-dom/server.
 *
 * WHAT THIS FILE CANNOT DO, SAID PLAINLY: react-dom/server runs a render but never an effect and
 * never a second render, so nothing here can watch the interface change from one project to
 * another. That is the whole of the no-stale-flash requirement and it is proved in a real browser
 * in tests/workspace-switch.test.ts. This file proves what a single render draws.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// `workspaceIdFault` is the ONE function that says whether a string may be a workspace id, used by
// the create route and by the header reader. The sidebar's suggestion is checked against it here
// rather than against a second copy of the rule.
import { DEFAULT_WORKSPACE, UNASSIGNED_WORKSPACE, workspaceIdFault } from '../src/shared/workspaces.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import type { BuiltServer } from '../src/server/index.ts'
import type { AsyncState } from '../src/web/components/ui.tsx'

type WebApi = typeof import('../src/web/api.ts')
type WorkspaceLib = typeof import('../src/web/lib/workspace.ts')
type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type ModuleSourceModule = typeof import('../src/web/components/ModuleSource.tsx')
type SessionPanelModule = typeof import('../src/web/components/SessionPanel.tsx')
type GraphEditModule = typeof import('../src/web/components/graph/Edit.tsx')
type ProjectsModule = typeof import('../src/web/components/projects.tsx')

let db: TestDb
let server: BuiltServer
let app: BuiltServer['app']
let webApi: WebApi
let ws: WorkspaceLib
let Sidebar: SidebarModule
let moduleSource: ModuleSourceModule
let sessionPanel: SessionPanelModule
let graphEdit: GraphEditModule
// The one function in the browser that names a project. The switcher has to call it and nothing
// else, so the test asks it for the expected words rather than typing them a second time.
let projects: ProjectsModule

/** Every request the browser made, as the server received it. */
const sent: { url: string; method: string; workspace: string | undefined }[] = []

/** What this browser had stored as its project before the app started. Not a workspace id. */
const CORRUPT_STORED_WORKSPACE = 'Robotics Project!'

/** The one record in each project, titled so that a row from the wrong project is unmistakable. */
const ROBOTICS_RECORD = 'The gripper slips at 40N'
const MOLE_OFFICE_RECORD = 'The switcher must not flash'

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  // Stored BEFORE the app loads, because that is when a browser reads it: this is the state of
  // somebody whose stored project was written by something other than this app. See the first
  // describe below — the point is that it is reported rather than quietly replaced.
  store.set('mole-office.workspace', CORRUPT_STORED_WORKSPACE)

  db = await freshDb()
  server = await apiApp()
  app = server.app
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers,
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    sent.push({
      url: String(input),
      method: init.method ?? 'GET',
      workspace: headers['x-mole-office-workspace'],
    })
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  ws = await import('../src/web/lib/workspace.ts')
  webApi = await import('../src/web/api.ts')
  Sidebar = await import('../src/web/components/Sidebar.tsx')
  moduleSource = await import('../src/web/components/ModuleSource.tsx')
  sessionPanel = await import('../src/web/components/SessionPanel.tsx')
  graphEdit = await import('../src/web/components/graph/Edit.tsx')
  projects = await import('../src/web/components/projects.tsx')

  // Two projects with one record each, established through the real routes.
  await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: 'robotics', title: 'Robotics', note: 'The robotics work.' },
  })
  await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: 'panelx', title: 'Mole Office', note: null },
  })
  ws.setWorkspace('robotics')
  await webApi.api.createRecord({ kind: 'problem', title: ROBOTICS_RECORD })
  ws.setWorkspace('panelx')
  await webApi.api.createRecord({ kind: 'problem', title: MOLE_OFFICE_RECORD })
  ws.setWorkspace('robotics')
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The requests made while running `fn`, and nothing from before it. */
async function requestsDuring(fn: () => Promise<unknown>): Promise<typeof sent> {
  const from = sent.length
  // THE REPLY IS DELIBERATELY DISCARDED, INCLUDING A FAILURE. These cases are about what the
  // browser SENT: `sourceApi.coverage()` answers 404 when the source index has never been built,
  // and that 404 is as good a witness as a 200 — the request still had to name its project. A
  // test that needed every call to succeed would need a built index, which is not what it is about.
  await fn().then(
    () => {},
    () => {},
  )
  return sent.slice(from)
}

// ============================================================================ the stored project

describe('the project this browser is reading', () => {
  /**
   * A stored value that is not a workspace id is DROPPED AND REPORTED, never silently replaced.
   *
   * Falling back to the stated default is the right landing place — it is where a request that
   * names no project is answered from — but doing it quietly would mean a reader whose stored
   * project was mangled goes on reading a different project's work with the interface saying
   * nothing. The sentence names the value that was thrown away.
   */
  it('reports a stored project it cannot use, and lands on the stated default', () => {
    expect(ws.workspaceBootFault()).toContain(CORRUPT_STORED_WORKSPACE)
    expect(ws.workspaceBootFault()).toContain(DEFAULT_WORKSPACE)
    // `currentWorkspace()` is 'robotics' by now because beforeAll chose it. What the boot read is
    // still visible in the fault, which is the point: it is a fact about boot and does not expire.
    expect(window.localStorage.getItem('mole-office.workspace')).not.toBe(CORRUPT_STORED_WORKSPACE)
  })

  it('refuses to be set to something that is not a workspace id, rather than cleaning it up', () => {
    expect(() => ws.setWorkspace('Robotics Project!')).toThrow(/not a workspace id/)
    expect(() => ws.setWorkspace('')).toThrow(/blank/)
    expect(ws.currentWorkspace()).toBe('robotics')
  })
})

// ============================================================================ the header

describe('every request names its project, and the server agrees which one', () => {
  /**
   * THE ONE THAT PROVES THE HEADER NAME. Nothing here compares strings: the browser asks for one
   * project through its own wrapper and the REAL server answers. If the browser's header name and
   * the server's ever part, the server hears no workspace, answers from the stated default, and
   * both lists below come back empty.
   */
  it('reads the project it asked for, through the real routes', async () => {
    ws.setWorkspace('robotics')
    expect((await webApi.api.listRecords()).records.map((r) => r.title)).toEqual([ROBOTICS_RECORD])

    ws.setWorkspace('panelx')
    expect((await webApi.api.listRecords()).records.map((r) => r.title)).toEqual([MOLE_OFFICE_RECORD])

    ws.setWorkspace('robotics')
  })

  /**
   * A WRITE LANDS IN THE PROJECT ON SCREEN. The read half above would still pass if a write went
   * somewhere else — a record filed into another project is not missing, it is misfiled, and the
   * only way to see it is to look for it where it should not be.
   */
  it('files a new record in the project being read, and nowhere else', async () => {
    ws.setWorkspace('panelx')
    const created = await webApi.api.createRecord({ kind: 'note', title: 'filed while reading panelx' })
    expect(created.record.workspaceId).toBe('panelx')

    ws.setWorkspace('robotics')
    const robotics = await webApi.api.listRecords()
    expect(robotics.records.map((r) => r.title)).not.toContain('filed while reading panelx')

    ws.setWorkspace('panelx')
    expect((await webApi.api.listRecords()).records.map((r) => r.title)).toContain('filed while reading panelx')
    ws.setWorkspace('robotics')
  })

  /**
   * ALL FOUR TRANSPORTS, one call each.
   *
   * This is the test that would have caught the defect this pass was written around: api.ts,
   * SessionPanel.tsx, ModuleSource.tsx and graph/Edit.tsx each built their own request headers,
   * and adding `x-mole-office-workspace` to the first would have left the other three reading and
   * writing another project. They now share one transport; this fails the day a fifth appears.
   */
  it('sends the project from every transport in the app, not only from api.ts', async () => {
    ws.setWorkspace('robotics')
    const calls: { transport: string; call: () => Promise<unknown> }[] = [
      { transport: 'src/web/api.ts', call: () => webApi.api.listRecords() },
      { transport: 'components/ModuleSource.tsx', call: () => moduleSource.sourceApi.coverage() },
      { transport: 'components/SessionPanel.tsx', call: () => sessionPanel.fetchSessions() },
      { transport: 'components/graph/Edit.tsx', call: () => graphEdit.presentation.read('structure') },
    ]
    for (const { transport, call } of calls) {
      const made = await requestsDuring(call)
      expect(made.length, `${transport} made no request`).toBeGreaterThan(0)
      for (const one of made) {
        expect(one.workspace, `${transport} sent ${one.method} ${one.url} without naming a project`).toBe(
          'robotics',
        )
      }
    }
  })

  /**
   * The server's own report of what it heard, which is what the frame checks itself against.
   *
   * `stated: true` is the half that matters: it says the request NAMED a project rather than
   * being answered from the default. A browser cannot find that out any other way.
   */
  it('is told by the server which project answered, and that the request said so', async () => {
    ws.setWorkspace('panelx')
    const reply = await webApi.api.listWorkspaces()
    expect(reply.current).toEqual({ id: 'panelx', stated: true })
    expect(reply.workspaces.map((w) => w.id).sort()).toEqual([DEFAULT_WORKSPACE, 'panelx', 'robotics'])
    ws.setWorkspace('robotics')
  })
})

// ============================================================================ what is printed

describe('what the frame says about the project', () => {
  it('prints the title and the count once the installation names them', async () => {
    ws.setWorkspace('robotics')
    const reply = await webApi.api.listWorkspaces()
    const sight = ws.workspaceSight('robotics', reply)
    expect(sight).toMatchObject({ id: 'robotics', title: 'Robotics', named: true, fault: null })
    expect(sight.what).toContain('Robotics')
    // The note the workspace carries is part of what a reader gets, not decoration this drops.
    expect(sight.what).toContain('The robotics work.')
  })

  /**
   * BEFORE THE LIST ARRIVES THE NAME IS THE ID, AND IT IS NEVER BLANK.
   *
   * The id is the true name of what this browser is asking for. Printing nothing until a title
   * arrives would leave the one piece of context every number on the page depends on missing for
   * as long as the request takes.
   */
  it('names the project by its id before anything has told it a title', () => {
    const sight = ws.workspaceSight('robotics', null)
    expect(sight).toMatchObject({ id: 'robotics', title: 'robotics', named: false, fault: null })
  })

  /**
   * THE HEADER-DRIFT DETECTOR. This is the state the two copies of the header name would produce:
   * the browser believes it is reading `robotics`, the server says it was not told which project
   * this request was about and answered from the default. Every count on screen is then about
   * somewhere else, and this sentence is the only thing that would say so.
   */
  it('says so when the server was not told which project the request was about', () => {
    const sight = ws.workspaceSight('robotics', {
      workspaces: [],
      current: { id: DEFAULT_WORKSPACE, stated: false },
      choosing: '',
    })
    expect(sight.fault?.short).toBe('Project header lost')
    expect(sight.fault?.said).toContain('not told which project')
    expect(sight.fault?.said).toContain(ws.WORKSPACE_HEADER)
  })

  it('says so when the server answered about a different project than the one asked for', () => {
    const sight = ws.workspaceSight('robotics', {
      workspaces: [],
      current: { id: 'panelx', stated: true },
      choosing: '',
    })
    expect(sight.fault?.short).toBe('Wrong project answered')
    expect(sight.fault?.said).toContain('robotics')
    expect(sight.fault?.said).toContain('panelx')
  })

  it('says so when the server accepts a project it does not list', () => {
    const sight = ws.workspaceSight('robotics', {
      workspaces: [],
      current: { id: 'robotics', stated: true },
      choosing: '',
    })
    expect(sight.fault?.short).toBe('No such workspace')
    expect(sight.fault?.said).toContain('does not list it')
  })
})

// ============================================================================ the switcher

describe('the switcher in the sidebar', () => {
  /** The sidebar as markup, without its stylesheet — a class name in CSS is not evidence. */
  function draw(sight: ReturnType<WorkspaceLib['workspaceSight']>, workspaces: AsyncState<unknown>): string {
    const html = renderToStaticMarkup(
      h(Sidebar.Sidebar, {
        page: 'home' as const,
        open: false,
        onClose: () => {},
      onRenamed: () => {},
        attention: { status: 'loading' as const },
        waiting: { status: 'loading' as const },
        sight,
        workspaces: workspaces as never,
      }),
    )
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
  }

  /**
   * THE REQUIREMENT: a reader is never in doubt about which project they are reading. Not while
   * the list of projects is loading, not when it failed, not when the project is broken.
   */
  it('names the project on screen in every state the list of projects can be in', async () => {
    ws.setWorkspace('robotics')
    const reply = await webApi.api.listWorkspaces()

    const ready = draw(ws.workspaceSight('robotics', reply), { status: 'ready', value: reply })
    expect(ready).toContain('Robotics')
    expect(ready).toContain('data-projects="ready"')
    expect(ready).toMatch(/<button[^>]*class="sbp-switch"(?![^>]*disabled)/)

    const loading = draw(ws.workspaceSight('robotics', null), { status: 'loading' })
    expect(loading).toContain('—')
    expect(loading).toContain('Reading projects…')
    // No list while there is nothing to choose from: a list with one invented project would be an
    // answer about which projects exist, made up by the browser. The Switch press waits.
    expect(loading).toMatch(/<button[^>]*class="sbp-switch"[^>]*disabled/)
    expect(loading).not.toContain('class="sbp-choice"')

    const failed = draw(ws.workspaceSight('robotics', null), {
      status: 'error',
      message: 'There is no workspace called "robotics".',
    })
    expect(failed).toContain('—')
    expect(failed).toContain('Cannot read the projects')
  })

  it('offers every project by its name', async () => {
    ws.setWorkspace('robotics')
    const reply = await webApi.api.listWorkspaces()
    const html = draw(ws.workspaceSight('robotics', reply), { status: 'ready', value: reply })
    for (const w of reply.workspaces) {
      expect(html, `the switcher left out ${w.id}`).toContain(projects.projectName(w.id, w.title))
    }
  })

  /**
   * ONE PROJECT, ONE NAME, ON EVERY SCREEN.
   *
   * `projectName` in src/web/lib/projects.ts is the only function in the browser that turns a
   * project into words a person reads, and this control did not call it. It printed the stored
   * title, so the switcher offered "Unassigned · 92" while the record page for a record inside that
   * project said "Not in a project" — one project with two names, and nothing making them agree.
   *
   * WHICH OF THE TWO WON WAS SETTLED in decision `AtiSHfG00BVV`: the
   * stored title. The browser's renaming table is deleted and every surface prints what the registry
   * serves, so this switcher and the record page cannot disagree any more.
   *
   * THE STORED ID DOES NOT MOVE. `unassigned` is still what the Switch list's choice carries and
   * what every request carries; it is never what a reader is shown.
   */
  it('calls the catch-all project what the rest of the product calls it', () => {
    const reply = {
      workspaces: [
        { id: UNASSIGNED_WORKSPACE, title: 'Unassigned', records: 92, note: null, created: '2026-01-01 09:00:00' },
        { id: 'robotics', title: 'Robotics', records: 12, note: null, created: '2026-01-01 09:00:00' },
      ],
      current: { id: 'robotics', stated: true },
      choosing: 'Send the header.',
    }
    const html = draw(ws.workspaceSight('robotics', reply as never), { status: 'ready', value: reply })
    expect(html).toContain('Unassigned')
    expect(html, 'the switcher is showing a project by its stored id').not.toContain('>unassigned<')
    // The value is the id, untouched, so choosing it asks the server for the same project as before.
    expect(html).toContain(`data-project="${UNASSIGNED_WORKSPACE}"`)
  })

  it('keeps making projects out of the sidebar and reachable through Settings', () => {
    const html = draw(ws.workspaceSight('robotics', null), { status: 'loading' })
    expect(html).not.toContain('Make a project')
    expect(html).toContain('href="#/settings"')
  })

  it('keeps renaming out of the sidebar and reachable through Settings', () => {
    const html = draw(ws.workspaceSight('robotics', null), { status: 'loading' })
    expect(html).not.toContain('Rename this project')
    expect(html).toContain('href="#/settings"')
  })

  it('suggests an id that the one shared checker accepts, for a name a person would type', () => {
    // THE ID IS A SUGGESTION AND NEVER AN ANSWER. What may be an id is decided by
    // `workspaceIdFault` in src/shared/workspaces.ts, which is the same function the create route
    // and the header reader use — so this is checked against that and not against a copy of it.
    for (const typed of ['Personal', 'Personal errands', 'My 2026 plans', '  Home  ']) {
      const id = Sidebar.suggestedProjectId(typed)
      expect(workspaceIdFault(id), `"${typed}" was turned into "${id}", which the server refuses`).toBeNull()
    }
    expect(Sidebar.suggestedProjectId('Personal errands')).toBe('personal-errands')
  })

  it('has no id to offer for a name with nothing usable in it, rather than inventing one', () => {
    // Absence is the answer, and `workspaceIdFault` is what turns it into a sentence on screen. A
    // browser that invented "project-1" here would have named the person's project for them.
    const id = Sidebar.suggestedProjectId('...')
    expect(id).toBe('')
    expect(workspaceIdFault(id)).not.toBeNull()
  })

  it('names the project the reader is IN with the same function, not only the ones on offer', () => {
    // The name beside the caption is the one a reader sees first, and it was drawn straight off the
    // registry while the ones on offer went through `projectName`.
    const reply = {
      workspaces: [
        { id: UNASSIGNED_WORKSPACE, title: 'Unassigned', records: 92, note: null, created: '2026-01-01 09:00:00' },
      ],
      current: { id: UNASSIGNED_WORKSPACE, stated: true },
      choosing: 'Send the header.',
    }
    const html = draw(ws.workspaceSight(UNASSIGNED_WORKSPACE, reply as never), { status: 'ready', value: reply })
    expect(html).toContain('Unassigned')
    expect(html, 'the caption is naming the project by its stored id').not.toContain('>unassigned<')
  })

  it('prints the short mark while the project name is not yet known', () => {
    // The title is unknown until the project list arrives.
    const html = draw(ws.workspaceSight(UNASSIGNED_WORKSPACE, null), { status: 'loading' })
    expect(html).toContain('—')
    expect(html).not.toContain(`>${UNASSIGNED_WORKSPACE}<`)
    expect(html, 'a title was invented for a project nothing had named yet').not.toContain('Unassigned')
  })

  /**
   * A BROKEN PROJECT IS NEVER A DEAD END. A browser holding a project this installation does not
   * have gets a 404 on every request, including the one that lists the projects — so the way out
   * cannot depend on that list. It is the stated default, which every migrated database has.
   */
  it('offers the way back to the stated default when the project cannot be read', () => {
    const html = draw(ws.workspaceSight('gone', null), {
      status: 'error',
      message: 'There is no workspace called "gone".',
    })
    expect(html).toContain('Read the default project')
  })

  /**
   * NOTHING IN THE SWITCHER DELETES A PROJECT. A project holds every record in it, so a control
   * that removes one belongs where a person is looking at that project and its contents, not in the
   * strip they use to move between them. Nothing here is a warning about deleting; a switcher with
   * no destructive control needs none.
   *
   * THE OTHER HALF OF THIS CASE IS GONE, AND ON PURPOSE. It read `not.toContain('new project')`
   * beside a case four lines up that requires the words "Make a project", so the file said the
   * switcher both must and must not offer a way to establish one. It passed only because the two
   * halves looked for different words: the control says "Make a project" and the ban was written
   * against "new project". Decision `AckYjtD6ZiuN` settled it, F3 as
   * proposed — cut the dead part, keep the live one. Making a project is in the product and
   * `POST /api/workspaces` had no control anywhere until it was.
   */
  it('offers no way to delete a project: this is navigation, not administration', async () => {
    ws.setWorkspace('robotics')
    const reply = await webApi.api.listWorkspaces()
    const html = draw(ws.workspaceSight('robotics', reply), { status: 'ready', value: reply })
    expect(html.toLowerCase(), 'the switcher can delete a project').not.toContain('delete')
    expect(html.toLowerCase()).not.toContain('remove project')
    // AND THE CASE IS OVER SOMETHING. A switcher drawing nothing would pass the two lines above.
    expect(html).not.toContain('Make a project')
    expect(html).toContain('data-projects="ready"')
  })
})

/**
 * A WARNING A PERSON READS IS A FEW WORDS, AND THE SENTENCE IS BEHIND IT.
 *
 * THE DEFECT: the warnings were too long. A warning for a person only needs to be short, such as "No such
 * workspace" or even "Workspace error". The owner walked into a second world carrying the project the owner had been
 * reading, that world had never heard of it, and the sidebar gave the owner five sentences about it —
 * three hundred and sixty-seven characters, measured in a browser. Problem `DDOmWnhiVa00`.
 */
describe('a workspace warning is short, and keeps the whole of what was said', () => {
  it('says the few words for a project list refused because there is no such workspace', () => {
    const said = ws.theWarningForAProjectListThatFailed('There is no workspace called "panelx". This installation…', 404)
    expect(said.short).toBe('No such workspace')
    expect(said.short.split(' ')).toHaveLength(3)
    expect(said.said, 'the sentence was thrown away rather than put behind the words').toContain('panelx')
  })

  it('says something different when the list failed for any other reason', () => {
    expect(ws.theWarningForAProjectListThatFailed('nothing answered', 0).short).toBe('Cannot read the projects')
    expect(ws.theWarningForAProjectListThatFailed('the server broke', 500).short).toBe('Cannot read the projects')
    expect(ws.theWarningForAProjectListThatFailed('the server broke', undefined).short).toBe('Cannot read the projects')
  })

  it('names a stored project it could not read in a few words too', () => {
    const said = ws.theWarningForAnUnreadableStoredProject('This browser had "??" stored as the project…')
    expect(said.short).toBe('Stored project unreadable')
    expect(said.said).toContain('stored as the project')
  })

  it('gives every one of the three sight faults a few words and the whole sentence', () => {
    const three = [
      ws.workspaceSight('robotics', { workspaces: [], current: { id: 'default', stated: false }, choosing: '' }),
      ws.workspaceSight('robotics', { workspaces: [], current: { id: 'panelx', stated: true }, choosing: '' }),
      ws.workspaceSight('robotics', { workspaces: [], current: { id: 'robotics', stated: true }, choosing: '' }),
    ]
    for (const sight of three) {
      expect(sight.fault).not.toBeNull()
      // A FEW WORDS: no id, no route, no instruction, and short enough to sit in a sidebar column.
      expect(sight.fault?.short.length, `"${sight.fault?.short ?? ''}" is not a few words`).toBeLessThanOrEqual(28)
      expect(sight.fault?.short).not.toContain('"')
      // AND NOTHING LOST: the sentence is longer than the words, and it is the one that was written.
      expect((sight.fault?.said ?? '').length).toBeGreaterThan(60)
    }
    expect(three.map((s) => s.fault?.short)).toEqual([
      'Project header lost',
      'Wrong project answered',
      'No such workspace',
    ])
  })
})

/**
 * AND THE SIDEBAR DRAWS THE FEW WORDS, WITH THE SENTENCE FOLDED BEHIND THEM.
 *
 * The words above are a pure reading and this is what a person actually sees. `WorkspaceSwitcher`
 * is drawn inside the whole shell and cannot be rendered here on its own, so this reads the one
 * component that draws a warning — the function body, not the file, because the file's own comments
 * quote the long sentences this replaced. Measured in a browser as well, on 4 September against a
 * second world: `⚠No such workspace` on screen, 367 characters folded behind it, closed.
 */
describe('the sidebar draws a warning as a few words with the rest folded away', () => {
  it('puts the short words in the summary and the sentence inside', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath, URL: NodeURL } = await import('node:url')
    const source = readFileSync(fileURLToPath(new NodeURL('../src/web/components/Sidebar.tsx', import.meta.url)), 'utf8')
    const at = source.indexOf('function ShortWarning')
    expect(at, 'nothing draws a workspace warning any more').toBeGreaterThan(-1)
    const body = source.slice(at, source.indexOf('\n}', at))
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const summary = code.slice(code.indexOf('<summary'), code.indexOf('</summary>'))
    expect(summary, 'the few words are not what is on screen').toContain('warning.short')
    expect(summary, 'the whole sentence is drawn where the few words belong').not.toContain('warning.said')
    expect(code, 'the sentence was thrown away rather than folded behind the words').toContain('warning.said')
    // CLOSED UNTIL SOMEBODY ASKS. `<details open>` would be the paragraph again.
    expect(code).not.toContain('open')
  })
})
