// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t, type WordKey } from '@shared/i18n.ts'
import { groupHeading } from '@shared/contacts.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { useRef, useState, type ReactNode } from 'react'
import { faultOf, api, errorMessage } from '../api.ts'
import { Avatar } from '../components/Avatar.tsx'
import { AgentProjectMarks } from '../components/AgentProjectMarks.tsx'
import { PersonalAgentMarks } from '../components/PersonalAgentTags.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, useAsync, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
// SOMEBODY AT THE DOOR WHO REGISTERED ITSELF, OR ASKS FOR A CARD, with the person's press. Problem NXEhOBumu5ZZ.
import { AsksAtTheDoor, asksAtTheDoor } from '../components/AsksAtTheDoor.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
// PERMANENT RESIDENTS: the mark on a resident's row, the count at the Agents heading, and the open
// proposals with the person's press beside the asks at the door.
import { ResidentMark } from '../components/ResidentMark.tsx'
import { ResidentProposalList } from '../components/ResidentProposals.tsx'
import type { TheResidentsList } from '../lib/residents.ts'
import type { WaitingReply } from '../lib/waiting.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { Dot } from '../components/ContactChooser.tsx'
import { RouteLink, visitorPath, whoPath } from '../components/router.tsx'
import { theCrossOriginOfALoad, whereRequestsGo } from '../lib/visiting.ts'
import { OpensLarge } from '../components/PictureLarge.tsx'
import { smallPortrait } from '@shared/portraits.ts'
import { type ParticipantKind } from '@shared/participants.ts'
import { worldKindWord } from '@shared/words.ts'
import { NO_ROLE_SET, whoChoseTheCardInAWord } from '@shared/roles.ts'
import { cardWord } from '@shared/card-words.ts'
import type { EmbassyOffice, EmbassyRow, EmbassyView, EmbassyWorldRow, WhatTheEmbassySays } from '@shared/worlds.ts'
import { anAskTheEmbassyDraws, isEphemeral } from '@shared/worlds.ts'
import { isAPersonsDeviceCredential, noKeyWorksUnder, type VisitorCredential } from '@shared/visitors.ts'
import { drawnStamp } from '@shared/time.ts'
export const EMBASSY_WORDS = {
  get everybody() { return t('g4.embassy.everybody') },
  get showEveryone() { return t('g4.embassy.showEveryone') },
  get showContactsOnly() { return t('g4.embassy.showContactsOnly') },
  hidden: (count: number): string => t('g4.embassy.hidden', { n: count }),
  get nobody() { return t('g4.embassy.nobody') },
  standingWord: {
    citizen: '',
    get visitor() { return t('g4.embassy.visiting') },
  } as Readonly<Record<string, string>>,
  get showRetired() { return t('g4.embassy.showRetired') },
  get hideRetired() { return t('g4.embassy.hideRetired') },
  get retiredMark() { return t('g4.embassy.retiredMark') },
  get retiredBy() { return t('g4.embassy.retiredBy') },
  get asking() { return t('g4.embassy.asking') },
  get confirm() { return t('g4.embassy.confirm') },
  get confirming() { return t('g4.embassy.confirming') },
  get refuse() { return t('g4.embassy.refuse') },
  get refusing() { return t('g4.embassy.refusing') },
  get revokeKey() { return t('g4.embassy.revokeKey') },
  get revokingKey() { return t('g4.embassy.revokingKey') },
  keyRevoked: (name: string): string => t('g4.embassy.keyRevoked', { name }),
  undoKey: (seconds: number): string => t('g4.embassy.undoKey', { seconds }),
  get undoingKey() { return t('g4.embassy.undoingKey') },
  get waitForTheOther() { return t('g4.embassy.waitForTheOther') },
  get firstCalled() { return t('g4.embassy.firstCalled') },
  get onlyContacts() { return t('g4.embassy.onlyContacts') },
  get unregistered() { return t('g4.embassy.unregistered') },
  get world() { return t('g4.embassy.world') },
  get from() { return t('g4.embassy.from') },
  get since() { return t('g4.embassy.since') },
  get until() { return t('g4.embassy.until') },
  get citizenSince() { return t('g4.embassy.citizenSince') },
  get group() { return t('g4.embassy.group') },
  unnamedWorld: (identity: string): string => t('g4.embassy.unnamedWorld', { identity }),
  get worlds() { return t('g4.embassy.worlds') },
  get noWorlds() { return t('g4.embassy.noWorlds') },
  get showEveryWorld() { return t('g4.embassy.showEveryWorld') },
  get showLiveWorlds() { return t('g4.embassy.showLiveWorlds') },
  get noWorldYet() { return t('g4.embassy.noWorldYet') },
  credentialStanding: {
    get pending() { return t('g4.embassy.pending') },
    get trusted() { return t('g4.embassy.trusted') },
    get ended() { return t('g4.embassy.ended') },
  },
  get onFacts() { return t('g4.embassy.onFacts') },
  get didRequests() { return t('g4.embassy.didRequests') },
  get didWrites() { return t('g4.embassy.didWrites') },
  get didMismatches() { return t('g4.embassy.didMismatches') },
  get confirmedBy() { return t('g4.embassy.confirmedBy') },
  get runsOut() { return t('g4.embassy.runsOut') },
  get noFact() { return t('g4.embassy.noFact') },
  get runtime() { return t('g4.embassy.runtime') },
  get unknownRuntime() { return t('g4.embassy.unknownRuntime') },
  get machine() { return t('g4.embassy.machine') },
  get worldOwner() { return t('g4.embassy.worldOwner') },
  get worldCitizens() { return t('g4.embassy.worldCitizens') },
  get worldVisits() { return t('g4.embassy.worldVisits') },
  get worldCredentials() { return t('g4.embassy.worldCredentials') },
  get worldIsThisOne() { return t('g4.embassy.worldIsThisOne') },
  get noOwner() { return t('g4.embassy.noOwner') },
  portraitOf: (role: string, chosen: boolean): string => t(chosen ? 'g4.embassy.portraitChosen' : 'g4.embassy.portraitFirst', { role }),
  get card() { return t('g4.embassy.card') },
  get noCard() { return t('g4.embassy.noCard') },
  get chosenBy() { return t('g4.embassy.chosenBy') },
  get registeredOn() { return t('g4.embassy.registeredOn') },
  /** On the person's own row: how many browsers they have and how many wait for them. Their rows are on that card. */
  hisBrowsers: (n: number): string => t('w13s.embassy.hisBrowsers', { n }),
  hisBrowsersWaiting: (n: number): string => t('w13s.embassy.hisBrowsersWaiting', { n }),
} as const

// THE CARD WORDS, read in the page language by the one function every page that names a card uses
// (src/shared/card-words.ts, problem SGTqdnfCmQxh). Any other card word was written by a person and is
// drawn as written. Plan 7FEOshq3mBGG, row F1, put the first copy of this reading here.

/** A row's contact group: a declared group in the page language, a made one as it was written. */
function groupWord(row: Pick<EmbassyRow, 'group' | 'groupKey' | 'groupMade'>): string | null {
  if (row.group === null) return null
  if (row.groupKey === null || row.groupMade === null) return content(row.group)
  return groupHeading({ key: row.groupKey, name: row.group, made: row.groupMade })
}

/** What a press on an asking card answers: the credential it acted on, and the one row that changed. */
export type AnAnsweredCredential = { credential: VisitorCredential; row: EmbassyRow | null }

export function EmbassyPage({
  waiting,
  onWaitingChanged,
}: {
  /** The one reading of what is waiting on the person, fetched once by App.tsx. */
  waiting?: AsyncState<WaitingReply>
  /** A press on an ask takes it off that reading, so the frame reads it again. */
  onWaitingChanged?: () => void
} = {}) {
  useLanguage()
  /**
   * THE VIEW THE PAGE IS DRAWING, kept here so a reading the changes drag in asks for the same view.
   * The page's own presses read through `TheEmbassy`, because a press must not put the hook back to
   * loading and blank the list; this ref is how the follows reading knows what to ask for.
   */
  const view = useRef<EmbassyView>({ everyone: false, retired: false, tests: false })
  // WHO THE OFFICE KNOWS, read again when an agent is registered or its registry row changes, when a visit is
  // registered or ended, and when what waits on the person changes, at most once in 5 seconds
  // (src/web/lib/record-changes.ts). A pairing request asked, confirmed or ended elsewhere is announced on that last
  // list, so a visitor's ask for a card is drawn here, and leaves the asking list, with no reload.
  const [state, readAgain] = useProjectAsync(() => api.embassy(view.current), [], { follows: { lists: ['participants', 'visits', 'needsYou'], atMostEveryMs: 5_000 } })
  // WHO IS A PERMANENT RESIDENT, AND WHAT IS PROPOSED, for the marks and the proposals' rows. Read again when a proposal
  // or a decision is stored, because confirming a proposal stores a decision linked to it.
  const [residents, readResidentsAgain] = useAsync(() => api.residents(), [], { follows: { kinds: ['proposal', 'decision'], atMostEveryMs: 5_000 } })
  return (
    <div className="page emb">
      <style href="mole-office-embassy" precedence="default">
        {EMBASSY_CSS}
      </style>
      <h1 className="emb-title" data-title-is="its-label">{t('nav.embassy')}</h1>
      {state.status === 'loading' ? <Loading what={t('g4.embassy.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheEmbassy
          said={state.value}
          residents={residents}
          onView={(onThePage) => {
            view.current = onThePage
          }}
          onResidentsAnswered={() => {
            readResidentsAgain()
            onWaitingChanged?.()
          }}
          {...(waiting?.status === 'ready'
            ? {
                asks: waiting.value,
                // AN ADMITTED AGENT JOINS THE LIST BELOW, so the Embassy is read again as well.
                onAsksAnswered: () => {
                  readAgain()
                  onWaitingChanged?.()
                },
              }
            : {})}
        />
      ) : null}
    </div>
  )
}
export function TheEmbassy({
  said,
  asks,
  onAsksAnswered,
  residents,
  onResidentsAnswered,
  onView,
}: {
  said: WhatTheEmbassySays
  /** What is waiting on the person; its asks at the door are drawn first. Absent, none are drawn. */
  asks?: WaitingReply
  onAsksAnswered?: () => void
  /** Who is a permanent resident and what is proposed. Absent, no mark and no proposal is drawn. */
  residents?: AsyncState<TheResidentsList>
  onResidentsAnswered?: () => void
  /** The view a press has just asked the office for, so the changes reading asks for the same one. */
  onView?: (view: EmbassyView) => void
}) {
  const inspect = useInspect()
  const [shown, setShown] = useState(said)
  const [readFrom, setReadFrom] = useState(said)
  /**
   * THE ROWS AFTER THE FIRST PAGE. A page reply carries one page; the rest come when the reader asks
   * with `next`. A reading that arrives from outside replaces both, so nothing from the old view is
   * left on the page.
   */
  const [moreRows, setMoreRows] = useState<EmbassyRow[]>([])
  const [nextPage, setNextPage] = useState<string | null>(said.next ?? null)
  const [reading, setReading] = useState(false)
  const [readFault, setReadFault] = useState<string | null>(null)
  if (readFrom !== said) {
    setReadFrom(said)
    setShown(said)
    setMoreRows([])
    setNextPage(said.next ?? null)
    setReadFault(null)
  }
  // ONCE AN ASK AT THE DOOR IS DRAWN, ITS PANEL STAYS, so the row can say what the press did after the
  // ask has left the waiting list.
  const [sawAsks, setSawAsks] = useState(false)
  if (!sawAsks && asks !== undefined && asksAtTheDoor(asks).length > 0) setSawAsks(true)
  // AND ONCE A PROPOSAL TO MAKE AN AGENT A RESIDENT IS DRAWN, the same: its row says what the press did.
  const [sawProposals, setSawProposals] = useState(false)
  if (!sawProposals && residents?.status === 'ready' && residents.value.openProposals.length > 0) setSawProposals(true)
  const residentSince: ReadonlyMap<string, string> =
    residents?.status === 'ready' ? new Map(residents.value.residents.map((one) => [one.agentId, one.since] as const)) : new Map()
  const [everyone, setEveryone] = useState(false)
  const [tests, setTests] = useState(false)
  const [retired, setRetired] = useState(false)
  const stillRunning = (one: EmbassyWorldRow): boolean => one.world.diedAt === null && !isEphemeral(one.world.kind)
  // THE PERSON'S BROWSERS ARE ON THEIR OWN CARD, design C of early idea B9: their asks and their rows are not drawn
  // here, and the person's one row says how many there are. The same split as the office's page (shared/worlds.ts).
  const waiting = shown.visitors.filter(anAskTheEmbassyDraws)
  // A PAGE REPLY SAYS WHAT IT HOLDS AND WHAT IS LEFT; a hand-made or older reply is filtered here as
  // it always was. `rowsTotal` is the mark that the office made a page.
  const aPage = shown.rowsTotal !== undefined
  const citizens = shown.rows.filter((one) => !one.device)
  const live = citizens.filter((one) => one.standing !== 'asks to come in' && one.retired === null)
  const closed = citizens.filter((one) => one.retired !== null)
  const aRowToPress = (one: EmbassyRow): boolean => one.contact || one.credential !== null || one.hisBrowsers !== undefined
  const onlyContacts = (list: EmbassyRow[]): EmbassyRow[] => (everyone ? list : list.filter(aRowToPress))
  const rows = aPage ? [...citizens, ...moreRows.filter((one) => !one.device)] : onlyContacts(retired ? [...live, ...closed] : live)
  const worlds = aPage ? shown.worlds : tests ? shown.worlds : shown.worlds.filter(stillRunning)
  const hidden = shown.hidden ?? live.filter((one) => !aRowToPress(one)).length
  const retiredCount = shown.retiredCount ?? closed.length
  const otherWorlds = shown.otherWorlds ?? shown.worlds.filter((one) => !stillRunning(one)).length
  const left = aPage ? Math.max(0, (shown.rowsTotal ?? 0) - rows.length) : 0
  /**
   * READ THE VIEW THE PRESS ASKED FOR, without putting the page's own hook back to loading. The list
   * stays where it is while the office answers, the way P77's press does.
   */
  const readThePage = (want: Partial<EmbassyView>): void => {
    const after: EmbassyView = { everyone, retired, tests, ...want }
    setReading(true)
    setReadFault(null)
    onView?.(after)
    void api
      .embassy(after)
      .then((page) => {
        setShown(page)
        setMoreRows([])
        setNextPage(page.next ?? null)
        setEveryone(after.everyone)
        setRetired(after.retired)
        setTests(after.tests)
      })
      .catch((error: unknown) => setReadFault(errorMessage(error)))
      .finally(() => setReading(false))
  }
  const readMore = (): void => {
    if (nextPage === null) return
    setReading(true)
    setReadFault(null)
    void api
      .embassy({ next: nextPage })
      .then((page) => {
        // A ROW THE CONFIRM PRESS ALREADY PUT IN THE LIST IS NOT DRAWN TWICE when its page arrives.
        setMoreRows((was) => {
          const have = new Set([...shown.rows, ...was].map(rowKey))
          return [...was, ...page.rows.filter((one) => !have.has(rowKey(one)))]
        })
        setNextPage(page.next ?? null)
      })
      .catch((error: unknown) => setReadFault(errorMessage(error)))
      .finally(() => setReading(false))
  }
  /**
   * WHAT A PRESS ON AN ASKING CARD CHANGED, IN PLACE. The card leaves the asking block, and the one
   * row the office built takes its place in the list. No page is read again (criterion P77).
   */
  const answered = (answer: AnAnsweredCredential): void => {
    setShown((was) => {
      const visitors = was.visitors.filter((one) => one.id !== answer.credential.id)
      const row = answer.row
      // ENDING A CREDENTIAL THAT WAS STILL ASKING MAKES IT ONE OF THE RETIRED ROWS, so the retired
      // press's count takes it in where it stands.
      if (row === null) {
        return answer.credential.standing === 'ended'
          ? { ...was, visitors, retiredCount: (was.retiredCount ?? 0) + 1 }
          : { ...was, visitors }
      }
      const at = was.rows.findIndex((one) => rowKey(one) === rowKey(row))
      const nextRows = at === -1 ? [...was.rows, row] : was.rows.map((one, index) => (index === at ? row : one))
      return {
        ...was,
        visitors,
        rows: nextRows,
        rowsTotal: (was.rowsTotal ?? was.rows.length) + (at === -1 ? 1 : 0),
      }
    })
  }
  return (
    <>
      {/* WHAT NEEDS THE PERSON COMES FIRST (shared rule R6): the asks, or one quiet line when there are none. */}
      {/* "NOTHING NEEDS YOU" ONLY WHEN THE PAGE KNOWS: if the proposals could not be read, it says that instead. */}
      {waiting.length === 0 && !sawAsks && !sawProposals ? (
        <p className="emb-nothing">{t(residents?.status === 'error' ? 'resident.readFailed' : 'embassyPage.nothingNeedsYou')}</p>
      ) : (
        <AskingToComeIn credentials={waiting} onAnswered={answered}
          asks={<>
            {asks === undefined ? null : <AsksAtTheDoor reply={asks} onAnswered={onAsksAnswered ?? (() => {})} />}
            {residents?.status === 'ready' ? (
              <ResidentProposalList reply={residents.value} onAnswered={onResidentsAnswered ?? (() => {})} />
            ) : residents?.status === 'error' ? (
              <p className="emb-nothing">{t('resident.readFailed')}</p>
            ) : null}
          </>} />
      )}
      <SideBySide className="emb-sides">
        <div data-column="start">
          <Panel titleIs="label" declares={{ surface: 'embassy.citizens' }} title={EMBASSY_WORDS.everybody} actions={<>
            {hidden === 0 ? null : (
              <button
                type="button"
                className="emb-show"
                aria-pressed={everyone}
                disabled={reading}
                onClick={() => {
                  readThePage({ everyone: !everyone })
                }}
              >
                {everyone ? EMBASSY_WORDS.showContactsOnly : EMBASSY_WORDS.showEveryone}
                <span className="emb-count">{EMBASSY_WORDS.hidden(hidden)}</span>
              </button>
            )}
            {retiredCount === 0 ? null : (
              <button
                type="button"
                className="emb-show"
                aria-pressed={retired}
                disabled={reading}
                onClick={() => {
                  readThePage({ retired: !retired })
                }}
              >
                {retired ? EMBASSY_WORDS.hideRetired : EMBASSY_WORDS.showRetired}
                <span className="emb-count">{EMBASSY_WORDS.hidden(retiredCount)}</span>
              </button>
            )}
          </>}>
            <Rows rows={rows} residentSince={residentSince} />
            {nextPage === null ? null : (
              <button type="button" className="emb-show emb-more" disabled={reading} onClick={readMore}>
                {reading ? t('embassyPage.readingMore') : t('embassyPage.showMore')}
                {left === 0 ? null : <span className="emb-count">{EMBASSY_WORDS.hidden(left)}</span>}
              </button>
            )}
            {readFault === null ? null : <p className="emb-nothing" role="alert">{readFault}</p>}
            <TheOfficeItself office={shown.office} />
          </Panel>
        </div>
        <div data-column="end">
          <Panel titleIs="label" declares={{ surface: 'embassy.worlds' }} title={EMBASSY_WORDS.worlds}>
            {otherWorlds === 0 ? null : (
              <button
                type="button"
                className="emb-show"
                aria-pressed={tests}
                disabled={reading}
                onClick={() => {
                  readThePage({ tests: !tests })
                }}
              >
                {tests ? EMBASSY_WORDS.showLiveWorlds : EMBASSY_WORDS.showEveryWorld}
                <span className="emb-count">{EMBASSY_WORDS.hidden(otherWorlds)}</span>
              </button>
            )}
            {worlds.length === 0 ? (
              <p className="emb-none"><Absence tier="told-apart" looked word={t('absence.none')} /></p>
            ) : (
              <ul className="emb-list">
                {worlds.map((one) => (
                  <WorldRow key={one.world.id} row={one} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </SideBySide>
    </>
  )
}
function WorldRow({ row }: { row: EmbassyWorldRow }) {
  const inspect = useInspect()
  return (
    <li className="emb-row emb-world">
      <div className="emb-words">
        <span className="emb-top">
          <span className="emb-name">{row.world.name}</span>
          <span className="emb-kind">{worldKindWord(row.world.kind).text}</span>
          {row.isThisWorld ? <span className="emb-standing">{EMBASSY_WORDS.worldIsThisOne}</span> : null}
        </span>
        <span className="emb-where">
          <span className="emb-key">{EMBASSY_WORDS.worldOwner}</span>
          <span className="emb-value">{inspect && row.owner !== null ? row.owner.id : <Absence />}</span>
          <span className="emb-key">{EMBASSY_WORDS.worldCitizens}</span>
          <span className="emb-value">{row.citizens}</span>
          <span className="emb-key">{EMBASSY_WORDS.worldVisits}</span>
          <span className="emb-value">{row.visitsTo}</span>
          <span className="emb-key">{EMBASSY_WORDS.worldCredentials}</span>
          <span className="emb-value">{row.credentials}</span>
          <span className="emb-key">{EMBASSY_WORDS.didRequests}</span>
          <span className="emb-value">{row.requests}</span>
          <span className="emb-key">{EMBASSY_WORDS.didMismatches}</span>
          <span className="emb-value" data-mismatch={row.mismatches > 0 ? 'yes' : 'no'}>
            {row.mismatches}
          </span>
        </span>
        {inspect ? <span className="emb-claim">{row.ownerIsAClaim}</span> : null}
      </div>
    </li>
  )
}
function Rows({
  rows,
  residentSince = new Map(),
}: {
  rows: EmbassyRow[]
  /** Each permanent resident's agent id, with when the person confirmed it. */
  residentSince?: ReadonlyMap<string, string>
}) {
  if (rows.length === 0) {
    return <p className="emb-none"><Absence /></p>
  }
  // A GROUPED LIST: agents, people, devices (report n9Mjk3c_sJRu, block b-13). The kind every row in
  // a group shares is said once, at the group's heading (shared rule R11).
  return (
    <div className="emb-groups">
      {CITIZEN_GROUPS.map((group) => {
        const inIt = rows.filter((one) => citizenGroupOf(one) === group)
        // THE COUNT AT THE AGENTS HEADING is of the marks drawn under it, so the two cannot disagree.
        const marked = group === 'agent' ? inIt.filter((one) => residentOf(one, residentSince) !== null).length : 0
        return inIt.length === 0 ? null : (
          <section key={group} className="emb-group" data-group={group}>
            <h3 className="emb-group-title" data-title-is="its-label">
              {t(GROUP_WORDS[group])}
              {marked === 0 ? null : <span className="emb-resident-count" data-residents={marked}> · {t('resident.count', { n: marked })}</span>}
            </h3>
            <ul className="emb-list">
              {inIt.map((one) => (
                <Row key={rowKey(one)} row={one} residentSince={residentOf(one, residentSince)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
/**
 * THE OFFICE'S OWN SENDER ROW, IN A SECTION OF ITS OWN BELOW THE CITIZENS. It is the office itself
 * and not an agent somebody runs, so it draws no card: its picture, its name, and the one sentence on
 * which messages it sends.
 */
function TheOfficeItself({ office }: { office: EmbassyOffice }) {
  const inspect = useInspect()
  const name = office.name ?? (inspect ? office.who.id : t('absence.mark'))
  return (
    <div className="emb-groups emb-office">
      <section className="emb-group" data-group="office">
        <h3 className="emb-group-title" data-title-is="its-label">{t('embassyPage.group.office')}</h3>
        <ul className="emb-list">
          <li className="emb-row" data-standing="office">
            <span className="emb-picture"><Avatar kind="agent" id={office.who.id} name={name} url={office.avatarUrl} size={40} /></span>
            <div className="emb-words">
              <span className="emb-top">
                <RouteLink to={whoPath('agent', office.who.id)} className="emb-name">{name}</RouteLink>
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  )
}
const CITIZEN_GROUPS = ['agent', 'person', 'device'] as const
const GROUP_WORDS: Readonly<Record<(typeof CITIZEN_GROUPS)[number], WordKey>> = {
  agent: 'embassyPage.group.agent',
  person: 'embassyPage.group.person',
  device: 'embassyPage.group.device',
}
function citizenGroupOf(row: EmbassyRow): (typeof CITIZEN_GROUPS)[number] {
  if (row.device) return 'device'
  return row.who.kind === 'person' ? 'person' : 'agent'
}
/** When the person confirmed this row's agent as a permanent resident, or null when it is not one. */
function residentOf(row: EmbassyRow, residentSince: ReadonlyMap<string, string>): string | null {
  if (row.who.kind !== 'agent' || row.device) return null
  return residentSince.get(row.who.id) ?? null
}
function rowKey(row: EmbassyRow): string {
  return [row.standing, row.who.kind, row.who.id, row.world, row.since ?? ''].join('/')
}
/** Whether the row opens the citizen's own page (a profile) rather than the credential it came in on. */
function opensTheProfile(row: EmbassyRow): boolean {
  return row.registered || row.credential === null
}
function wherePressingTheRowGoes(row: EmbassyRow): string {
  if (opensTheProfile(row)) return whoPath(row.who.kind as ParticipantKind, row.who.id)
  return visitorPath(row.credential as string)
}
function Row({
  row,
  residentSince = null,
}: {
  row: EmbassyRow
  /** When this agent became a permanent resident, or null when it is not one. */
  residentSince?: string | null
}) {
  const inspect = useInspect()
  const name = row.name ?? (inspect ? row.who.id : t('absence.mark'))
  const presence = row.presence?.word
  const presenceWord = presence === 'Online' ? t('g4.embassy.online')
    : presence === 'Offline' ? t('g4.embassy.offline')
      : presence === 'Answering' ? t('g4.embassy.answering')
        : presence === 'Gone' ? t('g4.embassy.gone')
          : presence === 'Inactive' ? t('g4.embassy.inactive')
            : inspect ? presence ?? '' : t('absence.mark')
  const kind = row.who.kind as ParticipantKind
  const mark = EMBASSY_WORDS.standingWord[row.standing] ?? ''
  return (
    <li
      className="emb-row"
      data-standing={row.standing}
      data-contact={row.contact ? 'yes' : 'no'}
      data-retired={row.retired === null ? 'no' : 'yes'}
      data-device={row.device ? 'yes' : 'no'}
    >
      {row.portrait === null ? (
        <span className="emb-picture"><Avatar kind={kind} id={row.who.id} name={name} url={row.avatarUrl} size={40} /></span>
      ) : (
        // A SMALL COPY IS DRAWN, AND A PRESS OPENS THE WHOLE PICTURE. See src/server/lib/portraits.ts.
        <OpensLarge src={whereRequestsGo(row.portrait)} crossOrigin={theCrossOriginOfALoad()} alt={EMBASSY_WORDS.portraitOf(cardWord(row.role ?? ''), row.chosePortrait)}>
          <img
            className="emb-portrait"
            src={whereRequestsGo(smallPortrait(row.portrait))}
            crossOrigin={theCrossOriginOfALoad()}
            alt={EMBASSY_WORDS.portraitOf(cardWord(row.role ?? ''), row.chosePortrait)}
            data-chosen={row.chosePortrait ? 'yes' : 'no'}
            width={40}
            height={40}
          />
        </OpensLarge>
      )}
      <div className="emb-words">
        <span className="emb-top">
          <RouteLink to={wherePressingTheRowGoes(row)} className="emb-name">
            {name}{row.retired?.at ? <> — {EMBASSY_WORDS.retiredMark} {drawnStamp(row.retired.at)}</> : null}
          </RouteLink>
          {mark === '' ? null : <span className="emb-standing">{mark}</span>}
          {row.registered && row.who.kind === 'agent' && !row.device && row.projects !== undefined ? <AgentProjectMarks projects={row.projects} /> : null}
          {row.registered && row.who.kind === 'agent' ? <PersonalAgentMarks marks={row.personalTags ?? []} /> : null}
          {row.retired === null ? null : (
            <>
              <span className="emb-retired">{EMBASSY_WORDS.retiredMark}</span>
              {row.retired.because === null ? null : (
                <span className="emb-value">{row.retired.because}</span>
              )}
              {row.retired.by === null ? null : (
                <>
                  <span className="emb-key">{EMBASSY_WORDS.retiredBy}</span>
                  <span className="emb-value">{row.retired.byHandle ?? (inspect ? row.retired.by.id : <Absence />)}</span>
                </>
              )}
            </>
          )}
          {!row.registered || row.role === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.card}</span>
              <span className="emb-value">{row.choseRole ? cardWord(row.role) : inspect ? NO_ROLE_SET : <Absence />}</span>
            </>
          )}
          {!row.registered || row.who.kind !== 'agent' ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.chosenBy}</span>
              <span className="emb-value">{inspect ? whoChoseTheCardInAWord(row.cardChosenBy, row.cardChosenByHandle ?? null) : row.cardChosenByHandle ?? <Absence />}</span>
            </>
          )}
          {row.credential === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.registeredOn}</span>
              <RouteLink to={visitorPath(row.credential)} className="emb-value">
                {inspect ? row.credential : t('g4.embassy.openCredential')}
              </RouteLink>
            </>
          )}
          {row.registered || row.standing === 'asks to come in' ? null : (
            <span className="emb-unregistered">{EMBASSY_WORDS.unregistered}</span>
          )}
          {row.hisBrowsers === undefined ? null : (
            <RouteLink to={whoPath('person', row.who.id)} className="emb-value">
              {EMBASSY_WORDS.hisBrowsers(row.hisBrowsers.paired)}
              {row.hisBrowsers.waiting === 0 ? null : <> · {EMBASSY_WORDS.hisBrowsersWaiting(row.hisBrowsers.waiting)}</>}
            </RouteLink>
          )}
          {!inspect || row.who.kind !== 'agent' || row.device ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.runtime}</span>
              <span className="emb-value">{row.runtime ?? EMBASSY_WORDS.unknownRuntime}</span>
            </>
          )}
          {!inspect || row.machine === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.machine}</span>
              <span className="emb-value">{row.machine}</span>
            </>
          )}
          {row.group === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.group}</span>
              <span className="emb-value">{groupWord(row)}</span>
            </>
          )}
        </span>
        <span className="emb-where">
          <span className="emb-key">{EMBASSY_WORDS.world}</span>
          <span className="emb-value">{row.worldName && row.worldName !== row.world ? row.worldName : inspect ? EMBASSY_WORDS.unnamedWorld(row.world) : <Absence />}</span>
          {row.fromWorld === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.from}</span>
              <span className="emb-value">{row.fromWorldName && row.fromWorldName !== row.fromWorld ? row.fromWorldName : inspect ? EMBASSY_WORDS.unnamedWorld(row.fromWorld) : <Absence />}</span>
            </>
          )}
          {row.since === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.since}</span>
              <span className="emb-value">{drawnStamp(row.since)}</span>
            </>
          )}
          {row.until === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.until}</span>
              <span className="emb-value">{drawnStamp(row.until)}</span>
            </>
          )}
          {row.citizenSince === null ? null : (
            <>
              <span className="emb-key">{EMBASSY_WORDS.citizenSince}</span>
              <span className="emb-value">{drawnStamp(row.citizenSince)}</span>
            </>
          )}
        </span>
        {!inspect || row.admittedBeforeP88 === null ? null : <span className="emb-claim">{row.admittedBeforeP88}</span>}
        {!inspect || row.cardCeilingRaised === null ? null : <span className="emb-claim">{row.cardCeilingRaised}</span>}
        {!inspect || row.pickUpCost === null ? null : <span className="emb-claim">{row.pickUpCost.warning}</span>}
      </div>
      <div className="emb-side">
        {row.presence === null ? null : (
          <span className="emb-presence">
            <Dot reading={{ ...row.presence, word: presenceWord, says: inspect ? row.presence.says : '' } as Parameters<typeof Dot>[0]['reading']} />
            <span className="emb-presence-word">{presenceWord}</span>
          </span>
        )}
        {residentSince === null ? null : <ResidentMark since={residentSince} />}
        {/* NO REVOKE KEY HERE: it is on the citizen's own page, the profile or the credential page this
            row opens (question 15 of a decision; RevokeTheirKey.tsx). */}
      </div>
    </li>
  )
}
function AskingToComeIn({
  credentials,
  onAnswered,
  asks,
}: {
  credentials: VisitorCredential[]
  onAnswered: (answer: AnAnsweredCredential) => void
  /** The agents that registered themselves or ask for a card, drawn above the visitors' credentials. */
  asks: ReactNode
}) {
  return (
    <Panel titleIs="label" declares={{ surface: 'embassy.asking' }} title={EMBASSY_WORDS.asking}>
      {asks}
      {credentials.length === 0 ? null : (
        <ul className="emb-list">
          {credentials.map((one) => (
            <AskingCard key={one.id} credential={one} onAnswered={onAnswered} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
/**
 * ONE ASK, WITH CONFIRM AND REFUSE. The person's own card draws their browsers' asks with this same card, so A1 (no
 * Confirm where no key works) is drawn in one place. There `onHisCard` names the browser's row on that card.
 */
export function AskingCard({
  credential,
  onAnswered,
  onHisCard,
}: {
  credential: VisitorCredential
  onAnswered: (answer: AnAnsweredCredential) => void
  /** Drawn on the person's card: where the name leads, and whether an address picked this row. */
  onHisCard?: { opens: string; picked: boolean }
}) {
  const inspect = useInspect()
  const [busy, setBusy] = useState<'confirm' | 'refuse' | null>(null)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [keySays, setKeySays] = useState<string | null>(null)
  const itIsAPersonsDevice = isAPersonsDeviceCredential(credential)
  // A CARD FROM A COPY WITHOUT ITS KEY cannot be let in: the server refuses that confirm. It says why, in the credential
  // page's words, and keeps only Refuse (problem 4fDIo73TuEoK).
  const noKey = noKeyWorksUnder(credential)
  const press = (
    which: 'confirm' | 'refuse',
    run: Promise<{ credential: VisitorCredential; row?: EmbassyRow | null; deviceKey?: { id: string; says: string } | null }>,
  ): void => {
    setFault(null)
    setBusy(which)
    void run
      .then((said) => {
        setBusy(null)
        if (said.deviceKey != null) setKeySays(said.deviceKey.says)
        onAnswered({ credential: said.credential, row: said.row ?? null })
      })
      .catch((err: unknown) => {
        setBusy(null)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  return (
    <li
      className="emb-row emb-asking-card"
      data-standing="asks to come in"
      {...(onHisCard === undefined ? {} : { 'data-browser': credential.id, 'data-picked': onHisCard.picked ? 'yes' : 'no' })}
    >
      <div className="emb-words">
        <span className="emb-top">
          <RouteLink to={onHisCard?.opens ?? visitorPath(credential.id)} className="emb-name">
            {credential.name}
          </RouteLink>
          {inspect ? <span className="emb-kind">{credential.handle}</span> : null}
          <span className="emb-key">{EMBASSY_WORDS.card}</span>
          <span className="emb-value">
            {itIsAPersonsDevice ? <Absence /> : cardWord(credential.role)}
          </span>
        </span>
        <span className="emb-where">
          {inspect ? <>
          <span className="emb-key">{EMBASSY_WORDS.runtime}</span>
          <span className="emb-value">{credential.facts.runtime ?? <Absence />}</span>
          <span className="emb-key">{EMBASSY_WORDS.from}</span>
          <span className="emb-value">{credential.machine ?? <Absence />}</span>
          </> : null}
          <span className="emb-key">{EMBASSY_WORDS.firstCalled}</span>
          <span className="emb-value">{drawnStamp(credential.issuedAt)}</span>
        </span>
        {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
        {!inspect || keySays === null ? null : <span className="emb-claim">{keySays}</span>}
        {noKey ? <p className="emb-asking-says">{t('g4.credential.tokenRemovedStanding')}</p> : null}
        <div className="emb-asking-acts">
          {noKey ? null : <Btn
            variant="primary"
            onClick={() => press('confirm', api.confirmVisitor(credential.id))}
            disabled={busy !== null}
            reason={busy === 'confirm' ? EMBASSY_WORDS.confirming : EMBASSY_WORDS.waitForTheOther}
          >
            {EMBASSY_WORDS.confirm}
          </Btn>}
          <TieredPress tier="confirm" size="sm" disabled={busy !== null}
            press={EMBASSY_WORDS.refuse} pending={EMBASSY_WORDS.refusing}
            question={t('g4.embassy.refuseQuestion')} quote={credential.name}
            warning={t('g4.embassy.refuseWarning')} cancel={t('g4.cancel')}
            onPress={async () => {
              setBusy('refuse')
              try { onAnswered({ credential: (await api.endVisitor(credential.id)).credential, row: null }) }
              finally { setBusy(null) }
            }} />
        </div>
      </div>
    </li>
  )
}
// The stylesheet's comments give their reasons in words. The two-column citizen row is a
// decision's. The person's card draws the asking cards with it too.
export const EMBASSY_CSS = `
.emb-row[data-retired='yes'] { opacity: .7; }
.emb-retired {
  color: var(--text-3); font-size: var(--fs-1); font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
}
.emb-row[data-standing='asks to come in'] {
  border-left: var(--rail) solid var(--accent);
  padding-left: var(--pad);
  background: var(--hover);
  border-radius: var(--radius-sm);
}
.emb-asking-card { padding: var(--pad); }
.emb-asking-card .emb-words { gap: 6px; width: 100%; }
.emb-asking { display: grid; gap: var(--pad); margin-top: var(--pad); min-width: 0; }
.emb-asking-says { margin: 0; max-width: var(--measure-in-box); color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.emb-asking-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.emb-presence { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.emb-presence-word { color: var(--text-3); font-size: var(--fs-1); }
.emb { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.emb-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); }
.emb-show {
  min-height: 30px;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
  cursor: pointer;
}
.emb-show:hover { background: var(--hover); }
.emb-count { font-weight: 400; color: var(--text-3); }
.emb-resident-count { font-weight: 400; letter-spacing: normal; text-transform: none; }
.emb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 0; }
.emb-groups { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; container-type: inline-size; container-name: emb-citizens; }
.emb-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.emb-office { margin-top: var(--gut); }
.emb-group-title {
  margin: 0; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase;
}
.emb-nothing { margin: 0; color: var(--text-3); font-size: var(--fs-2); }
/* A CITIZEN'S ROW: the picture, the words, and the presence and press at its right. On a wide page
   the words take two columns side by side, who and card at the left and where and since beside them,
   so the eye does not travel along one stretched line. */
.emb-group .emb-row {
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; column-gap: var(--pad); row-gap: 4px;
  align-items: start; padding: 8px 0; border-top: var(--border-w) solid var(--border);
}
.emb-group .emb-row:first-child { border-top: 0; }
.emb-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 7.5rem; }
.emb-picture { display: inline-flex; width: 40px; height: 40px; }
.emb-asking-card + .emb-asking-card { margin-top: 8px; }
.emb-world { padding: 8px 0; }
.emb-world + .emb-world { border-top: var(--border-w) solid var(--border); }
@container emb-citizens (min-width: 46rem) {
  .emb-group .emb-words { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); column-gap: var(--gut); }
  .emb-group .emb-words > .emb-claim { grid-column: 1 / -1; }
}
@container emb-citizens (max-width: 30rem) {
  .emb-group .emb-row { grid-template-columns: 40px minmax(0, 1fr); }
  .emb-side { grid-column: 2; align-items: flex-start; min-width: 0; }
}
.emb-row { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.emb-row > .sb-image-opens { flex: 0 0 auto; }
/* THE MARK THAT SAYS THE PICTURE OPENS, IN ITS CORNER. At the report's size it covered most of a 40 px portrait. */
.emb-row .sb-image-hint { right: 1px; bottom: 1px; padding: 0 2px; font-size: 10px; line-height: 1; }
.emb-portrait {
  display: block;
  flex: 0 0 auto;
  width: 40px; height: 40px;
  object-fit: cover;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.emb-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.emb-top, .emb-where { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.emb-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.emb-kind, .emb-key {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.emb-value { font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.emb-unregistered { font-size: var(--fs-1); font-style: italic; color: var(--text-3); }
.emb-none { margin: 0; font-size: var(--fs-2); font-style: italic; color: var(--text-3); }
.emb-standing {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-2);
}
.emb-visitor[data-standing='pending'] .emb-standing { color: var(--danger, var(--text)); }
.emb-visitor[data-standing='ended'] { opacity: .7; }
.emb-value[data-mismatch='yes'] { font-weight: 600; color: var(--danger, var(--text)); }
.emb-claim {
  max-width: var(--measure-in-box);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text-3);
}
.emb-row[data-device='yes'] .emb-kind { color: var(--accent); }
.emb-key-action { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
`
