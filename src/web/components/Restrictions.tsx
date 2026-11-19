// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS RECORD MAY NOT BE USED TO CLAIM, ON THE RECORD'S OWN PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Wave 8 built twelve routes, two record kinds, six marks, a boundary vocabulary and two governance
 * guards, and its step 10 — the screen — was the one step of twelve not built. `grep -rn
 * 'restrictions' src/web/` returned nothing. `GET /api/records/<id>` has carried a record's
 * restrictions on every kind since that wave and no page read the key, so a person opening a result
 * that rests on a guessed camera calibration was told nothing at all, while an agent with curl was
 * told everything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS, AND WHAT IT REFUSES TO
 * ---------------------------------------------------------------------------------------
 *
 * It draws the reader's answer and works nothing out. The severity, the standing, the two authored
 * lists and how the restriction reached this record all come off the reply. There is no key saying
 * whether a claim is still valid and this draws none: deciding whether a particular assertion falls
 * inside *geometric accuracy* is reading, and it is the reader's.
 *
 * THE AUTHOR'S WORDS ARE PRINTED UNCHANGED. Mole Office never re-words, summarises or merges two
 * authors' lists, and neither does this panel — each list is drawn as its own rows, under the
 * author's own heading.
 *
 * ---------------------------------------------------------------------------------------
 * SEVERITY IS DRAWN, NOT FLATTENED, AND NOT IN COLOUR
 * ---------------------------------------------------------------------------------------
 *
 * `RESTRICTION_MARKS` gives every `(severity, standing)` pair a word and a mark of four channels —
 * `form`, `glyph`, `edge`, `where` — and no hue at all. This emits all four as data attributes and
 * the stylesheet strokes them, so the difference between a harmless placeholder and a
 * production-blocking one is a rail in the margin and a word, in every palette and at every text
 * size. A `stops_final` row is always a rail; a `harmless` row is bare text. That is the owner's
 * *"do not make harmless Placeholders visually equivalent to production-blocking ones"* in the one
 * channel a palette cannot take away.
 *
 * THE PANEL'S RANK IS THE WORST THING IN IT. A `stops_final` restriction that still stands opens
 * the page at rank 0, beside a safety consequence; anything else is an ordinary panel. A page whose
 * result cannot be called final must say so before the reader starts reading the result.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING BECAME VALID, AND THE ONE ACT ON THIS PANEL SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Resolving a restriction validates nothing. What it writes is a re-validation row per affected
 * record, and the restriction keeps travelling — reading *resolved, not re-checked* — until
 * somebody looks at each record and says which it is. That judgement is the one write offered here,
 * because it is the one act the page is asking a person for. `not_affected` requires a reason,
 * because it takes somebody else's restriction off this record and a dismissal with no reason is a
 * deletion; the refusal comes back from the server in the server's own words.
 */

import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import {
  restrictionCounts,
  restrictionDrawing,
  restrictionNote,
  RESTRICTION_SEVERITY,
} from '@shared/restriction.ts'
import { kindWord, linkWord } from '../lib/words.ts'
import { useMode } from '../lib/mode.ts'
import { api, errorMessage } from '../api.ts'
import type { RestrictionReading, RestrictionsOnRecord } from '../api.ts'
import { recordPath, RouteLink } from './router.tsx'
import { Btn, Explain, Field, Panel, Tag, TextArea } from './ui.tsx'

/**
 * WORST FIRST, AND THE ORDER IS `RESTRICTION_SEVERITY`'S RATHER THAN THIS FILE'S.
 *
 * A second ordering of three words is a second thing that can disagree with the first. Within one
 * severity the ones that still stand come before the ones already answered, because an active
 * restriction is the one a reader has to act on.
 */
export function inReadingOrder(found: readonly RestrictionReading[]): RestrictionReading[] {
  const rank = (reading: RestrictionReading): number => RESTRICTION_SEVERITY.indexOf(reading.severity)
  const standing = (reading: RestrictionReading): number => (reading.standing.state === 'active' ? 0 : 1)
  return [...found].sort(
    (a, b) => rank(a) - rank(b) || standing(a) - standing(b) || a.title.localeCompare(b.title),
  )
}

/**
 * HOW THIS RESTRICTION GOT HERE, in a sentence.
 *
 * The three reaches are three different claims and the middle one is the one that gets misread: a
 * module that implements a restricted block reports the block's restriction and says nothing about
 * its own claims. So `carried` says that in as many words rather than leaving a reader to infer it
 * from a word.
 */
export function howItReached(reading: RestrictionReading, mode: 'normal' | 'inspect'): string {
  if (reading.reach.how === 'direct') return t('g2d.restrictions.direct')
  if (reading.reach.how === 'carried') {
    const through = linkWord(reading.reach.through, 'forward', mode).text
    return t('g2d.restrictions.carried', { through })
  }
  const steps = reading.reach.distance
  return t('g2d.restrictions.reachedVia', { n: steps, steps })
}

/**
 * EVERY RESTRICTION REACHING ONE RECORD.
 *
 * `found: []` is a real answer and means nothing restricts this. It is drawn as one quiet line at
 * the foot of the page rather than as a panel, because a panel saying nothing on every record in
 * the corpus is furniture, and furniture stops being read. What could not be checked is in both
 * cases one press away and never dropped: *nothing restricts this* and *nobody could look* must not
 * read the same.
 */
export function RestrictionsHere({
  recordId,
  reading,
  onJudged,
}: {
  recordId: string
  reading: RestrictionsOnRecord
  /** A judgement takes a row out of this list, so the page reads itself again. */
  onJudged: () => void
}) {
  const mode = useMode()
  const found = inReadingOrder(reading.found)
  const counts = restrictionCounts(found)
  const note = restrictionNote(found, reading.couldNotCheck)

  if (found.length === 0) {
    // THE SAME SENTENCE WITHOUT ITS SECOND CLAUSE. The clause about what could not be checked is
    // drawn by the fold beside it, so `0` here is not a claim that nothing was missed — it is the
    // sentence asked for without the half the fold is already saying.
    return (
      <div className="rst-none">
        <span>{t('g2d.restrictions.noneHere')}</span>
        <WhatWasNotChecked reading={reading} />
      </div>
    )
  }

  return (
    <Panel
      declares={{ surface: null }}
      title={t('g2d.restrictions.title')}
      // THE WORST THING IN IT DECIDES. A result that cannot be called final says so before the
      // reader starts reading the result.
      rank={counts.stopsFinal > 0 ? 0 : 2}
      {...(counts.stopsFinal > 0 ? { tone: 'blocked' as const } : {})}
      actions={<Tag tone="quiet">{found.length}</Tag>}
    >
      {/* THE SERVER'S OWN SENTENCE ABOUT THIS ANSWER, from the shared reader `GET /api/restrictions`
          prints too. A second wording here could disagree with the reply it describes. */}
      <p className="rst-said">{note}</p>
      <ul className="rst-list">
        {found.map((one) => (
          <RestrictionRow key={one.restrictionId} recordId={recordId} reading={one} mode={mode} onJudged={onJudged} />
        ))}
      </ul>
      <WhatWasNotChecked reading={reading} />
    </Panel>
  )
}

/**
 * WHAT THE WALK COULD NOT DO. Always offered, never hidden, and never drawn as an empty list.
 *
 * `couldNotCheck` is not empty today and that is deliberate: the implementation map has no read
 * that rolls the import graph up to records, so a restriction on one record does not reach another
 * whose code imports its code. Saying that is the difference between a short list and a complete
 * one.
 */
function WhatWasNotChecked({ reading }: { reading: RestrictionsOnRecord }) {
  if (reading.couldNotCheck.length === 0 && reading.skippedDeleted === 0) return null
  return (
    <Explain
      declares={{ surface: null }}
      meaning={<span>{t('g2d.restrictions.someNotChecked')}</span>}
      opens={t('g2d.restrictions.whatCouldNotLookAt')}
    >
      <ul className="rst-gaps">
        {reading.couldNotCheck.map((gap) => (
          <li key={`${gap.what}:${gap.because}`}>
            <b>{gap.what}</b> — {gap.because}
          </li>
        ))}
        {reading.skippedDeleted === 0 ? null : (
          <li>
            {t('g2d.restrictions.skippedDeleted', { n: reading.skippedDeleted })}
          </li>
        )}
      </ul>
    </Explain>
  )
}

/** One restriction: how bad it is, where it stands, what it forbids, and where it came from. */
function RestrictionRow({
  recordId,
  reading,
  mode,
  onJudged,
}: {
  recordId: string
  reading: RestrictionReading
  mode: 'normal' | 'inspect'
  onJudged: () => void
}) {
  const resolvedAt = reading.standing.state === 'active' ? null : reading.standing.resolvedAt
  const drawing = restrictionDrawing(reading.severity, reading.standing.state, resolvedAt)
  return (
    <li
      className="rst-row"
      // THE FOUR CHANNELS OF THE MARK, EMITTED AND STROKED BY THE STYLESHEET. No hue: a severity is
      // a word and a rail. `drawing === null` means the reader returned a pair the mark table has
      // no entry for, which is a fault worth seeing rather than a row drawn as though it were fine.
      data-form={drawing?.mark.form ?? 'unknown'}
      data-glyph={drawing?.mark.glyph ?? 'unknown'}
      data-edge={drawing?.mark.edge ?? 'none'}
      data-severity={reading.severity}
    >
      {/* THE PAIR THAT CANNOT BE DRAWN IS NAMED ON THE TOOLTIP AND NOT IN THE SENTENCE. Two of the
          six pairs do not exist, because the reader cannot return them; if one ever arrives, the
          reader changed and the mark table did not. A reader gets the plain fact and a developer
          gets the pair, which is the split every stored word in this product already has. */}
      <p
        className="rst-word"
        title={drawing?.detail ?? t('pageWords.Restrictions.expression01', { severity: String(reading.severity), state: String(reading.standing.state) })}
      >
        {drawing === null
          ? t('g2d.restrictions.noMark')
          : drawing.word}
      </p>
      <p className="rst-title">
        <RouteLink to={recordPath(reading.restrictionId)}>{reading.title}</RouteLink>
        <span className="rst-kind">{kindWord(reading.kind, mode).text}</span>
      </p>
      {reading.holdsField === null ? null : (
        <p className="rst-holds">{t('g2d.restrictions.holdsField', { field: content(reading.holdsField) })}</p>
      )}
      <p className="rst-reach">{howItReached(reading, mode)}</p>
      {/* THE AUTHOR'S OWN WORDS, UNCHANGED AND UNMERGED. Both halves are drawn, and an empty half is
          absent rather than drawn as an empty box: a `harmless` restriction has neither, by rule. */}
      {reading.disallowedClaims.length === 0 ? null : (
        <div className="rst-claims">
          <h4>{t('g2d.restrictions.disallowedHeading')}</h4>
          <ul>
            {reading.disallowedClaims.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {reading.allowedUses.length === 0 ? null : (
        <div className="rst-claims rst-allowed">
          <h4>{t('g2d.restrictions.allowedHeading')}</h4>
          <ul>
            {reading.allowedUses.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {reading.standing.state === 'resolved-unchecked' ? (
        <Judge restrictionId={reading.restrictionId} recordId={recordId} onJudged={onJudged} />
      ) : null}
    </li>
  )
}

/**
 * SAYING WHETHER THIS PIECE OF WORK STILL STANDS, once the restriction has been answered.
 *
 * TWO WORDS AND THEY ARE NOT THE SAME ACT. *Checked* says somebody looked and the work holds.
 * *Not affected* says the restriction never bore on this record at all, which takes somebody else's
 * restriction off it — so a reason is required, and the server refuses an agent that tries it on a
 * `stops_final` restriction a person wrote. The refusal is printed as the server wrote it.
 */
function Judge({
  restrictionId,
  recordId,
  onJudged,
}: {
  restrictionId: string
  recordId: string
  onJudged: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  async function judge(state: 'checked' | 'not_affected') {
    setBusy(true)
    setError(null)
    setSaid(null)
    try {
      const reply = await api.judgeRestriction(restrictionId, recordId, { state, note: note.trim() || null })
      setSaid(reply.note)
      setNote('')
      onJudged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rst-judge">
      <p className="rst-judge-ask">
        {t('g2d.restrictions.judgeAsk')}
      </p>
      <Field label={t('g2d.restrictions.whyLabel')} error={error ?? undefined}>
        <TextArea
          value={note}
          onChange={setNote}
          rows={2}
          placeholder={t('g2d.restrictions.whyPlaceholder')}
        />
      </Field>
      <div className="rst-judge-acts">
        <Btn size="sm" onClick={() => void judge('checked')} disabled={busy} reason={t('sheet.button.waitsForTheLastAnswer')}>
          {t('g2d.restrictions.checkedButton')}
        </Btn>
        <Btn
          size="sm"
          onClick={() => void judge('not_affected')}
          disabled={busy || note.trim() === ''}
          reason={t(busy ? 'sheet.button.waitsForTheLastAnswer' : 'g2d.restrictions.notAffectedNeedsWhy')}
        >
          {t('g2d.restrictions.notAffectedButton')}
        </Btn>
      </div>
      {said === null ? null : <p className="rst-judge-said">{said}</p>}
    </div>
  )
}

/**
 * The stylesheet.
 *
 * NOT ONE COLOUR IN IT CARRIES THE SEVERITY. The rail, the crossbar and the underline are the
 * channels; every colour here is a text or border token, so a palette swap cannot flatten a
 * production-blocking restriction into a harmless one.
 */
export const RESTRICTIONS_CSS = `
.rst-none {
  color: var(--text-2); font-size: var(--fs-1);
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad);
  margin: var(--pad) 0 0 0;
}
.rst-said { color: var(--text-2); font-size: var(--fs-1); margin: 0 0 var(--pad) 0; }
.rst-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad-lg); }
.rst-gaps { margin: 0; padding-left: var(--pad-lg); color: var(--text-2); font-size: var(--fs-1); }

/* ONE ROW, AND THE FOUR CHANNELS OF ITS MARK.

   form     rail draws the left margin; text draws none at all. This is the channel that decides
            whether anything is in the margin, and it is what separates harmless from
            production-blocking before any word is read.
   glyph    barred adds a crossbar through the rail; doubled draws it as two lines; hollow is bare.
   edge     underline closes the row along the bottom, which is what the two resolved standings use.
   where    every one of these is leftMargin, so the rail is on the left and nowhere else. */
.rst-row { padding-left: var(--pad); min-width: 0; }
.rst-row[data-form='rail'] { border-left: 3px solid var(--text-2); padding-left: var(--pad-lg); }
.rst-row[data-form='rail'][data-glyph='doubled'] {
  border-left-style: double; border-left-width: 5px;
}
.rst-row[data-form='rail'][data-glyph='barred'] { position: relative; }
.rst-row[data-form='rail'][data-glyph='barred']::before {
  content: ''; position: absolute; left: -3px; top: 50%; width: 11px; height: 3px;
  background: var(--text-2);
}
.rst-row[data-form='text'] { border-left: none; color: var(--text-2); }
.rst-row[data-edge='underline'] { border-bottom: 1px solid var(--border); padding-bottom: var(--pad); }

.rst-word { margin: 0; font-size: var(--fs-2); font-weight: var(--weight-strong); color: var(--text); }
.rst-row[data-form='text'] .rst-word { font-weight: var(--weight-body); color: var(--text-2); }
.rst-title {
  margin: calc(var(--pad) * 0.25) 0 0 0; font-size: var(--fs-2);
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0;
}
.rst-title a { overflow-wrap: anywhere; }
.rst-kind { color: var(--text-3); font-size: var(--fs-1); }
.rst-holds, .rst-reach { margin: calc(var(--pad) * 0.25) 0 0 0; color: var(--text-2); font-size: var(--fs-1); }

.rst-claims { margin-top: var(--pad); min-width: 0; }
.rst-claims h4 { margin: 0 0 calc(var(--pad) * 0.25) 0; font-size: var(--fs-1); color: var(--text-2); font-weight: var(--weight-body); }
.rst-claims ul { margin: 0; padding-left: var(--pad-lg); font-size: var(--fs-2); color: var(--text); }
.rst-claims li { overflow-wrap: anywhere; }
.rst-allowed ul { color: var(--text-2); }

.rst-judge { margin-top: var(--pad); padding-top: var(--pad); border-top: 1px solid var(--border); }
.rst-judge-ask { margin: 0 0 var(--pad) 0; font-size: var(--fs-1); color: var(--text-2); }
.rst-judge-acts { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: var(--pad); }
.rst-judge-said { margin: var(--pad) 0 0 0; font-size: var(--fs-1); color: var(--text-2); }
`

/** Named so nothing else mounts a second copy of the sheet above under a different href. */
export const RESTRICTIONS_SHEET = 'mole-office-restrictions'

/** Drawn where the panel is, once, by React's own de-duplication on the href. */
export function RestrictionsStyle() {
  return (
    <style href={RESTRICTIONS_SHEET} precedence="default">
      {RESTRICTIONS_CSS}
    </style>
  )
}
