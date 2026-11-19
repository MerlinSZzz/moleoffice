// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue.
/**
 * ONE EMERGENCY PUSH, AS BOTH PAGES THAT DRAW IT SAY IT (wave 13u round 88, item 23). The queue page draws each push in
 * its lane's history, and the push's own record page draws it whole. Who pushed, how the push ended and what its
 * follow-up run found are worked out here once, and both pages draw them from here.
 *
 * THE RECORD PAGE DREW A PUSH'S PLAIN FIELDS ONLY. Every field that holds an object (who pushed, the line, the chat
 * message, the switch, how it ended) is kept out of the body by `drawableAsWords`, which is right, and the follow-up is
 * worked out on read and stored nowhere. So the page reads the push on its own door and draws one row for each. An
 * absence is said in words: a push that has not ended says so, and so does one that ended without moving main.
 *
 * WHAT THE MERGE TOOL SAID CAN NAME PATHS, and so can the reason a follow-up cannot be read, so the record page draws
 * them in developer mode only. The queue page names ids and paths in both modes, and draws them always.
 */
import type { ReactNode } from 'react'
import type { EmergencyPushReading } from '@shared/emergency-push.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { parseAnyStamp } from '@shared/time.ts'
import { api } from '../api.ts'
import { formatWhen } from '../lib/attention.ts'
import { useInspect } from '../lib/mode.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { RouteLink, recordPath } from './router.tsx'
import { titleHere } from './sections.ts'
import { ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** A stored moment, short: "01:24" when it is on the day of `now`, and with its day when it is not. */
export function shortTime(stamp: string, now: Date): string {
  const at = parseAnyStamp(stamp)
  if (at === null) return stamp
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  return sameDay ? [at.getHours(), at.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':') : formatWhen(stamp)
}

/** The rules both pages draw a push with. The queue page puts them in its own sheet; the record page in this file's. */
export const PUSH_CSS = `
.mq-by { color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-mono, monospace); overflow-wrap: anywhere; }
.mq-by-unknown { color: var(--text-3); font-family: var(--font-ui); font-style: italic; }
.mq-follow-red { color: var(--st-failed); background: var(--st-failed-bg); border-left: 3px solid var(--st-failed-line); font-weight: var(--st-failed-weight); padding: 2px 6px; }
.mq-follow-red a { color: inherit; }
`

/**
 * WHO PUSHED, by the handle the registry gives, or in words when the office cannot name it. The queue page says it
 * after the push's state ("by ..."), and the record page alone in its row.
 */
export function WhoPushed({ who, form }: { who: string | null; form: 'by' | 'alone' }) {
  if (who === null) {
    return (
      <span className="mq-by mq-by-unknown" data-by="unknown">
        {t(form === 'by' ? 'mergeQueuePage.push.whoUnknown' : 'pushPage.whoUnknown')}
      </span>
    )
  }
  return (
    <span className="mq-by" data-by={who}>
      {form === 'by' ? t('mergeQueuePage.push.by', { who }) : content(who)}
    </span>
  )
}

/** One line said of a push: its words, whether it is a red follow-up, and the receipt it leads to, if any. */
export interface PushLine {
  says: string
  red: boolean
  receipt: string | null
}
const plain = (says: string): PushLine => ({ says, red: false, receipt: null })

/**
 * HOW THE PUSH ENDED, in short sentences: while it moves main, that a landing waits for it; once it ended, when, and
 * whether it went on to the private copy and the mirror. `machineWords` adds what the merge tool said.
 */
export function howThePushEnded(push: EmergencyPushReading, now: Date, machineWords: boolean): PushLine[] {
  if (push.ended === null) return [plain(t('mergeQueuePage.push.moving'))]
  const onward = push.ended.onward
  const lines = [
    plain(t('mergeQueuePage.push.ended', { at: shortTime(push.ended.at, now) })),
    plain(
      onward === null
        ? t('mergeQueuePage.push.onward.none')
        : onward.ok
          ? t('mergeQueuePage.push.onward.ok')
          : machineWords
            ? t('mergeQueuePage.push.onward.failed', { says: content(onward.says) })
            : t('pushPage.onward.failed'),
    ),
  ]
  return lines
}

/**
 * WHAT THE FIRST WHOLE-SUITE RUN ON MAIN THAT HOLDS THE PUSH SAID, or null for a push that owes none. A red run is
 * marked `red`, so a page marks it apart from the lines around it (wave 13u round 83), and a filed run leads to its
 * receipt rather than writing its id.
 */
export function theFollowUpOf(push: EmergencyPushReading, machineWords: boolean): PushLine | null {
  const follow = push.followUp
  if (follow === null) return null
  if (follow.state === 'not-owed') throw new Error(`The office says emergency push ${push.id} owes no follow-up run, which it says only of a release that did not go in.`)
  if (follow.state === 'missing') return plain(t('mergeQueuePage.push.followUp.missing'))
  if (follow.state === 'unknown') return plain(machineWords ? t('mergeQueuePage.push.followUp.unknown', { because: content(follow.because) }) : t('pushPage.followUp.unknown'))
  return { says: t(follow.green ? 'mergeQueuePage.push.followUp.green' : 'mergeQueuePage.push.followUp.red'), red: !follow.green, receipt: follow.receipt.id }
}

/** The lines said of a push, each a paragraph of `className`, a red one marked, and a receipt as a link. */
export function PushLines({ lines, className }: { lines: PushLine[]; className: string }) {
  return (
    <>
      {lines.map((line) => (
        <p key={line.says} className={line.red ? `${className} mq-follow-red` : className} {...(line.red ? { 'data-follow-up': 'red' } : {})}>
          {line.says}
          {line.receipt === null ? null : (
            <>
              {' '}
              <RouteLink to={recordPath(line.receipt)}>{t('mergeQueuePage.push.followUp.receipt')}</RouteLink>
            </>
          )}
        </p>
      ))}
    </>
  )
}

const PUSH_PAGE_SHEET = 'mole-office-an-emergency-push'

const PUSH_PAGE_CSS = `${PUSH_CSS}
.mp-facts { margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.mp-fact { display: grid; grid-template-columns: 11rem minmax(0, 1fr); column-gap: 0.75rem; align-items: baseline; }
.mp-fact dt { color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.mp-fact dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.mp-line { margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mp-none { color: var(--text-2); }
@media (max-width: 40rem) {
  .mp-fact { grid-template-columns: minmax(0, 1fr); }
}
`

function Fact({ fact, title, declares, children }: { fact: string; title: string; declares: Declares | null; children: ReactNode }) {
  return (
    <div className="mp-fact" data-push-fact={fact} {...(declares === null ? {} : declaredAttributes(declares))}>
      <dt>{title}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A word said where a fact is absent, so the row is never blank. */
function None({ word }: { word: WordKey }) {
  return <p className="mp-line mp-none">{t(word)}</p>
}

/** The switch as the push read it when it started: its value, the end time chosen, and when it was thrown. */
function theSwitchLines(push: EmergencyPushReading, now: Date): { word: string; none: boolean }[] {
  const row = push.switch
  const until = row.chosen?.until ?? null
  const thrown = row.lastChange?.at ?? null
  return [
    row.value === null ? { word: t('pushPage.switch.unread'), none: true } : { word: row.value === '1' ? t('pushPage.switch.on') : t('pushPage.switch.value', { value: content(row.value) }), none: false },
    until === null ? { word: t('pushPage.switch.noUntil'), none: true } : { word: t('pushPage.switch.until', { until: shortTime(until, now) }), none: false },
    thrown === null ? { word: t('pushPage.switch.notThrown'), none: true } : { word: t('pushPage.switch.thrown', { at: shortTime(thrown, now) }), none: false },
  ]
}

/**
 * THE PUSH, ROW BY ROW: who pushed, the line, the chat message, the switch, how it ended and the follow-up. Each row of
 * a section the push declares declares that section; the follow-up is worked out on read, so it is no section.
 */
export function ThePushFacts({ push, now, inspect, sections }: { push: EmergencyPushReading; now: Date; inspect: boolean; sections: (key: string) => Declares }) {
  const ended = howThePushEnded(push, now, inspect)
  const follow = theFollowUpOf(push, inspect)
  return (
    <dl className="mp-facts" data-push-facts="">
      <Fact fact="by" title={titleHere('emergency_push', 'by')} declares={sections('by')}>
        <WhoPushed who={push.who} form="alone" />
      </Fact>
      <Fact fact="line" title={titleHere('emergency_push', 'line')} declares={sections('line')}>
        {push.line === null ? <None word="pushPage.line.none" /> : push.lineWho === null ? <None word="pushPage.line.unknown" /> : <span className="mq-by">{content(push.lineWho)}</span>}
      </Fact>
      <Fact fact="message" title={titleHere('emergency_push', 'message')} declares={sections('message')}>
        <RouteLink to={recordPath(push.message.id)}>{t('pushPage.message.open')}</RouteLink>
      </Fact>
      <Fact fact="switch" title={titleHere('emergency_push', 'switch')} declares={sections('switch')}>
        {theSwitchLines(push, now).map((line) => (
          <p key={line.word} className={line.none ? 'mp-line mp-none' : 'mp-line'}>
            {line.word}
          </p>
        ))}
      </Fact>
      <Fact fact="ended" title={titleHere('emergency_push', 'ended')} declares={sections('ended')}>
        {push.ended === null ? <None word="pushPage.ended.not" /> : null}
        <PushLines lines={ended} className="mp-line" />
        {inspect && push.ended !== null ? <p className="mp-line">{t('pushPage.ended.toolSaid', { says: content(push.ended.says) })}</p> : null}
      </Fact>
      <Fact fact="followUp" title={t('pushPage.followUp.title')} declares={null}>
        {follow !== null ? (
          <PushLines lines={[follow]} className="mp-line" />
        ) : push.ended === null ? (
          <None word="pushPage.followUp.notYet" />
        ) : (
          <None word="pushPage.followUp.notOwed" />
        )}
      </Fact>
    </dl>
  )
}

/** ON A PUSH'S OWN RECORD PAGE: the push read on its own door, and drawn whole. */
export function ThePushOnItsPage({ record, sections }: { record: PanelRecord; sections: (key: string) => Declares }) {
  const inspect = useInspect()
  const [state, reload] = useProjectAsync(() => api.emergencyPush(record.id), [record.id])
  return (
    <>
      <style href={PUSH_PAGE_SHEET} precedence="default">
        {PUSH_PAGE_CSS}
      </style>
      {/* SEE-THROUGH, as the panels drawn for a run beside it are: the page's article declares the record, and each row
          declares its own section of the push. */}
      <Panel declares={{ surface: null }} title={t('pushPage.heading')}>
        {state.status === 'loading' ? <Loading label={t('pushPage.heading')} rows={2} /> : null}
        {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
        {state.status === 'ready' ? <ThePushFacts push={state.value.push} now={new Date()} inspect={inspect} sections={sections} /> : null}
      </Panel>
    </>
  )
}
