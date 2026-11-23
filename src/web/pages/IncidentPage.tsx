// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/incident/<id>` — ONE INCIDENT, READ AS A SCENE, NOT AS A FORM. Criterion I3.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION
 * ---------------------------------------------------------------------------------------
 *
 * design/incidents/ACCEPTANCE.md asks that the incident page read as a scene, not a form. The timeline
 * drawn in order with its evidence one press away; the loss in the person's own words first; the three
 * responsibility sentences with their uncertainty beside them; the corrective actions with their
 * state (decided, built, verified) read from the records they link, never typed twice.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER OF THE SCENE IS THE ORDER THE CRITERION ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The loss stands first, because it is what the page is about and it is the person's words when they said
 * them. The timeline is a story read top to bottom in the order the moments were appended —
 * `timelineInOrder`, never a sort on a free-text field. The three responsibility sentences stand
 * with their uncertainty beside them, because a sentence weighing blame without its certainty beside
 * it reads as more settled than it is. The corrective actions come last among the reading panels,
 * because they are what follows from everything above.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS TYPED TWICE
 * ---------------------------------------------------------------------------------------
 *
 * Every word this page draws is read off a record. The evidence press names the evidence record's
 * own title, read by fetching it. A corrective action's state is read off the record it became —
 * `correctiveActionState` below, exported so a test holds the reading without a server. Nothing
 * here stores a second copy of a state word, and nothing on this page can drift from what the
 * linked records say.
 *
 * WHERE THE READING HAS TO SAY WHAT IT READ (the eighth invariant): a corrective action's word is
 * drawn with what it was read from beside it, because "decided" is a claim this page makes about
 * somebody else's record and a reader has to be able to check the reading against the record.
 */

import { useRef, useState } from 'react'
import { api } from '../api.ts'
import { consumePreparedPage, peekPreparedPage } from '../lib/prepared-page.ts'
import { Absence, ErrorNote, Loading, Panel } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, recordPath, incidentPath } from '../components/router.tsx'
import {
  timelineInOrder,
  type IncidentCause,
  type IncidentCorrectiveAction,
  type IncidentMoment,
  type IncidentResponsibility,
} from '@shared/incident.ts'
import { stateWord } from '@shared/words.ts'
import { content, t } from '@shared/i18n.ts'
import { useInspect } from '../lib/mode.ts'

/**
 * EVERY WORD THIS PAGE DRAWS THAT IS NOT READ OFF A RECORD, read from the word lists in the page's
 * language when it is drawn (section R8b of src/shared/words). A getter, so a change of language
 * redraws in the new words; under Node, where a test draws the scene, t() answers in English.
 * A sentence with a value in it (a title, a name, a time) is read with t() where it is drawn.
 */
export const SCENE_WORDS = {
  get theLoss() { return t('unrowedPages.incident.theLoss') },
  get when() { return t('unrowedPages.incident.when') },
  get where() { return t('unrowedPages.incident.where') },
  get timeline() { return t('unrowedPages.incident.timeline') },
  get evidenceGone() { return t('unrowedPages.incident.evidenceGone') },
  get expected() { return t('unrowedPages.incident.expected') },
  get actual() { return t('unrowedPages.incident.actual') },
  get causes() { return t('unrowedPages.incident.causes') },
  get direct() { return t('unrowedPages.incident.direct') },
  get contributing() { return t('unrowedPages.incident.contributing') },
  get responsibility() { return t('unrowedPages.incident.responsibility') },
  get thePerson() { return t('unrowedPages.incident.thePerson') },
  get theAgents() { return t('unrowedPages.incident.theAgents') },
  get theOffice() { return t('unrowedPages.incident.theOffice') },
  get corrective() { return t('unrowedPages.incident.corrective') },
  get state() { return t('unrowedPages.incident.state') },
  /** The three words a corrective action's state is drawn in, keyed by the reading's own word. */
  get decided() { return t('unrowedPages.incident.decided') },
  get built() { return t('unrowedPages.incident.built') },
  get verified() { return t('unrowedPages.incident.verified') },
  get verification() { return t('unrowedPages.incident.verification') },
  get verifiedYes() { return t('unrowedPages.incident.verifiedYes') },
  get verifiedNo() { return t('unrowedPages.incident.verifiedNo') },
  get closedLine() { return t('unrowedPages.incident.closed') },
}

/**
 * WHAT A CORRECTIVE ACTION'S STATE IS, AND WHERE IT WAS READ FROM.
 *
 * `word` is one of the three the criterion names. `readFrom` says which record the word was read off,
 * and is drawn beside it, because a state that came from a record has to say which one.
 */
export type CorrectiveActionState =
  | { word: 'decided' | 'built' | 'verified'; readFrom: string }
  | { word: null; says: string }

/** What the record a corrective action names is, to this reading. */
export interface CorrectiveActionTarget {
  kind: string
  state?: unknown
}

/**
 * THE ONE READING OF A CORRECTIVE ACTION'S STATE. Criterion I3: read from the records it links,
 * never typed twice.
 *
 * Each word is traceable to the record it was read from, and the trace is part of the answer:
 *
 *   - a criterion named: the rule was written, which is the deciding — `decided`.
 *   - a decision named: a decision record is the record of the deciding — `decided`.
 *   - a problem named: the problem's own state word decides. `fixed` or `worked_around` means the
 *     fix exists — `built`. Any other word, or none, means the fix is still owed — `decided`.
 *   - `verified`: nothing a corrective action links to says verified, and the incident's own
 *     `verification` field is the one record that can — so when it says verified, every action
 *     with a record behind it reads `verified`. The page draws what the word was read from beside
 *     it, so the reading is visible rather than silent.
 *   - nothing named, or the named record gone: the absence, in the words the kind declares.
 */
export function correctiveActionState(
  action: Pick<IncidentCorrectiveAction, 'becameRecordId' | 'becameCriterion'>,
  target: CorrectiveActionTarget | undefined,
  incidentVerified: boolean | undefined,
): CorrectiveActionState {
  if (action.becameRecordId === undefined && action.becameCriterion === undefined) {
    return { word: null, says: t('unrowedPages.incident.unlinked') }
  }
  if (incidentVerified === true && action.becameRecordId !== undefined) {
    return { word: 'verified', readFrom: t('unrowedPages.incident.readFrom.verification') }
  }
  if (action.becameCriterion !== undefined) {
    return { word: 'decided', readFrom: t('unrowedPages.incident.readFrom.rule', { criterion: content(action.becameCriterion) }) }
  }
  // THE RECORD NAMED IS GONE. Its id is not in the sentence: an id is drawn in developer mode only
  // and the page draws it there beside this.
  if (target === undefined) {
    return { word: null, says: t('unrowedPages.incident.actionGone') }
  }
  if (target.kind === 'decision') {
    return { word: 'decided', readFrom: t('unrowedPages.incident.readFrom.decision') }
  }
  // A PROBLEM'S OWN STATE WORD IS THE READING. Nothing on the incident stores a second copy of it.
  const state = typeof target.state === 'string' ? target.state : undefined
  if (state === 'fixed' || state === 'worked_around') {
    return { word: 'built', readFrom: t('unrowedPages.incident.readFrom.problem', { state: stateWord(state).text }) }
  }
  return {
    word: 'decided',
    readFrom:
      state === undefined
        ? t('unrowedPages.incident.readFrom.problemNoState')
        : t('unrowedPages.incident.readFrom.problem', { state: stateWord(state).text }),
  }
}

/** The incident's data, read as the scene needs it, with every field left absent where it is absent. */
export interface TheSceneRead {
  loss?: string
  happenedAt?: { from?: string; to?: string }
  where?: Record<string, unknown>
  timeline: IncidentMoment[]
  expected?: string
  actual?: string
  responsibility?: IncidentResponsibility
  correctiveActions: IncidentCorrectiveAction[]
  verification?: { how?: string; verified?: boolean }
  state?: string
  foundBy?: string
  closedWith?: { note: string; by: string; at: string }
}

export function readTheScene(data: unknown): TheSceneRead {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { timeline: [], correctiveActions: [] }
  }
  const held = data as Record<string, unknown>
  const timeline = Array.isArray(held['timeline'])
    ? (timelineInOrder(held['timeline'] as IncidentMoment[]) as IncidentMoment[])
    : []
  const correctiveActions = Array.isArray(held['corrective_actions'])
    ? (held['corrective_actions'] as IncidentCorrectiveAction[])
    : []
  return {
    loss: typeof held['loss'] === 'string' ? held['loss'] : undefined,
    happenedAt: spanOf(held['happened_at']),
    where: isJsonObject(held['where']) ? (held['where'] as Record<string, unknown>) : undefined,
    timeline,
    expected: typeof held['expected'] === 'string' ? held['expected'] : undefined,
    actual: typeof held['actual'] === 'string' ? held['actual'] : undefined,
    responsibility: isJsonObject(held['responsibility'])
      ? (held['responsibility'] as unknown as IncidentResponsibility)
      : undefined,
    correctiveActions,
    verification: verificationOf(held['verification']),
    state: typeof held['state'] === 'string' ? held['state'] : undefined,
    foundBy: typeof held['found_by'] === 'string' ? held['found_by'] : undefined,
    closedWith: closedWithOf(held['closedWith']),
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function spanOf(value: unknown): { from?: string; to?: string } | undefined {
  if (!isJsonObject(value)) return undefined
  return {
    from: typeof value['from'] === 'string' ? value['from'] : undefined,
    to: typeof value['to'] === 'string' ? value['to'] : undefined,
  }
}

function verificationOf(value: unknown): { how?: string; verified?: boolean } | undefined {
  if (!isJsonObject(value)) return undefined
  return {
    how: typeof value['how'] === 'string' ? value['how'] : undefined,
    verified: typeof value['verified'] === 'boolean' ? value['verified'] : undefined,
  }
}

function closedWithOf(value: unknown): { note: string; by: string; at: string } | undefined {
  if (!isJsonObject(value)) return undefined
  const note = value['note']
  const by = value['by']
  const at = value['at']
  if (typeof note !== 'string' || typeof by !== 'string' || typeof at !== 'string') return undefined
  return { note, by, at }
}

/** What the page fetches: the incident, and every other record its scene names. */
export interface TheScene {
  /** The incident itself. */
  record: { id: string; kind: string; title: string; summary?: string | null; data: unknown }
  /** Every other record the scene names, by id. A name the office can no longer answer is `null`. */
  others: Map<string, { kind: string; title: string; state?: unknown } | null>
}

export async function loadIncidentScene(id: string): Promise<TheScene> {
    const detail = await api.getRecord(id)
    const scene = readTheScene(detail.record.data)
    // EVERY RECORD THE SCENE NAMES, READ SO THE PAGE DRAWS ITS TITLE AND ITS STATE, never a
    // second copy of either. One that cannot be read comes back null and is drawn as the
    // absence it is, not dropped.
    const wanted = new Set<string>()
    for (const moment of scene.timeline) wanted.add(moment.evidence)
    for (const action of scene.correctiveActions) {
      if (typeof action.becameRecordId === 'string') wanted.add(action.becameRecordId)
    }
    for (const cause of [...directCauses(detail.record.data), ...contributingFactors(detail.record.data)]) {
      if (typeof cause.problemId === 'string') wanted.add(cause.problemId)
    }
    const pairs = await Promise.all(
      [...wanted].map(async (one) => {
        try {
          const other = await api.getRecord(one)
          const otherData = readTheScene(other.record.data)
          return [one, { kind: other.record.kind, title: other.record.title, state: otherData.state }] as const
        } catch {
          return [one, null] as const
        }
      }),
    )
    return {
      record: {
        id: detail.record.id,
        kind: detail.record.kind,
        title: detail.record.title,
        summary: detail.record.summary,
        data: detail.record.data,
      },
      others: new Map(pairs),
    }
}

export function IncidentPage({ id }: { id: string }) {
  const [held] = useState(() => peekPreparedPage<TheScene>(incidentPath(id)))
  const used = useRef(false)
  const ready = used.current || held === undefined ? undefined : peekPreparedPage(incidentPath(id), held)
  const [state] = useProjectAsync<TheScene>(() => {
    if (ready !== undefined && !used.current) { used.current = true; consumePreparedPage(ready); return Promise.resolve(ready.value) }
    used.current = true
    return loadIncidentScene(id)
  }, [id], ready === undefined ? {} : { startFrom: { value: ready.value } })
  return (
    <div className="page inc">
      <style href="mole-office-incident" precedence="default">
        {INCIDENT_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('unrowedPages.incident.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheSceneView said={state.value} /> : null}
    </div>
  )
}

/**
 * THE SCENE, GIVEN WHAT WAS FETCHED.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER, the way `TheCensus` and `TheNotebook` are: this
 * half is a pure function of what was fetched, and that is the half a test can hold still.
 */
export function TheSceneView({ said }: { said: TheScene }) {
  const scene = readTheScene(said.record.data)
  return (
    <>
      <header className="inc-head">
        {/* THE INCIDENT'S OWN TITLE IS THE HEADING, as a record's is, and not a typed name. */}
        <h1 className="inc-title">{said.record.title}</h1>
        <p className="inc-state-line">
          <span className="inc-state-word">{SCENE_WORDS.state}</span>
          {scene.state === undefined ? (
            // The absence, handed to the component so the tier is chosen here and counted there.
            <Absence
              tier="told-apart"
              looked
              word={t('unrowedPages.incident.notSaid')}
              title={SCENE_WORDS.state}
            />
          ) : (
            <span className="inc-state">{stateWord(scene.state).text}</span>
          )}
          {scene.foundBy === undefined ? null : (
            <span className="inc-found">{t('unrowedPages.incident.foundBy', { who: content(scene.foundBy) })}</span>
          )}
        </p>
        {scene.closedWith === undefined ? null : (
          <p className="inc-closed">
            <span className="inc-closed-word">{SCENE_WORDS.closedLine}</span> — {content(scene.closedWith.note)}{' '}
            <span className="inc-closed-by">
              {t('unrowedPages.incident.closedBy', { by: content(scene.closedWith.by), at: content(scene.closedWith.at) })}
            </span>
          </p>
        )}
        <RouteLink to="/records" className="inc-back">
          {t('nav.records')}
        </RouteLink>
      </header>

      {/* THE LOSS FIRST. It is what happened to the person, in their words where they said them, and a reader
          who reads nothing else on this page still reads the reason the page exists. */}
      <Panel titleIs="label" declares={{ surface: 'incident.loss' }} title={SCENE_WORDS.theLoss}>
        {scene.loss === undefined ? (
          <Absence tier="told-apart" looked word={t('unrowedPages.incident.notSaid')} title={SCENE_WORDS.theLoss} />
        ) : (
          <p className="inc-loss wrap-anywhere">{scene.loss}</p>
        )}
        <dl className="inc-facts">
          {scene.happenedAt === undefined ? null : (
            <div className="inc-fact">
              <dt>{SCENE_WORDS.when}</dt>
              <dd>
                {scene.happenedAt.from ?? <Absence tier="ordinary" title={t('unrowedPages.incident.noStart')} />}
                {scene.happenedAt.to === undefined ? null : (
                  <span className="inc-to"> {t('unrowedPages.incident.until', { time: content(scene.happenedAt.to) })}</span>
                )}
              </dd>
            </div>
          )}
          {scene.where === undefined ? null : (
            <div className="inc-fact">
              <dt>{SCENE_WORDS.where}</dt>
              <dd className="wrap-anywhere">
                {whereSentence(scene.where) ?? <Absence tier="ordinary" title={t('unrowedPages.incident.noWhere')} />}
              </dd>
            </div>
          )}
        </dl>
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'incident.timeline' }} title={SCENE_WORDS.timeline}>
        {scene.timeline.length === 0 ? (
          <Absence tier="told-apart" looked title={SCENE_WORDS.timeline} />
        ) : (
          <ol className="inc-timeline">
            {scene.timeline.map((moment) => (
              <Moment key={moment.id} moment={moment} said={said} />
            ))}
          </ol>
        )}
      </Panel>

      <Panel declares={{ surface: 'incident.expected' }} title={SCENE_WORDS.expected}>
        <p className="inc-exp wrap-anywhere">{scene.expected ?? <Absence tier="told-apart" looked word={t('unrowedPages.incident.notSaid')} />}</p>
        <p className="inc-exp-label">{SCENE_WORDS.actual}</p>
        <p className="inc-act wrap-anywhere">{scene.actual ?? <Absence tier="told-apart" looked word={t('unrowedPages.incident.notSaid')} />}</p>
      </Panel>

      {/* THE CAUSES, each linked to the problem it is where one exists — the field I1 gives the
          kind, drawn here because the responsibility that follows cannot be read without them. */}
      <Panel titleIs="label" declares={{ surface: 'incident.causes' }} title={SCENE_WORDS.causes}>
        <Causes title={SCENE_WORDS.direct} causes={directCauses(said.record.data)} said={said} />
        <Causes title={SCENE_WORDS.contributing} causes={contributingFactors(said.record.data)} said={said} />
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'incident.responsibility' }} title={SCENE_WORDS.responsibility}>
        {scene.responsibility === undefined ? (
          <Absence
            tier="told-apart"
            looked
            word={t('unrowedPages.incident.notWeighed')}
            title={SCENE_WORDS.responsibility}
          />
        ) : (
          <TheResponsibility said={scene.responsibility} />
        )}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'incident.corrective' }} title={SCENE_WORDS.corrective}>
        {scene.correctiveActions.length === 0 ? (
          // ORDINARY EMPTINESS IS THE SHORT MARK, with the reason on hover and read out to a screen
          // reader (plan 7FEOshq3mBGG, block b-6, check 4).
          <Absence word={t('absence.none')} />
        ) : (
          <ul className="inc-actions">
            {scene.correctiveActions.map((action) => (
              <Action key={action.id} action={action} said={said} verified={scene.verification?.verified} />
            ))}
          </ul>
        )}
      </Panel>

      {scene.verification === undefined ? null : (
        <Panel titleIs="label" declares={{ surface: 'incident.verification' }} title={SCENE_WORDS.verification}>
          {scene.verification.how === undefined ? null : <p className="inc-verify-how wrap-anywhere">{scene.verification.how}</p>}
          <p className="inc-verify-word">
            {scene.verification.verified === undefined ? (
              <Absence tier="ordinary" title={t('unrowedPages.incident.noVerified')} />
            ) : scene.verification.verified ? (
              SCENE_WORDS.verifiedYes
            ) : (
              SCENE_WORDS.verifiedNo
            )}
          </p>
        </Panel>
      )}
    </>
  )
}

/** The three sentences, each with its uncertainty beside it — criterion I3. */
function TheResponsibility({ said }: { said: IncidentResponsibility }) {
  const parts: { name: string; part: { sentence?: string; uncertainty?: string; handles?: string[] } | undefined }[] = [
    { name: SCENE_WORDS.thePerson, part: partOf(said['person']) },
    { name: SCENE_WORDS.theAgents, part: partOf(said['agents']) },
    { name: SCENE_WORDS.theOffice, part: partOf(said['office']) },
  ]
  return (
    <ul className="inc-resp">
      {parts.map((one) => (
        <li key={one.name} className="inc-resp-part">
          <span className="inc-resp-name">{one.name}</span>
          {one.part === undefined || one.part.sentence === undefined ? (
            <Absence tier="ordinary" title={t('unrowedPages.incident.noPart')} />
          ) : (
            <span className="inc-resp-sentence wrap-anywhere">{one.part.sentence}</span>
          )}
          {one.part === undefined || one.part.uncertainty === undefined ? null : (
            <span className="inc-resp-uncertain" title={t('unrowedPages.incident.howSure', { uncertainty: content(one.part.uncertainty) })}>
              {one.part.uncertainty}
            </span>
          )}
          {one.part === undefined || one.part.handles === undefined ? null : one.part.handles.length === 0 ? null : (
            <span className="inc-resp-handles">{one.part.handles.join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function partOf(value: unknown): { sentence?: string; uncertainty?: string; handles?: string[] } | undefined {
  if (!isJsonObject(value)) return undefined
  return {
    sentence: typeof value['sentence'] === 'string' ? value['sentence'] : undefined,
    uncertainty: typeof value['uncertainty'] === 'string' ? value['uncertainty'] : undefined,
    handles: Array.isArray(value['handles']) ? (value['handles'] as unknown[]).filter((h): h is string => typeof h === 'string') : undefined,
  }
}

/** The two cause lists, each read only where the record holds it. */
function causesOf(data: unknown, field: string): IncidentCause[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const held = (data as Record<string, unknown>)[field]
  return Array.isArray(held) ? (held as IncidentCause[]) : []
}

function directCauses(data: unknown): IncidentCause[] {
  return causesOf(data, 'direct_causes')
}

function contributingFactors(data: unknown): IncidentCause[] {
  return causesOf(data, 'contributing_factors')
}

/** One list of causes: the sentence, and the problem it is, where one exists. */
function Causes({ title, causes, said }: { title: string; causes: IncidentCause[]; said: TheScene }) {
  return (
    <div className="inc-causes-group">
      <p className="inc-causes-title">{title}</p>
      {causes.length === 0 ? (
        <Absence tier="told-apart" looked word={t('unrowedPages.incident.notSaid')} />
      ) : (
        <ul className="inc-causes">
          {causes.map((cause) => {
            const problem = typeof cause.problemId === 'string' ? said.others.get(cause.problemId) : undefined
            return (
              <li key={cause.id} className="inc-cause wrap-anywhere">
                <span className="inc-cause-text">{cause.text}</span>
                {typeof cause.problemId === 'string' && problem != null ? (
                  <RouteLink to={recordPath(cause.problemId)} className="inc-cause-link">
                    {problem.title}
                  </RouteLink>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** One moment: when, who or what, what happened, and the evidence one press away. */
function Moment({ moment, said }: { moment: IncidentMoment; said: TheScene }) {
  const inspect = useInspect()
  const other = typeof moment.evidence === 'string' ? said.others.get(moment.evidence) : undefined
  return (
    <li className="inc-moment">
      <span className="inc-moment-at">{moment.at}</span>
      <span className="inc-moment-who wrap-anywhere">{moment.who}</span>
      <span className="inc-moment-what wrap-anywhere">{moment.what}</span>
      {/* THE EVIDENCE, ONE PRESS AWAY. The press names the record it opens by its own title, read
          off that record, never typed on this page — and the press goes to the record's own page,
          where the words are. */}
      {typeof moment.evidence !== 'string' || moment.evidence === '' ? (
        <Absence tier="ordinary" title={t('unrowedPages.incident.noEvidence')} />
      ) : other === undefined ? (
        // A RECORD THE PAGE DID NOT READ: the press still goes there. Its id is the only name the
        // page has, and an id is drawn in developer mode only.
        <RouteLink to={recordPath(moment.evidence)} className="inc-evidence inc-evidence-id">
          {inspect
            ? t('unrowedPages.incident.evidence', { title: content(moment.evidence) })
            : t('unrowedPages.incident.evidenceUnread')}
        </RouteLink>
      ) : other === null ? (
        <span className="inc-evidence-gone">
          {SCENE_WORDS.evidenceGone}
        </span>
      ) : (
        <RouteLink to={recordPath(moment.evidence)} className="inc-evidence">
          {t('unrowedPages.incident.evidence', { title: content(other.title) })}
        </RouteLink>
      )}
    </li>
  )
}

/** One corrective action, with its state read off the record it names and the reading said beside it. */
function Action({
  action,
  said,
  verified,
}: {
  action: IncidentCorrectiveAction
  said: TheScene
  verified: boolean | undefined
}) {
  const inspect = useInspect()
  const target = typeof action.becameRecordId === 'string' ? said.others.get(action.becameRecordId) : undefined
  const state = correctiveActionState(action, target ?? undefined, verified)
  return (
    <li className="inc-action">
      <span className="inc-action-text wrap-anywhere">{action.text}</span>
      {typeof action.becameRecordId === 'string' && target !== undefined && target !== null ? (
        <RouteLink to={recordPath(action.becameRecordId)} className="inc-action-link">
          {t('unrowedPages.incident.became', { title: content(target.title) })}
        </RouteLink>
      ) : typeof action.becameRecordId === 'string' ? (
        // THE ID OF A RECORD THAT IS GONE, in developer mode only. The
        // sentence beside it says the record is gone in every mode.
        inspect ? <span className="inc-action-gone">{action.becameRecordId}</span> : null
      ) : action.becameCriterion === undefined ? null : (
        <span className="inc-action-criterion">
          {t('unrowedPages.incident.criterionItBecame', { criterion: content(action.becameCriterion) })}
        </span>
      )}
      {state.word === null ? (
        <Absence tier="ordinary" title={state.says} />
      ) : (
        <span className="inc-action-state" title={t('unrowedPages.incident.readFrom', { what: state.readFrom })}>
          <span className="inc-action-state-word">{SCENE_WORDS[state.word]}</span>
        </span>
      )}
    </li>
  )
}

/** Where it happened, as one line — each part present only where somebody recorded it. */
function whereSentence(where: Record<string, unknown>): string | null {
  const parts: string[] = []
  const project = where['project']
  const experimentOrModule = where['experimentOrModule']
  const machine = where['machine']
  if (typeof project === 'string' && project.trim() !== '') parts.push(content(project))
  if (typeof experimentOrModule === 'string' && experimentOrModule.trim() !== '') parts.push(content(experimentOrModule))
  if (typeof machine === 'string' && machine.trim() !== '') parts.push(t('unrowedPages.incident.onMachine', { machine: content(machine) }))
  if (parts.length === 0) return null
  return parts.reduce((first, second) => t('unrowedPages.incident.whereAndThen', { first, second }))
}

/**
 * The page's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const INCIDENT_CSS = `
.inc-head { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin-bottom: var(--gut); }
.inc-title { margin: 0; font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); }
.inc-state-line { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad); min-width: 0; }
.inc-state-word { color: var(--text-3); font-size: var(--fs-1); }
.inc-state { color: var(--text); font-size: var(--fs-2); }
.inc-found { color: var(--text-3); font-size: var(--fs-1); }
.inc-closed { margin: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.inc-closed-word { color: var(--text); font-size: var(--fs-2); font-weight: 600; }
.inc-closed-by { color: var(--text-3); }
.inc-back { font-size: var(--fs-1); align-self: flex-start; }

/* THE LOSS, FIRST. The words are drawn at the reading size, not smaller: they are the point. */
.inc-loss { margin: 0 0 var(--pad); font: var(--fs-3)/var(--lh-read) var(--font-ui); color: var(--text); }
.inc-facts { margin: 0; display: flex; flex-wrap: wrap; gap: 6px var(--gut); }
.inc-fact { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.inc-fact dt { color: var(--text-3); font-size: var(--fs-1); }
.inc-fact dd { margin: 0; color: var(--text); font-size: var(--fs-2); }

/* THE TIMELINE. One row per moment, in append order; the press to the evidence sits at the end of
   the row, where a reader looks for what backs the words. */
.inc-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad); }
.inc-moment { display: grid; grid-template-columns: 11rem minmax(4rem, auto) 1fr; gap: var(--pad); align-items: baseline; min-width: 0; }
.inc-moment-at { color: var(--text-2); font-size: var(--fs-1); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.inc-moment-who { color: var(--text); font-size: var(--fs-2); }
.inc-moment-what { color: var(--text); font-size: var(--fs-2); }
.inc-evidence {
  grid-column: 1 / -1; justify-self: start; margin-top: 2px;
  color: var(--accent); font-size: var(--fs-1); text-decoration: underline; text-underline-offset: 2px;
  overflow-wrap: anywhere;
}
.inc-evidence-gone { grid-column: 1 / -1; color: var(--text-3); font-size: var(--fs-1); }

.inc-exp-label { margin: var(--pad) 0 0; color: var(--text-3); font-size: var(--fs-1); }
.inc-exp, .inc-act { margin: 0; color: var(--text); font-size: var(--fs-2); }

/* THE CAUSES. Each is a sentence, and where it is a problem the problem's own name is the press. */
.inc-causes-group + .inc-causes-group { margin-top: var(--pad); }
.inc-causes-title { margin: 0 0 6px; color: var(--text-3); font-size: var(--fs-1); }
.inc-causes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.inc-cause { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad); min-width: 0; }
.inc-cause-text { color: var(--text); font-size: var(--fs-2); min-width: 0; }
.inc-cause-link { color: var(--accent); font-size: var(--fs-1); }

/* THE THREE RESPONSIBILITY SENTENCES, EACH WITH ITS UNCERTAINTY BESIDE IT. */
.inc-resp { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad); }
.inc-resp-part { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad); min-width: 0; }
.inc-resp-name { flex: none; color: var(--text-3); font-size: var(--fs-1); min-width: 5.5rem; }
.inc-resp-sentence { color: var(--text); font-size: var(--fs-2); min-width: 0; }
.inc-resp-uncertain { color: var(--text-3); font-size: var(--fs-1); }
.inc-resp-handles { color: var(--text-2); font-size: var(--fs-1); }

/* THE CORRECTIVE ACTIONS. The state word and what it was read from, beside what was done. */
.inc-actions { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad); }
.inc-action { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad); min-width: 0; }
.inc-action-text { color: var(--text); font-size: var(--fs-2); min-width: 0; }
.inc-action-link { color: var(--accent); font-size: var(--fs-1); }
.inc-action-criterion, .inc-action-gone { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.inc-action-state { flex: none; display: inline-flex; align-items: baseline; gap: 6px; }
.inc-action-state-word {
  font-size: var(--fs-1); font-weight: 600; color: var(--text);
  border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 1px 6px;
}

.inc-verify-how { margin: 0 0 var(--pad); color: var(--text); font-size: var(--fs-2); }
.inc-verify-flag { margin: 0; color: var(--text-2); font-size: var(--fs-1); }

/* AT PHONE WIDTH the timeline's row becomes a column, because three columns of wrapped words do
   not read at 390 and the order of the story matters more than the shape of the row. */
@media (max-width: 40rem) {
  .inc-moment { grid-template-columns: 1fr; gap: 2px; }
  .inc-resp-name { min-width: 0; }
}
`