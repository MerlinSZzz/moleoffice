// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK, ON THE RUN'S OWN PAGE, IN SENTENCES A PERSON READS.
 *
 * Criterion C27 of design/rules/ACCEPTANCE.md, and problem `r0vUx5VGffP2`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PANEL AND NOT A FIELD
 * ---------------------------------------------------------------------------------------
 *
 * Everything the office knows about a check is already stored on the run: `theCheck` says which
 * inspector was asked and when, `whatTheCheckWouldRead` says what one assembly measured,
 * `released`, `refused` and `confirmed` say what happened next. All five are OBJECTS, and the
 * record page draws an object only behind the Inspect switch — `drawableAsWords` in
 * src/shared/sections.ts refuses anything that is not a scalar, a word from a list, or an array of
 * scalars. That rule is right: a JSON blob in the body of a page is not something a person reads.
 *
 * So a person opening a run saw nothing at all about its check. Not a summary, not a verdict, not
 * the group a refusal opened. The API had answered all of it since 7 September and no page drew it.
 * The fix is this panel: the same five fields, written out as sentences.
 *
 * ---------------------------------------------------------------------------------------
 * IT WORKS NOTHING OUT OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * `howARunStands` in src/shared/releasing.ts is the same reader the server runs to answer
 * GET /api/checks/<run>. This panel calls it and draws what it says. A second reading here would be
 * a second answer to *what does a refusal mean*, which is this repository's ninth invariant.
 *
 * WHAT IS DRAWN AND WHAT IS NOT. Where a field is absent the panel says which kind of absence it is
 * — nobody has assembled a check, no inspector is appointed, the check did not say which tree it
 * read — because *nothing is there* and *nobody has looked* are different facts and this product
 * refuses to let them read the same.
 */

import { useState } from 'react'
import type { PanelRecord } from '@shared/types.ts'
import { isRung, type Rung } from '@shared/detail.ts'
import { cardWord } from '@shared/card-words.ts'
import { content, t, type Say, type WordKey } from '@shared/i18n.ts'
import { THE_INSPECTOR, THE_SECRETARY } from '@shared/roles.ts'
import {
  andHowItLanded,
  closedUncheckedSays,
  confirmedNotChecked,
  endedWithItsMergeEntrySays,
  howARunStands,
  nameIn,
  needsNoCheckSays,
  STANDING_WITHOUT_A_CHECK_WORD_KEYS,
  STANDING_WORD_KEYS,
  theBasisNamed,
  theReviewLevelAsked,
  whatTheRunWaitsFor,
  whyNoCheckWasStartedIn,
  whyTheCheckFailedIn,
  workerRoundStanding,
  type Confirmation,
  type NameOf,
  type Refusal,
  type Release,
  type ReportConfirmation,
  type RunStanding,
  type WhatWasRead,
} from '@shared/releasing.ts'
import { beforeTheSealSays, readRemindedBeforeTheSeal, REMINDED_BEFORE_THE_SEAL } from '@shared/before-the-seal.ts'
import { api, errorMessage, type ParticipantsReply } from '../api.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { stampToTheMinute } from '../lib/minute.ts'
import { useInspect } from '../lib/mode.ts'
import { Absence, Btn, Panel, ServerNote, type PanelProps } from './ui.tsx'
import { recordPath } from './router.tsx'

const CHAPTER_LEVEL_WORDS: Readonly<Record<Rung, WordKey>> = {
  label: 'chk.chapterLevel.label',
  title: 'chk.chapterLevel.title',
  gist: 'chk.chapterLevel.gist',
  outline: 'chk.chapterLevel.outline',
  sketch: 'chk.chapterLevel.sketch',
  digest: 'chk.chapterLevel.digest',
  full: 'chk.chapterLevel.full',
}

/** The level word for one chapter written out further, in the page's language. Criterion C29. */
function chapterAtLevel(chapter: number, level: string): string {
  const said = isRung(level) ? t(CHAPTER_LEVEL_WORDS[level]) : content(level)
  return t('chk.chapterAt', { chapter, level: said })
}

/** The review level's own name, in the page's language. Never `@shared/workspaces.ts`'s English map:
 * that list is not translated, and drawing it here would say the same fact in English on a Chinese
 * page while every other sentence on this panel reads in the reader's own language. */
function reviewLevelWord(level: 'none' | 'light'): string {
  return level === 'light' ? t('chk.reviewLevel.light') : t('chk.reviewLevel.none')
}

/**
 * THE WORD FOR A STATIC STANDING, IN THE PAGE'S LANGUAGE. Since November 2026, as decided, the fixed
 * sentence that went with it is not drawn: it stays in the API.
 *
 * `RUN_STANDING` and `STANDING_WITHOUT_A_CHECK` in `@shared/releasing.ts` are outside this piece's
 * files, and every word they hold is fixed English text with nothing dynamic in it — no id, no
 * date, no name. So this table only borrows the STANDING as a key and substitutes this piece's own
 * translated word for it; it never reads `.word` off the shared constant. The sentences a refusal, a supersession or a merge-queue close compose (`theBasisNamed`, `confirmedNotChecked`,
 * `endedWithItsMergeEntrySays`, `needsNoCheckSays`, `supersededSays`) stitch in a run's own facts,
 * and reproducing their wording here would be a second account of what those facts mean — the
 * file's own rule, stated at the top of it. Those stay in the shared module's English. A confirmation's
 * full sentence also carries its seal's path and commit, so only developer mode draws it; normal mode
 * uses the translated standing here and explains the accepted work in WhatTreeItRead.
 *
 * SINCE WAVE 13K ROUND 28 THE STANDING PARAGRAPH'S OWN COMPOSED SENTENCES ARE NOT REPRODUCED HERE EITHER:
 * they are asked of the shared composers with this page's reader, `t`. `closedUncheckedSays`,
 * `andHowItLanded`, `endedWithItsMergeEntrySays`, `needsNoCheckSays`, `confirmedNotChecked` and
 * `whatTheRunWaitsFor` each take a `say`, the way `broadcastLines` does, and the server hands them the
 * English reader. So the wording still lives once, in the shared module and the word lists, and a Chinese
 * page reads it in Chinese. A failed check's sentence and the refusal that no check could start are stored
 * on the run in English; `whyTheCheckFailedIn` and `whyNoCheckWasStartedIn` say them again in this page's
 * language only where the run stores the facts they were made from and those facts make the stored English
 * again exactly, and otherwise hand back the stored English, which is then drawn as the server wrote it.
 * `theBasisNamed` and `supersededSays` are not in the standing paragraph and are unchanged.
 */
function standingWordOf(standing: RunStanding): string {
  return t(STANDING_WORD_KEYS[standing].word)
}
function standingWithoutCheckWordOf(standing: 'inspecting' | 'closed'): string {
  return t(STANDING_WITHOUT_A_CHECK_WORD_KEYS[standing].word)
}

// ============================================================================ what is on the run

/** What one assembly of the check prompt measured, as the run stores it. */
interface WouldRead {
  at?: string
  bytes?: number
  wholeCodeBytes?: number
  chaptersAt?: { chapter: number; level: string; bytes: number }[]
  inside?: string[]
  outside?: string[]
  base?: { ref: string; how: string; says: string }
  read?: WhatWasRead
  execution?: { model: string; minutes: number }
  /** Which way the plugin rule went. Absent on a files seal and before the rule. */
  pluginRule?: { plugin?: { id: string; manifest: boolean }; read: boolean; says: string }
  says?: string
}

/** What the office did when the run said its work was finished, as the run stores it. */
interface AskedFor {
  execution?: { session: string; log: string; model: string; minutes: number; endedAt?: string; failed?: string }
  askedAt?: string
  askedOf?: string
  message?: string
  checkout?: { directory?: string; cutFrom?: string }
  /** The project's review level when the office asked. Absent on a run that finished before it existed. */
  reviewLevel?: string
  says?: string
}

function objectAt(data: PanelRecord['data'], key: string): Record<string, unknown> | null {
  const held = data[key]
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  return held as Record<string, unknown>
}

// ============================================================================ the panel

/**
 * THE PANEL. It draws nothing on a run nobody has finished and nobody has checked.
 *
 * That is deliberate and it is the rule the panels around it follow: a permanent empty box on every
 * session record in the corpus would be furniture, and furniture stops being read — which would
 * cost the panel its meaning on the runs that have something to say.
 */
export function TheCheckOnARun({
  record,
  participants,
  reportConfirmation,
  onChanged,
  titleIs,
}: {
  record: PanelRecord
  /**
   * The registries the page already read, so a stored agent is named by the handle on its row. Since
   * criterion I1 a new agent's stored id is not its handle. Without them, or where no row has that
   * id, the stored id is shown as it is.
   */
  participants?: ParticipantsReply
  reportConfirmation?: ReportConfirmation | undefined
  /** Called after the confirmation is written, so the page reloads what it now says. */
  onChanged?: () => void
  titleIs?: PanelProps['titleIs']
}) {
  const inspect = useInspect()
  const data = record.data
  // THE STORED REF IS READ THE WAY THE SERVER READS ONE (wave rule 2): the agent with that exact id,
  // else the one agent bearing that string as its handle, else nobody, and then the stored string is
  // shown as it is. Two agents bearing the handle is nobody, never a guess between them.
  const nameOf: NameOf = (who) => {
    if (who.kind !== 'agent' || participants === undefined) return null
    const byId = participants.agents.find((one) => one.id === who.id)
    if (byId !== undefined) return byId.handle
    const byHandle = participants.agents.filter((one) => one.handle === who.id)
    return byHandle.length === 1 ? byHandle[0]!.handle : null
  }
  const stands = howARunStands(data, nameOf, reportConfirmation)
  const roundStanding = workerRoundStanding(data, stands.standing, t)
  const asked = objectAt(data, 'theCheck') as AskedFor | null
  const wouldRead = objectAt(data, 'whatTheCheckWouldRead') as WouldRead | null

  // WHAT THE REMINDER BEFORE THE SEAL DID, in one line composed in @shared/before-the-seal.ts. Null on a run not yet sealed
  // that was not reminded; a sealed run with nothing kept says nobody recorded it.
  const beforeTheSeal = beforeTheSealSays(readRemindedBeforeTheSeal(data[REMINDED_BEFORE_THE_SEAL]), typeof data['sealedTip'] === 'string', t)

  if (stands.standing === 'working' && asked === null && wouldRead === null && beforeTheSeal === null) return null

  // BOTH ARE THE RUN'S STORED SENTENCES, said in this page's language where they can be (see the comment on
  // `STANDING_WORD_KEYS`); `composed` is false where the stored English is what is drawn.
  const failedSaid = whyTheCheckFailedIn(data, t)
  const noCheckSaid = whyNoCheckWasStartedIn(data, t)
  const failed = failedSaid?.says ?? null
  const noCheck = noCheckSaid?.says ?? null
  // WHETHER THIS PROJECT ASKED FOR AN INSPECTOR AT ALL, off the run's own record of what the office
  // did on the day. At `none` and `light` two of the five standings
  // read differently, because no check was started and none ever will be for this finish.
  const level = theReviewLevelAsked(data)
  const withoutACheck = level !== null && level !== 'full'
  // A CHECK-AGAIN RUN THE OFFICE ENDED WITH ITS MERGE ENTRY is closed, and nobody confirmed it, so the
  // closed sentence about a supervisor's confirmation would be false; it says its own sentence instead.
  // A RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY ENTRY is closed, and nobody checked or
  // confirmed it, so it says its own sentence too. The other parts of this panel are about a check the
  // office asks for, and their sentences would say one is still to come, so they are not drawn. A
  // later confirmation is read the ordinary way.
  const askedOfNobody = stands.needsNoCheck !== null && stands.standing === 'closed' && stands.confirmed === null && stands.endedWithItsMergeEntry === null
  // THE WORD IS ALWAYS THIS PIECE'S OWN TRANSLATION (`standingWordOf`/`standingWithoutCheckWordOf`).
  // WHERE THE SENTENCE WOULD BE ONE OF THE FIXED ONES `@shared/releasing.ts` DECLARES, NONE IS DRAWN.
  // WHEREVER IT IS A SENTENCE COMPOSED FROM THIS RUN'S OWN FACTS it is that module's composer,
  // asked with this page's reader (`closedUncheckedSays` with `andHowItLanded`, which is what `stands.says`
  // is for such a run, `endedWithItsMergeEntrySays`, `needsNoCheckSays`, `confirmedNotChecked`) — see the
  // comment on `STANDING_WORD_KEYS` above.
  const standingWord: { word: string; sentence: string | null; serverWritten: boolean } = roundStanding !== null
    ? { word: roundStanding.word, sentence: null, serverWritten: false }
    : stands.closedUnchecked !== null
    ? { word: standingWordOf('closed unchecked'), sentence: andHowItLanded(closedUncheckedSays(stands.closedUnchecked, t, nameOf), stands.landedByHand, t, nameOf), serverWritten: false }
    : stands.endedWithItsMergeEntry !== null
    ? { word: standingWordOf('closed'), sentence: endedWithItsMergeEntrySays(stands.endedWithItsMergeEntry, t), serverWritten: false }
    : askedOfNobody && stands.needsNoCheck !== null
    ? { word: standingWordOf('closed'), sentence: needsNoCheckSays(stands.needsNoCheck, t), serverWritten: false }
    : withoutACheck && (stands.standing === 'inspecting' || stands.standing === 'closed')
      // The confirmation's standing also embeds its path and commit. The same decisions
      // apply here; normal mode explains the accepted work in WhatTreeItRead below.
      ? inspect && stands.standing === 'closed' && stands.confirmed !== null
        ? { word: standingWithoutCheckWordOf('closed'), sentence: confirmedNotChecked(stands.confirmed, t), serverWritten: false }
        : { word: standingWithoutCheckWordOf(stands.standing), sentence: null, serverWritten: false }
      : { word: standingWordOf(stands.standing), sentence: null, serverWritten: false }
  const word = roundStanding !== null ? standingWord : failedSaid !== null && failedSaid.says !== '' && stands.standing === 'inspecting'
    ? { word: t('chk.checkFailed'), sentence: failedSaid.says, serverWritten: !failedSaid.composed }
    : noCheckSaid === null || stands.standing !== 'inspecting'
      ? standingWord
      : { word: t('chk.checkNotStarted'), sentence: noCheckSaid.says, serverWritten: !noCheckSaid.composed }
  // WHAT THE RUN WAITS FOR is drawn only where it is a wait, not a stored refusal, and that wait is asked of
  // the shared composer with this page's reader. `stands.waitingFor` says whether there is one.
  //
  // A WAIT FOR A CHECK WITH NO INSPECTOR NAMED is said here as a short state, not the composer's sentence.
  // The reader swaps that one key for this page's word, so every other waiting line stays the composer's.
  const sayOnThisPage: Say = (key, values) => key === 'chk.says.waits.aCheck' ? t('chk.waitsNoInspectorWord') : t(key, values)
  const waiting = noCheck === null && failed === null && stands.waitingFor !== null ? whatTheRunWaitsFor(data, stands, sayOnThisPage, nameOf, reportConfirmation) : null
  // THE PRESS THAT CLOSES THE RUN, at the moment this project's level says it may be pressed. At
  // `full` that is after a release, which is `reporting`. At `none` and `light` no release is coming,
  // so the press belongs on the finish itself — and `confirmTheReport` is the door that agrees.
  const mayConfirm = stands.standing === 'reporting' || (withoutACheck && stands.standing === 'inspecting')
  return (
    <Panel declares={{ surface: null }} title={t('chk.panelTitle')} titleIs={titleIs} rank={stands.standing === 'rebuttal' ? 0 : 1} tone={stands.standing === 'rebuttal' ? 'blocked' : undefined}>
      <div className="chk">
        <WhereItStands
          standing={stands.standing}
          word={word.word}
          sentence={word.sentence}
          sentenceIsServerWritten={word.serverWritten}
          waiting={waiting}
        />
        {beforeTheSeal === null ? null : (
          <section className="chk-part" data-part="before-the-seal">
            <h3 className="chk-h">{t('w13j.beforeTheSeal.title')}</h3>
            <p className="chk-said">{beforeTheSeal}</p>
          </section>
        )}
        {stands.closedUnchecked === null ? null : <p className="chk-said">{t('chk.nothingOwed')}</p>}
        {askedOfNobody || stands.closedUnchecked !== null ? null : (
          <>
            {roundStanding !== null || (failed && stands.standing === 'inspecting') ? <AskAgain run={record.id} onChanged={onChanged} /> : null}
            {noCheckSaid === null ? <WhoWasAsked asked={asked} /> : stands.standing !== 'inspecting' ? <p className={noCheckSaid.composed ? 'chk-said' : 'chk-said chk-server'}>{noCheckSaid.says}</p> : null}
            {withoutACheck ? null : noCheck === null || wouldRead !== null ? <WhatItWouldRead read={wouldRead} /> : null}
            {withoutACheck ? null : noCheck === null || stands.refused !== null ? <TheVerdict released={stands.released} refused={stands.refused} nameOf={nameOf} /> : null}
            {noCheck === null || wouldRead?.read || stands.confirmed?.read ? <WhatTreeItRead released={stands.released} refused={stands.refused} confirmed={stands.confirmed} read={wouldRead?.read ?? null} /> : null}
            {mayConfirm ? <ConfirmIt run={record.id} onChanged={onChanged} /> : null}
          </>
        )}
      </div>
    </Panel>
  )
}

/**
 * Where the run stands, the name a person reads, and what it is waiting for. Criterion C29.
 *
 * THE SENTENCE AND `waiting` ARE COMPOSED FROM THIS RUN'S OWN FACTS, in `@shared/releasing.ts`
 * (`whatARunWaitsFor` and the sentence-builders named on `STANDING_WORD_KEYS` above), and the panel asks
 * those composers with the page's reader, so both read in the page's language. A fixed standing draws its
 * word and no sentence. `sentenceIsServerWritten`
 * is true only where the sentence is a stored one the page could not say again (see `whyTheCheckFailedIn`):
 * that sentence is the server's English and carries `chk-server`, so a browser test can tell it from a
 * word this panel forgot to move.
 */
function WhereItStands({
  standing,
  word,
  sentence,
  sentenceIsServerWritten,
  waiting,
}: {
  standing: RunStanding
  word: string
  sentence: string | null
  sentenceIsServerWritten?: boolean
  waiting: string | null
}) {
  return (
    <section className="chk-part">
      <h3 className="chk-h">{t('chk.whereItStands')}</h3>
      <p className="chk-word" data-standing={standing}>
        {word}
      </p>
      {sentence === null ? null : <p className={sentenceIsServerWritten === true ? 'chk-said chk-server' : 'chk-said'}>{sentence}</p>}
      {waiting === null ? null : <p className="chk-waiting">{waiting}</p>}
    </section>
  )
}

/**
 * WHO THE OFFICE ASKED, AND WHEN. At `full` that is an inspector. At `none` and `light` a decision
 * says the office starts no inspector and tells the secretary, so the absence and the sentence both
 * say secretary — naming an inspector there would say a check is coming that nobody started, and
 * the card nobody holds would be the wrong card to go and give.
 */
function WhoWasAsked({ asked }: { asked: AskedFor | null }) {
  const inspect = useInspect()
  const withoutACheck = asked?.reviewLevel !== undefined && asked.reviewLevel !== 'full'
  const card = cardWord(withoutACheck ? THE_SECRETARY : THE_INSPECTOR)
  if (asked === null) {
    return (
      <section className="chk-part">
        <h3 className="chk-h">{t('chk.whoAsked')}</h3>
        <p className="chk-said">{t('chk.notAskedYetWord')}</p>
      </section>
    )
  }
  return (
    <section className="chk-part">
      <h3 className="chk-h">{t('chk.whoAsked')}</h3>
      {asked.askedOf === undefined ? (
        // NOBODY HOLDS THE INSPECTOR CARD, and this is the one absence on this panel a reader has to
        // do something about: the run is waiting for a check nobody can make. `must-act-on` is the
        // tier that says so, and it is the only tier of the three that keeps the sentence readable.
        <Absence
          tier="must-act-on"
          sentence={t('chk.nobodyHoldsCard', { card })}
          action={withoutACheck ? t('chk.appointSecretary') : t('chk.appointInspector')}
        />
      ) : (
        <p className="chk-said">
          {asked.askedAt === undefined
            ? t(withoutACheck ? 'chk.askedToAnswer' : 'chk.askedToCheck', { who: asked.askedOf })
            : t(withoutACheck ? 'chk.askedToAnswerOn' : 'chk.askedToCheckOn', { who: asked.askedOf, at: aMoment(asked.askedAt, inspect) })}
        </p>
      )}
      {/* THE LEVEL IS DRAWN ONLY WHERE IT CHANGED SOMETHING. At `full` the page reads exactly as it
          did before this setting existed, which is what a reader at `full` already knows; a line
          saying so on every run would be furniture. */}
      {withoutACheck ? (
        <p className="chk-said">
          {t('chk.reviewLevelWord', { level: reviewLevelWord(asked.reviewLevel as 'none' | 'light') })}
        </p>
      ) : null}
      {/* THE OFFICE'S RUN IS REACHED FROM HERE IN BOTH MODES. A person has to be able to open the run
          that checked, so the link is drawn in normal mode too, in words. The run's id and its log
          path are machine detail, so only developer mode shows them (plan 7FEOshq3mBGG, row F1,
          check 3). Round 14 first drew the server's own sentence here instead, which dropped the
          link in both modes; the queue bounced it (entry BZuuG97jqGhF). A run with no execution
          still gets the server's sentence, as before round 14. */}
      {asked.execution ? (
        <>
          <p className="chk-said">
            {t('chk.ranWithoutSaid', { model: asked.execution.model, minutes: asked.execution.minutes })}{' '}
            <a className="chk-link" href={`#${recordPath(asked.execution.session)}`}>{t('chk.openTheOfficeRun')}</a>
          </p>
          {inspect ? (
            <CodeRows
              rows={[
                { label: 'chk.row.officeRun', value: asked.execution.session },
                { label: 'chk.row.log', value: asked.execution.log },
              ]}
            />
          ) : null}
        </>
      ) : (
        <ServerNote text={asked.says} />
      )}
      {/* THE WORKING FOLDER, ITS BRANCH AND THE FORK POINT ARE DEVELOPER DETAIL, by item 3 of one
          of the owner's decisions and item 2 of another.
          Normal mode draws none of these, the sentence that says no working directory was
          recorded included, because it too is about the branch the fork point is read from. */}
      {asked.checkout === undefined || !inspect ? null : asked.checkout.directory === undefined ? (
        // NO WORKING DIRECTORY WAS RECORDED, so there is no repository to read a trunk from. The
        // old sentence claimed the base was the fork point against main in this case as well, and
        // main was a guess: the trunk may be master, or unreadable. A change on 15 September 2026
        // made the server resolve the trunk itself, and this says the honest thing where it could.
        <p className="chk-said">{t('chk.noWorkingDirectoryWord')}</p>
      ) : (
        <CodeRows
          rows={[
            {
              label: 'chk.row.workFolder',
              value: asked.checkout.directory,
              ...(asked.checkout.cutFrom === undefined ? { state: 'chk.row.noBranchRead' as const } : {}),
            },
            ...(asked.checkout.cutFrom === undefined ? [] : [{ label: 'chk.row.cutFrom' as const, value: asked.checkout.cutFrom }]),
          ]}
        />
      )}
    </section>
  )
}

/** What a check of this run would read: the files and the chapters, and in developer mode the base. */
function WhatItWouldRead({ read }: { read: WouldRead | null }) {
  const inspect = useInspect()
  if (read === null) {
    return (
      <section className="chk-part">
        <h3 className="chk-h">{t('chk.whatItWouldRead')}</h3>
        <p className="chk-said">{t('chk.notAssembledWord')}</p>
      </section>
    )
  }
  const inside = read.inside ?? []
  const outside = read.outside ?? []
  const chapters = read.chaptersAt ?? []
  return (
    <section className="chk-part">
      <h3 className="chk-h">{t('chk.whatItWouldRead')}</h3>
      {read.execution === undefined ? null : (
        <dl className="chk-settings">
          <dt>{t('chk.model')}</dt><dd>{read.execution.model}</dd>
          <dt>{t('chk.timeLimit')}</dt><dd>{t('chk.minutes', { n: read.execution.minutes })}</dd>
        </dl>
      )}
      {/* THE BASE THE CHANGES WERE READ AGAINST IS DEVELOPER DETAIL, like the worktree below, by
          item 2 of one of the owner's decisions. Normal mode draws neither the
          base line nor the sentence that says nobody named one; the files and the chapters below stand
          without them. */}
      {!inspect ? null : (
        <p className="chk-said">
          {read.base === undefined
            ? t('chk.noBaseNamed')
            : t('chk.baseFound', { ref: read.base.ref, how: read.base.how === 'typed' ? t('chk.base.typed') : t('chk.base.forkPoint') })}
        </p>
      )}
      {/* THE ASSEMBLY'S OWN SENTENCE ABOUT THE BASE, drawn as it wrote it: a server sentence, not
          translated on this page (this round's report says so). Developer mode only, as above. */}
      <ServerNote text={read.base?.says} />
      {read.read === undefined || !inspect ? null : (
        <div className="chk-read-tree">
          <CodeRows rows={[{ label: 'chk.row.worktree', value: read.read.worktree }]} />
        </div>
      )}
      <p className="chk-said">
        {/* A PLUGIN-ONLY CHANGE THAT LEAVES ITS MANIFEST ALONE IS NOT READ, and the line says so. */}
        {read.pluginRule?.read === false
          ? t('chk.filesInsideNotReadByThePluginRule', { n: inside.length, plugin: read.pluginRule.plugin?.id ?? '' })
          : t('chk.filesInsideRead', { n: inside.length })}
        {t('chk.filesOutsideNotRead', { n: outside.length })}
      </p>
      {inside.length === 0 ? null : (
        <ul className="chk-list">
          {inside.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      )}
      {outside.length === 0 ? null : (
        <>
          <p className="chk-said">{t('chk.namedNotRead')}</p>
          <ul className="chk-list chk-outside">
            {outside.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      )}
      <p className="chk-said">
        {chapters.length === 0
          ? t('chk.chaptersNone')
          : t('chk.chaptersSome', { n: chapters.length, list: chapters.map((one) => chapterAtLevel(one.chapter, one.level)).join(', ') })}
      </p>
      {read.bytes === undefined || read.wholeCodeBytes === undefined ? null : (
        <p className="chk-said">{t('chk.promptBytes', { bytes: read.bytes, wholeCodeBytes: read.wholeCodeBytes })}</p>
      )}
      {/* THE ASSEMBLY'S TIME, TO THE MINUTE, as the office writes a moment (problem F5su-m2jyNYX). The
          stored stamp is developer detail, drawn beside it in developer mode only. */}
      {read.at === undefined ? null : (
        <p className="chk-when">
          {inspect
            ? t('chk.assembledStored', { at: stampToTheMinute(read.at), stamp: read.at })
            : t('chk.assembled', { at: stampToTheMinute(read.at) })}
        </p>
      )}
    </section>
  )
}

/**
 * A STORED MOMENT ON THIS PANEL, TO THE MINUTE, through `stampToTheMinute`, the office's one way of
 * writing a moment (round 18's list: four of this panel's times were the stored stamp as it came, so a
 * Chinese page read "2026-09-30 10:00:37"). Developer mode keeps the stored stamp, which is what it is
 * for.
 */
function aMoment(stamp: string, inspect: boolean): string {
  return inspect ? stamp : stampToTheMinute(stamp)
}

/** The verdict: released, or refused with what is missing and the group it opened, where it opened one. */
function TheVerdict({ released, refused, nameOf }: { released: Release | null; refused: Refusal | null; nameOf: NameOf }) {
  const inspect = useInspect()
  const reportedTo = released?.reportedTo === undefined ? null : nameIn(released.reportedTo, nameOf)
  if (released === null && refused === null) {
    return (
      <section className="chk-part">
        <h3 className="chk-h">{t('chk.theVerdict')}</h3>
        <p className="chk-said">{t('chk.noVerdictYetWord')}</p>
      </section>
    )
  }
  return (
    <section className="chk-part">
      <h3 className="chk-h">{t('chk.theVerdict')}</h3>
      {refused === null ? null : (
        <>
          {/* `theBasisNamed` composes its fragment ("chapter 5 of the office regulations", "invariant
              9 of USER.md (…)") from this run's own facts in `@shared/releasing.ts`, outside this
              piece's files; this round leaves it in that module's English rather than build a second,
              possibly drifting account of what a refusal rests on (the report says so). */}
          {/* `theBasisNamed` IS MARKED SEPARATELY, in its own span, because it is the one fragment of
              this sentence composed from the run's own facts in `@shared/releasing.ts` — see the
              comment above. Everything around it is this piece's own translated sentence. */}
          <p className="chk-said">
            {t('chk.refusedOnPrefix', { who: nameIn(refused.by, nameOf), at: aMoment(refused.at, inspect) })}{' '}
            <span className="chk-server">{theBasisNamed(refused)}</span>.
          </p>
          <p className="chk-said">{t('chk.whatIsMissing')}</p>
          <ul className="chk-list">
            {refused.missing.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>
          {refused.group === undefined ? (
            // `NO_GROUP_FOR_A_CHECK_AGAIN` HOLDS NO DYNAMIC FACT — its own comment in
            // `@shared/releasing.ts` says so — so this piece's own translated word for it is used
            // instead of the shared module's English, the same way `STANDING_WORD_KEYS` above does.
            <p className="chk-said">{t('chk.noGroupWord')}</p>
          ) : (
            <p className="chk-said">
              <a className="chk-link" href={`#${recordPath(refused.group)}`}>
                {t('chk.openTheGroup')}
              </a>
            </p>
          )}
          {refused.reworked == null ? null : (
            <p className="chk-said">{t('chk.finishedAgainAt', { at: aMoment(refused.reworked.at, inspect) })}</p>
          )}
        </>
      )}
      {released === null ? null : (
        <p className="chk-said">
          {t('chk.releasedOn', { who: nameIn(released.by, nameOf), at: aMoment(released.at, inspect), how: released.how === 'its starter' ? t('chk.who.itsStarter') : released.how === 'the standard-change rule' ? t('chk.who.theStandardChangeRule') : t('chk.who.anInspector') })}
          {' '}
          {reportedTo === null ? t('chk.reportedToNobody') : t('chk.reportedToName', { who: reportedTo })}
        </p>
      )}
    </section>
  )
}

/**
 * Normal mode says what was read from the recorded facts, in the page's language. By item 6 of
 * one decision and item 2 of another, as read in hX_qDiISkTCp, the restriction covers the check's
 * own sentence too. The page supplies both languages; the
 * tool writes no second English sentence. Paths, seal ids and commits stay in developer mode.
 */
function readingInWords(read: WhatWasRead, fromAConfirmation: boolean): string {
  const sealed = read.sealId !== undefined && !read.unsealed
  if (fromAConfirmation) return t(sealed ? 'chk.read.acceptedSeal' : 'chk.read.acceptedNoSeal')
  // adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5:
  // an absent tip does not tell us the seal kind. Older seals claim only sealed work.
  // WFeYzNnhPtkh, inspector ab2Bj-DkFm7S on adTmco_wIzln; criterion C30:
  // whose tree the check read is said first, even when the reading names a seal.
  const kind: WordKey = !read.ofItsOwn
    ? 'chk.read.workerTree'
    : sealed
      ? read.sealKind === 'records'
        ? read.linkEvidence === 'read'
          ? 'chk.read.records'
          : read.linkEvidence === 'sealed-before-links'
            ? 'chk.read.recordsSealedBeforeLinks'
            : 'chk.read.recordsLinksNotSaid'
        : read.sealKind === 'files'
          ? 'chk.read.filesCopy'
          : read.sealKind === 'git'
            ? read.tip == null ? 'chk.read.sealedCodeNoTip' : 'chk.read.ownSealedTip'
            : 'chk.read.sealedWork'
      : read.tip == null ? 'chk.read.ownTree' : 'chk.read.ownTip'
  const sentences = [t(kind)]
  if (read.unsealed) sentences.push(t('chk.read.unsealed'))
  // Absent and empty are different facts: an empty list says zero, absence says nothing counted.
  if (read.only !== undefined) sentences.push(t('chk.read.only', { n: read.only.length }))
  if (read.needsJudgment !== undefined) sentences.push(t('chk.read.handedOn', { n: read.needsJudgment.length }))
  return sentences.join(t('chk.read.sentenceGap'))
}

/** Which worktree and which tip the check read. Criterion C30, drawn where a person can see it. */
function WhatTreeItRead({
  released,
  refused,
  confirmed,
  read,
}: {
  released: Release | null
  refused: Refusal | null
  confirmed: Confirmation | null
  read: WouldRead['read'] | null
}) {
  const inspect = useInspect()
  // THE VERDICT'S OWN ANSWER FIRST. A release and a refusal each carry what the check that produced
  // them read; the assembly's answer is what a check that has not answered yet would read, and it
  // is the weaker of the two.
  //
  // A CONFIRMATION CARRIES ONE ONLY WHERE NO CHECK EVER RAN — the review levels `none` and `light`.
  // It comes LAST of the four on purpose: where a release exists, the release is what read the tree,
  // and the confirmation merely accepted what the release named.
  const said: WhatWasRead | null = released?.read ?? refused?.read ?? read ?? confirmed?.read ?? null
  // WHOSE READING THIS IS, so the heading never calls a confirmation a check. Criterion C30 is about
  // what a CHECK read; a confirmation at `none` read nothing, and what it carries is which seal it
  // accepted.
  const fromAConfirmation = released === null && refused === null && read === null && (confirmed?.read ?? null) !== null
  return (
    <section className="chk-part">
      <h3 className="chk-h">{t(fromAConfirmation ? 'chk.whichWorkWasAccepted' : 'chk.whichTreeItRead')}</h3>
      {said == null ? (
        <p className="chk-said">{t('chk.noWorktreeNamedWord')}</p>
      ) : (
        <>
          {/* By item 2 of one decision and item 6 of another, as read in hX_qDiISkTCp, developer
              mode keeps the evidence and the full stored sentence; normal mode keeps an account of
              the reading without paths or commits. */}
          {!inspect ? null : (
            <div className="chk-read-evidence">
              <CodeRows
                rows={[
                  { label: 'chk.row.worktree', value: said.worktree, ...(said.tip == null ? { state: 'chk.row.tipNotRecorded' as const } : {}) },
                  ...(said.tip == null ? [] : [{ label: 'chk.row.tip' as const, value: said.tip }]),
                ]}
              />
            </div>
          )}
          <p className={inspect ? 'chk-said chk-server' : 'chk-said'}>
            {inspect ? said.says : readingInWords(said, fromAConfirmation)}
          </p>
          {said.ofItsOwn || fromAConfirmation ? null : <p className="chk-warn">{t('chk.notItsOwnTreeWarning')}</p>}
        </>
      )}
    </section>
  )
}

/**
 * THE PRESS THAT CLOSES THE RUN. Criterion C29, and chapter 10's fourth rule.
 *
 * A person is never asked to run a command in a terminal: everything is done inside Mole Office. A
 * confirmation is the supervisor's act and it must be a press here, not a command somewhere else.
 *
 * A LINE IS REQUIRED AND THE BUTTON SAYS SO, rather than sending an empty one. A close with nothing
 * behind it is indistinguishable from a mis-press a year later, which is why the route refuses one.
 */
function ConfirmIt({ run, onChanged }: { run: string; onChanged?: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function confirm(): Promise<void> {
    setBusy(true)
    setFailed(null)
    try {
      await api.confirmTheReport(run, { because: typed.trim() })
      setTyped('')
      onChanged?.()
    } catch (err) {
      setFailed(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="chk-part chk-confirm">
      <h3 className="chk-h">{t('chk.closeThisRun')}</h3>
      <label className="chk-label" htmlFor={`chk-because-${run}`}>
        {t('chk.whatYouAreSaying')}
      </label>
      <textarea
        id={`chk-because-${run}`}
        className="chk-box"
        rows={2}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={t('chk.confirmPlaceholder')}
      />
      <div className="chk-act">
        <Btn
          variant="primary"
          pending={busy}
          disabled={typed.trim() === ''}
          reason={typed.trim() === '' ? t('chk.sayWhatFirst') : undefined}
          onClick={() => void confirm()}
        >
          {t('chk.confirmAndClose')}
        </Btn>
      </div>
      {failed === null ? null : <p className="chk-warn chk-server">{failed}</p>}
    </section>
  )
}

// ============================================================================ the style

export const CHECK_PANEL_SHEET = 'mole-office-the-check-on-a-run'

export const CHECK_PANEL_CSS = `
.chk { display: flex; flex-direction: column; gap: var(--pad-lg); }
.chk-part { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); }
.chk-h {
  margin: 0; font-size: var(--fs-1); font-weight: 600; color: var(--text-2);
  text-transform: none; letter-spacing: 0;
}
.chk-said { margin: 0; font-size: var(--fs-1); color: var(--text-1); line-height: 1.5; overflow-wrap: anywhere; }
.chk-settings { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: calc(var(--pad) / 2) var(--pad); margin: 0; font-size: var(--fs-1); }
.chk-settings dt { color: var(--text-2); }
.chk-settings dd { margin: 0; color: var(--text-1); overflow-wrap: anywhere; }
.chk-read-tree { overflow-wrap: anywhere; }
.chk-when { margin: 0; font-size: var(--fs-1); color: var(--text-2); }
.chk-waiting { margin: 0; font-size: var(--fs-1); color: var(--text-1); font-weight: 600; }
.chk-word { margin: 0; font-size: var(--fs-3); font-weight: 600; color: var(--text-0); }

/* THE ONE STANDING THAT NEEDS A COLOUR IS THE ONE SOMEBODY MUST ACT ON. Chapter 6's sixth rule:
   weight in proportion to whether the reader has to do something. A refusal under discussion is
   the only one of the five where nothing moves until a person or an agent goes and talks. */
.chk-word[data-standing='rebuttal'] { color: var(--warn-text, var(--text-0)); }

.chk-list {
  margin: 0; padding-left: var(--pad-lg); display: flex; flex-direction: column; gap: 2px;
  font-size: var(--fs-1); color: var(--text-1); word-break: break-word;
}
.chk-outside { color: var(--text-2); }
.chk-link { color: var(--link, var(--text-0)); }
.chk-warn { margin: 0; font-size: var(--fs-1); color: var(--warn-text, var(--text-0)); line-height: 1.5; }
.chk-confirm { border-top: 1px solid var(--border); padding-top: var(--pad-lg); }
.chk-label { font-size: var(--fs-1); color: var(--text-2); }
.chk-box {
  width: 100%; box-sizing: border-box; font: inherit; font-size: var(--fs-1);
  color: var(--text-0); background: var(--surface-1); border: 1px solid var(--border-strong);
  border-radius: var(--radius); padding: var(--pad);
}
.chk-act { display: flex; flex-wrap: wrap; gap: var(--pad); }

@media (max-width: 40rem) {
  .chk-word { font-size: var(--fs-2); }
}
`

/** Drawn where the panel is, once, by React's own de-duplication on the href. */
export function CheckPanelStyle() {
  return (
    <style href={CHECK_PANEL_SHEET} precedence="default">
      {CHECK_PANEL_CSS}
    </style>
  )
}

function AskAgain({ run, onChanged }: { run: string; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <section className="chk-part">
    <div className="chk-act"><Btn variant="primary" pending={busy} onClick={() => {
      setBusy(true); setError(null)
      api.askForTheCheckAgain(run).then(() => onChanged?.()).catch((err: unknown) => setError(errorMessage(err))).finally(() => setBusy(false))
    }}>{busy ? t('chk.askingAgain') : t('chk.askAgain')}</Btn></div>
    {error ? <p role="alert">{error}</p> : null}
  </section>
}
