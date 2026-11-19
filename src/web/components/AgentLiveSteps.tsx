// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOXED RUN'S STEPS, LIVE, AND A BOX TO WRITE TO IT. Wave 13u, round 10, way C. By a decision, a wave
 * supervisor's page shows its live steps, and the person acts by message.
 *
 * GET /api/terminals/agents/:agent/steps reads the run's conversation from the byte it read up to last time, so this
 * part asks again every READ_EVERY_MS with the `next` it was given and adds what came. It keeps the newest
 * THE_MOST_KEPT steps. Its thinking is never a step: the server leaves it out.
 *
 * It draws nothing unless the agent's newest run works in a sandbox and is running, or was while the page watched it.
 * A run that ends while watched keeps its steps on the page, and one sentence says no more will come. A newer run
 * starts the list again. How the conversation was read is for Developer mode.
 *
 * The box writes an ordinary message to the agent, through POST /api/records, as the chat does (api.sendMessage).
 *
 * Its one prop is the agent. 13k places it on the agent's page.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import type { AnAgentsSteps, ARunsStep } from '@shared/terminals.ts'
import { api, faultOf } from '../api.ts'
import { Btn, ErrorNote, Panel } from './ui.tsx'
import { KeyQuestion, useAKeyQuestion } from './AKeyQuestion.tsx'
import { TERMINAL_VIEW_CSS } from './TerminalView.tsx'
import { AGENT_LIVE_CSS, DeveloperFacts, theProjectOfANewestRunElsewhere } from './AgentLiveParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { theStepsOf, whatARefusalSays } from '../lib/terminals.ts'

/** How often the steps are asked for again. */
export const READ_EVERY_MS = 2_000
/** The most steps the page keeps; older ones are dropped, and the page says earlier ones are not shown. */
const THE_MOST_KEPT = 200

interface Watching {
  /** The newest answer. */
  answer: AnAgentsSteps
  /** Every step read for its run since the page began watching it, newest last. */
  steps: ARunsStep[]
  /** Whether steps before the first one kept are missing. */
  earlier: boolean
  /** Whether the page watched this run while it was running. */
  watched: boolean
}

/** The step's time of day, from its local stamp "YYYY-MM-DD HH:MM:SS". */
function timeOf(at: string | null): string {
  return at === null ? '' : at.length >= 19 ? at.slice(11, 19) : at
}

/** The word for each kind of step but 'used', which names its tool. */
const KIND_WORD: Record<Exclude<ARunsStep['kind'], 'used'>, WordKey> = {
  read: 'agentLive.steps.read',
  ran: 'agentLive.steps.ran',
  wrote: 'agentLive.steps.wrote',
  said: 'agentLive.steps.said',
}

function kindWord(step: ARunsStep): string {
  return step.kind === 'used' ? t('agentLive.steps.used', { tool: step.tool }) : t(KIND_WORD[step.kind])
}

export function AgentLiveSteps({ agentId }: { agentId: string }): React.ReactElement | null {
  useLanguage()
  const inspect = useInspect()
  // The run is looked up in the page's project, so a change of project asks afresh.
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [watching, setWatching] = useState<Watching | null>(null)
  /** The first read's refusal, or a later read's, while the steps already read stay on the page. */
  const [refused, setRefused] = useState<{ message: string; fault: unknown } | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ ok: true } | { ok: false; why: string } | null>(null)
  // Asked once before words that seem to hold a key are sent.
  const keyQuestion = useAKeyQuestion()

  // ASK, ADD, AND ASK AGAIN, until the run is not one this part shows.
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let run: string | null = null
    let next: number | null = null
    setWatching(null)
    setRefused(null)
    const ask = async (): Promise<void> => {
      let again = true
      try {
        const answer = await theStepsOf(agentId, next)
        if (stopped) return
        setRefused(null)
        const sameRun = answer.run !== null && answer.run.id === run
        if (answer.state === 'shown') {
          if (!sameRun) next = null
          run = answer.run?.id ?? null
          next = answer.next
          setWatching((was) => {
            const before = sameRun && was !== null ? was.steps : []
            const all = [...before, ...answer.steps]
            const steps = all.slice(-THE_MOST_KEPT)
            return { answer, steps, earlier: (sameRun && was !== null && was.earlier) || answer.earlier || all.length > steps.length, watched: true }
          })
        } else {
          // A RUN THAT ENDED WHILE WATCHED keeps its steps; anything else starts afresh.
          setWatching((was) => (sameRun && was !== null && was.watched ? { ...was, answer } : { answer, steps: [], earlier: false, watched: false }))
          again = answer.state === 'no-log'
        }
      } catch (err) {
        if (stopped) return
        // AN ASK THAT ANSWERED 404 IS NOT REPEATED (round 109): asking every two seconds would get the same answer.
        // When the newest run is in another project, the pane and way-back parts say so, and this part draws nothing.
        const fault = faultOf(err)
        if (fault?.status === 404) again = false
        if (theProjectOfANewestRunElsewhere(fault) !== null) {
          setWatching(null)
          setRefused(null)
        } else {
          setRefused({ message: whatARefusalSays(err), fault: err })
        }
      }
      if (again && !stopped) timer = setTimeout(() => void ask(), READ_EVERY_MS)
    }
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [agentId, workspace])

  if (watching === null && refused === null) return null
  const answer = watching?.answer ?? null
  const state = answer?.state ?? null
  // NOTHING FOR AN AGENT WITH NO RUN IN A SANDBOX, or one that ended before the page watched it.
  if (watching !== null && !watching.watched && state !== 'shown' && state !== 'no-log') return null

  const send = async (askedAboutAKey = false): Promise<void> => {
    if (!askedAboutAKey && keyQuestion.stopsTheSend({ body: message.trim() }, () => void send(true))) return
    setSending(true)
    setSent(null)
    try {
      await api.sendMessage({ kind: 'agent', id: agentId }, message.trim())
      setMessage('')
      setSent({ ok: true })
    } catch (err) {
      setSent({ ok: false, why: whatARefusalSays(err) })
    } finally {
      setSending(false)
    }
  }

  const steps = watching?.steps ?? []
  const ended = watching !== null && watching.watched && state !== 'shown'
  return (
    <Panel declares={{ surface: 'profile.steps' }} titleIs="label" title={t('agentLive.steps.title')}>
      <style href="mole-office-terminal-view" precedence="default">
        {TERMINAL_VIEW_CSS}
      </style>
      <style href="mole-office-agent-live" precedence="default">
        {AGENT_LIVE_CSS}
      </style>
      <style href="mole-office-agent-live-steps" precedence="default">
        {AGENT_LIVE_STEPS_CSS}
      </style>
      {refused === null ? null : watching === null ? (
        <ErrorNote message={refused.message} label={t('agentLive.steps.refused')} />
      ) : (
        <p className="al-line" role="status">
          {t('agentLive.steps.refused')} {refused.message}
        </p>
      )}
      {watching === null ? null : (
        <section className="tm-view al-steps-view">
          {state === 'no-log' && steps.length === 0 ? <p className="al-line">{t('agentLive.steps.noLog')}</p> : null}
          {watching.earlier ? <p className="al-line al-earlier">{t('agentLive.steps.earlier')}</p> : null}
          {state === 'shown' && steps.length === 0 ? <p className="al-line al-none">{t('agentLive.steps.none')}</p> : null}
          {steps.length === 0 ? null : (
            <ol className="al-steps">
              {steps.map((step, i) => (
                <li key={i} data-kind={step.kind}>
                  <span className="al-at num" title={step.at ?? undefined}>
                    {timeOf(step.at)}
                  </span>
                  <span className="al-kind">{kindWord(step)}</span>
                  <span className={step.kind === 'said' ? 'al-what' : 'al-what tm-mono'}>{step.what}</span>
                </li>
              ))}
            </ol>
          )}
          {ended ? <p className="al-line al-ended" role="status">{t('agentLive.steps.ended')}</p> : null}
          <div className="al-message">
            <label htmlFor={`al-message-${agentId}`}>{t('agentLive.message.label', { handle: watching.answer.agent.handle })}</label>
            <textarea id={`al-message-${agentId}`} rows={3} value={message} onChange={(event) => {
              keyQuestion.close()
              setMessage(event.target.value)
            }} />
            <KeyQuestion question={keyQuestion} />
            <div className="al-row">
              <Btn
                size="sm"
                variant="primary"
                onClick={() => void send()}
                pending={sending}
                disabled={message.trim() === ''}
                reason={message.trim() === '' ? t('agentLive.message.empty') : undefined}
              >
                {t('agentLive.message.send')}
              </Btn>
              {sent === null ? null : sent.ok ? (
                <span className="al-line" role="status">
                  {t('agentLive.message.sent')}
                </span>
              ) : (
                <span className="al-line" role="alert">
                  {t('agentLive.message.refused')} {sent.why}
                </span>
              )}
            </div>
          </div>
        </section>
      )}
      {!inspect || watching === null ? null : (
        <DeveloperFacts
          rows={[
            [t('agentLive.dev.how'), watching.answer.says],
            [t('agentLive.dev.run'), watching.answer.run?.id ?? ''],
            [t('agentLive.dev.every'), `${String(READ_EVERY_MS / 1000)} s`],
          ]}
        />
      )}
    </Panel>
  )
}

const AGENT_LIVE_STEPS_CSS = `
.al-steps-view { gap: 0.5rem; }
.al-steps { list-style: none; margin: 0; padding: 0; display: grid; border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2); max-height: 32rem; overflow-y: auto; }
.al-steps li { display: grid; grid-template-columns: 5.5em 8em minmax(0, 1fr); gap: 0.5rem; padding: 0.4rem 0.6rem; border-top: var(--border-w, 1px) solid var(--border); }
.al-steps li:first-child { border-top: 0; }
.al-at { color: var(--text-3); }
.al-kind { font-weight: 600; overflow-wrap: anywhere; }
.al-what { min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.al-steps li[data-kind='said'] .al-what { color: var(--text); }
@media (max-width: 40rem) {
  .al-steps li { grid-template-columns: 5em minmax(0, 1fr); }
  .al-steps li .al-what { grid-column: 1 / -1; }
}
.al-message { display: grid; gap: 0.35rem; }
.al-message textarea { width: 100%; box-sizing: border-box; font: inherit; color: var(--text); background: var(--panel-2); border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); padding: 0.4rem; }
`
