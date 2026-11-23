// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE LIST: ONE ROW FOR EACH PAGE THE SHELL DRAWS BY ITS ROUTE NAME. Wave 13y, round 69.
 *
 * A line that adds a page adds one row here. src/web/App.tsx used to pick its page with one check of
 * the route name for each page, so every line that added a page edited the same function. It now
 * draws the row whose name is the address's route name.
 *
 * THE ROWS ARE IN THE ORDER App.tsx CHECKED THEM. Only one row is drawn at a time, so the order is
 * for reading, and a comment that says "above" still points at the row it meant.
 *
 * A PAGE THAT NEEDS MORE THAN ITS ROUTE NAME IS NOT HERE. App.tsx draws it in its own code, with the
 * reason beside the code, and names it in `PAGES_DRAWN_IN_THE_SHELL`.
 * A test deleted on 13 November 2026 held every route name to one of the two.
 *
 * THE TITLE IS NOT HERE EITHER. App.tsx reads a page's title from `pageTitle` in
 * components/Sidebar.tsx, which the rail draws from too, so the title and the rail row stay one
 * fact. No page is imported lazily and no page has a guard of its own, so a row has nothing else.
 */
import { Fragment, type ReactNode } from 'react'
import type { RecordKind } from '@shared/types.ts'
import type { WhatThePairingSays } from '@shared/pairing.ts'
import type { AttentionHome } from '../api.ts'
import type { WaitingReply } from './waiting.ts'
import type { WorkspaceSight } from './workspace.ts'
import type { WorkspacesReply } from '../../server/api/workspaces.ts'
import { incidentPath, notebookPath, toolsetPath, whoPath, type Route } from '../components/router.tsx'
import type { AsyncState } from '../components/ui.tsx'
import { HomePage } from '../pages/HomePage.tsx'
import { AllPagesPage } from '../pages/AllPagesPage.tsx'
import { PipelinePage } from '../pages/PipelinePage.tsx'
import { ProjectGraphPage } from '../pages/ProjectGraphPage.tsx'
import { QueriesPage } from '../pages/QueriesPage.tsx'
import { RecordPage } from '../pages/RecordPage.tsx'
import { RecordsPage } from '../pages/RecordsPage.tsx'
import { ResourcesPage } from '../pages/ResourcesPage.tsx'
import { PlanPage } from '../pages/PlanPage.tsx'
import { SessionsPage } from '../pages/SessionsPage.tsx'
import { InterruptedRunsPage } from '../pages/InterruptedRunsPage.tsx'
import { NeedsYouPage } from '../pages/NeedsYouPage.tsx'
import { ClaimsPage } from '../pages/ClaimsPage.tsx'
import { ProjectsPage } from '../pages/ProjectsPage.tsx'
import { SaidPage } from '../pages/SaidPage.tsx'
import { RecordQuestionsPage } from '../pages/RecordQuestionsPage.tsx'
import { MergeQueuePage } from '../pages/MergeQueuePage.tsx'
/**
 * The two planning surfaces are two pages, and they are told apart by what is missing from each.
 * `PlansPage` is writing and has no hours box anywhere; `PlanPage` above is the schedule and has no
 * writing box anywhere.
 */
import { PlansPage } from '../pages/plans/PlansPage.tsx'
import { OnePlanPage } from '../pages/plans/OnePlanPage.tsx'
import { GovernancePage } from '../pages/GovernancePage.tsx'
// WHAT HAS DELIBERATELY BEEN LEFT UNRESOLVED, AND WHAT RAN INSTEAD. Step 10 of an earlier piece of
// work, which was the one step of twelve that shipped without a screen.
import { PlaceholdersPage } from '../pages/PlaceholdersPage.tsx'
import { BundlePanel } from '../components/BundlePanel.tsx'
// THE PACKAGED TASKS, criterion F16 point 2: every task somebody has written up for somebody else.
import { TasksToTakePage } from '../pages/TasksToTakePage.tsx'
// THE DIRECTIONS SOMEBODY STOPPED AND KEPT, criterion S2. A rail page of its own.
import { ShelvedPage } from '../pages/ShelvedPage.tsx'
import { CountersPage } from '../pages/CountersPage.tsx'
// THE WORDS A SECRETARY WROTE DOWN FOR THE PERSON TO CONFIRM, look A (wave 13q round 45).
import { YourWordsPage } from '../pages/YourWordsPage.tsx'
import { MyNotesPage } from '../pages/MyNotesPage.tsx'
import { ChecklistsPage } from '../pages/ChecklistsPage.tsx'
import { FlowsPage } from '../pages/FlowsPage.tsx'
import { HandbookPage } from '../pages/HandbookPage.tsx'
import { ReadinessPage } from '../pages/ReadinessPage.tsx'
import { SigningPackagesPage } from '../pages/SigningPackagesPage.tsx'
import { HonourBoardPage } from '../pages/HonourBoardPage.tsx'
import { ProjectBoardPage } from '../pages/ProjectBoardPage.tsx'
import { DepartmentsPage } from '../pages/DepartmentsPage.tsx'
import { GatesPage } from '../pages/GatesPage.tsx'
import { OfficeControlsPage } from '../pages/OfficeControlsPage.tsx'
import { SidebarArrangementPage } from '../pages/SidebarArrangementPage.tsx'
// THE GOALS AT EACH HORIZON, THE CLUSTERS SERVING THEM AND THE PARTS UNDER EACH. Criterion P5.
import { HorizonsPage } from '../pages/HorizonsPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
// PAIR THIS BROWSER, criterion P83 point 2. The shell opens it on a first visit from the office's
// own computer and the rail stays beside it, so being offered the page never walls the office off.
import { PairingPage } from '../pages/PairingPage.tsx'
import { AgentsPage } from '../pages/AgentsPage.tsx'
import { MessagesPage } from '../pages/MessagesPage.tsx'
import { ChatPage } from '../pages/ChatPage.tsx'
// ONE MESSAGE'S OWN PAGE, `#/message/<id>`. Criterion E2: a press on a message opens this page.
import { MessagePage } from '../pages/MessagePage.tsx'
// ONE PROBLEM'S OWN PAGE, `#/problem/<id>`. Criterion E2: a press on a problem opens this page.
import { ProblemPage } from '../pages/ProblemPage.tsx'
// ONE AGENT RUN'S OWN PAGE, `#/session/<id>`. Criterion E2: a press on an agent run opens this page.
import { SessionPage } from '../pages/SessionPage.tsx'
import { WorkingPage } from '../pages/WorkingPage.tsx'
import { RuntimePage } from '../pages/RuntimePage.tsx'
import { WorldsPage } from '../pages/WorldsPage.tsx'
import { TerminalsPage } from '../pages/TerminalsPage.tsx'
import { WorldHerePage } from '../pages/WorldHerePage.tsx'
import { ProfilePage } from '../pages/ProfilePage.tsx'
import { NotebookPage } from '../pages/NotebookPage.tsx'
import { EmbassyPage } from '../pages/EmbassyPage.tsx'
import { CredentialPage } from '../pages/CredentialPage.tsx'
import { PluginPage } from '../pages/PluginPage.tsx'
import { SetUpAToolPage } from '../pages/SetUpAToolPage.tsx'
import { FilePage } from '../pages/FilePage.tsx'
import { RolesPage } from '../pages/RolesPage.tsx'
import { CastingPage } from '../pages/CastingPage.tsx'
import { RoleCensusPage } from '../pages/RoleCensusPage.tsx'
import { IncidentPage } from '../pages/IncidentPage.tsx'
import { RegulationsPage } from '../pages/RegulationsPage.tsx'
import { ToolsetPage } from '../pages/ToolsetPage.tsx'
import { RoleCardNewPage } from '../pages/RoleCardNewPage.tsx'
import { UsagePage } from '../pages/UsagePage.tsx'
import { VersionHistoryPage } from '../pages/VersionHistoryPage.tsx'
import { KnowledgePage } from '../pages/KnowledgePage.tsx'
import { FolderReadingPage } from '../pages/FolderReadingPage.tsx'

/**
 * WHAT THE SHELL HANDS A PAGE: its own readings, which the rail draws from as well.
 *
 * The shell reads each of these once, so a page and the rail beside it draw one answer and not two.
 * App.tsx says why each one is read there.
 */
export interface TheShellsReadings {
  /** The project on screen and the list of projects, which All pages' project block draws as the sidebar's did. */
  readonly sight: WorkspaceSight
  readonly workspaces: AsyncState<WorkspacesReply>
  readonly waiting: AsyncState<WaitingReply>
  readonly readWaitingAgain: () => void
  readonly attention: AsyncState<AttentionHome>
  readonly readAttentionAgain: () => void
  readonly readWordsAgain: () => void
  /** How many notes of the person's words wait, in every project, which their row on All pages counts. */
  readonly wordsWaiting: AsyncState<{ total: number }>
  /** The pairing read as the pairing page sees it: still being read until the shell has asked. */
  readonly pairing: AsyncState<WhatThePairingSays>
  readonly readPairingAgain: () => void
  /** The record page says which kind of record it opened, so the rail can mark the row it belongs to. */
  readonly tellRecordOnScreen: (id: string, kind: RecordKind) => void
}

/** The route of one route name, so a row reads that route's own parts and no other's. */
type RouteNamed<N extends Route['name']> = Extract<Route, { name: N }>

/** One page: the route name it answers, and how it is drawn from that route and the shell's readings. */
export interface PageRow<N extends Route['name']> {
  readonly name: N
  readonly draw: (route: RouteNamed<N>, shell: TheShellsReadings) => ReactNode
}

/** A row of any route name. */
export type AnyPageRow = { [N in Route['name']]: PageRow<N> }[Route['name']]

function page<N extends Route['name']>(name: N, draw: PageRow<N>['draw']): PageRow<N> {
  return { name, draw }
}

/** Every page the shell draws by its route name alone, in the order App.tsx checked them. */
export const PAGE_LIST: readonly AnyPageRow[] = [
  // THE ONE NUMBER GOES DOWN TO THE PAGE, so that Home's band and the rail's badge are the same
  // number and not two readings that happen to agree.
  page('home', (_route, shell) => (
    <HomePage
      waiting={shell.waiting}
      onWaitingChanged={shell.readWaitingAgain}
      attention={shell.attention}
      onAttentionChanged={shell.readAttentionAgain}
    />
  )),
  page('records', () => <RecordsPage />),
  // The same page, locked to one kind. Modules is a place a person navigates to; that a module is
  // stored as a record is not something navigation should leak.
  page('modules', () => <RecordsPage only="module" />),
  // A family as a place. The sidebar used to print each family as a heading with its record kinds
  // listed under it in grey — a schema where navigation should be — and the headings went nowhere.
  page('family', (route) => <RecordsPage key={route.family} family={route.family} />),
  // THE SAME ONE READING AGAIN. A report body may say "Nineteen things are waiting on you"; the
  // record page draws the live count beside it and says so when the two disagree, and that number
  // has to be the rail's number rather than a second fetch of it.
  page('record', (route, shell) => (
    <RecordPage
      key={route.id}
      id={route.id}
      waiting={shell.waiting}
      tellRecordOnScreen={(kind) => shell.tellRecordOnScreen(route.id, kind)}
      {...(route.section === undefined ? {} : { section: route.section })}
    />
  )),
  // ONE MESSAGE'S OWN PAGE, `#/message/<id>`. Criterion E2: a press on a message opens this page. Keyed on the
  // address so moving from one message to another starts the page again rather than drawing one
  // message's words under another one's title.
  page('message', (route) => <MessagePage key={route.id} id={route.id} />),
  // ONE PROBLEM'S OWN PAGE, `#/problem/<id>`. Criterion E2: a press on a problem opens this page.
  // Keyed on the address so moving from one problem to another starts the page again rather than
  // drawing one problem's words under another one's title. The `/edit` word is read inside the page
  // from the route, the way the record page reads its own.
  page('problem', (route) => <ProblemPage key={route.id} id={route.id} />),
  // ONE AGENT RUN'S OWN PAGE, `#/session/<id>`. Criterion E2: a press on an agent run opens this page. Keyed on the
  // address so moving from one run to another starts the page again rather than drawing one run's
  // words under another one's title.
  page('session', (route) => <SessionPage key={route.id} id={route.id} />),
  // ONE HANDBOOK'S OWN PAGE, `#/handbook/<id>`. Keyed on the address for the reason the run's row gives.
  page('handbook', (route) => <HandbookPage key={route.id} id={route.id} />),
  // The id is spread rather than passed as `id={...}` because `exactOptionalPropertyTypes` is on:
  // `id={undefined}` is not the same as leaving it off. No id and no drawing is the list of
  // pipelines; `drawing` is the drawing of every module; an id is that pipeline's drawing.
  page('pipeline', (route) => (
    <PipelinePage {...(route.id === undefined ? {} : { id: route.id })} {...(route.drawing === true ? { drawing: true } : {})} />
  )),
  // THE PROJECT GRAPH, wave 13s round 241. One graph of the whole project, reached from a module's Evolution block.
  page('projectgraph', () => <ProjectGraphPage />),
  page('sessions', () => <SessionsPage />),
  page('interrupted', () => <InterruptedRunsPage />),
  page('mergequeue', () => <MergeQueuePage />),
  // WHAT HOME DREW AND NOW OPENS WITH ONE PRESS (wave 13w round 21). The waiting list and the
  // attention reading are the frame's own, the ones Home reads.
  page('needsyou', (_route, shell) => <NeedsYouPage waiting={shell.waiting} onWaitingChanged={shell.readWaitingAgain} />),
  page('claims', () => <ClaimsPage />),
  page('projects', (_route, shell) => <ProjectsPage waiting={shell.waiting} attention={shell.attention} />),
  page('said', () => <SaidPage />),
  page('recordquestions', (_route, shell) => (
    <RecordQuestionsPage attention={shell.attention} onAttentionChanged={shell.readAttentionAgain} />
  )),
  // Spread for the same `exactOptionalPropertyTypes` reason the pipeline gives above: no period in
  // the address means "this week", which the page works out itself.
  page('plan', (route) => (
    <PlanPage
      {...(route.period === undefined ? {} : { period: route.period })}
      {...(route.today === undefined ? {} : { today: route.today })}
    />
  )),
  // WRITING, NOT HOURS. Nothing on either of these two pages asks for an hour.
  page('plans', () => <PlansPage />),
  // THE GOALS, THE CLUSTERS AND THEIR PARTS, criterion P5. It reads the plan from the goals down,
  // which is the one reading neither the schedule nor the plans page makes.
  page('horizons', () => <HorizonsPage />),
  // The id is keyed so that moving from one plan to another starts the page again rather than
  // showing the previous plan's document under the new plan's name. The edit flag is spread for the
  // `exactOptionalPropertyTypes` reason the pipeline gives above: leaving it off means reading,
  // which is what every fresh visit gets.
  page('onePlan', (route) => <OnePlanPage key={route.id} id={route.id} {...(route.edit === undefined ? {} : { edit: true })} />),
  page('governance', (_route, shell) => <GovernancePage waiting={shell.waiting} onWaitingChanged={shell.readWaitingAgain} />),
  // What was said to an agent about this project's work, and what came back.
  page('placeholders', () => <PlaceholdersPage />),
  // What would leave this building, read before it leaves.
  page('bundles', () => <BundlePanel />),
  // THE PACKAGED TASKS, criterion F16 point 2, right after the bundles they are built from.
  page('tasksToTake', () => <TasksToTakePage />),
  // THE DIRECTIONS SOMEBODY STOPPED AND KEPT, criterion S2. Newest shelved first.
  page('shelved', () => <ShelvedPage />),
  // THE COUNTERS OF THIS PROJECT, criterion CT8. The id is spread for the
  // `exactOptionalPropertyTypes` reason the pipeline gives above: no id in the address means the
  // list, and an id means one counter is open.
  page('counters', (route) => <CountersPage {...(route.id === undefined ? {} : { id: route.id })} />),
  page('yourWords', (_route, shell) => <YourWordsPage onChanged={shell.readWordsAgain} />),
  // MY NOTES: every quick note of every project, searched and counted by the office, under the week it was started in.
  page('myNotes', () => <MyNotesPage />),
  page('knowledge', (route) => <KnowledgePage route={route} />),
  // WHO HOLDS THE MACHINE'S SHARED RESOURCES, and who is booked next. Designed in wave 13s round 28, built in round 30.
  page('resources', () => <ResourcesPage />),
  // EVERYBODY'S CHECKLISTS, in one project or every project; with an id, one checklist opened.
  page('checklists', (route) => <ChecklistsPage {...(route.id === undefined ? {} : { id: route.id })} />),
  // THE FLOWS PAGE, under All projects; with an id, one flow.
  page('flows', (route) => (
    <FlowsPage {...(route.id === undefined ? {} : { id: route.id })} {...(route.edit === true ? { edit: true } : {})} {...(route.isNew === true ? { isNew: true } : {})} />
  )),
  // THE READINESS CHECKLISTS: what waits for a signature, and every checklist; with an id, one opened.
  page('readiness', (route) => <ReadinessPage {...(route.id === undefined ? {} : { id: route.id })} />),
  page('signingPackages', (route) => <SigningPackagesPage {...(route.id === undefined ? {} : { id: route.id })} />),
  // THE HONOUR BOARD: the project's exemplary runs, the noted ones folded, and the weekly table.
  page('honourBoard', () => <HonourBoardPage />),
  page('board', () => <ProjectBoardPage />),
  // THE DEPARTMENTS: the tree with each department's level word; with an id, one department and its history.
  page('departments', (route) => <DepartmentsPage {...(route.id === undefined ? {} : { id: route.id })} />),
  // THREE PAGES THAT WERE PANELS ON SETTINGS until wave 13y round 125: Gates, Office controls, and the sidebar's
  // arrangement, which has no row and is reached from Settings' Looks. Gates and the arrangement open as a reading,
  // and `/edit` is their editing face.
  page('gates', (route) => <GatesPage {...(route.edit === true ? { edit: true } : {})} />),
  page('officeControls', () => <OfficeControlsPage />),
  page('sidebarArrangement', (route) => <SidebarArrangementPage {...(route.edit === true ? { edit: true } : {})} />),
  page('allPages', (_route, shell) => (
    <AllPagesPage sight={shell.sight} counts={{ attention: shell.attention, waiting: shell.waiting, wordsWaiting: shell.wordsWaiting }} />
  )),
  page('agents', () => <AgentsPage />),
  page('messages', () => <MessagesPage />),
  // THE CHAT AS A PAGE, plan row C1: the same chat as the corner, which is not drawn here.
  page('chat', () => <ChatPage />),
  // WHO IS WORKING ON WHAT, right now. The present tense of the three rows around it: runs is
  // history, conversations is what was said, and this is who is on it now.
  page('working', () => <WorkingPage />),
  page('runtime', () => <RuntimePage />),
  page('worlds', () => <WorldsPage />),
  page('terminals', () => <TerminalsPage />),
  // THE WORLD THE READER IS STANDING IN, criterion C33. Entering a world opens here.
  page('worldhere', () => <WorldHerePage />),
  // WHO LIVES IN THOSE WORLDS, criterion M52. The criterion puts it under World, so it is reached
  // from the Worlds page rather than from the rail.
  // THE SAME ONE READING, for the agents at the door, so an agent that registered itself is drawn here (wave 13q round 8).
  page('embassy', (_route, shell) => <EmbassyPage waiting={shell.waiting} onWaitingChanged={shell.readWaitingAgain} />),
  // ONE VISITING AGENT'S CREDENTIAL, criteria P24 to P29. Reached from the Embassy.
  page('visitor', (route) => <CredentialPage id={route.id} />),
  // ONE PAGE OF A SWITCHED-ON PLUGIN, in a frame that holds no key. Wave 13x round 15, plugins step 3.
  page('plugin', (route) => <PluginPage id={route.id} slug={route.slug} />),
  // ONE AGENT TOOL'S KEY PAGE, wave 13u round 242. Keyed by its address, so a key typed on one way's page is gone when
  // the person moves to another's.
  page('setUpATool', (route) => <SetUpAToolPage key={`${route.tool}/${route.way}`} tool={route.tool} way={route.way} />),
  // ONE FILE A RECORD NAMES, DRAWN AS ITS WORDS, reached from a report's file block. Keyed by the file, so moving
  // from one file to another starts the page again.
  page('file', (route) => <FilePage key={`${route.record}/${route.path}`} record={route.record} path={route.path} />),
  // WHAT EACH OF THEM MAY DO, criterion P44. The criterion puts its way in under the Embassy,
  // so the row sits under the Embassy in the foot of the rail and the page opens from there.
  page('roles', () => <RolesPage />),
  page('casting', () => <CastingPage />),
  // A CARD OF THE PERSON'S OWN, BEING FILLED IN, criterion P51. Reached by pressing the add block at
  // the end of the Role cards page, because criterion P50 has a card filled in only after
  // pressing into it.
  page('roleNew', () => <RoleCardNewPage />),
  // WHO HOLDS EACH CARD, criterion P72. Reached by opening the fold on a card at the Role cards
  // page, because criterion P72 has this count open only when pressed.
  page('roleCensus', () => <RoleCensusPage />),
  // ONE INCIDENT, READ AS A SCENE, criterion I3. Reached from the incident record's head, the way a
  // pipeline's drawing is. Keyed on the address so moving from one incident to another starts the
  // page again rather than drawing one scene under another incident's name.
  page('incident', (route) => <IncidentPage key={incidentPath(route.id)} id={route.id} />),
  // THE OFFICE REGULATIONS, criterion G5. Reached from the rail row beside the Role cards — the
  // cards say what a role keeps, this says what the office itself keeps.
  page('regulations', () => <RegulationsPage />),
  // THE TOOLSET CATALOGUE, piece P3. The list, or one tool's manual page when the address carries a
  // slug. Keyed on the address so moving from one manual page to another starts the page again
  // rather than drawing one tool's items under another tool's name.
  page('toolset', (route) => <ToolsetPage key={toolsetPath(route.slug)} {...(route.slug === undefined ? {} : { slug: route.slug })} />),
  // ONE PARTICIPANT'S OWN PAGE, criterion M51. Keyed on both halves of the address so moving from
  // one profile to another starts the page again rather than drawing the previous participant's
  // facts under the new one's name.
  page('who', (route) => (
    <ProfilePage key={whoPath(route.kind, route.id)} kind={route.kind} id={route.id} browser={route.browser ?? null} />
  )),
  // ONE SECRETARY'S NOTEBOOK, criteria N1 to N4. Reached from that agent's own page, because the
  // owner asked for it to sit under one secretary agent's name. Keyed on the address for the reason
  // the citizen page above is: moving from one notebook to another starts the page again rather
  // than drawing one agent's entries under another agent's name.
  page('notebook', (route) => <NotebookPage key={notebookPath(route.kind, route.id)} kind={route.kind} id={route.id} />),
  // How those agents read the project: what they asked for, and what they went outside Mole Office
  // to find because they could not ask for it here.
  page('usage', () => <UsagePage />),
  page('versionHistory', () => <VersionHistoryPage />),
  page('folderreading', () => <FolderReadingPage />),
  page('queries', () => <QueriesPage />),
  // How this browser draws Mole Office. It is a page rather than a fold in the sidebar, so that the
  // sidebar can answer "where can I go" and nothing else.
  page('settings', () => <SettingsPage />),
  // PAIR THIS BROWSER, criterion P83 point 2. The shell's own read is handed down so the page and
  // the first-visit offer are one answer, and a press re-reads it in place.
  page('pairing', (_route, shell) => <PairingPage said={shell.pairing} onPaired={shell.readPairingAgain} />),
]

/**
 * The rows by route name. Two rows for one route name are refused here, when the module loads, so
 * a page added twice stops the office loudly instead of drawing whichever row came first.
 */
export function pagesByName(rows: readonly AnyPageRow[]): ReadonlyMap<Route['name'], AnyPageRow> {
  const byName = new Map<Route['name'], AnyPageRow>()
  for (const row of rows) {
    if (byName.has(row.name)) {
      throw new Error(`The page list has two rows for the route name "${row.name}". One route name opens one page, so remove one of the two rows.`)
    }
    byName.set(row.name, row)
  }
  return byName
}

const PAGES = pagesByName(PAGE_LIST)

/**
 * The page this route opens, drawn from the shell's readings, or null when the list has no row
 * for its name: App.tsx draws those pages in its own code.
 *
 * KEYED BY THE ROUTE NAME, because App.tsx gave each page a place of its own and React started a
 * page again whenever the route name changed. Three route names draw `RecordsPage`, and without the
 * key, moving between them would keep one page's state under another page's address. The fault
 * boundary around the page in App.tsx is keyed by the whole address and starts the page again as
 * well; this key does not depend on it.
 */
export function thePageFromTheList(route: Route, shell: TheShellsReadings): ReactNode {
  const row = PAGES.get(route.name)
  if (row === undefined) return null
  // The row was found by this route's own name, so it is the row for this route's shape. TypeScript
  // cannot follow a name looked up in a map, so it is told here, once.
  const draw = row.draw as (route: Route, shell: TheShellsReadings) => ReactNode
  return <Fragment key={route.name}>{draw(route, shell)}</Fragment>
}
