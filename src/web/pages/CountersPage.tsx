// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { endOfSentence, t, type WordKey } from '@shared/i18n.ts'
import { gapBetween } from '@shared/spacing.ts'
import { followWords, triggerWords, actionWords } from '@shared/counters.ts'
import { useMode } from '../lib/mode.ts'
/**
 * `#/counters` — the counters of every project, or of one chosen project, and one counter opened.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * READ ACROSS PROJECTS, from 29 September 2026. The page stands under All
 * projects. It reads `GET /api/counters?projects=`, starting at the project it was opened from,
 * which is shown chosen in the one control, `ProjectChoiceControl`; the reader can choose every
 * project or another one. Every card names its project, and the count says what it is counted over.
 * A counter opened by its address is read in whichever project holds it, and Pause and Resume are
 * sent to that project.
 *
 * Criterion CT8 of design/counters/ACCEPTANCE.md: a page lists the counters. Each
 * counter shows what it counts, its count and its amount, every trigger in its own words with the
 * one that holds right now marked, what it does when it fires, when it last fired and which trigger
 * held, when a timer is next due, whether it is paused and why, and whether a firing was held back
 * by the limit. Opening a counter shows its rows newest first and every change somebody made to it.
 *
 * THE READING IS THE DOOR'S OWN. Every word this page draws about a counter — its triggers, its
 * action, its follows, its rows — comes off `GET /api/counters` or `GET /api/counters/:id`. Nothing
 * here works out a count or a due moment a second time: the server's own reading already did, and a
 * second copy here would be the same fact in two places.
 *
 * ---------------------------------------------------------------------------------------
 * EMPTY IS A REAL STATE, AND FAILURE IS A DIFFERENT ONE
 * ---------------------------------------------------------------------------------------
 *
 * A project with no counters has not failed at anything, and it is different from a request that
 * failed. The empty list draws the door's own `says` sentence, which is the sentence the door wrote
 * for exactly that case; a failed read draws `ErrorNote`, which is a different branch entirely.
 *
 * ---------------------------------------------------------------------------------------
 * A QUIET TRIGGER WITH NO RECORDED SPELL SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * A quiet trigger's `since` is null when nobody has recorded anything waiting in the lane it
 * watches. Null there is not "long ago": it is the office not knowing, and the trigger does not
 * hold. The page says that in words rather than drawing a duration it does not have.
 *
 * ---------------------------------------------------------------------------------------
 * A PAUSE ASKS FOR ITS REASON BEHIND A CLOSED FOLD
 * ---------------------------------------------------------------------------------------
 *
 * Pause and Resume are presses, and each asks for the one sentence the door requires. The box to
 * type it in is behind a closed fold, so a reader sees nothing to type into until they press the
 * fold — the rule `tests/read-before-edit.test.ts` holds every reading page to. The press answers
 * with the door's own `says`, and a refusal is drawn in the door's own words.
 */

import { useState, type ReactNode } from 'react'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import type { CounterReading, CounterRowReading, TriggerReading } from '@shared/counters.ts'
import { calendarDaysBetween, parseLocalStamp, theClockZone } from '@shared/time.ts'
import { whenInWords } from '../components/RaiseEndChoice.tsx'
import { faultOf, api, errorMessage, type CounterDetailReply, type CountersAcrossReply, type CountersReply } from '../api.ts'
import { ProjectChoiceControl, ProjectName, useProjectChoice, useProjectTitles, withCountedOver } from '../components/ProjectChoice.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { countersPath, RouteLink } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { SideBySide } from '../components/SideBySide.tsx'

/** The word each stored row kind is drawn as. The server's three kinds, in the reader's words. */
const ROW_WORDS: Readonly<Record<CounterRowReading['what'], string>> = {
  get addition(): string { return t('g7a.counters.addition') },
  get firing(): string { return t('g7a.counters.firing') },
  get 'held back'(): string { return t('g7a.counters.heldBackRow') },
}

export function CountersPage({ id }: { id?: string }) {
  const [reloads, setReloads] = useState(0)
  const [choice, setChoice] = useProjectChoice()
  const titles = useProjectTitles()
  const [list] = useProjectAsync(
    () => (id === undefined ? api.listCountersAcross(choice) : Promise.resolve(null)),
    [id, choice, reloads],
  )
  // A COUNTER OPENED BY ITS ADDRESS IS READ IN WHICHEVER PROJECT HOLDS IT, because its card may have
  // been in any project on the list.
  const [detail] = useProjectAsync(
    () => (id === undefined ? Promise.resolve(null) : api.readCounter(id, { projects: EVERY_PROJECT })),
    [id, reloads],
  )
  const reload = (): void => setReloads((n) => n + 1)

  return (
    <div className="page cnt">
      <style href="mole-office-counters-page" precedence="default">
        {COUNTERS_CSS}
      </style>
      <h1 className="cnt-title" data-title-is="its-label">{t('g7a.counters.title')}</h1>
      {id === undefined ? (
        <>
          <div className="cnt-choice">
            <ProjectChoiceControl choice={choice} onChoose={setChoice} titles={titles} />
          </div>
          {list.status === 'loading' ? <Loading what={t('g7a.counters.loading')} /> : null}
          {list.status === 'error' ? (
            <ErrorNote message={list.message} fault={list.fault} retry={reload} />
          ) : null}
          {list.status === 'ready' && list.value !== null ? (
            <TheCounters reading={list.value} choice={choice} titles={titles} onChanged={reload} />
          ) : null}
        </>
      ) : (
        <div className="cnt-open">
          {detail.status === 'loading' ? <Loading what={t('g7a.counters.loadingDetail')} /> : null}
          {detail.status === 'error' ? (
            <ErrorNote message={detail.message} fault={detail.fault} retry={reload} />
          ) : null}
          {detail.status === 'ready' && detail.value !== null ? (
            <TheCounter key={detail.value.counter.id} reading={detail.value} titles={titles} onChanged={reload} />
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * The list, drawn from what was fetched. Exported so a test can render it with no server and no
 * port, the way `TheShelf` and `TheTasksToTake` are.
 *
 * WHAT THE LIST IS COUNTED OVER. The heading names the choice: every project, or one project by
 * name. The count adds up the counters on the list and carries `countedOver`'s sentence, joined by `withCountedOver`. A reading
 * of one project by the request's header (`CountersReply`) names that project. An empty list draws
 * the short mark, and a failed read is `ErrorNote`, a different branch.
 */
export function TheCounters({
  reading,
  choice,
  titles = new Map(),
  onChanged,
}: {
  reading: CountersReply | CountersAcrossReply
  /** What the page chose. Absent for a reading of one project by header, which names its project. */
  choice?: ProjectChoice
  titles?: ReadonlyMap<string, string>
  onChanged?: () => void
}) {
  const over: ProjectChoice = choice ?? ('workspaceId' in reading ? reading.workspaceId : EVERY_PROJECT)
  const running = reading.counters.filter((one) => one.paused === null).length
  return (
    // A section, not a box: each counter is a card, and a box never holds a box (rule R10 of report
    // n9Mjk3c_sJRu, adopted in a decision).
    <section className="cnt-group" {...declaredAttributes({ surface: 'counters.list' })}>
      {/* A HEADING THAT HOLDS A PROJECT'S NAME IS DRAWN AS WRITTEN: the light theme's section style uppercased the name with
          it, "DEFAULT 中的计数器", "IN DEFAULT", where the dark theme showed Default (the review of wave 13q's round 32). */}
      <h2 className="cnt-group-head" data-title-is="its-label" data-holds-a-name={over === EVERY_PROJECT ? undefined : '1'}>
        {over === EVERY_PROJECT ? t('g7a.counters.listEvery') : t('g7a.counters.listOne', { project: titles.get(over) ?? over })}
      </h2>
      <p className="cnt-says">
        {reading.counters.length === 0 ? (
          <Absence />
        ) : (
          withCountedOver(t('g7a.counters.count', { n: reading.counters.length, running, paused: reading.counters.length - running }), over, titles)
        )}
      </p>
      {reading.counters.length === 0 ? null : (
        <ol className="cnt-list">
          {reading.counters.map((counter) => (
            <CounterEntry
              key={counter.id}
              counter={counter}
              titles={titles}
              {...(onChanged === undefined ? {} : { onChanged })}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

/** One counter in the list: its facts, and the two presses with the fold that asks for a reason. */
function CounterEntry({
  counter,
  titles,
  onChanged,
}: {
  counter: CounterReading & { workspaceId?: string }
  titles: ReadonlyMap<string, string>
  onChanged?: () => void
}) {
  return (
    <li className="cnt-entry" data-project={counter.workspaceId}>
      <CounterFacts counter={counter} titles={titles} {...(counter.workspaceId === undefined ? {} : { project: counter.workspaceId })} />
      <CounterPresses
        counter={counter}
        {...(counter.workspaceId === undefined ? {} : { project: counter.workspaceId })}
        {...(onChanged === undefined ? {} : { onChanged })}
      />
    </li>
  )
}

/**
 * Everything one counter says about itself, drawn the same way in the list and when it is open.
 * `project` is the project the counter is in, named under its title; it is absent only for a reading
 * of one project by header, which the heading already names.
 */
function CounterFacts({
  counter,
  project,
  titles,
}: {
  counter: CounterReading
  project?: string
  titles: ReadonlyMap<string, string>
}) {
  const mode = useMode()
  const firingTrigger = counter.lastFiring === null ? null : triggerHeld(counter, counter.lastFiring)
  const action = actionWords('group' in counter.action ? { kind: 'message', group: counter.action.group.id } : counter.action, 'group' in counter.action ? counter.action.group.name : null, mode)
  const several = counter.triggers.length > 1
  const dueWords = counter.nextDue === null ? null : dueInWords(counter.nextDue.at)
  const nextTrigger = counter.nextDue === null || counter.triggers[counter.nextDue.trigger] === undefined ? null : triggerWords(counter.triggers[counter.nextDue.trigger]!, mode)
  return (
    <>
      <div className="cnt-card-head">
        <h2 className="cnt-name">
          <RouteLink to={countersPath(counter.id)}>{counter.title}</RouteLink>
        </h2>
        <span className="cnt-state" data-state={counter.paused === null ? 'active' : 'paused'}>
          {t(counter.paused === null ? 'g7a.counters.active' : 'g7a.counters.paused')}
        </span>
      </div>
      {project === undefined ? null : (
        <p className="cnt-project">
          <ProjectName id={project} titles={titles} />
        </p>
      )}

      <p className="cnt-big">
        <span className="cnt-count">{counter.count}</span>
      </p>
      <p className="cnt-counts">{counter.counts}</p>

      {counter.amountIs === null || counter.amount === null ? null : (
        <p className="cnt-amount">
          {t('g7a.counters.amount')} {counter.amount} {counter.amountIs}
        </p>
      )}

      {counter.follows.length === 0 ? null : (
        <div className="cnt-follows">
          <h3 className="cnt-part">{t('g7a.counters.whatCounts')}</h3>
          <ul className="cnt-follow-list">
            {counter.follows.map((follow, at) => (
              <li key={`${follow.event}-${String(at)}`} className="cnt-follow">
                {followWords(follow, mode)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cnt-triggers">
        <h3 className="cnt-part">{t('g7a.counters.triggers')}</h3>
        <ul className="cnt-trigger-list">
          {counter.triggers.map((trigger, at) => (
            <TriggerLine key={String(at)} trigger={trigger} />
          ))}
        </ul>
      </div>

      {/* THE JOINS ON THIS CARD FOLLOW THE OFFICE'S SPACING RULE (`gapBetween`): "Then: " in English,
          "随后：" with no space in Chinese, and no space after a full-width full stop (wave 13q's round 28). */}
      <p className="cnt-action">
        <span className="cnt-part">{t('g7a.counters.then')}</span>{gapBetween(t('g7a.counters.then'), action)}
        {action}
      </p>

      {counter.lastFiring === null ? (
        <p className="cnt-last"><Absence /></p>
      ) : (
        <p className="cnt-last">
          <SaysWhen says="g7a.counters.lastWhen"><Stamp at={counter.lastFiring.at} /></SaysWhen>
          {firingTrigger === null ? null : <> — {triggerWords(firingTrigger, mode)}</>}
        </p>
      )}

      {/* A PAUSED COUNTER IS DUE AT NO TIME: the server still works out when its timer comes round, but it does not fire
          until somebody resumes it, so the line says that instead of a time (the check of wave 13q's round 33c,
          NmoFCJwXX463, found it drawn as 现在下次触发). */}
      {counter.nextDue === null ? null : counter.paused !== null ? (
        <p className="cnt-nextdue">{t('g7a.counters.dueWhilePaused')}</p>
      ) : (
        <p className="cnt-nextdue">
          {dueWords === null ? (
            <time dateTime={counter.nextDue.at}>{t('g7a.counters.dueNow')}</time>
          ) : (
            <SaysWhen says="g7a.counters.nextWhen"><time dateTime={counter.nextDue.at}>{dueWords}</time></SaysWhen>
          )}
          {/* THE TRIGGER IS NAMED HERE ONLY WHEN THERE IS A CHOICE OF THEM. With one trigger, "What makes it fire" above
              already says it, and the card printed the same sentence twice (the review of wave 13q's round 32). */}
          {several ? <> — {nextTrigger}</> : null}
          {/* A COUNTER DUE WITH ONE TRIGGER has nothing after its time, so the full stop ends the sentence here: it drew
              "Next due in 23 days" with none (the check of wave 13q's round 33b, cc0hKV-fE_-y). */}
          {counter.nextDue.because === undefined ? (several ? null : endOfSentence()) : (
            <>
              {several ? gapBetween(nextTrigger ?? '', t('g7a.counters.waitsForACount')) : endOfSentence(t('g7a.counters.waitsForACount'))}
              <span className="cnt-waits">{t('g7a.counters.waitsForACount')}</span>
            </>
          )}
        </p>
      )}

      {counter.paused === null ? null : (
        <p className="cnt-paused">
          {pausedSentence(counter.paused)}
        </p>
      )}

      {counter.heldBack === null ? null : (
        <p className="cnt-heldback">
          {t('g7a.counters.heldBack')} <Stamp at={counter.heldBack.at} />{mode === 'inspect' ? <>: {counter.heldBack.reason}</> : null}
        </p>
      )}
    </>
  )
}

/**
 * ONE TRIGGER, WITH THE ONE THAT HOLDS MARKED.
 *
 * The words are the server's own. A quiet trigger with no recorded spell says the office does not
 * know how long the lane has been quiet, which is the honest reading and never "long ago".
 */
function TriggerLine({ trigger }: { trigger: TriggerReading }) {
  const mode = useMode()
  const quiet = trigger.kind === 'quiet' ? trigger : null
  return (
    <li className={trigger.holdsNow ? 'cnt-trigger cnt-holds' : 'cnt-trigger'} data-holds={trigger.holdsNow ? 'true' : 'false'}>
      <span className="cnt-trigger-words">{triggerWords(trigger, mode)}</span>
      {trigger.holdsNow ? <span className="cnt-holding">{t('g7a.counters.holds')}</span> : null}
      {quiet === null ? null : quiet.since === null || quiet.since === undefined ? (
        <span className="cnt-quiet-unknown">
          {t('g7a.counters.unknownQuiet')}</span>
      ) : (
        <span className="cnt-quiet-since">
          {t('g7a.counters.quietSince')} <Stamp at={quiet.since} />
        </span>
      )}
    </li>
  )
}

/** The trigger that held when a firing was written, by its position in the counter's own list. */
function triggerHeld(counter: CounterReading, firing: CounterRowReading): TriggerReading | null {
  if (firing.trigger === undefined) return null
  return counter.triggers[firing.trigger] ?? null
}

/**
 * ONE WORD-LIST SENTENCE WITH A TIME DRAWN INSIDE IT.
 *
 * The words hold `{when}` as a value — "Last fired {when}" — so the label and its time are one
 * sentence in both languages. The space between the label and the time is part of the sentence
 * rather than a space in the drawing, so the two cannot run together again. The caller still draws
 * the time itself, so an exact moment keeps its own time element and its hover title.
 */
function SaysWhen({ says, children }: { says: WordKey; children: ReactNode }) {
  const [before = '', after = ''] = t(says).split('{when}')
  return (
    <>
      {before}
      {children}
      {after}
    </>
  )
}

/**
 * A PAUSED COUNTER IN ONE SENTENCE, whose order is the word list's (the review of round 34, point 7): "Paused today at
 * 00:52 by Morgan Vale: …" and "Morgan Vale 于今天 00:52 暂停了这个计数器：…". The moment is a day and a time, written
 * by `whenInWords` as a raise's end is, because a short age such as "1m ago" can be read as one month. The time keeps its
 * own time element, so its exact stamp is still there to read. An unreadable stamp is shown whole rather than guessed at.
 */
function pausedSentence(paused: { at: string; by: { name: string }; because: string }): ReactNode {
  const ms = parseLocalStamp(paused.at)
  const when = ms === null ? paused.at : whenInWords(ms, Date.now(), theClockZone())
  const [before = '', after = ''] = t('g7a.counters.pausedSentence', { when: WHEN_HERE, name: paused.by.name, reason: paused.because }).split(WHEN_HERE)
  return (
    <>
      {before}
      <time dateTime={paused.at}>{when}</time>
      {after}
    </>
  )
}

/** The mark put in the paused sentence's {when} place, so the sentence can be split around its time. No word holds it. */
const WHEN_HERE = '\u0000'

/**
 * WHEN A DUE MOMENT IS, IN WORDS A READER CAN ACT ON.
 *
 * IT IS NOT `Stamp`, WHICH ONLY SPEAKS ABOUT THE PAST AND CALLS EVERY MOMENT INSIDE THE NEXT MINUTE
 * "just now". A next due moment is in the future by definition, so a Stamp here would say a timer is
 * due this minute when the server named a time twelve hours away — a sentence that is simply false.
 * A moment already here is null, because "now" is not a time ahead and its line is a sentence of its own
 * ("Due now", 已到触发时间); the rest say how far ahead. An unreadable stamp is shown whole rather than guessed at.
 */
function dueInWords(at: string): string | null {
  const ms = parseLocalStamp(at)
  if (ms === null) return at
  const ahead = ms - Date.now()
  if (ahead <= 45_000) return null
  const minutes = Math.round(ahead / 60_000)
  if (minutes < 60) return t('g7a.counters.inminutes', { n: minutes })
  const hours = Math.round(ahead / 3_600_000)
  if (hours < 48) return t('g7a.counters.inhours', { n: hours })
  // DAYS AHEAD ARE DATES AHEAD, counted by `calendarDaysBetween` in shared/time.ts, so a clock change between now and
  // the date moves nothing (problem R74WVeH6LZPU).
  return t('g7a.counters.indays', { n: calendarDaysBetween(Date.now(), ms) })
}

/** One counter's own page: its facts, its presses, its rows and the changes made to it. */
export function TheCounter({
  reading,
  titles = new Map(),
  onChanged,
}: {
  reading: CounterDetailReply
  titles?: ReadonlyMap<string, string>
  onChanged?: () => void
}) {
  const mode = useMode()
  const [rows, setRows] = useState<readonly CounterRowReading[]>(reading.rows)
  const [more, setMore] = useState(reading.more)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const older = async (): Promise<void> => {
    const last = rows[rows.length - 1]
    if (last === undefined) return
    setBusy(true)
    setFault(null)
    try {
      const page = await api.readCounter(reading.counter.id, { before: last.seq, projects: EVERY_PROJECT })
      setRows((held) => [...held, ...page.rows])
      setMore(page.more)
    } catch (err) {
      setFault({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel titleIs="label"
      declares={{ surface: 'counters.open' }}
      title={t('g7a.counters.open')}
      actions={
        <RouteLink to={countersPath()} className="cnt-back">
          {t('g7a.counters.all')}</RouteLink>
      }
    >
      {/* THE COUNTER AND ITS HISTORY ARE TWO KINDS, so they stand side by side on a wide window by
          the shared rule, item 2 of a decision: what the counter is on the left, what
          happened to it on the right. */}
      <SideBySide className="cnt-sides">
        <div data-column="start">
          <CounterFacts counter={reading.counter} project={reading.workspaceId} titles={titles} />
          <CounterPresses counter={reading.counter} project={reading.workspaceId} {...(onChanged === undefined ? {} : { onChanged })} />
        </div>

        <div data-column="end">
          <h3 className="cnt-part">{t('g7a.counters.history')}</h3>
          {rows.length === 0 ? (
            <p className="cnt-no-rows">
              <Absence />
            </p>
          ) : (
            <ol className="cnt-rows">
              {rows.map((row) => (
                <li key={row.seq} className="cnt-row" data-what={row.what}>
                  <p className="cnt-row-head">
                    <span className="cnt-row-what">{ROW_WORDS[row.what]}</span>
                    <Stamp at={row.at} />
                    {row.by === null ? null : <span className="cnt-row-by">{row.by.name}</span>}
                    {row.event === null ? null : <span className="cnt-row-event">{mode === 'inspect' ? row.event.words : t('g7a.counters.event')}</span>}
                  </p>
                  <p className="cnt-row-numbers">
                    {t('g7a.counters.rowCount', { n: row.count })}
                    {row.amount === null ? null : <> · {t('g7a.counters.rowAmount', { n: row.amount })}</>}
                  </p>
                  {mode === 'inspect' || row.by !== null ? <p className="cnt-row-because">{row.because}</p> : null}
                  {row.answer === undefined ? null : <p className="cnt-row-answer">{mode === 'inspect' ? row.answer.says : t(row.answer.finished ? 'g7a.counters.actionFinished' : 'g7a.counters.actionWaiting')}</p>}
                </li>
              ))}
            </ol>
          )}
          {more ? (
            <Btn variant="secondary" onClick={() => void older()} pending={busy}>
              {t('g7a.counters.older')}</Btn>
          ) : null}
          {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}

          <h3 className="cnt-part">{t('g7a.counters.changes')}</h3>
          {reading.changes.length === 0 ? (
            <p className="cnt-no-changes">
              <Absence />
            </p>
          ) : (
            <ol className="cnt-changes">
              {reading.changes.map((change, at) => (
                <li key={`${change.at}-${String(at)}`} className="cnt-change">
                  <Stamp at={change.at} /> — {change.by.name}: {change.because}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SideBySide>
    </Panel>
  )
}

/**
 * PAUSE OR RESUME, with the reason behind a closed fold.
 *
 * The form is a native `<details>`, so the box is not on the screen until somebody presses the
 * fold, which is what `tests/read-before-edit.test.ts` asks of a reading page. The press draws the
 * door's own sentence when it succeeds and the door's own refusal when it does not.
 *
 * THE PRESS IS SENT TO THE COUNTER'S OWN PROJECT (`project`), because the list reads across
 * projects and the counter may be in a project other than the one in the switcher. Absent, the
 * press goes to the project in the switcher.
 */
function CounterPresses({ counter, project, onChanged }: { counter: CounterReading; project?: string; onChanged?: () => void }) {
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const press = async (): Promise<void> => {
    setBusy(true)
    setSaid(null)
    setRefusal(null)
    try {
      const reply =
        counter.paused === null
          ? await api.pauseCounter(counter.id, because, project)
          : await api.resumeCounter(counter.id, because, project)
      setSaid(t(counter.paused === null ? 'g7a.counters.pauseSaved' : 'g7a.counters.resumeSaved', { title: counter.title }))
      setBecause('')
      onChanged?.()
    } catch (err) {
      setRefusal({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  const paused = counter.paused !== null
  return (
    <div className="cnt-presses">
      <details className="cnt-fold">
        <summary className="cnt-fold-sum">{t(paused ? 'g7a.counters.resumeTitle' : 'g7a.counters.pauseTitle')}</summary>
        <div className="cnt-fold-body">
          <label className="cnt-fold-label" htmlFor={`cnt-because-${counter.id}`}>
            {t(paused ? 'g7a.counters.resumeBecause' : 'g7a.counters.pauseBecause')}
          </label>
          <textarea
            id={`cnt-because-${counter.id}`}
            className="px-input cnt-because"
            rows={2}
            value={because}
            onChange={(e) => setBecause(e.target.value)}
          />
          <Btn
            variant="secondary"
            onClick={() => void press()}
            pending={busy}
            disabled={busy || because.trim() === ''}
            reason={t(busy ? 'g7a.counters.sending' : 'g7a.counters.reasonNeeded')}
          >
            {t(paused ? 'g7a.counters.resume' : 'g7a.counters.pause')}
          </Btn>
        </div>
      </details>
      {said === null ? null : <p className="cnt-said">{said}</p>}
      {refusal === null ? null : <ErrorNote message={refusal.message} fault={refusal.fault} />}
    </div>
  )
}

/**
 * The page's own sheet, hoisted by the page itself.
 *
 * NO BACKTICK ANYWHERE IN THIS STRING, including inside a comment. Every value is a token from
 * src/web/tokens.css, so the page follows the two themes without naming a colour of its own.
 */
export const COUNTERS_CSS = `
.cnt-title { margin: 0 0 var(--gut) 0; }
.cnt-choice { margin: 0 0 var(--gut) 0; }
.cnt-project { margin: 2px 0 0 0; font-size: var(--fs-1); min-width: 0; }
.cnt-group { min-width: 0; }
.cnt-group-head[data-holds-a-name] { text-transform: none; letter-spacing: normal; }
.cnt-group-head {
  margin: 0 0 var(--pad) 0;
  font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight);
  color: var(--text);
}
.cnt-says { margin: 0 0 var(--pad) 0; color: var(--ink-2); max-width: var(--measure-in-box); }
.cnt-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: var(--gut);
  list-style: none;
  margin: 0;
  padding: 0;
}
.cnt-entry {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  box-shadow: var(--elev-1);
}
.cnt-card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--gut); min-width: 0; }
.cnt-name { margin: 0; font-size: var(--fs-4); min-width: 0; overflow-wrap: anywhere; }
.cnt-state { flex: none; margin-left: auto; font-size: var(--fs-1); font-weight: 600; color: var(--ink-2); }
.cnt-state[data-state='paused'] { color: var(--st-todo); }
.cnt-big { margin: var(--pad) 0 0 0; line-height: 1; }
.cnt-count { font-size: var(--fs-6); font-weight: 700; font-variant-numeric: tabular-nums; }
.cnt-counts { margin: 0 0 var(--pad) 0; color: var(--ink-2); max-width: var(--measure-in-box); line-height: var(--lh-body); }
.cnt-amount { margin: 0 0 var(--pad) 0; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.cnt-part { margin: 0 0 4px 0; font-size: var(--fs-2); color: var(--ink-2); font-weight: 600; }
.cnt-follows, .cnt-triggers { margin: 0 0 var(--pad) 0; }
.cnt-follow-list, .cnt-trigger-list { list-style: none; margin: 0; padding: 0; }
.cnt-follow, .cnt-trigger { max-width: var(--measure-in-box); line-height: var(--lh-body); }
.cnt-trigger { padding: 2px 0 2px var(--pad); border-left: 3px solid transparent; }
.cnt-holds { border-left-color: var(--ask); }
.cnt-holding { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--ask-bg); color: var(--ask); font-size: var(--fs-1); font-weight: 600; }
.cnt-quiet-unknown, .cnt-quiet-since { display: block; color: var(--ink-2); font-size: var(--fs-1); }
.cnt-action, .cnt-last, .cnt-nextdue, .cnt-paused, .cnt-heldback { margin: 0 0 6px 0; max-width: var(--measure-in-box); line-height: var(--lh-body); }
.cnt-waits { color: var(--ink-2); }
.cnt-paused { color: var(--ink-2); }
.cnt-heldback { color: var(--st-failed); }
.cnt-presses { margin: var(--pad) 0 0 0; }
.cnt-fold { max-width: var(--measure-in-box); }
.cnt-fold-sum { cursor: pointer; color: var(--ink-2); }
.cnt-fold-body { padding: var(--pad) 0 0 var(--pad-lg); }
.cnt-fold-label { display: block; margin: 0 0 4px 0; color: var(--ink-2); }
.cnt-because { width: 100%; max-width: 44rem; margin: 0 0 var(--pad) 0; }
.cnt-said, .cnt-refusal { max-width: var(--measure-in-box); line-height: var(--lh-body); }
.cnt-refusal { color: var(--st-failed); }
.cnt-open { margin: 0 0 var(--pad-lg) 0; }
.cnt-back { font-size: var(--fs-2); }
.cnt-no-rows, .cnt-no-changes { margin: 0 0 var(--pad) 0; color: var(--ink-2); }
.cnt-rows, .cnt-changes { list-style: none; margin: 0 0 var(--pad-lg) 0; padding: 0; }
.cnt-row, .cnt-change { padding: var(--pad) 0; border-top: 1px solid var(--border); max-width: var(--measure-in-box); }
.cnt-row:first-child, .cnt-change:first-child { border-top: none; }
.cnt-row-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--gut); margin: 0 0 4px 0; color: var(--ink-2); font-size: var(--fs-1); }
.cnt-row-what { font-weight: 600; color: var(--ink); }
.cnt-row-numbers { margin: 0 0 4px 0; font-variant-numeric: tabular-nums; }
.cnt-row-because, .cnt-row-answer, .cnt-change { line-height: var(--lh-body); }
.cnt-row-because { margin: 0 0 4px 0; }
.cnt-row-answer { margin: 0; color: var(--ink-2); }
.cnt-change { line-height: var(--lh-body); }
@media (max-width: 40rem) {
  .cnt-title { font-size: var(--fs-5); }
  .cnt-list { grid-template-columns: 1fr; }
  .cnt-name { font-size: var(--fs-3); }
}
`
