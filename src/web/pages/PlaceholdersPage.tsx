// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/placeholders` — EVERY DELIBERATE UNRESOLVED SLOT IN THIS PROJECT, AND EVERYTHING THAT RAN
 * INSTEAD OF THE AGREED METHOD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Wave 8 built the whole of this feature except its screen: twelve routes, two record kinds, six
 * marks, a boundary vocabulary and two governance guards, reachable only by curl. Its own step 10
 * — this page — is the one step of twelve that was not built, and `grep -rn 'restrictions'
 * src/web/` returned nothing for the eight days after.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ANSWERS THAT THE RECORDS LIST CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * `placeholder` and `ran_instead` are both in the Findings family, so both are already listed on
 * `#/findings`. That list draws them identically, because a list draws titles. This page draws HOW
 * BAD each one is, WHETHER it has been answered, and HOW MUCH WORK is resting on it — and it draws
 * a production-blocking one and a harmless one differently, which is the owner's own rule: *"Do not
 * make harmless Placeholders visually equivalent to production-blocking ones."*
 *
 * ---------------------------------------------------------------------------------------
 * TWO BANDS, AND WHY THE ORDER IS THE SEVERITY'S
 * ---------------------------------------------------------------------------------------
 *
 * STILL OPEN comes first and holds everything nothing has answered. ANSWERED holds the rest, and it
 * is not empty of consequence: answering a restriction validates nothing, so a row there says how
 * many pieces of work have still not been looked at since.
 *
 * Inside a band the order is `RESTRICTION_SEVERITY`'s, worst first, read from that array rather
 * than restated here. A second ordering of three words is a second thing that can disagree with the
 * first.
 *
 * ---------------------------------------------------------------------------------------
 * NO COUNT IN THE RAIL, AND THAT IS THE OWNER'S RULE
 * ---------------------------------------------------------------------------------------
 *
 * *"Do not annoy users with daily: you have 12 Placeholders. Prefer reminders at meaningful
 * semantic boundaries."* So this page has a number on it and the rail row beside it does not.
 * Mole Office asks about restrictions at the acts listed in `BOUNDARY_ACTS`, and nowhere else.
 */

import { api } from '../api.ts'
import type { RestrictionInProject, restrictionsInThisProject } from '../../server/lib/restrictions.ts'
import { restrictionDrawing, RESTRICTION_MARKS, restrictionMarkKey } from '@shared/restriction.ts'
import type { RestrictionSeverity } from '@shared/restriction.ts'
import { kindWord } from '../lib/words.ts'
import { useMode, type Mode } from '../lib/mode.ts'
import { recordPath, RouteLink } from '../components/router.tsx'
import { RESTRICTIONS_SHEET, RESTRICTIONS_CSS } from '../components/Restrictions.tsx'
import { Absence, ErrorNote, Explain, Loading, Panel, Tag } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** What the reply carries, named here so the page reads as a page. */
type Reading = ReturnType<typeof restrictionsInThisProject> & { note: string }

/**
 * THE SEVERITY'S OWN READING, WHICH IS THE WORD ITS ACTIVE MARK CARRIES.
 *
 * `RESTRICTION_MARKS` is keyed on `(severity, standing)` and the `.active` entry of each severity
 * is that severity said in words: *Stops this being called final*, *Limits what this can prove*,
 * *Nothing rests on it*. So the word on a row here is read out of that table rather than written a
 * second time, and a change to the table moves this page with it.
 *
 * WHY IT IS NOT `restrictionDrawing`. That function answers for a PAIR, and two of the six pairs do
 * not exist — there is no `stops_final.resolved`, because a restriction that has been answered and
 * fully judged stops being returned by the per-record reads. This page lists restrictions rather
 * than pairs, so it asks for the severity's word and says the standing separately.
 */
export function severityWord(severity: RestrictionSeverity): string {
  return RESTRICTION_MARKS[restrictionMarkKey(severity, 'active')]?.word ?? severity
}

/** The mark that severity is drawn with, from the same entry, so the word and the rail agree. */
export function severityMark(severity: RestrictionSeverity): { form: string; glyph: string; edge: string } {
  const mark = RESTRICTION_MARKS[restrictionMarkKey(severity, 'active')]?.mark
  return { form: mark?.form ?? 'unknown', glyph: mark?.glyph ?? 'unknown', edge: mark?.edge ?? 'none' }
}

/**
 * WHERE ONE RESTRICTION STANDS, IN A SENTENCE.
 *
 * ANSWERING ONE VALIDATES NOTHING, and this is the sentence that says so on the page rather than in
 * a document. A restriction with work still owing a re-check is not finished with, and the number
 * of pieces of work owing one is the whole content of that fact.
 */
export function standingSaid(row: RestrictionInProject): string {
  if (!row.answered) {
    // EVERY ONE OF THESE LEADS WITH THE FACT AND NOT WITH THE ABSENCE. "Nothing rests on it" and
    // "Its author said nothing rests on it" say the same thing, and the second one says WHOSE
    // statement it is — which is the whole of what severity is here, since Mole Office never derives it.
    if (row.severity === 'harmless') return t('g7a.placeholders.harmless')
    return row.reaches === 0
      ? t('g7a.placeholders.noLinks')
      : t('g7a.placeholders.reaches', { n: row.reaches })
  }
  const when = row.resolvedAt === null ? '' : t('g7a.placeholders.on', { date: row.resolvedAt.slice(0, 10) })
  if (row.severity === 'harmless') return t('g7a.placeholders.answeredHarmless', { when })
  if (row.owed === 0) return t('g7a.placeholders.answeredChecked', { when })
  return t('g7a.placeholders.owed', { when, n: row.owed })
}

export function PlaceholdersPage() {
  const [reading] = useProjectAsync(async () => (await api.everyRestriction()) as Reading, [])
  const mode = useMode()

  return (
    <div className="page plc">
      <style href={RESTRICTIONS_SHEET} precedence="default">
        {RESTRICTIONS_CSS}
      </style>
      <style href="mole-office-placeholders-page" precedence="default">
        {PLACEHOLDERS_CSS}
      </style>
      {/* THE ROW'S OWN WORDS: the heading says what its rail row says. */}
      <h1 className="plc-title" data-title-is="its-label">{t('nav.placeholders')}</h1>
      {reading.status === 'loading' ? <Loading what={t('g7a.placeholders.loading')} /> : null}
      {reading.status === 'error' ? (
        <ErrorNote
          message={reading.message}
          fault={reading.fault}
          label={t('g7a.placeholders.failed')}
        />
      ) : null}
      {reading.status === 'ready' ? <Bands reading={reading.value} mode={mode} /> : null}
    </div>
  )
}

function Bands({ reading, mode }: { reading: Reading; mode: Mode }) {
  const open = reading.found.filter((row) => !row.answered)
  const answered = reading.found.filter((row) => row.answered)
  return (
    <>
      {/* THE SERVER'S OWN SENTENCE ABOUT ITS OWN ANSWER. The page prints it rather than counting
          the rows again: a second count in the browser could disagree with the reply it describes. */}
      {mode === 'inspect' ? <p className="plc-said">{reading.note}</p> : null}

      <Panel titleIs="label"
        declares={{ surface: 'placeholders.open' }}
        title={t('g7a.placeholders.open')}
        rank={reading.counts.stopsFinal > 0 ? 0 : 1}
        {...(reading.counts.stopsFinal > 0 ? { tone: 'blocked' as const } : {})}
        actions={<Tag tone="quiet">{open.length}</Tag>}
      >
        {open.length === 0 ? (
          <Absence />
        ) : (
          <ul className="rst-list">
            {open.map((row) => (
              <Row key={row.restrictionId} row={row} mode={mode} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel titleIs="label"
        declares={{ surface: 'placeholders.answered' }}
        title={t('g7a.placeholders.answered')}
        rank={2}
        actions={<Tag tone="quiet">{answered.length}</Tag>}
      >
        <p className="rst-said">
          {t('g7a.placeholders.validity')}</p>
        {answered.length === 0 ? (
          <Absence />
        ) : (
          <ul className="rst-list">
            {answered.map((row) => (
              <Row key={row.restrictionId} row={row} mode={mode} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'placeholders.gaps' }} title={t('g7a.placeholders.gaps')} rank={2}>
        {/* NEVER AN EMPTY LIST DRAWN AS A CLEAN RESULT. `couldNotCheck` is not empty today: the
            implementation map has no read that rolls the import graph up to records, so a
            restriction on one record does not reach another whose code imports its code. */}
        {reading.couldNotCheck.length === 0 && reading.skippedDeleted === 0 ? (
          <Absence />
        ) : (
          <ul className="rst-gaps">
            {reading.couldNotCheck.map((gap) => (
              <li key={`${gap.what}:${gap.because}`}>
                {mode === 'inspect' ? <><b>{gap.what}</b> — {gap.because}</> : t('g7a.placeholders.gap')}
              </li>
            ))}
            {reading.skippedDeleted === 0 ? null : (
              <li>
                {t('g7a.placeholders.deleted', { n: reading.skippedDeleted })}
              </li>
            )}
          </ul>
        )}
      </Panel>
    </>
  )
}

/** One restriction: how bad it is, where it stands, what it forbids, and what it is about. */
function Row({ row, mode }: { row: RestrictionInProject; mode: Mode }) {
  const mark = severityMark(row.severity)
  // The pair reading, where the table has one. It carries the resolved date in its own words and is
  // the same sentence the record page draws, so the two surfaces cannot word one standing two ways.
  const pair = row.answered
    ? restrictionDrawing(row.severity, row.owed > 0 ? 'resolved-unchecked' : 'resolved', row.resolvedAt)
    : restrictionDrawing(row.severity, 'active', null)
  return (
    <li className="rst-row" data-form={mark.form} data-glyph={mark.glyph} data-edge={mark.edge} data-severity={row.severity}>
      <p className="rst-word" title={pair?.detail ?? undefined}>
        {severityWord(row.severity)}
      </p>
      <p className="rst-title">
        <RouteLink to={recordPath(row.restrictionId)}>{row.title}</RouteLink>
        <span className="rst-kind">{kindWord(row.kind, mode).text}</span>
      </p>
      <p className="rst-reach">{standingSaid(row)}</p>
      {mode !== 'inspect' || row.holdsField === null ? null : <p className="rst-holds">{t('g7a.placeholders.field', { field: row.holdsField })}</p>}
      {row.disallowedClaims.length === 0 ? null : (
        <div className="rst-claims">
          <h4>{t('g7a.placeholders.claims')}</h4>
          <ul>
            {row.disallowedClaims.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {row.allowedUses.length === 0 ? null : (
        <div className="rst-claims rst-allowed">
          <h4>{t('g7a.placeholders.uses')}</h4>
          <ul>
            {row.allowedUses.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {/* WHAT IT IS ABOUT. A restriction with no `about` link restricts nothing, and the kind's own
          rules say so — it is on this page because somebody filed it, and the line says why it
          reaches nobody rather than leaving a reader to wonder. */}
      {row.about.length === 0 ? (
        <Absence title={t('g7a.placeholders.noAbout')} />
      ) : (
        <p className="rst-about">
          {t('g7a.placeholders.about')}{' '}
          {row.about.map((one, i) => (
            <span key={one.id}>
              {i === 0 ? '' : ', '}
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
            </span>
          ))}
          {row.aboutDeleted === 0
            ? null
            : t('g7a.placeholders.aboutDeleted', { n: row.aboutDeleted })}
        </p>
      )}
    </li>
  )
}

const PLACEHOLDERS_CSS = `
.plc-title { margin: 0 0 var(--pad) 0; font-size: var(--fs-4); }
.plc-said { color: var(--text-2); font-size: var(--fs-1); margin: 0 0 var(--pad-lg) 0; max-width: var(--measure-in-box); }
.rst-about { margin: calc(var(--pad) * 0.5) 0 0 0; color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
`
