// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, message jQp5CV6A3RsB): Home and the first-run guide in a named office join
// the not-yet list.
// Since HD-2d, Home draws on arrival the one plain choice of project of src/web/components/ProjectChoice.tsx. In an
// office with a named owner, #/welcome opens Home. This turns two cases around: "draws no box and no dropdown on home"
// and "draws no box and no dropdown on the first-run guide in a named office". Before, Home was held to draw no
// control, and so was #/welcome.
// Criterion change (wave 13y round 125, item 62, message ypSj7D2-j2bA): Settings
// joins the not-yet list.
// Layout A was chosen, in which every panel of the chosen category is open with no fold,
// so the page draws its panels' boxes on arrival. Before, Settings was held to draw no control, because every panel
// was folded to its title. Three pages that were Settings panels join the walk. The gates, `#/gates`, and the sidebar's
// arrangement, `#/sidebar-arrangement`, open as a reading and must draw no control, and their `/edit` addresses must
// draw some. The office controls, `#/office-controls`, draw none in normal mode, which is how this walk opens a page.
// Before, none of the three addresses was walked.
// Criterion change (wave 13p round 36): the Flows page gains its editor. One
// flow becomes editable: `#/flows/<id>` must still draw no control, and `#/flows/<id>/edit` must now draw some. A new
// flow, `#/flows/new`, joins the walk and the not-yet list, because it is a form, as a new role card is. Before, one flow
// was walked only as a reading and `#/flows/new` was not walked.
// Criterion change (wave 13p round 35): the Flows page joins the walk with
// two addresses, `#/flows` and `#/flows/<id>`.
// One flow keeps the rule. The list draws its search box on arrival, as the
// chosen proposal shows it (report 4mwraeIStEe8, block "page"), so 'the flows' joins the not-yet list with that
// reason. Before, neither address was walked.
// Criterion change (wave 13j round 14): the counters page draws its project control on arrival,
// so it joins the not-yet list with that reason. It was held to draw no control.
// Criterion change (wave 13q round 45b): the router declares yourWords, so the
// list gains #/your-words and the reading rule is checked there.
// Merge entry 78DeD5PpUkPf bounced without it.
// Criterion change (wave 13x round 15b, block 3nJsBlPlYhcl): the router declares plugin, so the list gains one
// switched-on plugin's page, #/plugin/<id>/<page>, and the reading rule is checked there, on a page that draws its
// frame. Merge entry 1BbgqlZzpzwM bounced without it. Before, no plugin's page was walked.
/**
 * NOTHING ON A PAGE YOU ARE READING CAN BE TYPED INTO OR CHOSEN FROM.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS PINS, AND WHY IT NEEDS A TEST OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Every page in Mole Office opens as reading. Three of them can also be edited — the schedule, one plan
 * and one record — and which of the two you are in is the last word of the address: `#/plan/edit`,
 * `#/plans/<id>/edit`, `#/r/<id>/edit`. While the address does not say `edit`, the page draws no
 * input, no select and no textarea, anywhere. If you can see a box or a dropdown, you pressed Edit.
 *
 * A press is still allowed while reading, because a press records one fact and says what it
 * recorded; what is forbidden is a control that holds a half-finished change and can be typed into
 * by a stray keystroke.
 *
 * THE RULE HAS EXACTLY ONE EXCEPTION AND IT IS NAMED, NOT DISCOVERED: a plan document. A plan is
 * always writable and has no Edit button at all, because the words in it are yours and the page
 * exists so you can type them. `design/UX-ROUND-THREE.md` section 2 settles it and
 * `design/PLANNING-WORKSPACE.md` section 1 is where the behaviour is written down.
 *
 * THE EXCEPTION IS CARRIED HERE AS A LIST OF ONE: `ALWAYS_WRITABLE` below names the page, and it
 * must actually draw a box on both of its addresses. An exemption nothing enforces is how a rule
 * becomes a suggestion.
 *
 * WHY A PAGE WITH AN EDIT FORM IS WALKED TWICE. The rule is about a page you are reading and the
 * same page being edited, so every address that has an edit form is visited both ways: once as it
 * stands, where it must draw no controls, and once with `/edit` on the end, where it must draw some.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Rendering these pages to markup in the test runner would prove nothing. Every one of them opens
 * in its loading state with no data, and a page drawing a skeleton draws no fields either — so the
 * whole suite would pass with the fix reverted. What has to be measured is a page that has its
 * answer and has drawn it, which is a browser with a server behind it.
 *
 * WHAT IS COUNTED: form controls the browser actually renders, inside the page region. Two
 * deliberate exclusions, both stated rather than assumed.
 *
 *   The rail is not the page. "Acting as", the detail switch and the appearance controls are
 *   product settings and live in the frame, which every page shares. The rule is about the page a
 *   person opened.
 *
 *   A control inside a closed fold is not on the screen. Several surfaces put a form behind a
 *   press — "Decide it" on Home is a closed `details` holding the decide form — and the rule's own
 *   words are that a box you can see means you pressed something. So this counts what the browser
 *   says is visible, which is what a reader can see and what a screen reader reaches.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF THAT STOPS IT PASSING FOR THE WRONG REASON
 * ---------------------------------------------------------------------------------------
 *
 * A page that failed to load draws nothing, and nothing has no fields in it. So every reading page
 * is required to have DRAWN SOMETHING FIRST, and each of the three editable addresses is required
 * to draw controls once `/edit` is on it. Without that second half this file would go green if the
 * server never answered, which is the failure mode this repository has already been bitten by.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { periodKey } from '../src/shared/planning.ts'
import { KIND_FAMILIES } from '../src/shared/work.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { settingsPath } from '../src/shared/addresses.ts'
import { PLUGIN_READ_INTERFACE } from '../src/shared/plugins.ts'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'

const { t } = createI18n('en')

// ---------------------------------------------------------------------------- the routes

/** Ids the seeding below fills in, so the address table can name a real record and a real plan. */
const seeded = { record: '', module: '', obligation: '', proposal: '', plan: '', agent: '', credential: '', incident: '', message: '', problem: '', session: '', flow: '', handbook: '' }

/** Which period the schedule opens on when the address carries none: this week, this browser's. */
const THIS_WEEK = periodKey('week', new Date())
const THIS_MONTH = periodKey('month', new Date())
const THIS_DAY = periodKey('day', new Date())

/**
 * A MADE-UP PLUGIN, switched on, so `#/plugin/<id>/<page>` draws a plugin's page and its frame rather than the sentence
 * saying why there is none. It is written to a scratch folder this file makes and names to its office with
 * MOLE_OFFICE_PLUGINS, as tests/a-plugin-page-is-drawn-in-a-frame-that-holds-no-key.test.ts does, so nothing is
 * written into the checkout's plugins/ folder. Its names say it is made up.
 */
const A_PLUGIN = { id: 'made-up-reading', slug: 'main' }
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']
let scratch = ''

function putThePlugin(): string {
  scratch = mkdtempSync(join(tmpdir(), 'read-before-edit-'))
  const folder = join(scratch, 'plugins', A_PLUGIN.id)
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true })
  writeFileSync(
    join(folder, 'plugin.json'),
    JSON.stringify({
      id: A_PLUGIN.id,
      name: { en: 'Made-up reading plugin' },
      version: '0.1.0',
      interface: PLUGIN_READ_INTERFACE,
      pages: [{ slug: A_PLUGIN.slug, title: { en: 'A made-up page for the reading check' } }],
      reads: ['projects'],
      budget: { builtKilobytes: 20 },
    }),
  )
  writeFileSync(
    join(folder, 'dist', `${A_PLUGIN.slug}.html`),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Made-up</title>' +
      '<script type="module" src="assets/app.js"></script></head><body><p>A made-up plugin page.</p></body></html>',
  )
  writeFileSync(
    join(folder, 'dist', 'assets', 'app.js'),
    `window.parent.postMessage({ interface: ${JSON.stringify(PLUGIN_READ_INTERFACE)}, ask: 'ready' }, '*')\n`,
  )
  return join(scratch, 'plugins')
}

/**
 * One address per route, plus the extra addresses of a route that is worth visiting more than once.
 *
 * `editable` names the three routes that take a trailing `/edit`. Every address in that list is
 * visited twice: once as it stands, where it must draw no controls, and once with `/edit` on the
 * end, where it must draw some.
 */
interface Visit {
  /** The route this address exercises, as the router's union names it. */
  route: string
  /** What to call it in a failure message. */
  name: string
  /**
   * The address, worked out when the test runs rather than when it is collected.
   *
   * The record and plan ids do not exist until `beforeAll` has seeded them, and a describe block
   * runs first — so an address built at collection time would name `#/r/` and every visit would be
   * the not-found page quietly passing.
   */
  address: () => string
  /** True when this address also has an editing form. */
  editable?: true
}

/**
 * THE ONE PAGE IN PANELX YOU CAN TYPE IN WITHOUT PRESSING ANYTHING FIRST, keyed by route name.
 *
 * It is a list of one, keyed by route name. The page it names has to draw a box on BOTH of its
 * addresses — with the exemption and without it — or this file says the exception is stale and
 * should be deleted.
 */
const ALWAYS_WRITABLE: Readonly<Record<string, string>> = {
  onePlan:
    'a plan is the one authoring surface in the product: the words in it are yours, there is no Edit ' +
    'button, and #/plans/<id>/edit lands on the same always-writable page',
}

// Home's reason, written once: both its entries in `NOT_YET` below use it, Home's own and the one for #/welcome.
const HOMES_REASON =
  'the one plain choice of project of src/web/components/ProjectChoice.tsx is drawn on arrival on Home. Home reads ' +
  'across projects and keeps one plain choice to show a single project, as HD-2d asks ("for every project or one"). ' +
  'It narrows what is shown, like the kind menu on Everything. It writes only when a project is chosen, as the field ' +
  'to add an item on the checklists writes only when Enter is pressed: the choice is kept in the person\'s own Home ' +
  'layout, with one line in the change log, as a moved part is. It files no record'

/**
 * THE SURFACES THAT DO NOT KEEP THIS RULE YET, each with the reason and who owns it.
 *
 * The rule is the product's. The pass that wrote this test applied it to four surfaces — the
 * schedule at every period, the plans page, one plan and the record page — and the pages listed
 * here were out of its scope. Naming them is invariant 3: an unfinished part says so, in the place
 * it appears, rather than being quietly skipped by a test that then claims the product keeps a rule
 * it does not.
 *
 * THE LIST IS CHECKED BOTH WAYS. A page named here must STILL draw at least one control while it is
 * being read. So on the day somebody moves the records list's filters behind a press, this test
 * fails and tells them to delete the line — an exemption cannot outlive the breach it excuses.
 *
 * SOME ARE NOT BREACHES AND WILL NOT BE FIXED, and saying "not yet" about them is this list being
 * loose with a word. The rule is about a page whose CONTENT you came to read offering to edit it
 * before you asked. The component sheet has no such content: its content IS the controls. Settings
 * left this list once its panels folded (problem H8wx926s7QBh), and came back to it in wave 13y round 125, when the
 * owner chose layout A, with every panel of the chosen category open.
 */
const NOT_YET: Readonly<Record<string, string>> = {
  'the chat page':
    'the contacts filter in src/web/components/Chat.tsx is drawn on arrival on #/chat (plan row C1), the ' +
    'same box the corner panel draws. It narrows the list and writes nothing, like the search box on ' +
    'Everything below',
  everything:
    'the kind menu and the search box on src/web/pages/RecordsPage.tsx are drawn while the list is being read',
  'agent conversations':
    'the search field over the list of work on src/web/pages/AgentsPage.tsx is drawn on arrival, as the ' +
    'owner approved the page. It narrows the list and writes ' +
    'nothing, like the search box on Everything. Not a breach, and not to be fixed',
  'component sheet':
    'src/web/components/ui.tsx draws every control in the library on purpose — it is the gallery of them',
  'a new role card':
    'src/web/pages/RoleCardNewPage.tsx is the card being filled in, criterion P51. Its content IS the ' +
    'form: the page is reached by pressing the add block on #/roles, which is the press, and there is ' +
    'nothing on it to read before you asked. The third of the three that is not a breach',
  'the counters':
    'the one project control on src/web/pages/CountersPage.tsx is drawn on arrival: the page reads across ' +
    'projects and keeps one plain choice to show a single project, as the owner decided on 29 September ' +
    '2026. It narrows the list and writes nothing, like the kind menu on Everything',
  home: HOMES_REASON,
  'the first-run guide in a named office':
    '#/welcome opens Home in an office with a named owner, and ' + HOMES_REASON,
  'context bundles':
    'criterion B33 of design/bundle/ACCEPTANCE.md, from the owner\'s words of 8 September 2026: 去掉 choose a ' +
    'reading，直接显示点击后的内容. The making section is drawn on arrival — the subject radios, the ' +
    'preset menu and the level presses — so the page opens on the controls that make a copy rather than ' +
    'on a press that opens them. Drawing them writes nothing and asks the server for nothing, and it is ' +
    'a product decision this file records rather than a breach nobody noticed. Since the owner\'s ' +
    'decision of 29 September 2026 the page also draws the one plain choice of project, the dropdown ' +
    'of src/web/components/ProjectChoice.tsx, and a project dropdown in its About row when Every project ' +
    'is chosen. Both choose what is read and write nothing',
  'the checklists':
    'src/web/pages/ChecklistsPage.tsx draws on arrival the one plain choice of project of ' +
    'src/web/components/ProjectChoice.tsx, which chooses what is read and writes nothing, like the kind ' +
    'menu on Everything, and under each checklist\'s card a field to add an item. Both are in design E ' +
    'of the checklists, as decided in wave 13y round 175. The field writes only when Enter is pressed in it',
  'the flows':
    'the search box on src/web/pages/FlowsPage.tsx is drawn on arrival, as in the proposal chosen ' +
    '(report 4mwraeIStEe8 block "page"). It narrows the list by title and writes ' +
    'nothing, like the search box on Everything',
  'a new flow':
    'src/web/pages/FlowEditor.tsx at #/flows/new is a new flow being filled in (wave 13p round 36). ' +
    'Like a new role card, its content IS the form: it is reached by pressing + New flow on ' +
    '#/flows, which is the press, and nothing on it is there to read before you asked',
  'the readiness checklists':
    'src/web/pages/ReadinessPage.tsx draws one dropdown on arrival: whose signature the first list is read for, ' +
    'the person or an agent a waiting checklist names. It was asked for by the round-13 brief of wave 13u, which ' +
    'says a person and an agent each see what waits for their signature. It chooses what is read and writes ' +
    'nothing, like the kind menu on Everything',
  'the goals and clusters':
    'the owner\'s decision of 29 September 2026: Goals reads across projects and keeps one plain choice ' +
    'of project, the dropdown of src/web/components/ProjectChoice.tsx, drawn on arrival. It chooses ' +
    'what is read and writes nothing, like the search box on Everything. Not a breach, and not to be fixed',
  settings:
    'src/web/pages/SettingsPage.tsx draws the chosen category with every panel open and no fold, which is layout A, ' +
    'the one chosen (wave 13y round 125, item 62). It reopened the folding of ' +
    'another decision for Settings only. So the boxes of the first category, You, are drawn on arrival. The ' +
    'pages that were Settings panels keep the rule: the gates and the sidebar\'s arrangement open as a reading',
}

function visits(): Visit[] {
  const rows: Visit[] = [
    // HOME, as HD-2d makes it. A reading: the key items, Needs you, Agents at work, the schedule and the figures, in
    // the layout its person kept, with each part's move menu behind a closed fold. Its one dropdown chooses the
    // project it reads, and it is in `NOT_YET` above with that reason.
    { route: 'home', name: 'home', address: () => '#/' },
    { route: 'records', name: 'everything', address: () => '#/records' },
    { route: 'modules', name: 'modules', address: () => '#/modules' },
    { route: 'pipeline', name: 'pipelines', address: () => '#/pipeline' },
    // Wave 13p round 30: the merge queue page. Its box for a reason opens only after a press.
    { route: 'mergequeue', name: 'merge queue', address: () => '#/merge-queue' },
    // A decision: what Home drew and now opens with one press. Each is a reading.
    { route: 'needsyou', name: 'needs you', address: () => '#/needs-you' },
    { route: 'claims', name: 'claims', address: () => '#/claims' },
    { route: 'projects', name: 'projects', address: () => '#/projects' },
    { route: 'said', name: 'what has been said', address: () => '#/said' },
    { route: 'recordquestions', name: 'questions about the records', address: () => '#/record-questions' },
    { route: 'sessions', name: 'sessions', address: () => '#/sessions' },
    { route: 'interrupted', name: 'interrupted runs', address: () => '#/interrupted' },
    { route: 'queries', name: 'missing and unused', address: () => '#/missing' },
    { route: 'governance', name: 'the governance queue', address: () => '#/governance' },
    { route: 'placeholders', name: 'placeholders', address: () => '#/placeholders' },
    /**
     * CONTEXT BUNDLES NO LONGER KEEPS THE RULE, AND THAT WAS DECIDED; IT IS NOT DRIFT.
     *
     * Criterion B33 of design/bundle/ACCEPTANCE.md: there is no "choose a reading" step, and what a
     * press opens is shown at once. The making section — the subject radios, the preset menu, Less
     * and More — is drawn on arrival, so the page opens on the controls that make a copy rather
     * than on a press that opens them. It is in `NOT_YET` below with the reason.
     */
    { route: 'bundles', name: 'context bundles', address: () => '#/bundles' },
    /**
     * TASKS TO TAKE KEEPS THE RULE, criterion F16 point 2. At rest it is a reading: the count in its
     * first line, a state chip and a handful of facts per row, and a link to each task's own page.
     * Nothing on it is typed into — taking a package is a form on another worker's piece, reached
     * from the task's own page, not from here.
     */
    { route: 'tasksToTake', name: 'tasks to take', address: () => '#/tasks-to-take' },
    { route: 'plans', name: 'plans', address: () => '#/plans' },
    /**
     * SETTINGS DRAWS ITS BOXES ON ARRIVAL, and that was decided. In layout A (wave 13y round 125) the chosen
     * category's panels are all open, with no fold, so the page a person lands on draws the boxes of its first
     * category. It is in `NOT_YET` above with the reason. The address is the one
     * settingsPath() builds with no panel named.
     */
    { route: 'settings', name: 'settings', address: () => `#${settingsPath()}` },
    /**
     * The gates and the sidebar arrangement open for reading. Each gate is edited on its own row;
     * the sidebar arrangement has a separate editing address.
     */
    { route: 'gates', name: 'the gates', address: () => '#/gates' },
    { route: 'sidebarArrangement', name: "the sidebar's arrangement", address: () => '#/sidebar-arrangement', editable: true },
    /**
     * THE OFFICE CONTROLS KEEP THE RULE in normal mode, which is how this walk opens every page: the page says its
     * controls are shown in developer mode, and draws the mode switch, which is a press for each mode. In developer
     * mode it draws two controls on arrival, the search box and the tick box over its list of settings. They narrow the
     * list and write nothing, like the search box on Everything. Each setting's own boxes are in its row, which opens
     * on a press, except a row whose saved value this release refuses: that row is open from the start, so its notice
     * is read.
     */
    { route: 'officeControls', name: 'the office controls', address: () => '#/office-controls' },
    /**
     * THE PAIRING PAGE KEEPS THE RULE, and it is the clearest case on this list: criterion P83
     * point 2 is that a browser is paired with ONE PRESS — no terminal, no typing — so a field on it
     * would contradict the criterion itself rather than merely this rule. It draws a heading, the
     * sentences saying what pairing is and what it is not, and the press. Checking it here is what
     * keeps the no-typing promise true after somebody edits the page.
     */
    { route: 'pairing', name: 'pairing this browser', address: () => '#/pairing' },
    /**
     * A FOLDER READING KEEPS THE RULE. At rest every piece is the agent's words, the files it read
     * and the quote it rests on, with two presses. The title box appears only after Edit.
     */
    { route: 'folderreading', name: 'a folder an agent read', address: () => '#/folder-reading' },
    /**
     * THE RESOURCES PAGE KEEPS THE RULE (wave 13s round 30). It draws who holds the GPU, the queue and the week's
     * use, and the owner's booking window, with its boxes, opens only after the press "Book the GPU for me".
     */
    { route: 'resources', name: 'resources', address: () => '#/resources' },
    /**
     * AGENT CONVERSATIONS DRAWS ONE BOX ON ARRIVAL: the search field over its list of work, which the
     * owner approved as drawn, report n9Mjk3c_sJRu block b-9.
     * It narrows the list and writes nothing, like the search box on Everything and the contacts
     * filter on the chat, so it is excused below with that reason. Everything you type TO an agent is
     * still behind a press: the composer opens from a conversation or a row.
     *
     * The review bar is not on this list's conscience either way: it is drawn outside #main, in the
     * frame, beside "Acting as" and the appearance controls, and this file counts the page.
     */
    { route: 'agents', name: 'agent conversations', address: () => '#/conversations' },
    /**
     * THE CATEGORY PAGES KEEP THE RULE, wave 13q's S2. Each is a heading and a list of cards, and
     * every card is a link. There is nothing on them to type into.
     */
    { route: 'agentsCategory', name: 'the Agents category page', address: () => '#/agents' },
    { route: 'officeCategory', name: 'the Office category page', address: () => '#/office' },
    { route: 'developerCategory', name: 'the Developer category page', address: () => '#/developer' },
    { route: 'projectCategory', name: 'the project category page', address: () => '#/project' },
    { route: 'chat', name: 'the chat page', address: () => '#/chat' },
    /**
     * EVERY MESSAGE IN THE PROJECT. It has five controls that narrow the list and nothing to type
     * a record into, so the reading rule is checked here the way it is on the other lists.
     */
    { route: 'messages', name: 'messages', address: () => '#/messages' },
    { route: 'usage', name: 'agent use', address: () => '#/agent-use' },
    /**
     * WHO IS WORKING KEEPS THE RULE, and there is nothing on it to type into at all. It is a
     * reading: two words per agent, the sentences behind them, and — on this corpus — a panel of
     * absences saying which kind of empty each thing is. Nothing on it writes.
     */
    { route: 'working', name: 'who is working', address: () => '#/working' },
    /**
     * WHAT IS RUNNING KEEPS THE RULE. It is a reading: four panels of facts about the process
     * answering, with one press on it — Read again — which asks the same question a second time and
     * writes nothing. There is no box to type in.
     */
    { route: 'runtime', name: 'what is running', address: () => '#/runtime' },
    /**
     * WORLDS KEEPS THE RULE. It is a reading — a list of worlds with the facts the office stores —
     * and its three presses each change what is drawn or where the page is talking to. Rename opens
     * a box when it is pressed, so nothing stands open on arrival; the control that shows the worlds
     * a test started is a button and not a tick box, because a tick box is a field.
     */
    { route: 'worlds', name: 'the worlds', address: () => '#/worlds' },
    /**
     * TERMINAL MANAGEMENT KEEPS THE RULE (wave 13u). It is a reading: the holder's state and one row per
     * terminal. Its filters are behind a press, as on the Messages page, and a terminal opens only when its
     * row is pressed, so nothing a person types into stands open on arrival.
     */
    { route: 'terminals', name: 'terminal management', address: () => '#/terminals' },
    /**
     * THE EMBASSY KEEPS THE RULE for the reason the worlds page does: it is a reading, and its one
     * press changes what is drawn rather than opening a field.
     */
    { route: 'embassy', name: 'the embassy', address: () => '#/embassy' },
    /**
     * THE WORLD'S OWN PAGE KEEPS THE RULE for the reason the two above do: it is a reading. Its
     * presses stop the world and open a screen; neither is a field. Criterion C33. At the office,
     * which is what this test drives, it draws the sentence saying this is not a copy — which is
     * still a drawing, and the rule is about controls rather than about what is drawn.
     */
    { route: 'worldhere', name: 'this world', address: () => '#/here' },
    /**
     * THE ROLE CARDS KEEP THE RULE for the same reason: the page is a list of what each role may do
     * and it has no field on it at all. Criterion P44: the page is entered from the Embassy.
     */
    { route: 'roles', name: 'the role cards', address: () => '#/roles' },
    // THE CASTING TABLE KEEPS THE RULE. A reading: each role's program, model,
    // effort and why, with where each came from. Its boxes appear only after a row's Change is pressed.
    { route: 'casting', name: 'the Casting table', address: () => '#/casting' },
    /**
     * A NEW ROLE CARD IS A FORM AND HAS NO CONTENT TO READ, criterion P51. It is in `NOT_YET` below
     * with the same reasoning Settings and the component sheet carry, and for the same reason: this
     * rule is about a page whose CONTENT you came to read offering to edit it before you asked.
     */
    { route: 'roleNew', name: 'a new role card', address: () => '#/roles/new' },
    // THE FIRST-RUN GUIDE. It is a form, like a new role card, but it is drawn
    // only in an office with no named owner. This test's office has one, so #/welcome opens Home here. It
    // draws Home's project choice, and it is in `NOT_YET` above with Home's reason.
    // Test change (wave 13s round 281): before, this said the address reads without offering to edit anything.
    { route: 'welcome', name: 'the first-run guide in a named office', address: () => '#/welcome' },
    // WHO HOLDS EACH CARD, criterion P72. A page of numbers and lists: nothing on it is typed into,
    // which is what this rule asks, and checking it here is what keeps that true.
    { route: 'roleCensus', name: 'who holds each card', address: () => '#/roles/who-holds-them' },
    // THE OFFICE REGULATIONS KEEP THE RULE, criterion G5. A reading: the person's regulations with
    // their revocation state, and the chapters with their rules, drawn from the records. Nothing on
    // it is typed into.
    { route: 'regulations', name: 'the office regulations', address: () => '#/regulations' },
    { route: 'versionHistory', name: 'the version history', address: () => '#/version-history' },
    // THE SHELVED PAGE KEEPS THE RULE, criterion S2. A reading: each shelved direction with its
    // words, the reason it was put down, what would restart it and the records it travels with, and
    // one press that restores it. Nothing on it is a box you type in.
    { route: 'shelved', name: 'the shelf', address: () => '#/shelved' },
    // THE HORIZONS PAGE, criterion P5. A reading: the four horizons, the goals at each, the clusters
    // serving them and the parts under each, with who is on a part and what was planned against what
    // happened. Nothing on it is typed into. Its one dropdown chooses the project it reads, and it is
    // in `NOT_YET` below with that reason.
    { route: 'horizons', name: 'the goals and clusters', address: () => '#/horizons' },
    // THE COUNTERS PAGE, criterion CT8. A reading: each counter's count, its triggers, what it does
    // and when it last fired, with each pause or resume form behind a closed fold. Its one dropdown
    // chooses the project it reads, and it is in `NOT_YET` above with that reason.
    { route: 'counters', name: 'the counters', address: () => '#/counters' },
    // THE TOOLSET PAGE KEEPS THE RULE, piece P3. A reading: each category with its tools, and a
    // filter of three presses. The one box to type in, the why of a confirmation, is drawn only
    // after the person presses "Confirm this category".
    { route: 'toolset', name: 'the toolset', address: () => '#/toolset' },
    // THE CHECKLISTS PAGE (wave 13n round 52, drawn as design E since wave 13y round 175). A reading: a
    // section for each person, with the reader's checklists open as cards. Its project choice and each
    // card's field to add an item are drawn on arrival, and it is in `NOT_YET` above with that reason.
    // Test change (wave 13y round 175): before, this said the page kept the rule with a table of
    // checklists, though the page was on that list for its two dropdowns.
    { route: 'checklists', name: 'the checklists', address: () => '#/checklists' },
    // THE WORDS FOR THE PERSON TO CONFIRM KEEP THE RULE, wave 13q round 45. A
    // reading: each waiting note's words as they were kept, with two presses per note and Confirm all.
    // Nothing on it is typed into; a press files the words or marks them, and says which.
    { route: 'yourWords', name: 'the words for the person to confirm', address: () => '#/your-words' },
    // THE FLOWS LIST (wave 13p round 35) draws its search box on arrival, and is in `NOT_YET` above with the reason.
    { route: 'flows', name: 'the flows', address: () => '#/flows' },
    // ONE FLOW KEEPS THE RULE. Its facts, stages and runs are read; its one fold opens on a press and holds no box.
    // Since round 36 it takes `/edit`: the flow editor, which must draw fields.
    { route: 'flows', name: 'one flow', address: () => `#/flows/${seeded.flow}`, editable: true },
    // A NEW FLOW IS A FORM, as a new role card is, and is in `NOT_YET` above with that reason.
    { route: 'flows', name: 'a new flow', address: () => '#/flows/new' },
    // THE READINESS CHECKLISTS KEEP THE RULE (wave 13u round 13). A reading: what waits for one signer and every
    // checklist. Its controls are presses, Sign, Take back and Cancel, on one opened checklist.
    { route: 'readiness', name: 'the readiness checklists', address: () => '#/readiness' },
    // Signing packages are read on arrival. Strike, Sign and Refuse are presses; nothing is typed.
    { route: 'signingPackages', name: 'the signing packages', address: () => '#/signing-packages' },
    // THE HONOUR BOARD KEEPS THE RULE (wave 13u round 15). A reading: the exemplary runs, the noted runs in a fold,
    // and the weekly table. Its controls are the fold and one press, Show more; nothing on it writes.
    { route: 'honourBoard', name: 'the honour board', address: () => '#/honour-board' },
    // THE PROJECT GRAPH KEEPS THE RULE (wave 13s round 241). A reading: the graph drawn from GET /api/project-graph.
    // Its controls are the four level presses; nothing on it is typed into.
    { route: 'projectgraph', name: 'the project graph', address: () => '#/project-graph' },
    /**
     * A VISITING AGENT'S CREDENTIAL KEEPS THE RULE. Criteria P24 to P29. Its two controls are
     * PRESSES — Confirm, and End it — and a press is not a field standing open on a page somebody
     * came to read. The facts, the counts and the requests on it are all read-only.
     */
    { route: 'visitor', name: 'a visiting agent', address: () => `#/visitor/${seeded.credential}` },
    /**
     * A PROFILE IS WALKED TWICE, because the two draw different things. The reader's own page
     * carries the picture, name and status editors; every other page does not. The editors open a
     * box when a pencil is pressed, so nothing stands open on arrival — which is the rule, and it
     * is the page most likely to break it.
     */
    { route: 'who', name: 'your own profile', address: () => `#/who/person/${THE_PERSON}` },
    { route: 'who', name: 'an agent’s profile', address: () => `#/who/agent/${seeded.agent}` },
    /**
     * A SECRETARY'S NOTEBOOK KEEPS THE RULE, and it is worth saying because it is a page you write
     * on. The form that adds an entry is inside a closed fold, and the box that changes one opens
     * only when Change is pressed. At rest the page is what is written, with two presses per entry
     * and one fold. Criteria N1 to N4.
     *
     * THE SEEDED AGENT HOLDS NO NOTEBOOK, which is the state most of them are in and the one that
     * has to keep the rule as well: the page says nobody has written one and still draws the fold.
     */
    { route: 'notebook', name: 'a secretary’s notebook', address: () => `#/who/agent/${seeded.agent}/notebook` },
    { route: 'sheet', name: 'component sheet', address: () => '#/ui' },
    { route: 'unknown', name: 'a page nobody has', address: () => '#/no-such-page' },
    // The schedule at every period, because the three horizons draw three different sets of panels
    // and the rule has to hold on all of them.
    { route: 'plan', name: 'the schedule, this week', address: () => '#/plan', editable: true },
    { route: 'plan', name: 'the schedule, a week', address: () => `#/plan/${THIS_WEEK}`, editable: true },
    { route: 'plan', name: 'the schedule, a month', address: () => `#/plan/${THIS_MONTH}`, editable: true },
    { route: 'plan', name: 'the schedule, a day', address: () => `#/plan/${THIS_DAY}`, editable: true },
    { route: 'plan', name: 'the schedule, today', address: () => '#/plan/today', editable: true },
    { route: 'onePlan', name: 'one plan', address: () => `#/plans/${seeded.plan}`, editable: true },
    // Four records of four kinds, because the record page draws by kind: a module has its own
    // designed view, an obligation gets the deadline panel, and a proposal gets the decide panel.
    { route: 'record', name: 'a task', address: () => `#/r/${seeded.record}`, editable: true },
    { route: 'record', name: 'a module', address: () => `#/r/${seeded.module}`, editable: true },
    { route: 'record', name: 'an obligation', address: () => `#/r/${seeded.obligation}`, editable: true },
    { route: 'record', name: 'a proposal', address: () => `#/r/${seeded.proposal}`, editable: true },
    /**
     * ONE INCIDENT'S SCENE, criterion I3. At rest it is a scene a person reads: the loss, the
     * timeline with its evidence presses, the responsibility sentences, the corrective actions.
     * Nothing on it is a box you type in.
     */
    { route: 'incident', name: 'an incident scene', address: () => `#/incident/${seeded.incident}` },
    /**
     * ONE MESSAGE'S OWN PAGE, criterion E2 on a decision. At rest it is a reading: the
     * sender and the time, the letter with its Markdown and pictures, where it went with its marks,
     * and what it is about. Its one press opens the chat panel; nothing on it is a box you type in.
     */
    { route: 'message', name: 'one message', address: () => `#/message/${seeded.message}` },
    /**
     * ONE PROBLEM'S OWN PAGE, criterion E2 on a decision. At rest it is a reading: the
     * title, what breaks, what was tried, whose move it is, the cause and the fix, and the links both
     * ways. It also has an editing face, because the one press that closes a problem is the record
     * page's own state control and it appears when the address says the reader asked to write.
     */
    { route: 'problem', name: 'one problem', address: () => `#/problem/${seeded.problem}`, editable: true },
    /**
     * ONE AGENT RUN'S OWN PAGE, criterion E2 on the same decision. At rest it is a reading: who the
     * run served and who started it, where it ran, the check, the report and the office's timeline.
     * Nothing on it is a box you type in.
     */
    { route: 'session', name: 'one run', address: () => `#/session/${seeded.session}` },
    /**
     * ONE HANDBOOK'S OWN PAGE, wave 13u round 174. At rest it is a reading: whom it is for, where it stands, where it
     * hangs, its text in one language with a press for each other, and its versions, each opened by a press. Changing
     * the text is a press that opens the form, so nothing on it is a box you type in before you asked.
     */
    { route: 'handbook', name: 'one handbook', address: () => `#/handbook/${seeded.handbook}` },
    /**
     * A SWITCHED-ON PLUGIN'S PAGE KEEPS THE RULE (wave 13x round 15b). The office draws the page's title and a panel
     * holding the frame. What the plugin draws is a document of its own inside the frame, which this count does not
     * reach and does not claim to.
     */
    { route: 'plugin', name: 'a switched-on plugin’s page', address: () => `#/plugin/${A_PLUGIN.id}/${A_PLUGIN.slug}` },
  ]
  // THE FAMILY PAGES TAKE THEIR ADDRESSES FROM THE SHARED TABLE, so a family added there is walked
  // here with nothing to keep in step. One key is skipped: `decisions` is a renamed address that
  // lands on the governance queue, and claiming it exercises the family route would be this test
  // saying it checked something it did not.
  const flatAlready = new Set([...rows.map((r) => r.address().replace('#/', '')), 'decisions'])
  for (const family of Object.keys(KIND_FAMILIES)) {
    if (flatAlready.has(family)) continue
    rows.push({ route: 'family', name: `the ${family} family`, address: () => `#/${family}` })
  }
  return rows
}

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page

beforeAll(async () => {
  process.env['MOLE_OFFICE_PLUGINS'] = putThePlugin()
  app = await liveApp({ name: 'read', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  // THE MADE-UP PLUGIN IS SWITCHED ON in this file's own scratch office, as the person, because the switch is the owner's.
  const switched = await fetch(`http://127.0.0.1:${apiPort}/api/plugins/${A_PLUGIN.id}/switch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    body: JSON.stringify({ on: true }),
  })
  if (!switched.ok) throw new Error(`switching the made-up plugin on answered ${switched.status}: ${await switched.text()}`)

  const post = async (path: string, body: unknown): Promise<Record<string, never>> => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const aLetterNothingHolds = path === '/api/records' && theAnswerToAWriteInATestOffice(undefined, body) === 409
    if (aLetterNothingHolds ? res.status !== 409 : !res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`)
    return res.json() as Promise<Record<string, never>>
  }
  const put = async (path: string, body: unknown): Promise<void> => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PUT ${path} answered ${res.status}: ${await res.text()}`)
  }
  const idOf = (reply: unknown): string => {
    const record = (reply as { record?: { id?: unknown } }).record
    const id = record?.id
    if (typeof id !== 'string') throw new Error(`the server's reply carried no record id: ${JSON.stringify(reply)}`)
    return id
  }

  /**
   * ENOUGH IN THE DATABASE THAT EVERY PAGE HAS SOMETHING TO DRAW.
   *
   * A page with no rows draws no rows, and a page with no rows would pass this test while hiding
   * whatever its rows carry. Every kind seeded here is one some page draws differently.
   */
  /**
   * ONE VISITING AGENT'S CREDENTIAL, so `#/visitor/<id>` has something to draw. Criterion P24.
   *
   * Through the door a visiting agent uses, so this is the row the product really writes. It stays
   * pending, which is the state with both presses on it and therefore the harder one for this rule.
   */
  {
    const asked = (await post('/api/office/visitors', {
      handle: 'a-worker-on-another-machine',
      name: 'A worker on another machine',
      role: 'worker',
      conversationPath: '/transcripts/another-machine/4f10',
      startDirectory: '/work/another-machine',
      runtime: 'claude-code',
    })) as unknown as { credential: { id: string } }
    seeded.credential = asked.credential.id
  }

  seeded.record = idOf(
    await post('/api/records', {
      kind: 'task',
      title: 'Fit the reading view to the week',
      data: { state: 'doing', command: 'npm test', also_waiting_on: 'the decisions page' },
    }),
  )
  seeded.module = idOf(
    await post('/api/records', {
      kind: 'module',
      title: 'The planning surfaces',
      data: {
        state: 'active',
        parts: [
          { id: 'reading', name: 'Reading', items: [{ id: 'week', text: 'the week reads', state: 'done' }] },
        ],
      },
    }),
  )
  seeded.obligation = idOf(
    await post('/api/records', {
      kind: 'obligation',
      title: 'Show the owner the reading view',
      data: { state: 'open', due: '2026-12-01', owedTo: 'the owner', why: 'The owner asked to see both states.' },
    }),
  )
  seeded.incident = idOf(
    await post('/api/records', {
      kind: 'incident',
      title: 'The reading view went down with the week',
      data: {
        loss: 'The week could not be read for an hour.',
        timeline: [{ id: 'm-1', at: 'now', who: 'the reader', what: 'The page drew nothing.', evidence: 'ev-placeholder' }],
      },
    }),
  )
  seeded.proposal = idOf(
    await post('/api/records', {
      kind: 'proposal',
      title: 'Which way round should the schedule open?',
      data: {
        question: 'Should the schedule open as reading or as editing?',
        options: ['reading', 'editing'],
        recommendation: 'reading',
      },
    }),
  )
  await post('/api/records', {
    kind: 'claim',
    title: 'The week drew nine boxes before anybody asked for one',
    data: { state: 'measured', numbers: { boxes: 9 }, measured_on: '2026-08-13', method: 'counted in Chromium' },
  })

  // The schedule needs hours on it at all three horizons, or the rows this rule is about are not
  // on the page to be looked at.
  await put(`/api/planning/capacity/week/${THIS_WEEK}`, { hours: 30, note: 'Mole Office' })
  for (const [horizon, period] of [
    ['week', THIS_WEEK],
    ['month', THIS_MONTH],
    ['day', THIS_DAY],
  ] as const) {
    await post('/api/planning/allocations', {
      horizon,
      period,
      recordId: seeded.record,
      plannedHours: 4,
    })
  }

  // AN AGENT, so the agent's profile is a page and not a not-found. Filing an `agent` record is
  // what registers a durable agent; the handle is what its page's address carries.
  await post('/api/records', {
    kind: 'agent',
    title: 'Builder Reading',
    data: { handle: 'builder-reading', runtime: 'claude-code', state: 'active' },
  })
  seeded.agent = 'builder-reading'

  /**
   * ONE MESSAGE, so `#/message/<id>` has something to draw. Addressed to the agent above, because a
   * message to an agent is accepted from a writer no registry holds (chapter 7 rule 1) and this
   * seeding posts no actor. It carries Markdown, so the page's use of the chat's own body reader is
   * exercised rather than merely present.
   */
  seeded.message = idOf(
    await post('/api/records', {
      kind: 'message',
      title: 'A message with a page of its own',
      data: { body: '**The letter** for the reading check.', to: [{ kind: 'agent', id: 'builder-reading' }] },
    }),
  )

  /**
   * ONE PROBLEM, so `#/problem/<id>` has something to draw. It carries the fields the page's own
   * panels read — a symptom, a cause, an attempt, a fix and a state — so the page is exercised as a
   * problem rather than merely reached.
   */
  seeded.problem = idOf(
    await post('/api/records', {
      kind: 'problem',
      title: 'A problem with a page of its own',
      data: {
        symptom: 'The reading check opened the record page twice.',
        cause: 'The address was built without the kind, so the page was reached by two names.',
        why_it_hurts: 'A reader cannot tell which address is the one they are meant to keep.',
        fix: 'Build the kind into the address, in the one place an address is built.',
        state: 'open',
        attempts: [
          {
            id: 'a-kind-in-the-address',
            tried: 'Put the kind in the address and left the generic address as the fallback.',
            result: 'Both addresses opened the problem, and the rail marked the Work to do row.',
          },
        ],
      },
    }),
  )
  /**
   * ONE AGENT RUN, so `#/session/<id>` has something to draw. It is filed by hand, the way a run is
   * when its tool wrote none, and it carries a state so the state word is drawn through the table
   * rather than printed raw.
   */
  seeded.session = idOf(
    await post('/api/records', {
      kind: 'session',
      title: 'A run with a page of its own',
      data: { state: 'running', runtime: 'claude-code', model: 'opus' },
    }),
  )

  /** ONE FLOW OF TWO STAGES, so `#/flows/<id>` has facts, stage boxes and a reason fold to draw. */
  seeded.flow = idOf(
    await post('/api/records', {
      kind: 'flow',
      title: 'The reading flow',
      data: {
        declared_in: 'tools/a-reading-flow.mjs',
        runs: 'the office itself',
        trigger: 'A record is filed for reading.',
        stages: [
          { n: 1, does: 'Read the record.', evidence: 'A note.', why: 'Nothing is changed before it is read.', sources: [seeded.record] },
          { n: 2, does: 'File what was read.', evidence: 'A report.', why: 'What was read is kept.', sources: [seeded.record] },
        ],
        leaves_behind: 'a report',
      },
    }),
  )

  /** ONE HANDBOOK ON THAT FLOW, so `#/handbook/<id>` has whom it is for, its place, its text and a version to draw. */
  seeded.handbook = idOf(
    await post('/api/records', {
      kind: 'handbook',
      title: 'The reading handbook',
      data: {
        for: 'Whoever starts the reading flow.',
        state: 'in use',
        hangs_on: [{ flow: seeded.flow }],
        text: { en: { opening: 'Read the record before you change it.' } },
        text_changes: [{ languages: ['en'], why: 'The first text.' }],
      },
    }),
  )

  const plan = (await post('/api/plans', {
    title: 'The reading pass',
    body: '# What is left\n\n- the record page\n- the schedule\n',
  })) as unknown as { plan: { id: string } }
  seeded.plan = plan.plan.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
}, 60_000)

/** What one visit measured. */
interface Counted {
  /** Form controls the browser laid out inside the page region. */
  controls: string[]
  /** How much text the page drew, so "no controls" can be told from "no page". */
  text: number
}

/**
 * Open an address, wait for it to settle, and count what it drew.
 *
 * The wait is for the page's own ready mark (src/web/lib/ready.ts), and it has to cover a second
 * fetch: several of these pages fetch again once the first reply lands — the record page reads its
 * changes, the schedule reads the week before this one — and a count taken between the two would be
 * a count of a page that is not finished. The mark covers it. It comes off when any request starts,
 * and goes back on only when nothing is out and the page has stopped changing for a moment. A fixed
 * 700 ms after the mark used to be added as well. On 25 September 2026 the count at the mark and
 * the count 700 ms later were compared on all 65 addresses here, in one run, and every one was the
 * same, text length included.
 */
async function countAt(address: string): Promise<Counted> {
  await page.goto(`http://127.0.0.1:${webPort}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return page.evaluate(() => {
    const main = document.getElementById('main')
    if (main === null) return { controls: ['the shell drew no #main region at all'], text: 0 }
    const drawn = [...main.querySelectorAll('input, select, textarea')].filter(
      // WHAT A PERSON CAN SEE, ASKED OF THE BROWSER ITSELF. A control inside a closed fold cannot
      // be seen, and a closed fold is a press somebody has not made yet.
      //
      // THIS USED TO COUNT CLIENT RECTS AND THAT STOPPED WORKING, silently and in the direction
      // that fails loudly rather than passing quietly — which is the only reason it was caught.
      // Chromium now hides the contents of a closed `details` with `content-visibility` on the
      // content pseudo-element rather than by leaving them out of the layout, so every control
      // inside every closed fold in the product started reporting one rect. Measured on Chromium
      // 151: a bare `details` with an input in it, on a page with no stylesheet at all, reports a
      // rect while shut. `checkVisibility()` answers the question this test is actually asking, it
      // is the platform's own answer to it, and it still returns false for `display: none`.
      (node) => node.checkVisibility(),
    )
    return {
      controls: drawn.map((node) => {
        const label = node.getAttribute('aria-label') ?? node.getAttribute('placeholder') ?? node.className
        return `${node.tagName.toLowerCase()} — ${label === '' ? '(no label)' : label}`
      }),
      text: (main.textContent ?? '').trim().length,
    }
  })
}

describe('a page being read', () => {
  for (const visit of visits()) {
    it(
      `draws no box and no dropdown on ${visit.name}`,
      async () => {
        const at = visit.address()
        const found = await countAt(at)
        // A page that failed to load has no fields either. Prove it drew something first, or this
        // assertion is about nothing.
        // Plan 7FEOshq3mBGG gives these empty lists a heading and a short mark.
        if (visit.route === 'shelved' || visit.route === 'counters') {
          expect(await page.locator('#main h1').innerText()).toBe(visit.route === 'shelved' ? 'Shelved' : 'Counters')
          expect(await page.locator('#main .px-absent').count()).toBeGreaterThan(0)
        } else if (visit.route === 'toolset') {
          expect(await page.locator('#main .tls-none').innerText()).toBe(sayInEnglish('absence.none'))
        } else if (visit.route === 'claims') {
          // A fresh office has claimed nothing, and the empty line is one word, so this page draws fewer than 40 characters.
          expect(await page.locator('#main h1').innerText()).toBe(t('w13w.claimsPage.title'))
          expect(await page.locator('#main .hm-claims .hm-empty').innerText()).toBe(t('absence.none'))
        } else if (visit.route === 'interrupted') {
          // A fresh office has no interrupted run, and the empty line is one short state, so this page draws fewer than 40 characters.
          expect(await page.locator('#main .ir .ir-title').innerText()).toBe(t('w13t.nav.interrupted'))
          expect(await page.locator('#main .ir .px-mark .px-chip-word').innerText()).toBe(t('w13t.interrupted.none'))
        } else if (visit.route === 'folderreading') {
          // A fresh office holds no folder reading, and the empty line is one word, so this page draws fewer than 40 characters.
          expect(await page.locator('#main h1').innerText()).toBe(t('dev.folderreading.aFolderAnAgentRead'))
          expect(await page.locator('#main .px-absent').innerText()).toBe(t('absence.none'))
        } else {
          expect(found.text, `${at} drew no text at all, so what follows would prove nothing`).toBeGreaterThan(40)
        }
        // A plugin that is not on draws the sentence saying why it has no page, which keeps the rule too and is not the
        // page this row is here for. The frame is what says the plugin's page was drawn.
        if (visit.route === 'plugin') {
          expect(await page.locator('#main iframe').count(), `${at} drew no plugin frame`).toBe(1)
        }

        // THE NAMED EXCEPTION, CHECKED THE OTHER WAY ROUND. A plan is always writable, so this
        // address must draw a box. On the day it draws none, writing in a plan has broken and this
        // line is what says so.
        const writable = ALWAYS_WRITABLE[visit.route]
        if (writable !== undefined) {
          expect(
            found.controls.length,
            `${at} is the product's one always-writable page, because ${writable} — and it drew no box at all`,
          ).toBeGreaterThan(0)
          return
        }

        const excused = NOT_YET[visit.name]
        if (excused !== undefined) {
          expect(
            found.controls.length,
            `${at} is on the not-yet list because ${excused} — and it now draws none, so delete that line`,
          ).toBeGreaterThan(0)
          return
        }
        expect(found.controls, `${at} is being READ and it drew ${found.controls.length} of them`).toEqual([])
      },
      90_000,
    )
  }
})

describe('the same page being edited', () => {
  for (const visit of visits().filter((v) => v.editable === true)) {
    it(
      `draws fields once the address says edit on ${visit.name}`,
      async () => {
        const at = `${visit.address()}/edit`
        const found = await countAt(at)
        expect(found.text).toBeGreaterThan(40)
        // WITHOUT THIS THE FILE ABOVE WOULD PASS ON A PRODUCT WITH NO EDITING IN IT AT ALL. It is
        // also what proves the counter can see a control when there is one to see.
        expect(found.controls.length, `${at} is being EDITED and it drew no field at all`).toBeGreaterThan(0)
      },
      90_000,
    )
  }
})
