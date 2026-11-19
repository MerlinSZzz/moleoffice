// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { SHIPPED_SIDEBAR, SIDEBAR_CAPTION_KEYS, type SidebarArrangement } from '@shared/sidebar-arrangement.ts'
import { sidebarReading, useSidebarArrangement } from '../lib/sidebar-arrangement.ts'
import { useSidebarPins, type SidebarPinsReading } from '../lib/sidebar-pins.ts'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { usePanelPresence } from '../lib/motion.ts'
import { openTheChatAsChosen, theCount, theSidebarFitsBeside, theSplitDrawnOn, theSplitDrawnWidth, watchTheCount, watchTheSplit } from '../lib/chat-split.ts'
import { THE_NARROW_FROM, THE_WIDE_FROM } from '../lib/the-shell-width.ts'
import { useLoadingLight } from '../lib/waiting-light.ts'
import { content, t, wordLanguage } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { PROJECTS_CHANGED } from './ProjectsPanel.tsx'
import { PLUGINS_CHANGED } from './PluginSwitches.tsx'
import { pluginWordsIn } from '@shared/plugins.ts'
import { SURFACES, RAIL_WORD_KEYS, type SurfaceId } from '@shared/surfaces.ts'
import { THE_PERSON } from '@shared/person.ts'
import { PRODUCT_NAME } from '@shared/product.ts'
import { avatarUrlFor, defaultAvatarAssetId, moleOfficeId } from '@shared/participants.ts'
import { KIND_FAMILIES, familyOf, type KindFamily } from '@shared/work.ts'
import { RECORD_KINDS, type RecordKind } from '@shared/types.ts'
import { api, getActor, setActor, subscribeActor, type AttentionHome, type WebActor } from '../api.ts'
import { needsSomebodyNow, type KeyValueStore } from '../lib/attention.ts'
import { railCount, type WaitingReply } from '../lib/waiting.ts'
import { OPEN_THE_QUICK_SEARCH } from '../lib/shortcuts.ts'
import { openAQuickNote, theKeyOnThePress } from '../lib/open-a-quick-note.ts'
import { theBrowsersStore } from '../lib/store.ts'
import {
  setWorkspace,
  workspaceBootFault,
  theWarningForAProjectListThatFailed,
  theWarningForAnUnreadableStoredProject,
  type WorkspaceSight,
  type WorkspaceWarning,
} from '../lib/workspace.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import type { WorkspacesReply } from '../../server/api/workspaces.ts'
import { projectName } from './projects.tsx'
import { categoryOfPage, categoryPath, countersPath, familyPath, horizonsPath, pathFor, pluginPagePath, RouteLink, shelvedPath, toolsetPath, type CategoryKey, type Route } from './router.tsx'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { Absence, Select, subscribeReReadMarks, theReReadMarks, useAsync, Wordmark, type AsyncState } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { choosePreset, presetFaultSentence, THEME_LABELS, usePresets, type PresetFault } from './PresetBar.tsx'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { useMode, type Mode } from '../lib/mode.ts'

import { ReviewSwitch } from './agent/ReviewBar.tsx'

import { TalkAboutSomething } from './agent/PointingLayer.tsx'
import { actorTypeWord, familyWord } from '../lib/words.ts'
import { InReachMark, reachBox, useReach } from './InReach.tsx'
import { Avatar } from './Avatar.tsx'
import { ShutDownPress } from './ShutDown.tsx'
import { stepsWaitingOnTheOwner } from './ChecklistParts.tsx'

export type IconName =
  | 'power'
  | 'chat'
  | 'terminal'
  | 'worlds'
  | 'embassy'
  | 'roles'
  | 'casting'
  | 'regulations'
  | 'toolset'
  | 'today'
  | 'plans'
  | 'calendar'
  | 'work'
  | 'records'
  | 'module'
  | 'pipeline'
  | 'session'
  | 'working'
  | 'belief'
  | 'findings'
  | 'ideas'
  | 'notes'
  | 'links'
  | 'package'
  | 'components'
  | 'settings'
  | 'switch'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'collapse'
  | 'expand'
  | 'close'
  | 'check'
  | 'flows'
  | 'signatures'
  | 'honour'
  | 'board'
  | 'grid'
  | 'house'
  | 'find'
  | 'pin'
  | 'unpin'
  | 'pen'

export type BadgeSource =

  | { of: 'everything' }

  | { of: 'waiting' }

  | { of: 'yourWords' }

  | { of: 'reports' }

  | { of: 'checklists' }

  | { of: 'kind'; kind: RecordKind }

  | { of: 'family'; family: KindFamily }

export interface Destination {
  key: string

  surface: SurfaceId

  label: string

  to: string

  page: Route['name']

  kind?: RecordKind

  family?: KindFamily

  alsoCovers?: readonly RecordKind[]
  icon: IconName

  what: string

  everyProject?: true
  badge: BadgeSource | null

  rail: boolean
}

export const DESTINATIONS: readonly Destination[] = [
  {

    key: 'home',
    surface: 'rail.home',

    get label() { return t(RAIL_WORD_KEYS['rail.home']) },
    to: '/',
    page: 'home',
    icon: 'house',
    // HOME AND NOTES READ EVERY PROJECT, from 14 October 2026, on the coordinator's cYujzIgA5iBQ and
    // yreP4qPJlY0e and on a decision. The top bar reads this mark and not the row's group, so
    // the two pages keep a bar that names no project wherever the person puts them.
    everyProject: true,
    get what() { return t('nav.what.home') },
    badge: null,
    rail: true,
  },
  {

    key: 'plans',
    surface: 'rail.plans',
    get label() { return t(RAIL_WORD_KEYS['rail.plans']) },
    to: pathFor('plans'),
    page: 'plans',
    icon: 'plans',
    everyProject: true,
    get what() { return t('nav.what.plans') },
    badge: null,
    rail: true,
  },
  {

    key: 'work',
    surface: 'rail.work',
    get label() { return t(RAIL_WORD_KEYS['rail.work']) },
    to: familyPath('work'),
    page: 'family',
    family: 'work',
    icon: 'work',
    everyProject: true,
    get what() { return t('nav.what.work') },
    badge: null,
    rail: true,
  },
  {

    key: 'schedule',
    surface: 'rail.schedule',
    get label() { return t(RAIL_WORD_KEYS['rail.schedule']) },
    to: pathFor('plan'),
    page: 'plan',
    icon: 'calendar',
    everyProject: true,
    get what() { return t('nav.what.schedule') },
    badge: null,
    rail: true,
  },
  {
    key: 'resources',
    surface: 'rail.resources',
    get label() { return t(RAIL_WORD_KEYS['rail.resources']) },
    to: pathFor('resources'),
    page: 'resources',
    icon: 'package',
    everyProject: true,
    get what() { return t('nav.what.resources') },
    badge: null,
    rail: true,
  },
  {

    key: 'horizons',
    surface: 'rail.horizons',
    get label() { return t(RAIL_WORD_KEYS['rail.horizons']) },
    to: horizonsPath(),
    page: 'horizons',
    alsoCovers: ['goal'],
    icon: 'plans',
    everyProject: true,
    get what() { return t('nav.what.horizons') },
    badge: null,
    rail: true,
  },
  {

    key: 'decisions',
    surface: 'rail.decisions',

    get label() { return t(RAIL_WORD_KEYS['rail.decisions']) },
    to: pathFor('governance'),
    page: 'governance',
    family: 'decisions',
    icon: 'belief',
    everyProject: true,
    get what() { return t('nav.what.decisions') },
    badge: { of: 'waiting' },
    rail: true,
  },
  {

    key: 'modules',
    surface: 'rail.modules',
    get label() { return t(RAIL_WORD_KEYS['rail.modules']) },
    to: pathFor('modules'),
    page: 'modules',
    kind: 'module',
    icon: 'module',
    get what() { return t('nav.what.modules') },
    badge: null,
    rail: true,
  },
  {

    key: 'placeholders',
    surface: 'rail.placeholders',
    get label() { return t(RAIL_WORD_KEYS['rail.placeholders']) },
    to: pathFor('placeholders'),
    page: 'placeholders',
    kind: 'placeholder',
    alsoCovers: ['ran_instead'],
    icon: 'belief',
    get what() { return t('nav.what.placeholders') },
    badge: null,
    rail: true,
  },
  {

    key: 'bundles',
    surface: 'rail.bundles',
    get label() { return t(RAIL_WORD_KEYS['rail.bundles']) },
    to: pathFor('bundles'),
    page: 'bundles',
    kind: 'context_bundle',
    icon: 'links',
    everyProject: true,
    get what() { return t('nav.what.bundles') },
    badge: null,
    rail: true,
  },
  {

    key: 'tasksToTake',
    surface: 'rail.tasks',
    get label() { return t(RAIL_WORD_KEYS['rail.tasks']) },
    to: pathFor('tasksToTake'),
    page: 'tasksToTake',
    icon: 'package',
    get what() { return t('nav.what.tasksToTake') },
    badge: null,
    rail: true,
  },
  {

    key: 'counters',
    surface: 'rail.counters',
    get label() { return t(RAIL_WORD_KEYS['rail.counters']) },
    to: countersPath(),
    page: 'counters',
    icon: 'package',
    everyProject: true,
    get what() { return t('nav.what.counters') },
    badge: null,
    rail: true,
  },
  {
    key: 'yourWords',
    surface: 'rail.yourwords',
    get label() { return t(RAIL_WORD_KEYS['rail.yourwords']) },
    to: pathFor('yourWords'),
    page: 'yourWords',
    icon: 'check',
    everyProject: true,
    get what() { return t('nav.what.yourWords') },
    badge: { of: 'yourWords' },
    rail: true,
  },
  {
    key: 'checklists',
    surface: 'rail.checklists',
    get label() { return t(RAIL_WORD_KEYS['rail.checklists']) },
    to: pathFor('checklists'),
    page: 'checklists',
    icon: 'check',
    everyProject: true,
    get what() { return t('nav.what.checklists') },
    // THE STEPS WAITING ON THE PERSON in this project's checklists, as the Checklists page sums them.
    badge: { of: 'checklists' },
    rail: true,
  },
  {
    // THE FLOWS PAGE, by a decision and another one. No `kind`: a flow's
    // own record page still marks the Reports and notes row, as it did before this row was added.
    key: 'flows',
    surface: 'rail.flows',
    get label() { return t(RAIL_WORD_KEYS['rail.flows']) },
    to: pathFor('flows'),
    page: 'flows',
    icon: 'flows',
    everyProject: true,
    get what() { return t('nav.what.flows') },
    badge: null,
    rail: true,
  },
  {
    key: 'pipeline',
    surface: 'rail.pipeline',
    get label() { return t(RAIL_WORD_KEYS['rail.pipeline']) },
    to: pathFor('pipeline'),
    page: 'pipeline',
    kind: 'pipeline',
    alsoCovers: ['block', 'trajectory', 'planned_state'],
    icon: 'pipeline',
    get what() { return t('nav.what.pipeline') },
    badge: null,
    rail: true,
  },
  {
    key: 'board',
    surface: 'rail.board',
    get label() { return t(RAIL_WORD_KEYS['rail.board']) },
    to: pathFor('board'),
    page: 'board',
    icon: 'board',
    get what() { return t('nav.what.board') },
    badge: null,
    rail: true,
  },
  {
    key: 'findings',
    surface: 'rail.findings',
    get label() { return t(RAIL_WORD_KEYS['rail.findings']) },
    to: familyPath('findings'),
    page: 'family',
    family: 'findings',
    icon: 'findings',
    get what() { return t('nav.what.findings') },
    badge: null,
    rail: true,
  },
  {
    key: 'shelved',
    surface: 'rail.shelved',
    get label() { return t(RAIL_WORD_KEYS['rail.shelved']) },
    to: shelvedPath(),
    page: 'shelved',
    icon: 'package',
    get what() { return t('nav.what.shelved') },
    badge: null,
    rail: true,
  },
  {
    key: 'ideas',
    surface: 'rail.ideas',
    get label() { return t(RAIL_WORD_KEYS['rail.ideas']) },
    to: familyPath('ideas'),
    page: 'family',
    family: 'ideas',
    icon: 'ideas',
    get what() { return t('nav.what.ideas') },
    badge: null,
    rail: true,
  },
  {
    key: 'notes',
    surface: 'rail.notes',
    get label() { return t(RAIL_WORD_KEYS['rail.notes']) },
    to: familyPath('notes'),
    page: 'family',
    family: 'notes',
    icon: 'notes',
    // See Home's row above.
    everyProject: true,
    get what() { return t('nav.what.notes') },
    // THE REPORTS NOBODY HAS READ in this project, as Home's reports count them.
    badge: { of: 'reports' },
    rail: true,
  },
  {
    key: 'myNotes',
    surface: 'rail.mynotes',
    get label() { return t(RAIL_WORD_KEYS['rail.mynotes']) },
    to: pathFor('myNotes'),
    page: 'myNotes',
    // EVERY QUICK NOTE IS READ ON MY NOTES (wave 13y round 167), so a note's own page marks this row and not Reports.
    kind: 'quick_note',
    icon: 'notes',
    everyProject: true,
    get what() { return t('nav.what.myNotes') },
    badge: null,
    rail: true,
  },
  {

    key: 'sessions',
    surface: 'rail.sessions',
    get label() { return t(RAIL_WORD_KEYS['rail.sessions']) },
    to: pathFor('sessions'),
    page: 'sessions',
    kind: 'session',
    icon: 'session',
    get what() { return t('nav.what.sessions') },
    badge: null,
    rail: true,
  },
  {
    key: 'versionHistory',
    surface: 'rail.versionhistory',
    get label() { return t(RAIL_WORD_KEYS['rail.versionhistory']) },
    to: pathFor('versionHistory'),
    page: 'versionHistory',
    icon: 'session',
    get what() { return t('nav.what.versionHistory') },
    badge: null,
    rail: true,
  },
  // THE MERGE QUEUE: each lane's entries in the order they will land, and why each waits.
  // It follows option A of a decision.
  {
    key: 'mergequeue',
    surface: 'rail.mergequeue',
    get label() { return t(RAIL_WORD_KEYS['rail.mergequeue']) },
    to: pathFor('mergequeue'),
    page: 'mergequeue',
    icon: 'pipeline',
    get what() { return t('mergeQueuePage.nav.what') },
    badge: null,
    rail: true,
  },
  // THE INTERRUPTED RUNS, criterion W7: the runs a shutdown paused or that stopped mid-turn, each
  // with one press to resume it when it can be.
  {
    key: 'interrupted',
    surface: 'rail.interrupted',
    get label() { return t(RAIL_WORD_KEYS['rail.interrupted']) },
    to: pathFor('interrupted'),
    page: 'interrupted',
    kind: 'session',
    icon: 'session',
    get what() { return t('w13t.nav.what.interrupted') },
    badge: null,
    rail: true,
  },
  {

    key: 'working',
    surface: 'rail.working',
    get label() { return t(RAIL_WORD_KEYS['rail.working']) },
    to: pathFor('working'),
    page: 'working',
    icon: 'working',
    get what() { return t('nav.what.working') },
    badge: null,
    rail: true,
  },
  {

    key: 'agents',
    surface: 'rail.agents',
    get label() { return t(RAIL_WORD_KEYS['rail.agents']) },
    to: pathFor('agents'),
    page: 'agents',
    icon: 'session',
    get what() { return t('nav.what.agents') },
    badge: null,
    rail: true,
  },
  {

    key: 'messages',
    surface: 'rail.messages',
    get label() { return t(RAIL_WORD_KEYS['rail.messages']) },
    to: pathFor('messages'),
    page: 'messages',
    kind: 'message',
    icon: 'session',
    get what() { return t('nav.what.messages') },
    badge: null,
    rail: true,
  },
  {

    key: 'usage',
    surface: 'rail.usage',
    get label() { return t(RAIL_WORD_KEYS['rail.usage']) },
    to: pathFor('usage'),
    page: 'usage',
    icon: 'session',
    get what() { return t('nav.what.usage') },
    badge: null,
    rail: true,
  },
  {
    key: 'records',
    surface: 'rail.records',
    get label() { return t(RAIL_WORD_KEYS['rail.records']) },
    to: pathFor('records'),
    page: 'records',
    icon: 'records',
    everyProject: true,
    get what() { return t('nav.what.records', { n: RECORD_KINDS.length }) },
    badge: null,
    rail: true,
  },
  {
    key: 'queries',
    surface: 'rail.queries',
    get label() { return t(RAIL_WORD_KEYS['rail.queries']) },
    to: pathFor('queries'),
    page: 'queries',
    icon: 'links',
    get what() { return t('nav.what.queries') },
    badge: null,
    rail: true,
  },
  {
    key: 'terminals',
    surface: 'rail.terminals',
    get label() { return t(RAIL_WORD_KEYS['rail.terminals']) },
    to: pathFor('terminals'),
    page: 'terminals',
    icon: 'terminal',
    everyProject: true,
    get what() { return t('nav.what.terminals') },
    badge: null,
    rail: true,
  },
  {

    key: 'worlds',
    surface: 'rail.worlds',
    get label() { return t(RAIL_WORD_KEYS['rail.worlds']) },
    to: pathFor('worlds'),
    page: 'worlds',
    icon: 'worlds',
    everyProject: true,
    get what() { return t('nav.what.worlds') },
    badge: null,
    rail: true,
  },
  {

    key: 'embassy',
    surface: 'rail.embassy',
    get label() { return t(RAIL_WORD_KEYS['rail.embassy']) },
    to: pathFor('embassy'),
    page: 'embassy',
    // A ROLE REQUEST'S OWN PAGE OPENS UNDER THE EMBASSY: it is an agent asking to come in or for a
    // card, and it was marked under Reports and notes. Problem NXEhOBumu5ZZ.
    alsoCovers: ['role_request'],
    icon: 'embassy',
    everyProject: true,
    get what() { return t('nav.what.embassy') },
    badge: null,
    rail: true,
  },
  {

    key: 'roles',
    surface: 'rail.roles',
    get label() { return t(RAIL_WORD_KEYS['rail.roles']) },
    to: pathFor('roles'),
    page: 'roles',
    // A ROLE CARD'S OWN PAGE OPENS UNDER THIS ROW. Item 3 of a decision makes a role card a kind of
    // its own, not a report, so it left the Reports and notes family on 1 October 2026.
    kind: 'role_card',
    icon: 'roles',
    everyProject: true,
    get what() { return t('nav.what.roles') },
    badge: null,
    rail: true,
  },
  {

    // THE CASTING TABLE (选角表): beside the role cards in the Agents group.
    key: 'casting',
    surface: 'rail.casting',
    get label() { return t(RAIL_WORD_KEYS['rail.casting']) },
    to: pathFor('casting'),
    page: 'casting',
    icon: 'casting',
    everyProject: true,
    get what() { return t('nav.what.casting') },
    badge: null,
    rail: true,
  },
  {

    key: 'regulations',
    surface: 'rail.regulations',
    get label() { return t(RAIL_WORD_KEYS['rail.regulations']) },
    to: pathFor('regulations'),
    page: 'regulations',
    icon: 'regulations',
    everyProject: true,
    get what() { return t('nav.what.regulations') },
    badge: null,
    rail: true,
  },
  // THE GATES, a panel on Settings until wave 13y round 125 (item 62). They are the office's, read from
  // /api/office/gates, so the row carries Settings' every-project mark, as the rows around it do.
  {
    key: 'gates',
    surface: 'rail.gates',
    get label() { return t(RAIL_WORD_KEYS['rail.gates']) },
    to: pathFor('gates'),
    page: 'gates',
    icon: 'check',
    everyProject: true,
    get what() { return t('nav.what.gates') },
    badge: null,
    rail: true,
  },
  {
    key: 'readiness',
    surface: 'rail.readiness',
    get label() { return t(RAIL_WORD_KEYS['rail.readiness']) },
    to: pathFor('readiness'),
    page: 'readiness',
    icon: 'signatures',
    everyProject: true,
    get what() { return t('nav.what.readiness') },
    badge: null,
    rail: true,
  },
  {
    key: 'signingPackages',
    surface: 'rail.signingpackages',
    get label() { return t(RAIL_WORD_KEYS['rail.signingpackages']) },
    to: pathFor('signingPackages'),
    page: 'signingPackages',
    icon: 'signatures',
    everyProject: true,
    get what() { return t('nav.what.signingPackages') },
    badge: null,
    rail: true,
  },
  {

    key: 'toolset',
    surface: 'rail.toolset',
    get label() { return t(RAIL_WORD_KEYS['rail.toolset']) },
    to: toolsetPath(),
    page: 'toolset',
    icon: 'toolset',
    get what() { return t('nav.what.toolset') },
    badge: null,
    rail: true,
  },
  {
    key: 'honourBoard',
    surface: 'rail.honour',
    get label() { return t(RAIL_WORD_KEYS['rail.honour']) },
    to: pathFor('honourBoard'),
    page: 'honourBoard',
    icon: 'honour',
    get what() { return t('nav.what.honourBoard') },
    badge: null,
    rail: true,
  },
  {

    key: 'settings',
    surface: 'rail.settings',
    get label() { return t(RAIL_WORD_KEYS['rail.settings']) },
    to: pathFor('settings'),
    page: 'settings',
    icon: 'settings',
    everyProject: true,
    get what() { return t('nav.what.settings') },
    badge: null,
    rail: true,
  },
  {

    key: 'sheet',
    surface: 'rail.sheet',
    get label() { return t(RAIL_WORD_KEYS['rail.sheet']) },
    to: pathFor('sheet'),
    page: 'sheet',
    icon: 'components',
    get what() { return t('nav.what.sheet') },
    badge: null,
    rail: false,
  },
  // THE OFFICE CONTROLS, a developer-only panel on Settings until wave 13y round 125, now the Developer group's last
  // page. They are the office's own, like Settings, so the row carries Settings' every-project mark.
  {
    key: 'officeControls',
    surface: 'rail.officecontrols',
    get label() { return t(RAIL_WORD_KEYS['rail.officecontrols']) },
    to: pathFor('officeControls'),
    page: 'officeControls',
    icon: 'switch',
    everyProject: true,
    get what() { return t('nav.what.officeControls') },
    badge: null,
    rail: true,
  },
]

/**
 * THE PAGES THAT READ EVERY PROJECT AND HAVE NO SIDEBAR ROW TO CARRY THE MARK. A row marked
 * `everyProject` says its page reads every project; a page in this list reads every project and has no
 * row to carry that mark, so the mark is kept here. A page is in this list or carries the mark on its
 * row, never both.
 *
 * NEEDS YOU IS HERE BECAUSE IT HAS NO ROW. A decision moved Home's sections to pages opened by a press
 * on Home and from no sidebar row. Message GLtVd7noWIDe kept it that way: the
 * mark stays on the page and the sidebar does not change. Needs you belongs here because it reads
 * every project (message 8NsXCjJEaqQR item 4) and a page must never show a project it does
 * not read.
 *
 * THE SIDEBAR'S ARRANGEMENT IS HERE FOR THE SAME REASON. It was a panel on Settings, which carries the mark, until wave
 * 13y round 125 gave it a page reached from Settings' Looks and from no row. The arrangement is the office's, for
 * every project.
 */
export const EVERY_PROJECT_PAGES_WITHOUT_A_ROW: readonly Route['name'][] = ['needsyou', 'sidebarArrangement']

export interface RailGroup {
  /** A group with a category page is keyed by its CategoryKey; All projects has no page. */
  key: 'all' | CategoryKey
  caption: string
  keys: readonly string[]
  developer?: true
}

/**
 * THE SIDEBAR'S GROUPS, IN THE ORDER THEY ARE DRAWN. The pages every project shares come first, then
 * the project's own pages as first-level rows in a marked block, then Agents, Office and, in developer
 * mode, Developer. Settings is in no group: it stands at the foot.
 *
 * THE `project` GROUP'S KEYS ARE THE ONE LIST OF THE PAGES IN THE PROJECT BLOCK. The block's rows, the
 * project's category page and the tabs above each of its pages all read this list and no other.
 * Moving a page out of the project block is a change to the keys of these two groups and nothing
 * else; tests/the-sidebar-project-block.test.ts holds every reader to it.
 *
 * GOALS, COUNTERS, CONTEXT BUNDLES AND ALL RECORDS STAND UNDER ALL PROJECTS, as of an earlier
 * round: their pages have read across projects since an earlier round. The rows already
 * under All projects keep their places and the four follow, in the order they had in the project
 * block, so All records ends the group.
 *
 * MESSAGES STANDS IN NO GROUP. Messages belong to no project, and a row in
 * the project block made them look as if they did. They are read in the chat, which reads across
 * projects and filters by project; the chat's foot still leads to the Messages page.
 */
function withCaptions(arrangement: SidebarArrangement): readonly RailGroup[] {
  return arrangement.groups.map(group => ({
    key: group.key as RailGroup['key'], keys: group.keys,
    get caption() { return t(SIDEBAR_CAPTION_KEYS[group.key as keyof typeof SIDEBAR_CAPTION_KEYS]) },
    ...(group.key === 'developer' ? { developer: true as const } : {}),
  }))
}
export const SHIPPED_RAIL_GROUPS: readonly RailGroup[] = withCaptions(SHIPPED_SIDEBAR)
/** Every rail, category, path and project-name reader uses this effective office-wide choice. */
export function railGroups(): readonly RailGroup[] { return withCaptions(sidebarReading().arrangement) }

/** The row the foot's Settings entry draws. It is in no group. */
export const FOOT_ROW_KEYS: readonly string[] = ['settings']
/** The foot's rows as the foot draws them. The quick search finds them after All pages' rows. */
export function theFootRows(): Destination[] { return pick(FOOT_ROW_KEYS) }

/**
 * THE PAGES IN FRONT are the pages the person reading has pinned, in their order, read by src/web/lib/sidebar-pins.ts:
 * open, narrowed and in the menu, and in every mode, so a pinned Developer page stands in front in normal mode too. The
 * chat's entry stands after Home, and first when Home is not pinned; All pages stands after the last of them. A pinned
 * page of the project is not in front: the project block draws it under the project's name (`theProjectPins`). Every
 * other page is listed on All pages. The arrangement decides All pages' groups and their order, and not what stands in
 * front.
 */
export function theFront(pins: readonly string[]): ({ chat: true } | { chat: false; destination: Destination })[] {
  const inFront = pins.filter((key) => !isAProjectPage(key))
  const front: ({ chat: true } | { chat: false; destination: Destination })[] = pick(inFront).map((destination) => ({ chat: false, destination }))
  front.splice(inFront.indexOf('home') + 1, 0, { chat: true })
  return front
}

/** The pages of the project the person pinned, in their order. The project block draws them under its name. */
export function theProjectPins(pins: readonly string[]): Destination[] {
  return pick(pins.filter(isAProjectPage))
}

/** Whether a page is in the arrangement's project group, so that a pin puts it in the project block. */
export function isAProjectPage(key: string): boolean {
  return railGroups().find((group) => group.key === 'project')?.keys.includes(key) ?? false
}

/**
 * THE GROUPS ALL PAGES DRAWS: the arrangement's groups in their order, each with every one of its pages, and Developer
 * only in developer mode. A page in front is marked, and All pages draws it grey.
 */
export function allPagesDrawn(mode: Mode, pins: readonly string[]): readonly { group: RailGroup; rows: { destination: Destination; inFront: boolean }[] }[] {
  return railGroups()
    .filter((group) => !group.developer || mode === 'inspect')
    .map((group) => ({ group, rows: groupRows(group).map((destination) => ({ destination, inFront: pins.includes(destination.key) })) }))
}

/**
 * THE PAGES ALL PAGES LISTS: what it draws, less the pages in front. The number on the sidebar's entry counts these, so
 * it counts the names All pages draws that are not grey.
 */
export function allPagesGroups(mode: Mode, pins: readonly string[]): readonly { group: RailGroup; rows: Destination[] }[] {
  return allPagesDrawn(mode, pins).map(({ group, rows }) => ({ group, rows: rows.filter((row) => !row.inFront).map((row) => row.destination) }))
}

/**
 * WHEN ALL PAGES IS LIT: on its own page, and on any page it lists or leads to, unless an entry in front is lit
 * already. A record's page lights the row its kind belongs to, so it lights All pages only when that row is not in
 * front.
 */
export function allPagesMark(page: Route['name'], mode: Mode, pins: readonly string[], familyOnPage?: KindFamily, recordOnScreen?: RecordOnScreen): NavMark {
  if (page === 'allPages') return 'page'
  if (pick(pins).some((destination) => markFor(destination, page, familyOnPage, recordOnScreen) !== null)) return null
  if (page === 'plugin' || categoryOfPage(page) !== null) return 'section'
  const listed = allPagesGroups(mode, pins).some(({ rows }) => rows.some((destination) => markFor(destination, page, familyOnPage, recordOnScreen) !== null))
  return listed ? 'section' : null
}

function pick(keys: readonly string[]): Destination[] {
  return keys.map((key) => {
    const found = DESTINATIONS.find((d) => d.key === key)
    if (found === undefined) throw new Error(`No destination called "${key}".`)
    return found
  })
}

export function groupRows(group: RailGroup): Destination[] {
  return pick(group.keys)
}

/**
 * WHERE A PAGE SITS IN THE SIDEBAR: its group and its own row. Item S2 of an earlier piece of work.
 *
 * The frame draws a path and the group's other pages above every page that belongs to a group
 * with a category page. The row is the one `markFor` marks as the page, so the path and the rail's
 * mark are one reading. A record, a message or a page in no group answers null.
 */
export function whereThePageIs(
  page: Route['name'],
  familyOnPage?: KindFamily,
): { group: RailGroup & { key: CategoryKey }; row: Destination } | null {
  for (const group of railGroups()) {
    if (group.key === 'all') continue
    const row = groupRows(group).find((destination) => markFor(destination, page, familyOnPage) === 'page')
    if (row !== undefined) return { group: group as RailGroup & { key: CategoryKey }, row }
  }
  return null
}

/** The name the sidebar gives the project box: the project's name, or the short mark. */
export function projectCaption(sight: WorkspaceSight): string {
  return sight.named ? content(projectName(sight.id, sight.title)) : t('nav.empty')
}

export function coveredKinds(): Set<string> {
  const covered = new Set<string>()
  for (const group of railGroups()) {
    for (const destination of groupRows(group)) {
      if (destination.kind !== undefined) covered.add(destination.kind)
      if (destination.family !== undefined) {
        for (const kind of KIND_FAMILIES[destination.family].kinds) covered.add(kind)
      }
      for (const kind of destination.alsoCovers ?? []) covered.add(kind)
    }
  }
  return covered
}

export const BADGE_RULE =
  'A badge counts what needs you on that page, and the page says the same number in the same words. A page that ' +
  'cannot honestly produce that number has no badge.'

export type NavMark = 'page' | 'section' | null

export interface RecordOnScreen {
  kind: RecordKind | null
}

function rowKeyOf(kind: RecordKind | null): string | null {
  if (kind === null) return null
  for (const destination of DESTINATIONS) if (destination.kind === kind) return destination.key
  for (const destination of DESTINATIONS) if ((destination.alsoCovers ?? []).includes(kind)) return destination.key
  const family = familyOf(kind)
  if (family !== null) {
    for (const destination of DESTINATIONS) if (destination.family === family) return destination.key
  }
  return null
}

function recordRowOnScreen(record: { kind: RecordKind | null }): string {
  return rowKeyOf(record.kind) ?? 'records'
}

export function navMark(item: Route['name'], current: Route['name']): NavMark {
  if (item === current) return 'page'
  if (item === 'records' && current === 'record') return 'section'
  return null
}

export function markFor(
  destination: Destination,
  current: Route['name'],
  familyOnPage?: KindFamily,
  recordOnScreen?: RecordOnScreen,
): NavMark {

  const readingOne =
    current === 'record' || current === 'message' || current === 'problem' || current === 'session'
  if (destination.page === 'family') {
    const asPage = current === 'family' && familyOnPage === destination.family ? 'page' : null
    if (asPage !== null) return asPage
    if (!readingOne) return null
  } else {
    if (destination.page === current) return 'page'
    if (!readingOne) return null
  }
  if (recordOnScreen === undefined) return destination.key === 'records' ? 'section' : null
  return destination.key === recordRowOnScreen(recordOnScreen) ? 'section' : null
}

function rowName(key: string): string {
  const found = DESTINATIONS.find((d) => d.key === key)
  if (found === undefined) throw new Error(`No destination called "${key}".`)
  return found.label
}

export const PAGE_TITLES: Readonly<Record<Route['name'], string>> = {
  get home() { return rowName('home') },
  get records() { return rowName('records') },
  get modules() { return rowName('modules') },
  get pipeline() { return rowName('pipeline') },
  get sessions() { return rowName('sessions') },
  get interrupted() { return rowName('interrupted') },
  get mergequeue() { return rowName('mergequeue') },
  get queries() { return rowName('queries') },
  get plan() { return rowName('schedule') },
  get plans() { return rowName('plans') },
  get onePlan() { return rowName('plans') },
  get horizons() { return rowName('horizons') },
  get governance() { return rowName('decisions') },
  get placeholders() { return rowName('placeholders') },
  get bundles() { return rowName('bundles') },
  get tasksToTake() { return rowName('tasksToTake') },
  get counters() { return rowName('counters') },
  get quickNote() { return t('quickNote.title') },
  get yourWords() { return rowName('yourWords') },
  get resources() { return rowName('resources') },
  get checklists() { return rowName('checklists') },
  get flows() { return rowName('flows') },
  get shelved() { return rowName('shelved') },
  get agents() { return rowName('agents') },
  get agentsCategory() { return t('nav.group.agents') },
  get officeCategory() { return t('nav.group.office') },
  get developerCategory() { return t('nav.group.developer') },
  // THE PROJECT'S OWN PAGE IS NAMED BY THE WORD ITS BLOCK DRAWS.
  get projectCategory() { return t('sidebarProject.project') },
  // THE CHAT PAGE IS NAMED WHAT ITS SIDEBAR ENTRY SAYS. Plan row C1.
  get chat() { return t('nav.chat') },
  get messages() { return rowName('messages') },
  get working() { return rowName('working') },
  get usage() { return rowName('usage') },
  get versionHistory() { return rowName('versionHistory') },
  // A PAGE WITH NO RAIL ROW IS NAMED BY THE KEY ITS OWN HEADING READS, so the phone bar and the
  // heading are one word in every language. Plan 7FEOshq3mBGG, row F1.
  get folderreading() { return t('dev.folderreading.aFolderAnAgentRead') },
  // THE PROJECT GRAPH HAS NO RAIL ROW, so it reads the key its own page's heading reads.
  get projectgraph() { return t('projectGraph.title') },
  // THE PAGES HOME'S MOVED SECTIONS WENT TO, named by the words of their own headings.
  get needsyou() { return t('home.needsYou') },
  get claims() { return t('w13w.claimsPage.title') },
  get projects() { return t('home.projects') },
  get said() { return t('home.said') },
  get recordquestions() { return t('home.questions') },
  get settings() { return rowName('settings') },
  get pairing() { return t('g4.pairing.title') },
  get welcome() { return t('welcomeGuide.title') },
  get sheet() { return rowName('sheet') },
  get family() { return rowName('records') },
  get record() { return t('unlistedWords.page.record') },
  get message() { return rowName('messages') },
  get problem() { return rowName('work') },
  get session() { return rowName('sessions') },
  // A HANDBOOK HAS NO RAIL ROW, so it is named by the key its own page's loading line reads.
  get handbook() { return t('handbookPage.aHandbook') },
  get runtime() { return t('dev.runtime.whatIsRunning') },
  get worlds() { return rowName('worlds') },
  get terminals() { return rowName('terminals') },
  get worldhere() { return t('dev.worldhere.thisWorld') },
  get who() { return t('unlistedWords.page.who') },
  get notebook() { return t('g6b.notebook.title') },
  get embassy() { return rowName('embassy') },
  get roles() { return rowName('roles') },
  get casting() { return rowName('casting') },
  // A NEW ROLE CARD, criterion P51. It is not a row in the rail: it is reached by pressing the add
  get roleNew() { return t('unlistedWords.page.roleNew') },
  get roleCensus() { return t('unlistedWords.page.roleCensus') },
  get regulations() { return rowName('regulations') },
  get readiness() { return rowName('readiness') },
  get signingPackages() { return rowName('signingPackages') },
  get toolset() { return rowName('toolset') },
  get honourBoard() { return rowName('honourBoard') },
  get board() { return rowName('board') },
  get gates() { return rowName('gates') },
  get officeControls() { return rowName('officeControls') },
  // THE SIDEBAR'S ARRANGEMENT HAS NO ROW, so it is named by its own heading's key, as the pages above are.
  get sidebarArrangement() { return t('sidebarSetting.title') },
  get allPages() { return t('nav.allPages') },
  get myNotes() { return t('myNotes.title') },
  get visitor() { return t('unlistedWords.page.visitor') },
  get incident() { return t('unlistedWords.page.incident') },
  // A PLUGIN'S PAGE IS HEADED BY ITS MANIFEST'S TITLE, which this table cannot know, so the phone bar says what it is.
  get plugin() { return t('pluginPage.title') },
  get unknown() { return t('unlistedWords.page.unknown') },
}

export function pageTitle(page: Route['name'] | Route): string {
  if (typeof page === 'string') return PAGE_TITLES[page]
  // A PAGE WITH A SIDEBAR ROW IS NAMED BY THAT ROW'S KEY, so the phone's top bar and the sidebar say
  // one word in every language. The row is the one markFor marks as the page, the same reading the
  // rail's mark and the path use. Until an earlier round a family page was named by familyWord, and the
  // Reports page's bar said "Reports and notes" under a row that says "Reports" (problem
  // IfJ_JmeZ-3vr, plan 7FEOshq3mBGG row F1).
  const family = page.name === 'family' ? page.family : undefined
  const row = DESTINATIONS.find((destination) => markFor(destination, page.name, family) === 'page')
  if (row !== undefined) return row.label
  // A family with no row is named through familyWord, in the page language; KIND_FAMILIES keeps the
  // English the server sends.
  return page.name === 'family' ? familyWord(page.family).text : PAGE_TITLES[page.name]
}

export function badgeCount(reply: AttentionHome, source: Exclude<BadgeSource, { of: 'waiting' } | { of: 'yourWords' } | { of: 'checklists' }>): number {
  if (source.of === 'everything') return needsSomebodyNow(reply)
  if (source.of === 'reports') return reply.reportCounts.waiting
  // The server counts the whole project. A kind or family missing from its counts has no rows.
  if (source.of === 'family') return reply.badgeCounts.byFamily[source.family] ?? 0
  return reply.badgeCounts.byKind[source.kind] ?? 0
}

export function anySafety(reply: AttentionHome): boolean {
  return reply.badgeCounts.safety
}

export const SIDEBAR_KEY = 'mole-office.shell.sidebar'

export const SIDEBAR_STATES = ['expanded', 'collapsed'] as const
export type SidebarState = (typeof SIDEBAR_STATES)[number]

export const DEFAULT_SIDEBAR_STATE: SidebarState = 'expanded'

/**
 * OPEN OR FOLDED WHILE THE CHAT IS BESIDE THE PAGE, a choice of its own, kept apart from the sidebar's own so that
 * putting the chat away brings the sidebar back as it was. It starts folded (design D).
 */
export const SIDEBAR_BESIDE_THE_CHAT_KEY = 'mole-office.shell.sidebar-beside-the-chat'
export const DEFAULT_SIDEBAR_BESIDE_THE_CHAT: SidebarState = 'collapsed'

/** How wide the open sidebar is, in pixels. */
const SIDEBAR_OPEN_WIDTH = 248
/** How wide the folded sidebar is: an icon with its count, so it follows the type size and the density. */
const SIDEBAR_FOLDED_WIDTH = 'calc(3rem + var(--pad) * 2)'

export function readSidebarState(
  store: KeyValueStore,
  key: string = SIDEBAR_KEY,
  fallback: SidebarState = DEFAULT_SIDEBAR_STATE,
): { state: SidebarState; fault: string | null } {
  let raw: string | null
  try {
    raw = store.getItem(key)
  } catch {
    return {
      state: fallback,
      fault: t('nav.widthReadFailed'),
    }
  }
  if (raw === null) return { state: fallback, fault: null }
  const found = SIDEBAR_STATES.find((candidate) => candidate === raw)
  if (found === undefined) {
    return {
      state: fallback,
      fault: t('nav.widthUnknown'),
    }
  }
  return { state: found, fault: null }
}

export function writeSidebarState(store: KeyValueStore, state: SidebarState, key: string = SIDEBAR_KEY): { fault: string | null } {
  try {
    store.setItem(key, state)
    return { fault: null }
  } catch {
    return {
      fault: t('nav.widthSaveFailed'),
    }
  }
}

const ICON_PATHS: Readonly<Record<IconName, React.ReactNode>> = {
  chat: <path d="M4 5h16v11H8l-4 4z" />,
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M7 9.5l3 2.5-3 2.5" />
      <path d="M12.5 15h4.5" />
    </>
  ),
  worlds: (
    <>
      <circle cx="11" cy="12" r="7.5" />
      <path d="M3.5 12h15" />
      <path d="M11 4.5c2.4 2.2 2.4 12.8 0 15" />
      <path d="M11 4.5c-2.4 2.2-2.4 12.8 0 15" />
    </>
  ),
  embassy: (
    <>
      <path d="M4 20h16" />
      <path d="M6 20V10.5h12V20" />
      <path d="M5 10.5L12 6l7 4.5" />
      <path d="M12 6V2.5" />
      <path d="M12 3h4l-1.4 1.6L16 6h-4" />
    </>
  ),
  roles: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10.5" r="2" />
      <path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4" />
      <path d="M14.5 10h4" />
      <path d="M14.5 13.5h4" />
    </>
  ),
  // THE CASTING TABLE: a clapperboard.
  casting: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
      <path d="M3.5 9l1.2-4.2 15.3 0 .5 4.2" />
      <path d="M8 4.8L9.6 9" />
      <path d="M13 4.8L14.6 9" />
      <path d="M7 14h10" />
    </>
  ),
  regulations: (
    <>
      <path d="M12 6.8c-1.5-1.3-3.8-1.9-7.5-1.9v12.6c3.7 0 6 .6 7.5 1.9 1.5-1.3 3.8-1.9 7.5-1.9V4.9c-3.7 0-6 .6-7.5 1.9z" />
      <path d="M12 6.8v12.6" />
    </>
  ),
  toolset: (
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2l-5.6 5.6a1.4 1.4 0 0 0 2 2l5.6-5.6a4 4 0 0 0 5.2-5.2l-2.4 2.4-2-2 2.4-2.4z" />
    </>
  ),
  today: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </>
  ),
  records: (
    <>
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
      <path d="M8.5 6H20M8.5 12H20M8.5 18H20" />
    </>
  ),
  plans: (
    <>
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </>
  ),
  work: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 12l3 3 6-6" />
    </>
  ),
  belief: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.4" />
      <path d="M12 16.5h.01" />
    </>
  ),
  findings: (
    <>
      <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0" />
      <path d="M12 16.5l4.2-4.6" />
      <path d="M3.5 16.5h17" />
    </>
  ),
  ideas: (
    <>
      <path d="M9 15.5a5.5 5.5 0 1 1 6 0v2h-6z" />
      <path d="M10 20.5h4" />
    </>
  ),
  notes: (
    <>
      <path d="M5.5 3.5h9l4.5 4.5v12h-13.5z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  module: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17" />
    </>
  ),
  pipeline: (
    <>
      <rect x="2.5" y="9" width="6" height="6" rx="1.5" />
      <rect x="15.5" y="9" width="6" height="6" rx="1.5" />
      <path d="M8.5 12h7" />
    </>
  ),
  session: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 10l3 2.5L7 15" />
      <path d="M12.5 15.5H17" />
    </>
  ),
  working: (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="18.5" cy="6.5" r="1.8" />
    </>
  ),
  links: (
    <>
      <path d="M10.5 13.5a3.8 3.8 0 0 1 0-5.4l2-2a3.8 3.8 0 1 1 5.4 5.4l-1 1" />
      <path d="M13.5 10.5a3.8 3.8 0 0 1 0 5.4l-2 2a3.8 3.8 0 1 1-5.4-5.4l1-1" />
    </>
  ),
  package: (
    <>
      <path d="M3.5 8.2L12 4l8.5 4.2v7.6L12 20l-8.5-4.2z" />
      <path d="M3.5 8.2L12 12l8.5-4.2" />
      <path d="M12 12v8" />
    </>
  ),
  components: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  settings: (
    <>
      <path d="M9 4v16M15 4v16" />
      <circle cx="9" cy="8.5" r="2.3" />
      <circle cx="15" cy="15.5" r="2.3" />
    </>
  ),
  switch: <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7.2 6.6a7 7 0 1 0 9.6 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  collapse: <path d="M14.5 6l-6 6 6 6" />,
  expand: <path d="M9.5 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 5h11M4 12h7M4 19h7M14 16l3 3 5-6" />,
  // A FLOW: three stages in a row, each joined to the next.
  flows: (
    <>
      <rect x="1.5" y="8.5" width="5" height="7" rx="1" />
      <rect x="9.5" y="8.5" width="5" height="7" rx="1" />
      <rect x="17.5" y="8.5" width="5" height="7" rx="1" />
      <path d="M6.5 12h3M14.5 12h3" />
    </>
  ),
  signatures: <path d="M3 17c2-4 4-5 5-2s2 3 4 0M14 20h7M15 13l5-5-3-3-5 5v3z" />,
  honour: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  // THE PROJECT BOARD: a table of rows, its first column wider than the rest.
  board: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15" />
    </>
  ),
  // ALL PAGES: four squares, for the pages that are not in front.
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  // HOME: a house, as the chosen designs draw it, open, narrowed and in the menu.
  house: <path d="M3 11l9-7 9 7v9H15v-6H9v6H3z" />,
  // FIND: a magnifying glass, at the start of All pages' search field.
  find: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>
  ),
  // PIN AND UNPIN: a drawing pin, and the same pin struck through, beside each page on All pages.
  pin: <path d="M9 3.5h6M10 3.5v6.5l-3.5 4h11L14 10V3.5M12 14v6.5" />,
  unpin: <path d="M9 3.5h6M10 3.5v6.5l-3.5 4h11L14 10V3.5M12 14v6.5M4 4l16 16" />,
  // PEN: a pencil, on New note, as option C of quick notes draws it.
  pen: <path d="M4 20l1.2-4.8L15.6 4.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.8 18.8zM14 6.4l3.6 3.6" />,
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="shell-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  )
}

const WEB_SESSION = `web-${Math.random().toString(36).slice(2, 8)}`

type ActorKey = WebActor['type']

export function actorChoices(): { value: ActorKey; name: string; actor: WebActor }[] { return [
  { value: 'human', name: THE_PERSON, actor: { type: 'human', id: THE_PERSON } },
  { value: 'agent', name: 'claude', actor: { type: 'agent', id: 'claude', sessionId: WEB_SESSION } },
  { value: 'system', name: PRODUCT_NAME, actor: { type: 'system', id: moleOfficeId() } },
] }

function actorLabel(choice: { name: string; value: ActorKey; actor: WebActor }, mode: Mode): string {
  const word = actorTypeWord(choice.value, mode).text
  const name = mode === 'normal' ? choice.name : choice.actor.id
  return word.toLowerCase() === name.toLowerCase() ? word : `${name} (${word})`
}

export function WhoWritesControl() {
  const actor = useSyncExternalStore(subscribeActor, getActor, getActor)
  const mode = useMode()
  const options = actorChoices().map((c) => ({ value: c.value, label: actorLabel(c, mode) }))

  return (
    <Select<ActorKey>
      id="settings-writer"
      aria-label={t(settingsControlWord('settings.writer', 'nav.writerChoice'))}
      value={actor.type}
      options={options}
      onChange={(key) => {
        const picked = actorChoices().find((c) => c.value === key)
        if (!picked) throw new Error(`No actor choice called "${key}"`)
        setActor(picked.actor)
      }}
    />
  )
}

/**
 * WHO THIS PAGE WRITES AS, WHEN IT IS NOT THE PERSON. A decision takes away the "Writing as" line,
 * because the foot now names the person. Developer mode can still make the page
 * write as an agent or as Mole Office, and that choice is kept when the page goes back to normal mode,
 * so the foot says so on every path where the writer is not the person. Null when it is the person.
 */
function useOtherWriter(): string | null {
  const actor = useSyncExternalStore(subscribeActor, getActor, getActor)
  const mode = useMode()
  if (actor.type === 'human' && actor.id === THE_PERSON) return null
  const choice = actorChoices().find((c) => c.value === actor.type && c.actor.id === actor.id)
  return choice === undefined ? `${actorTypeWord(actor.type, mode).text}: ${actor.id}` : actorLabel(choice, mode)
}

/**
 * THE PERSON'S NAME, AS THE OFFICE KEEPS IT: the name on their row in the people registry, the name
 * their own card changes. It is read through `readParticipantsOnce`, which the chat panels share, so the page asks
 * for it once. `reading` until it answers; `failed` when it could not be read or their row is not in
 * the answer. Nothing stands in for a name that is not known. A name changed on their card shows here
 * at the next load of the page.
 */
type PersonName = { name: string; avatarUrl: string } | 'reading' | { failed: 'sidebarProject.nameNotKept' | 'sidebarProject.nameNotRead'; detail: string }

function usePersonName(): PersonName {
  const [said, setSaid] = useState<PersonName>('reading')
  useEffect(() => {
    let live = true
    readParticipantsOnce().then(
      (reply) => {
        const row = reply.people.find((person) => person.id === THE_PERSON)
        if (!live) return
        setSaid(row === undefined || row.name.trim() === '' ? { failed: 'sidebarProject.nameNotKept', detail: '' } : { name: row.name, avatarUrl: row.avatarUrl })
      },
      (err: unknown) => {
        if (live) setSaid({ failed: 'sidebarProject.nameNotRead', detail: err instanceof Error ? err.message : String(err) })
      },
    )
    return () => {
      live = false
    }
  }, [])
  return said
}

/**
 * THE FOOT: Settings as an entry like the ones above it, with the press that narrows or widens the sidebar at the
 * right end of its row, then the person's picture or initial and name, a light or dark switch and the Shutdown press.
 * Narrowed, each stands under the one before it.
 *
 * It is fixed at the bottom of the sidebar and nothing in it opens. The switch writes the same stored
 * theme the look controls on the Settings page write, through `choosePreset`, and shows what they
 * show. The language is chosen in Settings, not here.
 *
 * THE LINE UNDER SETTINGS: the name, then a light press and a dark press, then the
 * Shutdown press. The presses show only an icon, as the narrow press does; each has its name for a
 * screen reader and a hover word, in the page language. The Shutdown press is an icon like the others (criterion
 * W5, wave 13n round 58; src/web/components/ShutDown.tsx). A name that does not fit beside the presses
 * wraps between words onto a second line, as design A draws it. Only a
 * name that needs more than two lines is cut, with an ellipsis, and it shows whole on hover. When the page
 * writes as somebody else, a sentence above the line says so.
 *
 * THE DISC IS THE PERSON'S OWN PICTURE when they have chosen one, through the same Avatar the
 * message pages and the chat draw; the letter stays for a person with no picture, or when the
 * picture cannot be loaded. While a page takes a newer answer, a thin ring turns around the disc
 * (and stands still when reduced motion is asked for). The ring takes no space and no press, so
 * nothing here is drawn over the foot's row. Below 1024 the sidebar is a drawer, so the same mark
 * sits on the press that opens it, in src/web/App.tsx.
 */
function SidebarFoot({ page, fault, onClose, collapsed, onToggle }: { page: Route['name']; fault: string | null; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const mode = useMode()
  const person = usePersonName()
  const writer = useOtherWriter()
  const { presets, faults } = usePresets()
  const marks = useSyncExternalStore(subscribeReReadMarks, theReReadMarks, theReReadMarks)
  const refreshing = marks.refreshing > 0
  const settings = pick(FOOT_ROW_KEYS)
  const keptNot = faults.filter((one): one is Extract<PresetFault, { axis: 'storage' }> => one.axis === 'storage' && one.kind === 'write')
  const writes = writer === null ? null : t('sidebarProject.writesAs', { name: writer })
  const personRow = typeof person === 'object' && 'name' in person ? person : null
  const name = personRow === null ? null : content(personRow.name)
  // A STORED PICTURE IS SERVED FROM THE ASSETS DOOR; a person with none is served the picture they
  // are offered, or the drawing made from their id. The letter is what this drew before for that
  // person, and it stays while the picture loads and when the picture is gone.
  const theDrawnDefault = avatarUrlFor(defaultAvatarAssetId({ kind: 'person', id: THE_PERSON }))
  const picture = personRow !== null && personRow.avatarUrl.startsWith(avatarUrlFor('')) && personRow.avatarUrl !== theDrawnDefault
    ? personRow.avatarUrl
    : null
  const letter = name === null ? '' : name.slice(0, 1).toUpperCase()
  return (
    <section className="sbp-foot" aria-label={t('sidebarProject.footLabel')}>
      {writes === null ? null : <p className="sbp-writer" role="status">{writes}</p>}
      <div className="sbp-settings-row">
        <ul className="shell-list">{settings.map((destination) => (
          <li key={destination.key}>
            <a className="shell-link sbp-settings" href={`#${destination.to}`} title={destination.what} onClick={onClose}
              {...(markFor(destination, page) === 'page' ? { 'aria-current': 'page' as const } : {})}
              {...declaredAttributes({ surface: destination.surface })}>
              <span className="shell-ico-box"><Icon name={destination.icon} /></span>
              <span className="shell-label sbp-settings-word" {...DRAWS_THE_NAME}>{destination.label}</span>
            </a>
          </li>
        ))}</ul>
        <button type="button" className="shell-collapse" onClick={onToggle} aria-expanded={!collapsed} title={t(collapsed ? 'nav.widen' : 'nav.narrow')}>
          <Icon name={collapsed ? 'expand' : 'collapse'} />
          <span className="sr-only">{t(collapsed ? 'nav.widen' : 'nav.narrow')}</span>
        </button>
      </div>
      <div className="sbp-foot-row">
        <div className="sbp-person">
          <span className="sbp-disc" aria-hidden="true" data-writer={writer === null ? undefined : 'other'}
            data-refreshing={refreshing ? '1' : undefined}
            title={refreshing ? t('frameFiles.reread.refreshing') : (writes ?? undefined)}>
            {picture === null ? letter : (
              <>
                <span className="sbp-disc-letter">{letter}</span>
                <Avatar kind="person" id={THE_PERSON} name="" url={picture} size={26} className="sbp-disc-picture" asksAgain={false} />
              </>
            )}
          </span>
          <span className="sbp-person-name" title={name ?? undefined}>
            {name !== null ? name : person === 'reading' || !('failed' in person) ? t('category.glance.reading') : (
              // The request's own words are machinery, so only developer mode adds them.
              <Absence tier="ordinary" title={mode === 'inspect' && person.detail !== '' ? `${t(person.failed)} ${person.detail}` : t(person.failed)} />
            )}
          </span>
        </div>
        <div className="sbp-look" role="group" aria-label={t('sidebarProject.look')}
          title={presets.theme === 'auto' ? t('sidebarProject.lookFollowsBrowser') : undefined}>
          {(['light', 'dark'] as const).map((theme) => (
            <button key={theme} type="button" className="sbp-look-press" aria-pressed={presets.theme === theme}
              aria-label={t(THEME_LABELS[theme])} title={t(theme === 'light' ? 'sidebarFeedback.lookLight' : 'sidebarFeedback.lookDark')}
              onClick={() => choosePreset('theme', theme)}>
              <Icon name={theme === 'light' ? 'sun' : 'moon'} />
            </button>
          ))}
        </div>
        <ShutDownPress className="sbp-shut-down" icon={<Icon name="power" />} />
      </div>
      {keptNot.map((one) => <p key={one.reason} className="shell-fault" role="status">{presetFaultSentence(one, mode === 'inspect')}</p>)}
      {fault === null ? null : <p className="shell-fault" role="status">{fault}</p>}
    </section>
  )
}

export { suggestedProjectId } from './ProjectsPanel.tsx'

function ShortWarning({ warning }: { warning: WorkspaceWarning }) {
  const mode = useMode()
  return mode === 'inspect' ? (
    <details className="shell-fault" role="status">
      <summary className="shell-fault-short">{warning.short}</summary>
      <p className="shell-fault-said">{warning.said}</p>
    </details>
  ) : <p className="shell-fault" role="status">{warning.short}</p>
}

/**
 * THE SQUARE THAT STANDS FOR A PROJECT: the first letters of its first two words that hold a letter or a digit, or
 * its first two letters or digits when its name is one word. Every character that is not a letter or a digit is
 * skipped, in every language the office draws, so a word that begins with a bracket gives its first letter, not the
 * bracket. A name of punctuation alone gives nothing, because no letter or digit is left to pick. A project whose name
 * is not known is the short mark.
 */
export function projectInitials(name: string): string {
  const words = name.normalize('NFC').split(/\s+/)
    .map((word) => [...word].filter((character) => /[\p{L}\p{N}]/u.test(character)).join(''))
    .filter((word) => word !== '')
  const letters = words.length > 1 ? `${[...words[0]!][0]!}${[...words[1]!][0]!}` : [...(words[0] ?? '')].slice(0, 2).join('')
  return letters.toUpperCase()
}

/**
 * WHAT IS WRONG WITH THE PROJECT ON SCREEN: a stored project that could not be read, the sight's own fault, and a
 * project list that could not be read. The project block says each of them on every page.
 */
function projectFaults(sight: WorkspaceSight, workspaces: AsyncState<WorkspacesReply>): WorkspaceWarning[] {
  const boot = workspaceBootFault()
  return [
    boot === null ? null : theWarningForAnUnreadableStoredProject(boot),
    sight.fault,
    workspaces.status === 'error' ? theWarningForAProjectListThatFailed(workspaces.message, workspaces.fault?.status) : null,
  ].filter((fault): fault is WorkspaceWarning => fault !== null)
}

/**
 * THE PROJECT BLOCK. Proposal vVPo6PUlGNB- block b-4.
 *
 * It stands in the sidebar below the pages in front and above All pages, on every page, and names the project: its
 * initials in a square, the Switch, and its name in bold, which opens the project's own page. What is wrong with the
 * project is said under them. The Switch press opens the list of projects DOWNWARD, inside the block and above the
 * rows, with the one being read ticked; a press on another chooses it and closes the list. Nothing here opens upward.
 *
 * Its rows are the pages of the project the person pinned, in their order, and with none pinned it draws none: the
 * project's pages are listed on All pages. Narrowed, the block is its initials, which widen the sidebar, and its rows
 * are their icons.
 */
function ProjectBlock({ sight, workspaces, collapsed, onExpand, opened, rows }: {
  sight: WorkspaceSight
  workspaces: AsyncState<WorkspacesReply>
  collapsed: boolean
  onExpand: () => void
  opened: string | undefined
  rows: React.ReactNode
}) {
  const [choosing, setChoosing] = useState(false)
  const switchPress = useRef<HTMLButtonElement>(null)
  useLoadingLight(switchPress, choosing && !collapsed ? workspaces.status : 'gone', 2)
  const choicesPresent = usePanelPresence(choosing && !collapsed)
  const faults = projectFaults(sight, workspaces)
  const name = projectCaption(sight)
  const initials = sight.named ? projectInitials(name) : name
  const choices = workspaces.status === 'ready' ? [
    ...workspaces.value.workspaces.map((w) => ({ id: w.id, name: content(projectName(w.id, w.title)) })),
    ...(sight.named ? [] : [{ id: sight.id, name: t('nav.notListed') }]),
  ] : []
  const listId = 'sbp-choices'
  return (
    <section className="sbp-block" aria-labelledby="sbp-name" data-project={sight.id} data-projects={workspaces.status} data-fault={faults.length > 0 ? '1' : undefined}>
      <div className="sbp-head">
        <span className="sbp-square" aria-hidden="true">{initials}</span>
        <button type="button" className="sbp-mini" onClick={onExpand} title={t('nav.readingProject', { name })}>
          <span aria-hidden="true">{initials}</span>
          <span className="sr-only">{t('nav.readingProject', { name })}</span>
        </button>
        {/* Waits until there is a list to open: a press while it is reading would open an empty one. */}
        <button ref={switchPress} type="button" className="sbp-switch" aria-expanded={choosing && workspaces.status === 'ready'} aria-controls={listId}
          disabled={workspaces.status !== 'ready'} title={t('sidebarProject.switchTitle')} onClick={() => setChoosing(!choosing)}>
          <Icon name="switch" />
          <span>{t('sidebarProject.switch')}</span>
        </button>
        <a className="sbp-name" id="sbp-name" href={`#${categoryPath('project')}`} title={t('category.open', { group: name })}>{name}</a>
      </div>
      {workspaces.status !== 'ready' ? (
        <p className="sbp-choices-wait">{t(workspaces.status === 'loading' ? 'nav.loadingProjects' : 'nav.projectsFailed')}</p>
      ) : (
        // THE LIST IS ALWAYS IN THE PAGE AND HIDDEN UNTIL THE PRESS OPENS IT, so what it offers is
        // one reading whether it is open or not.
        <div className="sbp-choices" id={listId} hidden={!choicesPresent} data-motion-closing={choicesPresent && (!choosing || collapsed) ? 'yes' : undefined} aria-hidden={!choosing || collapsed ? true : undefined} inert={!choosing || collapsed ? true : undefined}>
          <ul className="sbp-choice-list" aria-label={t('sidebarProject.choices')}>
            {choices.map((choice) => (
              <li key={choice.id}>
                <button type="button" className="sbp-choice" data-project={choice.id} aria-current={choice.id === sight.id ? 'true' : undefined}
                  onClick={() => {
                    setChoosing(false)
                    if (choice.id !== sight.id) setWorkspace(choice.id)
                  }}>
                  <span className="sbp-choice-square" aria-hidden="true">{projectInitials(choice.name)}</span>
                  <span className="sbp-choice-name truncate">{choice.name}</span>
                  {choice.id === sight.id ? <span className="sbp-tick" aria-hidden="true">{'\u2713'}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {faults.map((warning, index) => <ShortWarning key={index} warning={warning} />)}
      {faults.length > 0 && sight.id !== DEFAULT_WORKSPACE ? (
        <button type="button" className="shell-project-out" onClick={() => setWorkspace(DEFAULT_WORKSPACE)}>{t('nav.defaultProject')}</button>
      ) : null}
      {opened === undefined ? null : <p className="shell-opened" role="status">{t('nav.readingProject', { name })}</p>}
      {rows}
    </section>
  )
}

/**
 * THE SIDEBAR'S CHAT OPENS THE CHAT BESIDE THE PAGE, or in its window when the person chose that in
 * Settings. Design D: the chat is in the sidebar and in the corner, and both open it the same way. The row is a press and not a link, because it changes
 * where the chat is drawn rather than leading to a page of the office. It carries the count
 * whenever the corner circle is not drawing it, so the same number is never in two places at once.
 */
function ChatEntry({ onClose }: { onClose: () => void }) {
  const counted = useSyncExternalStore(watchTheCount, theCount, theCount)
  const count = counted === null || counted.onTheCircle ? 0 : counted.count
  return <li><button type="button" className="shell-link shell-chat" {...declaredAttributes({ surface: 'rail.chat' })}
    onClick={() => {
      openTheChatAsChosen()
      onClose()
    }}><span className="shell-ico-box"><Icon name="chat" />{count > 0 ? <span className="shell-chat-count shell-badge num">{count}</span> : null}</span>
    <span className="shell-label" {...DRAWS_THE_NAME}>{t('nav.chat')}</span></button></li>
}

/**
 * THE STEPS OF THIS PROJECT'S CHECKLISTS THAT WAIT ON THE PERSON, read as the Checklists page reads them, for the count
 * beside Checklists. It is asked for only where Checklists is drawn with a count: in the sidebar while it is pinned, and
 * on All pages while it is not. A change of project reads it again, and whatever count is drawn until the new one
 * comes carries the re-read mark, as every reading of `useProjectAsync` does.
 */
export function useChecklistsWaiting(projectId: string, asked: boolean): number | null {
  const [checklists] = useProjectAsync(() => asked ? api.listChecklistsAcross(projectId, 'everyone') : Promise.resolve(null), [projectId, asked], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  return checklists.status === 'ready' && checklists.value !== null ? stepsWaitingOnTheOwner(checklists.value.checklists) : null
}

/**
 * WHEN THE PINS COULD NOT BE READ, one line says so wherever the pages in front are drawn: the kept list was unreadable,
 * with the door's reasons, or the read itself failed, with what it answered. The shipped pages stand in front meanwhile.
 */
export function PinsNotRead({ reading, className }: { reading: SidebarPinsReading; className?: string }) {
  if (reading.readFailure !== null) return <p className={className} role="status">{t('pins.readFailed')} {reading.readFailure}</p>
  if (reading.kept === 'unreadable') return <p className={className} role="status">{t('pins.unreadable')} {reading.problems.join(' ')}</p>
  return null
}

/**
 * THE ENTRY THAT LEADS TO EVERY PAGE NOT IN FRONT. Open, it says how many pages that page lists, counted from the
 * same groups the page draws and the plugin pages it reads. Until the plugin pages are read, and when they cannot be
 * read, it says no number, because the number would leave them out.
 */
function AllPagesEntry({ page, familyOnPage, recordOnScreen }: { page: Route['name']; familyOnPage: KindFamily | undefined; recordOnScreen?: RecordOnScreen }) {
  const mode = useMode()
  const plugins = usePluginPageRows()
  const { pins } = useSidebarPins()
  const mark = allPagesMark(page, mode, pins, familyOnPage, recordOnScreen)
  const listed = allPagesGroups(mode, pins).reduce((sum, { rows }) => sum + rows.length, 0) + (plugins.status === 'ready' ? plugins.rows.length : 0)
  return (
    <a className="shell-link shell-all-pages" href={`#${pathFor('allPages')}`} title={t('nav.allPages.what')}
      {...(mark === 'page' ? { 'aria-current': 'page' as const } : {})}
      {...(mark === 'section' ? { 'aria-current': 'true' as const } : {})}
      {...declaredAttributes({ surface: 'rail.allpages' })}>
      <span className="shell-ico-box"><Icon name="grid" /></span>
      <span className="shell-label" {...DRAWS_THE_NAME}>{t('nav.allPages')}</span>
      {plugins.status === 'ready' ? <span className="shell-pages-count num">{t('nav.allPages.count', { n: listed })}</span> : null}
    </a>
  )
}

/** The sidebar's entries, and the word each draws open. Narrowed, the word is not drawn, and NameBeside shows it. */
const ENTRIES = '.shell-link, .shell-tools > .px-point-switch, .shell-tools > .px-review-switch'
const ENTRY_WORDS = '.shell-label, .px-point-switch-words, .px-review-switch-words'

/**
 * NARROWED, AN ENTRY'S NAME SHOWS BESIDE IT while the mouse is over the entry or the keyboard is on it. The name is drawn
 * over the page, at the sidebar's edge and level with the entry, because the sidebar's list scrolls and would cut off a
 * name drawn inside it. The entry keeps its word for a screen reader, so the name drawn here is hidden from one and is not
 * read twice.
 */
function NameBeside() {
  const [shown, setShown] = useState<{ name: string; left: number; top: number } | null>(null)
  useEffect(() => {
    const side = document.getElementById('shell-side')
    if (side === null) return
    const wide = window.matchMedia(THE_WIDE_FROM)
    let hovered: Element | null = null
    let focused: Element | null = null
    const entryOf = (target: EventTarget | null): Element | null => (target instanceof Element ? target.closest(ENTRIES) : null)
    const show = (): void => {
      const entry = hovered ?? focused
      const name = (entry?.querySelector(ENTRY_WORDS)?.textContent ?? '').trim()
      if (entry === null || name === '' || !wide.matches) {
        setShown(null)
        return
      }
      const box = entry.getBoundingClientRect()
      setShown({ name, left: side.getBoundingClientRect().right + 6, top: box.top + box.height / 2 })
    }
    const onOver = (event: PointerEvent): void => {
      hovered = entryOf(event.target)
      show()
    }
    const onLeave = (): void => {
      hovered = null
      show()
    }
    // Only the keyboard's focus: a press with the mouse focuses the entry too, and the mouse shows the name already.
    const onFocusIn = (event: FocusEvent): void => {
      const entry = entryOf(event.target)
      focused = entry !== null && entry.matches(':focus-visible') ? entry : null
      show()
    }
    const onFocusOut = (): void => {
      focused = null
      show()
    }
    side.addEventListener('pointerover', onOver)
    side.addEventListener('pointerleave', onLeave)
    side.addEventListener('focusin', onFocusIn)
    side.addEventListener('focusout', onFocusOut)
    side.addEventListener('scroll', show, true)
    return () => {
      side.removeEventListener('pointerover', onOver)
      side.removeEventListener('pointerleave', onLeave)
      side.removeEventListener('focusin', onFocusIn)
      side.removeEventListener('focusout', onFocusOut)
      side.removeEventListener('scroll', show, true)
    }
  }, [])
  if (shown === null) return null
  return createPortal(<span className="shell-tip" aria-hidden="true" style={{ left: shown.left, top: shown.top }}>{shown.name}</span>, document.body)
}

/** The window's width, for the room beside the chat. */
function watchTheWindowWidth(watcher: () => void): () => void {
  window.addEventListener('resize', watcher)
  return () => window.removeEventListener('resize', watcher)
}
function theWindowWidth(): number {
  return window.innerWidth
}
function noWindowWidth(): number {
  return 0
}

export interface SidebarProps {

  page: Route['name']

  family?: KindFamily

  open: boolean
  onClose: () => void
  attention: AsyncState<AttentionHome>

  waiting: AsyncState<WaitingReply>

  /** How many notes a secretary prepared from the person's words still wait, in every project. Without it the row shows no count. */
  wordsWaiting?: AsyncState<{ total: number }>

  sight: WorkspaceSight

  workspaces: AsyncState<WorkspacesReply>

  recordOnScreen?: RecordOnScreen

  onRenamed: () => void

  opened?: string
}

export function Sidebar({
  page,
  family: familyOnPage,
  recordOnScreen,
  open,
  onClose,
  attention,
  waiting,
  wordsWaiting,
  sight,
  workspaces,
  onRenamed,
  opened,
}: SidebarProps) {
  useLanguage()
  const drawerPresent = usePanelPresence(open)
  const sidebar = useSidebarArrangement()
  const pins = useSidebarPins()
  const projectPins = theProjectPins(pins.pins)
  const mode = useMode()
  const theKey = theKeyOnThePress()
  useEffect(() => {
    window.addEventListener(PROJECTS_CHANGED, onRenamed)
    return () => window.removeEventListener(PROJECTS_CHANGED, onRenamed)
  }, [onRenamed])
  const [boot] = useState(() => readSidebarState(theBrowsersStore()))
  const [bootBeside] = useState(() => readSidebarState(theBrowsersStore(), SIDEBAR_BESIDE_THE_CHAT_KEY, DEFAULT_SIDEBAR_BESIDE_THE_CHAT))
  const [state, setState] = useState<SidebarState>(boot.state)
  const [beside, setBeside] = useState<SidebarState>(bootBeside.state)
  const [fault, setFault] = useState<string | null>(boot.fault ?? bootBeside.fault)
  // WHILE THE SPLIT IS DRAWN THE SIDEBAR DRAWS ITS CHOICE BESIDE THE CHAT, which starts folded to its icons (design D).
  // The sidebar's own choice is untouched, so closing the split or sending the chat to its window brings the sidebar
  // back exactly as it was.
  const splitDrawn = useSyncExternalStore(watchTheSplit, theSplitDrawnOn, theSplitDrawnOn)
  const besideTheChat = splitDrawn !== null
  const shown = besideTheChat ? beside : state
  // OPEN BESIDE THE CHAT, THE SIDEBAR GOES BESIDE THE PAGE WHILE THE PAGE KEEPS ITS SMALLEST WIDTH, and otherwise opens
  // over the page, where a press outside it folds it. src/web/lib/chat-split.ts works out the room. The folded width is
  // measured from the stylesheet's own value, since it follows the density.
  const chatWidth = useSyncExternalStore(watchTheSplit, theSplitDrawnWidth, theSplitDrawnWidth)
  const windowWidth = useSyncExternalStore(watchTheWindowWidth, theWindowWidth, noWindowWidth)
  const foldedProbe = useRef<HTMLSpanElement>(null)
  const [folded, setFolded] = useState(0)
  useLayoutEffect(() => {
    const probe = foldedProbe.current
    if (probe === null) return
    const measure = (): void => setFolded(probe.getBoundingClientRect().width)
    measure()
    const watching = new ResizeObserver(measure)
    watching.observe(probe)
    return () => watching.disconnect()
  }, [])
  const over = besideTheChat && shown === 'expanded' && !theSidebarFitsBeside(windowWidth, chatWidth, SIDEBAR_OPEN_WIDTH, folded)
  const closeRef = useRef<HTMLButtonElement>(null)
  // THE LIST SAYS WHEN IT HOLDS MORE THAN IS IN SIGHT. At 1440 by 900 the list ran past the foot with
  // nothing saying so, and 智能体 and 办公室 were out of sight (problem E73Do6DbqZCH, item 8).
  const reach = useReach(`${mode}|${sight.id}|${shown}`)

  useEffect(() => {
    if (!open) return
    const cameFrom = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const openedOn = window.location.hash
    closeRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const drawer = document.getElementById('shell-side')
      if (drawer === null) return
      const stops = [...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, input, summary, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.offsetParent !== null,
      )
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (first === undefined || last === undefined) return
      const on = document.activeElement
      if (!event.shiftKey && on === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && on === first) {
        event.preventDefault()
        last.focus()
      }
    }

    const onFocusIn = (event: FocusEvent) => {
      const drawer = document.getElementById('shell-side')
      const to = event.target
      if (drawer === null || !(to instanceof Node) || drawer.contains(to)) return
      closeRef.current?.focus()
    }

    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      // A PAGE OPENED FROM THE DRAWER keeps the focus its field asked for, which the drawer pulled back while open.
      const to = window.location.hash === openedOn ? cameFrom : (document.querySelector<HTMLElement>('#main [data-takes-the-focus]') ?? cameFrom)
      to?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  /** Keep the choice where it is made: beside the chat, or the sidebar's own. */
  function choose(next: SidebarState): void {
    if (besideTheChat) {
      setBeside(next)
      setFault(writeSidebarState(theBrowsersStore(), next, SIDEBAR_BESIDE_THE_CHAT_KEY).fault)
      return
    }
    setState(next)
    setFault(writeSidebarState(theBrowsersStore(), next).fault)
  }

  function toggle(): void {
    choose(shown === 'expanded' ? 'collapsed' : 'expanded')
  }

  function expand(): void {
    if (shown === 'expanded') return
    choose('expanded')
  }

  // OPEN OVER THE PAGE, A PRESS OUTSIDE FOLDS IT, and the press still does what it does. A press in a menu the sidebar
  // opened is not outside: the menus are drawn in the overlay host. Only beside the chat is it ever over the page, so
  // the fold is kept as the choice beside the chat.
  useEffect(() => {
    if (!over) return
    const onPress = (event: PointerEvent): void => {
      const on = event.target
      if (on instanceof Element && on.closest('#shell-side, .px-overlay-root') !== null) return
      choose('collapsed')
    }
    document.addEventListener('pointerdown', onPress, true)
    return () => document.removeEventListener('pointerdown', onPress, true)
  }, [over])

  const collapsed = shown === 'collapsed'
  const reply = attention.status === 'ready' ? attention.value : null
  // This count spans projects, so a project change does not discard its last reading.
  const waitingHeld = useRef<WaitingReply | null>(null)
  if (waiting.status === 'ready') waitingHeld.current = waiting.value
  const waitingReply = waiting.status === 'error' ? null : waitingHeld.current
  // This count spans projects too, and is kept the same way.
  const wordsHeld = useRef<number | null>(null)
  if (wordsWaiting?.status === 'ready') wordsHeld.current = wordsWaiting.value.total
  const wordsCount = wordsWaiting === undefined || wordsWaiting.status === 'error' ? null : wordsHeld.current
  const checklistsCount = useChecklistsWaiting(sight.id, pins.pins.includes('checklists'))

  return (
    <>
      <style href="mole-office-sidebar" precedence="default">
        {SIDEBAR_CSS}
      </style>

      {drawerPresent ? <button type="button" className="shell-scrim" data-motion-closing={open ? undefined : 'yes'} aria-label={t('nav.closeMenu')} onClick={onClose} /> : null}

      <aside
        id="shell-side"
        className="shell-side"
        data-state={collapsed ? 'collapsed' : 'expanded'}
        data-over={over ? 'yes' : undefined}
        data-drawer={drawerPresent ? 'open' : 'closed'}
        data-motion-closing={open ? undefined : drawerPresent ? 'yes' : undefined}
        aria-label={t('nav.navigation')}
      >
        <span className="shell-side-folded" ref={foldedProbe} aria-hidden="true" />
        <div className="shell-side-inner">
          <div className="shell-side-head">

            <RouteLink to="/" className="shell-brand" title={t('nav.brand')} aria-label={t('nav.brand')}>
              <span className="shell-brand-full" aria-hidden="true">
                <Wordmark />
              </span>
              <span className="shell-brand-short" aria-hidden="true">
                <Wordmark form="icon" />
              </span>
            </RouteLink>

            <button type="button" className="shell-close" onClick={onClose} ref={closeRef}>
              <Icon name="close" />
              <span className="sr-only">{t('nav.closeMenu')}</span>
            </button>
          </div>

          {/* ASK AGENT AND REVIEWS STAND UNDER THE HEAD, outside the list that scrolls.
              They act on the page being read rather than lead to a place, and here
              they are seen at every height and at every point of the list's scroll. */}
          <div className="shell-tools">
            <TalkAboutSomething getOutOfTheWay={onClose} />
            <ReviewSwitch getOutOfTheWay={onClose} />
            {/* THE QUICK SEARCH acts on the page being read too. At 390 the drawer closes first and gives the focus back,
                and then the quick search opens and takes it. components/QuickSearch.tsx. */}
            <button type="button" className="shell-link shell-quick-search" {...declaredAttributes({ surface: 'rail.quicksearch' })}
              onClick={() => {
                onClose()
                window.setTimeout(() => window.dispatchEvent(new Event(OPEN_THE_QUICK_SEARCH)), 0)
              }}><span className="shell-ico-box"><Icon name="find" /></span>
              <span className="shell-label" {...DRAWS_THE_NAME}>{t('nav.quickSearch')}</span></button>
            {/* NEW NOTE opens a new quick note, in the press itself: the window app's note window, or in a browser a small
                window of its own (lib/open-a-quick-note.ts). Only the window app takes the key, so only it draws the key. */}
            <button type="button" className="shell-link shell-new-note" {...declaredAttributes({ surface: 'rail.quicknote' })}
              data-key={theKey === null ? undefined : 'drawn'}
              onClick={() => {
                openAQuickNote()
                onClose()
              }}><span className="shell-ico-box"><Icon name="pen" /></span>
              <span className="shell-label" {...DRAWS_THE_NAME}>{t('nav.newNote')}</span>
              {theKey === null ? null : <kbd className="shell-key">{theKey}</kbd>}</button>
          </div>

          {/* THE LIST SCROLLS ON ITS OWN AND THE FOOT STAYS. */}
          <InReachMark reach={reach} className="sbp-reach">
          <div className="sbp-scroll" {...reachBox(reach, t('nav.destinations'))}>
            <nav className="shell-nav" aria-label={t('nav.destinations')}>
              {sidebar.storedButNotUsed !== null ? <p className="shell-counting"><RouteLink to={pathFor('sidebarArrangement')}>{t('sidebarSetting.recoveryLink')}</RouteLink></p> : null}
              {sidebar.readFailure !== null ? <p className="shell-counting" role="status">{t('sidebarSetting.readFailed')} {sidebar.readFailure}</p> : null}
              <PinsNotRead reading={pins} className="shell-counting" />
              {/* ONE ORDER, OPEN AND NARROWED: the pages in front, the project block with the project's pinned pages, then
                  All pages for every other page. */}
              <ul className="shell-list">
                {theFront(pins.pins).map((entry) => entry.chat ? <ChatEntry key="chat" onClose={onClose} /> : (
                  <li key={entry.destination.key}><NavRow declares={{ surface: entry.destination.surface }} destination={entry.destination}
                    page={page} familyOnPage={familyOnPage} {...(recordOnScreen === undefined ? {} : { recordOnScreen })}
                    reply={reply} waiting={waitingReply} wordsWaiting={wordsCount} checklistsWaiting={checklistsCount} /></li>
                ))}
              </ul>
              <ProjectBlock sight={sight} workspaces={workspaces} collapsed={collapsed} onExpand={expand} opened={opened} rows={projectPins.length === 0 ? null : (
                <ul className="shell-list">
                  {projectPins.map((destination) => (
                    <li key={destination.key}><NavRow declares={{ surface: destination.surface }} destination={destination}
                      page={page} familyOnPage={familyOnPage} {...(recordOnScreen === undefined ? {} : { recordOnScreen })}
                      reply={reply} waiting={waitingReply} wordsWaiting={wordsCount} checklistsWaiting={checklistsCount} /></li>
                  ))}
                </ul>
              )} />
              <ul className="shell-list shell-list-all">
                <li><AllPagesEntry page={page} familyOnPage={familyOnPage} {...(recordOnScreen === undefined ? {} : { recordOnScreen })} /></li>
              </ul>
              {waitingReply !== null ? null : <p className="shell-counting" role="status" data-bad={waiting.status === 'error' ? '1' : undefined}>
                {t(waiting.status === 'error' ? 'nav.countFailed' : 'nav.counting')}
              </p>}
            </nav>
          </div>
          </InReachMark>
          <SidebarFoot page={page} fault={fault} onClose={onClose} collapsed={collapsed} onToggle={toggle} />
        </div>
      </aside>
      {collapsed ? <NameBeside /> : null}
    </>
  )
}

/**
 * THE PAGES OF THE SWITCHED-ON PLUGINS, read from the office. Which plugins are on is read, not written in the code, so
 * these pages are not part of the arrangement. They are read again when a switch on Settings is stored.
 *
 * A row is named by its plugin, and by the plugin and the page when the plugin has more than one.
 */
export interface PluginPageRow { id: string; slug: string; label: string }
export function usePluginPageRows(): { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: PluginPageRow[] } {
  const [again, setAgain] = useState(0)
  useEffect(() => {
    const onChanged = (): void => {
      setAgain((n) => n + 1)
    }
    window.addEventListener(PLUGINS_CHANGED, onChanged)
    return () => window.removeEventListener(PLUGINS_CHANGED, onChanged)
  }, [])
  const [state] = useAsync(() => api.plugins(), [again])
  if (state.status === 'loading') return { status: 'loading' }
  if (state.status === 'error') return { status: 'error' }
  return { status: 'ready', rows: state.value.plugins.flatMap((plugin) => {
    const manifest = plugin.manifest
    if (plugin.state !== 'on' || manifest === null) return []
    const name = pluginWordsIn(manifest.name, wordLanguage())
    return manifest.pages.map((one) => ({
      id: plugin.id,
      slug: one.slug,
      label: manifest.pages.length === 1 ? content(name) : t('pluginPage.frameName', { name: content(name), page: content(pluginWordsIn(one.title, wordLanguage())) }),
    }))
  }) }
}

/**
 * THE PLUGIN PAGES ON ALL PAGES, IN A GROUP OF THEIR OWN AFTER OFFICE (wave 13x round 15). All pages reads them once
 * and gives the rows its search finds. With no page to list it draws nothing. A read that failed says so in one line,
 * because a missing group would read as no plugin being on.
 */
type PluginPagesReading = ReturnType<typeof usePluginPageRows>
export function PluginPages({ plugins }: { plugins: PluginPagesReading }) {
  if (plugins.status === 'loading') return null
  if (plugins.status === 'error') return <p className="ap-failed" role="status">{t('pluginPage.sidebarFailed')}</p>
  if (plugins.rows.length === 0) return null
  return <section className="ap-group" data-group="plugins" aria-labelledby="ap-cap-plugins" {...declaredAttributes({ surface: 'plugins.pages' })}>
    <h2 className="ap-cap" id="ap-cap-plugins">{t('pluginPage.sidebar')}</h2>
    <ul className="ap-list">{plugins.rows.map((row) => (
      <li key={`${row.id}/${row.slug}`}>
        <a className="ap-page" href={`#${pluginPagePath(row.id, row.slug)}`} title={row.label}>
          <Icon name="package" />
          <span>{row.label}</span>
        </a>
      </li>
    ))}</ul>
  </section>
}

/** WHAT A ROW'S COUNT IS READ FROM: the shell's readings, each null while there is none. */
export interface RowReadings {
  reply: AttentionHome | null
  waiting: WaitingReply | null
  wordsWaiting: number | null
  checklistsWaiting: number | null
}

/**
 * THE COUNT A ROW DRAWS, worked out here once for the sidebar's entries and for the rows of All pages, or null
 * while its reading is not there. A count of nought draws no mark.
 */
export function rowCount(destination: Destination, { reply, waiting, wordsWaiting, checklistsWaiting }: RowReadings): number | null {
  const badge = destination.badge
  if (badge === null) return null
  if (badge.of === 'waiting') return waiting === null ? null : railCount(waiting)
  if (badge.of === 'yourWords') return wordsWaiting
  if (badge.of === 'checklists') return checklistsWaiting
  return reply === null ? null : badgeCount(reply, badge)
}

function NavRow({
  declares,
  destination,
  page,
  familyOnPage,
  recordOnScreen,
  reply,
  waiting,
  wordsWaiting,
  checklistsWaiting,
}: {

  declares: Declares
  destination: Destination
  page: Route['name']
  familyOnPage: KindFamily | undefined

  recordOnScreen?: RecordOnScreen
  reply: AttentionHome | null

  waiting: WaitingReply | null

  wordsWaiting: number | null

  checklistsWaiting: number | null
}) {
  const mark = markFor(destination, page, familyOnPage, recordOnScreen)
  const count = rowCount(destination, { reply, waiting, wordsWaiting, checklistsWaiting })

  return (
    <a
      className="shell-link"
      href={`#${destination.to}`}
      title={destination.what}
      {...(mark === 'page' ? { 'aria-current': 'page' as const } : {})}
      {...(mark === 'section' ? { 'aria-current': 'true' as const } : {})}
      {...declaredAttributes(declares)}
    >
      {/* THE COUNT STANDS ON THE ICON'S CORNER, open and narrowed, so it is in one place against its icon. */}
      <span className="shell-ico-box">
        <Icon name={destination.icon} />
        {count === null || count === 0 ? null : (
          <span
            className="shell-badge num"
            title={t('nav.count', { n: count })}
          >
            {t('nav.badge', { n: count })}
          </span>
        )}
      </span>

      <span className="shell-label" {...DRAWS_THE_NAME}>
        {destination.label}
      </span>
    </a>
  )
}

/**
 * The sidebar's stylesheet. The look of its project block was settled by a decision.
 * The decision's id is kept here rather than in the stylesheet, because the stylesheet ships as text and a
 * shipped text gives its reason in words.
 */
export const SIDEBAR_CSS = `
/* THE WIDTH THE SIDEBAR TAKES, AS ONE VALUE THE WHOLE SHELL CAN READ. The strip that says a failed
   read sits at the foot of the page column, which begins where the sidebar ends, and it is not a
   child of the sidebar. A value on .shell-side cannot reach it, so the shell's width lives on the
   root; .shell-side sets its own when it folds. */
:root { --sidebar-w: ${String(SIDEBAR_OPEN_WIDTH)}px; }
.shell-side {
  flex: none;
  width: var(--sidebar-w, ${String(SIDEBAR_OPEN_WIDTH)}px);
  min-width: 0;
  background: var(--panel);
  border-right: var(--border-w) solid var(--border);
}

/* THE FOLDED WIDTH, MEASURED AND NOT DRAWN, so the sidebar knows at this density whether the page has room for it
   open beside the chat. */
.shell-side-folded {
  position: absolute;
  width: ${SIDEBAR_FOLDED_WIDTH};
  height: 0;
  visibility: hidden;
  pointer-events: none;
}

.shell-side-inner {
  position: sticky;
  top: 0;
  height: 100dvh;
  max-height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
  padding: var(--pad);
}

.shell-side-head {
  display: flex;
  align-items: center;
  gap: var(--pad);
  min-height: var(--row-h);
}

.shell-brand {
  font-size: var(--fs-3);
  text-decoration: none;
  margin-right: auto;
  min-width: 0;
}
.shell-brand-short { display: none; }

.shell-collapse,
.shell-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--row-h);
  height: var(--row-h);
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.shell-collapse:hover,
.shell-close:hover { background: var(--hover); color: var(--text); }

.shell-ico {
  width: 18px;
  height: 18px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.shell-nav {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.shell-opened {
  margin: 0 var(--pad) var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--text-3);
}

.shell-tools { display: flex; flex-direction: column; gap: 4px; }
.shell-tools > .px-point-switch,
.shell-tools > .px-review-switch { gap: calc(var(--pad) + 4px); margin-bottom: 0; padding: 0 var(--pad); }
.shell-chat { width: 100%; text-align: left; }
.shell-quick-search { width: 100%; text-align: left; }
.shell-new-note { width: 100%; text-align: left; }
.shell-new-note[data-key] { grid-template-columns: 18px minmax(0, 1fr) auto; }
.shell-key { color: var(--text-3); font-family: var(--font-mono); font-size: var(--fs-1); font-weight: 600; letter-spacing: normal; white-space: nowrap; }
.shell-side-inner > * { flex-shrink: 0; }
.shell-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }

/* THE WORD STANDS FURTHER FROM ITS ICON THAN THE ROW'S EDGE DOES, so that the count on the icon's corner is clear of it.
   The count reaches 8px past the icon, and the word begins 10px past it at the least. */
.shell-link {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: calc(var(--pad) + 4px);
  min-height: var(--row-h);
  padding: 4px var(--pad);
  border-radius: var(--radius-sm);
  color: var(--text-2);

  font-size: var(--fs-1);
  letter-spacing: .06em;
  font-weight: 600;
  text-decoration: none;
}
.shell-link:hover { background: var(--hover); color: var(--text); }
/* ALL PAGES SAYS HOW MANY PAGES IT LEADS TO, after its word, when the sidebar is open. */
.shell-all-pages { grid-template-columns: 18px minmax(0, 1fr) auto; }
.shell-pages-count { color: var(--text-3); font-size: var(--fs-1); font-weight: 600; letter-spacing: normal; white-space: nowrap; }
.shell-list-all {
  margin-top: var(--pad);
  padding-top: var(--pad);
  border-top: var(--border-w) solid var(--border);
}

.shell-label { min-width: 0; overflow-wrap: anywhere; line-height: var(--lh-tight); }

.shell-link[aria-current] {
  background: var(--accent-soft);
  color: var(--text);
  font-weight: 700;
}
.shell-link[aria-current]::before {
  content: "";
  position: absolute;
  left: 0;
  width: var(--rail);
  border-radius: var(--radius-pill);
  background: currentColor;
  top: 4px;
  bottom: 4px;
}

.shell-link[aria-current="true"]::before {
  top: 35%;
  bottom: 35%;
}

/* THE COUNT STANDS ON THE TOP RIGHT CORNER OF ITS ENTRY'S ICON, open and narrowed, so it is one mark in
   one place. The chat's count, when the corner circle does not carry it, is the same mark. */
.shell-ico-box { position: relative; display: inline-flex; width: 18px; height: 18px; }
.shell-badge {
  position: absolute;
  top: -7px;
  right: -8px;
  min-width: 1rem;
  padding: 0 3px;
  border-radius: var(--radius-pill);
  background: var(--text);
  box-shadow: 0 0 0 2px var(--panel);
  color: var(--panel);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1rem;
  text-align: center;
  letter-spacing: normal;
}

.shell-counting {
  padding: var(--pad) var(--pad) 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.shell-counting[data-bad="1"] { color: var(--st-failed); font-weight: var(--st-failed-weight); }

.shell-project-out {
  align-self: flex-start;
  min-height: 28px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
}
.shell-project-out:hover { background: var(--hover); }
.shell-project-out:disabled { color: var(--text-3); cursor: not-allowed; background: var(--panel); }

.shell-fault {
  padding: 2px var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--st-failed);
  background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font-weight: var(--st-failed-weight);
}

.shell-fault-short {
  display: flex;
  gap: 6px;
  cursor: pointer;
  list-style: none;
}
.shell-fault-short::-webkit-details-marker {
  display: none;
}

.shell-fault-said {
  margin: 4px 0 2px;
  font-weight: 400;
  line-height: var(--lh-read);
  overflow-wrap: anywhere;
}

/* THE HOLDER OF THE LIST'S MARKS takes the list's place in the column, and the list fills it. The fade
   is into the sidebar's own colour. */
.shell-side-inner > .sbp-reach {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --reach-fade: var(--panel);
}
.sbp-reach > .sbp-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: var(--gut);
}
/* THE SIDEBAR DRAWS NO SCROLLBAR. A bar took a column out of the sidebar narrowed to its icons, and stood beside the
   rows at every width. Both parts still scroll by the wheel, by touch and by the keyboard, and the list's marks say
   when it holds more than is in sight. This rule hides the bar in a browser that does not read scrollbar-width. */
.shell-side-inner::-webkit-scrollbar,
.sbp-reach > .sbp-scroll::-webkit-scrollbar { display: none; }
/* ONE LINE ABOVE THE FOOT, NOT TWO. The list's bottom mark draws a fade and a rule; the foot draws its own top line.
   In a short window the two met, one above the other. The mark keeps its fade, which says the list carries on, and
   gives up its rule to the foot's line, which stands at a tall window too, where the list does not scroll. */
.shell-side-inner > .sbp-reach .px-reach-edge[data-side="down"] { border-bottom: 0; }

/* THE PROJECT BLOCK: a border and a light fill in the accent colour, so its
   rows read as the project's; its head names the project larger than a row. */
.sbp-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  margin-top: var(--pad);
  padding: var(--pad) 4px 4px;
  border: var(--border-w) solid var(--accent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent-soft) 45%, var(--panel));
}
.sbp-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 0 4px 6px;
}
/* THE RULE UNDER THE HEAD stands only over something drawn under it: the rows, the Switch list, or a line about the
   projects. With nothing under the head, the block draws no rule. */
.sbp-head:has(~ :not([hidden])) { border-bottom: var(--border-w) solid color-mix(in srgb, var(--accent) 35%, transparent); }
/* THE INITIALS, THE NAME AND THE SWITCH stand in one row, the name level with the initials. When the name's longest
   word does not fit beside Switch, Switch goes onto a line of its own under the name, at the right. */
.sbp-square {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-text);
  font-size: var(--fs-1);
  font-weight: 700;
}
/* THE MINI PRESS HOLDS ITS OWN SR-ONLY WORDS, so they stay in the list. Without a position here their place below the
   list's fold made the narrowed column taller than the window, and the whole column scrolled. */
.sbp-mini { display: none; position: relative; }
.sbp-name {
  /* THE NAME IS DRAWN WHOLE. It wraps onto as many lines as it needs, and its least width is its longest word, so a
     word is broken inside itself only when it is wider than the line beside the initials. It was held to one line
     with an ellipsis, and that cut a short project name beside the Switch press at every width. Its lines are
     balanced, so where a break at a space gives even lines, the name is not broken after a hyphen inside a word. The
     words sit inside the rule because a test reads what stands before the brace as the selector. */
  order: 1;
  flex: 1 1 auto;
  width: min-content;
  min-width: 0;
  max-width: calc(100% - 32px - 6px);
  overflow-wrap: break-word;
  text-wrap: balance;
  font-size: var(--fs-3);
  font-weight: 700;
  line-height: var(--lh-tight);
  color: var(--text);
  text-decoration: none;
}
@media ${THE_WIDE_FROM} { .sbp-name { width: max-content; } }
.sbp-name:hover { text-decoration: underline; text-underline-offset: .2em; }
.sbp-switch {
  order: 2;
  flex: none;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 6px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
}
.sbp-switch .shell-ico { width: 14px; height: 14px; }
.sbp-switch:hover,
.sbp-switch[aria-expanded="true"] { background: var(--hover); }
.sbp-switch:disabled { color: var(--text-3); cursor: default; background: var(--panel); }
.sbp-choices[hidden] { display: none; }
.sbp-choices {
  padding: 4px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.sbp-choice-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.sbp-choice {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--pad);
  width: 100%;
  min-height: var(--row-h);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
  text-align: left;
}
.sbp-choice:hover { background: var(--hover); color: var(--text); }
.sbp-choice[aria-current] { background: var(--accent-soft); color: var(--text); font-weight: 700; }
.sbp-choice-square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: var(--border-w) solid var(--border);
  background: var(--panel-2);
  font-size: 10px;
  font-weight: 700;
}
.sbp-choice[aria-current] .sbp-choice-square { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.sbp-tick { color: var(--accent); font-weight: 700; }
.sbp-choices-wait { margin: 0; padding: 0 6px; font-size: var(--fs-1); color: var(--text-3); }
.sbp-block .shell-link[aria-current] { background: var(--accent-soft); }

/* THE FOOT: fixed at the bottom; the list above it scrolls. Nothing in it opens. */
.sbp-foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: var(--pad);
  border-top: var(--border-w) solid var(--border-strong);
}
/* THE PERSON'S BOX TAKES THE ROOM THE PRESSES LEAVE. A flex basis of 0 and a minimum width of 0 let
   the box give way to the presses, which are fixed, so the row needs no second line. max-width: 100%
   keeps the box inside the sidebar even when the name is long. */
.sbp-person { display: flex; flex: 1 1 0; align-items: center; gap: var(--pad); min-width: 0; max-width: 100%; padding: 0 4px; }
.sbp-disc {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  border: var(--border-w) solid var(--border-strong);
  background: var(--accent-soft);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 700;
}
.sbp-disc[data-writer] { border-color: var(--st-failed-line); background: var(--st-failed-bg); color: var(--st-failed); }
/* THE PICTURE SITS OVER THE LETTER, AND THE LETTER IS WHAT IS LEFT WHEN IT GOES. A picture that
   cannot be loaded moves the component to the drawn picture, which this hides too, so the letter
   underneath is seen rather than an empty disc. While the picture is still arriving it has no
   paint and the transparent layer lets the letter show through. */
.sbp-disc-letter { position: relative; z-index: 0; }
.sbp-disc .sbp-disc-picture {
  position: absolute;
  inset: 0;
  z-index: 1;
  margin: auto;
  border: 0;
  background: transparent;
}
.sbp-disc .sbp-disc-picture[data-picture="drawn"],
.sbp-disc .sbp-disc-picture[data-picture="none"] { display: none; }
/* THE NAME TAKES AT MOST TWO LINES, AND ITS HOVER WORD IS THE WHOLE NAME. It
   wraps only between words, so no word is broken. A name that needs a third line is cut at the end of
   the second, and a single word too long for the row is cut on its one line; the ellipsis is the mark
   of the cut. A cut name with no way to read it whole read "default offic…", so the hover word is
   what the cut needs. */
.sbp-person-name {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  overflow-wrap: normal;
  font-size: var(--fs-1);
  font-weight: 700;
  line-height: var(--lh-tight);
  color: var(--text);
}
.sbp-writer {
  margin: 0;
  padding: 2px var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  color: var(--st-failed);
  background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}
/* THE ROW NEVER WRAPS. The name gives way to the presses instead, so the presses stay on the name's
   row at every width, keep their size and stand level with the name's middle. The name takes a second
   line of its own rather than push a press off the row. The collapsed sidebar hides the name and stacks
   the row in a column (below). */
.sbp-foot-row { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; min-width: 0; }
/* THE NARROW PRESS ENDS THE SETTINGS ROW, and the row's entry takes the rest of its width. */
.sbp-settings-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sbp-settings-row > .shell-list { flex: 1 1 auto; }
.sbp-look {
  display: inline-flex;
  flex: none;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.sbp-look-press {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
}
.sbp-look-press + .sbp-look-press { border-left: var(--border-w) solid var(--border-strong); }
.sbp-look-press .shell-ico { width: 14px; height: 14px; }
.sbp-look-press:hover { background: var(--hover); color: var(--text); }
.sbp-look-press[aria-pressed="true"] { background: var(--chosen-bg); color: var(--chosen-ink); }
.sbp-shut-down {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.sbp-shut-down .shell-ico { width: 14px; height: 14px; }
.sbp-shut-down:hover { background: var(--hover); }
.sbp-shut-down { color: var(--text-2); cursor: pointer; }

/* THE NAME BESIDE A NARROWED ENTRY, drawn over the page at the sidebar's edge and level with the entry, and over a
   chat beside the page on the left. */
.shell-tip {
  position: fixed;
  z-index: var(--z-overlay);
  transform: translateY(-50%);
  padding: 4px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--elev-2);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  line-height: var(--lh-tight);
  white-space: nowrap;
  pointer-events: none;
}

@media ${THE_WIDE_FROM} {

  /* THE FOLDED RAIL IS NARROWER, AND THE ROOT VALUE FOLLOWS IT, so the page column's strip starts
     at the rail's right edge whether the person has folded it or not. It is as wide as an icon with
     its count, since narrowed the entries draw no word. */
  :root:has(.shell-side[data-state="collapsed"]) { --sidebar-w: ${SIDEBAR_FOLDED_WIDTH}; }

  .shell-close { display: none; }
  .shell-scrim { display: none; }

  .shell-side[data-state="collapsed"] { --sidebar-w: ${SIDEBAR_FOLDED_WIDTH}; }

  /* OPEN OVER THE PAGE, beside a chat that leaves the page no room for it: the sidebar keeps the folded width in the
     shell, so nothing under it moves, and its inside is drawn open over the page and over a chat on the left. */
  :root:has(.shell-side[data-over="yes"]) { --sidebar-w: ${SIDEBAR_FOLDED_WIDTH}; }
  .shell-side[data-over="yes"] { --sidebar-w: ${SIDEBAR_FOLDED_WIDTH}; }
  .shell-side[data-over="yes"] .shell-side-inner {
    width: ${String(SIDEBAR_OPEN_WIDTH)}px;
    z-index: var(--z-overlay);
    background: var(--panel);
    border-right: var(--border-w) solid var(--border);
    box-shadow: var(--elev-2);
  }

  .shell-side[data-state="collapsed"] .shell-brand-full,
  .shell-side[data-state="collapsed"] .shell-counting,
  .shell-side[data-state="collapsed"] .shell-pages-count,
  .shell-side[data-state="collapsed"] .shell-key,
  .shell-side[data-state="collapsed"] .sbp-square,
  .shell-side[data-state="collapsed"] .sbp-name,
  .shell-side[data-state="collapsed"] .sbp-switch,
  .shell-side[data-state="collapsed"] .sbp-person-name,
  .shell-side[data-state="collapsed"] .sbp-writer,
  .shell-side[data-state="collapsed"] .shell-project-out,
  .shell-side[data-state="collapsed"] .shell-opened,
  .shell-side[data-state="collapsed"] .shell-fault {
    display: none;
  }

  .shell-side[data-state="collapsed"] .shell-brand-short { display: inline; }

  /* THE PROJECT BLOCK, NARROWED: its initials, which widen the sidebar, over the icons of its rows. */
  .shell-side[data-state="collapsed"] .sbp-block { padding: 4px 2px; }
  .shell-side[data-state="collapsed"] .sbp-head { display: flex; justify-content: center; padding: 0 0 4px; }
  /* Narrowed, the lines about the project are not drawn, so a rule over them alone would stand over nothing. */
  .shell-side[data-state="collapsed"] .sbp-head:not(:has(~ :not([hidden], .shell-fault, .shell-project-out, .shell-opened))) { border-bottom: none; }
  .shell-side[data-state="collapsed"] .sbp-mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-text);
    font-size: var(--fs-1);
    font-weight: 700;
  }
  .shell-side[data-state="collapsed"] .sbp-block[data-fault] .sbp-mini {
    background: var(--st-failed-bg);
    color: var(--st-failed);
    box-shadow: inset 0 0 0 var(--border-w) var(--st-failed-line);
  }
  .shell-side[data-state="collapsed"] .sbp-person,
  .shell-side[data-state="collapsed"] .sbp-settings-row,
  .shell-side[data-state="collapsed"] .sbp-foot-row { flex-direction: column; justify-content: center; }
  .shell-side[data-state="collapsed"] .sbp-settings-row > .shell-list { align-self: stretch; }
  .shell-side[data-state="collapsed"] .sbp-look { flex-direction: column; }
  /* Stacked, the line between the two halves runs across, above the second half, not down its side. */
  .shell-side[data-state="collapsed"] .sbp-look-press + .sbp-look-press {
    border-left: 0;
    border-top: var(--border-w) solid var(--border-strong);
  }

  .shell-side[data-state="collapsed"] .shell-side-head { justify-content: center; }
  .shell-side[data-state="collapsed"] .shell-brand { margin-right: 0; }

  /* NARROWED, AN ENTRY IS ITS ICON, with its count on the icon's corner. Its word is kept for a
     screen reader, and the mouse or the keyboard on the entry shows it beside the sidebar
     (.shell-tip). Ask agent and Reviews are drawn the same way as the entries. */
  .shell-side[data-state="collapsed"] .shell-link,
  .shell-side[data-state="collapsed"] .shell-tools > .px-point-switch,
  .shell-side[data-state="collapsed"] .shell-tools > .px-review-switch {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 2px;
  }
  /* Open, Ask agent and Reviews are framed presses on a ground of their own (agent-css.ts). Narrowed, a frame
     around one icon in a column of bare icons reads as a box, so at rest they draw no frame and no ground, and
     the mouse lights them as it lights an entry. Pressed, they keep their frame, which says the switch is on. */
  .shell-side[data-state="collapsed"] .shell-tools > .px-point-switch:not([aria-pressed="true"]),
  .shell-side[data-state="collapsed"] .shell-tools > .px-review-switch:not([aria-pressed="true"]) {
    border-color: transparent;
    background: transparent;
  }
  .shell-side[data-state="collapsed"] .shell-tools > .px-point-switch:not([aria-pressed="true"]):hover,
  .shell-side[data-state="collapsed"] .shell-tools > .px-review-switch:not([aria-pressed="true"]):hover {
    background: var(--hover);
  }
  .shell-side[data-state="collapsed"] .shell-label,
  .shell-side[data-state="collapsed"] .px-point-switch-words,
  .shell-side[data-state="collapsed"] .px-review-switch-words {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .shell-side[data-state="collapsed"] .shell-link[aria-current]::before { top: 6px; bottom: 6px; }
  .shell-side[data-state="collapsed"] .shell-list { gap: 2px; }
}

@media ${THE_NARROW_FROM} {
  /* THE DRAWER TAKES NO WIDTH IN THE PAGE, so the page column is the window's width. */
  :root { --sidebar-w: 0px; }

  .shell-side {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: var(--z-drawer);
    width: min(86vw, 300px);
    border-right: var(--border-w) solid var(--border-strong);
    box-shadow: var(--elev-2);
  }

  .shell-side[data-drawer="closed"] { display: none; }

  .shell-side-inner {
    position: static;
    height: 100%;
    max-height: none;
    padding: var(--pad-lg) var(--pad);
  }

  .shell-scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-scrim);
    width: 100%;
    background: rgba(0, 0, 0, .45);
    cursor: pointer;
  }

  .shell-link,
  .shell-collapse,
  .shell-close,
  .sbp-switch,
  .sbp-choice,
  .sbp-look-press,
  .sbp-shut-down {
    min-height: 44px;
  }
  .sbp-look-press,
  .sbp-shut-down { min-width: 44px; }

  .shell-collapse { display: none; }
}
`
