// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, content } from '@shared/i18n.ts'
import { drawnStamp } from '@shared/time.ts'
/**
 * `#/governance` — EVERYTHING WAITING ON YOU, IN EVERY PROJECT, AND EVERY CHOICE YOU HAVE MADE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS, AND WHAT IT REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * It was `#/decisions`, which drew the forks waiting on a person and the decisions they had made.
 * The forks are one of the three things `GET /api/waiting` reads, so drawing them on a page of
 * their own left the other two — a question an agent asked you, and anything you set aside —
 * with nowhere to be. Answering "four numbers for one idea" by adding a SECOND queue screen would
 * have shipped one more surface for the idea than it started with, so the old page grew into this
 * one and `#/decisions` is kept as a redirect. Nobody's bookmark breaks; see RENAMED_ADDRESSES in
 * components/router.tsx.
 *
 * ---------------------------------------------------------------------------------------
 * IT DRAWS THE ONE NUMBER AND DOES NOT WORK IT OUT
 * ---------------------------------------------------------------------------------------
 *
 * `App.tsx` fetches `GET /api/waiting` once per navigation and hands the same reply to the rail
 * and to this page, so the badge beside "Waiting on you" in the frame and the number at the top of
 * this page are the same number — not two readings that happen to agree. `oneNumber` in
 * lib/waiting.ts is the one function that turns the reply into a number.
 *
 * FOLLOWING THE NUMBER FINDS EVERY ONE OF THEM. That is the point of there being one: every row the
 * reading returned is drawn here, in its tier, and what the reading could not list is counted
 * beside it rather than left out.
 *
 * ---------------------------------------------------------------------------------------
 * IT SPANS EVERY PROJECT, AND THAT IS THE POINT RATHER THAN A CONVENIENCE
 * ---------------------------------------------------------------------------------------
 *
 * A person does not decide per project. `GET /api/waiting` and `GET /api/forks` are both
 * person-level projections that take no parameters — the shape settled as §39 in
 * design/DECISIONS-PENDING.md — so the project switcher does not narrow this page. A row whose
 * record lives somewhere else says so, and opening it carries the reader over: the same act as
 * using the switcher, announced rather than done quietly.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FORK IS DRAWN AS A CARD AND EVERYTHING ELSE AS A ROW
 * ---------------------------------------------------------------------------------------
 *
 * Because a fork can be settled here. `DecisionTiles` mounts the real decide form, which posts to
 * the one route that writes a decision and refuses every agent. The other rows are opened, not
 * acted on, so they are rows.
 *
 * ONE OBJECT IS DRAWN ONCE. A settle-tier row is a card only when the forks reply carries that
 * exact id; anything else in the tier falls to the ordinary row, so a disagreement between the two
 * readings leaves a row plainer rather than losing it or drawing it twice.
 */

import { TheDecisionsNotOnTheirWords } from '../components/TheirOwnWords.tsx'
import { WhichDecisionsGovernAPlace } from '../components/WhichDecisionsGovern.tsx'
import { useState } from 'react'

import { api } from '../api.ts'
import { DecidedCards } from '../components/home/DecidedCards.tsx'
import { DecisionTiles } from '../components/home/DecisionTiles.tsx'
import { DECISION_QUEUE_CSS, WaitingCount } from '../components/DecisionQueue.tsx'
// The rule that only a person may decide, written once in the file that carries the act.
import { storedActorName, whereItWaits, WhyOnlyYou } from '../components/Governance.tsx'
import { TheAskItself } from '../components/TheirCard.tsx'
import {
  isAMessageRow,
  MESSAGES_YOU_HAVE_NOT_READ_CSS,
  MessagesYouHaveNotRead,
  messagesYouHaveNotRead,
} from '../components/MessagesYouHaveNotRead.tsx'
import { readDecisions, readEveryDecided, tallyDecisions, type Decision } from '../components/home/decisions.ts'
import { navigate } from '../components/router.tsx'
import { useInspect } from '../lib/mode.ts'
import {
  DECIDED_ORDERS,
  DECIDED_ORDER_KEY,
  DECIDED_ORDER_WORDS,
  FORK_ORDERS,
  FORK_ORDER_KEY,
  FORK_ORDER_WORDS,
  orderDecided,
  orderForks,
  rememberOrder,
  rememberedDecidedOrder,
  rememberedForkOrder,
  type DecidedOrder,
  type ForkOrder,
} from '../lib/queueorder.ts'
import { rememberedQueueView } from '../lib/queueview.ts'
import { currentWorkspace, setWorkspace } from '../lib/workspace.ts'
import {
  ACT_WORDS,
  excludedWords,
  TIERS,
  inTier,
  notCounted,
  settleCount,
  theRowsWords,
  whereAWaitingRowGoes,
  type WaitingItem,
  type WaitingReply,
  type WaitingTier,
} from '../lib/waiting.ts'
import { declaredAttributes, type Declares } from '../components/declares.ts'
import { DRAWS_THE_NAME } from '../components/agent/pointing.ts'
import { type SurfaceId } from '@shared/surfaces.ts'
import { kindWord } from '@shared/words.ts'
import { Absence, ErrorNote, Explain, Panel, ServerNote, useAsync, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { NARROW_SCREEN, SideBySide } from '../components/SideBySide.tsx'

/**
 * WHAT EACH TIER'S BAND IS CALLED, as a part of Mole Office's own screen.
 *
 * Written out one line each rather than worked out from the tier, because a name a person can point
 * at has to be findable by reading the file: a name assembled at run time is a part nobody can leave
 * a comment on.
 *
 * `decisions.waiting` KEEPS THE KEY IT HAD. It is the same band it always was — the forks only a
 * person may settle — and a key here is a durable name that stored comments point at.
 */
const TIER_PANELS: Readonly<Record<WaitingTier, Declares>> = {
  settle: { surface: 'decisions.waiting' },
  asked: { surface: 'governance.asked' },
  'set-aside': { surface: 'governance.aside' },
}

export function GovernancePage({
  waiting,
  onWaitingChanged,
}: {
  /** The one reading, fetched by App.tsx and shared with the rail. Never fetched again here. */
  waiting: AsyncState<WaitingReply>
  /** Settling a fork takes a row out of this queue, so the frame's badge is read again with it. */
  onWaitingChanged: () => void
}) {
  const [forks, readForksAgain] = useAsync(() => api.forks(), [])
  const inspect = useInspect()
  const here = currentWorkspace()

  /**
   * WHETHER THIS BROWSER DRAWS CARDS OR A LIST, criterion P54.
   *
   * Read once, when the page is first drawn, so nothing flashes into the other shape after the
   * first paint — the same rule the two orders below follow. The choice is made in Settings and
   * kept in `lib/queueview.ts`; this page holds only which one is in force now.
   *
   * IT IS NOT STATE THIS PAGE CAN CHANGE. There is no control here, on purpose: the
   * choice lives in Settings, and a second control on this page would be the same setting in two
   * places, which is this repository's named recurring defect.
   */
  const [view] = useState(rememberedQueueView)

  /**
   * WHICH ORDER THIS BROWSER IS READING EACH LIST IN, and anything that went wrong remembering it.
   *
   * Read once, when the page is first drawn, so nothing flashes into a different order after the
   * first paint. `lib/queueorder.ts` holds every order and the two keys they are kept under; this
   * page holds only which one is chosen now.
   */
  const [forkOrder, setForkOrder] = useState<{ order: ForkOrder; fault: string | null }>(rememberedForkOrder)
  const [decidedOrder, setDecidedOrder] = useState<{ order: DecidedOrder; fault: string | null }>(
    rememberedDecidedOrder,
  )
  const chooseForkOrder = (order: ForkOrder) => setForkOrder({ order, fault: rememberOrder(FORK_ORDER_KEY, order) })
  const chooseDecidedOrder = (order: DecidedOrder) =>
    setDecidedOrder({ order, fault: rememberOrder(DECIDED_ORDER_KEY, order) })

  /**
   * One clock for the whole page, taken as the records are read.
   *
   * Both bands measure their ages from it, so a decision cannot be "1d" in one band and "2d" in the
   * other while the page sits open overnight.
   */
  const now = Date.now()

  /** The same crossing Home makes, and it is announced on any row that needs it. */
  /**
   * OPEN A ROW, WHEREVER IT LIVES. Problem qpq63k1PiBNb.
   *
   * NOT EVERY ROW ON THIS LIST IS A RECORD. A planning intent lives in its own table, a visiting
   * agent is a credential and a message is a message; all three used to be opened as `#/r/<id>`,
   * which is a 404. `whereAWaitingRowGoes` is the one reader of where a row goes, so this page and
   * Home cannot send one press to two places.
   */
  const open = (row: Pick<WaitingItem, 'id' | 'kind' | 'workspaceId'>) => {
    if (row.workspaceId !== here) setWorkspace(row.workspaceId)
    navigate(whereAWaitingRowGoes(row))
  }
  const openRow = (row: Decision) => open({ id: row.recordId, kind: 'proposal', workspaceId: row.workspaceId })

  /** Both readings are read again once a fork is settled: it leaves this queue and the badge moves. */
  const settled = () => {
    readForksAgain()
    onWaitingChanged()
  }

  const reading = waiting.status === 'ready' ? waiting.value : null
  /**
   * THE WHOLE QUEUE, IN THE ORDER THE SERVER SENT IT — which is the most consequential first.
   *
   * Home draws the first four of these and this page draws every one, and both draw the same card,
   * collapsed, so a person can scan the queue by priority and open only what they mean to answer.
   * That is the difference section 8 asks for: the Waiting on you page may be richer, but it should
   * still let a person collapse single items and scan by priority.
   *
   * `leftTheQueue` goes in because a card says how many other questions it now stands for, and this
   * reply is the only place that fact exists.
   *
   * AND THEN IN THE ORDER THIS PERSON ASKED FOR, which by default is that one and nothing else. The
   * page never has a second opinion about the ranking: `orderForks` hands the list straight back
   * unless somebody chose one of the other three, and the control above the list says which they are
   * looking at. See `lib/queueorder.ts`.
   */
  const decidable = orderForks(
    forks.status === 'ready' ? readDecisions(forks.value.forks, now, forks.value.leftTheQueue) : [],
    forkOrder.order,
  )
  const decided = orderDecided(
    forks.status === 'ready' ? readEveryDecided(forks.value.decisions, now) : [],
    decidedOrder.order,
  )

  return (
    <div className="gq">
      {/* The same stylesheet Home mounts, under the same href, so React draws it once and the cards
          on the two surfaces cannot drift apart in their spacing. */}
      <style href="mole-office-decision-queue" precedence="default">
        {DECISION_QUEUE_CSS}
      </style>
      <style href="mole-office-governance-page" precedence="default">
        {GOVERNANCE_PAGE_CSS}
      </style>
      <style href="mole-office-messages-you-have-not-read" precedence="default">
        {MESSAGES_YOU_HAVE_NOT_READ_CSS}
      </style>

      <header className="gq-head">
        <h1 className="gq-title">{t('nav.decisions')}</h1>
        {/* THE SCOPE CLAIM SITS BESIDE THE THING IT GOVERNS. Every other page in this frame is about
            the project in the switcher and this one is not, and a reader has no other way to know. */}
        <span className="gq-scope">{t('decisions.scope')}</span>
        {/* THE ONE NUMBER, from the same component the band on Home draws. */}
        <WaitingCount waiting={waiting} />
      </header>

      {waiting.status === 'loading' ? <p role="status">{t('decisions.loading')}</p> : null}
      {waiting.status === 'error' ? (
        <ErrorNote message={waiting.message} fault={waiting.fault} />
      ) : null}

      {/* THE DECISIONS AND THE MESSAGES YOU HAVE NOT READ, SIDE BY SIDE WHERE THE PAGE IS WIDE.
          By a decision, the width is used side by side, so the eye does not travel along one stretched
          line. Where the page is narrow the three parts stand one above the
          other, in this order: what waits on you, the messages, what you decided. GOVERNANCE_PAGE_CSS
          says where. */}
      <SideBySide className="gq-sides">
      <div className="gq-main" data-column="start">
      <div className="gq-waiting">
      {reading === null ? null : (
        <>
          {TIERS.map(({ tier, heading }) => {
            /* A MESSAGE ROW IS DRAWN IN THE LIST BESIDE THIS ONE, not in its tier's band, so each
               row is drawn once. The count on the page's head still counts it. */
            const rows = inTier(reading, tier).filter((row) => !isAMessageRow(row))
            if (rows.length === 0) return null
            /* THE FORKS IN THIS TIER, MATCHED BY ID. A card is drawn only for a row the forks reply
               also carries, so nothing is drawn twice and nothing is dropped.

               AND ONLY WHEN THIS BROWSER IS DRAWING CARDS, criterion P54. In a list every row is a
               row, forks included, and a fork is then settled on its own page — the same form, one
               press further away. Nothing is lost and nothing is drawn twice either way. */
            const asCards = view.view === 'list' ? [] : decidable.filter((fork) => rows.some((row) => row.id === fork.recordId))
            const asRows = rows.filter((row) => !asCards.some((fork) => fork.recordId === row.id))
            return (
              <Panel titleIs="label"
                declares={TIER_PANELS[tier]}
                key={tier}
                title={heading}
                /* --ask MEANS WAITING ON A PERSON and rank 0 is what draws a tone at all. Set aside
                   is still waiting and is still counted, so it keeps the hue: pushing something away
                   is the owner's own act and does not make it somebody else's. */
                rank={0}
                tone="ask"
                /* THE COUNT IS THE ONE THE RAIL SUMMARISES. On the settle tier it is
                   `settleCount`, which the rail's `railCount` is built on, so the two cannot drift
                   apart (problem 8woJrf898igd). The rail adds the agents asking at the door, which
                   wait in the asked tier. The other tiers have no badge of
                   their own and count their own rows as they always did. The count carries its measure word in
                   Chinese, 1 项, as the decided panel's 1 条决定 does (wave 13q's round 34). */
                actions={
                  <span className="dq-count">{t('decisions.headCount', { n: tier === 'settle' ? settleCount(reading) : rows.length })}</span>
                }
              >
                {/* THE ORDER CONTROL BELONGS TO THE ONE BAND THAT HOLDS THE FORKS. The other two
                    tiers are rows the server hands over in its own order, and offering to sort
                    something these choices do not touch would be a control that does nothing.

                    IT IS DRAWN WHATEVER THE COUNT, criterion P54. It used to appear only once two
                    or more forks were waiting, so settling the second-to-last one took the control
                    off the page — which reads as a setting that moved on its own, and is half of
                    what the owner met on 6 September. A control over a list of one orders a list of one:
                    it says which order the list is in, which is a true thing to say about any
                    length, and it is still there when the next fork arrives. */}
                {tier === 'settle' ? (
                  <ChooseTheOrder
                    declares={{ surface: 'governance.order' }}
                    named="governance.order"
                    orders={FORK_ORDERS}
                    words={FORK_ORDER_WORDS}
                    chosen={forkOrder.order}
                    fault={forkOrder.fault}
                    onChoose={chooseForkOrder}
                  />
                ) : null}
                {asCards.length === 0 ? null : (
                  <DecisionTiles
                    rows={asCards}
                    tally={tallyDecisions(asCards)}
                    here={here}
                    onOpen={openRow}
                    onSettled={settled}
                    inspect={inspect}
                  />
                )}
                {asRows.length === 0 ? null : view.view === 'cards' ? (
                  /* THE SAME FACTS, IN THE SAME ENCLOSURE THE FORKS ARE IN. Criterion P54: when a
                     person has asked for cards, everything waiting is a card, whether or not it
                     happens to be a fork. It is `dq-grid` and `dq-tile`, the classes the fork cards
                     already use, so the two kinds of card cannot drift apart in their spacing. */
                  <ul className="dq-grid">
                    {asRows.map((row) => (
                      <WaitingCard key={row.id} row={row} here={here} inspect={inspect} onOpen={open} />
                    ))}
                  </ul>
                ) : (
                  <ul className="gq-rows">
                    {asRows.map((row) => (
                      <WaitingRow key={row.id} row={row} here={here} inspect={inspect} onOpen={open} />
                    ))}
                  </ul>
                )}
              </Panel>
            )
          })}

          {/* WHAT THIS READING KNOWS ABOUT AND COULD NOT LIST. Never folded into the number and
              never left out: a list short by one is indistinguishable from a complete one unless it
              says so, and each bucket carries the server's own sentence for why. */}
          {notCounted(reading) === 0 ? null : (
            <Explain
              declares={{ surface: 'governance.excluded' }}
              meaning={<span className="num">{t('decisions.notCounted', { n: notCounted(reading) })}</span>}
              opens={t('decisions.excludedWhy')}
              holds={{ count: reading.excluded.length, what: t('decisions.reasons', { n: reading.excluded.length }) }}
            >
              <ul className="gq-left">
                {reading.excluded.map((group: WaitingReply['excluded'][number]) => (
                  <li key={group.reason}>
                    <b className="num">{group.count}</b> {excludedWords(group.reason)}<ServerNote text={group.sentence} />
                    {/* A WITHDRAWN REQUEST IS NAMED, with who withdrew it and when (decision tFl1YWLH3eCl). One press
                        opens it, in its own project. */}
                    {group.withdrawn === undefined ? null : (
                      <ul className="gq-withdrawn">
                        {group.withdrawn.map((one) => (
                          <li key={one.id}>
                            <button type="button" className="gq-withdrawn-open" onClick={() => open({ id: one.id, kind: 'role request', workspaceId: one.workspaceId })}>
                              {theRowsWords(one)}
                            </button>{' '}
                            {t(one.as === 'the-asker' ? 'w13w.withdrawn.byTheAsker' : 'w13w.withdrawn.byItsStarter', { by: one.by, at: drawnStamp(one.at) })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Explain>
          )}
        </>
      )}
      </div>

      <div className="gq-decided">
      <Panel titleIs="label"
        declares={{ surface: 'decisions.decided' }}
        title={t('decisions.decided')}
        rank={1}
        actions={
          <span className="dq-count">
            {t('decisions.decisionCount', { n: decided.length })}
          </span>
        }
      >
        {forks.status === 'error' ? <ErrorNote message={forks.message} fault={forks.fault} retry={readForksAgain} /> : null}
        {forks.status === 'ready' && decided.length === 0 ? (
          <Absence word={t('absence.none')} title={t('decisions.noDecisions')} />
        ) : null}
        {/* TWO CHOICES HERE AND FOUR ABOVE, and `lib/queueorder.ts` says why: a decision carries no
            pin, so there is no importance to rank by, and with nothing pinned and nothing held up
            the combined ranking of this list is its time order. */}
        {decided.length > 1 ? (
          <ChooseTheOrder
            declares={{ surface: 'governance.decidedorder' }}
            named="governance.decidedorder"
            orders={DECIDED_ORDERS}
            words={DECIDED_ORDER_WORDS}
            chosen={decidedOrder.order}
            fault={decidedOrder.fault}
            onChoose={chooseDecidedOrder}
          />
        ) : null}
        {decided.length === 0 ? null : <DecidedCards rows={decided} here={here} onOpen={(workspaceId, recordId) => open({ id: recordId, kind: 'decision', workspaceId })} />}
      </Panel>
      {/* Once on this page, and not once per open card. The form drops it when it is mounted
          inside a band that carries it. It sits under "What you decided", which it explains, and above the band of
          decisions not on your own words, so it does not read as that band's help. */}
      <WhyOnlyYou />
      {/* THE DECISIONS IN THE PERSON'S NAME THAT ARE NOT BASED ON THE PERSON'S OWN WORDS, each with why. By the owner's
          decision, nothing old is changed, and each one is marked. The server marks them on the
          decided rows; Home's card does not draw the mark, so this list is the Decisions page's alone. */}
      {forks.status !== 'ready' ? null : (
        <TheDecisionsNotOnTheirWords
          rows={forks.value.decisions.flatMap((one) =>
            one.notOnThePersonsOwnWords === undefined || one.notOnThePersonsOwnWords === null
              ? []
              : [{ recordId: one.recordId, title: one.title, mark: one.notOnThePersonsOwnWords }],
          )}
        />
      )}
      {/* WHICH DECISIONS GOVERN A PLACE, under the decisions themselves: a reader asks it about a file or a module. */}
      <WhichDecisionsGovernAPlace />
      </div>
      </div>

      <div className="gq-side" data-column="end">
        {reading === null ? null : <MessagesYouHaveNotRead rows={messagesYouHaveNotRead(reading)} inspect={inspect} />}
      </div>
      </SideBySide>
    </div>
  )
}

/**
 * WHICH ORDER A LIST IS READ IN, chosen by the person and remembered by this browser.
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES EACH ORDER AND EXPLAINS NONE OF THEM
 * ---------------------------------------------------------------------------------------
 *
 * It was written with a paragraph under it saying what the chosen order does, and that paragraph is
 * gone. `docs/UX-CONTRACT.md`: *"Do not solve confusing UX by adding more instructions. A fix
 * that amounts to 'add a sentence explaining it' is a failed fix."* The queue already answers what
 * that paragraph was for, per row rather than in general: every fork carries `priority.because`,
 * naming the fact that put THAT fork where it is.
 *
 * A DROP-DOWN AND NOT A ROW OF BUTTONS. Four names of three and four words each do not fit across a
 * phone, and a row of them wraps into something a reader has to parse before they can use it. The
 * whole control is one line at every width.
 *
 * THE NAMES ARE NOT WRITTEN HERE. They come from `FORK_ORDER_WORDS` and `DECIDED_ORDER_WORDS`,
 * beside the sorting itself, so an order that changes cannot go on being called the old thing.
 */
function ChooseTheOrder<T extends string>({
  declares,
  named,
  orders,
  words,
  chosen,
  fault,
  onChoose,
}: {
  declares: Declares
  /** The name of this part of the screen, which is also what the label is read from. */
  named: SurfaceId
  orders: readonly T[]
  words: Readonly<Record<T, string>>
  chosen: T
  /** Why this browser will not remember the choice, or null because it will. */
  fault: string | null
  onChoose: (order: T) => void
}) {
  /* THE LABEL IS TIED TO THE GROUP BY AN ID BUILT FROM THE SURFACE NAME, never from the words: a
     surface name can hold no space, and an id with a space in it is read as two ids and the control
     ends up with no name at all. That is the lesson PresetBar's Segmented already carries. */
  const inspect = useInspect()
  const labelId = `governance-order-${named}`
  return (
    <div className="gq-order" {...declaredAttributes(declares)}>
      <div className="gq-order-line">
        <span className="gq-order-label" id={labelId} {...DRAWS_THE_NAME}>
          {t(named === 'governance.order' ? 'decisions.orderWaiting' : 'decisions.orderDecided')}
        </span>
        {/* PRESSES AND NOT A DROP-DOWN, since criterion P54 made this control permanent.
            `tests/read-before-edit.test.ts` holds the rule that a page you are READING draws no box
            and no dropdown, and its own words say why a press is different: a press records one
            fact and says what it recorded, where a box holds a half-finished change a stray
            keystroke can reach. Choosing an order is a press in that sense — it applies at once and
            holds nothing — so the shape now says so.

            IT WAS A DROP-DOWN BECAUSE IT WAS CONDITIONAL. The note that stood here said four names
            of three or four words do not fit across a phone, and that is true of four names on ONE
            line; they wrap onto two, which is what `flex-wrap` below does and what the pictures at
            390 show. */}
        <div className="gq-order-picks" role="group" aria-labelledby={labelId}>
          {orders.map((order) => (
            <button
              key={order}
              type="button"
              className="gq-order-pick"
              data-chosen={order === chosen ? 'yes' : 'no'}
              aria-pressed={order === chosen}
              onClick={() => onChoose(order)}
            >
              {words[order]}
            </button>
          ))}
        </div>
      </div>
      {/* A BROWSER THAT WILL NOT REMEMBER SAYS SO, in the words lib/store.ts gives every setting.
          The order still applies now; what is lost is that it is still here after a reload, and
          that is a different thing from the control failing. */}
      {fault === null ? null : <p className="gq-order-fault">{t('decisions.orderFault')}{inspect ? <span>{fault}</span> : null}</p>}
    </div>
  )
}

/**
 * ONE THING WAITING ON THE PERSON, AS A ROW.
 *
 * WHAT A NORMAL READER GETS: the title, the verb, how long it has waited, how much it is holding
 * up, and the project when it is not this one. No id, no rule name, no sentence — that is §8.9 of
 * the governance design, and the sentence the server built is one press away for a developer.
 *
 * THE SENTENCE IS NEVER REBUILT HERE. `why` arrives on the row, made from the same facts the row
 * carries in `because`, so the queue and the reading cannot come to say different things about why
 * something is on the list.
 *
 * EXPORTED FOR ONE TEST, NOT FOR A CALLER: tests/planning-intent-time-is-named.test.ts renders
 * rows, because the page itself cannot be drawn without its forks fetch. Nothing else imports
 * these; a second caller would be a second drawing of the queue.
 */
export function WaitingRow({
  row,
  here,
  inspect,
  onOpen,
}: {
  row: WaitingItem
  here: string
  inspect: boolean
  onOpen: (row: Pick<WaitingItem, 'id' | 'kind' | 'workspaceId'>) => void
}) {
  return (
    <li className="gq-row">
      <button
        type="button"
        className="gq-row-title"
        onClick={() => onOpen(row)}
        title={inspect ? row.why : undefined}
      >
        {theRowsWords(row)}
      </button>
      <PlanningEstimate row={row} />
      <div className="gq-cues">
        <span className="gq-act">{ACT_WORDS[row.act]}</span>
        {waitingKind(row.kind, inspect)}
        {row.blocking > 0 ? (
          <span className="dq-blocking">
            {t('decisions.holdingUp', { n: row.blocking })}
          </span>
        ) : null}
        {/* SOMETHING ON THIS RECORD WAS DONE ON YOUR OWN WORDS, and the row says so wherever it
            says who did anything. Four words from @shared/warrant.ts, the same four the forks desk
            draws, with the person's sentence on the element; the words themselves are on the record's own
            page beside the press that takes the act back. */}
        {row.onThePersonsWords === null ? null : (
          <span
            className="dq-mark"
            data-mark="the-persons-words"
            title={content(row.onThePersonsWords.warrant.words)}
          >
            {t('decisions.onYourWords')}
          </span>
        )}
        {/* WHO PASSED THIS QUESTION ON TO THE PERSON, criterion P55. An agent with a starter cannot put
            anything on this list itself: the starter hands it over, and the row says who did.
            Null on a row nobody had to pass on, which is what a question from an agent with no
            recorded starter is. */}
        <PassedOn row={row} inspect={inspect} />
        {(
          <span className="dq-where">{whereItWaits(row, inspect)}</span>
        )}
      </div>
      {/* WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED, on the row itself: a
          person deciding whether to give a key reads it before they open anything. Finding 83,
          mend b2. Absent on every row that is not a key ask. */}
      {row.theAsk === undefined ? null : <TheAskItself shows={row.theAsk} />}
      {inspect ? (
        <p className="gq-raw">
          <code>{row.id}</code> · <code>{row.because.rule}</code> · {row.why}
        </p>
      ) : null}
    </li>
  )
}

/**
 * THE ESTIMATE, AS THE PERSON'S OWN WORDS UNDER THE WORK'S TITLE. Problem 1LfS2wzuJerO.
 *
 * On 16 September 2026 three cards at the bottom of `Yours to settle` read "around 1.5 maybe more"
 * and nothing else. They are PLANNING INTENTS — words somebody wrote about time on a record, kept
 * because only a person may turn them into hours on the calendar — and the row used the person's
 * own words as its TITLE, so the estimate stood on the screen with no name and no label, three
 * cards over.
 *
 * WHAT THE BLOCKS CARRY, A PERSON CAN USE: the work the time is for, which is now the row's title
 * (the server reads it off the record the time is about), and the words as written — the eighth
 * rule keeps them unparsed, and they are drawn as what they are. The label "Time you asked for"
 * was drawn over them and read strangely, so it is gone:
 * the words stand alone in quotation marks under the work's title, which is where they belong. A
 * row with no words behind it draws nothing, which is every row but this one.
 */
export function PlanningEstimate({ row }: { row: WaitingItem }) {
  if (row.said === null) return null
  return (
    <p className="gq-said" data-testid="planning-estimate">
      “{content(row.said)}”
    </p>
  )
}

/**
 * WHO HANDED THIS QUESTION TO THE PERSON, drawn wherever a row or a card says who did anything.
 *
 * Criterion P55. A question an agent with a starter asks is with that starter until somebody passes
 * it on, so a row on this page either came up through the chain — and this names the last one to
 * hand it over — or came from an agent nobody recorded a starter for, and there is nothing to say.
 *
 * THE WORDS ARE NOT WRITTEN HERE. `passedItOnToYou` in @shared/confirming.ts builds them, so the
 * queue, the record page and this row cannot come to phrase one fact three ways.
 */
function PassedOn({ row, inspect }: { row: WaitingItem; inspect: boolean }) {
  const [names] = useProjectAsync(async () => row.passedOnBy === null ? null : api.participants(), [row.passedOnBy])
  if (row.passedOnBy === null) return null
  const { who, at } = row.passedOnBy
  const name = storedActorName(who.id, names.status === 'ready' ? names.value ?? undefined : undefined, who.kind)
  const date = at.split(' ')[0]!
  return (
    <span className="dq-mark" data-mark="passed-on">
      {/* NOBODY SINGLE ANSWERS TO THE STORED ID: said in words, never as a dash (wave 13n round 33). */}
      {name ? t('decisions.passedOnBy', { name: content(name), date }) : t('decisions.passedOnByUnknown', { date })}
      {inspect ? <code>{who.id}</code> : null}
    </span>
  )
}

/**
 * ONE THING WAITING ON THE PERSON, AS A CARD. Criterion P54.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY IT IS NOT A SECOND DECISION CARD
 * ---------------------------------------------------------------------------------------
 *
 * A fork's card carries the form that settles it, because a fork can be settled here. Nothing else
 * on this page can be acted on in place: a question an agent asked is answered on the record, and
 * something set aside is picked up there. So this card carries the same facts as the row and no
 * form, and pressing it opens the record — which is the only act there is.
 *
 * IT IS THE FORK CARD'S OWN ENCLOSURE, `dq-tile` inside `dq-grid`, and not a shape of its own.
 * Two card styles on one page would be two answers to "what is a card here", and the spacing of
 * the two would drift the first time somebody changed one.
 *
 * EXPORTED FOR ONE TEST (see `WaitingRow` above), and for no caller at all.
 */
export function WaitingCard({
  row,
  here,
  inspect,
  onOpen,
}: {
  row: WaitingItem
  here: string
  inspect: boolean
  onOpen: (row: Pick<WaitingItem, 'id' | 'kind' | 'workspaceId'>) => void
}) {
  return (
    <li className="dq-tile">
      <button
        type="button"
        className="dq-title"
        onClick={() => onOpen(row)}
        title={inspect ? row.why : undefined}
      >
        {theRowsWords(row)}
      </button>
      <PlanningEstimate row={row} />
      <div className="dq-cues">
        <span className="gq-act">{ACT_WORDS[row.act]}</span>
        {waitingKind(row.kind, inspect)}
        {row.blocking > 0 ? (
          <span className="dq-blocking">
            {t('decisions.holdingUp', { n: row.blocking })}
          </span>
        ) : null}
        {row.onThePersonsWords === null ? null : (
          <span
            className="dq-mark"
            data-mark="the-persons-words"
            title={content(row.onThePersonsWords.warrant.words)}
          >
            {t('decisions.onYourWords')}
          </span>
        )}
        <PassedOn row={row} inspect={inspect} />
        {(
          <span className="dq-where">{whereItWaits(row, inspect)}</span>
        )}
      </div>
      {/* WHY IT IS HERE, IN THE SERVER'S OWN SENTENCE. A card has the room a row does not, and this
          is the sentence the row hides in its tooltip. It is `why` off the wire and is never
          rebuilt here, so the queue and the card cannot come to say different things. */}
      <ServerNote text={row.why} />
      {row.theAsk === undefined ? null : <TheAskItself shows={row.theAsk} />}
      {inspect ? (
        <p className="gq-raw">
          <code>{row.id}</code> · <code>{row.because.rule}</code>
        </p>
      ) : null}
    </li>
  )
}

/**
 * The page's own frame, and nothing about a card: those live in DECISION_QUEUE_CSS, once.
 *
 * NO BACKTICK ANYWHERE IN THIS STRING — it is a template literal, and one closes it.
 */
export const GOVERNANCE_PAGE_CSS = `
.gq { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
/* SIDE BY SIDE ON A WIDE SCREEN: the decisions on the left, and the
   messages in a column of their own on the right, beside both of the decision parts. Where the
   switch is, and the two columns, are the product's one width rule, components/SideBySide.tsx.
   Until wave 13k's round 18 this page asked its own width at 56rem instead. */
.gq-sides { --sbs-columns: minmax(0, 1fr) minmax(16rem, 22rem); gap: var(--gut); }
.gq-main, .gq-waiting, .gq-side, .gq-decided { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.gq-waiting:empty { display: none; }
/* ONE ABOVE THE OTHER ON A NARROWER SCREEN, in this order: what waits on you, the messages you have
   not read, what you decided. The messages are written after both decision parts, so here the
   decisions' column gives its two parts to the page's one column and the messages stand between. */
@media ${NARROW_SCREEN} {
  .gq-main { display: contents; }
  .gq-side { order: 1; }
  .gq-decided { order: 2; }
}
.gq-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }
/* --fs-6, which is what every other page name in the product is set at. */
.gq-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); }
.gq-scope {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.gq-what { color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.gq-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.gq-row {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  padding-inline-start: var(--pad);
  border-inline-start: 3px solid var(--ask-line);
}
.gq-row-title {
  align-self: start; max-width: 100%;
  margin: 0; padding: 0; border: 0; background: none; text-align: start;
  color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.gq-row-title:hover { text-decoration: underline; }
.gq-cues { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.gq-act { color: var(--ask-line); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
/* WHAT WAS ASKED FOR, BY TIME, ON THE ONE ROW THAT IS A PLANNING INTENT. This is the line under
   the work's title, where the estimate stands as what it is. The label that used to sit over it is
   gone, so there is one rule and not two. */
.gq-said {
  margin: 0; max-width: var(--measure-in-box);
  color: var(--text-2); font: var(--fs-2)/var(--lh-tight) var(--font-ui);
  overflow-wrap: break-word;
}
.gq-kind, .gq-raw { color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
/* WHY A CARD IS ON THIS PAGE, in the server's own sentence. Drawn on a card and not on a row: a
   row locates and a card has the room to explain, which is the rule the drawing chapter gives. */
.gq-left { margin: 0; padding-inline-start: 1.2em; color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.gq-withdrawn { margin: .3em 0 0; padding-inline-start: 1.2em; }
.gq-withdrawn-open { all: unset; cursor: pointer; color: var(--accent); text-decoration: underline; text-underline-offset: .16em; overflow-wrap: anywhere; }
.gq-withdrawn-open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* WHICH ORDER A LIST IS READ IN. It sits above the list it orders, at every width: the label and
   the chooser on one line, the rule under them, and it wraps rather than overflowing at 390. */
.gq-order { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-block-end: var(--pad); }
.gq-order-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.gq-order-label { color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.gq-order-picks { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.gq-order-pick {
  max-width: 100%;
  min-height: 28px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.gq-order-pick:hover { background: var(--hover); }
/* THE ONE IN FORCE, MARKED BY ITS EDGE AND BY aria-pressed, so the mark is not colour alone. */
.gq-order-pick[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.gq-order-pick:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
/* THE BROWSER WILL NOT REMEMBER IT, said beside the control it is about rather than in a console
   nobody reads. The same treatment the preset bar gives the same fault. */
.gq-order-fault {
  margin: 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
`

/**
 * THE KIND CUE ON A WAITING ROW, or nothing where the page has no word for the kind. A cue that only says
 * the word is missing tells the reader nothing (wave 13n round 33); developer mode draws the stored kind.
 */
function waitingKind(kind: string, inspect: boolean): React.ReactNode {
  const word = inspect ? kind
    : kind === 'planning intent' ? t('decisions.planningIntent')
    : kind === 'visiting agent' ? t('decisions.visitingAgent')
    : kind === 'visiting device' ? t('decisions.visitingDevice')
    : kindWord(kind).standing === 'known' ? kindWord(kind).text : null
  return word === null ? null : <span className="gq-kind">{word}</span>
}
