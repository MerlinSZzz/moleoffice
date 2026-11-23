// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSidebarArrangement } from './lib/sidebar-arrangement.ts'
/**
 * The shell: a sidebar that never moves, and one page beside it chosen by the address bar.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY IT HAD TO
 * ---------------------------------------------------------------------------------------
 *
 * This used to be a top bar carrying five links, the actor picker, a record count and the four
 * appearance controls. Measured at 390px, that chrome was 445px tall and the first thing that
 * needed a person began at 747px of an 844px screen — so the phone opened on settings, and the
 * question the product exists to answer was below the fold on every page.
 *
 * The frame is now a left sidebar (src/web/components/Sidebar.tsx). Navigation goes down the
 * side, where it can be as tall as it needs to be; the appearance controls live at the bottom of
 * that column behind a disclosure, because they are chosen once and then never touched; and the
 * phone gets one 48px bar with a menu button, because a permanent sidebar at 390px is a sidebar
 * that eats the page.
 *
 * ---------------------------------------------------------------------------------------
 * THE LAYOUT CONTRACT EVERY PAGE DRAWS INSIDE
 * ---------------------------------------------------------------------------------------
 *
 *   >= 1024px   the sidebar is in the flow on the left, at the width `--sidebar-w` carries, and
 *               the choice of width is remembered. THE NUMBER IS NOT WRITTEN HERE: this line said
 *               "248px expanded, 80px collapsed" while the stylesheet drew the rail at 88px, and
 *               a constant copied into a docstring is a copy nothing keeps true. Nothing else in
 *               the shell takes horizontal space.
 *   <  1024px   the sidebar takes NO width. It is a drawer, `display: none` until the menu button
 *               opens it. The top bar is one 48px line.
 *
 * In both cases the content area is a flex child with `min-width: 0`, so a wide table or a long
 * path inside a page shrinks the page instead of pushing the whole document sideways. `.page`
 * keeps its own padding and its --shell-max cap from styles.css, unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * THE FRAME ASKS THE SERVER ONCE, AND ONLY FOR WHAT IT DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * The sidebar's counts and the phone bar's "N need you" are the same answer, so it is fetched
 * HERE, once per navigation, and handed to both. Two components fetching the same thing would be
 * two clocks in one frame, and the design review named that as the way a status bar and the panel
 * it summarises come to disagree.
 *
 * GET /api/anchor WAS ALSO FETCHED HERE, on every navigation, for a line in the sidebar that
 * reported how many changes had been written since the reading mark. The frame is navigation and
 * that line was a small copy of Home's "Since you last looked" panel — the panel that also carries
 * the button that MOVES the mark — so the line went and the request went with it. A request whose
 * answer nothing draws is a cost with no reader.
 *
 * The machine sweep is deliberately NOT asked for: `api.attention()` without the option does not
 * sweep /proc. The number of unclaimed processes is set by the operating system rather than by
 * the work, and sweeping it on every navigation to decorate a frame would be a real cost for a
 * number that belongs on its own surface.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORKSPACE IS THE IDENTITY OF THE SCREEN, NOT A FILTER ON IT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office holds several isolated projects — see src/shared/workspaces.ts — and nearly every row,
 * count, graph and attention row on a page is relative to exactly ONE of them. So when a reader
 * chooses another project, everything read about the previous one is out of date, and this is the
 * rule the frame enforces:
 *
 *     NO ROW READ FOR THE PREVIOUS PROJECT MAY BE ON SCREEN UNDER THE NEW PROJECT'S NAME
 *     WITHOUT THE RE-READ MARK. NOT AFTER THE NEW ONE LOADS. NOT FOR ONE FRAME BEFORE IT.
 *
 * A list that has not been read again yet may go on showing rows only under the re-read mark, and
 * the new project's answer, or the failure to read it, replaces them. Unmarked, the old project's
 * rows would be a lie, because every one of those rows is REAL — they are simply about something
 * else — and a screen full of real rows under the wrong heading is the most convincing lie this
 * interface could tell. It is also the exact silent substitution this repository forbids.
 *
 * THE MARK CANNOT WAIT FOR A PASSIVE EFFECT. Such an effect runs AFTER React has committed the
 * render that follows the change, so there would be one commit in which the workspace name at the
 * top says Greenhouse and the rows below it are still Mole Office's, with no mark. That frame is
 * the whole defect, it is invisible in a screenshot taken a second later, and no test that waits
 * for the new data would ever see it. So `useAsync` sets the mark in a layout effect, which React
 * runs, and draws again, before the browser paints that commit.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHELL USED TO BE THROWN AWAY, AND IS NOT ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * Until 6 September 2026 this hung the shell off `key={workspaceKey(workspace)}`, so React
 * discarded the entire tree and built a new one in the same commit. That met the rule, and it also
 * threw away the chat panel and whatever the reader was in the middle of typing into it. Criterion
 * M61 records the fault: switching project made the whole of Mole Office flash, the chat with it, and
 * emptied the composer.
 *
 * THE DISCARD THEN MOVED INTO `useAsync`, which put every reading back to loading on a switch,
 * until round 170 of wave 13y took it out. A reading about one project goes through
 * `useProjectAsync` (src/web/lib/project-async.ts), which reads it again for the new project and
 * marks what it shows until the new answer comes. A reading the server answers the same in every
 * project stays on `useAsync`, and a switch leaves it alone, so Settings keeps what it shows. See
 * the comment on `useAsync` in components/ui.tsx, which carries the whole argument. One component
 * holds project data outside both hooks: the chat panel reads its own again in place, as its
 * comments in components/Chat.tsx say. The leading offers are not about one project. They are the
 * reader's, from every project, so a switch keeps them, and only the words that name a project are
 * worked out again.
 *
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts drives this in a
 * real browser: it samples every frame of a switch with the new project's replies held open, and
 * fails if one frame drew the old project's rows without the mark, or if a reading of the office
 * was asked again. tests/workspace-switch.test.ts and
 * tests/the-chat-stays-through-a-change-of-project.test.ts are the other half — that the app is not
 * built again, and that the panel and what is typed in it survive.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import { targetAttributes } from '../shared/targets.ts'
import type { SurfaceId } from '../shared/surfaces.ts'
import { thePage } from './components/agent/pointing.ts'
import { api } from './api.ts'
import { SHELL_BAND_QUERY } from './lib/shell-layout.ts'
import { THE_PAGE_BOX_FROM, THE_PAGE_LAYER, THE_PAGE_SCROLLS_IN_ITS_BOX } from './lib/page-scroll.ts'
import { THE_PLUGIN_PAGE } from './pages/PluginPage.tsx'
import { THE_NARROW_FROM, THE_WIDE_FROM } from './lib/the-shell-width.ts'
import { currentWorkspace, openingWorkspace, setWorkspace, subscribeWorkspace, thePageWaitsForItsProject, workspaceSight } from './lib/workspace.ts'
// THE DOORS THE FRAME AND THE PAGE BOTH NEED, ASKED ONCE. See the module for the measurements and
// for why the frame is the caller that keeps the ranked answer and the list of projects.
import {
  hurryTheAttentionHomeAsk,
  readAttentionHomeOnce,
  readWorkspacesOnce,
  theProjectAProjectListWasSentUnder,
} from './lib/oneread.ts'
// THE ONE NUMBER THE PILL COUNTS, read once, beside the home page's own count line (W6).
import { needsSomebodyNow } from './lib/attention.ts'
import { railCount, type WaitingReply } from './lib/waiting.ts'
import { useLanguage } from './lib/language.ts'
import { WordReadNotice } from './components/WordReadNotice.tsx'
import { TheMoveNotice } from './components/TheMoveNotice.tsx'
import { moveThisBrowserOnce, theMove } from './lib/the-old-cookie.ts'
// THE KIND OF THE RECORD ON SCREEN, so the rail can mark the row it belongs to.
import type { RecordKind } from '@shared/types.ts'
import {
  Sidebar,
  Icon,
  anySafety,
  DESTINATIONS,
  EVERY_PROJECT_PAGES_WITHOUT_A_ROW,
  markFor,
  pageTitle,
  projectCaption,
  type SidebarProps,
} from './components/Sidebar.tsx'
import { RouteLink, CATEGORY_PAGES, categoryOfPage, pathFor, navigate, useRoute, type Route } from './components/router.tsx'
// A PAGE THAT FAILS SAYS SO IN WORDS, WHERE THE PAGE WAS. Criterion E4.
import { PageIsNamed, TheFaultBoundary } from './components/TheFault.tsx'
import { ReReadStrip } from './components/ReReadStrip.tsx'
import { foregroundWait, subscribeForegroundWait, useLoadingLight, useWaitingLight } from './lib/waiting-light.ts'
import { NavigationReads, PageNavigationReads } from './lib/navigation-wait.tsx'
import { theLivePartsAgent, TheLivePartsSheet } from './components/TheLivePartsSheet.tsx'
import { ComponentSheet, ErrorNote, Loading, NotHere, NumberInItsWord, OverlayHost, StateGlyph, subscribeReReadMarks, theReReadMarks, useAsync, type AsyncState } from './components/ui.tsx'
import { useProjectAsync } from './lib/project-async.ts'
import { ChecklistsWindow } from './components/ChecklistsWindow.tsx'
// A NEW OFFICE'S FIRST ENTRY, OVER EVERYTHING BUT THE CHAT CORNER AND THE CHECKLIST (wave 13y round 138).
import { FirstEntry } from './lib/first-entry.tsx'
import { WrongWorld } from './components/WrongWorld.tsx'
import { BehindTheCheckout } from './components/BehindTheCheckout.tsx'
import { HomeMoved } from './components/HomeMoved.tsx'
import { VisitingStrip } from './components/VisitingStrip.tsx'
// EVERY PAGE THE SHELL DRAWS BY ITS ROUTE NAME ALONE, one row for each page (wave 13y, round 69).
import { thePageFromTheList, type TheShellsReadings } from './lib/pagelist.tsx'
// THE CATEGORY PAGES, AND THE PATH AND TABS ABOVE A PAGE IN A GROUP. Item S2 of an earlier piece of work.
import { CategoryPage, WhereThisPageIs } from './pages/CategoryPage.tsx'
import { QuickNotePage } from './pages/QuickNotePage.tsx'
import { QuickNoteBeside } from './components/QuickNoteBeside.tsx'
import { WebPage } from './components/WebPage.tsx'
/**
 * THE REVIEW PANE IS PART OF THE FRAME, and it has to be.
 *
 * While a review is being collected, a person moves between pages — that is the point of it — so
 * the list of what they have written must never disappear, and pressing one of those comments has
 * to be able to take them to a different page. A control on each page would be a different control
 * per page for one state.
 */
import { ReviewFrame, ReviewPane } from './components/agent/ReviewBar.tsx'
import { PointingLayer } from './components/agent/PointingLayer.tsx'
import { MarkLayer } from './components/agent/MarkLayer.tsx'
import { Chat } from './components/Chat.tsx'
import { openTheChatAsChosen, theCount, watchTheCount } from './lib/chat-split.ts'
import { AShapePress, OpenTheChatShape } from './components/chat/Shapes.tsx'
import './components/ShortcutKeysMount.tsx'
import { Forced } from './components/Forced.tsx'
import { theShellDrewTheAddress } from './lib/ready.ts'
import { AgentSaidHere } from './components/agent/AgentSaidHere.tsx'
import { Leading } from './components/Leading.tsx'
import { OnePressPopup } from './components/OnePress.tsx'
import { OwnerGate } from './components/OwnerGate.tsx'
import { QuickSearch } from './components/QuickSearch.tsx'
import { TheWordsThatDidNotCome } from './lib/the-words-that-did-not-come.tsx'

/**
 * ------------------------------------------------------------------------------------------
 * ADDRESSES
 * ------------------------------------------------------------------------------------------
 *
 * There are seven pages:
 *
 *   #/           the home page — what needs you today
 *   #/records    everything Mole Office knows, grouped by kind
 *   #/pipeline   every pipeline, its steps, and the modules that carry them
 *   #/sessions   every agent run, with the command that picks it back up
 *   #/queries    the link questions
 *   #/ui         the component sheet
 *   #/r/<id>     one record (reached from a row, not from the navigation)
 *
 * THE LIST ABOVE IS PROSE, NOT CODE. The addresses live once, in FLAT_ROUTES in router.tsx, and
 * everything here is derived from them: `Page` IS the router's route name, `pageForRoute` is the
 * identity, and every link in the sidebar comes from `pathFor`. tools/review.mjs parses that same
 * map to know what to photograph, so a page that is not in it is never reviewed.
 */

/**
 * THE PHONE'S OWN WIDTH, READ BY THE BAR'S MARKUP AND BY ITS STYLESHEET.
 *
 * At this width and below the bar draws the chat press before the Decisions count and the urgent pill, so the page,
 * the Tab key and a screen reader meet the presses in the order the eye reads them. The markup reads this query with
 * matchMedia and draws its parts in that order; the stylesheet below puts the same string in its media line, so the
 * two cannot drift. It is the 480px line the bar's phone block has carried since round 165.
 */
const THE_PHONE_FROM = '(max-width: 480px)'

/**
 * Which page the shell is showing — the router's own vocabulary, not a second one.
 *
 * Exported because the navigation and the tests name it; there is no other reason.
 */
export type Page = Route['name']

/**
 * Kept as a named function, and kept exported, even though it is now the identity.
 *
 * It is the one place that would have to change if a route ever stopped being a page (a redirect,
 * say), and tests/app-routes.test.ts drives every address in the app through it. Deleting it would
 * save one line and lose the check that no two addresses collide.
 */
export function pageForRoute(route: Route): Page {
  return route.name
}

/**
 * THE PAGES THIS SHELL DRAWS IN ITS OWN CODE, and not from the page list in src/web/lib/pagelist.tsx.
 * Each needs more than its route name, and the reason is beside its code below, or for `welcome`,
 * here. A test deleted on 13 November 2026 held every route name to a row in the list or a name in this one
 * (wave 13y, round 69).
 *
 * `welcome` is drawn by OwnerGate before this shell is drawn at all, and once the office has an
 * owner OwnerGate sends the address to Home, so this shell never draws a page for it.
 *
 * `quickNote` is drawn by `App` in place of this shell, so a note has the whole window to itself.
 */
export const PAGES_DRAWN_IN_THE_SHELL: readonly Page[] = [...Object.values(CATEGORY_PAGES), 'sheet', 'unknown', 'welcome', 'quickNote']

/**
 * ------------------------------------------------------------------------------------------
 * THE FLOOR: THE PAGE ITSELF, SAID OUT LOUD ON THE SHELL
 * ------------------------------------------------------------------------------------------
 *
 * A press on a gap between two panels, on the rail's gutter, on the space under the last row —
 * anywhere Mole Office draws nothing that says what it is — has always been answered with the page.
 * `pointedAt` in components/agent/pointing.ts does it: where the walk up the tree finds nothing,
 * it hands back `thePage()`.
 *
 * THAT ANSWER WAS NOT WRITTEN ANYWHERE ON THE SCREEN, and that is the whole reason this exists.
 * A comment saved against the page came back with nowhere to be drawn: the mark layer finds a
 * comment's subject by building a `[data-target="…"]` selector out of the key the server sent, and
 * no element carried a page key. So the comment existed, the review row could name it, and the
 * thing it was about could never be lit up again. A FALLBACK ANSWERS; ONLY AN EMITTED KEY DRAWS.
 *
 * THE TWO CANNOT DRIFT, BECAUSE THERE IS ONLY ONE OF THEM. This function takes no route, no path
 * and no argument at all: it calls the same `thePage()` the fallback calls, so "the key the shell
 * emits" and "the target a press with nothing under it produces" are one value read twice. Working
 * the address out a second time from the router would be the defect this repository keeps finding
 * — the same fact in two places, free to disagree, with nothing failing when it does.
 *
 * IT IS READ AT EVERY RENDER RATHER THAN KEPT. The shell re-renders on every navigation, so the
 * attribute is rebuilt from the address bar each time; a value held in state would be one page
 * behind for exactly the frames somebody could right-click in.
 */
export function floorDeclaration(): Record<string, string> {
  return targetAttributes(thePage())
}

/**
 * ------------------------------------------------------------------------------------------
 * THE FRAME: A NAMED PART OF MOLE OFFICE'S OWN SCREEN
 * ------------------------------------------------------------------------------------------
 *
 * The floor above is the coarsest answer there is. Between it and a record sits the frame: the
 * rail, the top bar, the place popups are drawn, the review strip, the review column. None of
 * those holds a stored string — their words live in a `.tsx` file and in no record — so each is
 * named instead, once, in src/shared/surfaces.ts, and the name is the whole identity.
 *
 * THE ARGUMENT IS THE UNION AND NOT A STRING, so a part of the screen cannot be pointed at by a
 * name nobody wrote down: a misspelt id is a build error here rather than an attribute that
 * resolves to nothing in a browser six weeks later.
 */
export function frameDeclaration(surfaceId: SurfaceId): Record<string, string> {
  return targetAttributes({ kind: 'uiSurface', surfaceId })
}

/**
 * WHETHER THE PAGE ON SCREEN READS EVERY PROJECT: its sidebar row carries `everyProject`, or its name
 * is in EVERY_PROJECT_PAGES_WITHOUT_A_ROW because the page reads every project and has no row to carry
 * the mark. The row is the one markFor marks as the page, the reading the rail's own mark uses. The
 * row's group is not read, because a page may now move out of All projects while what it reads stays
 * the same. Wave 13r round 5 decided that. The rowless list is the Needs you case of the same
 * decision (wave 13r round 6, messages 8NsXCjJEaqQR and GLtVd7noWIDe).
 */
function spansEveryProject(route: Route): boolean {
  if (EVERY_PROJECT_PAGES_WITHOUT_A_ROW.includes(route.name)) return true
  const family = route.name === 'family' ? route.family : undefined
  return DESTINATIONS.some((row) => row.everyProject === true && markFor(row, route.name, family) === 'page')
}

/**
 * THE RAIL'S OWN DECISIONS ROW, IN THE BAR, WHERE THE RAIL IS FOLDED AWAY. The bar is drawn only
 * below 1024px, where the rail is a drawer, so a fork waiting on the person had no number on the
 * screen: the urgent pill does not count forks, and it said "1 urgent" while two waited (problem
 * xcNQXR2ZZVm7). Decision 1g6FoyxaXDk4: the bar draws the rail's row as the rail draws it,
 * its word, its count (`railCount`, as the owner decided) and its page, and no new
 * name.
 *
 * Everything is read from the rail's own destination, so the two cannot name or count it two ways.
 * Like the rail, it keeps the last count while the reply is read again, and says the counts are
 * unavailable when the read failed rather than drawing nothing, which would say nothing waits.
 */
function TheDecisionsCount({ waiting }: { waiting: SidebarProps['waiting'] }) {
  const held = useRef<WaitingReply | null>(null)
  if (waiting.status === 'ready') held.current = waiting.value
  const row = DESTINATIONS.find((destination) => destination.key === 'decisions')
  if (row === undefined) throw new Error('The sidebar has no Decisions row.')
  if (waiting.status === 'error') {
    return (
      <span className="shell-bar-status" data-tone="down" data-count="decisions" role="status" title={waiting.message}>
        <StateGlyph state="failed" />
        {t('nav.countFailed')}
      </span>
    )
  }
  if (held.current === null) return null
  const n = railCount(held.current)
  // NOTHING WAITING IS ORDINARY EMPTINESS, as on the rail, which draws no badge at 0.
  if (n === 0) return null
  return (
    <a className="shell-bar-status shell-bar-entry" data-tone="up" data-count="decisions" href={`#${row.to}`} title={row.label}>
      {/* THE ROW'S ICON WITH ITS COUNT ON THE CORNER, then its word, as the sidebar draws the row (wave 13y round 165).
          The word comes first so that a screen reader says it before the number; the stylesheet draws the icon first.
          The word is the press's hover title, since below 481px the word is not drawn, and the count's own title says
          what it counts, as on the sidebar. */}
      <span className="shell-bar-word">{row.label}</span>
      <span className="shell-ico-box">
        <Icon name={row.icon} />
        <span className="shell-badge num" title={t('nav.count', { n })}>{t('nav.badge', { n })}</span>
      </span>
    </a>
  )
}

/**
 * The phone bar's urgent count: how many things need somebody. The rail's Decisions count beside it
 * is `TheDecisionsCount`.
 *
 * It is the frame's status on a phone, so it also carries the "the server is not
 * answering" case — drawn with the same glyph and the same token as a failed checklist item,
 * because it is the same category of fact. A grey "offline" label would let it blend into the
 * chrome.
 *
 * NOT "need you", WHICH IT SAID BEFORE THAT, AND NOT `reply.total`, WHICH THIS PILL SAID UNTIL
 * PROBLEM zKalIBZccv9F. The attention rule selects every open row and the home page shows seven of
 * them; a count a person cannot act on is not drawn as a count, so the pill now reads
 * `needsSomebodyNow` — the number the page lists first — and names the rest in its title. What is
 * waiting on the person is one press away, on the rail row that carries that number and on Home's
 * own band.
 */
function NeedsSomebodyPill({ attention }: { attention: SidebarProps['attention'] }) {
  if (attention.status === 'loading') {
    return (
      <span className="shell-bar-status" data-count="urgent" data-tone="checking" role="status">
        {t('frameWords.pill.counting')}
      </span>
    )
  }
  if (attention.status === 'error') {
    // THE WORD FOLLOWS WHAT FAILED. A project the office refuses still answered, so "server
    // unreachable" was false there; a reply the office broke is not an unreachable server either.
    // Only a fault that says nothing answered gets the server's own word.
    const fault = attention.fault ?? null
    const refusedTheProject =
      fault !== null && (fault.kind === 'refused' || fault.kind === 'not-here' || fault.kind === 'elsewhere')
    return (
      <span className="shell-bar-status" data-count="urgent" data-tone="down" role="status" title={attention.message}>
        <StateGlyph state="failed" />
        {refusedTheProject
          ? t('frameWords.pill.projectRefused')
          : fault?.kind === 'unreachable'
            ? t('frameWords.pill.unreachable')
            : t('nav.countFailed')}
      </span>
    )
  }
  const reply = attention.value
  const safety = anySafety(reply)
  const now = needsSomebodyNow(reply)
  // NOTHING URGENT IS ORDINARY EMPTINESS, so the bar draws nothing rather than "0 urgent" (problem
  // cslafTCFymQb).
  if (now === 0) return null
  return (
    <a
      className="shell-bar-status"
      data-tone={safety ? 'safety' : 'up'}
      data-count="urgent"
      href="#/"
      title={t('frameWords.pill.title', { urgent: now, light: reply.total - now }) + (safety ? ` ${t('frameWords.pill.safety')}` : '')}
    >
      {/* ONE WORD WITH ITS NUMBER IN IT, "4 urgent" / "4 项紧急", so Chinese has its measure word, as the hover does (wave
          13q's round 32). The number keeps its own type inside it. */}
      <span><NumberInItsWord word={(n) => t('frameWords.pill.urgentCount', { n })} n={now} /></span>
    </a>
  )
}

/** A read that answers `null` where it did not ask, as the page that needs it sees it: still being read until it has asked. */
function askedOrBeingRead<T>(state: AsyncState<T | null>): AsyncState<T> {
  if (state.status !== 'ready') return state
  return state.value === null ? { status: 'loading' } : { ...state, value: state.value }
}

/**
 * The app: the shell for the project this window reads.
 *
 * EVERYTHING IS IN `Shell`, and this holds only the workspace and the route. Until 6 September
 * 2026 a `key` here threw the whole tree away when the project changed; the header says why it
 * went, and what a change of project does now.
 *
 * The third argument to useSyncExternalStore is the same read as the second, required whenever
 * this renders outside a browser (tests render the shell to markup with react-dom/server) and
 * correct of React to demand: there is no safe guess for which project a reader is looking at.
 */
export function App() {
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const route = useRoute()
  // NO `key` HERE. See the header: the shell is not thrown away any more, and a reading about one
  // project is read again through `useProjectAsync` instead, marked from the first frame. `Shell`
  // still takes the project as a prop, so a component that wants it as a value rather than through
  // the store has one.
  // THE WORDS THAT DID NOT COME are said above the guide and above the office alike (src/web/lib/language.ts).
  // A QUICK NOTE IS DRAWN IN PLACE OF THE SHELL, with no sidebar, rail or chat: the window app's note window is small,
  // and a note opened in a browser tab is the same page. The note page catches its own faults (src/web/pages/QuickNotePage.tsx).
  return (
    <>
      <TheWordsThatDidNotCome />
      <OwnerGate>
        {route.name === 'quickNote' ? <PageIsNamed name={pageTitle(route)}><QuickNotePage /></PageIsNamed> : <Shell workspace={workspace} />}
      </OwnerGate>
    </>
  )
}

/**
 * THE PHONE'S MENU PRESS, WHICH CARRIES THE REFRESHING RING.
 *
 * The sidebar's disc carries the mark at the desk; below 1024 the sidebar is a drawer and its disc
 * is off the screen, so the press that opens it says the same thing. Only this press subscribes to
 * the marks. The shell itself must not: a subscription there draws the whole page again whenever
 * any read starts or lands, which is work the page did not ask for.
 */
/** Reserve the actual height of a failed reread, including wrapped or multiple errors. */
function RefreshingLight({ selector }: { selector: string }) {
  const marks = useSyncExternalStore(subscribeReReadMarks, theReReadMarks, theReReadMarks)
  const foreground = useSyncExternalStore(subscribeForegroundWait, foregroundWait, foregroundWait)
  const target = useRef<HTMLElement>(null)
  // THE COUNTS AS THE WAIT BEGAN. The light ends in the whole ring only when a re-read it waited for was answered and
  // none was refused. A refusal fades it. A foreground wait that starts while a re-read is out ends it plainly, because
  // the press's own light says that wait.
  const atTheStart = useRef(marks)
  const waiting = marks.refreshing > 0 && !foreground
  useLayoutEffect(() => { if (!waiting) atTheStart.current = marks }, [waiting, marks])
  useLayoutEffect(() => { target.current = document.querySelector<HTMLElement>(selector) }, [selector])
  const ended = foreground && marks.refreshing > 0 ? 'gone' : marks.refused > atTheStart.current.refused ? 'failed' : marks.answered > atTheStart.current.answered ? 'success' : 'gone'
  useWaitingLight(target, waiting, ended)
  return null
}

function ReReadWithRoom({ menuOpen, project }: { menuOpen: boolean; project: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia(THE_NARROW_FROM).matches)
  useEffect(() => {
    const media = window.matchMedia(THE_NARROW_FROM)
    const changed = () => setNarrow(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useLayoutEffect(() => {
    const node = holder.current
    if (node === null) return
    const measure = () => {
      const strip = node.querySelector<HTMLElement>('.px-reread')
      document.documentElement.style.setProperty('--reread-room', `${strip === null ? 0 : Math.ceil(strip.getBoundingClientRect().height)}px`)
    }
    const resize = new ResizeObserver(measure)
    const watch = () => {
      resize.disconnect()
      const strip = node.querySelector<HTMLElement>('.px-reread')
      if (strip !== null) resize.observe(strip)
      measure()
    }
    const mutation = new MutationObserver(watch)
    mutation.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-says'] })
    watch()
    return () => { mutation.disconnect(); resize.disconnect(); document.documentElement.style.removeProperty('--reread-room') }
  }, [])
  const selector = narrow && !menuOpen ? '.shell-menu' : '.sbp-disc'
  return <div ref={holder}><ReReadStrip project={project} /><RefreshingLight key={selector} selector={selector} /></div>
}

/**
 * Whether the bar is a phone's. The width is read before the first paint, so a window opened at 390 draws the phone's
 * order from its first frame, and the listener keeps it right when the window is narrowed or widened across the line.
 */
function useThePhoneBarIsNarrow(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(THE_PHONE_FROM).matches)
  useEffect(() => {
    const media = window.matchMedia(THE_PHONE_FROM)
    const changed = () => setPhone(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  return phone
}

function NavigationLight({ element, status }: { element: HTMLElement; status: 'loading' | 'ready' | 'error' }) {
  const target = useRef<HTMLElement>(null)
  useLayoutEffect(() => { target.current = element }, [element])
  useLoadingLight(target, status, 2)
  return null
}

function TheMenuPress({ open, onPress }: { open: boolean; onPress: () => void }) {
  const reReads = useSyncExternalStore(subscribeReReadMarks, theReReadMarks, theReReadMarks)
  return (
    <button
      type="button"
      className="shell-menu"
      onClick={onPress}
      aria-expanded={open}
      aria-controls="shell-side"
      data-refreshing={reReads.refreshing > 0 ? '1' : undefined}
      title={reReads.refreshing > 0 ? t('frameFiles.reread.refreshing') : t('frameWords.menu')}
    >
      <Icon name="menu" />
      <span className="shell-bar-word">{t('frameWords.menu')}</span>
    </button>
  )
}

/**
 * THE BAR'S HEIGHT IS ROOM AT THE TOP OF THE WINDOW for every scroll that brings a place to the top. Below 1024px the
 * phone's bar sticks over the top of the page, so a jump to an address, a press that goes back to the top of a list,
 * and every other scroll to a place's top stopped with the place's first line under the bar. The worker card's name
 * was under it at 390px in wave 13u round 178's pictures. The window is told the bar's height as its
 * scroll-padding-top, read from the bar whenever its size changes, so a bar that wraps to two rows moves the stop
 * with it. From 1024px up the bar is not drawn and the room is 0. Records, Messages, the regulations page, the review
 * pane and Settings each kept an allowance of their own for the bar, and they leave it to this now.
 */
function useTheBarIsRoomAtTheTop(bar: { current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const drawn = bar.current
    if (drawn === null) return
    const root = document.documentElement
    const measure = () => {
      root.style.scrollPaddingTop = `${String(Math.ceil(drawn.getBoundingClientRect().height))}px`
    }
    measure()
    const follow = new ResizeObserver(measure)
    follow.observe(drawn)
    return () => {
      follow.disconnect()
      root.style.removeProperty('scroll-padding-top')
    }
  }, [bar])
}

/**
 * THE CHAT'S PRESS IN THE PHONE'S BAR. It opens the split, which below 1024 pixels covers the
 * screen, and it carries the count whenever the chat's own circle is not drawing it. The number is
 * the chat's own (src/web/lib/chat-split.ts); the bar never counts messages itself.
 */
function TheChatInThePhoneBar() {
  const counted = useSyncExternalStore(watchTheCount, theCount, theCount)
  const count = counted === null || counted.onTheCircle ? 0 : counted.count
  return (
    <AShapePress className="shell-chat-phone" words={t('chat.split.open')} onPress={() => openTheChatAsChosen()}>
      <span className="shell-ico-box">
        <OpenTheChatShape />
        {count > 0 ? <span className="shell-chat-count shell-badge num">{count}</span> : null}
      </span>
    </AShapePress>
  )
}

/**
 * WHETHER A SHELL HAS TAKEN THE ATTENTION READ THE OPENING BEGAN (src/web/main.tsx). Both asks of the first shell
 * take it; a later shell asks afresh. It is kept here and not in the shell, so it counts once in a page load: the
 * quick note is drawn in place of the shell, and coming back from it draws a new shell, which must not be handed
 * the answer read when the page opened, however old. On an opening that is not Home, main.tsx begins no read, and
 * the first shell's own read is the opening's read.
 */
let theOpeningAttentionReadIsTaken = false

function Shell({ workspace }: { workspace: string }) {
  // The shell draws sentences from the word lists, so it draws again when the page language changes.
  useLanguage()
  useSidebarArrangement()
  const phoneBar = useThePhoneBarIsNarrow()
  const bar = useRef<HTMLElement>(null)
  useTheBarIsRoomAtTheTop(bar)
  const route = useRoute()
  const page = pageForRoute(route)
  const routeKey =
    route.name === 'record' ||
    route.name === 'message' ||
    route.name === 'problem' ||
    route.name === 'session'
      ? `${route.name}:${route.id}`
      : page

  /**
   * WHAT KIND OF RECORD IS ON SCREEN, told here once, then handed to the rail.
   *
   * A record page reached from a generic address says which record it opens and nothing else: the
   * address cannot carry the kind. The page reads the record and tells the kind back through
   * `tellRecordOnScreen`; the rail marks the row the record belongs to, which is the question it
   * asks of anything on screen. The id is kept beside the kind, so this answers for the record the
   * ADDRESS names and never for the one a previous page left behind.
   *
   * A MESSAGE'S OWN PAGE NEEDS NO TELLING. Its address IS the kind — `#/message/<id>` — so the kind
   * is known the moment the page is open, and the nil case below is only a record page whose read
   * has not answered yet. The sidebar no longer has a Messages row to mark.
   *
   * A PROBLEM'S OWN PAGE IS THE SAME, criterion E2 on the same decision: `#/problem/<id>` says the
   * kind in its first word, so the rail marks the Work row with the page rather than after a read.
   *
   * A RUN'S OWN PAGE IS THE SAME: `#/session/<id>` names a `session`, so the Agent runs row marks
   * from the address and the page tells the rail nothing.
   */
  const [recordLookedAt, setRecordLookedAt] = useState<{ id: string; kind: RecordKind } | null>(null)
  // The kind is nil until the record page says what it is reading: the leaving mark is Everything,
  // which is what a record page marked before anything knew its kind.
  const kindOnScreen: RecordKind | null =
    route.name === 'message'
      ? 'message'
      : route.name === 'problem'
        ? 'problem'
        : route.name === 'session'
          ? 'session'
          : route.name === 'record' && recordLookedAt !== null && recordLookedAt.id === route.id
            ? recordLookedAt.kind
            : null

  /**
   * THE PAGE SAYS WHEN IT HAS FINISHED DRAWING THIS ADDRESS.
   *
   * `data-mole-office-ready` goes on the `<html>` element when nothing this app asked for is still
   * in flight and React has run its effects. The browser tests and the photographing tools wait
   * for that instead of waiting for the network to go quiet, which was a guess made from outside
   * the page and was wrong about every page holding a connection open. src/web/lib/ready.ts.
   *
   * THIS EFFECT IS WHAT COVERS A PAGE THAT ASKS FOR NOTHING. The count of requests in flight is
   * what usually starts the wait, and a page with no requests would never start one. It runs after
   * the effects of everything inside this component, which is where the requests are started, so
   * the count it settles against is the whole page's.
   *
   * IT MUST NOT RESET THAT COUNT. This runs after those requests have started, so a reset here
   * would erase the evidence that the page had asked for anything, and a page whose only requests
   * were already counted would never be marked ready. `src/web/lib/ready.ts` says the rest.
   *
   * IT RUNS FOR EVERY NEW ADDRESS, NOT ONLY A NEW PAGE. `useRoute` gives a new route at every
   * `hashchange`, also when the address is drawn by the page already on screen, as `#/decisions` is
   * by the governance page. Keyed on `routeKey`, this did not run for such an address, and its mark
   * waited for the office's next machine read, up to 30 s.
   */
  useEffect(() => {
    theShellDrewTheAddress()
  }, [route])

  /**
   * EVERYTHING WAITING ON THE PERSON — ONE REQUEST, TWO SURFACES.
   *
   * Home used to make four claims of the form "waiting on you" with four different numbers, and the
   * Schedule made a fifth. This is the one reading they all take their number from now, and it is
   * fetched HERE, once, exactly as the attention list beside it is: the rail's badge and the page's
   * own band are handed the same reply, so they cannot be two clocks. Two components fetching the
   * same route would agree today and be the same defect tomorrow.
   *
   * `readWaitingAgain` goes to the page, because settling a fork on Home takes something out of
   * this queue and the number beside it has to move in the same press.
   */
  //
  // ON HOME IT FOLLOWS EVERY CHANGE IN THE PROJECT ON SCREEN, at most once in 5 seconds (item 87 of wave 13y), because
  // Needs you is drawn from it. The queue holds every project's, and a change in another project is read on the
  // minute's read, as before.
  const [waiting, readWaitingAgain] = useAsync(() => api.waiting(), [routeKey], { keep: 'shell.waiting', follows: page === 'home' ? { kinds: 'every kind', atMostEveryMs: 5000 } : undefined })
  // HOW MANY NOTES WAIT FOR THE PERSON TO CONFIRM, in every project: the count beside its sidebar row. One note is
  // asked for, because only the total is drawn.
  const [wordsWaiting, readWordsAgain] = useAsync(() => api.thePersonsWords({ limit: 1, offset: 0 }), [routeKey], { keep: 'shell.yourWords' })

  /**
   * WHETHER THIS BROWSER IS PAIRED, ASKED ONCE, AND THE FIRST VISIT IS OFFERED THE PAIRING PAGE.
   * Criterion P83, point 2, and the secretary's amendment of 13 September 2026 at 18:50.
   *
   * The shell asks this one question and hands the answer to the page, rather than the page asking
   * again: one fact must have one clock. On a browser that arrived from the office's own computer, or
   * from a machine the office trusts, and holds no key, the first visit opens the pairing page.
   * `offered` is true only on the office's own computer and `mayAsk` only on a trusted machine, and
   * both are false on a browser that is already paired and on a machine the office does not trust,
   * so none of those is moved.
   *
   * IT DOES NOT WALL THE OFFICE OFF. This is a navigation, not a gate: the rail is drawn beside the
   * page, the office answers every other address as it always did, and the page itself says the
   * office keeps working. A browser whose pairing read fails stays wherever it was.
   */
  //
  // ASKED ONLY WHERE IT IS DRAWN OR ACTED ON: a visit that arrived at no address, which may be offered the page, and
  // the pairing page itself. Every other page draws nothing from it, and it was asked on every page until wave 13x
  // round 13. `null` is the answer of a page that did not ask, and nothing reads it as a pairing.
  const [arrivedAtNoAddress] = useState(() => window.location.hash === '' || window.location.hash === '#')
  const pairingAsked = arrivedAtNoAddress || page === 'pairing'
  const [pairing, readPairingAgain] = useAsync(() => (pairingAsked ? api.pairing() : Promise.resolve(null)), [pairingAsked])
  const offeredThePage = useRef(false)
  useEffect(() => {
    if (pairing.status !== 'ready' || pairing.value === null) return
    // A BROWSER PAIRED BEFORE SEC-2 MOVES FIRST, ONCE A LOAD (lib/the-old-cookie.ts), and the read is asked again, so
    // a browser that moved is not offered the page. The notice in the page says it once. Item 7 of SEC-2's design.
    if (pairing.value.mayMove && theMove().state === 'not tried') {
      void moveThisBrowserOnce().then(() => readPairingAgain())
      return
    }
    if (!pairing.value.offered && !pairing.value.mayAsk) return
    if (offeredThePage.current) return
    offeredThePage.current = true
    // ONLY A FRESH VISIT. Somebody who has already chosen an address is left there; this offers the
    // page on arrival rather than pulling the reader off a place they meant to open.
    if (window.location.hash === '' || window.location.hash === '#') navigate(pathFor('pairing'))
  }, [pairing])

  // WHICH PROJECTS EXIST — asked ONCE per page, because the list only moves when somebody makes or
  // renames one in the sidebar. It is fetched here for the same reason `attention` is: the sidebar's
  // switcher and the phone bar both name the project, and two components asking would be two clocks
  // in one frame. Chat and Home read the same answer through the same function.
  //
  // THE LIST IS NOT ANSWERED ABOUT ONE PROJECT, so a project change does not make it read again.
  //
  // AND READ AGAIN WHEN THE SIDEBAR CHANGES IT. `readWorkspacesAgain` goes to the sidebar, because
  // renaming a project is a press in that column and the name it changed is drawn from this reply
  // in three places — the switcher, the phone bar and Home's line saying what everything is about.
  //
  // THE RANKED ANSWER IS ASKED BEFORE EVERY OTHER READ OF THE PAGE, in a layout effect, which runs before
  // any passive effect of this frame or of the page inside it. Until round 143 of wave 13y it was asked
  // after the small doors, as criterion W3, when it was a couple of megabytes and its bytes held up the
  // small doors' replies. Home's first page is now about 230 KB, and it is worked out on a thread of its
  // own (src/server/lib/attention-thread.ts) while the server answers the other reads one at a time. Asked
  // last, it waited in the browser's six connections and then in that line, and reached its thread
  // about a second after the page asked it. The `useProjectAsync` below joins this read.
  const attentionAskedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    // StrictMode runs this twice for one address; the second run asks nothing.
    if (attentionAskedFor.current === routeKey) return
    attentionAskedFor.current = routeKey
    // A MOVE IS ASKED AT ONCE (src/web/lib/oneask.ts). Only Home's own reasons, its events and its
    // minute, wait out the ranked answer's pace.
    hurryTheAttentionHomeAsk()
    void (theOpeningAttentionReadIsTaken ? readAttentionHomeOnce.again() : readAttentionHomeOnce.current())
  }, [routeKey])

  const [workspaces, reloadWorkspaces] = useAsync(() => readWorkspacesOnce(), [])
  const readWorkspacesAgain = (): void => {
    void readWorkspacesOnce.again()
    reloadWorkspaces()
  }

  /**
   * WHICH PROJECT THE PROJECT-LIST REPLY WAS READ FOR, so a reply cannot raise a false warning.
   *
   * It is the project the request was SENT under, which `readWorkspacesOnce` records with the reply
   * (src/web/lib/oneread.ts). It is not always the project on screen, for two reasons:
   *
   * 1. The list is read once and NOT re-read when the reader switches project, and
   *    tests/workspace-switch.test.ts holds that rule. After a move, the reply in hand was sent under
   *    the project the reader LEFT. Problem `OisNdGN40uoR`.
   * 2. The project can change while the read is out. A browser with nothing stored sends its read
   *    under "default", and a record page of another project moves it there before the reply
   *    arrives. Problem `bFwKhPWp7V0s`.
   *
   * In both, the reply was sent under a project that is no longer on screen. `workspaceSight` judges
   * the reply's `current` field only when `readFor` is the project on screen, so neither case draws
   * "Wrong project answered". A reply sent under the project on screen that names another project
   * still draws it.
   */
  const workspacesReply = workspaces.status === 'ready' ? workspaces.value : null
  const workspacesReadFor = workspacesReply === null ? workspace : theProjectAProjectListWasSentUnder(workspacesReply)

  // Re-read on every navigation, so the frame's numbers are never long stale and a server that
  // has stopped shows up as soon as you move. It goes to the sidebar and to the phone bar.
  //
  // THE FORM IS `?machine=omit`, AND IT IS THE ONLY FORM. The plain form and `omit` are the same
  // answer — the route sweeps the machine only when `include` is written — so asking both was two
  // requests for one reading. The page no longer asks at all: it draws this reply, and only this
  // one, so the rail's number and the ranked list cannot disagree.
  //
  // ONE SHAPE IN BOTH MODES, ONE READ PER LOAD: Home's first page (`readAttentionHomeOnce`). Developer
  // mode asked for the whole answer until round 19 of wave 13w, because it draws the three question
  // lists; it now draws their counts from the first page and reads their rows when a fold is opened.
  // The frame's own need — `total` and the visible rows' `safety` — is inside the first page.
  // AND ON HOME IT FOLLOWS EVERY CHANGE IN THE PROJECT, at most once in 5 seconds (item 87 of wave 13y): the
  // attention rule reads every record of the project. Elsewhere it is read on each move, as it was.
  const [attention, readAttentionAgain] = useProjectAsync(
    () => {
      if (theOpeningAttentionReadIsTaken) return readAttentionHomeOnce.again()
      theOpeningAttentionReadIsTaken = true
      return readAttentionHomeOnce.current()
    },
    [routeKey],
    { keep: 'shell.attention', follows: page === 'home' ? { kinds: 'every kind', atMostEveryMs: 5000 } : undefined },
  )

  const sight = workspaceSight(workspace, workspacesReply, workspacesReadFor)
  const category = categoryOfPage(page)

  // WHAT A PAGE FROM THE PAGE LIST IS HANDED: the readings above, each read once here (wave 13y, round 69).
  const shellReadings: TheShellsReadings = {
    sight,
    workspaces,
    waiting,
    readWaitingAgain,
    attention,
    readAttentionAgain,
    readWordsAgain,
    wordsWaiting,
    // THE ANSWER OF THE PAGE BEFORE, WHICH DID NOT ASK, IS NOT AN ANSWER HERE: until this page's read is back
    // the page is told it is being read.
    pairing: askedOrBeingRead(pairing),
    readPairingAgain,
    /* Keeps the stored object when the record and its kind have not changed, so React sees
       no change and does not draw the page again. This function is new on every draw, and
       once the record has been read the record page calls it each time it arrives. Storing
       a new object on every call would draw the page again without end, as it did
       before wave 13i. */
    tellRecordOnScreen: (id, kind) =>
      setRecordLookedAt((was) => (was !== null && was.id === id && was.kind === kind ? was : { id, kind })),
  }

  /**
   * OPEN ON A PROJECT THAT HAS WORK IN IT.
   *
   * `DEFAULT_WORKSPACE` is the id the server answers a header-less request with — a contract about
   * headers, which this browser was reading as an opinion about where to start. On this
   * installation that project holds nothing, so a first-time reader's first screen said "This
   * project is empty" underneath a cross-project band of four urgent-looking questions about the
   * tool's own source code. All three independent reviewers hit it inside a minute, and one said
   * every misreading in their first two minutes came from this alone.
   *
   * It runs in an effect rather than during render because it is a WRITE — it stores the choice —
   * and it fires at most once, for a browser that has never chosen. `openingWorkspace` returns null
   * for every other case, including a default project that does hold something.
   */
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => {
    if (workspaces.status !== 'ready') return
    const open = openingWorkspace(workspaces.value.workspaces)
    if (open === null) return
    setOpened(open.because)
    setWorkspace(open.id)
  }, [workspaces])

  // A BROWSER THAT HAS NEVER CHOSEN A PROJECT DRAWS NO PAGE UNTIL ITS PROJECT IS CHOSEN, so no page
  // reads the default project for a record that is in another one (problem ipeva-Ir-5by). The frame
  // is drawn meanwhile. `thePageWaitsForItsProject` says when, in src/web/lib/workspace.ts.
  const pageWaits = thePageWaitsForItsProject(
    workspaces.status === 'ready' ? workspaces.value.workspaces : workspaces.status === 'error' ? 'failed' : 'reading',
  )

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuNavigation, setMenuNavigation] = useState<{target:string; element:HTMLElement; reads:NavigationReads; status:'loading'|'ready'|'error'} | null>(null)

  // The desktop row stays in the sidebar; on a phone it leaves with the drawer, so Menu
  // carries the wait. Both follow the new page's reads, including plain status lines.
  useEffect(() => {
    if (menuNavigation?.status !== 'loading') return
    const changed = () => {
      if (window.location.hash === menuNavigation.target) return
      document.documentElement.removeAttribute('data-navigation-wait')
      setMenuNavigation(current => current?.reads === menuNavigation.reads ? null : current)
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [menuNavigation])
  useEffect(() => () => document.documentElement.removeAttribute('data-navigation-wait'), [])

  // Following a link inside the drawer changes the page underneath it. Leaving the drawer open
  // over the page you just asked for is the classic drawer mistake.
  useEffect(() => {
    setMenuOpen(false)
  }, [routeKey])

  // The page behind the scrim must not scroll under a finger. Restored exactly as it was found,
  // so this cannot leave the document unscrollable if something else was already setting it.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  return (
    <>
      <style href="mole-office-shell" precedence="default">
        {SHELL_CSS}
      </style>

      {/* WHETHER THIS PAGE IS TALKING TO THE MOLE OFFICE IT THINKS IT IS. Criterion G4. It draws
          nothing at all in normal use — that is the owner's F2 answer of 3 September 2026 — and a
          red banner over an unusable page when the world it is talking to is not the one it opened
          against, when a scratch database is answering on the canonical address, or when the server
          cannot restart. First in the shell so it is above everything, including the skip link. */}
      <WrongWorld />

      {/* First tab stop on the page. Keyboard users get past a column full of links in one key
          rather than fifteen.

          It moves focus in code instead of letting the browser follow the fragment, because in a
          hash-routed app the fragment IS the address: following "#main" would leave the router
          looking at a path called "main" and replace the page with "there is no page at main".
          The href stays for the status bar, for middle-click, and because a skip link that is not
          a link is not announced as one. */}
      <a
        className="sr-only skip-link"
        href="#main"
        onClick={(event) => {
          const main = document.getElementById('main')
          // If the element is missing the markup below changed without this being updated. Let
          // the browser do its default thing rather than silently swallowing the key press.
          if (!main) return
          event.preventDefault()
          main.focus()
        }}
      >
        {t('frameWords.skipToThePage')}
      </a>

      {/* THE FLOOR. See `floorDeclaration` above for why the page is emitted here as well as
          answered by the walk, and why it takes no argument.

          `data-name` is stated rather than left to be worked out. Without it the chip for a floor
          answer is whatever `nameOnScreen` finds first inside the shell — which is the rail's own
          first heading, four inches from the thing the person actually pressed. The page's name is
          already worked out once, by `pageTitle`, and the phone's bar below draws the same value. */}
      <div className="shell" {...floorDeclaration()} data-name={pageTitle(route)} onClickCapture={event => {
        const phone = window.matchMedia(THE_NARROW_FROM).matches
        if ((phone && !menuOpen) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const row = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.shell-side a[href^="#"]') : null
        if (row === null || (row.target && row.target !== '_self') || row.hash === window.location.hash) return
        const element = phone ? document.querySelector<HTMLElement>('.shell-menu') : row
        if (element === null) return
        document.documentElement.setAttribute('data-navigation-wait', 'yes')
        setMenuNavigation({ target: row.hash, element, reads: new NavigationReads(), status: 'loading' })
      }}>
        <Sidebar
          {...(opened === null ? {} : { opened })}
          page={page}
          {...(route.name === 'family' ? { family: route.family } : {})}
          {...(page === 'record' ||
          page === 'message' ||
          page === 'problem' ||
          page === 'session'
            ? { recordOnScreen: { kind: kindOnScreen } }
            : {})}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          attention={attention}
          waiting={waiting}
          wordsWaiting={wordsWaiting}
          sight={sight}
          workspaces={workspaces}
          onRenamed={readWorkspacesAgain}
        />

        <div className="shell-body">
          {/* THE LINES AT THE TOP ARE IN THE PAGE'S COLUMN AND NOT ABOVE THE WHOLE FRAME. Until wave 13y
              round 87 they stood above the frame, so the frame started lower by their height. The
              sidebar is as tall as the window, so its foot ended below the window by the same height,
              and Settings could not be reached. That was the owner's report of 26 October 2026. Here
              they push down only the page beside the sidebar, and the sidebar starts at the top of the
              window, as the chat panel does. Below 1024 pixels the sidebar is a drawer fixed to the
              window, so nothing here moves it there. */}

          {/* THE CODE BEHIND THIS PAGE, WHEN IT IS OLDER THAN THE CHECKOUT. One line of title at the top,
              and the page goes on working under it; components/BehindTheCheckout.tsx says why it stays.
              In ordinary flow and not fixed, so it covers nothing and every press and field below it
              keeps working. First in the page's column, so it is the first thing read there. */}
          <BehindTheCheckout />

          {/* THE OFFICE HAS MOVED HOME, ONCE. OP3 of the one-person-every-machine acceptance file: the
              page has already adopted the world the reply named home now, and this is the one plain
              line saying so. It needs no press and draws nothing in normal use. Ordinary flow, so it
              covers nothing: the page is usable and every press below keeps working. */}
          <HomeMoved />

          {/* AND THE STRIP THAT SAYS THIS PAGE IS AWAY FROM HOME. Criterion C7: it says which world and
              brings the page back in one press, and it is on screen the whole time the page is away.
              It draws nothing when the page is at home, which is every ordinary moment. Not a warning:
              the red banner is for a world nobody asked to be in, and these two must not look alike. */}
          <VisitingStrip />

          {/* The phone's whole chrome: one line. Hidden from 1024px up, where the sidebar carries
              all of this and the page gets the height back. */}
          <header className="shell-bar" ref={bar} {...frameDeclaration('header')}>
            <TheMenuPress open={menuOpen} onPress={() => setMenuOpen(true)} />
            {menuNavigation === null ? null : <NavigationLight key={menuNavigation.target} element={menuNavigation.element} status={menuNavigation.status} />}
            {/* WHICH PROJECT, THEN WHICH PAGE. The sidebar is a drawer at this width, so if the
                project were only in there it would be invisible on a phone — and every number on
                the screen below is relative to it. Two lines rather than one: the project is not
                a page and must not read as part of its name. Until the list of projects names
                the project, this is the short mark, as in the sidebar: the id is what this browser
                sends, and an id is not shown in normal mode. This answers problem
                Hz0sA-l6YmpY. It is the sidebar's own `projectCaption`, so
                the two bars cannot name one project two ways. */}
            {/* `truncate` is on the two lines inside rather than here: it is a text utility, and
                this element is now a flex column, where `text-overflow` does nothing at all. */}
            {/* A PAGE THAT READS EVERY PROJECT NAMES NO PROJECT. The bar reads the page's own
                `everyProject` mark, on its sidebar row wherever the row stands, or the page's name in
                EVERY_PROJECT_PAGES_WITHOUT_A_ROW when it has no row to carry the mark, after problem
                IfJ_JmeZ-3vr and then a decision. The rowless case is Needs you,
                wave 13r round 6. */}
            <span className="shell-bar-where">
              {spansEveryProject(route) ? null : (
                <span className="shell-bar-project truncate" title={sight.what}>
                  {projectCaption(sight)}
                </span>
              )}
              <span className="shell-bar-page truncate">{pageTitle(route)}</span>
            </span>
            {/* ON A PHONE THE CHAT PRESS IS DRAWN BEFORE THE COUNTS, so the eye, the Tab key and a screen reader meet
                the presses in one order. At every other width the chat press stands after the counts, as it always
                has. The width is read before the first paint. */}
            {phoneBar ? <TheChatInThePhoneBar /> : null}
            <TheDecisionsCount waiting={waiting} />
            <NeedsSomebodyPill attention={attention} />
            {/* THE CHAT'S COUNT ON A PHONE. Below 1024 pixels there is no corner circle to carry
                it, and the sidebar's Chat row is in the drawer, so the bar carries it instead and
                opens the split in one press. */}
            {phoneBar ? null : <TheChatInThePhoneBar />}
          </header>

          {/* THE RING THAT SAYS A REVIEW IS COLLECTING, and nothing else.

              IT TAKES NO SPACE AT ALL. There used to be a band here — 28px across the top of every
              page, saying Collecting, the subject and the count. It went
              (problem `Wa-23qH_zbPx`): the band at the top was one too many, and
              pressing Review in the left sidebar to open a column on the right was enough. Its
              words are in the head of the review column now, which the sidebar's Reviews control
              opens.

              IT IS MOUNTED HERE AND NOWHERE ELSE, as a child of the box that holds the page and
              the review column. The ring it draws is fixed to the window and measured against
              `.shell-body`, so it frames what is being read and not the rail: the rail is the
              application's own chrome and has to go on working, and framing it would say the
              application had changed when what changed is what a comment does.

              WHAT IT DRAWS AND WHY IT IS NOT DESCRIBED HERE: ReviewFrame in
              components/agent/ReviewBar.tsx. This file mounts it. */}
          <ReviewFrame />

          {/* WHERE THIS PAGE IS: its group, and the group's other pages. Item S2 of an earlier piece of work. Mounted
              here once, so no page draws its own, and above the page's own landmark, so the skip
              link passes it. It draws nothing for a page in no group. */}
          <WhereThisPageIs page={page} {...(route.name === 'family' ? { family: route.family } : {})} project={projectCaption(sight)} />

          {/* THE PAGE AND THE REVIEW PANE, SIDE BY SIDE.

              The pane is a column at the desk and a band above the page on a phone, and either way
              it takes space from this row rather than floating over the reading. That is what makes
              the two widths compose: `.prose-measure` is a CAP on the space an element is given, so
              the prose narrows when the pane appears and nothing scrolls sideways. The pane draws
              nothing at all until somebody starts a review, so no ordinary page pays for it. */}
          <div className="shell-main">
          <main className="page" id="main" tabIndex={-1}>
            <WordReadNotice />
            <TheMoveNotice />
            {/* A PAGE THAT FAILS SAYS SO IN WORDS, WHERE THE PAGE WAS. Criterion E4, and the owner's
                ruling of 8 September 2026: a blank page is only one way of failing loudly, and what
                matters is that a failure is loud. A fault while a page is being drawn used to
                unmount the whole tree and leave the person a white screen with nothing on it; now it is drawn here with its own message, this page's name, the press
                that led to it and a press that loads the page again.

                KEYED BY THE ADDRESS, so the fault clears the moment the reader goes anywhere else.
                It is the ADDRESS and not `routeKey`: two citizens' pages share one route name, and a
                boundary keyed by the name would hold the first one's fault over the second one's
                page. `window.location.hash` is what `useRoute` above parses, so this render and that
                one are reading the same address.

                `PageIsNamed` is beside it because a press that stops has to name the page too, and a
                button knows what it is called and nothing about where it is. */}
            <PageIsNamed name={pageTitle(route)}>
            <TheFaultBoundary key={window.location.hash} page={pageTitle(route)}>
            {/* WHAT THE PAGE SAYS WHILE ONE OF ITS READS IS TAKING A NEWER ANSWER, and what a
                failed re-read says beside the content that was kept. Criterion E5. One strip here,
                not one mark per page: the hook knows when it is keeping, and 129 call sites cannot
                each remember to draw it. It draws nothing when there is nothing to say. */}
            <ReReadWithRoom menuOpen={menuOpen} project={projectCaption(sight)} />
            <PageNavigationReads reads={menuNavigation?.status === 'loading' && menuNavigation.target === window.location.hash && !pageWaits ? menuNavigation.reads : null} onAnswer={answer => {
              if (menuNavigation === null) return
              document.documentElement.removeAttribute('data-navigation-wait')
              setMenuNavigation(current => current?.reads === menuNavigation.reads ? { ...current, status: answer } : current)
            }}>
            {pageWaits ? <Loading /> : <>
            {/* EVERY PAGE THE SHELL DRAWS BY ITS ROUTE NAME ALONE, from the page list in
                src/web/lib/pagelist.tsx (wave 13y, round 69). The shell's own readings go down with
                it, so a page and the rail beside it draw one answer. */}
            {thePageFromTheList(route, shellReadings)}
            {/* A SIDEBAR GROUP'S OWN PAGE: one card for each page in the group. Item S2 of an earlier piece of work.
                IN CODE, NOT IN THE LIST: four route names draw it, and the group is found from the
                name by `categoryOfPage`. */}
            {category !== null ? (
              <CategoryPage category={category} caption={category === 'project' ? projectCaption(sight) : pageTitle(page)} waiting={waiting} />
            ) : null}
            {/* THE LIVE PARTS OF ONE AGENT'S PAGE, drawn alone when the address names an agent (wave 13u, round 10).
                IN CODE, NOT IN THE LIST: the page is chosen by the address's query, not by its route name. */}
            {page === 'sheet' ? (theLivePartsAgent() === null ? <ComponentSheet /> : <TheLivePartsSheet agentId={theLivePartsAgent() as string} />) : null}
            {/* `page` is only ever 'unknown' for an 'unknown' route, so the address is always there
                to quote back; the check is what tells TypeScript that.
                IN CODE, NOT IN THE LIST: it is not a page but what the shell says at an address that
                names none, with the shell's own two ways out. */}
            {page === 'unknown' && route.name === 'unknown' ? (
              // Both ways out, because a mistyped address gives no clue which one was meant.
              /* THE WORDS WERE ALREADY RIGHT AND THE BOX WAS NOT. This said the same short, quiet
                 sentence it says now, inside `ErrorNote` — a red spine, a red tint, the failed
                 glyph and the word "Not found." in alarm ink — because there was no way to say
                 that a mistyped address is not a failure of anything. `NotHere` is that way, and
                 the three other not-found treatments in the language audit come through it too. */
              <NotHere sentence={<strong>{t('frameWords.noPageAt', { path: content(route.path) })}</strong>}>
                <span className="shell-ways-out">
                  <RouteLink to="/" className="shell-way-out">
                    {t('frameWords.noPage.today')}
                  </RouteLink>
                  <RouteLink to={pathFor('records')} className="shell-way-out">
                    {t('frameWords.noPage.allRecords')}
                  </RouteLink>
                </span>
              </NotHere>
            ) : null}
            </>}
            </PageNavigationReads>
            </TheFaultBoundary>
            </PageIsNamed>
            {/* WHERE A CIRCLE OR A CARD BESIDE A BLOCK IS DRAWN WHILE THE PAGE SCROLLS IN ITS OWN BOX, so it
                scrolls with its block. Last, so every page's own first element stays first. It takes no room.
                See src/web/lib/page-scroll.ts. */}
            <div className={THE_PAGE_LAYER} />
          </main>

          {/* A WEB PAGE THE WINDOW DRAWS, in the body or a column beside it. It is part of the shell, so it keeps its place
              while the page changes route, and it draws nothing until one is open. components/WebPage.tsx. */}
          <WebPage />
          <ReviewPane />
          {/* A NOTE FLOATS OVER THE PAGE until it is closed or opened in its own window. It draws nothing when no note
              is open. components/QuickNoteBeside.tsx. */}
          <QuickNoteBeside />
          </div>
        </div>

        {/* WHERE EVERY FLOATING THING IS DRAWN — every menu, composer, recipient picker and review
            overlay. It is LAST so that it is above the page, the phone's bar and the drawer in the
            document as well as in the token order; it takes no space; and it is mounted once here
            rather than per page, because a second host would be a second answer to "what is on
            top". See OverlayHost in components/ui.tsx for what went wrong without it. */}
        {/* THE ONE LISTENER THAT MAKES EVERY ADDRESSABLE ELEMENT ADDRESSABLE. It draws nothing at
            rest; it watches the document for a selection, a right-click and the frame's own
            "Ask agent", and opens the composer in the host above. It is mounted beside
            the host because everything it opens is drawn there. */}
        <PointingLayer />

        {/* WHERE A COMMENT IS ALREADY WAITING, marked on the thing itself. It draws no elements
            inside a page: the object's small mark is a stylesheet built from the keys the server
            sent, and the highlight on the quoted words is painted by the browser over the document
            rather than into it. See components/agent/MarkLayer.tsx. */}
        <MarkLayer />

        {/* WHAT AN AGENT SAID ABOUT A PART OF THIS PAGE, beside that part, with a box to answer in.
            Criterion M7: an agent marks out an area or a passage of text, a
            message explaining it is shown on it, the person replies, and the agent carries on.
            It draws nothing on a page no agent has commented on. See components/agent/AgentSaidHere.tsx. */}
        <AgentSaidHere />

        {/* AN AGENT'S OFFER TO TAKE THE READER TO A PAGE, and the control that ends following.
            Criterion M8: leading needs the person's consent: nothing
            moves the page unless the reader presses the offer or has said they are following that
            agent. components/Leading.tsx. */}
        <Leading />

        {/* A REQUEST FOR ONE PRESS, on every page while one waits: who asked, what the press will do, and Agree or
            Refuse. It reads the shell's one waiting reading, the one Home's Needs
            you draws, so the two cannot disagree. components/OnePress.tsx. */}
        <OnePressPopup waiting={waiting} readWaitingAgain={readWaitingAgain} />

        {/* THE QUICK SEARCH, over any page: the sidebar's press and Alt and X open it. A pasted id opens its record, and
            words find pages and records by name. components/QuickSearch.tsx. */}
        <QuickSearch />

        {/*
          THE CIRCLE AT THE BOTTOM RIGHT, ON EVERY PAGE. It is a
          sibling of the overlay host rather than part of a page, because it belongs to the shell:
          a message arrives wherever the reader happens to be.
        */}
        <Chat />
        {/* THE CHECKLISTS WINDOW AT THE TOP RIGHT, while it is switched on. components/ChecklistsWindow.tsx. */}
        <ChecklistsWindow />
        {/* A NEW OFFICE'S FIRST ENTRY: the office greyed but for the chat corner, then the checklist, until the person
            opens the getting-started report from it (wave 13y round 138). It draws nothing in any other office.
            lib/first-entry.tsx. */}
        <FirstEntry />
        {/* AN EMERGENCY MESSAGE, DRAWN OVER THE PAGE WITH EVERYTHING BEHIND IT BLURRED. Criterion
            M62: for a person it is a system dialogue on the Mole Office
            screen, with everything around it blurred. It draws
            nothing at rest, and a message may be narrowed to one machine and one browser — the
            server decides which screen that is. components/Forced.tsx. */}
        <Forced />
        <OverlayHost />
      </div>
    </>
  )
}

/**
 * The shell's own few rules.
 *
 * styles.css already dresses .page and the preset bar; it belongs to another agent, so
 * the shell-only pieces it does not know about live here. React 19 hoists a `<style href>` into
 * <head> and de-duplicates by href, so this is one style element no matter how many times App
 * renders. Every value below is a token — there is no colour and no type size written out, so a
 * preset swap re-skins all of it.
 *
 * The `.topbar`, `.topbar .nav` and `.topbar-right` rules in styles.css were dead from the day
 * this became a sidebar, and a note here asked for them to go. They are gone.
 *
 * THE RECORD IDS BEHIND THREE NOTES IN THE STYLESHEET ARE KEPT HERE, because the stylesheet ships as
 * text and a shipped text gives its reason in words. The note on a comment about the page as a
 * whole is problem 2ubMhLXPKUtx. The room at the foot for the corner chat button is problem
 * -n3fg3ZAdXfY. The one threshold the page-and-pane row shares with ReviewBar is problem
 * 9W9_5_YnHQH9.
 */
const SHELL_CSS = `
/* THE FRAME. The sidebar is a flex item that does not grow; the body takes the rest and may
   shrink, which is what min-width:0 buys — without it a wide table inside a page would push the
   whole document sideways instead of scrolling inside its own box. */
.shell {
  display: flex;
  align-items: stretch;
  min-height: 100dvh;
}

/* A COMMENT ABOUT THE PAGE IS STILL NOT DRAWN ON THE SHELL, AND THE RULE THAT SAID SO IS GONE.

   A rule turning off the shell's own before-pseudo-element used to stand here. The mark layer drew
   every waiting comment as generated content on the element carrying the thing's key; this element
   carries the page's key and it is a flex row, so that pseudo-element became its FIRST FLEX ITEM
   and moved the rail, the page and everything in them sideways.

   The mark layer draws no generated content at all now — a comment is a circle beside the block,
   in components/agent/CommentCircle.tsx — so there is nothing here to turn off, and a rule turning
   off something nothing draws is a rule a reader has to work out is dead.

   A COMMENT ABOUT THE PAGE AS A WHOLE IS DRAWN BESIDE THE PAGE'S OWN HEADING, never on the shell.
   The shell carries the page's key, and theBlockDrawnFor in components/agent/theblock.ts answers the
   page's first heading (#main h1) for it, so the comment circle (CommentCircle.tsx) and an agent's
   card (AgentSaidHere.tsx) sit beside that heading. Nothing is drawn as part of the shell, so the rail
   does not move. A page that draws no heading gets no circle, and its comments are read in the review
   column and at GET /api/agent/marks. Interaction contract 3.2. */

/* THE BOX THE COLUMN-OR-BAND SWITCH BELOW ASKS ABOUT. It is named, because an unnamed query binds
   to whichever container happens to be nearest and this app has thirteen queries that would then
   rebind to it. */
.shell-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
  container-name: shell;
}

/* THE PAGE GIVES THE SPLIT THE ROOM, RATHER THAN BEING COVERED. The chat says which side is drawn
   and how wide on the root (src/web/lib/chat-split.ts), and the page's own column moves over by
   exactly that much. Nothing here is written on the element by the component, so a stylesheet that
   has not read the root yet draws the page full width for one frame and then moves it. */
:root[data-chat-split='right'] .shell-body { margin-right: var(--chat-split-w, 0px); }
:root[data-chat-split='left'] .shell-body { margin-left: var(--chat-split-w, 0px); }

/* THE PAGE AND THE REVIEW PANE SHARE ONE ROW, and the page is the part that shrinks. min-width:0
   is what lets it: without it a wide table inside the page would push the pane off the screen
   instead of scrolling inside its own box. With no review being collected the pane draws nothing,
   so this row holds the page alone and the page is exactly as wide as it always was. */
.shell-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: stretch;
  /* ROOM AT THE FOOT FOR THE CORNER CHAT BUTTON, which is fixed to the window's bottom-right corner.
     Without it the last line of a long page ends under the button. The
     review pane scrolls inside its own box, so it gets the same room inside that box. A page that
     scrolls in its own box keeps the same room at the end of that box, below. */
  --page-end-room: max(var(--fab-room), var(--one-press-room, 0px), calc(var(--reread-room, 0px) + var(--lead-room, 0px) + var(--pad)));
  padding-bottom: var(--page-end-room);
  & > .px-pane { padding-bottom: var(--fab-room); }
}

.shell-main > .page { flex: 1 1 auto; min-width: 0; }

/* A plugin window reaches the bottom of the browser; the corner chat button floats over it. */
:root[${THE_PLUGIN_PAGE}] .shell-main,
:root[${THE_PLUGIN_PAGE}] .shell-main > .page { padding-bottom: 0; }

/* The page and pane stack when the shell has no room for both columns. The named container
   measures the space left by the rail. SHELL_BAND_QUERY supplies the same condition here and in
   ReviewBar, so the two layouts cannot choose different thresholds.
   Its threshold is written as a literal because CSS custom properties cannot set a container
   query condition. It allows 16rem for the pane and a 20rem floor for the page beside it. */
${SHELL_BAND_QUERY} {
  .shell-main { flex-direction: column; }
}

/* A PAGE THAT SCROLLS IN ITS OWN BOX: a report's, on a window wider than a phone's. src/web/lib/page-scroll.ts
   says why, puts the mark on the root, and reads which box scrolls from what these rules make of it.
   The frame is held to the window's height, the row the page sits in gives the page the height that
   is left under the bar, and the page scrolls inside it, so its scrollbar stands at the right edge of
   its own column. Its room for the corner button moves from the row's foot to the end of the box,
   except the part the review tray covers at the window's foot (--page-foot-covered, ReviewBar.tsx):
   that part stays under the box, so the box's scrollbar ends above the tray, and the room is kept once.
   The root is not told to hide what overflows, so anything that still makes the window scroll shows. */
@media ${THE_PAGE_BOX_FROM} {
  :root[${THE_PAGE_SCROLLS_IN_ITS_BOX}] .shell { height: 100dvh; }
  :root[${THE_PAGE_SCROLLS_IN_ITS_BOX}] .shell-main { min-height: 0; padding-bottom: var(--page-foot-covered, 0px); }
  :root[${THE_PAGE_SCROLLS_IN_ITS_BOX}] .shell-main > .page {
    position: relative;
    min-height: 0;
    overflow-y: auto;
  }
  :root[${THE_PAGE_SCROLLS_IN_ITS_BOX}] .shell-main > .page::after {
    content: '';
    display: block;
    height: calc(var(--page-end-room) - var(--page-foot-covered, 0px));
  }
}
.${THE_PAGE_LAYER} { display: contents; }

/* ---- the phone's one line --------------------------------------------------------------- */

.shell-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-bar);
  display: flex;
  /* THE COUNTS WRAP, NOT THE CHAT, ON A PHONE. On a phone the name column below keeps its whole width where it fits
     beside the menu press and the chat press, so the project and page lines are not cut. The bar's markup puts the
     counts after the chat press there, so a count with no room on the first row goes to a second row and the chat
     press stays on the menu press's row. */
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pad);
  padding: var(--pad);
  min-height: 48px;
  background: var(--panel);
  border-bottom: var(--border-w) solid var(--border);
}

.shell-menu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 36px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
}
.shell-menu:hover { background: var(--hover); }

/* THE CHAT IN THE PHONE'S BAR. It is a shape, with its word in the title and for a screen reader,
   and the count on the shape's corner when the chat is not drawing the count itself, the mark the sidebar draws.
   IT IS A ROUND PLATE, as the corner chat button is: as wide as it is high, with corners of its own, because a
   person's own theme may set the corner style names to anything. */
.shell-chat-phone {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: none;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: var(--border-w) solid var(--border-strong);
  border-radius: 50%;
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
  cursor: pointer;
}
.shell-chat-phone:hover { background: var(--hover); }
.shell-chat-phone:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; }
/* THE BAR'S ICONS ARE ONE SIZE. The chat's shape is 24px, so Menu's and Decisions' icons are drawn at 24px beside it;
   at the sidebar's 18px they read lighter than the shape (wave 13y round 165). */
.shell-bar .shell-ico-box, .shell-bar .shell-ico { width: 24px; height: 24px; }

/* THE BAR'S DECISIONS ENTRY IS A PRESS LIKE MENU AND THE CHAT, its word as far from the icon as the sidebar's row has it,
   so the count on the icon's corner is clear of the word (wave 13y round 165). */
.shell-bar-status.shell-bar-entry {
  position: relative;
  gap: calc(var(--pad) + 4px);
  min-height: 36px;
  border-color: var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
}
.shell-bar-entry:hover { background: var(--hover); }
.shell-bar-entry .shell-ico-box { order: -1; }

/* Two lines in one 48px bar: which project, then which page. The project is set a size below the
   page and in the quiet text tone — it is the ground the page stands on, not a second heading. */
.shell-bar-where {
  /* THE NAME GIVES WAY, NOT THE CHAT PRESS. At every width that draws the bar, the chat press stays on the menu
     press's row whatever the name is: a name wider than the room the presses leave it ends in an ellipsis, and a name
     that fits is drawn whole. Off a phone the column starts at no width and takes what the presses leave, so the bar
     is one row wherever the presses fit on it. On a phone the counts take the second row instead, and the phone rules
     below give the column its whole width up to the room between the menu press and the chat press. */
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.2;
}

.shell-bar-project {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .04em;
}

.shell-bar-page {
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
}

.shell-bar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 28px;
  padding: 0 var(--pad);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--fs-1);
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
}
.shell-bar-status[data-tone="up"] { background: var(--panel-2); color: var(--text-2); }
.shell-bar-status[data-tone="checking"] { background: var(--panel-2); color: var(--text-3); }
/* Down and safety borrow the failed state's colour AND, for down, its glyph, so both read as the
   same class of fact as a failed row rather than as chrome. */
.shell-bar-status[data-tone="down"],
.shell-bar-status[data-tone="safety"] {
  background: var(--st-failed-bg);
  border-color: var(--st-failed-line);
  color: var(--st-failed);
  font-weight: var(--st-failed-weight);
}
.shell-bar-status .px-glyph { width: 13px; height: 13px; flex: none; fill: none; }

@media ${THE_WIDE_FROM} {
  /* The sidebar carries all of this at the desk, so the page gets the height back. */
  .shell-bar { display: none; }
}

@media ${THE_PHONE_FROM} {
  /* Thumb targets, and 16px on any text input because anything smaller makes iOS Safari zoom the
     page on focus — which leaves the reader scrolled sideways in a layout that was never meant
     to be. */
  .shell-menu { min-height: 44px; }
  .shell-bar-status { min-height: 44px; }
  /* THE COUNTS TAKE THE SECOND ROW, NOT THE CHAT. The bar's markup puts the chat press before the counts at this
     width, so a row too short for both counts leaves the chat press on the menu press's row. The order is the
     markup's, so the eye, the Tab key and a screen reader meet the presses in one order. */
  /* ON A PHONE MENU, DECISIONS AND THE CHAT ARE SQUARE PRESSES WITH AN ICON (wave 13y round 165). With their words
     drawn, the three took about 380px of the 290px a phone's bar has beside its checklist press, and the bar wrapped
     to two rows. Each keeps its word for a screen reader, and the page's name keeps the room. */
  .shell-bar { --shell-press: 44px; }
  .shell-menu, .shell-bar-status.shell-bar-entry, .shell-chat-phone {
    position: relative; width: var(--shell-press); min-height: var(--shell-press); padding: 0; justify-content: center;
  }
  .shell-chat-phone { height: var(--shell-press); }
  /* ON A PHONE THE NAME KEEPS ITS WHOLE WIDTH, UP TO THE ROOM BESIDE THE MENU PRESS AND THE CHAT PRESS. The column
     starts at its content width, so the counts take the second row rather than the name being squeezed. It is at most
     the bar's width less those two presses and their two gaps, so the three always share the first row: a longer name
     ends in an ellipsis there, and a name that fits is drawn whole. */
  .shell-bar-where { flex-basis: auto; max-width: calc(100% - 2 * (var(--shell-press) + var(--pad))); }
  .shell-menu .shell-bar-word, .shell-bar-entry .shell-bar-word {
    position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
}

/* ---- the page ---------------------------------------------------------------------------- */

.shell-ways-out {
  display: inline-flex;
  gap: var(--pad-lg);
  flex-wrap: wrap;
}

.shell-way-out {
  color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: .16em;
}

/* The main region takes focus from the skip link, but it is not a control, so it must not draw a
   ring on a mouse click. :focus-visible is exactly that distinction. */
.page:focus { outline: none; }
.page:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: calc(var(--focus-offset) * -1);
}
`
