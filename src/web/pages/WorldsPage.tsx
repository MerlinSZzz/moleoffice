// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { content, t, type WordKey } from '@shared/i18n.ts'
/**
 * THE OFFICE: WHICH WORLDS THERE ARE, WHO IS VISITING WHOM, AND THE WAY INTO ONE.
 *
 * Criterion C7 of design/messages/ACCEPTANCE.md section 8: the worlds that exist can be browsed from
 * a page in the home world, entered, and left again.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ON IT
 * ---------------------------------------------------------------------------------------
 *
 * The worlds, with the facts criterion C2 stores; who is working away from home right now; and one
 * press per world that points this page's API at it. A world that has ended is drawn with the date
 * and the reason, because a world disappearing has to be recorded, and a list that
 * dropped them would keep the less interesting half.
 *
 * ---------------------------------------------------------------------------------------
 * TEST WORLDS ARE HIDDEN UNTIL SOMEBODY ASKS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion C3. A run of the suite registers hundreds of worlds that each live for seconds, so a
 * page that drew them all would be a page about the test suite. The count is on the control, so
 * "hidden" is never the same as "there are none".
 */

import { useState, useSyncExternalStore } from 'react'
import { api, type WhatTheOfficeSays } from '../api.ts'
import { Absence, ErrorNote, Loading, Panel, useAsync } from '../components/ui.tsx'
import { isEphemeral, theAddressToReachAWorldBy, type Visit, type World } from '@shared/worlds.ts'
import { worldKindWord, worldStandingWord } from '@shared/words.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { subscribeToTheVisit, theVisitThisPageHolds } from '../lib/visiting.ts'
import { theWorldThisPageCallsHome } from '../lib/world.ts'
import { thisPageIsOn } from '../lib/api-address.ts'
import { pathFor, RouteLink } from '../components/router.tsx'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73. The same component Settings draws, with presses.
import { TrustedMachines } from '../components/TrustedMachines.tsx'
import type { WhatTheOfficeTrusts } from '@shared/trustedmachines.ts'

export function WorldsPage() {
  const [state, readAgain] = useAsync(
    // AND THE MACHINES THIS OFFICE TRUSTS, criterion P73. Read with the worlds because it is one
    // page and one Read again press: a second fetch of its own would leave half the page stale.
    async () => ({ office: await api.worlds(), who: await api.visits(), trusts: await api.trustedMachines() }),
    [],
  )
  return (
    <div className="page wd">
      <style href="mole-office-worlds-page" precedence="default">
        {WORLDS_CSS}
      </style>
      <div className="wd-head">
        <h1 className="wd-title">{t('nav.worlds')}</h1>
        {/* WHO LIVES IN THEM, criterion M52. The embassy belongs under World, so this is the way
            to it, and it is beside the title rather than in the rail
            because it is the second question a reader asks after the first one. */}
        <RouteLink to={pathFor('embassy')} className="wd-embassy">
          {t('dev.worlds.embassy')}
        </RouteLink>
      </div>
      {state.status === 'loading' ? <Loading what={t('dev.worlds.theWorlds')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheOffice
          office={state.value.office}
          visits={state.value.who.visits}
          trusts={state.value.trusts}
          onReadAgain={readAgain}
        />
      ) : null}
    </div>
  )
}

/** Where the list came from, in the words a reader needs and never as a bare stored token. */
const WHERE_THE_LIST_CAME_FROM: Readonly<Record<WhatTheOfficeSays['from'], WordKey>> = {
  'the office': 'dev.worlds.office',
  'the mirror': 'dev.worlds.mirror',
  'this world alone': 'dev.worlds.alone',
}

/**
 * The office, drawn.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER. The page above fetches; this takes the two lists
 * it fetched and is a pure function of them, which is the half a test can hold still.
 */
export function TheOffice({
  office,
  visits,
  trusts,
  onReadAgain,
}: {
  office: WhatTheOfficeSays
  visits: Visit[]
  /**
   * THE MACHINES THIS OFFICE TRUSTS, criterion P73, or null because nothing handed them over.
   *
   * Null means a caller drew this page without asking for them — a test holding the worlds still —
   * and the panel is not drawn at all. An empty list is a different answer, and it IS drawn: the
   * office trusts nobody, which is something a reader has to be told.
   */
  trusts: WhatTheOfficeTrusts | null
  onReadAgain: () => void
}) {
  const [showEphemeral, setShowEphemeral] = useState(false)
  const trip = useSyncExternalStore(subscribeToTheVisit, theVisitThisPageHolds, theVisitThisPageHolds)
  const ephemeral = office.worlds.filter((one) => isEphemeral(one.kind))
  const shown = showEphemeral ? office.worlds : office.worlds.filter((one) => !isEphemeral(one.kind))
  const alive = shown.filter((one) => one.diedAt === null)
  const gone = shown.filter((one) => one.diedAt !== null)

  return (
    <>
      <p className="wd-source">
        <span className="wd-key">{t('dev.worlds.readFrom')}</span> {t(WHERE_THE_LIST_CAME_FROM[office.from])}
        {office.mirrorWrittenAt === null ? null : (
          <>
            <span className="wd-key">{t('dev.worlds.written')}</span> {office.mirrorWrittenAt}
          </>
        )}
        <button type="button" className="wd-again" onClick={onReadAgain}>{t('dev.worlds.readAgain')}</button>
      </p>
      {/*
        WHY THE LIST IS SHORT, WHEN IT IS. "this world alone" on its own leaves a reader to guess
        between a main world that is down, a copy that was never written, and a world that may read
        no copy at all. The server says which; this draws it rather than making the reader ask.
      */}
      {office.from === 'this world alone' ? <p className="wd-source-why">{saidOnThePage(office.mirrorNoteSaid, office.mirrorNote)}</p> : null}
      {/*
        A COPY OF THE MAIN WORLD'S DATABASE IS NOT A SECOND WORLD, and this is where somebody who
        started one finds out. A world is a database, and a database's identity is its path and its
        birthtime, so a copy is a different world — but it carries the original's rows, home row
        included, so it opens believing it is the office and lists worlds none of which is itself.
        The owner met this on 4 September: their copy could not serve, and they had to use an empty
        database instead with nothing on any screen saying why.
      */}
      {office.theHomeRowBelongsTo === null ? null : (
        <p className="wd-copy" role="status">
          <span className="wd-copy-short">{t('dev.worlds.thisDatabaseIsACopyOfThe')}</span>
          <span className="wd-copy-said">
            {t('dev.worlds.copyWarning', { home: office.theHomeRowBelongsTo, current: office.thisWorld ?? t('dev.worlds.unknownDatabase') })}
          </span>
        </p>
      )}

      <Panel titleIs="label" declares={{ surface: 'worlds.open' }} title={t('dev.worlds.openNow')}>
        {alive.length === 0 ? (
          <p className="wd-none">{t('dev.worlds.noWorldIsOpen')}</p>
        ) : (
          <ul className="wd-list">
            {alive.map((one) => (
              <WorldRow key={one.id} world={one} visiting={trip?.worldId === one.id} away={trip !== null} onDone={onReadAgain} />
            ))}
          </ul>
        )}
        {/* A BUTTON AND NOT A TICK BOX. A page being read draws no field standing open on it — that
            is the rule tests/read-before-edit.test.ts holds every page to — and a tick box is a
            field. What this does is change what is drawn, which is what a button is for. */}
        {ephemeral.length === 0 ? null : (
          <button
            type="button"
            className="wd-show"
            aria-pressed={showEphemeral}
            onClick={() => {
              setShowEphemeral(!showEphemeral)
            }}
          >
            {t(showEphemeral ? 'dev.worlds.hideTests' : 'dev.worlds.showTests', { n: ephemeral.length })}</button>
        )}
      </Panel>

      {/* THE MACHINES THIS OFFICE TRUSTS, criterion P73. The secretary decided the list belongs here rather
          than in Settings: the machines this office trusts belong to the installation and not to a
          person's preferences, and Settings shows the same rows read-only with a link back. */}
      {trusts === null ? null : (
        <Panel titleIs="label" declares={{ surface: 'worlds.trusted' }} title={t('dev.worlds.machinesThisOfficeTrusts')}>
          <TrustedMachines said={trusts} presses onChanged={onReadAgain} />
        </Panel>
      )}

      <Panel titleIs="label" declares={{ surface: 'worlds.visitors' }} title={t('dev.worlds.awayFromHome')}>
        {/* ORDINARY EMPTINESS IS THE SHORT MARK, WITH THE SENTENCE ON HOVER. */}
        {visits.length === 0 ? (
          <p className="wd-none"><Absence tier="ordinary" title={t('dev.worlds.nobodyIsWorkingAwayFromHome')} /></p>
        ) : (
          <ul className="wd-visits">
            {visits.map((one) => (
              <li key={one.id} className="wd-visit">
                <span className="wd-who">{whoIs(one.visitor)}</span>
                <span className="wd-why">{one.why}</span>
                <span className="wd-hops">
                  <span className="wd-key">{t('dev.worlds.from')}</span>
                  {one.fromWorld}
                  <span className="wd-key">{t('dev.worlds.in')}</span>
                  {one.toWorld}
                </span>
                <span className="wd-since">
                  <span className="wd-key">{t('dev.worlds.since')}</span>
                  {one.since}
                  {one.registeredLate ? <span className="wd-late">{t('dev.worlds.registeredLate')}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'worlds.gone' }} title={t('dev.worlds.ended')}>
        {gone.length === 0 ? (
          <p className="wd-none"><Absence tier="ordinary" title={t('dev.worlds.noWorldHasEnded')} /></p>
        ) : (
          <ul className="wd-list">
            {gone.map((one) => (
              <WorldRow key={one.id} world={one} visiting={false} away={trip !== null} onDone={onReadAgain} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

function WorldRow({
  world,
  visiting,
  away,
  onDone,
}: {
  world: World
  visiting: boolean
  /** Whether this page is on a trip at all, which is what makes coming home a thing to offer. */
  away: boolean
  onDone: () => void
}) {
  /**
   * WHETHER THIS ROW IS THE WORLD THIS PAGE CALLS HOME.
   *
   * The world the page first opened against, which is what "home" means to a page — not the world
   * whose kind is `home`. A person reading a scratch stack's Worlds page is at home in that stack.
   */
  const isHome = world.databaseIdentity === theWorldThisPageCallsHome()
  /**
   * WHAT THIS WORLD IS FOR, and whether it is a world kept up for somebody to look at. Criterion
   * P87 records the sentence; criterion C32 draws a world started with `--show-to-the-person` as up
   * for the person. A purpose is only ever written by the tool that started the world for somebody, so its
   * presence IS the mark; a world whose starter said nothing says that, which is the fifth invariant.
   */
  const purpose = typeof world.purpose === 'string' && world.purpose.trim() !== '' ? world.purpose.trim() : null
  const upForThem = world.diedAt === null && purpose !== null
  const [stopSaid, setStopSaid] = useState<string | null>(null)
  /**
   * WHICH OF THIS WORLD'S ADDRESSES THIS PAGE WOULD USE, and whether it reaches at all.
   *
   * A world binds loopback always and a second door when it declares one. A page reached the office
   * somehow, and that is what decides: loopback for a page on the computer the worlds run on, the
   * other door for a page that came from another machine. From such a machine,
   * Enter answered "Failed to fetch", because the office knew only 127.0.0.1. Problem
   * `5mG-KxUAXObJ`.
   */
  const reaching = theAddressToReachAWorldBy(world, thisPageIsOn())
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState(world.name)
  const [refused, setRefused] = useState<string | null>(null)

  return (
    <li className="wd-world" data-kind={world.kind} data-ended={world.diedAt === null ? '0' : '1'}>
      <div className="wd-head">
        {naming ? (
          <form
            className="wd-rename"
            onSubmit={(event) => {
              event.preventDefault()
              void api
                .renameWorld(world.id, name)
                .then(() => {
                  setNaming(false)
                  setRefused(null)
                  onDone()
                })
                .catch((err: unknown) => {
                  setRefused(err instanceof Error ? err.message : String(err))
                })
            }}
          >
            <input
              className="wd-name-box"
              value={name}
              aria-label={t('dev.worlds.theNameOfThisWorld')}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            <button type="submit" className="wd-do">{t('dev.worlds.save')}</button>
            <button
              type="button"
              className="wd-do"
              onClick={() => {
                setNaming(false)
                setName(world.name)
                setRefused(null)
              }}
            >{t('dev.worlds.cancel')}</button>
          </form>
        ) : (
          <>
            <span className="wd-name">{world.name}</span>
            <button
              type="button"
              className="wd-do"
              onClick={() => {
                setNaming(true)
              }}
            >{t('dev.worlds.rename')}</button>
          </>
        )}
        {upForThem ? <span className="wd-for-the-person">{t('dev.worlds.upForYou')}</span> : null}
        {world.diedAt !== null || world.address === null ? null : visiting ? (
          <span className="wd-here">{t('dev.worlds.youAreHere')}</span>
        ) : isHome && !away ? (
          // NOWHERE TO GO. At home, the home world's row is where the reader already is.
          <span className="wd-here">{t('dev.worlds.youAreHere')}</span>
        ) : isHome ? (
          /*
           * THE HOME WORLD'S ROW IS NEVER A VISIT, AND COMING HOME IS NEVER REFUSED.
           *
           * A person registered at the embassy must be able to enter any world, their own home world
           * included, and going back home failed. Pressing
           * Enter on their own world's row went through the visit door, which refuses a visit to the
           * world you live in — by name, and rightly, because that is what a visit is. Measured in a
           * browser: `The world 3c3134816c25a059 is where this citizen lives, so there is nothing to
           * register.` 400, the trip unchanged, and no way out of that row. Problem `MvsNyqPIFIvt`.
           *
           * SO IT IS THE SAME ACT AS RETURN HOME, and it asks no door:
           * the trip ends and the page points home. `returnHome` cannot refuse — it ends the visit
           * at the world being left if that world answers, and comes home either way.
           *
           * AT HOME IT SAYS "YOU ARE HERE" and offers nothing, for the same reason: there is
           * nowhere to go. Before this it offered Enter, and pressing it was refused in the same
           * words.
           */
          <button
            type="button"
            className="wd-enter"
            onClick={() => {
              void api.returnHome().then(() => {
                window.location.reload()
              })
            }}
          >{t('dev.worlds.returnHome')}</button>
        ) : (
          <button
            type="button"
            className="wd-enter"
            onClick={() => {
              const stillHere = stillOnThisPage()
              void api
                .enterAWorld(
                  {
                    id: world.id,
                    name: world.name,
                    databaseIdentity: world.databaseIdentity,
                    address: reaching.address ?? '',
                    head: world.head,
                  },
                  `looking at ${world.name} from the office`,
                )
                .then(() => {
                  /**
                   * A WORLD STARTED FOR THE PERSON OPENS ON ITS OWN PAGE. Criterion C33. Entering makes the
                   * trip and reloads; a world kept up for them lands on the page that says what it is
                   * for and that it is a copy, rather than on a home page that looks like their office.
                   */
                  if (upForThem && stillHere()) window.location.hash = pathFor('worldhere')
                  window.location.reload()
                })
                .catch((err: unknown) => {
                  setRefused(err instanceof Error ? err.message : String(err))
                })
            }}
          >{t('dev.worlds.enter')}</button>
        )}
        {/* THE PRESS THAT STOPS IT. Criterion C32. A world kept up for the person had an Enter and no way
            to end it from the page; the press stops the processes the office recorded for the world
            through the one release door, which names what it would end, and marks the row ended. */}
        {upForThem ? (
          <TieredPress tier="confirm"
            press={t('dev.worlds.stop')} pending={t('dev.worlds.stopping')}
            question={t('dev.worlds.stopQuestion')} quote={world.name}
            warning={t('dev.worlds.stopWarning')} cancel={t('dev.worlds.cancel')}
            onPress={async () => {
              setStopSaid(null)
              setRefused(null)
              const said = await api.stopWorld(world.id, 'you pressed Stop on the Worlds page')
              setStopSaid(t(said.couldNotStop.length === 0 ? 'dev.worlds.stopped' : 'dev.worlds.partlyStopped', { n: said.couldNotStop.length }))
              onDone()
            }}
          />
        ) : null}
      </div>
      {upForThem || purpose !== null ? (
        <p className="wd-purpose">
          <span className="wd-key">{t('dev.worlds.whatToLookAt')}</span>
          {purpose ?? t('dev.worlds.noPurpose')}
        </p>
      ) : null}
      {stopSaid === null ? null : <p className="wd-stopped">{stopSaid}</p>}
      {refused === null ? null : <p className="wd-refused">{refused}</p>}
      <dl className="wd-facts">
        <dt>{t('dev.worlds.whatItIs')}</dt>
        <dd>
          {worldKindWord(world.kind).text}
          <span className="wd-sep">·</span>
          {worldStandingWord(world.standing).text}
        </dd>
        <dt>{t('dev.worlds.database')}</dt>
        <dd className="wd-mono">{world.databaseIdentity}</dd>
        <dt>{t('dev.worlds.address')}</dt>
        <dd className="wd-mono">{reaching.address ?? t('dev.worlds.notRecorded')}</dd>
        {reaching.reachable ? null : (
          <>
            <dt>{t('dev.worlds.fromHere')}</dt>
            {/* NEVER A REFUSAL, ALWAYS A SENTENCE. The control stays: a world worth trying is worth
                trying, and this is what says beforehand why it may not answer. */}
            <dd className="wd-unreachable">{reaching.why}</dd>
          </>
        )}
        <dt>{t('dev.worlds.checkout')}</dt>
        <dd className="wd-mono">{world.checkout ?? t('dev.worlds.notRecorded')}</dd>
        <dt>{t('dev.worlds.commit')}</dt>
        <dd className="wd-mono">{world.head ?? t('dev.worlds.notRecorded')}</dd>
        <dt>{t('dev.worlds.startedBy')}</dt>
        <dd>
          {world.startedBy === null
            ? t('dev.worlds.notRecorded')
            : whoIs(world.startedBy)}
        </dd>
        <dt>{t('dev.worlds.born')}</dt>
        <dd>{world.bornAt}</dd>
        {world.diedAt === null ? null : (
          <>
            <dt>{t('dev.worlds.ended2')}</dt>
            <dd>
              {world.diedAt}
              <span className="wd-sep">·</span>
              {world.diedBecause ?? t('dev.worlds.noReason')}
            </dd>
          </>
        )}
        <dt>{t('dev.worlds.installation')}</dt>
        <dd className="wd-mono">{world.installation}</dd>
      </dl>
    </li>
  )
}

/** A person or an agent, with its id, in the page's language. The id is content. */
function whoIs(who: ParticipantRef): string {
  return t(who.kind === 'person' ? 'devWords.worlds.who.person' : 'devWords.worlds.who.agent', { id: content(who.id) })
}

const WORLDS_CSS = `
.wd-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }

/* A PRESS TO A PLACE, drawn like the ways out of the not-found page: this is a destination and not
   an action, and the rail does not carry it because it belongs under World. */
.wd-embassy {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.wd-embassy:hover { background: var(--hover); }

.wd-title { font-size: var(--fs-5); line-height: var(--lh-tight); margin: 0 0 var(--gut); }
.wd-source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 var(--gut);
  font-size: var(--fs-1);
  color: var(--text-2);
}
.wd-copy { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--gut); padding: 8px var(--pad); color: var(--st-failed); background: var(--st-failed-bg); border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm); }
.wd-copy-short { font-weight: var(--st-failed-weight); }
.wd-copy-said { font-size: var(--fs-1); line-height: var(--lh-read); overflow-wrap: anywhere; }
.wd-unreachable { color: var(--st-failed); overflow-wrap: anywhere; }
.wd-source-why { margin: -6px 0 14px; color: var(--text-2); font-size: 12px; max-width: 78ch; overflow-wrap: anywhere; }
.wd-key { color: var(--text-3); }
.wd-again, .wd-do, .wd-enter {
  min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.wd-again { margin-left: auto; }
.wd-do:hover, .wd-enter:hover, .wd-again:hover { background: var(--hover); }
.wd-list, .wd-visits { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--gut); }
.wd-world {
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  padding: var(--pad-lg);
  background: var(--panel);
}
.wd-world[data-ended='1'] { background: var(--panel-2); }
.wd-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-bottom: var(--pad); }
.wd-name { font-size: var(--fs-3); font-weight: 600; }
.wd-here { margin-left: auto; font-size: var(--fs-1); color: var(--text-3); }
/* A WORLD KEPT UP FOR THE PERSON. Criterion C32. Weight in proportion to whether somebody must act: it is
   a state a reader has to notice, so it is a chip rather than a line of small print. */
.wd-for-the-person {
  padding: 2px 8px;
  border: var(--border-w) solid var(--st-inferred-line, var(--border-strong));
  border-radius: 999px;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--st-inferred);
  background: var(--st-inferred-bg, var(--panel-2));
}
.wd-stop {
  min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--st-failed-line, var(--border-strong));
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--st-failed);
  font: inherit;
  cursor: pointer;
}
.wd-stop:hover { background: var(--hover); }
.wd-purpose { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 var(--pad); font-size: var(--fs-1); overflow-wrap: anywhere; }
.wd-stopped { margin: 0 0 var(--pad); color: var(--text-2); font-size: var(--fs-1); }
.wd-enter { margin-left: auto; }
.wd-rename { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.wd-name-box {
  min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  min-width: 12ch;
}
.wd-refused { margin: 0 0 var(--pad); color: var(--st-failed); font-size: var(--fs-1); }
.wd-facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px var(--pad-lg);
  margin: 0;
  font-size: var(--fs-1);
}
.wd-facts dt { color: var(--text-3); }
.wd-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.wd-mono { font-family: var(--font-mono); }
.wd-sep { margin: 0 6px; color: var(--text-3); }
.wd-none { margin: 0; color: var(--text-3); font-size: var(--fs-1); }
.wd-show {
  margin-top: var(--gut);
  min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  font-size: var(--fs-1);
  cursor: pointer;
}
.wd-show:hover { background: var(--hover); }
.wd-show[aria-pressed='true'] { background: var(--panel-3); }
.wd-visit {
  display: grid;
  gap: 4px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  padding: var(--pad);
  font-size: var(--fs-1);
}
.wd-who { font-weight: 600; }
.wd-why { color: var(--text-2); overflow-wrap: anywhere; }
.wd-hops, .wd-since { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--text-3); font-family: var(--font-mono); }
.wd-late { font-family: var(--font-ui); color: var(--st-inferred); }
@media (max-width: 40rem) {
  .wd-facts { grid-template-columns: minmax(0, 1fr); }
  .wd-facts dt { margin-top: 6px; }
}
`
