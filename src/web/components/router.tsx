// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A hash router in forty lines, instead of a routing library.
 *
 * "Hash" means the part of the address after the `#`, e.g. `panelx/#/r/abc123`. The browser
 * never asks the server for it, so no server-side route configuration is needed and a page
 * reload always works. The `hashchange` event fires whenever it changes, including when you
 * press Back, which is the whole reason to use it rather than tracking state ourselves.
 */

import { useEffect, useMemo, useState } from 'react'
import { setWorkspace } from '../lib/workspace.ts'
import { toTheTopOfThePage } from '../lib/page-scroll.ts'
import { parsePeriod } from '@shared/planning.ts'
import { isParticipantKind, type ParticipantKind } from '@shared/participants.ts'
// THE KIND WORDS THAT HAVE THEIR OWN ADDRESS, for the switch inside recordPath below.
import type { RecordKind } from '@shared/types.ts'
import { PROFILE_SEGMENT } from '@shared/profile.ts'
// WHERE ONE VISITING AGENT'S CREDENTIAL LIVES. One spelling, shared with the server's refusals.
import { VISITOR_SEGMENT, credentialPagePath } from '@shared/visitors.ts'
// THE ADDRESS OF THE STATISTICS PAGE, criterion P72. One spelling, beside the shape it draws.
import { ROLE_CENSUS_SEGMENT } from '@shared/roles.ts'
import { INCIDENT_SEGMENT } from '@shared/incident.ts'
import { KIND_FAMILIES, type KindFamily } from '@shared/work.ts'
// TYPE ONLY, AND THAT IS THE POINT. `RouteLink` below accepts the mark that says its words are the
// name of the thing around it, and the property is named from the one constant that spells that
// attribute. A value import here would run pointing.ts, which reaches this file back.
import type { NAME_ATTRIBUTE } from './agent/pointing.ts'
// THE SAME RULE AS THE LINE ABOVE: the attribute is named from its one declaration rather than
// spelt again here, and the import is type-only so this file gains no run-time edge.
import type { TARGET_ATTRIBUTE } from '@shared/targets.ts'
/**
 * THE ADDRESS GRAMMAR, WHICH USED TO BE DECLARED HERE.
 *
 * It moved to src/shared on 9 September 2026 because the write door has to read it too — a lead may
 * point at a page, and the door refuses an address this app has no page at (criterion M97). The
 * server may not import this file: it imports React, and the gate in
 * tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts names the files a program loads
 * from outside its own folders. The grammar went to the folder both programs already read.
 *
 * WHAT IS RE-EXPORTED BELOW IS WHAT THIS FILE USED TO DECLARE, so every caller in the shell reads
 * the same names from the same place it always did.
 */
import { NOTEBOOK_SEGMENT } from '@shared/notebook.ts'
import {
  CATEGORY_PAGES,
  categoryOfPage,
  EDIT_SEGMENT,
  FLAT_ROUTES,
  HANDBOOK_SEGMENT,
  MESSAGE_SEGMENT,
  PIPELINE_DRAWING_SEGMENT,
  PLUGIN_SEGMENT,
  PROBLEM_SEGMENT,
  RECORD_SECTIONS,
  RENAMED_ADDRESSES,
  REPORT_SEGMENT,
  SESSION_SEGMENT,
  TODAY_SEGMENT,
  isRecordSection,
  parseRoute,
  renamedAddress,
  type CategoryKey,
  type FlatRoute,
  type RecordSection,
  type Route,
} from '@shared/addresses.ts'

export {
  CATEGORY_PAGES,
  categoryOfPage,
  FLAT_ROUTES,
  RECORD_SECTIONS,
  RENAMED_ADDRESSES,
  isRecordSection,
  parseRoute,
  renamedAddress,
  type CategoryKey,
  type RecordSection,
  type Route,
}

/** The address of one sidebar group's category page, from the same map that parses it. */
export const categoryPath = (key: CategoryKey) => pathFor(CATEGORY_PAGES[key])



/** The address of one family's page. Derived from the key, so it cannot drift from the parser. */
export const familyPath = (family: KindFamily) => `/${family}`


/** The address of the plan for whatever day it is when somebody opens it. */
export const planTodayPath = () => `${pathFor('plan')}/${TODAY_SEGMENT}`

/** The address of one period's plan, from the same page address the flat map holds. */
export const planPeriodPath = (period: string) => `${pathFor('plan')}/${encodeURIComponent(period)}`


/**
 * The same address, being written in.
 *
 * Given an address the parser accepts an `/edit` on. Handing it any other address builds a string
 * that parses as not-found, which is the honest outcome and not a silent one: the page says so.
 */
export function editingAddress(path: string): string {
  return `${path}/${EDIT_SEGMENT}`
}


/** The address of the plans page. */
export const plansPath = () => pathFor('plans')

/** The address of one plan, reading it or writing in it. */
export function planPath(id: string, opts: { edit?: boolean } = {}): string {
  const base = `${pathFor('plans')}/${encodeURIComponent(id)}`
  return opts.edit === true ? editingAddress(base) : base
}

/** The address of the governance queue. */
export const governancePath = () => pathFor('governance')

/** THE DIRECTIONS SOMEBODY STOPPED AND KEPT. `#/shelved`, criterion S2. */
export const shelvedPath = () => pathFor('shelved')

/** THE COUNTERS OF THIS PROJECT. `#/counters`, criterion CT8. With an id, one counter is opened. */
export function countersPath(id?: string): string {
  const base = pathFor('counters')
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

/** EVERYBODY'S CHECKLISTS. `#/checklists`. With an id, one checklist is opened. */
export function checklistsPath(id?: string): string {
  const base = pathFor('checklists')
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

/** THE FLOWS PAGE. `#/flows`. With an id, one flow, and with `edit` that flow in the editor. */
export function flowsPath(id?: string, opts: { edit?: boolean } = {}): string {
  const base = pathFor('flows')
  if (id === undefined) return base
  const one = `${base}/${encodeURIComponent(id)}`
  return opts.edit === true ? editingAddress(one) : one
}

/** A NEW FLOW: the flow editor with nothing in it. `#/flows/new`. */
export const newFlowPath = (): string => `${pathFor('flows')}/new`

/** THE READINESS CHECKLISTS. `#/readiness`. With an id, one checklist is opened. */
export function readinessPath(id?: string): string {
  const base = pathFor('readiness')
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

export function signingPackagePath(id?: string): string {
  const base = pathFor('signingPackages')
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

/** THE TOOLSET CATALOGUE. `#/toolset`, piece P3. With a slug, one tool's manual page is opened. */
export function toolsetPath(slug?: string): string {
  const base = pathFor('toolset')
  return slug === undefined ? base : `${base}/${encodeURIComponent(slug)}`
}

/** THE GOALS AT EACH HORIZON, THE CLUSTERS AND THEIR PARTS. `#/horizons`, criterion P5. */
export const horizonsPath = () => pathFor('horizons')






/**
 * The address of a one-segment page, derived from the same map that parses it.
 *
 * So a header link cannot point at an address the router does not know: both ends of every link
 * in the shell come out of FLAT_ROUTES. A name with no address is a programming mistake and says
 * so rather than returning "/undefined", which would render as a link to the not-found page.
 */
export function pathFor(name: FlatRoute['name']): string {
  const segment = Object.keys(FLAT_ROUTES).find((key) => FLAT_ROUTES[key] === name)
  if (segment === undefined) throw new Error(`No address is registered for the "${name}" page.`)
  return `/${segment}`
}

/**
 * Put the new address in the bar when somebody arrived on an old one.
 *
 * `replaceState` rather than setting the hash: setting it would add an entry, so pressing Back
 * would land on the old address and be corrected again, and the reader could never leave the page.
 * It fires no `hashchange` either, which is right — the route is already correct, because
 * `parseRoute` reads the old address as the new one. Only the bar is behind.
 */
function rewriteAddress(): void {
  const renamed = renamedAddress(window.location.hash)
  if (renamed === null) return
  window.history.replaceState(null, '', `#${renamed}`)
}

export function useRoute(): Route {
  // A project notification can render the shell before the queued hashchange task runs. Read
  // the address itself on that render, rather than keeping the previous page in React state.
  const hash = window.location.hash
  const [delivery, setDelivery] = useState(0)
  // A delivered event still commits the route, even if a project render already saw its address.
  // The shell's readiness effect must run after the browser's hashchange listeners clear it.
  const route = useMemo(() => parseRoute(hash), [hash, delivery])
  useEffect(() => {
    const onChange = () => {
      setDelivery(value => value + 1)
      rewriteAddress()
      toTheTopOfThePage()
    }
    window.addEventListener('hashchange', onChange)
    // The address a reader ARRIVED on is corrected too, not only the ones they reach by pressing
    // something. A bookmark opened cold is the commonest way an old address is read.
    rewriteAddress()
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/** Change the address from code, e.g. after creating a record. */
export function navigate(path: string, project?: string | null): void {
  // Publish the destination before a synchronous project notification can re-read the page.
  // useRoute sees this address immediately, even before the browser delivers hashchange.
  window.location.hash = path
  if (project !== undefined && project !== null) setWorkspace(project)
}

/**
 * The address of one record. THE ONLY PLACE A RECORD ADDRESS IS BUILT.
 *
 * Six surfaces link to a record — the records list, both query lists, the ranked list on Home, the
 * link panel and the graph — and every one of them says `#${recordPath(id)}`. Writing `#/r/${id}`
 * by hand is the same string for an ordinary id and a DIFFERENT address for one carrying a space, a
 * slash or a hash, so the two spellings agree right up to the first record that needs encoding.
 * tests/records-queries-pages.test.ts renders all six surfaces and fails when they disagree.
 *
 * AND NOW THE KIND IS BUILT IN, HERE AND NOWHERE ELSE. Criterion E2 on a decision:
 * not one page per kind; only the very common kinds without an
 * entry yet — report in particular — and their address is their own word, `#/report/<id>`, opening
 * the same record page it always did. A caller that HOLDS the record passes
 * its kind, and this builds the kind's word; a caller that holds only an id calls this the way it
 * always did and keeps the generic `#/r/<id>`, which opens the same record, and the record's kind is
 * then learnt by the page once the record has been read. The kinds with a page of their own by an
 * ADDRESS BUILT ELSEWHERE — a pipeline in FLAT_ROUTES, an incident by INCIDENT_SEGMENT, a citizen by
 * the profile segment — go through the same switch, so a press on a list row reaches the page that
 * record already has. Nothing is typed here twice: the report word comes from REPORT_SEGMENT in
 * src/shared/addresses.ts, the incident and profile words from the shared declarations, and the
 * pipeline's from FLAT_ROUTES by `pathFor`, every word the ones the parser reads too.
 *
 * THE PARAMETER ORDER: the kind comes before the section, because the kind is what every caller in
 * hand holds and can pass, and the section is a word tests use beside it. A section asked for with
 * no kind keeps the generic record address, exactly as before; a section asked WITH a kind is
 * appended to the kind's word, and the parser's own branch says which words it opens.
 */

/**
 * The address of one drawing, or of the page with no pipeline chosen.
 *
 * Derived from `pathFor('pipeline')` rather than writing "/pipeline" again, so the page's address
 * lives in FLAT_ROUTES and nowhere else — the same rule the rest of this file follows.
 */
/**
 * THE ADDRESS OF ONE PARTICIPANT'S PAGE. THE ONLY PLACE ONE IS BUILT.
 *
 * The chat presses it and the Messages page points at it, so writing
 * `#/who/${kind}/${id}` by hand in three files would be three spellings that agree right up to the
 * first id needing an escape. That is the same rule `recordPath` above states and the same reason.
 */
/**
 * THE ADDRESS OF ONE VISITING AGENT'S CREDENTIAL, FROM THE SHARED READER.
 *
 * The Embassy points at it and the office's mismatch line leads to it. Both ask credentialPagePath,
 * so the first id needing an escape cannot make two addresses disagree. Same rule as whoPath.
 */
export const visitorPath = (id: string) => credentialPagePath(id)

/** ONE PAGE OF A SWITCHED-ON PLUGIN (wave 13x round 15). The one place this address is built; the sidebar and the page's
 * own list of the plugin's pages both read it. */
export const pluginPagePath = (id: string, slug: string) =>
  `/${PLUGIN_SEGMENT}/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`

/** WHO HOLDS EACH CARD, criterion P72. The one place this address is built. */
export const roleCensusPath = () => `${pathFor('roles')}/${ROLE_CENSUS_SEGMENT}`
/** THE CASTING TABLE. */
export const castingPath = () => pathFor('casting')

/**
 * ONE INCIDENT'S SCENE, criterion I3. The one place this address is built: the record's head
 * presses it and a refusal or a lead may name it, so a second spelling here would be two addresses
 * that agree right up to the first id needing an escape. Same rule as `whoPath`.
 */
export const incidentPath = (id: string) => `/${INCIDENT_SEGMENT}/${encodeURIComponent(id)}`

/** ONE SECRETARY'S NOTEBOOK, criteria N1 to N4. Built from `whoPath` so the two cannot diverge. */
export const notebookPath = (kind: ParticipantKind, id: string) => `${whoPath(kind, id)}/${NOTEBOOK_SEGMENT}`

export const whoPath = (kind: ParticipantKind, id: string) =>
  // THE KIND IS NOT ENCODED, because it is not somebody's text: it is one of the two words in
  // PARTICIPANT_KINDS, and encoding it would let a word that needed encoding into that list. The
  // record address treats its section word the same way.
  `/${PROFILE_SEGMENT}/${kind}/${encodeURIComponent(id)}`

export const pipelinePath = (id?: string) =>
  id === undefined ? pathFor('pipeline') : `${pathFor('pipeline')}/${encodeURIComponent(id)}`

/** The drawing of every module, `#/pipeline/drawing`. The one place this address is built. */
export const pipelineDrawingPath = () => `${pathFor('pipeline')}/${PIPELINE_DRAWING_SEGMENT}`

/**
 * ONE MESSAGE'S OWN PAGE, criterion E2. The one place this
 * address is built: the lists that hold the record pass its kind to `recordPath`, and a refusal or a
 * lead may name it by hand, so a second spelling here would be two addresses that agree right up to
 * the first id needing an escape. Same rule as `whoPath` and `incidentPath`.
 */
export const messagePath = (id: string) => `/${MESSAGE_SEGMENT}/${encodeURIComponent(id)}`

/**
 * ONE PROBLEM'S OWN PAGE, criterion E2. The one place this
 * address is built: the lists that hold the record pass its kind to `recordPath`, and a refusal or a
 * lead may name it by hand, so a second spelling here would be two addresses that agree right up to
 * the first id needing an escape. Same rule as `whoPath`, `incidentPath` and `messagePath`.
 *
 * THE OPTIONAL `/edit` IS THE RECORD PAGE'S OWN RULE: reading is what a fresh visit gets, and the
 * state control that closes a problem appears once the address says the reader asked to write.
 */
export const problemPath = (id: string, opts: { edit?: boolean } = {}) => {
  const base = `/${PROBLEM_SEGMENT}/${encodeURIComponent(id)}`
  return opts.edit === true ? editingAddress(base) : base
}

/**
 * ONE AGENT RUN'S OWN PAGE, criterion E2.
 * The one place this address is built: the lists that hold the record pass its kind
 * to `recordPath`, and a refusal or a lead may name it by hand, so a second spelling here would be
 * two addresses that agree right up to the first id needing an escape. Same rule as `messagePath`.
 */
export const sessionPath = (id: string) => `/${SESSION_SEGMENT}/${encodeURIComponent(id)}`

/** ONE HANDBOOK'S OWN PAGE. The one place this address is built, for the reason `sessionPath` gives. */
export const handbookPath = (id: string) => `/${HANDBOOK_SEGMENT}/${encodeURIComponent(id)}`

/**
 * A QUICK NOTE'S ADDRESS. With no id it is a new note, which the page files when the person first writes or draws;
 * with one it is that note. The one place this address is built, for the reason `sessionPath` gives.
 */
export const quickNotePath = (id?: string) =>
  id === undefined ? pathFor('quickNote') : `${pathFor('quickNote')}/${encodeURIComponent(id)}`

const KIND_OWN_PAGE: Partial<Record<RecordKind, (id: string) => string>> = {
  report: (id) => `/${REPORT_SEGMENT}/${encodeURIComponent(id)}`,
  // A MESSAGE'S OWN PAGE IS A PAGE OF ITS OWN, not the record page. The builder lives here and the
  // parser's own branch reads the same word, so the address a list builds is the address a reader
  // can open. Criterion E2.
  message: messagePath,
  // A PROBLEM'S OWN PAGE IS A PAGE OF ITS OWN TOO, criterion E2 on the same decision. The plain
  // builder is what a list that holds the kind builds; `/edit` is added by a caller that asks for it,
  // exactly as `recordPath` never adds an edit word on its own.
  problem: problemPath,
  // A RUN'S OWN PAGE IS A PAGE OF ITS OWN TOO, on the same decision and for the same reason.
  session: sessionPath,
  handbook: handbookPath,
  pipeline: pipelinePath,
  incident: incidentPath,
  agent: (id) => whoPath('agent', id),
  // A QUICK NOTE OPENS ON THE NOTE PAGE, where it is written and drawn in, and not on the record page.
  quick_note: quickNotePath,
}

export const recordPath = (
  id: string,
  kind?: RecordKind,
  section?: RecordSection,
): string => {
  // The kind word is NOT encoded either, for the same reason the section word was not: it is one of
  // the words in the address grammar, and both readers of the grammar are the ones this file
  // imports. A kind without a word in the address has no page of its own to build; the generic
  // record address is the address it has, and the parse is the same one it always read.
  const own = kind === undefined ? undefined : KIND_OWN_PAGE[kind]
  const base = own === undefined ? `/r/${encodeURIComponent(id)}` : own(id)
  return section === undefined
    ? base
    : // The section word is NOT encoded, because it is not somebody's text: it is one of the words in
      // RECORD_SECTIONS, and encoding it would let a word that needed encoding into that list.
      `${base}/${section}`
}

export const hrefOf = (path: string): string => `#${path}`

/**
 * An ordinary anchor whose target is a hash route. Ordinary is deliberate: middle-click to open
 * in a new tab, copy link address, and browser Back all keep working for free.
 *
 * IT ALSO CARRIES THE MARK THAT SAYS "THE WORDS IN HERE ARE THE NAME OF THE THING AROUND ME", and
 * until now it dropped it. Two callers write `{...DRAWS_THE_NAME}` on a `RouteLink` — the open-loop
 * row and the link row on a record page — and neither reached the anchor: a JSX spread is not
 * checked for extra properties, so the attribute went nowhere and nothing failed.
 *
 * WHAT THAT COST, MEASURED ON 30 AUGUST 2026 on report `m2Q0CybxoGNF`. A right-click on a row of
 * *What is still open around this* named the record it points at with the words of the whole row —
 * `problem Section 7 of report m2Q0CybxoGNF tells the owner …` — because the name walk fell through
 * to the row's own text and swept up the kind tag drawn beside the sentence. The composer draws the
 * kind in front of the title now, so a reader saw the kind twice.
 *
 * THE PROPERTY IS NAMED FROM `NAME_ATTRIBUTE` RATHER THAN SPELT AGAIN, and the import is
 * type-only, so this file gains no run-time edge into the pointing code that imports it back.
 *
 * IT ALSO CARRIES THE MARK THAT SAYS WHAT THE THING IS, for the anchor that IS the thing: a
 * reference to a record inside a sentence — *Step 6 of <a plan>*, the session name on a change
 * row — is a linked record reference, and that one must stay identifiable as the
 * semantic object. The declaration is still made by `declaredAttributes`, in the caller; all this
 * type does is stop the spread being dropped in silence, which is the fault the paragraph above
 * records for the name mark.
 */
export function RouteLink({
  to,
  className,
  title,
  children,
  ...marks
}: {
  to: string
  className?: string
  title?: string
  children: React.ReactNode
} & Partial<Record<typeof NAME_ATTRIBUTE | typeof TARGET_ATTRIBUTE, string>>) {
  return (
    <a href={hrefOf(to)} className={className} title={title} {...marks}>
      {children}
    </a>
  )
}
