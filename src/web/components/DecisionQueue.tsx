// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { Counted } from './home/Counted.tsx'
import { t, content } from '@shared/i18n.ts'
/**
 * BAND 1 — THE DECISIONS WAITING ON A PERSON, and the ones you have already made.
 *
 * Its own file, and not a section of Governance.tsx, because it is a different job: that file is
 * about SETTLING one fork on the fork's own page, and this is about seeing that four of them exist
 * without opening any.
 *
 * WHAT IT IS FOR. Promoting a proposal into a decision is the one act Mole Office refuses to every
 * agent, and for most of this product's life it was also the one act the product offered no way to
 * do: the owner settled two forks in writing, then had to know two opaque nanoids, search for them,
 * tell apart the records that MENTION an id from the record whose id it is, and copy a `curl` line
 * out of an agent's message. This band is why that is no longer true.
 *
 * WHAT IT IS NOT. Nothing here is ranked against work or called urgent — `design/DECISIONS-PENDING`
 * §18 asks whether an unresolved proposal should enter the attention rule, and that is the owner's
 * question. What it does say is how much work each fork is holding up, which is counted rather
 * than judged.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS ONE VIEW NOW, AND THE OWNER IS WHY
 * ---------------------------------------------------------------------------------------
 *
 * This band used to be drawn three ways at once, to compare them: all of the
 * decisions at once, one at a time, or settled where they are listed. Opening a decision is the
 * start of dealing with it: it shows the choices, and the decision is made there.
 * So `DecisionTiles` is what Home draws, and the other two components and the switch between them
 * are deleted.
 *
 * The fetch, the clock, the sort, the counts, the waiting phrase, the option chip and the crossing
 * of the project boundary all stay HERE or in `home/decisions.ts` rather than moving into the view.
 * That was the rule while there were three views and it outlives them for a plainer reason: the
 * decisions page draws the same records, and two surfaces working out one count is how the two
 * come to disagree.
 */

import { navigate, pathFor, RouteLink } from './router.tsx'
// THE ONE NUMBER AND THE WORDS FOR THE TIERS' THREE PARTS. Nothing in this file works out how many things
// are waiting on the person: App.tsx fetches GET /api/waiting once, the rail's badge draws it with
// `oneNumber`, and so does the count below.
import { TIERS, notCounted, oneNumber, partsOf, type WaitingReply } from '../lib/waiting.ts'
// THE MESSAGES THE PERSON HAS NOT READ, which the Decisions page draws in a list of their own. The count line gives them
// a part of their own from the same rows, so its parts and the page's places say one number each.
import { messagesYouHaveNotRead } from './MessagesYouHaveNotRead.tsx'
import { useInspect } from '../lib/mode.ts'
import { currentWorkspace, setWorkspace } from '../lib/workspace.ts'
import { readForksOnce, useSharedRead } from '../lib/homereads.ts'
import { Absence, ErrorNote, NumberInItsWord, Panel, type AsyncState } from './ui.tsx'
// The rule that only a person may decide is written once, in the file that carries the act. It used
// to be typed here and twice more inside the form, in three slightly different wordings.
import {
  HOME_SHOWN,
  readDecided,
  readDecisions,
  tallyDecisions,
  type Decision,
  type DecidedRead,
  type DecisionTally,
} from './home/decisions.ts'
import { DecidedCards } from './home/DecidedCards.tsx'
import { DecisionTiles } from './home/DecisionTiles.tsx'
// THE ASKS AT THE DOOR, drawn at the top of this band. Problem NXEhOBumu5ZZ.
import { AsksAtTheDoor, asksAtTheDoor } from './AsksAtTheDoor.tsx'

export function DecisionQueue({
  waiting,
  onWaitingChanged,
}: {
  /** The one reading of what is waiting on the person, fetched once by App.tsx. */
  waiting: AsyncState<WaitingReply>
  /** Settling a fork here takes a row out of that reading, so the frame reads it again. */
  onWaitingChanged: () => void
}) {
  /**
   * ONE FETCH FOR BOTH HALVES OF THE BAND — `GET /api/forks`, which carries each fork whole and
   * every decision a person has made beside them.
   *
   * The waiting cards need the fork's own stored fields, because the decide form is mounted in
   * them. The decided cards need the decisions, which are not forks at all: most of the decisions
   * in this corpus answer no proposal. Both come out of `readForks()` on the server, so the two
   * halves of one band cannot disagree about what is settled.
   */
  const [state, readAgain] = useSharedRead(readForksOnce, [])
  const inspect = useInspect()

  if (state.status === 'loading') return null
  if (state.status === 'error') {
    // rank 0 AND a tone, together. `Panel` throws for a tone with no rank — a tone is only drawn at
    // rank 0, and four panels in this product asked for one and were silently given nothing. This
    // branch means it: Mole Office could not read what is waiting on you, which is a fault and not an ask.
    return (
      <Panel titleIs="label" declares={{ surface: 'home.decisions' }} title={t('home.decisions')} rank={0} tone="failed">
        <ErrorNote message={inspect ? state.message : t('home.decisionsFailed')} fault={inspect ? state.fault : undefined} retry={readAgain} />
      </Panel>
    )
  }
  /**
   * One clock, taken as these rows are read.
   *
   * Every "waiting 2 days" on the band is measured from it, so no two tiles can disagree about
   * today and the ages cannot creep apart while the page sits open — and the settled window below
   * is measured from the same instant, so a fork cannot be inside it for one line and outside it
   * for another.
   */
  const now = Date.now()
  const decided = readDecided(state.value.decisions, now)

  /**
   * THE FORKS THAT ARE WAITING ON THEM, AND NOT EVERY OPEN FORK.
   *
   * The band is titled "Waiting on you" and its number is `GET /api/waiting`. Not every open fork is
   * on that list: a fork the corpus says an agent, the parent agent or a measurement settles is
   * still open, still on the fork desk and not waiting on them. Drawing those under this title, and
   * then saying "the 4 forks, out of 3 waiting on you", is two scopes in one sentence.
   *
   * SO THE READING DECIDES, NOT THIS FILE. The rows are the ones `GET /api/waiting` lists. Nothing
   * here works out whose a fork is — that question has one reader on the server, and a browser
   * answering it a second way is how this band came to make a claim no other surface agreed with.
   * `#/governance` is where every open fork is, whoever settles it, and the line under the cards
   * links to it.
   *
   * WHILE THE READING HAS NOT ARRIVED, EVERY OPEN FORK IS DRAWN and the line under the cards says
   * nothing, which is what it already did. That is the honest shape: the band cannot say which forks
   * are theirs before it has been told, and it does not guess.
   */
  const rows = forksWaitingOnThem(readDecisions(state.value.forks, now, state.value.leftTheQueue), waiting)

  /**
   * HOME SUMMARISES THE QUEUE. IT IS NOT THE QUEUE.
   *
   * Their brief, section 8: *"The Home section should summarize the owner queue, not become the
   * queue's detail page."* Measured at 1440 on 27 August 2026, this panel was 2,318 px of a 5,872 px
   * page and held the same 26 cards, in the same order, as the page at `#/governance`.
   *
   * The first `HOME_SHOWN` and not a chosen few: `readForks()` already put the most consequential
   * first, and nothing in the browser re-orders them. The line under the cards says exactly how many
   * of how many these are, and the queue is one press from it.
   */
  const shown = rows.slice(0, HOME_SHOWN)

  // THE BAND NEVER DISAPPEARS, AND THAT IS A CHANGE. It used to draw nothing at all once nothing
  // was waiting and nothing had been settled for a week, which took the only way to past decisions
  // off Home with it. A quiet week now draws the band saying nothing is waiting on you — which is
  // how a person learns that decisions live here at all, and where the rest of them are.
  const tally = tallyDecisions(rows)
  const here = currentWorkspace()
  // AN AGENT AT THE DOOR IS WAITING ON THEM TOO, and it is drawn first. Problem NXEhOBumu5ZZ.
  const anyAsk = waiting.status === 'ready' && asksAtTheDoor(waiting.value).length > 0

  /**
   * ONE PRESS FROM HERE TO THE THING, with no id in sight — AND across the project boundary if that
   * is where it lives. Measured by clicking it: this band spans projects, `GET /api/records/:id`
   * does not, and the first version landed the owner on a refusal that (correctly) told them to
   * send an HTTP header. It carries the reader over instead, which is the same act as using the
   * project switcher and is announced on every tile that needs it.
   *
   * It is HERE and not in a variant, because a variant that navigated differently would be a second
   * behaviour rather than a second presentation.
   */
  const onOpen = (row: Decision) => {
    if (row.workspaceId !== here) setWorkspace(row.workspaceId)
    navigate(`/r/${row.recordId}`)
  }

  /** The same crossing, for the two records a decision has: the answer and the question it answers. */
  /**
   * ONE PRESS, TWO READINGS. A decision recorded in a card takes the fork out of BOTH: this band
   * asks the server what is waiting now, and the frame asks again for the one number, so the badge
   * beside "Waiting on you" in the rail moves with the card that just left.
   */
  const settled = () => {
    readAgain()
    onWaitingChanged()
  }

  const onOpenDecided = (workspaceId: string, recordId: string) => {
    if (workspaceId !== here) setWorkspace(workspaceId)
    navigate(`/r/${recordId}`)
  }

  return (
    <>
      <style href="mole-office-decision-queue" precedence="default">
        {DECISION_QUEUE_CSS}
      </style>
      <Panel titleIs="label" declares={{ surface: 'home.decided' }}
        /* THE TITLE IS THE ONE CLAIM, AND THE NUMBER BESIDE IT IS THE ONE NUMBER.
           It used to read "Decisions waiting on you" over a count of forks alone, while three other
           surfaces made the same claim about different sets. The band is named for the reading now,
           and the reading is what the count comes from — so the title is true whether or not any of
           the rows under it happen to be forks. */
        title={t('home.decisions')}
        /* THE ONE BLOCK ON HOME THAT IS NOT ABOUT THE PROJECT IN THE SWITCHER, and it now says so
           in two words rather than leaving a reader to work it out from four project chips.
           A cold reviewer landed in an empty project, read four questions about Mole Office's own
           construction sitting above the sentence "This project is empty", and concluded the
           product was an approval inbox for agents. A fork waiting on you does not stop waiting
           because you are reading a different project today — that is why this band spans them —
           but nothing said so, on the one screen where every other number is one project's. */
        kind={t('home.acrossProjects')}
        /* THE BAND CARRIES `--ask` ITSELF, not only its tiles.
           `ask` means "waiting on a person", it is the only hue this pass added, and this band is
           the surface it was added for. Drawn on the tiles alone they were four coloured cards
           floating in a neutral panel; the panel carrying the same tone is what makes the band read
           as one region — and rank 0 is what draws a tone at all, which is why it is not a
           decoration but the thing that says this whole block is refused to every agent. */
        /* `--ask` MEANS WAITING ON A PERSON, so it is spent only while somebody is. A band showing
           nothing but what was settled is not an ask, and tinting it would make the one hue this
           pass added mean "decisions live here" — which is how a reserved colour dies. */
        rank={rows.length === 0 && !anyAsk ? 1 : 0}
        tone="ask"
        actions={<WaitingCount waiting={waiting} />}
      >
        {/* AN AGENT ASKING TO COME IN, OR FOR A CARD, AT THE TOP, with the person's press on the row.
            Problem NXEhOBumu5ZZ: the ask was counted in the number beside the title and drawn nowhere.
            The rows are the items of the same reading the number counts, so the two agree. */}
        {waiting.status === 'ready' ? <AsksAtTheDoor reply={waiting.value} onAnswered={onWaitingChanged} /> : null}
        {rows.length === 0 ? (
          /* NOTHING IS WAITING, AND THE MARK BESIDE THE TITLE IS WHERE IT IS SAID. It used to be
             said twice, forty pixels apart: "nothing waiting" in the corner and "Nothing is waiting
             on you." as a sentence in the body. The distinction rule 5 protects is not touched —
             the corner still separates a read that found nothing from a read that failed, which is
             drawn as an error above — and the band still never disappears, because the title and
             the mark are what teach a reader that decisions are kept here. */
          null
        ) : (
          /* `onSettled` IS `readAgain`: once a decision is recorded in one of these cards, the band
             asks the server what is waiting on you now. Deliberately not a local edit of `rows` — a
             fork leaves the queue when a human decision links back to it, which is the server's
             reading, and a browser that crossed it off its own list would be a second answer to a
             governance question. */
          <DecisionTiles rows={shown} tally={tally} here={here} onOpen={onOpen} onSettled={settled} inspect={inspect} />
        )}
        {/* WHERE THE REST OF THE NUMBER IS. The cards above are the forks; the number beside the
            title counts every kind of thing waiting on the person, so on most days it is larger
            than the number of cards. A number a reader cannot follow to the things it counted is
            the failure this band was rebuilt to end, so the difference is stated and the way
            through is beside it. */}
        <p className="dq-through">
          <span className="dq-through-what">{throughWords(waiting, shown.length, rows.length)}</span>
          <RouteLink to={pathFor('governance')} className="dq-past-link">
            {t('home.openQueue')}
          </RouteLink>
        </p>
        <DecidedLine read={decided} here={here} onOpen={onOpenDecided} anyWaiting={rows.length > 0} />
      </Panel>
    </>
  )
}

/**
 * HOW MANY OF THE ONE NUMBER ARE DRAWN ON THIS BAND, IN WORDS. THREE NUMBERS, NOT TWO.
 *
 * Home draws SOME of the forks, because Home summarises the queue. Everything else waiting on the
 * person — a question an agent asked, kept words about time nobody has committed, anything set
 * aside — is a row on the queue. This is the sentence that says all of that with the numbers in it,
 * so the count beside the title is never a number a reader cannot follow.
 *
 * IT SAYS THAT A CUT HAPPENED, WHICH IS THE WHOLE REASON IT GAINED A THIRD NUMBER. A band drawing
 * four of twenty-six with nothing saying so is a band a reader has no reason to distrust and every
 * reason to. `drawn` is what is on the screen; `forks` is how many of them are waiting on them;
 * `oneNumber` is everything waiting on them, of which those forks are a part.
 *
 * ALL THREE NUMBERS ARE IN ONE SCOPE, AND ON 3 SEPTEMBER 2026 THEY WERE NOT. `forks` was every open
 * fork on the desk while `oneNumber` was everything on their list, and once a fork could be open
 * without being theirs the sentence could read "the 1 most consequential of the 2 forks, out of 1
 * waiting on you". The rows this counts are now the forks `GET /api/waiting` lists, so the
 * arithmetic a reader checks is arithmetic that holds.
 *
 * It says nothing at all while the reading has not arrived: a claim about a number nobody has yet
 * would be a guess, and the count beside it already says it is still counting.
 */
/**
 * WHICH OF THESE OPEN FORKS ARE WAITING ON THEM. The reading answers; this file does not.
 *
 * Not every open fork is on their list. A fork the corpus says an agent, the agent that spawned it or
 * a measurement settles is still open, still on the fork desk, and not waiting on them — and drawing
 * one under a band titled "Waiting on you", beside a number that does not count it, is two scopes in
 * one panel. Measured on 3 September 2026: the sentence under the cards could read "the 1 most
 * consequential of the 2 forks, out of 1 waiting on you".
 *
 * NOTHING HERE WORKS OUT WHOSE A FORK IS. That question has one reader, on the server, and a browser
 * answering it a second way is how this band came to make a claim no other surface agreed with. This
 * takes the ids `GET /api/waiting` listed and keeps the rows that are among them.
 *
 * WHILE THE READING HAS NOT ARRIVED, EVERY OPEN FORK IS KEPT, and the line under the cards says
 * nothing — which is what it already did. The band cannot say which forks are theirs before it has been
 * told, and it does not guess.
 *
 * `#/governance` is every open fork, whoever settles it, and the line under the cards links to it.
 */
export function forksWaitingOnThem(rows: readonly Decision[], waiting: AsyncState<WaitingReply>): Decision[] {
  if (waiting.status !== 'ready') return [...rows]
  const onTheirList = new Set(waiting.value.items.map((item) => item.id))
  return rows.filter((row) => onTheirList.has(row.recordId))
}

export function throughWords(waiting: AsyncState<WaitingReply>, drawn: number, forks: number): string {
 if (waiting.status !== 'ready') return ''
 const total = oneNumber(waiting.value)
 if (total === 0) return ''
 if (drawn < forks && forks < total) return t('home.queue.forksHere', { n: drawn, forks, total })
 return t('home.queue.here', { n: drawn, total })
}

/**
 * THE ONE NUMBER OF WHAT IS WAITING ON THE PERSON, AND ITS FOUR PARTS.
 *
 * ---------------------------------------------------------------------------------------
 * IT CANNOT RENDER A NUMBER IT WAS NOT GIVEN
 * ---------------------------------------------------------------------------------------
 *
 * It takes the READING and nothing else — no tally, no row count, no length of anything the caller
 * happened to have. `oneNumber` is the one function that turns the reply into a number, the rail's
 * badge calls the same one, and App.tsx fetches the reply once for both. So the number on Home, the
 * number on the rail and the number on the governance queue are the same number rather than three
 * that agree today.
 *
 * IT USED TO TAKE A TALLY OF FORKS, and that is what made it one of five competing claims: it said
 * "1 waiting" beside a list header saying "48 need you", a report band saying "8 waiting to be
 * read", a rail badge saying "Needs you 48" and a Schedule fold saying "5 waiting on you". The
 * count of forks has not gone anywhere — it is the first of the four parts.
 *
 * THE FOUR PARTS ARE ALWAYS DRAWN, INCLUDING A ZERO. They sum to the number, so a reader can see
 * the arithmetic; hiding an empty part would leave numbers that do not add up. Three are the tiers,
 * and their words come from `TIERS`, which the queue's own headings read too, each with its number in
 * it (round 31). The fourth is the messages the person has not read. The server files them in the
 * asked tier, and the Decisions page draws them in a list of their own beside the tiers. While the
 * line counted them under "asked of you", it said 4 over an "Asked of you" section of 3. So the asked
 * part leaves them out, and they are counted in a part of their own, from the rows that list draws.
 *
 * WHAT COULD NOT BE LISTED IS DRAWN BESIDE THE NUMBER AND NEVER INSIDE IT. A number told to
 * somebody is the length of a list of things they can open, plus a visible count of what this
 * reading knows about and could not list.
 *
 * THE THREE STATES ARE TOLD APART. Counting, could not ask, and an answer — because a zero drawn
 * for a request that failed is the fifth invariant broken in the one place it matters most.
 */
export function WaitingCount({ waiting }: { waiting: AsyncState<WaitingReply> }) {
 if (waiting.status === 'loading') return <span className="dq-count">{t('home.counting')}</span>
 if (waiting.status === 'error') return <span className="dq-count" data-bad="1">{t('home.notCounted')}</span>
 const total = oneNumber(waiting.value)
 const parts = partsOf(waiting.value)
 const messages = messagesYouHaveNotRead(waiting.value).length
 const drawn = TIERS.flatMap(tier => tier.tier === 'asked'
  ? [{ key: tier.tier, word: tier.part, n: parts.asked - messages }, { key: 'messages', word: (n: number | string) => t('decisions.messagesPart', { n }), n: messages }]
  : [{ key: tier.tier, word: tier.part, n: tier.tier === 'settle' ? parts.settle : parts.setAside }])
 const left = notCounted(waiting.value)
 return <span className="dq-count">{total === 0 ? <Absence title={t('home.nothingWaiting')} /> : <><Counted text={t('home.waitingCount', { n: total })} />{drawn.map(part => <span key={part.key}> · <span className="dq-count-part"><NumberInItsWord word={part.word} n={part.n} /></span></span>)}</>}{left === 0 ? null : ` · ${t('home.countLeft', { n: left })}`}</span>
}

/**
 * WHERE A DECISION YOU MADE WENT — the owner's own finding, answered on the page they were looking at.
 *
 * ---------------------------------------------------------------------------------------
 * *"it just disappeared and it is difficult to review it or change my mind"*
 * ---------------------------------------------------------------------------------------
 *
 * A fork leaving the queue the moment somebody settles it is correct: nothing is waiting on anybody
 * any more. What was wrong is that the band it left said nothing about it, on the one page the
 * owner was looking at, so the only way back was to know the record was now a `decision` and go
 * hunting for it in an archive of 154.
 *
 * NOTHING NEW IS STORED AND NO SECOND ANSWER IS WORKED OUT. These are the `decision` records
 * themselves, read by the same projection that decides which forks are still open, so a fork cannot
 * be waiting here and answered there.
 *
 * THE WAY OUT IS DRAWN WHENEVER ANYTHING HAS EVER BEEN DECIDED, even when nothing is inside the
 * week. That is the difference between "you decided nothing this week" and "decisions are not kept
 * on this page", and a reader who decided something a fortnight ago must not be shown the first
 * when the truth is the second.
 */
export function DecidedLine({
  read,
  here,
  onOpen,
  anyWaiting,
}: {
  read: DecidedRead
  here: string
  onOpen: (workspaceId: string, recordId: string) => void
  /** Whether anything is waiting above. It changes the spacing, never the words. */
  anyWaiting: boolean
}) {
  if (read.total === 0) return null
  return (
    <section className="dq-past" data-under={anyWaiting ? '1' : '0'} aria-label={t('home.whatDecided')}>
      <h3 className="dq-past-head">{t('home.whatDecided')}</h3>
      <DecidedCards rows={read.shown} here={here} onOpen={onOpen} />
      {/* WHAT THIS LINE IS NOT SHOWING, EXACTLY. Never the bare word "more": how many are drawn, how
          many there are, and the one page that holds every decision ever made. */}
      <p className="dq-past-all">
        <Counted as="span" firstStrong text={read.shown.length === read.total ? t('home.decidedAll', { n: read.total }) : t('home.decidedSome', { n: read.shown.length, total: read.total })} />{' '}
        <RouteLink to={pathFor('governance')} className="dq-past-link">
          {t('home.allDecisions')}
        </RouteLink>
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------- styles

/**
 * The band's geometry: the cards that are waiting, the fold that decides one, and the cards for
 * what you have already decided. Every value is a token from src/web/tokens.css, so a preset swap
 * reaches all of it.
 *
 * The decisions page mounts this same string under the same href, so React draws it once and the
 * two surfaces cannot drift apart in their spacing any more than in their words.
 *
 * NO BACKTICKS ANYWHERE IN THIS STRING — it is a template literal, and one closes it.
 */
export const DECISION_QUEUE_CSS = `
.dq-count { color: var(--text-2); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.dq-count b { color: var(--text); font-variant-numeric: tabular-nums; }
/* A PART OF THE COUNT LINE MOVES TO THE NEXT LINE WHOLE: at 390 in Chinese it broke in the middle of one part (wave 13q's round 32). */
.dq-count-part { white-space: nowrap; }

/* ---- the tiles.
   TWO COLUMNS ON A DESK, one on a phone. auto-fit with a floor rather than a fixed 2, so three
   forks are two-then-one and five are two-two-one without a second rule.
   THE FLOOR IS 26rem AND IT WAS MEASURED, not chosen. At 20rem a 1440px window fitted THREE
   columns of 373px, which is the width at which a fork title -- they are full sentences, routinely
   fourteen words -- wraps to four lines and the option chip drops onto a row of its own. 26rem
   holds two, at about 560px each, which is where a title fits on two lines and the chip and the
   age sit on one. */
.dq-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr));
  gap: var(--pad-lg);
}
/* AN OPEN CARD TAKES THE WHOLE ROW, because what it opens is a page and not a column.
   Measured at 1440 on 27 August 2026: opening the left-hand card grew it to 1,112 px and left a
   1,112 px column of empty white beside it, because the fold was expanding inside one cell of a
   two-column grid. Spanning every column is the whole fix and it is one line; the browser reflows
   the cards below it, which is what a reader expects from something that just grew.
   IT IS A RULE ABOUT THE OPEN ONE, not a second layout: closed cards are untouched. */
.dq-tile:has(> .dq-acts > .dq-decide[open]) { grid-column: 1 / -1; }
/* ONE ENCLOSURE PER DECISION. The border is what the hairline was not: four boxes are counted
   before a word is read. The rail is --ask, the hue the design contract reserves for "waiting on a
   person", and this band is the surface it was added for. */
.dq-tile {
  position: relative;
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0;
  padding: var(--pad-lg);
  padding-left: calc(var(--pad-lg) + var(--rail));
  /* THE PANEL IS THE TINT AND THE TILE IS THE ENCLOSURE. The band is a rank-0 panel in the ask
     tone, so its ground is already --ask-row; a tile drawn in the same colour would be four
     invisible rectangles, which is the hairline problem again in a different paint. The tiles take
     the plain panel ground and stand ON the tint, and the rail keeps them in the same family. */
  background: var(--panel);
  border: var(--border-w) solid var(--ask-line);
  border-left: var(--rail) solid var(--ask);
  border-radius: var(--radius);
}
/* THE OWNER'S PIN, A MARK AND NOT A PAINT. The owner's brief: "Provide a lightweight explicit visual mark
   for owner-pinned items, such as a star in the card corner" and "Do not overload existing semantic
   colors." The tile keeps its ask rail and its panel ground; the star sits in the top right corner
   and carries the whole of the emphasis. It is drawn in the ordinary text colour for the same
   reason: a second hue here would be a second thing colour means on this surface. */
.dq-pin {
  position: absolute; top: 6px; right: 8px;
  font-size: 14px; line-height: 1;
  color: var(--text);
  pointer-events: none;
}
/* And the title stops short of it, so a long question never runs under the star. */
.dq-tile[data-pinned] .dq-title { padding-right: 20px; }
.dq-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); min-width: 0; }
/* THE CUES, UNDER THE TITLE AND NOT ABOVE IT. They used to be the first line of the tile, so the
   first words on the whole home page were "3 options, no recommendation" and the question the fork
   is about came second. */
.dq-cues { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); min-width: 0; }

/* ---- the one chip that says which decision is easiest.
   FILLED WHEN SOMEBODY ALREADY SUGGESTED AN ANSWER, outlined when nobody has. The words say the
   same thing on both, so the fill is never carrying the state alone -- and the tiles are sorted
   into those two groups, so the fill also explains why this one is where it is. */
.dq-chip {
  display: inline-flex; align-items: center;
  min-height: 20px; padding: 1px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  overflow-wrap: break-word; min-width: 0;
}
.dq-chip[data-rec="1"] {
  background: var(--ask-bg);
  border-color: var(--ask-line);
  color: var(--ask);
  font-weight: 600;
}
.dq-where { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.dq-blocking { color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.dq-blocking b { color: var(--text); font-variant-numeric: tabular-nums; }
/* HOW LONG IT HAS SAT, IN TWO CHARACTERS. Five words and eleven
   characters of "waiting under a day" stood next to the sentence the tile is about, and won. The
   whole phrase is on the element, so a pointer and a screen reader both still get it. */
.dq-age {
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---- ABOUT A LINE OF THE QUESTION, ON A ROW THAT IS NOT OPEN.
   The owner's section 8 asks for "about 1-1.5 lines of the question/summary" on a collapsed governance
   item. Two lines is that at a card width of about 560px, and the clamp is the whole of the
   shortening: the string in the data is never cut, the full text is on the element as a title, and
   the whole question is one press away.
   IT DISAPPEARS WHEN THE CARD OPENS. The form below draws the question in full, and a preview of a
   short question sitting above the same short question is the doubled sentence this pass removed. */
.dq-lede {
  margin: 0; min-width: 0;
  color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui);
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.dq-tile:has(.dq-decide[open]) .dq-lede { display: none; }

/* ---- A FACT ABOUT THE ROW THAT IS NOT A COUNT AND NOT AN AGE: somebody could be hurt, this one
   now stands for other questions, something on it could not be read.
   NO NEW HUE. The owner's brief: "Do not overload existing semantic colors." Two of these take the ordinary
   quiet ink and a border; only the unreadable one takes the fault ink, which is the colour that
   already means exactly what it means everywhere else in this product. */
.dq-mark {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 20px; padding: 1px 8px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  min-width: 0; overflow-wrap: break-word;
}
.dq-mark b { color: var(--text); font-variant-numeric: tabular-nums; }
.dq-mark[data-mark="safety"] { border-color: var(--text-2); color: var(--text); font-weight: 600; }
.dq-mark[data-mark="unread"] { border-color: var(--st-failed-line); color: var(--st-failed); }
.dq-mark[data-mark="unread"] b { color: var(--st-failed); }
.dq-mark[data-mark="the-persons-words"] { border-color: var(--ask-line, var(--border-strong)); color: var(--text); }

/* ---- THE TWO WAYS ON, SIDE BY SIDE ON A CLOSED ROW: settle it here, or open the record.
   They sit on one line while the card is closed. Once the fold is open this stops being a row at
   all: the form takes the full width and the way to the record page lands under it, which is where
   it was before this pass moved it out of the fold.
   IT STOPS BEING A FLEX CONTAINER TOO, AND THAT IS NOT A TIDY-UP. Measured at 1440 on 27 August
   2026: an open form inside this as a column flex container drew 844px for 615px of content, so a
   card carried 229px of empty white under its last paragraph. The same markup with this element
   laid out as an ordinary block drew 615px. */
.dq-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); min-width: 0; }
.dq-acts:has(.dq-decide[open]) { display: block; }
.dq-acts:has(.dq-decide[open]) > .dq-decide-open { margin-top: var(--gut); }
.dq-acts > .dq-decide { min-width: 0; }

.dq-title {
  padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
  min-width: 0; overflow-wrap: break-word;
  color: var(--text);
  font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui);
}
.dq-title:hover { text-decoration: underline; }
.dq-title:focus-visible {
  outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

/* ---- THE PRESS THAT STARTS DEALING WITH IT.
   It is the loudest thing on the card because it is the act: the --ask outline and the panel
   ground, the same shape the old navigating button had, so a reader who used the last version
   presses the same object and gets the choices instead of two more paragraphs.
   IT TAKES THE WHOLE WIDTH OF THE CARD, because what it opens does: a picker, a paragraph box and
   a button, none of which fits beside anything. */
/* THE FLOOR OF THE CARD IS THE ID ROW'S TO FIND, NOT THIS ONE'S. RecordId's own stylesheet drops
   the id row to the bottom of a column-flex card with margin-top auto, and two elements both
   claiming auto would split the free space between them and leave the controls floating. So the id
   takes the space and the acts row sits under it, which is the bottom of every card in the row. */
.dq-decide { min-width: 0; padding-top: 2px; }
.dq-decide-sum {
  display: flex; align-items: center; gap: 6px;
  min-height: var(--row-h); padding: 4px var(--pad-lg);
  border: var(--border-w) solid var(--ask-line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--ask);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  list-style: none; cursor: pointer;
  width: fit-content;
}
.dq-decide-sum::-webkit-details-marker { display: none; }
.dq-decide-word::after { content: " ▾"; }
.dq-decide[open] > .dq-decide-sum { background: var(--ask-bg); }
.dq-decide[open] > .dq-decide-sum .dq-decide-word::after { content: " ▴"; }
.dq-decide-sum:hover { background: var(--ask-bg); }
.dq-decide-sum:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.dq-decide-body { padding-top: var(--gut); display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.dq-sum, .dq-q, .dq-raw {
  margin: 0; max-width: var(--measure-in-box);
  color: var(--text-2); font: var(--fs-2)/1.72 var(--font-ui);
  overflow-wrap: break-word;
}
/* The author's own line reads first and reads as the answer to "what is this about". */
.dq-sum { color: var(--text); }
.dq-q { font-size: var(--fs-1); }
.dq-raw { color: var(--text-3); font-size: var(--fs-1); }
.dq-raw code { font-family: var(--font-mono); overflow-wrap: anywhere; }

/* ---- WHAT YOU DECIDED, AS CARDS.
   The owner settled one and could not find it again, and when the way back was a column of grey
   sentences the owner read it as more explanation rather than as a list of things. So each one is an
   enclosed card in a grid: three across on a desk, one on a phone.
   IT TAKES NO --ask AND NO FILL. That hue means somebody is waiting, and nobody is waiting on
   anything in this strip -- it is a way back, not work. */
.dq-past { min-width: 0; }
.dq-past[data-under="1"] {
  margin-top: var(--pad-lg);
  border-top: var(--border-w) solid var(--ask-line);
  padding-top: var(--pad);
}
/* --fs-2, WHICH IS THE SIZE THE REST OF THIS LEVEL ON HOME IS SET AT. Measured on 15 August: Home
   drew its third heading level at three sizes -- this one at 13px, "Running now" and the day
   heading at 14px, and one more at 16px. Two of the three were already 14. */
.dq-past-head {
  margin: 0 0 var(--gut);
  color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
}
/* THE FLOOR IS 18rem AND IT IS WHAT MAKES THE COUNT THREE AT 1440. A decision question is a
   sentence, so a narrower card wraps it to four lines and the grid stops reading as a row of
   things; auto-fit rather than a fixed 3 so two decisions are two cards, not two thirds of a row. */
.dq-past-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: var(--gut);
}
.dq-past-card {
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
  padding: var(--pad);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
}
.dq-past-q, .dq-past-back {
  padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
  min-width: 0; overflow-wrap: break-word;
}
/* THE QUESTION IS THE HEAD OF THE CARD and it is at most two lines: the rest of it is on the record,
   which is one press away. Two cards of three lines each read as two things; two of six read as prose.
   It was one line, and one line of a narrow card cut a Chinese decision's title before it said what
   was decided. */
.dq-past-q {
  color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.dq-past-q:hover { text-decoration: underline; }
.dq-past-took {
  margin: 0; min-width: 0; overflow-wrap: break-word;
  color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
/* NONE OF THE RECORDED OPTIONS is a real stored answer, so it is marked rather than left to be
   inferred from words that happen not to match any option. */
.dq-past-own { color: var(--text-3); font-weight: 600; }
.dq-past-meta {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); margin: 0; min-width: 0;
  color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.dq-past-back { color: var(--accent); font: var(--fs-1)/var(--lh-tight) var(--font-ui); text-decoration: underline; text-underline-offset: .16em; }
.dq-past-alone { color: var(--text-3); font-style: normal; }
.dq-past-q:focus-visible, .dq-past-back:focus-visible {
  outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
.dq-past-all { margin: var(--gut) 0 0; color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.dq-past-all b, .dq-past-all .num { color: var(--text-2); font-variant-numeric: tabular-nums; }
.dq-past-link { color: var(--accent); text-decoration: underline; text-underline-offset: .16em; }
/* THE WAY THROUGH TO THE QUEUE, and the sentence saying how much of the number is drawn above it. */
.dq-through { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: var(--pad) 0 0; }
.dq-through-what { color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }

/* ---- WHAT THE DECIDE FOLD DRAWS AROUND THE FORM, and nothing that form draws itself.
   Which project the decision will land in, the author\'s own line, what the fork is holding up by
   name, and anything the server could not read on it. The question, the options and the act are
   ProposalGovernance\'s and are not restated here. */
.dq-decide-meta {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); margin: 0; min-width: 0;
  color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.dq-decide-project { color: var(--text); }
.dq-decide-holds { min-width: 0; }
.dq-decide-holds-head { margin: 0 0 2px; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.dq-decide-holds-head b { color: var(--text); font-variant-numeric: tabular-nums; }
.dq-decide-holds-list {
  list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0;
  color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.dq-decide-kind { color: var(--text-3); }
/* WHAT COULD NOT BE READ. A fault, so it takes the fault ink and says so in words beside it. */
.dq-decide-unread {
  list-style: none; margin: 0; padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  background: var(--st-failed-row);
  color: var(--st-failed); font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
/* THE QUESTIONS THIS FORK NOW STANDS FOR. Not a fault and not drawn as one: nothing went wrong when
   two questions were joined, and the sentences name both records and who joined them. */
.dq-decide-joined {
  list-style: none; margin: 0; padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
/* WHY THIS FORK IS WHERE IT IS IN THE QUEUE, in the server's words. Quiet, because it explains the
   order rather than being part of the decision. */
.dq-why { margin: 0; max-width: var(--measure-in-box); color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.dq-decide-open {
  padding: 0; border: 0; background: none; cursor: pointer;
  color: var(--accent); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  text-decoration: underline; text-underline-offset: .16em;
}
.dq-decide-open:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); border-radius: var(--radius-sm); }
/* THE PANEL THAT SETTLES A FORK IS MOUNTED IN THE FOLD, and it is the record page\'s own panel. It
   sits inside a card that is already inside a tinted band, so it takes no border of its own and no
   page margin. Nothing about what it says changes. */
.dq-decide-body .px-panel { border: 0; border-radius: var(--radius-sm); padding: 0; }

/* The four class names that used to be given a 44px touch height here belonged to the two views the
   owner did not choose, and nothing in the product draws them. A rule for an element that does not
   exist is a rule nobody can check. */
@media (max-width: 480px) {
  .dq-grid { grid-template-columns: minmax(0, 1fr); gap: var(--gut); }
}
`
