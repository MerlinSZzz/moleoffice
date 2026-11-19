// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/agents-at-work` — THE AGENTS AT WORK ON THIS PROJECT NOW.
 *
 * The page was called "Office Map" at `#/working` until wave 13y round 120, and the old address still
 * lands here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round ten built the work-domain machinery, the attachment store, the presence reading and the
 * work-state store, and drew none of it. `#/working` was written into a design and typed into a
 * browser, and the browser answered *There is no page at /working*, because the word was in no
 * route and in no rail row. The owner's brief, section 21, asks for the human projection over all
 * of it, and this is that page.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DIMENSIONS, DRAWN AS TWO DIMENSIONS
 * ---------------------------------------------------------------------------------------
 *
 * Every row shows two words side by side and neither is worked out from the other. **What it says
 * it is doing** is its work state. **Whether it can be reached** is its presence. All fifteen pairs
 * of the two vocabularies occur, and the one a reader will want to call impossible — offline while
 * still working — is what a provider dying mid-task looks like. `src/shared/lifecycle.ts` holds the
 * two lists and joins them nowhere; this page draws them and joins them nowhere either.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS EMPTY TODAY AND THE EMPTINESS IS THE CONTENT
 * ---------------------------------------------------------------------------------------
 *
 * On this corpus there are no durable agents, no work domains and no work-state history — and the
 * three of those are not one fact. Nobody has filed an agent. Nobody has filed a domain. And the
 * table that holds work-state history is not on this database at all, so **nobody has looked**
 * rather than **there is none**.
 *
 * So the empty page says which kind of empty each thing is, one line each, using `Absence` at the
 * told-apart tier — the component this product already has for exactly this distinction, drawn with
 * a dashed edge for *nobody looked* and no edge at all for *there are none*. Nothing here invents a
 * row to make the page look inhabited.
 *
 * ---------------------------------------------------------------------------------------
 * NORMAL MODE STAYS CALM
 * ---------------------------------------------------------------------------------------
 *
 * The brief: *"Keep normal mode calm. Do not expose low-level process machinery by default."* So
 * the provider session, the machine, the terminal, the working directory, the resolver version and
 * the three presence inputs are drawn only in Developer. Normal mode gets the words a person acts
 * on and the sentences behind them.
 */

import { useState, useSyncExternalStore } from 'react'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { api, errorMessage, getActor } from '../api.ts'
import type { WhoIsWorking, WorkingRow } from '../../server/lib/working.ts'
import { useInspect } from '../lib/mode.ts'
import { presenceWord } from '../lib/server-sentences.ts'
import { recordPath, RouteLink } from '../components/router.tsx'
import { Absence, ErrorNote, Explain, Loading, Panel, Tag } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { UnregisteredAgents } from '../components/UnregisteredAgents.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import { Avatar } from '../components/Avatar.tsx'
import { AgentAppearance, NOTHING_OPEN, type RosterEditor } from '../components/AgentAppearance.tsx'

/**
 * Every word this page draws that is not read off the server.
 *
 * The rest of the page's words are the server's, or the two vocabularies in src/shared/lifecycle.ts.
 */
export const WORKING_WORDS = {
  /**
   * THE PRESS ON A ROW NOBODY IS DOWN AS HAVING STARTED. Criterion P1, problem `MAZyrG2KH_jo`.
   *
   * It says what pressing it makes true, in the reader's own words, because that is exactly what it
   * writes: a person saying they started this agent. It does not say what it mends -- a button that
   * explained the chain of starters would be a sentence where a press belongs.
   */
  get iStartedIt() { return t('g6a.working.iStartedIt') },
} as const

export function WorkingPage() {
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [state, reload] = useProjectAsync(() => api.whoIsWorking(), [])
  const inspect = useInspect()
  // WHICH ROW'S EDITOR IS OPEN, HELD HERE AND NOT IN THE ROW. A write reloads the reading, which
  // unmounts every row and builds them again, so a row that remembered this itself closed its own
  // editor after every write. Problem `01gd2UhM8FSB`. This component is not unmounted by a reload.
  const [editor, setEditor] = useState<RosterEditor>(NOTHING_OPEN)

  return (
    <div className="page wrk">
      <style href="mole-office-working-page" precedence="default">
        {WORKING_CSS}
      </style>
      {/* THE ROW'S OWN WORDS: the heading says what its rail row says. */}
      <h1 className="wrk-title" data-title-is="its-label">{t('g6a.working.title')}</h1>
      {state.status === 'loading' ? <Loading what={t('g6a.working.loading')} /> : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} label={t('g6a.working.failed')} />
      ) : null}
      {state.status === 'ready' ? (
        <WorkingReading
          reading={state.value}
          inspect={inspect}
          onChanged={reload}
          editor={editor}
          onEditor={setEditor}
        />
      ) : null}
    </div>
  )
}

/**
 * The whole page below the heading, given a reading.
 *
 * EXPORTED FOR ONE TEST AND NOT FOR A CALLER. `tests/nothing-there-is-not-nobody-looked.test.ts`
 * renders it twice — once from a reply whose work state was never read, once from a reply that was
 * read and found nothing — and fails when the two draw the same markup. That check cannot be made
 * against the page component itself, which fetches.
 */
export function WorkingReading({
  reading,
  inspect,
  onChanged = () => {},
  editor = NOTHING_OPEN,
  onEditor = () => {},
}: {
  reading: WhoIsWorking
  inspect: boolean
  /** Read the page again after somebody changed a name or a picture. Nothing by default, for a test. */
  onChanged?: () => void
  /** Which row's editor is open and what its last write said. Nothing open by default, for a test. */
  editor?: RosterEditor
  onEditor?: (next: RosterEditor) => void
}) {
  return (
    <>
      {/* THE SERVER'S OWN SENTENCE ABOUT ITS OWN ANSWER, printed rather than rebuilt here. A second
          count in the browser could disagree with the reply it is describing. */}
      {inspect ? <p className="wrk-said">{reading.note}</p> : null}

      {/* THE ROSTER, AND BESIDE IT WHAT THE READING COULD NOT SEE AND HOW IT WAS WORKED OUT, by the
          product's one width rule in components/SideBySide.tsx. The roster is a list of agents; the
          panels beside it are notes about that list, a different kind of thing. On a narrower screen
          the notes stand under the roster, in the order they always had. When there is no note to
          draw, the roster takes the whole width. */}
      <SideBySide className="wrk-sides">
      <div className="wrk-main" data-column="start">
      <Panel titleIs="label"
        declares={{ surface: 'working.roster' }}
        title={t('g6a.working.roster')}
        actions={<Tag tone="quiet">{reading.rows.length}</Tag>}
      >
        {reading.rows.length === 0 ? (
          <Absence />
        ) : (
          <ul className="wrk-list">
            {reading.rows.map((row) => (
              <Row
                key={row.agentId}
                row={row}
                inspect={inspect}
                onChanged={onChanged}
                editor={editor}
                onEditor={onEditor}
              />
            ))}
          </ul>
        )}
      </Panel>

      </div>

      <div className="wrk-side" data-column="end">
      {/* WHO HAS BEEN WRITING THAT NO REGISTRY ANSWERS FOR. Named, with no press, which is the
          owner's F1 answer. A new write from an unknown agent is refused at the door (criterion M14
          as amended on 30 September 2026), so the rows are the writers that may write without a
          registration and the unknown agents that wrote before the refusal existed. It draws nothing
          at all when there is nobody.

          UNDER THE ROSTER AND NOT ABOVE IT. This page is called "Who is working", and this panel is
          about who is NOT registered — a note beside the page's subject rather than the subject. It
          sat on top, and at 390 pixels wide it pushed the roster most of a screen down. */}
      <UnregisteredAgents rows={reading.unregistered} />

      {reading.absences.length === 0 ? null : (
        <Panel titleIs="label" declares={{ surface: 'working.nobody' }} title={t('g6a.working.empty')} rank={2}>
          <ul className="wrk-absences">
            {reading.absences.map((one) => (
              <li key={`${one.code}:${one.answer}`} className="wrk-absence">
                {/* THE NAME IS DRAWN FROM THE WORDS FILES BY THE SERVER'S CODE, not from its English `what`, so it
                    is in the page's language (wave 13y round 121). */}
                <span className="wrk-absence-what">{t(`g6a.working.absence.${one.code}`)}</span>
                {/* THE ONE DRAWING IN THIS PRODUCT THAT TELLS THE TWO EMPTINESSES APART. `looked`
                    is true when the store was read and holds none, and false when there is nothing
                    to read with. Collapsing them would be a clean bill of health nobody
                    established, which is the fifth invariant's own example. */}
                <Absence looked={one.answer === 'nothing-recorded'} tier={one.answer === 'nothing-recorded' ? 'ordinary' : 'told-apart'} title={inspect ? one.says : one.answer === 'nothing-recorded' ? t('g6a.common.notRecorded') : t('g6a.working.unread')} />
                {inspect ? <span className="wrk-absence-says">{one.says}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {inspect ? (
        <Panel titleIs="label" declares={{ surface: 'working.machinery' }} title={t('g6a.working.how')} rank={2}>
          <dl className="wrk-machinery">
            <dt>{t('g6a.working.history')}</dt>
            <dd>{reading.machinery.transitionStore.says}</dd>
            <dt>{t('g6a.working.resolver')}</dt>
            <dd>
              {t('g6a.working.resolverVersion', {version: reading.machinery.resolverVersion})}
            </dd>
            <dt>{t('g6a.working.readAt')}</dt>
            <dd className="num">{reading.computedAt}</dd>
            <dt>{t('g6a.working.counted')}</dt>
            <dd className="num">
              {t('g6a.working.counts', reading.counts)}
            </dd>
          </dl>
        </Panel>
      ) : null}
      </div>
      </SideBySide>
    </>
  )
}

/** How long, in the units a person says out loud. Null in means null out; nothing is invented. */
export function howLong(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 1) return t('g6a.time.underMinute')
  if (minutes < 60) return t('g6a.time.minutes', {n: minutes})
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('g6a.time.hours', {n: hours})
  return t('g6a.time.days', {n: Math.floor(hours / 24)})
}

/** One durable agent, drawn. */
/**
 * THE PRESS THAT SAYS A PERSON STARTED THIS AGENT.
 *
 * ONLY A PERSON SEES IT. The rule on the door is that a starter has to have agreed to answer for the
 * agent, and writing your own name is that agreement; an agent has nobody's agreement to give. So
 * the press is drawn to whoever the writes on this browser are attributed to as a person, and to
 * nobody else — a button that would be refused is worse than no button.
 *
 * IT NAMES NOBODY BUT THE READER. There is no field here and no picker: the only thing this can
 * write is "me", which is the whole of what the route accepts.
 */
function IStartedIt({ agentId, onChanged }: { agentId: string; onChanged: () => void }) {
  const [saying, setSaying] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  if (getActor().type !== 'human') return null
  return (
    <p className="wrk-starter">
      <button
        type="button"
        className="wrk-starter-press"
        disabled={saying}
        onClick={() => {
          setSaying(true)
          setRefused(null)
          api
            .changeParticipant('agent', agentId, { startedBy: 'me' })
            .then(
              () => {
                setSaying(false)
                onChanged()
              },
              (why: unknown) => {
                setSaying(false)
                setRefused(errorMessage(why))
              },
            )
        }}
      >
        {WORKING_WORDS.iStartedIt}
      </button>
      {refused === null ? null : <span className="wrk-starter-refused">{refused}</span>}
    </p>
  )
}

function Row({
  row,
  inspect,
  onChanged,
  editor,
  onEditor,
}: {
  row: WorkingRow
  inspect: boolean
  onChanged: () => void
  editor: RosterEditor
  onEditor: (next: RosterEditor) => void
}) {
  const heldFor = howLong(row.inThisStateMinutes)
  const progressAgo = howLong(row.lastProgress.agoMinutes)
  const who = row.participant
  // Read into a name of its own before it is drawn, for the reason Appearance.tsx gives: this is
  // free text an agent wrote about itself and not a word from any list, but a stored field reaching
  // drawn text straight out of the row reads to the machine-word gate exactly like one.
  const saidState = who === null ? null : who.state
  return (
    <li className="wrk-row" data-presence={row.presence.presence} data-work-state={row.workState.state ?? 'none'}>
      <div className="wrk-head">
        {who === null ? null : <Avatar kind="agent" id={who.id} name={who.name} url={who.avatarUrl} size={36} />}
        <div className="wrk-head-lines">
          <p className="wrk-who">
            {/* THE REGISTRY'S NAME WHERE THERE IS ONE. A person may change it without touching the
                record, so drawing the record's title over it would hide the edit they just made.
                The link still goes to the record, which is where the rest of the agent is. */}
            <RouteLink to={recordPath(row.agentId)}>{who === null ? row.title : who.name}</RouteLink>
            {inspect ? <span className="wrk-handle num">{row.handle}</span> : null}
            {!inspect || row.runtime === null ? null : <span className="wrk-runtime">{row.runtime}</span>}
            {who?.retired === true ? <span className="wrk-retired">{t('g6a.working.retired')}</span> : null}
          </p>
          {/* THE FIRST OF THE TWO ANSWERS TO "WHAT IS IT DOING", AND IT SAYS WHICH ONE IT IS.
              This is the state the agent set about itself, in the registry. The other is further
              down and comes from the run serving it. They used to be drawn with no label and with
              absence lines that read the same, so a row said what an agent was doing and then said
              it had not said what it was doing, four lines apart. Problem `9C9UiAIUpLW2`. */}
          {who === null ? null : (
            <p className="wrk-said-state">
              <span className="wrk-dim-label">{t('g6a.working.self')}</span>{' '}
              {saidState === null ? (
                <Absence
                  looked

                  title={t('g6a.working.noStateReason')}
                />
              ) : (
                saidState
              )}
            </p>
          )}
          {who?.retiredBecause == null ? null : <p className="wrk-said-state">{who.retiredBecause}</p>}
          {/* NOBODY IS DOWN AS HAVING STARTED IT, AND THAT STOPS A WHOLE TREE. Criterion P1 and
              problem `MAZyrG2KH_jo`: the registration route refuses to file anybody under an agent
              whose chain of starters reaches nobody, so every builder under this one is
              unregisterable until a person says they started it. The press is here, on the row,
              because this is the page where a person is already looking at who is working. */}
          {who !== null && who.startedBy === null ? <IStartedIt agentId={who.id} onChanged={onChanged} /> : null}
        </div>
        {who === null ? null : (
          <AgentAppearance agent={who} editor={editor} onEditor={onEditor} onChanged={onChanged} />
        )}
      </div>

      {/* THE TWO WORDS, SIDE BY SIDE, AND NOTHING DERIVES ONE FROM THE OTHER. */}
      <div className="wrk-two">
        <span className="wrk-dim">
          <span className="wrk-dim-label">{t('g6a.working.says')}</span>
          {row.workState.word === null ? (
            <Absence
              tier={row.workState.answer === 'nothing-recorded' ? 'ordinary' : 'told-apart'}
              looked={row.workState.answer === 'nothing-recorded'}

              title={inspect ? row.workState.says : row.workState.answer === 'nothing-recorded' ? t('g6a.common.notRecorded') : t('g6a.working.unread')}
            />
          ) : (
            <b className="wrk-word" title={inspect ? row.workState.says : undefined}>
              {row.workState.word}
            </b>
          )}
          {heldFor === null ? null : <span className="wrk-since">{t('g6a.working.heldFor', {time: heldFor})}</span>}
        </span>
        <span className="wrk-dim">
          <span className="wrk-dim-label">{t('g6a.working.reachable')}</span>
          {/* THE PRESENCE WORD IN THE PAGE'S LANGUAGE (wave 13y round 121): `word` is the server's English.
              presenceWord reads only the word, and this reading carries no colour. */}
          <b className="wrk-word" title={inspect ? row.presence.says : undefined}>
            {presenceWord({ word: row.presence.word, colour: '' })}
          </b>
          {row.presence.quietForMinutes === null ? null : (
            <span className="wrk-since">{t('g6a.working.quietFor', {time: howLong(row.presence.quietForMinutes) ?? ''})}</span>
          )}
        </span>
      </div>

      {row.workState.because === null ? null : <p className="wrk-because">{row.workState.because}</p>}

      {/* THE SECOND OF THE TWO, AND IT SAYS WHOSE WORDS THESE ARE. Not the agent's own state above:
          this is the line the RUN serving it wrote about what it was doing. The two are different
          facts from different tables and either can be there without the other. */}
      <p className="wrk-doing">
        <span className="wrk-dim-label">{t('g6a.working.doing')}</span>{' '}
        {row.doing === null ? (
          <Absence
            looked

            title={t('g6a.working.noDoingReason')}
          />
        ) : (
          row.doing
        )}
      </p>

      {row.domains.length === 0 ? (
        <p className="wrk-nodomain">
          <Absence
            looked

            title={t('g6a.working.noDomainReason')}
          />
        </p>
      ) : (
        <ul className="wrk-domains">
          {row.domains.map((domain) => (
            <li key={domain.id} className="wrk-domain">
              <p className="wrk-domain-obj">
                <RouteLink to={recordPath(domain.id)}>{domain.objective === '' ? domain.title : domain.objective}</RouteLink>
              </p>
              <p className="wrk-domain-meta">
                {domain.stage}
                {domain.basis === 'stated' ? t('g6a.working.stated') : t('g6a.working.agreed')}
                {domain.lastSign.at === null ? '' : t('g6a.working.lastSign', {at: domain.lastSign.at.slice(0, 16)})}
              </p>
              {!inspect || domain.touches.length === 0 ? null : (
                <p className="wrk-touches num">{domain.touches.join(' · ')}</p>
              )}
              {domain.aboutRecords.length === 0 ? null : (
                <p className="wrk-about">
                  {t('g6a.working.about')}{' '}
                  {domain.aboutRecords.map((one, i) => (
                    <span key={one.id}>
                      {i === 0 ? '' : ', '}
                      <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {row.overlaps.length === 0 ? null : (
        <div className="wrk-overlaps" data-conflicts={row.writeConflicts > 0 ? 'yes' : 'no'}>
          <h4 data-title-is="its-label">
            {row.writeConflicts > 0
              ? t('g6a.working.conflicts', {n: row.writeConflicts})
              : t('g6a.working.overlaps')}
          </h4>
          <ul>
            {row.overlaps.map((one) => (
              <li key={`${one.otherDomainId}:${one.subject}:${one.overlapClass}`} data-rank={one.rank}>
                <b>{one.word ?? (inspect ? one.overlapClass : t('g6a.working.overlaps'))}</b> {inspect ? <span className="num">{one.subject}</span> : null}
                {inspect ? <span className="wrk-overlap-says">{one.says}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="wrk-progress">
        {row.lastProgress.at === null ? (
          <Absence title={t('g6a.working.noProgress')} />
        ) : (
          <>
            {t('g6a.working.lastProgress', {time: progressAgo ?? ''})}{inspect ? ` · ${row.lastProgress.from}` : ''}
          </>
        )}
      </p>

      {!inspect || row.attachment === null ? null : (
        <p className="wrk-attach">
          {t('g6a.working.serving')}{' '}<RouteLink to={recordPath(row.attachment.id)}>{row.attachment.title}</RouteLink>
          {row.runtime === null ? '' : ` · ${row.runtime}`}
        </p>
      )}

      {/* DEVELOPER ONLY. The provider session, the machine, the terminal, the working directory and
          the three presence inputs. Section 21: the machinery belongs here and not in Normal. */}
      {inspect ? (
        <Explain
          declares={{ surface: null }}
          meaning={<span>{t('g6a.working.rowHow')}</span>}
          opens={t('g6a.working.machinery')}
        >
          <dl className="wrk-machinery">
            <dt>{t('g6a.working.presenceSource')}</dt>
            <dd>
              {row.presence.from ?? t('g6a.working.noInput')} — {row.presence.whyNoInput ?? row.presence.says}
            </dd>
            <dt>{t('g6a.working.inputs')}</dt>
            <dd>
              <ul className="wrk-inputs">
                {row.presence.inputs.map((one) => (
                  <li key={one.input}>
                    <span className="num">{one.input}</span> · {one.answer} · {one.says}
                  </li>
                ))}
              </ul>
            </dd>
            <dt>{t('g6a.working.threshold')}</dt>
            <dd>{row.presence.thresholdIsUnmeasured}</dd>
            <dt>{t('g6a.working.provider')}</dt>
            <dd className="num">{row.attachment?.providerSession ?? t('g6a.common.notRecorded')}</dd>
            <dt>{t('g6a.working.machine')}</dt>
            <dd className="num">{row.attachment?.machine ?? t('g6a.common.notRecorded')}</dd>
            <dt>{t('g6a.working.cwd')}</dt>
            <dd className="num">{row.attachment?.workingDirectory ?? t('g6a.common.notRecorded')}</dd>
            <dt>{t('g6a.working.terminal')}</dt>
            <dd className="num">{row.attachment?.terminal ?? t('g6a.common.notRecorded')}</dd>
            <dt>{t('g6a.working.record')}</dt>
            <dd className="num">{row.agentId}</dd>
          </dl>
        </Explain>
      ) : null}
    </li>
  )
}

/* Quoting with plain words in this stylesheet: a backtick anywhere inside it would close the
   template string and turn the rest of the file into nonsense. */
const WORKING_CSS = `
.wrk-title { margin: 0 0 var(--pad) 0; font-size: var(--fs-4); }
/* THE ROSTER AND THE NOTES ABOUT IT: the one width rule's columns, each a stack with the page's gap. */
.wrk-sides { gap: var(--gut); }
.wrk-main, .wrk-side { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.wrk-said { color: var(--text-2); font-size: var(--fs-1); margin: 0 0 var(--pad-lg) 0; max-width: var(--measure-in-box); }
.wrk-none { color: var(--text-2); font-size: var(--fs-1); margin: 0; max-width: var(--measure-in-box); }
.wrk-list, .wrk-absences, .wrk-domains { list-style: none; margin: 0; padding: 0; }
.wrk-row { padding: var(--pad) 0; border-top: 1px solid var(--edge); }
.wrk-row:first-child { border-top: none; padding-top: 0; }
.wrk-who { margin: 0; display: flex; gap: var(--pad); align-items: baseline; flex-wrap: wrap; }
/* WRAPS, so the editor can take a whole line of its own when it is open. The picker offers fifty
   pictures and they do not fit in whatever is left of a row after a name; at 390 it was one column
   of pictures a hundred pixels wide running the length of the page. See AgentAppearance.tsx. */
.wrk-head { display: flex; align-items: flex-start; gap: var(--pad); flex-wrap: wrap; }

.wrk-head-lines { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.wrk-runtime, .wrk-retired {
  font-size: var(--fs-1);
  color: var(--text-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}
.wrk-retired { color: var(--st-blocked); border-color: var(--st-blocked); }
/* THE PRESS THAT MENDS A CHAIN OF STARTERS. Quiet, because it is offered rather than needed by the
   reader; the row beside it is what they came for. */
.wrk-starter { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.wrk-starter-press {
  min-height: 26px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.wrk-starter-press:hover { background: var(--hover); }
.wrk-starter-press:disabled { cursor: default; color: var(--text-3); }
.wrk-starter-refused { font-size: var(--fs-1); color: var(--st-blocked); overflow-wrap: anywhere; }

.wrk-said-state {
  margin: 0;
  /* A retiring reason may be written on several lines, and is shown as written. */
  white-space: pre-line;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

.wrk-handle { color: var(--text-3); font-size: var(--fs-1); }
.wrk-two { display: flex; gap: var(--pad-lg); flex-wrap: wrap; margin: calc(var(--pad) * 0.5) 0 0 0; }
.wrk-dim { display: flex; gap: calc(var(--pad) * 0.5); align-items: baseline; flex-wrap: wrap; }
.wrk-dim-label { color: var(--text-3); font-size: var(--fs-1); }
.wrk-word { font-size: var(--fs-2); }
.wrk-since { color: var(--text-3); font-size: var(--fs-1); }
.wrk-because, .wrk-doing, .wrk-progress, .wrk-attach, .wrk-nodomain {
  margin: calc(var(--pad) * 0.5) 0 0 0; color: var(--text-2); font-size: var(--fs-1);
  max-width: var(--measure-in-box); overflow-wrap: anywhere;
}
.wrk-domain { margin: var(--pad) 0 0 0; padding-left: var(--pad); border-left: 2px solid var(--edge); }
.wrk-domain-obj { margin: 0; }
.wrk-domain-meta, .wrk-about { margin: 2px 0 0 0; color: var(--text-3); font-size: var(--fs-1); }
.wrk-touches { margin: 2px 0 0 0; color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.wrk-overlaps { margin: var(--pad) 0 0 0; }
.wrk-overlaps h4 { margin: 0 0 calc(var(--pad) * 0.5) 0; font-size: var(--fs-1); }
.wrk-overlaps[data-conflicts="yes"] h4 { color: var(--alarm, var(--text-1)); }
.wrk-overlaps ul { list-style: none; margin: 0; padding: 0; }
.wrk-overlaps li { margin: 0 0 calc(var(--pad) * 0.5) 0; font-size: var(--fs-1); max-width: var(--measure-in-box); }
.wrk-overlap-says { display: block; color: var(--text-3); }
.wrk-absence { display: flex; gap: var(--pad); align-items: baseline; flex-wrap: wrap; margin: 0 0 var(--pad) 0; }
.wrk-absence-what { font-weight: 600; font-size: var(--fs-1); }
.wrk-absence-says { color: var(--text-2); font-size: var(--fs-1); flex: 1 1 18rem; min-width: 0; }
.wrk-machinery { margin: 0; font-size: var(--fs-1); }
.wrk-machinery dt { color: var(--text-3); margin-top: calc(var(--pad) * 0.5); }
.wrk-machinery dd { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.wrk-inputs { list-style: none; margin: 0; padding: 0; }
.wrk-inputs li { margin: 0 0 4px 0; }
`
