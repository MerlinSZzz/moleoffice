// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/runtime` — WHAT IS RUNNING, ON A PAGE SOMEBODY OPENS ON PURPOSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS AND WHY IT IS THE ONLY ONE
 * ---------------------------------------------------------------------------------------
 *
 * Act 2 of section 4 of design/ground/ACCEPTANCE.md: *the runtime page names the API, the database,
 * the HEAD and the freshness.* Until 4 September 2026 no page in the browser app drew any of the
 * four, and the GROUND verifier could not perform the act at all. Problem `M0nt8uVDPnNv`.
 *
 * IT DOES NOT CONTRADICT ANSWER F2, and that is worth being exact about. Answer F2 is the second
 * option offered: nothing on screen in normal use, a red banner only when something is wrong, the
 * page unusable behind it, and failing loudly. The first option would have let a user believe there
 * was no problem.
 *
 * That is about what an ORDINARY page draws while somebody is working, and the answer is nothing.
 * The reason is the important half: a line that is always on screen teaches a reader it is
 * furniture, and then it says nothing on the day it matters. A page a person opens because they are
 * asking what they are looking at is not furniture. So: nothing on any other page, nothing in the
 * shell, no rail row, and everything here.
 *
 * The banner is the other half and is unchanged. `components/WrongWorld.tsx` still draws on every
 * page, still draws nothing while everything agrees, and still blocks the page when it does not.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCES ARE THE SERVER'S, NOT THIS FILE'S
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/runtime` already answers in words: `freshness.says` is a sentence with both times in
 * it, `standing.because` is a list of plain reasons, `database.problem` says what is wrong with the
 * file. Writing second versions of those here would be the same fact worked out in two places,
 * which is the defect CLAUDE.md names at the top. This file draws labels and the server's words.
 *
 * THE SERVER'S WORDS ARRIVE TWICE: in English, and as a code with values beside each sentence
 * (src/shared/dev-sayings.ts). `saidOnThePage` draws the code from the word lists in the page's
 * language, and the English only when a reply carries no code it can read.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS CACHED, ON EITHER SIDE
 * ---------------------------------------------------------------------------------------
 *
 * The route reads every field when the request arrives, which is criterion G2's first rule. This
 * page reads it once when it opens and offers a press to read it again. A page holding an old
 * answer about what is running is the exact fault this cluster exists to prevent.
 */

import { worldStandingWord } from '@shared/words.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { whyTheOfficeCannotStartThisRuntime } from '@shared/participants.ts'
import { useRef } from 'react'
import type { RuntimeRecord, RuntimePlace } from '@shared/runtime.ts'
import type { StartCostCeiling, StartCostMeasured, StartStepReading } from '@shared/start-cost.ts'
import { startStepNameSaid, startStepDescriptionSaid, startTokensExplanation, startCostCeilingSaid, startCostNumbers, startStepSpentSaid, startTokensSaid, TOKENS_ARE_WHOLE_START } from '@shared/start-cost.ts'
import { Absence, ErrorNote, Loading, Panel, useAsync } from '../components/ui.tsx'
import { api } from '../api.ts'
import { OFFICE_LOAD_NUMBERS, type OfficeLoadNumber, type OfficeLoadReading } from '@shared/office-load.ts'
import { theWorldThisPageStartedIn } from '../lib/world.ts'
import { readTheMachineAgain, readTheMachineOnce } from '../lib/onemachine.ts'
import { RouteLink, pathFor } from '../components/router.tsx'

export function RuntimePage() {
  /**
   * THE PAGE-LOAD READ IS THE PAGE'S ONE MACHINE READING, SHARED WITH THE WRONG-WORLD CHECK AND
   * THE SETTINGS BAND. Opening this page joins it; the press below asks for a fresh one. The
   * `firstRead` ref tells the two apart: `useAsync` calls its load once on mount (a second
   * StrictMode run reuses the promise) and again for the press, and only the press reads when
   * nothing has said the reading changed.
   */
  const firstRead = useRef(true)
  const [state, readAgain] = useAsync(() => {
    if (firstRead.current) {
      firstRead.current = false
      return readTheMachineOnce()
    }
    return readTheMachineAgain()
  }, [])

  return (
    <div className="page rt">
      <style href="mole-office-runtime-page" precedence="default">
        {RUNTIME_CSS}
      </style>
      {/* THE ROW'S OWN WORDS: the heading is what the shell calls the page. This page has no rail row, so the name is the one
          PAGE_TITLES gives it. */}
      <h1 className="rt-title">{t('dev.runtime.whatIsRunning')}</h1>
      {state.status === 'loading' ? <Loading what={t('dev.runtime.whatIsRunning2')} /> : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} />
      ) : null}
      {state.status === 'ready' ? <TheRuntime record={state.value} onReadAgain={readAgain} /> : null}
    </div>
  )
}

function TheRuntime({ record, onReadAgain }: { record: RuntimeRecord; onReadAgain: () => void }) {
  // Held in a local rather than drawn straight out of the record. `standing.kind` reads as a stored
  // word to tests/machine-words.ts, which cannot know that these two are ordinary English.
  const standing = worldStandingWord(record.standing.kind).text
  /**
   * WHAT THIS PAGE WAS SERVED, READ OFF `window` RATHER THAN IMPORTED.
   *
   * `lib/served.ts` imports a module Vite makes at serve time, so importing it here would make this
   * file unloadable to anything running under Node — which is how `tests/app-routes.test.ts`, which
   * reaches App.tsx, went red the first time this page existed. `components/WrongWorld.tsx` reads
   * the same stamp the same way and its own note says so.
   *
   * Undefined means the stamp is not there at all, which cannot happen on a page that started,
   * since the import that sets it is the second line of `main.tsx`. It is answered honestly anyway.
   */
  const served = typeof window === 'undefined' ? undefined : window.moleOfficeServedCode
  const dirty = record.repository.dirty
  const head = record.repository.head

  return (
    <>
      <p className="rt-when">
        <span className="rt-key">{t('dev.runtime.readAt')}</span> {record.readAt}{' '}
        <button type="button" className="rt-again" onClick={onReadAgain}>{t('dev.runtime.readAgain')}</button>
        {/* AND THE WAY TO THE OTHER WORLDS. Criterion C7 asks for the office to be reachable from
            here as well as from the rail: this page answers "what am I looking at", and "which
            others are there" is the next question a person asks. */}
        <RouteLink to={pathFor('worlds')} className="rt-worlds">{t('dev.runtime.worlds')}</RouteLink>
      </p>

      <Panel titleIs="label" declares={{ surface: 'runtime.api' }} title={t('dev.runtime.theApiThisPageIsTalkingTo')}>
        <dl className="rt-facts">
          {/* THE ADDRESS IT REALLY ANSWERS ON, read off its listening socket, and the address its
              settings declare, on its own line beneath. They used to be one row, filled from the
              settings, so a scratch server started from the live checkout drew the live checkout's
              address here and a person comparing this line with their address bar saw a match that
              was false. Problem ES5fb2_BHsVn. */}
          <Fact name={t('dev.runtime.addressItAnswersOn')} value={record.addresses.api} />
          <Fact
            name={t('dev.runtime.addressItsSettingsDeclare')}
            value={record.addresses.declaredApi}
            wrong={record.addresses.says !== null}
          />
          {/* AND THE ADDRESS ANOTHER MACHINE REACHES IT AT, which is a different question from
              either line above and has to be asked from the other machine to be worth anything.
              A row is drawn either way: "nothing" is the answer for every installation nobody has
              set an address on, and leaving the row out would make that indistinguishable from a
              page too old to know the question. */}
          <Fact
            name={t('dev.runtime.addressOtherMachinesReachItAt')}
            value={
              record.addresses.forOtherMachines === null
                ? t('dev.runtime.localOnly')
                : record.addresses.forOtherMachines.api
            }
          />
          {/* The browser app on that address, drawn only when there is one: it is what a person
              types on the other machine, and repeating "nothing" twice says nothing twice. */}
          {record.addresses.forOtherMachines === null ? null : (
            <Fact name={t('dev.runtime.browserAppForOtherMachines')} value={record.addresses.forOtherMachines.web} />
          )}
          <Fact name={t('dev.runtime.portItWasToldToTake')} value={record.port === null ? null : String(record.port)} />
          <Fact
            name={t('dev.runtime.portsItIsReallyListeningOn')}
            value={record.listeningOn.length === 0 ? null : record.listeningOn.join(', ')}
          />
          <Fact
            name={t('dev.runtime.process')}
            value={t('dev.runtime.processGroup', { pid: record.process.pid, group: record.process.pgid === null ? t('dev.runtime.nobodyCouldReadThis') : record.process.pgid })}
          />
          <Fact
            name={t('dev.runtime.started')}
            value={
              record.process.startedAt === null
                ? null
                : t('dev.runtime.startedFor', { at: record.process.startedAt, duration: record.process.upFor === null ? '' : t('dev.runtime.upFor', { duration: saidOnThePage(record.process.upForSaid, record.process.upFor) }) })
            }
          />
          <Fact name={t('dev.runtime.canonicalOrScratch')} value={standing} />
          <Fact name={t('dev.runtime.whoStartedIt')} value={saidOnThePage(record.startedBy.said, record.startedBy.says)} />
        </dl>
        {/* THE TWO ADDRESSES DISAGREEING, in the server's own sentence, and nothing at all when
            they are the same address. */}
        {record.addresses.says === null ? null : <p className="rt-wrong">{saidOnThePage(record.addresses.saysSaid, record.addresses.says)}</p>}
        {/* WHY IT IS SCRATCH, in the server's own words. A canonical runtime has an empty list, so
            this draws nothing at all when there is nothing to say. */}
        {record.standing.because.length > 0 ? (
          <ul className="rt-because">
            {record.standing.because.map((one, at) => (
              <li key={one}>{saidOnThePage(record.standing.becauseSaid[at], one)}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {/* WHO HAS COME IN FROM SOMEWHERE ELSE. Its own panel because it is about callers rather than
          about this process, and drawn even when nobody has: "nothing has" is the answer on every
          machine that has never been reached from another one, and leaving the panel out would make
          that indistinguishable from a page too old to ask. Read from the call log the API already
          keeps, so nothing about anybody is stored to draw it. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.api' }} title={t('dev.runtime.machinesThatReachedItFromSomewhereElse')}>
        <dl className="rt-facts">
          {/* A ROW EITHER WAY, and `none` rather than an empty panel: none is the answer on every
              machine nothing has ever reached from elsewhere, and it is a different answer from
              `nobody could read this`, which is what a Fact with no value says. */}
          {record.fromOtherMachines.length === 0 ? (
            <Fact name={t('dev.runtime.machinesThatHaveReachedIt')} value={t('dev.runtime.none')} />
          ) : (
            record.fromOtherMachines.map((one) => (
              <Fact
                key={one.address ?? t('dev.runtime.noAddress')}
                name={one.address ?? t('dev.runtime.noAddress')}
                value={t('dev.runtime.requests', { n: one.requests, first: one.firstAt, last: one.lastAt })}
              />
            ))
          )}
        </dl>
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'runtime.database' }} title={t('dev.runtime.theDatabaseBehindIt')}>
        <dl className="rt-facts">
          <Fact name={t('dev.runtime.fileItHasOpen')} value={record.database.path} />
          <Fact name={t('dev.runtime.identity')} value={identityOf()} />
          <Fact
            name={t('dev.runtime.theCanonicalOne')}
            value={
              record.database.canonical
                ? t('dev.runtime.canonicalYes')
                : t('dev.runtime.canonicalNo', { path: record.database.canonicalPath })
            }
            wrong={!record.database.canonical}
          />
        </dl>
        {record.database.problem === null ? null : <p className="rt-wrong">{saidOnThePage(record.database.problemSaid, record.database.problem)}</p>}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'runtime.checkout' }} title={t('dev.runtime.theCheckoutItWasBuiltFrom')}>
        <dl className="rt-facts">
          <Fact name={t('dev.runtime.checkout')} value={record.repository.path} />
          <Fact name={t('dev.runtime.workingDirectory')} value={record.repository.workingDirectory} />
          <Fact name={t('dev.runtime.commit')} value={head === null ? null : `${head.short} — ${head.full}`} />
          <Fact name={t('dev.runtime.branch')} value={record.repository.branch} />
          <Fact
            name={t('dev.runtime.uncommittedChanges')}
            value={dirty === null ? null : dirty ? t('dev.runtime.dirty') : t('dev.runtime.clean')}
            wrong={dirty === true}
          />
          <Fact
            name={t('dev.runtime.aGitWorktree')}
            value={record.repository.isWorktree === null ? null : record.repository.isWorktree ? t('dev.runtime.yes') : t('dev.runtime.no')}
          />
        </dl>
      </Panel>

      {/* BOTH HALVES, WITH THE TIMES. This is the one place they are drawn side by side, and the
          fault they exist for is the two of them running different code with nothing saying so. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.freshness' }} title={t('dev.runtime.howNewTheCodeIsInBoth')}>
        <dl className="rt-facts">
          <Fact name={t('dev.runtime.theServerLoadedItsOwnCodeAt')} value={record.freshness.newestLoaded} />
          <Fact name={t('dev.runtime.theNewestFileTheServerIsBuilt')} value={onDiskOf(record)} />
          <Fact
            name={t('dev.runtime.theServer')}
            value={saidOnThePage(record.freshness.said, record.freshness.says)}
            wrong={record.freshness.verdict === 'older than the checkout'}
          />
          <Fact name={t('dev.runtime.thisPageWasServedAt')} value={served?.servedAt ?? null} />
          <Fact name={t('dev.runtime.theNewestFileItWasServed')} value={served?.newestSourceFile ?? null} />
          <Fact
            name={t('dev.runtime.thisPageCameFromABuild')}
            value={served === undefined ? null : served.fromABuild ? t('dev.runtime.yes') : t('dev.runtime.no')}
          />
        </dl>
      </Panel>

      {/* THE WORKER THAT DELIVERS A MESSAGE TO AN AGENT, or the reason there is not one. It is the
          one process this product starts, by a recorded decision. Every line
          here is written on the server; nothing on this page works out what a stored word means. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.worker' }} title={t('dev.runtime.theWorkerThatAnswersMessages')}>
        <dl className="rt-facts">
          <Fact name={t('dev.runtime.startedByThisServer')} value={saidOnThePage(record.worker.said, record.worker.says)} wrong={!record.worker.started} />
          <Fact name={t('dev.runtime.stillThere')} value={stillThere(record)} wrong={record.worker.started && !record.worker.alive} />
          <Fact
            name={t('dev.runtime.runsGoingNow')}
            value={
              record.worker.runs.inFlight.length === 0
                ? t('dev.runtime.none')
                : record.worker.runs.inFlight.map((one) => saidOnThePage(one.said, one.says)).join(t('devWords.listGap'))
            }
          />
          {/* A RUN THAT HAS ANSWERED AND IS HOLDING ITS CONVERSATION OPEN FOR THE NEXT MESSAGE.
              Criterion M22. The sentence, and the time left in it, are written on the server. */}
          <Fact
            name={t('dev.runtime.waitingForTheNextMessage')}
            value={
              record.worker.runs.waitingForTheNextMessage.length === 0
                ? t('dev.runtime.none')
                : record.worker.runs.waitingForTheNextMessage.map((one) => saidOnThePage(one.said, one.says)).join(t('devWords.listGap'))
            }
          />
          <Fact
            name={t('dev.runtime.theLastRun')}
            value={record.worker.runs.last === null ? t('dev.runtime.noRun') : saidOnThePage(record.worker.runs.last.said, record.worker.runs.last.says)}
          />
          <Fact name={t('dev.runtime.messagesStillWaiting')} value={String(record.worker.runs.waiting)} />
          {/* THE MODEL A RUN FALLS BACK TO, and where the answer came from. Criterion M85, and U2:
              MOLE_OFFICE_AGENT_MODEL is what a run gets when nothing on the Settings page or an
              agent's profile names a model. Which model each place's runs go to is in the panel
              below, from the one reader the worker asks. */}
          <Fact name={t('dev.runtime.modelARunFallsBackTo')} value={oneAnswer({ name: record.worker.model.name, from: record.worker.model.from, fromSaid: [record.worker.model.fromSaid] })} />
          {record.worker.runsAreFaked === null ? null : (
            <Fact name={t('dev.runtime.runsAreNotReal')} value={fakedSays(record.worker.runsAreFaked)} wrong />
          )}
        </dl>
      </Panel>

      {/* WHICH RUNS GO WHERE, AND WHERE EACH ANSWER CAME FROM. Criterion T7. One entry per place
          the office starts a run, because one model line for the whole office would say "opus"
          about a run that went to opencode. The server writes every word here. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.places' }} title={t('dev.runtime.whichRunsGoWhere')}>
        {record.places.map((one) => (
          <div className="rt-place" key={one.place}>
            <h3 className="rt-place-title">{saidOnThePage(one.placeSaid, one.place)}</h3>
            <dl className="rt-facts">
              <Fact name={t('dev.runtime.runtime')} value={oneAnswer(one.runtime)} />
              <Fact name={t('dev.runtime.model')} value={oneAnswer(one.model)} />
              <Fact name={t('dev.runtime.reasoningEffort')} value={oneAnswer(one.variant)} />
            </dl>
            {one.says === null ? null : <p className="rt-note">{saidOnThePage(one.saysSaid, one.says)}</p>}
          </div>
        ))}
      </Panel>

      {/* WHICH AGENT TOOLS ARE ON THIS MACHINE. The sentence for a word the office does not dispatch
          is the one whatIsInstalled already answers, so the page never calls a tool missing when
          there is nothing here that needs it. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.tools' }} title={t('dev.runtime.theAgentToolsOnThisMachine')}>
        <dl className="rt-facts">
          {record.installed.map((one) => (
            <Fact
              key={one.runtime}
              name={one.runtime}
              value={one.where === null ? (notDispatched(one.runtime, one.says) ?? t('dev.runtime.notInstalled')) : one.where}
            />
          ))}
        </dl>
      </Panel>

      {/* WHAT THE LAST STARTS COST, AGAINST THE OWNER'S CEILING, AND WHAT EACH STEP COST. One
          decision set 15,000 tokens and two minutes; another decision retired the tool-round number
          and asked for the office-flow steps instead, recorded by the office itself from its own
          call log, never by asking an agent to summarise a
          session. The steps come from the server already
          measured; this file draws them and never retypes a step.
          A start nobody could measure is drawn through Absence, at the told-apart tier, rather
          than as a zero: `looked={false}` because this file never established a real number for
          it. A step with no request of its kind and a token number nobody reported are drawn the
          same way, each with its own words. */}
      <Panel titleIs="label" declares={{ surface: 'runtime.starts' }} title={t('dev.runtime.whatStartsCost')}>
        <p className="rt-note">{startCostCeilingLine(record.starts.ceiling)}</p>
        <dl className="rt-facts">
          <Fact name={t('dev.runtime.startsLookedAt')} value={String(record.starts.recent.length)} />
          <Fact
            name={t('dev.runtime.overTheCeiling')}
            value={String(record.starts.overCeilingCount)}
            wrong={record.starts.overCeilingCount > 0}
          />
          <Fact name={t('dev.runtime.notMeasured')} value={String(record.starts.unmeasuredCount)} />
        </dl>
        {record.starts.recent.length === 0 ? (
          <p className="rt-note">{t('dev.runtime.noSessionsHaveBeenRecordedHereYet')}</p>
        ) : (
          <ul className="rt-starts">
            {record.starts.recent.map((row) => (
              <li className="rt-start-row" key={row.sessionId}>
                <span className="rt-start-line">
                  <span className="rt-start-title">{row.title}</span>
                  {row.cost.measured ? (
                    <span className={row.cost.over.length > 0 ? 'rt-wrong' : undefined}>{startCostLine(row.cost)}</span>
                  ) : (
                    <Absence tier="told-apart" looked={false} word={t('dev.runtime.notMeasured')} title={row.cost.why} />
                  )}
                </span>
                {row.cost.measured ? (
                  <span className="rt-start-steps">
                    {row.cost.tokensSays === null ? null : <span className="rt-note">{startTokensExplanation(row.cost.tokensSays)}</span>}
                    <ul className="rt-steps">
                      {row.cost.steps.map((step) => (
                        <StepLine key={step.name} step={step} />
                      ))}
                    </ul>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* THE OFFICE'S OWN LOAD, by a decision: its read time, CPU and memory, here because this is the page a
          person opens on purpose (answer F2 above keeps every other page clear). Read from
          its own door, and read again with the press above. */}
      <TheOfficesLoad readAt={record.readAt} />

      {/* WHAT COULD NOT BE READ, and nothing at all when everything was. An empty list here means
          every field above is a reading; it never means there was nothing to say. */}
      {record.couldNotRead.length > 0 ? (
        <Panel titleIs="label" declares={{ surface: 'runtime.api' }} title={t('dev.runtime.whatCouldNotBeRead')}>
          <dl className="rt-facts">
            {record.couldNotRead.map((gap) => (
              <Fact key={gap.what} name={gap.what} value={gap.why} wrong />
            ))}
          </dl>
        </Panel>
      ) : null}
    </>
  )
}

/**
 * THE OFFICE'S OWN READ TIME, CPU AND MEMORY, AGAINST THEIR RANGES. Each number is drawn with its latest value, its
 * highest in the last hour and its top, and in red while it is above its top. The server works out every number and
 * whether it is out of range (src/server/lib/office-load.ts); this draws them.
 */
function TheOfficesLoad({ readAt }: { readAt: string }) {
  const [state] = useAsync(() => api.officeLoad(), [readAt])
  if (state.status === 'loading') return <Loading what={t('dev.runtime.load.title')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  const load = state.value
  const latest = load.latest
  return (
    <Panel titleIs="label" declares={{ surface: 'runtime.load' }} title={t('dev.runtime.load.title')}>
      <p className="rt-note">{t('dev.runtime.load.note', { since: load.serverStartedAt, n: load.readingsInARow })}</p>
      {latest === null ? (
        <p className="rt-note">{t('dev.runtime.load.noReading')}</p>
      ) : (
        <dl className="rt-facts">
          {OFFICE_LOAD_NUMBERS.map((number) => {
            const range = load.ranges.find((one) => one.number === number)
            const standing = load.standing.find((one) => one.number === number)
            const highest = Math.max(...load.lastHour.map((one) => loadValueOf(one, number) ?? Number.NEGATIVE_INFINITY))
            const parts = [
              loadNowSaid(latest, number),
              Number.isFinite(highest) ? t('dev.runtime.load.highest', { value: loadUnitSaid(number, highest) }) : null,
              range === undefined ? null : t(range.nobodyChose ? 'dev.runtime.load.topDefault' : 'dev.runtime.load.top', { top: loadUnitSaid(number, range.top) }),
              standing !== undefined && standing.outFor > 0
                ? t('dev.runtime.load.out', { count: standing.outFor, since: standing.outSince ?? '' })
                : null,
              standing !== undefined && standing.outFor > 0 && standing.toldIn !== null ? t('dev.runtime.load.told') : null,
            ].filter((part): part is string => part !== null)
            const out = standing !== undefined && standing.outFor > 0
            return (
              <Fact
                key={number}
                name={t(`dev.runtime.load.${number}`)}
                value={parts.join(t('sentence.clauseGap'))}
                wrong={out}
              />
            )
          })}
        </dl>
      )}
      <p className="rt-note">{t('dev.runtime.load.change')}</p>
    </Panel>
  )
}

/** One number's value at one reading, or null because the reading had nothing to measure. */
function loadValueOf(reading: OfficeLoadReading, number: OfficeLoadNumber): number | null {
  return number === 'readMs' ? reading.readMedianMs : number === 'cpuPercent' ? reading.cpuPercent : reading.memoryMb
}

/** A value with its unit, in the page's language. */
function loadUnitSaid(number: OfficeLoadNumber, value: number): string {
  if (number === 'readMs') return `${String(value)} ms`
  if (number === 'cpuPercent') return t('dev.runtime.load.cpuValue', { value })
  return t('dev.runtime.load.memoryValue', { value })
}

/** The latest reading of one number in words. */
function loadNowSaid(latest: OfficeLoadReading, number: OfficeLoadNumber): string {
  if (number !== 'readMs') return loadUnitSaid(number, loadValueOf(latest, number) ?? 0)
  if (latest.readMedianMs === null || latest.readSlowestMs === null) return t('dev.runtime.load.noReads')
  return t('dev.runtime.load.readValue', { median: latest.readMedianMs, slowest: latest.readSlowestMs, reads: latest.reads })
}

/** Whether the worker process is there, in words, including the case where there is no worker. */
function stillThere(record: RuntimeRecord): string | null {
  if (record.worker.alive === 'unknown') return null
  if (!record.worker.started) return t('dev.runtime.noWorker')
  return record.worker.alive ? t('dev.runtime.yes') : t('dev.runtime.workerStopped')
}

/** What it means that runs are being answered by a script rather than by a model. */
function fakedSays(script: string): string {
  return t('dev.runtime.fakeRuns', { script })
}

/**
 * One answer and where it came from, in one line.
 *
 * A name nobody set is drawn as "none named" rather than as an empty space, and the server's own
 * sentence says what applies instead. The page never works out a setting for itself.
 */
function oneAnswer(answer: RuntimePlace['runtime']): string {
  const from = saidOnThePage(answer.fromSaid, answer.from)
  return answer.name === null ? t('dev.runtime.noneNamed', { source: from }) : `${answer.name} — ${from}`
}

/**
 * WHY THE OFFICE STARTS NO RUN ON A TOOL, in the page's language, or null when the server said
 * nothing. The server's sentence is `whyTheOfficeCannotStartThisRuntime`, so the page asks the same
 * function, which reads the word lists; a sentence it does not recognise is drawn as it came.
 */
function notDispatched(runtime: string, says: string | null): string | null {
  if (says === null) return null
  return whyTheOfficeCannotStartThisRuntime(runtime) ?? says
}

/** The ceiling in one line. The numbers are declared once, in shared. */
function startCostCeilingLine(ceiling: StartCostCeiling): string {
  return startCostCeilingSaid(ceiling)
}

/** One measured start's own two numbers, and which of them is over when any of them is. */
function startCostLine(cost: StartCostMeasured): string {
  const numbers = startCostNumbers(cost.tokens, cost.minutes)
  return cost.over.length === 0 ? numbers : t('dev.runtime.over', { numbers, dimensions: cost.over.map((one) => t(one === 'tokens' ? 'dev.runtime.tokens' : 'dev.runtime.minutes')).join(t('dev.runtime.and')) })
}

/**
 * ONE STEP OF A START. Its time, and its tokens when a runtime reported them per request.
 *
 * A STEP WITH NO REQUEST OF ITS KIND IS DRAWN AS SAID, NEVER AS A ZERO. Its `firstAt` is absent
 * rather than zero, so this line hands the absence to `Absence` with the step's own sentence. The
 * same goes for the tokens: a runtime that reported one figure for the whole run leaves each step
 * with no token number, and that absence is drawn with the reason the receipt gives.
 */
function StepLine({ step }: { step: StartStepReading }) {
  const when =
    step.firstAt == null
      ? null
      : step.lastAt == null || step.lastAt === step.firstAt
        ? step.firstAt
        : t('dev.runtime.timeRange', { first: step.firstAt, last: step.lastAt })
  return (
    <li className="rt-step">
      <span className="rt-step-name">{startStepNameSaid(step)}</span>
      {when === null ? (
        <Absence tier="told-apart" looked={false} word={t('dev.runtime.noRequestOfThisKind')} title={startStepDescriptionSaid(step)} />
      ) : (
        <span className="rt-step-when">
          {when} — {startStepSpentSaid(step)}
        </span>
      )}
      {step.tokens == null ? (
        <Absence
          tier="told-apart"
          looked={false}
          word={t('dev.runtime.tokensNotMeasured')}
          title={startTokensExplanation(step.tokensSays ?? TOKENS_ARE_WHOLE_START)}
        />
      ) : (
        <span className="rt-step-tokens">{startTokensSaid(step.tokens)}</span>
      )}
    </li>
  )
}

/**
 * One fact: what it is, and what it is.
 *
 * A NULL VALUE SAYS NOBODY COULD READ IT, in those words, rather than being left out. A missing row
 * reads as a fact nobody thought to report; this one says the reading failed, and `couldNotRead`
 * above carries the reason.
 */
function Fact({ name, value, wrong }: { name: string; value: string | null; wrong?: boolean }) {
  return (
    <>
      <dt className="rt-key">{name}</dt>
      <dd className={wrong === true ? 'rt-value rt-wrong' : 'rt-value'}>
        {value === null ? <span className="rt-none">{t('dev.runtime.nobodyCouldReadThis')}</span> : value}
      </dd>
    </>
  )
}

/**
 * The database's identity: the sixteen characters every reply's world header carries.
 *
 * READ OFF THE WORLD THIS PAGE IS TALKING TO, not worked out here. It is the same identity the
 * banner compares, the session hook compares and a ledger row stores, and a second way to arrive at
 * it would be a second way to arrive at the wrong one. Null before any reply has been read, which
 * cannot happen on a page that has just read the runtime record, and is answered honestly anyway.
 */
function identityOf(): string | null {
  return theWorldThisPageStartedIn()?.database ?? null
}

/**
 * The newest file the SERVER is built from, with its time, in one value, or nothing when the walk
 * failed.
 *
 * The label beside it says "the server is built from" and not "in the checkout", because those are
 * different files and the difference is what problem `aI9V57-ZTyv0` was: this reading covers
 * src/server, src/shared and src/config, and a page file is not one of them.
 */
function onDiskOf(record: RuntimeRecord): string | null {
  if (record.freshness.newestOnDisk === null) return null
  const file = record.freshness.newestOnDiskFile
  return file === null ? record.freshness.newestOnDisk : t('dev.runtime.fileChanged', { file, at: record.freshness.newestOnDisk })
}

/**
 * One hoisted stylesheet, keyed by href so React 19 draws it once however many pages mount.
 *
 * No backtick anywhere inside, including in a comment: a backtick here closes the string and turns
 * the rest of the file into a parse error that points at a line of prose. CLAUDE.md has the count.
 */
const RUNTIME_CSS = `
.rt-worlds { margin-left: var(--pad); color: var(--accent); }
.rt { display: grid; gap: var(--gut-lg); }
.rt-title { font-size: var(--fs-5); margin: 0; }
.rt-when { margin: 0; font-size: var(--fs-1); color: var(--text-2); display: flex; align-items: center; gap: var(--gut); }
.rt-again {
  font: inherit;
  font-size: var(--fs-1);
  padding: 2px var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.rt-again:hover { background: var(--sunk); }
.rt-facts {
  display: grid;
  grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
  gap: 2px var(--gut);
  margin: 0;
}
.rt-key {
  font-size: var(--fs-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
  align-self: baseline;
}
.rt-value { margin: 0; overflow-wrap: anywhere; }
.rt-none { color: var(--text-2); font-style: italic; }
.rt-wrong { color: var(--st-broken); font-weight: 600; }
.rt-because { margin: var(--gut) 0 0; padding-left: var(--pad-lg); font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.rt-place { margin: 0 0 var(--gut-lg) 0; }
.rt-place:last-child { margin-bottom: 0; }
.rt-place-title { font-size: var(--fs-2); margin: 0 0 var(--gut) 0; }
.rt-note { margin: var(--gut) 0 0; font-size: var(--fs-1); color: var(--text-2); }
.rt-starts { list-style: none; margin: var(--gut) 0 0; padding: 0; display: grid; gap: var(--gut-lg); }
.rt-start-row { display: grid; gap: 2px; font-size: var(--fs-1); }
.rt-start-line { display: flex; justify-content: space-between; align-items: baseline; gap: var(--gut); flex-wrap: wrap; }
.rt-start-title { color: var(--text-2); overflow-wrap: anywhere; }
.rt-start-steps { display: grid; gap: 2px; padding-left: var(--pad); }
.rt-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.rt-step { display: flex; flex-wrap: wrap; gap: var(--gut); align-items: baseline; color: var(--text-2); }
.rt-step-name { font-weight: 600; color: var(--text); }
.rt-step-when { overflow-wrap: anywhere; }
.rt-step-tokens { color: var(--text-2); }
@media (max-width: 40rem) {
  .rt-facts { grid-template-columns: minmax(0, 1fr); gap: 0 0; }
  .rt-value { margin-bottom: var(--gut); }
  .rt-start-line { flex-direction: column; align-items: flex-start; gap: 2px; }
  .rt-step { flex-direction: column; gap: 0; }
}
`
