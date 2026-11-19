// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { TieredPress } from '../components/TieredPress.tsx'
import { t, type WordKey } from '@shared/i18n.ts'
/**
 * THIS WORLD: WHAT IT IS FOR, SCREEN BY SCREEN, AND THAT IT IS A COPY. Criterion C33.
 *
 * Entering a world left it unclear what the world asked of a person. A world is a
 * copy of the person's corpus taken when it started. A handback report filed on the live office afterwards is
 * not in the copy, and nothing in the world said so — the person opened a world, looked for a report, and
 * could not find one. This page says what they are being asked to look at, that the world is a copy
 * taken at a stated time, and that records filed after that live on the person's own office.
 *
 * IT IS THE PAGE ENTERING A WORLD OPENS ON. The Worlds page presses through to here after a trip is
 * registered, so a person who has just entered a world is told what it is instead of landing on a
 * home page that looks like their own office.
 *
 * THE SENTENCES COME FROM src/shared/worldcopy.ts so the page and the test that holds it to the
 * truth cannot drift. The faces sentence in particular is the measured behaviour of a copied world,
 * not a comforting guess.
 *
 * THE WORLD IS READ, NEVER GUESSED. `GET /api/office/worlds` answers with the row for the database
 * this page is pointed at; if no row names it, the page says that rather than drawing the office's
 * facts under the world's name.
 */

import { useState } from 'react'
import { api, type WhatTheOfficeSays } from '../api.ts'
import { ErrorNote, Loading, Panel, useAsync } from '../components/ui.tsx'
import { pathFor, RouteLink } from '../components/router.tsx'
import {
  theFacesSentence,
  recordsAfterTheCopyLiveOnTheirOfficeSentence,
  theWorldIsACopyTakenAtSentence,
  theHandbackThisWorldBelongsToSentence,
  theOfficeAddressACopyCarries,
} from '@shared/worldcopy.ts'
const SCREEN_WORDS = { records: 'dev.worldhere.records', worlds: 'dev.worlds.worlds', embassy: 'dev.worlds.embassy', runtime: 'dev.runtime.whatIsRunning' } as const satisfies Record<(typeof SCREENS)[number], WordKey>

/** The screens a person is pointed at in a world kept for them, with the press that opens each. */
const SCREENS = ['records', 'worlds', 'embassy', 'runtime'] as const

export function WorldHerePage() {
  const [state, readAgain] = useAsync(async () => await api.worlds(), [])
  return (
    <div className="page wh">
      <style href="mole-office-world-here-page" precedence="default">
        {WORLD_HERE_CSS}
      </style>
      <h1 className="wh-title">{t('dev.worldhere.thisWorld')}</h1>
      {state.status === 'loading' ? <Loading what={t('dev.worldhere.thisWorld2')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheWorldItself office={state.value} onChanged={readAgain} /> : null}
    </div>
  )
}

/** The page, from the office's answer, as a pure function of it so a test can hold it still. */
export function TheWorldItself({ office, onChanged }: { office: WhatTheOfficeSays; onChanged: () => void }) {
  const world = office.worlds.find((one) => one.databaseIdentity === office.thisWorld) ?? null
  /**
   * THE OFFICE IS NOT A COPY OF ANYTHING. A person reading this page at the office has nothing
   * missing and nothing to be told about a copy; saying a copy sentence here would be false.
   *
   * A COPY MADE SOME OTHER WAY THAN BY tools/isolated-mole-office.mjs CARRIES THE ORIGINAL'S HOME
   * ROW, so `isTheOffice` is true inside it. `theHomeRowBelongsTo` is the reading that tells the two
   * apart, and it is non-null exactly when the home row here is about another database — which is a
   * copy. A copy that tool makes carries no home row, so `isTheOffice` is false there.
   */
  if (world === null || (office.isTheOffice && office.theHomeRowBelongsTo === null)) {
    return (
      <>
        <p className="wh-lead">
          {world === null
            ? t('dev.worldhere.noRow', { database: office.thisWorld ?? t('dev.worlds.unknownDatabase') })
            : t('dev.worldhere.office')}{t('dev.worldhere.everyWorldButTheOfficeIsA')}</p>
      </>
    )
  }
  return (
    <AWorldThatIsACopy
      world={world}
      officeAddress={theOfficeAddressACopyCarries(office.worlds, office.theHomeRowBelongsTo)}
      onChanged={onChanged}
    />
  )
}

function AWorldThatIsACopy({
  world,
  officeAddress,
  onChanged,
}: {
  world: NonNullable<WhatTheOfficeSays['worlds'][number]>
  /** The office this copy came from, or null because its home row carried no address. */
  officeAddress: string | null
  onChanged: () => void
}) {
  const [stopped, setStopped] = useState<string | null>(null)
  const purpose = typeof world.purpose === 'string' && world.purpose.trim() !== '' ? world.purpose.trim() : null
  const ended = world.diedAt
  return (
    <>
      <Panel titleIs="label" declares={{ surface: 'world.here' }} title={t('dev.worldhere.whatToLookAt')}>
        <p className="wh-purpose">{purpose ?? t('dev.worldhere.noPurpose')}</p>
        <ul className="wh-screens">
          {SCREENS.map((name) => (
            <li key={name} className="wh-screen">
              <RouteLink to={pathFor(name)} className="wh-screen-open">
                {t(SCREEN_WORDS[name])}
              </RouteLink>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'world.copy' }} title={t('dev.worldhere.aboutThisCopy')}>
        <p className="wh-copy">{theWorldIsACopyTakenAtSentence(world)}</p>
        <p className="wh-records">{recordsAfterTheCopyLiveOnTheirOfficeSentence(world.bornAt)}</p>
        <p className="wh-handback">{theHandbackThisWorldBelongsToSentence(world, officeAddress)}</p>
        <p className="wh-faces">{theFacesSentence()}</p>
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'world.stop' }} title={t('dev.worldhere.whenYouHaveSeenEnough')}>
        {ended !== null ? (
          <p className="wh-ended">{t('dev.worldhere.ended', { at: ended })}
            {world.diedBecause === null || world.diedBecause === undefined ? '.' : `: ${world.diedBecause}`}
          </p>
        ) : (
          <>
            <TieredPress tier="confirm"
              press={t('dev.worldhere.stop')} pending={t('dev.worlds.stopping')}
              question={t('dev.worlds.stopQuestion')} quote={world.name}
              warning={t('dev.worlds.stopWarning')} cancel={t('dev.worlds.cancel')}
              onPress={async () => {
                const said = await api.stopWorld(world.id, 'you pressed Stop on this world’s own page')
                setStopped(t(said.couldNotStop.length === 0 ? 'dev.worlds.stopped' : 'dev.worlds.partlyStopped', { n: said.couldNotStop.length }))
                onChanged()
              }}
            />
            <p className="wh-stop-why">{t('dev.worldhere.stoppingEndsTheProcessesTheOfficeRecorded')}</p>
          </>
        )}
        {stopped === null ? null : <p className="wh-stopped">{stopped}</p>}
      </Panel>
    </>
  )
}

const WORLD_HERE_CSS = `
.wh-title { font-size: var(--fs-5); line-height: var(--lh-tight); margin: 0 0 var(--gut); }
.wh-lead { margin: 0; color: var(--text-2); max-width: 78ch; }
.wh-handback { margin: 0 0 var(--pad); font-size: var(--fs-2); line-height: var(--lh-read); overflow-wrap: anywhere; }
.wh-purpose { margin: 0 0 var(--pad); font-size: var(--fs-2); line-height: var(--lh-read); overflow-wrap: anywhere; }
.wh-screens { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.wh-screen-open {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  text-decoration: none;
}
.wh-screen-open:hover { background: var(--hover); }
.wh-copy, .wh-records { margin: 0 0 6px; overflow-wrap: anywhere; }
.wh-faces { margin: 0; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-read); max-width: 78ch; }
.wh-stop {
  min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.wh-stop:hover { background: var(--hover); }
.wh-stop-why { margin: 6px 0 0; color: var(--text-2); font-size: var(--fs-1); max-width: 78ch; }
.wh-ended { margin: 0; color: var(--text-2); }
.wh-stopped { margin: 6px 0 0; color: var(--text); }
.wh-refused { margin: 6px 0 0; color: var(--st-failed); font-size: var(--fs-1); }
`
