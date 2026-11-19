// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { behaviorForJump } from '../lib/motion.ts'
/**
 * AGENT CONVERSATIONS: what you said, who it went to, and what came back.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS ON THIS PAGE
 * ---------------------------------------------------------------------------------------
 *
 * 1. WORK YOU CAN TALK ABOUT. The most recently changed records in this project, each with a press:
 *    say what you want, choose who it is for, and send it, or add it to a review.
 *
 *    THIS IS THE ONLY PAGE THAT DRAWS SUCH A PRESS, and it draws one because the whole point of the
 *    list is starting a conversation. Everywhere else, a thing is talked about by pointing at it —
 *    one listener at the document reads the attribute an element carries, and a button on each of a
 *    table's cells would be furniture. See components/agent/pointing.ts. The press here performs
 *    exactly the gesture a right-click performs, so there is no second way in.
 *
 * 2. THE CONVERSATIONS. One row each, newest movement first, with the counts.
 *
 * 3. ONE CONVERSATION, OPENED. Everything said in it — what a person said, what it was about and who
 *    it was for, and what the agent answered — and every run with where it stands.
 *
 *    EVERY ONE OF THOSE CAN BE POINTED AT, INCLUDING THE AGENT'S ANSWER. A message is one entry in
 *    the target vocabulary, so selecting part of a reply and carrying on from exactly those words is
 *    the same gesture as pointing at anything else in Mole Office. Nothing on this page implements it.
 *
 * ---------------------------------------------------------------------------------------
 * A RUN NOBODY HAS PICKED UP IS SAID, NOT SPUN
 * ---------------------------------------------------------------------------------------
 *
 * There is no spinner anywhere on this page for a queued run. "Waiting for a worker" is
 * the true answer when no worker is running, and a turning circle would say the opposite — that
 * something is happening. The words are the server's own.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT MAY ASK MOLE OFFICE TO SHOW YOU SOMETHING
 * ---------------------------------------------------------------------------------------
 *
 * A result may carry a focus — a record, or a plan and a line. Mole Office performs the navigation; the
 * agent never simulates a press. The server checks on every read whether what it names is really
 * there, and a focus that resolves to nothing is drawn as that rather than as a link that goes
 * nowhere.
 */

import { t } from '@shared/i18n.ts'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { faultOf, api, errorMessage } from '../api.ts'
import { AGENT_CSS } from '../components/agent/agent-css.ts'
import {
  INTENTS,
  INTENT_WORDS,
  MODE_WORDS,
  ROLE_WORDS,
  RUN_STATE_WORDS,
  THREAD_STATE_WORDS,
  withoutIds,
} from '../components/agent/context.ts'
import { agentName, idsTheThreadNames, nameOfWhoever, useAgentNames, type AgentNames } from '../components/agent/names.ts'
// THE THREE ATTRIBUTES THAT MAKE AN ELEMENT ADDRESSABLE, declared once in src/shared/targets.ts.
// Nothing here calls a hook: one listener at the document reads them. See agent/pointing.ts.
import { targetAttributes, textAttributes } from '@shared/targets.ts'
// ASKING FOR THE BOX FROM A PRESS. It performs the same gesture the pointer does and the one
// listener at the document answers it; see components/agent/pointing.ts.
import { addressableElement, askToTalkAbout } from '../components/agent/pointing.ts'
import { navigate, recordPath, planPath } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
/** The one place a page's name is written. See the note beside the Agent runs link below. */
import { RecordId } from '../components/RecordId.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, TextArea } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { reviewChanged, useReviewChanges } from '../lib/review.ts'
import { useInspect } from '../lib/mode.ts'
import { RAIL_WORD_KEYS } from '@shared/surfaces.ts'
import { drawnStamp } from '@shared/time.ts'
import type { AgentMessageView, AgentRunView, AgentThreadListView, MessageIntent, ThreadDetail } from '../../server/lib/agents.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { NonWorkKind } from '@shared/talksources.ts'
import { NARROW_SCREEN, SideBySide } from '../components/SideBySide.tsx'

/**
 * HOW LONG THE SEARCH WAITS AFTER THE LAST KEY BEFORE IT ASKS THE SERVER, in milliseconds, so a word
 * typed is one read and not one per letter.
 */
const SEARCH_WAIT_MS = 250

/** What the work list left out, counted by kind, as one phrase in the page's language; null when nothing was. */
function whatWasLeftOut(leftOut: Record<NonWorkKind, number>): string | null {
  const parts = [
    { n: leftOut.session, key: 'agentsPage.leftOut.runs' as const },
    { n: leftOut.flow_run, key: 'agentsPage.leftOut.flowRuns' as const },
    { n: leftOut.tool, key: 'agentsPage.leftOut.tools' as const },
    { n: leftOut.tool_category, key: 'agentsPage.leftOut.toolGroups' as const },
  ]
    .filter((one) => one.n > 0)
    .map((one) => t(one.key, { n: one.n }))
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]!
  if (parts.length === 2) return t('agentsPage.leftOut.two', { a: parts[0]!, b: parts[1]! })
  if (parts.length === 3) return t('agentsPage.leftOut.three', { a: parts[0]!, b: parts[1]!, c: parts[2]! })
  return t('agentsPage.leftOut.four', { a: parts[0]!, b: parts[1]!, c: parts[2]!, d: parts[3]! })
}

export function AgentsPage() {
  const changes = useReviewChanges()
  const [opened, setOpened] = useState<string | null>(null)
  const workSearch = useRef<HTMLInputElement>(null)
  const [threads] = useProjectAsync(() => api.agentThreads(), [changes])
  const threadRows = threads.status === 'ready' ? threads.value.threads : []
  const needsYou = threadRows.filter((thread) => thread.needsYou)
  const otherThreads = threadRows.filter((thread) => !thread.needsYou)
  const selectedId =
    opened !== null && threadRows.some((thread) => thread.id === opened)
      ? opened
      : (threadRows[0]?.id ?? null)
  const phoneConversationOpen = opened !== null && threadRows.some((thread) => thread.id === opened)

  const startFromWork = () => {
    workSearch.current?.focus({ preventScroll: true })
    document.getElementById('px-ac-work')?.scrollIntoView({ behavior: behaviorForJump(), block: 'start' })
  }

  return (
    <div className="px-ac-page" data-phone-open={phoneConversationOpen ? 'true' : 'false'}>
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      <style href="mole-office-conversations-redesigned" precedence="default">
        {AGENT_CONVERSATIONS_CSS}
      </style>
      <header className="px-ac-head">
        <div className="px-ac-head-copy">
          <h1 className="px-ag-title" data-title-is="its-label">{t(RAIL_WORD_KEYS['rail.agents'])}</h1>
          <p className="px-ag-lead">{t('agentsPage.lead')}</p>
        </div>
        <Btn variant="primary" onClick={startFromWork}>{t('agentsPage.start')}</Btn>
      </header>

      <SideBySide as="section" className="px-ac-layout" aria-label={t('agentsPage.conversations')}>
        <div className="px-ac-list-pane" data-column="start" {...declaredAttributes({ surface: 'agents.threads' })}>
          <div className="px-ac-list-head">
            <h2>{t('agentsPage.conversations')}</h2>
            {threads.status === 'ready' ? <span>{t('agentsPage.conversationCount', { n: threadRows.length })}</span> : null}
          </div>
          {threads.status === 'loading' ? <Loading what={t('g6a.agents.loadingThreads')} rows={3} /> : null}
          {threads.status === 'error' ? (
            <ErrorNote message={threads.message} fault={threads.fault} label={t('g6a.agents.threadsFailed')} />
          ) : null}
          {threads.status === 'ready' ? (
            <>
              <section className="px-ac-group px-ac-needs-you" aria-label={t('agentsPage.needsYou')}>
                <div className="px-ac-group-head">
                  <h3>{t('agentsPage.needsYou')}</h3>
                  <span>{t('agentsPage.conversationCount', { n: needsYou.length })}</span>
                </div>
                {needsYou.length === 0 ? (
                  <p className="px-ac-quiet">{t('agentsPage.nothingNeedsYou')}</p>
                ) : (
                  <ConversationRows threads={needsYou} selectedId={selectedId} onOpen={setOpened} />
                )}
              </section>
              <section className="px-ac-group" aria-label={t('agentsPage.conversations')}>
                <div className="px-ac-group-head">
                  <h3>{t('agentsPage.conversations')}</h3>
                  <span>{t('agentsPage.conversationCount', { n: otherThreads.length })}</span>
                </div>
                {otherThreads.length > 0 ? (
                  <ConversationRows threads={otherThreads} selectedId={selectedId} onOpen={setOpened} />
                ) : threadRows.length === 0 ? (
                  <Absence title={t('g6a.agents.emptyThreadsReason')} />
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div className="px-ac-detail" data-column="end">
          <button type="button" className="px-ac-back" aria-label={t('agentsPage.allConversations')} onClick={() => setOpened(null)}>
            <span aria-hidden="true">←</span> {t('agentsPage.allConversations')}
          </button>
          {selectedId === null ? (
            <Absence title={t('g6a.agents.emptyThreadsReason')} />
          ) : (
            <OneThread id={selectedId} />
          )}
        </div>
      </SideBySide>

      <section id="px-ac-work" className="px-ac-work-section" aria-labelledby="px-ac-work-title" {...declaredAttributes({ surface: 'agents.work' })}>
        <TalkSources searchRef={workSearch} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------- work to talk about

function ConversationRows({
  threads,
  selectedId,
  onOpen,
}: {
  threads: AgentThreadListView[]
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const inspect = useInspect()
  return (
    <div className="px-thread-list px-ac-thread-list">
      {threads.map((thread) => {
        const stopped = thread.lastRunState === 'failed' || thread.lastRunState === 'crashed' || thread.lastRunState === 'declined'
        const subline = thread.lastWordIsAgent
          ? t('agentsPage.yourTurn')
          : thread.needsYou
            ? t('agentsPage.nobodyAnswered')
            : `${MODE_WORDS[thread.mode]} · ${drawnStamp(thread.updatedAt)}`
        return (
          <button
            key={thread.id}
            type="button"
            className="px-thread-row px-ac-thread-row"
            data-needs-you={thread.needsYou ? 'true' : 'false'}
            aria-pressed={selectedId === thread.id}
            onClick={() => onOpen(thread.id)}
          >
            <span className="px-ac-thread-copy">
              <span className="px-thread-name">{thread.title}</span>
              <span className="px-thread-meta px-ac-thread-meta">{subline}</span>
            </span>
            <span className="px-ac-state" data-state={stopped ? 'failed' : thread.state}>{THREAD_STATE_WORDS[thread.state]}</span>
            {inspect ? <span className="px-ac-dev">{t('agentsPage.developerConversation', { id: thread.id, runs: thread.runCount })}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function TalkSources({ searchRef }: { searchRef: RefObject<HTMLInputElement | null> }) {
  const inspect = useInspect()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  useEffect(() => {
    const wait = setTimeout(() => setAsked(query), SEARCH_WAIT_MS)
    return () => clearTimeout(wait)
  }, [query])
  /**
   * THE LIST OF WORK IS READ AGAIN ONLY WHEN THE SEARCH CHANGES, and not when a comment is written,
   * and that is not an optimisation.
   *
   * Writing a comment does not change which records exist. Re-reading here would put this panel
   * back into its loading state for a moment, and the box a person is typing in lives inside one of
   * its rows — so the box would vanish mid-sentence, taking the confirmation of what was just sent
   * with it. Measured in the browser on 18 August 2026: the message was sent, the conversation
   * appeared in the list, and the sentence saying so was never seen.
   *
   * THE SERVER WORKS THE LIST OUT (src/shared/talksources.ts) and sends the rows drawn and the counts
   * under them. It used to send every record of the project for the page to pick five from: 7.2 MB on
   * an office of the live size. While a new search is read, the rows of the last one stay drawn.
   */
  const [work] = useProjectAsync(() => api.workToTalkAbout(asked), [asked])
  const leftOut = work.status === 'ready' ? whatWasLeftOut(work.value.leftOut) : null
  return (
    <>
      <div className="px-ac-work-head">
        <h2 id="px-ac-work-title">{t('agentsPage.work')}</h2>
        {work.status === 'ready' ? (
          <span className="px-ac-work-count">{t('agentsPage.workCount', { shown: work.value.rows.length, total: work.value.matched })}</span>
        ) : null}
      </div>
      <input
        ref={searchRef}
        className="px-ac-search"
        type="search"
        aria-label={t('agentsPage.findWork')}
        placeholder={t('agentsPage.findWork')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {work.status === 'loading' ? <Loading what={t('g6a.agents.loadingWork')} rows={4} /> : null}
      {work.status === 'error' ? <ErrorNote message={work.message} fault={work.fault} label={t('g6a.agents.workFailed')} /> : null}
      {work.status !== 'ready' ? null : work.value.rows.length === 0 ? (
        <Absence
          title={
            work.value.query !== ''
              ? t('agentsPage.noWorkMatches')
              : leftOut === null
                ? t('g6a.agents.emptyWorkReason')
                : t('agentsPage.leftOut.onlyThese', { what: leftOut })
          }
        />
      ) : (
        <div className="px-talk-scroller px-ag-sources px-ac-work-list">
          {work.value.rows.map((record) => <TalkSource key={record.id} record={record} />)}
        </div>
      )}
      {leftOut === null ? null : <p className="px-ac-left-out">{t('agentsPage.leftOut.line', { what: leftOut })}</p>}
      {inspect && work.status === 'ready' && work.value.leftOut.session > 0 ? (
        <p className="px-ac-dev">{t('agentsPage.developerRunsElsewhere', { n: work.value.leftOut.session, page: t('nav.sessions') })}</p>
      ) : null}
    </>
  )
}

/**
 * One piece of work, with the handle on it. THIS IS THE WHOLE WIRING, and it is two lines.
 *
 * Selecting words inside the title and then pressing Talk comments on those exact words rather than
 * on the record, because the title carries `data-text-field`. Nothing else is needed for that.
 */
function TalkSource({ record }: { record: PanelRecord }) {
  const inspect = useInspect()
  return (
    <button
      type="button"
      className="px-talk-source px-ac-work-row"
      {...targetAttributes({ kind: 'record', recordId: record.id, workspaceId: record.workspaceId })}
      aria-haspopup="dialog"
      aria-label={t('g6a.agents.talkAbout', { title: record.title })}
      onClick={(event) => askToTalkAbout(addressableElement(event.currentTarget))}
    >
      <span className="px-talk-source-title" {...textAttributes('title', 0)}>
        {record.title}
      </span>
      <span className="px-ac-work-changed">{t('agentsPage.changed', { at: drawnStamp(record.updatedAt) })}</span>
      {inspect ? <span className="px-ac-work-id"><RecordId id={record.id} where="card" /></span> : null}
    </button>
  )
}

const AGENT_CONVERSATIONS_CSS = `
.px-ac-page { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.px-ac-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--gut); min-width: 0; }
.px-ac-head-copy { min-width: 0; }
.px-ac-head .px-ag-title { margin: 0; }
.px-ac-head .px-ag-lead { margin: 4px 0 0; }
/* THE LIST AND THE OPEN CONVERSATION FOLLOW THE PRODUCT'S ONE WIDTH RULE, components/SideBySide.tsx:
   side by side on a wide screen, the list the narrower of the two. Below the switch a conversation
   is a screen of its own with a way back, which is the stacked form of this page. */
.px-ac-layout { --sbs-columns: minmax(15rem, 0.9fr) minmax(0, 1.6fr); gap: 0 32px; }
.px-ac-list-pane, .px-ac-detail { min-width: 0; }
.px-ac-list-head, .px-ac-work-head, .px-ac-group-head { display: flex; align-items: baseline; gap: var(--pad-lg); min-width: 0; }
.px-ac-list-head { margin-bottom: var(--pad); }
.px-ac-list-head h2, .px-ac-work-head h2, .px-ac-group-head h3 { margin: 0; font-size: var(--fs-2); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.px-ac-list-head > span, .px-ac-work-count, .px-ac-group-head > span { color: var(--text-3); font-size: var(--fs-1); font-variant-numeric: tabular-nums; }
.px-ac-group { min-width: 0; margin-top: 24px; }
.px-ac-group:first-of-type { margin-top: 0; }
.px-ac-group-head { padding-bottom: var(--pad); border-bottom: var(--border-w) solid var(--border-strong); }
.px-ac-needs-you .px-ac-group-head { border-bottom-color: var(--ask-line); color: var(--ask); }
.px-ac-thread-list { gap: 0; }
.px-ac-thread-row { position: relative; align-items: center; min-height: 60px; gap: var(--gut); padding: 10px; border: 0; border-bottom: var(--border-w) solid var(--border); border-radius: 0; background: transparent; font: inherit; text-align: left; }
.px-ac-thread-row:hover { background: var(--hover); }
.px-ac-thread-row[aria-pressed='true'] { background: var(--sel); }
.px-ac-needs-you .px-ac-thread-row[data-needs-you='true'] { background: var(--ask-row); }
.px-ac-needs-you .px-ac-thread-row[aria-pressed='true'] { box-shadow: inset var(--rail) 0 var(--ask-line); }
.px-ac-thread-copy { display: flex; flex: 1 1 12rem; flex-direction: column; gap: 2px; min-width: 0; }
.px-ac-thread-copy .px-thread-name { overflow-wrap: anywhere; }
.px-ac-thread-meta { margin-left: 0; }
.px-ac-state { flex: none; max-width: 9rem; padding: 3px 8px; border: var(--border-w) solid var(--border); border-radius: var(--radius-pill); color: var(--text-2); font-size: var(--fs-1); text-align: center; overflow-wrap: anywhere; }
.px-ac-state[data-state='failed'], .px-ac-state[data-state='crashed'], .px-ac-state[data-state='declined'] { border-color: var(--st-failed-line); color: var(--st-failed); }
.px-ac-state[data-state='running'], .px-ac-state[data-state='claimed'], .px-ac-state[data-state='queued'] { border-color: var(--st-running-line); color: var(--st-running); }
.px-ac-quiet { margin: var(--pad-lg) 0 0; color: var(--text-3); font-size: var(--fs-2); }
.px-ac-back { display: none; }
.px-ac-work-head { padding-bottom: var(--pad); border-bottom: var(--border-w) solid var(--border-strong); }
.px-ac-search { display: block; width: min(28rem, 100%); min-height: 44px; margin: var(--pad) 0; padding: 8px 12px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: inherit; }
.px-ac-work-list { max-height: none; overflow: visible; gap: 0; }
.px-ac-work-row { min-height: 60px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px; padding: 8px 0; border: 0; border-bottom: var(--border-w) solid var(--border); border-radius: 0; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.px-ac-work-row:hover { background: var(--hover); }
.px-ac-work-row:focus-visible, .px-ac-thread-row:focus-visible, .px-ac-back:focus-visible { outline: var(--focus-w) solid var(--accent); outline-offset: var(--focus-offset); }
.px-ac-work-changed { color: var(--text-3); font-size: var(--fs-1); }
.px-ac-work-id { font-size: var(--fs-1); }
.px-ac-dev { display: block; flex: 1 0 100%; min-width: 0; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.px-ac-thread-row .px-ac-dev { margin-top: 2px; }
.px-ac-open-thread > .px-ac-dev { margin: 8px 0 0; }
.px-ac-left-out { margin: 8px 0 0; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
@media ${NARROW_SCREEN} {
  .px-ac-detail { display: none; }
  .px-ac-page[data-phone-open='true'] .px-ac-head,
  .px-ac-page[data-phone-open='true'] .px-ac-list-pane,
  .px-ac-page[data-phone-open='true'] .px-ac-work-section { display: none; }
  .px-ac-page[data-phone-open='true'] .px-ac-detail { display: block; }
  .px-ac-page[data-phone-open='false'] .px-ac-detail { display: none; }
  .px-ac-back { display: inline-flex; align-items: center; gap: var(--pad); min-height: 44px; margin: 0 0 var(--pad); padding: 0; border: 0; background: transparent; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
  .px-ac-group { margin-top: 20px; }
  .px-ac-list-head { margin-bottom: 0; }
  .px-ac-work-section { min-width: 0; }
}
/* THE HEAD'S PRESS TAKES THE WHOLE WIDTH ON A PHONE. This is about the head alone, not the sections. */
@media (max-width: 800px) {
  .px-ac-head { flex-direction: column; align-items: stretch; }
  .px-ac-head > .px-btn { width: 100%; min-height: 44px; }
}
@media (max-width: 480px) {
  .px-ac-layout { gap: 0; }
  .px-ac-thread-row { align-items: flex-start; }
  .px-ac-state { max-width: 7rem; }
  .px-ac-work-row { min-height: 64px; }
  .px-ac-search { font-size: 16px; }
}
`

// ---------------------------------------------------------------------------- one conversation

function OneThread({ id }: { id: string }) {
  const changes = useReviewChanges()
  const inspect = useInspect()
  const [detail] = useProjectAsync(() => api.agentThread(id), [id, changes])
  /**
   * WHAT WAS READ LAST TIME, KEPT SO THAT WRITING IN A CONVERSATION DOES NOT ERASE IT.
   *
   * `useAsync` goes back to its loading state on every re-read, so this panel used to be replaced by
   * skeleton rows for a moment every time anything on the page announced a change. Everything inside
   * it was unmounted while that happened, which took the box a person had just written in and the
   * sentence saying what became of their words. This page already carries that lesson in its own
   * words about the list of work above; the reply box below walked into it.
   *
   * IT IS NOT A SECOND COPY OF THE CONVERSATION. It is the last answer this component was given,
   * drawn while the next one is in flight, and it is thrown away the moment a newer one arrives. A
   * read that FAILS still says so — the error is drawn above what was kept, rather than the kept
   * copy standing in for an answer nobody got.
   */
  const [lastRead, setLastRead] = useState<{ id: string; detail: ThreadDetail } | null>(null)
  if (detail.status === 'ready' && lastRead?.detail !== detail.value) setLastRead({ id, detail: detail.value })
  const kept = lastRead !== null && lastRead.id === id ? lastRead.detail : null
  const thread: ThreadDetail | null = detail.status === 'ready' ? detail.value : kept
  // THE NAMES THIS THREAD DRAWS, AND ONLY THOSE. The read waits for the detail because only the
  // detail says which recipients and runs the drawing names; it asks for them by id, narrow.
  const names = useAgentNames(idsTheThreadNames(thread), [thread])
  if (thread === null) {
    return (
      <Panel titleIs="label" declares={{ surface: 'agents.thread' }} title={t('g6a.agents.thread')}>
        {detail.status === 'error' ? (
          <ErrorNote message={detail.message} fault={detail.fault} label={t('g6a.agents.threadFailed')} />
        ) : (
          <Loading what={t('g6a.agents.loadingThread')} rows={3} />
        )}
      </Panel>
    )
  }
  /**
   * WHICH RUNS HAVE ALREADY SAID THEIR ANSWER, AS A MESSAGE UP THE PAGE.
   *
   * An answer used to live only inside a run's stored result, and it is now also a message in the
   * thread carrying the run that produced it. While both are true of a corpus, the same words would
   * be drawn twice on one page — once as the agent's message and once under the run.
   *
   * IT IS THE RUN'S OWN ID AND NOT A COMPARISON OF WORDS. `runId` on a message is the server saying
   * which run produced it, so this is a read of a stored fact. Matching answer text against message
   * text would be a second way of deciding the same thing, and two answers that differ by a
   * trailing space would draw the answer twice with nothing failing.
   *
   * A RUN THAT ANSWERED BEFORE THIS EXISTED IS NOT IN THIS LIST, and it draws its answer as it
   * always did. That is the point of reading what is there rather than assuming that a thread with
   * one agent message has an agent message for every run.
   */
  const answeredAbove = thread.messages.flatMap((one) => (one.runId === null ? [] : [one.runId]))
  return (
    <div className="px-ac-open-thread">
    <Panel declares={{ surface: null }} title={thread.thread.title}>
      {/* A RE-READ THAT FAILED IS SAID, ABOVE WHAT WAS KEPT. Silently going on drawing the last
          answer would make a broken connection look like a conversation nobody has added to. */}
      {detail.status === 'error' ? (
        <ErrorNote message={detail.message} fault={detail.fault} label={t('g6a.agents.lastRead')} />
      ) : null}
      <p className="px-review-note">{thread.says}</p>

      {thread.messages.map((message) => (
        <MessageLine key={message.id} message={message} names={names} />
      ))}

      {/* WHERE THIS CONVERSATION STANDS IS SAID ONCE, ABOVE, BY THE SERVER. This used to draw its
          own sentence whenever there were no runs, which worked the same fact out a second time and
          could contradict the first: a dispatched conversation with no run reads "This was
          dispatched and no run was written" above and would have read "nothing has been sent" here.
          The server counts the runs; this draws them. */}
      {thread.runs.map((run) => (
        <RunLine key={run.id} run={run} names={names} answeredAbove={answeredAbove} />
      ))}

      {/* ANSWERING THE ANSWER, which is the sentence Phase 9 exists to make true and which no
          surface offered. Measured in Chromium on 19 August 2026: an opened conversation held zero
          boxes to write in and no press with "reply" in its name, so the only route back into a
          conversation was the sidebar's "Ask agent" on some other page.
          A DROPPED CONVERSATION TAKES NO MORE. The server refuses it, and a box that accepted words
          it would then have to throw away is worse than no box. */}
      {thread.thread.state === 'abandoned' ? (
        <p className="px-review-note">{t('g6a.agents.abandoned')}</p>
      ) : (
        <ReplyBox thread={thread} names={names} />
      )}
    </Panel>
    {inspect ? <p className="px-ac-dev">{t('agentsPage.developerConversation', { id: thread.thread.id, runs: thread.runs.length })}</p> : null}
    </div>
  )
}

/**
 * WRITE BACK, TO THE AGENT THAT ANSWERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHO IT GOES TO IS READ, NEVER GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * The answer above is a message carrying the run that produced it, and that run carries the session
 * it went to. So "the same agent" is two reads of stored facts and no ranking at all.
 *
 * WHEN THAT SESSION IS NOT RECORDED, MOLE OFFICE DOES NOT PICK ONE. A reply sent to a new agent that has
 * never seen the work would be the substitution the whole composer exists to refuse. So the words
 * are kept in the conversation, the press is named after that, and the sentence says why nothing
 * went. Absence beats a guess, and words kept are better than words refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It does not rank recipients and it offers no picker. Replying in a conversation has one honest
 * answer — the agent that answered — and a list would be a second way to decide something already
 * decided. Talking to a DIFFERENT agent about those words is the composer's job, reached by pointing
 * at the answer.
 */
function ReplyBox({ thread, names }: { thread: ThreadDetail; names: AgentNames }) {
  const [intent, setIntent] = useState<MessageIntent>('ask')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  // THE LAST THING AN AGENT ACTUALLY SAID, found by the run id the message carries rather than by
  // its role. See MessageLine: role is written from a request header and a run id is not.
  const answered = [...thread.messages].reverse().find((one) => one.runId !== null) ?? null
  const run = answered === null ? null : (thread.runs.find((one) => one.id === answered.runId) ?? null)
  const backTo = run?.recipientSessionId ?? null

  const nothingWritten = body.trim() === '' ? t('g6a.agents.writeFirst') : null

  const send = () => {
    setSending(true)
    setFailed(null)
    void (async () => {
      try {
        await api.addAgentMessage(thread.thread.id, {
          intent,
          body,
          // WHICH WORDS THIS ANSWERS. An agent message is one entry in the target vocabulary, so a
          // reply says which answer it follows with nothing of its own.
          context: answered === null ? null : { target: { kind: 'agentMessage', messageId: answered.id } },
          recipient: backTo === null ? null : { kind: 'session', sessionId: backTo },
        })
        setBody('')
        if (backTo === null) {
          // WHY NOTHING WENT IS SAID ONCE, ABOVE THE BOX, by the mark that names the absence. A
          // second copy here would be the same fact worked out twice on one screen.
          setSaid(t('g6a.agents.kept'))
        } else {
          const outcome = await api.dispatchAgentThread(thread.thread.id)
          setSaid(outcome.note)
        }
        reviewChanged()
      } catch (err) {
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      }
      setSending(false)
    })()
  }

  return (
    <div className="px-reply">
      {/* WHERE IT GOES, SAID BEFORE ANYTHING IS TYPED, because it changes what the press below does.
          THE ABSENCE IS A MARK AND NOT A PARAGRAPH. Nobody wrote down which agent answered — that is
          "nobody looked", not "there is none", and the two must read differently. The press beside
          it already says what will happen to the words, so a sentence here would say it twice. */}
      {backTo === null ? (
        <Absence
          tier="told-apart"
          looked={false}
          word={t('g6a.agents.noAgent')}
          title={t('g6a.agents.noAgentReason')}
        />
      ) : (
        <p className="px-reply-to">{t('g6a.agents.replyTo', {name: agentName(names, backTo)})}</p>
      )}
      <div className="px-talk-intents" role="group" aria-label={t('g6a.agents.intent')}>
        {INTENTS.map((one) => (
          <button
            key={one}
            type="button"
            className="px-talk-intent"
            aria-pressed={one === intent}
            title={INTENT_WORDS[one].what}
            onClick={() => setIntent(one)}
          >
            {INTENT_WORDS[one].label}
          </button>
        ))}
      </div>
      <TextArea
        value={body}
        onChange={setBody}
        rows={3}
        growTo={12}
        placeholder={INTENT_WORDS[intent].what}
        aria-label={t('g6a.agents.reply')}
      />
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g6a.agents.writeFailed')} />}
      {said === null ? null : <p className="px-run-says">{said}</p>}
      <div className="px-talk-do">
        {/* THE PRESS IS NAMED AFTER WHAT IT WILL DO, and the two names are different promises. */}
        <Btn
          onClick={send}
          pending={sending}
          pendingFailed={failed !== null}
          {...(nothingWritten === null ? {} : { disabled: true, reason: nothingWritten, title: nothingWritten })}
        >
          {backTo === null ? t('g6a.agents.keep') : t('g6a.agents.send')}
        </Btn>
        {/* WHY THE PRESS IS OFF, ON THE SCREEN, BEFORE ANYBODY PRESSES IT. Same rule and same reason
            as the composer's own refusal line; see TalkBox. */}
        {nothingWritten === null ? null : (
          <span className="px-talk-refusal" role="status">
            {nothingWritten}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * ONE THING SAID IN A CONVERSATION, AND CONTINUING FROM IT IS THE ORDINARY GESTURE.
 *
 * WHAT WAS SAID IS ITSELF SOMETHING TO POINT AT. An agent message is one entry in the same
 * vocabulary as a record or a block, so selecting part of a reply and carrying on from exactly those
 * words needs nothing of its own: the wrapper says which message this is, the body says which stored
 * string it is and where its first character sits in it, and the one listener at the document does
 * the rest. There is no second mechanism here and there must never be one.
 *
 * WHO SAID IT DECIDES HOW THE HEAD READS, and that is the whole of the difference between the two.
 * A person's message is labelled by what they meant — Ask, Discuss, Review, Change, Start work —
 * because they chose one of the five, and it says who it went to. An agent's answer had no such
 * choice to make and is not addressed to anybody, so it is labelled by who said it and the "to"
 * line is left off. Drawing an answer as "Ask · Nobody chosen" was two false statements about it.
 */
export function MessageLine({ message, names }: { message: AgentMessageView; names: AgentNames }) {
  const inspect = useInspect()
  // Null means "this role is named from what the message MEANS", which is only ever a person's.
  const who = ROLE_WORDS[message.role]
  /**
   * A MESSAGE THAT SAYS IT IS AN AGENT'S AND HAS NO RUN BEHIND IT.
   *
   * `role` is written from one request header, so a POST carrying `x-mole-office-actor-type: agent`
   * stores a message with role `agent` and no run id, and this page drew it exactly like a real
   * reply — heading and all. The schema says which field settles it: `run_id` "is how a reader tells
   * the two apart without guessing from role", and this page was guessing from role.
   *
   * IT IS SAID RATHER THAN RE-LABELLED. What was stored is still what is drawn; what is added is the
   * one fact that separates the two, so nothing is hidden and nothing is claimed.
   */
  const noRunBehindIt = message.role !== 'human' && message.runId === null
  /**
   * IT HAS NOT GONE ANYWHERE YET, AND THAT USED TO BE INVISIBLE.
   *
   * Dispatch sends what it can and holds back what it cannot route, so a conversation can read
   * comment, held comment, agent answer — and a reader takes the answer as a reply to both. Nothing
   * on the message said otherwise: neither its state nor the sentence the server computes for it was
   * drawn anywhere under src/web. Meanwhile the conversation's own summary promises the opposite:
   * "each comment below says whether it went, and the ones still waiting say why they did not."
   *
   * ONLY THE WAITING ONES ARE MARKED. A comment that went needs nothing from anybody, and the
   * contract gives weight in proportion to whether the reader has to act.
   */
  const stillWaiting = message.role === 'human' && message.state === 'queued'
  return (
    <div className="px-msg" {...targetAttributes({ kind: 'agentMessage', messageId: message.id })}>
      <div className="px-msg-head">
        <span className="px-review-intent">{who ?? INTENT_WORDS[message.intent].label}</span>
        {stillWaiting ? <span className="px-msg-waiting">{t('g6a.agents.unsent')}</span> : null}
        {message.reading === null ? (
          <span className="px-msg-about"><Absence title={t('g6a.agents.noSubject')} /></span>
        ) : (
          <span className="px-msg-about" data-state={message.reading.state} title={inspect ? message.reading.says : withoutIds(message.reading.says, message.context)}>
            {inspect ? message.reading.about : withoutIds(message.reading.about, message.context)}
          </span>
        )}
        {who !== null ? null : (
          <span className="px-review-to">
            {message.recipient === null
              ? t('g6a.agents.noRecipient')
              : message.recipient.kind === 'unresolved'
                ? t('g6a.agents.ambiguous', {said: message.recipient.said ?? ''})
                : // A DURABLE AGENT AND A RUN ARE TWO FIELDS NOW, and exactly one of them is filled.
                  // Reading `sessionId` alone would call a durable agent "a new agent", because that
                  // field is null for one — and reading it before 25 August 2026 looked a durable
                  // agent's id up among the runs and answered "an agent that is not filed in this
                  // project any more". `nameOfWhoever` looks in both.
                  t('g6a.agents.to', {name: nameOfWhoever(names, message.recipient)})}
          </span>
        )}
      </div>
      <p className="px-msg-body" {...textAttributes('body', 0)}>
        {message.body}
      </p>
      {message.reading !== null && message.reading.state !== 'there' ? (
        // WHAT IT WAS ABOUT HAS MOVED. Mole Office does not move the comment onto different words and
        // does not pretend the offsets still hold; it says which of the two happened.
        <p className="px-run-says">{inspect ? message.reading.says : withoutIds(message.reading.says, message.context)}</p>
      ) : null}
      {/* WHY IT HAS NOT GONE, IN THE SERVER'S OWN WORDS. `delivery.says` is the one answer to that
          question in this product: the screen shows it, the reply to a write carries it, and
          dispatch acts on `canSend`. Working out a second sentence here would be two answers to one
          question, which is the defect this repository names as its own. */}
      {stillWaiting ? <p className="px-run-says">{message.delivery.says}</p> : null}
      {noRunBehindIt ? (
        <p className="px-run-says">{t('g6a.agents.unconfirmed')}</p>
      ) : null}
      {inspect ? <p className="px-ac-dev">{t('agentsPage.developerMessage', { id: message.id })}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------- what came back

/**
 * One attempt, and where it stands.
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER. The thing worth pinning is that a run nobody
 * has claimed says so in words and never spins, and that is a property of what this draws rather
 * than of the page that fetches it.
 */
export function RunLine({
  run,
  names,
  answeredAbove = [],
}: {
  run: AgentRunView
  names: AgentNames
  /**
   * The ids of the runs whose answer is already a message up the page.
   *
   * An answer drawn here and again as a message above is one fact on the screen twice. Empty is the
   * honest default: a caller that has not looked has not found anything.
   */
  answeredAbove?: readonly string[]
}) {
  const inspect = useInspect()
  const said = answerOf(run.result)
  // A read of what is on the page, not an assumption about the thread. See OneThread.
  const answer = answeredAbove.includes(run.id) ? null : said
  return (
    <div className="px-run">
      <div className="px-run-head">
        <span className="px-run-state">{RUN_STATE_WORDS[run.state]}</span>
        <span className="px-review-to">{t('g6a.agents.to', {name: agentName(names, run.recipientSessionId)})}</span>
      </div>
      {/* NO SPINNER, EVER. The state word above and this sentence are the whole answer, including
          when the answer is that nobody has taken it. */}
      <p className="px-run-says">{run.says}</p>

      {answer === null ? null : <p className="px-run-answer">{answer}</p>}

      {run.focus === null ? null : (
        <div className="px-run-focus">
          <p className="px-run-says">{run.focus.says}</p>
          {run.focus.resolves ? <FocusPress asked={run.focus.asked} /> : null}
        </div>
      )}

      {inspect && run.result !== null ? (
        <pre className="px-run-says">{JSON.stringify(run.result, null, 2)}</pre>
      ) : null}
      {inspect ? <p className="px-ac-dev">{t('agentsPage.developerRun', { id: run.id })}</p> : null}
    </div>
  )
}

/** The short answer a result carries, or null when it carries none. */
function answerOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const said = (result as Record<string, unknown>)['answer']
  return typeof said === 'string' && said.trim() !== '' ? said : null
}

/**
 * The press that goes where the agent asked.
 *
 * MOLE OFFICE NAVIGATES. The agent named a record or a plan; this is Mole Office opening it, which is the
 * difference that matters — an agent that says where to look, not one that simulates a
 * click. The server has already checked that what it names is there, so this only ever draws a
 * press for a focus that resolves.
 *
 * A LINE OF A PLAN IS OPENED AT ITS PLAN AND THE BUTTON SAYS SO. Nothing in this app scrolls the
 * page to an item, the address is the router's so an in-page anchor is not available, and the plan
 * page belongs to another wave. Saying "open the plan" and opening the plan is honest; saying "go
 * to the line" and landing at the top of a long plan is not.
 */
function FocusPress({ asked }: { asked: unknown }) {
  if (typeof asked !== 'object' || asked === null || Array.isArray(asked)) return null
  const focus = asked as Record<string, unknown>
  const record = focus['record']
  if (typeof record === 'string' && record !== '') {
    return (
      <Btn size="sm" variant="secondary" onClick={() => navigate(recordPath(record))}>
        {t('g6a.agents.openRecord')}</Btn>
    )
  }
  const plan = focus['plan']
  if (typeof plan === 'string' && plan !== '') {
    const line = focus['line']
    return (
      <>
        <Btn size="sm" variant="secondary" onClick={() => navigate(planPath(plan))}>
          {t('g6a.agents.openPlan')}</Btn>
        {typeof line === 'string' && line !== '' ? (
          <p className="px-run-says">
            {t('g6a.agents.planPosition')}</p>
        ) : null}
      </>
    )
  }
  return null
}
