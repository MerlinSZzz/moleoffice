// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE SHOUTS WHEN IT IS IN THE WRONG WORLD, AND SAYS NOTHING OTHERWISE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G4 of design/ground/ACCEPTANCE.md answers the question of
 * how much a page should say about itself. A small always-visible line was offered and
 * refused. The second option was chosen: nothing shown in normal use, and a
 * red banner only when something is wrong, with the page not usable at all. Failing
 * loudly is best, and the first option would make a user think there was no problem.
 *
 * Nothing on screen in normal use; a red banner nobody can miss when something is wrong; the page
 * unusable behind it. The reason for refusing the quiet version is the important half: a line that
 * is always there teaches a reader that it is furniture, and then it says nothing on the day it
 * matters.
 *
 * SO THIS COMPONENT DRAWS NOTHING AT ALL, most of the time. It is mounted on every page and its
 * ordinary output is null.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SHOUTS ABOUT, AND WHAT A SECOND COMPONENT DRAWS NOW
 * ---------------------------------------------------------------------------------------
 *
 * 1. **A reply came from another Mole Office** than the one this page opened against. Every reply
 *    carries its world; `lib/world.ts` remembers the first and compares the rest.
 * 2. **A server that cannot restart itself.** The last one there is going to be is answering
 *    perfectly, and nothing about the reply says so.
 * 3. **The database behind this page is not the canonical one**, and this page was opened on the
 *    canonical address. Somebody who typed the address of the real Mole Office and got a scratch
 *    database is in the state the whole criterion exists for.
 *
 * THE OLD-CODE READING IS NOT HERE, AND IT USED TO BE. By a decision, both directions of *the code
 * is behind the checkout* are one quiet line of title now, drawn by
 * `components/BehindTheCheckout.tsx`, and the page goes on working under
 * it. This file keeps the blocking banner for the rows that mean the page
 * cannot be used at all.
 *
 * The words come from `lib/world.ts`, which holds all three checks. This file is the drawing.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import {
  compareThisPageWith,
  howLongUntilTheGraceRunsOut,
  isAFreshnessRow,
  subscribeToTheWorld,
  subscribeToThisPagesMove,
  theOnlyTroubleIsTheDatabaseOfThisPagesMove,
  theWorldThatAnsweredLast,
  thisPageIsBehindTheCheckout,
  thisPagesMoveIsUnderWayNow,
  worldTrouble,
  type Disagreement,
} from '../lib/world.ts'
// THE ONE MACHINE READING FOR THE PAGE, shared with the Runtime page and the Settings band. It is
// where every rule for reading it again lives, the blocked page's thirty seconds among them; this
// component never asks the door for itself. Problem XKsVmmINput5.
import { readTheMachineWhileThePageIsBlocked, useTheMachineState } from '../lib/onemachine.ts'
// Whether this page is already on a trip, and the act that starts one. Criterion C7.
import { subscribeToTheVisit, theVisitThisPageHolds } from '../lib/visiting.ts'
import { theApiThisPageTalksTo } from '../lib/api-address.ts'

/**
 * The red banner, the thing that blocks the page, and nothing when the page is where it thinks it
 * is.
 */
/**
 * THE ONE LOOK THIS COMPONENT OWES AFTER SEEING A READING, or null when it owes none.
 *
 * ONE REASON, AND IT ENDS ON ITS OWN. A change made a second before the read is inside the grace,
 * so a page that really is behind draws nothing — and with one reading it would never draw
 * anything, however long it stayed behind. This look is the one that draws it, and after it the
 * reason is spent.
 *
 * THERE IS NO SECOND REASON ANY MORE. Until 13 September 2026 this returned three seconds whenever
 * anything was wrong, and the component asked the door for a fresh reading that often. On the
 * owner's live office that was a machine sweep every three seconds while the wrong-world banner
 * stood: 4,315 sweeps in under three hours, the costliest thing the server did. Problem
 * `XKsVmmINput5`. Recovery now comes from the shared reading, `src/web/lib/onemachine.ts`, which is
 * read again when the server announces that what this page compares changed (wave 13w round 25)
 * and every thirty seconds while the sheet blocks the page, and from the two checks that ride on
 * every reply.
 */
function whenToLookAgain(): number | null {
  if (thisPageIsBehindTheCheckout() && howLongUntilTheGraceRunsOut() > 0) return howLongUntilTheGraceRunsOut()
  return null
}

export function WrongWorld() {
  useLanguage()
  const allTrouble = useSyncExternalStore(subscribeToTheWorld, worldTrouble, worldTrouble)
  /**
   * THE TWO "BEHIND THE CHECKOUT" ROWS ARE NOT DRAWN HERE ANY MORE.
   *
   * By a decision, the freshness warning stays, but as one line of title, and the page
   * stays usable under it. `BehindTheCheckout.tsx` draws exactly the
   * rows `isAFreshnessRow` names, in ordinary flow with no sheet.
   *
   * EVERY OTHER ROW STILL BLOCKS, and the sheet below stays for them: another world answering, a
   * scratch database on the address this checkout calls real, and a server that cannot restart are
   * not states a person can go on using the page safely in. That is the owner's F2 answer of 3
   * September 2026, that the page is not usable at all, and the freshness reading is the one
   * exception they made.
   */
  const trouble = allTrouble.filter((one) => !isAFreshnessRow(one))
  /**
   * THE MACHINE READING, FROM THE ONE SHARED STORE. Reading it here is what starts the page's one
   * sweep; this component never asks the door for itself, so a re-render and a second look cost no
   * request. `machine.value` below is what the two checks that need a reading compare.
   */
  const machine = useTheMachineState()
  /**
   * WHILE A BANNER STANDS, THE PAGE ASKS AGAIN EVERY THIRTY SECONDS, because a page with the sheet over it cannot be
   * pressed and nothing else may ask, and a page whose own move is under way has stopped its panel's asks. A reply from
   * the right server, or the moved-home header, is what clears the banner.
   */
  const anythingWrong = trouble.length > 0
  const moving = useSyncExternalStore(subscribeToThisPagesMove, thisPagesMoveIsUnderWayNow, thisPagesMoveIsUnderWayNow)
  /**
   * DF28. WHILE THIS PAGE'S OWN MOVE IS UNDER WAY, A DATABASE-ONLY ROW STANDS ABOVE THE PAGE AND NOT OVER IT.
   *
   * The page cannot tell the moved office from an office that started on a wrong database before the moved-home header
   * arrives, so the banner still says so. But the data folder panel's load-again press is the one way out that keeps
   * what the page knows, and the sheet must not swallow it. Every other row, and the same row when the move is not this
   * page's, still shuts the page: a write must not reach a database nobody meant.
   */
  const blocksThePage = anythingWrong && !(moving && theOnlyTroubleIsTheDatabaseOfThisPagesMove(trouble))
  useEffect(() => (anythingWrong ? readTheMachineWhileThePageIsBlocked() : undefined), [anythingWrong])

  /**
   * COMPARE WHAT THIS PAGE IS WITH WHAT THE ONE READING SAYS.
   *
   * It runs when a new reading lands — the page-load read, a read because the server announced
   * `machine.changed` or the stream came back, the thirty-second read while the sheet blocks the page,
   * or a press on the Runtime page — and once more when the grace this page was found inside runs
   * out, using the reading already in hand and no request.
   *
   * THE STAMP IS READ OFF `window`, WHICH IS WHERE `lib/served.ts` PUTS IT. `main.tsx` imports that
   * file before React mounts, so by the time this runs the stamp is there; and `served.ts` reads a
   * module Vite makes at serve time, which exists only inside the browser app's own build.
   * Importing it here would make this component unreadable to anything running under Node,
   * including the several tests that reach `App.tsx`. A page with no stamp at all cannot have
   * started, since the import that sets it is the second line of `main.tsx`; if it is somehow
   * missing, the other two checks still run and this one is not made.
   */
  useEffect(() => {
    let stillHere = true
    let waiting: ReturnType<typeof setTimeout> | undefined
    const look = (): void => {
      const record = machine.value
      if (stillHere && record !== null) {
        const stamp = window.moleOfficeServedCode
        if (stamp !== undefined) {
          compareThisPageWith(
            {
              addresses: {
                canonicalWeb: record.addresses.canonicalWeb,
                // The second address this checkout calls the real one, when it declares one. A page
                // opened over it is on the real address just as much as one on loopback.
                canonicalWebForOtherMachines: record.addresses.canonicalWebForOtherMachines,
              },
              database: record.database,
              freshness: record.freshness,
              supervisor: { failedStarts: record.supervisor.failedStarts },
            },
            window.location.origin,
            stamp,
            Date.now(),
            // A TRIP THIS PAGE HOLDS TURNS OFF CHECK 3 AND NOTHING ELSE. Read here rather than
            // inside the comparison, which is a pure function of what it is handed and is the part
            // worth testing. `Enter` reloads, so a page on a trip holds it before this first runs.
            theVisitThisPageHolds() !== null,
          )
        }
      }
      if (!stillHere) return
      const again = whenToLookAgain()
      if (again !== null) {
        waiting = setTimeout(look, again)
      }
    }
    look()
    return () => {
      stillHere = false
      if (waiting !== undefined) clearTimeout(waiting)
    }
  }, [machine.value])

  // NOTHING BETWEEN THIS AND THE BANNER. There used to be a dismissal here — a press that removed
  // it, remembered in sessionStorage — and the page behind it read and could write the wrong
  // database in silence. The block at the top of lib/world.ts headed "there is no way past this"
  // has the measurement and the reason.
  if (trouble.length === 0) return null

  return (
    <>
      <style href="mole-office-wrong-world" precedence="default">
        {WRONG_WORLD_CSS}
      </style>
      {/* THE PAGE IS NOT USABLE BEHIND IT, not at all. A sheet over the whole
          window that swallows every press, so nothing can be read as a working page and nothing can
          be written into a database nobody meant. It is drawn before the banner and under it.

          THE ONE EXCEPTION IS A DATABASE ROW DURING THIS PAGE'S OWN MOVE, when the banner stands above the page in
          ordinary flow and no sheet is drawn: the panel's load-again press is what ends the state, and a sheet would
          swallow it. The component's `blocksThePage` has the whole account. */}
      {blocksThePage ? <div className="px-ww-block" aria-hidden="true" data-name="the page is blocked" /> : null}
      <div className={blocksThePage ? undefined : 'px-ww-in-flow'}>
        <TheBanner trouble={trouble} />
      </div>
      {/* The wrapper is the only thing the class in flow is on; the banner keeps its own tag. */}
    </>
  )
}

/**
 * THE BANNER ITSELF, kept a component so the class that lifts it above the page can be put on a wrapper: the banner's own
 * `px-ww` class still carries the fixed position, and `.px-ww-in-flow .px-ww` turns that off while this page's own move
 * is under way. The source test that says the banner carries both ways out reads this block by its own opening tag.
 */
function TheBanner({ trouble }: { trouble: readonly Disagreement[] }): React.ReactElement {
  return (
    <>
      <div className="px-ww" role="alert" aria-live="assertive" data-name="the wrong world banner">
        <div className="px-ww-in">
          <p className="px-ww-head">{t('frameFiles.wrongWorld.head')}</p>
          <ul className="px-ww-list">
            {trouble.map((one) => (
              <li className="px-ww-one" key={`${one.what}|${one.onTheServer}`}>
                <span className="px-ww-what">{one.what}</span>
                <span className="px-ww-pair">
                  {/* BOTH VALUES, ALWAYS. A banner that says the world is wrong and not which two
                      things differ is a banner somebody has to go and investigate. */}
                  <span className="px-ww-side">
                    <span className="px-ww-side-label">{t('frameFiles.wrongWorld.thisPage')}</span> {one.onThisPage}
                  </span>
                  <span className="px-ww-side">
                    <span className="px-ww-side-label">{t('frameFiles.wrongWorld.whatAnswered')}</span> {one.onTheServer}
                  </span>
                </span>
                <span className="px-ww-do">{one.doThis}</span>
              </li>
            ))}
          </ul>
          <IAmVisitingOnPurpose />
          <ComeHomeFromHere />
        </div>
      </div>
    </>
  )
}

/**
 * THE WAY OUT FOR A PAGE THAT IS ON A TRIP. Problem `gAVABjZo2OHq`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * The owner reported on the night of 4 September: testing a world, after switching they saw "This is
 * not the Mole Office you think you are looking at." at the top with some large words explaining it,
 * and they could neither press anything else nor go back.
 *
 * Reproduced in a browser in the owner's setup — the browser app on the address this checkout calls the
 * real one, a rich home world, and Enter into an empty second world whose server had been running
 * since before the last merge. The banner drew at once, one row, *the code the server is running*;
 * the sheet blocked the page; the visiting strip was on screen and its Return home could not be
 * pressed, because the sheet swallows the press. The trip stayed. The only way out was clearing the
 * browser's storage.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE BANNER MUST CARRY IT ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * The banner blocks everything by design, because the page must not be usable at
 * all, so every control outside it is unreachable while it is up, the strip's Return home included. A page that walked
 * into another world and then found that world running old code was therefore trapped there.
 *
 * IT IS NOT A DISMISSAL, and that is the line this file has held since `gYBEA5B6KC9h`. The banner
 * still says every fact, still blocks the page, and still cannot be waved away. Coming home makes
 * it UNTRUE rather than hiding it: the trip ends, the page points at the world it came from, and
 * whatever was wrong with the world it was visiting is no longer this page's business. It is the
 * mirror of "I am visiting on purpose", which does the same thing from the other side, and exactly
 * one of the two is ever drawn.
 *
 * AND IT CANNOT REFUSE. `returnHome` ends the visit at the world being left if that world answers
 * and comes home either way — the same act as the strip's Return home and the Worlds page's, which
 * is what problem `MvsNyqPIFIvt` settled.
 */
function ComeHomeFromHere() {
  const trip = useSyncExternalStore(subscribeToTheVisit, theVisitThisPageHolds, theVisitThisPageHolds)
  if (trip === null) return null
  return (
    <div className="px-ww-visit">
      <button
        type="button"
        className="px-ww-visit-do"
        onClick={() => {
          void api.returnHome().then(() => {
            window.location.reload()
          })
        }}
      >
        {t('frameFiles.wrongWorld.returnHome')}
      </button>
      <span className="px-ww-visit-said">{t('frameFiles.wrongWorld.visiting', { world: content(trip.worldName) })}</span>
    </div>
  )
}

/**
 * ONE MORE LINE ON THE BANNER: this page is in another world because somebody meant it to be.
 *
 * Criterion C7 of design/messages/ACCEPTANCE.md section 8: *the wrong-world banner of G4 gets one
 * more line, "I am visiting on purpose", which is exactly an Enter (a registered visit) and replaces
 * nothing else about the banner.*
 *
 * IT REPLACES NOTHING. The banner still says every fact it said, still blocks the page behind it,
 * and still has no way to dismiss it. Pressing this is not dismissing: it registers a visit with the
 * world that is answering, which is the same act the Enter button on the Worlds page performs, and
 * then reloads — after which the page is deliberately in that world and the strip says so the whole
 * time it is there.
 *
 * IT IS NOT DRAWN WHILE THIS PAGE IS ALREADY VISITING. A trip that is already registered and a
 * banner about the wrong world at the same time is a different fault, and offering to register a
 * second visit would hide it.
 */
function IAmVisitingOnPurpose() {
  const trip = useSyncExternalStore(subscribeToTheVisit, theVisitThisPageHolds, theVisitThisPageHolds)
  const [refused, setRefused] = useState<string | null>(null)
  const answered = theWorldThatAnsweredLast()
  if (trip !== null || answered === null) return null
  return (
    <div className="px-ww-visit">
      <button
        type="button"
        className="px-ww-visit-do"
        onClick={() => {
          void api
            .enterAWorld(
              {
                id: answered.database,
                name: answered.database,
                databaseIdentity: answered.database,
                // WHERE THIS PAGE'S REQUESTS ALREADY GO, and not the address bar. This used to be
                // `window.location.origin`, which in `npm run dev` is Vite: the visit was posted to
                // http://127.0.0.1:29845/api/office/visits, Vite answered 404 with an empty body, and
                // the banner showed the browser's own "Unexpected end of JSON input". No visit was
                // registered, and the banner has no dismissal by design, so that press was the only
                // way out of it. Problem `nl5t16TMBKbF`.
                //
                // The button is drawn only while this page holds no trip, so where its requests go
                // IS the world that answered — the one this visit is with.
                address: theApiThisPageTalksTo(),
                head: answered.head,
              },
              // THE REASON THE VISIT IS STORED WITH, sent to the server and not drawn here. It is
              // what the office keeps, so it stays English whatever the page's language
              // .
              'I am visiting on purpose',
            )
            .then(() => {
              window.location.reload()
            })
            .catch((err: unknown) => {
              setRefused(err instanceof Error ? err.message : String(err))
            })
        }}
      >
        {t('frameFiles.wrongWorld.visitingOnPurpose')}
      </button>
      {refused === null ? null : <span className="px-ww-visit-said">{refused}</span>}
    </div>
  )
}

/**
 * ABOVE EVERYTHING, INCLUDING THE SKIP LINK.
 *
 * `--z-blocked` and `--z-wrong-world` are the two highest layers in tokens.css, above `--z-skip`,
 * which is the keyboard's way into the page and was the top of the scale until this existed. They
 * are named there rather than worked out here because that scale is the one place the question
 * "what floats above what" is answered, and tests/z-index.test.ts fails when a second answer
 * appears.
 *
 * THE RED IS `--st-broken`, the state colour, and not a colour literal. tokens.css says there is
 * deliberately no `--red`: a colour here has to carry a meaning, and the meaning of this banner is
 * exactly the one that word already has. Every theme answers it — near-black in `mono`, #902e1e in
 * the high-contrast theme — which is how it stays legible in all seven.
 */
const WRONG_WORLD_CSS = `
.px-ww-visit { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-top: var(--gut); }
.px-ww-visit-do {
  min-height: var(--row-h);
  padding: 0 var(--pad-lg);
  border: var(--border-w) solid currentColor;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.px-ww-visit-said { font-size: var(--fs-1); }
.px-ww-block {
  position: fixed;
  inset: 0;
  z-index: var(--z-blocked);
  background: transparent;
  cursor: not-allowed;
}
.px-ww {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-wrong-world);
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--gut);
  padding: var(--pad-lg);
  background: var(--st-broken-bg);
  color: var(--text);
  border-bottom: var(--rail) solid var(--st-broken);
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.18);
  max-height: 70vh;
  overflow-y: auto;
}
.px-ww-in-flow {
  position: relative;
  z-index: var(--z-wrong-world);
}
.px-ww-in-flow .px-ww {
  position: static;
  max-height: none;
  box-shadow: none;
}
.px-ww-in { flex: 1 1 22rem; min-width: 0; }
.px-ww-head {
  color: var(--st-broken);
  font-weight: 700;
  font-size: var(--fs-4);
  line-height: var(--lh-tight);
  margin-bottom: var(--pad);
}
.px-ww-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--pad); }
.px-ww-one {
  display: grid;
  gap: 2px;
  padding-left: var(--pad);
  border-left: var(--rail) solid var(--st-broken);
}
.px-ww-what { font-weight: 700; }
.px-ww-pair { display: grid; gap: 2px; }
.px-ww-side { font-size: var(--fs-1); overflow-wrap: anywhere; }
.px-ww-side-label {
  font-size: var(--fs-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
  margin-right: 4px;
}
.px-ww-do { font-size: var(--fs-1); }
`
