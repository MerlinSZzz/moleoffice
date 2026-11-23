// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A RUN STOPPED, AND ITS WAIT ON A USAGE LIMIT, IN WORDS ON THE RUN'S PAGE. Wave 13s round 50.
 *
 * Round 49 made both of them session fields, `stopCause` and `waitingOnALimit`, and gave each a section title. Pictures
 * of the run's page at four widths in both themes then showed that neither was drawn at all in Normal mode. Both fields
 * are objects, and `drawableAsWords` in src/shared/sections.ts keeps objects out of the body, which is right. So, as
 * with TheCheckOnARun, the fix is a panel for each rather than a change to that rule.
 *
 * Both fields are read through src/config/a-runs-stop-and-wait.mjs, the readers the sweep and the casting roll use, so
 * an older run that keeps them in `extra` is drawn too.
 *
 * WEIGHT. Every stop cause is one the person must act on (`THE_CAUSES_THEY_MUST_ACT_ON`), so its panel is drawn at alarm
 * rank, in the colour TheCheckOnARun uses for a refusal. A wait ends by itself when OpenCode tries again, so its panel is
 * plain. Each panel draws nothing on a run that does not hold its field.
 *
 * A TIME IS DRAWN IN LOCAL TIME WHEN IT IS ONE, AND AS WRITTEN WHEN IT IS NOT. A Claude Code stop keeps its reset as the
 * words the limit said, such as "7:10pm (Europe/London)", and those words are the only honest answer. Where the reset
 * came from (`resetFrom`) follows it, so a time the error named and a time the office assumed can be told apart.
 */

import type { ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { drawnStamp, localStamp, parseAnyStamp } from '@shared/time.ts'
import { saysStillGoing } from '@shared/types.ts'
import { theStopCauseOf, theWaitOnALimitOf } from '../../config/a-runs-stop-and-wait.mjs'
import { titleHere } from './sections.ts'
import { Panel } from './ui.tsx'

const STOP_AND_WAIT_SHEET = 'mole-office-stop-and-wait-of-a-run'

const STOP_AND_WAIT_CSS = `
.sw-state { margin: 0 0 var(--pad) 0; font-weight: 600; overflow-wrap: anywhere; }
.sw-facts { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.sw-fact { display: grid; grid-template-columns: 7rem minmax(0, 1fr); column-gap: 0.5rem; align-items: baseline; }
.sw-fact dt { color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.sw-fact dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.sw-from { display: block; color: var(--text-2); font-size: var(--fs-1); }
.sw-none { color: var(--text-2); }
`

type Data = Record<string, unknown>

function Sheet() {
  return (
    <style href={STOP_AND_WAIT_SHEET} precedence="default">
      {STOP_AND_WAIT_CSS}
    </style>
  )
}

/** On a run that holds a stop cause: what stopped it, what it said, when, and when the limit resets. */
export function TheStopOfARun({ data }: { data: Data }) {
  const cause = theStopCauseOf(data)
  if (cause === null) return null
  return (
    <>
      <Sheet />
      <Panel declares={{ surface: null }} title={titleHere('session', 'stopCause')} rank={0} tone="blocked">
        <p className="sw-state">{theStopInWords(cause['kind'])}</p>
        <dl className="sw-facts">
          <Fact label={t('w13s.limit.said')}>{theWords(cause['said'])}</Fact>
          <Fact label={t('w13s.limit.at')}>{theMoment(cause['at']) ?? <span className="sw-none">{t('w13s.limit.noWhen')}</span>}</Fact>
          <Fact label={t('w13s.limit.resets')}>{theReset(cause['resetsAt'], cause['resetFrom'])}</Fact>
        </dl>
      </Panel>
    </>
  )
}

/** On a run that holds a mark of waiting on a usage limit: that it waits, what the limit said, and when it resets. */
export function TheWaitOfARun({ data }: { data: Data }) {
  const mark = theWaitOnALimitOf(data)
  if (mark === null) return null
  // Only a run still going can still be waiting.
  const going = saysStillGoing(data['state'])
  const attempt = mark['attempt']
  const provider = mark['provider']
  return (
    <>
      <Sheet />
      <Panel declares={{ surface: null }} title={titleHere('session', 'waitingOnALimit')}>
        <p className="sw-state">{going ? t('w13s.wait.waitingWord') : t('w13s.wait.notGoingWord')}</p>
        <dl className="sw-facts">
          <Fact label={t('w13s.limit.said')}>{theWords(mark['said'])}</Fact>
          <Fact label={t('w13s.limit.seen')}>{theMoment(mark['seenAt']) ?? <span className="sw-none">{t('w13s.limit.noWhen')}</span>}</Fact>
          <Fact label={t('w13s.limit.resets')}>{theReset(mark['resetsAt'], mark['resetFrom'])}</Fact>
          {typeof attempt === 'number' ? <Fact label={t('w13s.limit.attempt')}>{String(attempt)}</Fact> : null}
          {typeof provider === 'string' && provider !== '' ? <Fact label={t('w13s.limit.whose')}>{provider}</Fact> : null}
        </dl>
      </Panel>
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sw-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** The state word for one stop cause. A kind the office has no words for is named as stored rather than guessed at. */
function theStopInWords(kind: unknown): string {
  if (kind === 'session-limit') return t('w13s.stop.sessionLimitWord')
  if (kind === 'quota') return t('w13s.stop.quotaWord')
  if (kind === 'login') return t('w13s.stop.loginWord')
  return t('w13s.stop.otherWord', { kind: String(kind) })
}

/** What the limit said, quoted, or the words saying nobody recorded it. */
function theWords(said: unknown): ReactNode {
  if (typeof said !== 'string' || said.trim() === '') return <span className="sw-none">{t('w13s.limit.noWords')}</span>
  return t('w13s.limit.quoted', { said: said.trim() })
}

/** A stored time in the reader's local time, the words as written when they are not a time, or null when there are none. */
function theMoment(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const at = parseAnyStamp(value)
  return at === null ? value.trim() : drawnStamp(localStamp(at))
}

/** The reset, followed by where it came from when the run says. */
function theReset(resetsAt: unknown, resetFrom: unknown): ReactNode {
  const when = theMoment(resetsAt)
  if (when === null) return <span className="sw-none">{t('w13s.limit.noReset')}</span>
  if (typeof resetFrom !== 'string' || resetFrom.trim() === '') return when
  return (
    <>
      {when}
      <span className="sw-from">{t('w13s.limit.from', { from: resetFrom.trim() })}</span>
    </>
  )
}
