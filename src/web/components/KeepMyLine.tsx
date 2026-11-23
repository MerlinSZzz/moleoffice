// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * KEEP WHAT I LAST TYPED AS MY OWN WORDS. Wave 13u, round 3, on a decision.
 *
 * What the person types into the office's own terminal passed the person-only typing door, so a line of it may be kept
 * as a note of theirs, which counts as their own words with no further press, as what they write in chat does. This press is
 * how they mark the line worth keeping. It first shows the line (only a line the screen showed: src/server/api/terminals.ts),
 * so they keep exactly what they read, and the keep press names that text. A line that looks like a key is shown with a
 * sentence saying so, and can be kept like any other (round 12), as two of the owner's decisions
 * say. Once kept, the note's address is shown, so they can open it.
 */

import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { TheLastLine } from '@shared/terminals.ts'
import { Btn } from './ui.tsx'
import { recordPath, RouteLink } from './router.tsx'
import { keepMyLine, theLastLine, whatARefusalSays } from '../lib/terminals.ts'

type Step =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'offered'; reading: TheLastLine }
  | { kind: 'kept'; text: string; id: string }
  | { kind: 'refused'; sentence: string }

export function KeepMyLine({ terminal }: { terminal: string }): React.ReactElement {
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const read = (): void => {
    setStep({ kind: 'reading' })
    theLastLine(terminal).then(
      (reading) => setStep({ kind: 'offered', reading }),
      (err: unknown) => setStep({ kind: 'refused', sentence: whatARefusalSays(err) }),
    )
  }
  const keep = (text: string): void => {
    keepMyLine(terminal, text).then(
      (kept) => setStep({ kind: 'kept', text, id: kept.record.id }),
      (err: unknown) => setStep({ kind: 'refused', sentence: whatARefusalSays(err) }),
    )
  }
  return (
    <div className="tm-keep">
      <style href="mole-office-keep-my-line" precedence="default">
        {KEEP_MY_LINE_CSS}
      </style>
      {step.kind === 'idle' || step.kind === 'reading' || step.kind === 'kept' || step.kind === 'refused' ? (
        <Btn size="sm" onClick={read} pending={step.kind === 'reading'}>
          {t('terminals.keep.read')}
        </Btn>
      ) : null}
      {step.kind === 'offered' ? <TheOffer reading={step.reading} onKeep={keep} onLeave={() => setStep({ kind: 'idle' })} /> : null}
      {step.kind === 'kept' ? (
        <p className="tm-keep-says" role="status">
          {t('terminals.keep.kept')} <span className="tm-mono">{step.text}</span>{' '}
          <RouteLink to={recordPath(step.id, 'note')}>{t('terminals.keep.open')}</RouteLink>
        </p>
      ) : null}
      {step.kind === 'refused' ? (
        <p className="tm-keep-says" role="status">
          {step.sentence}
        </p>
      ) : null}
    </div>
  )
}

function TheOffer({ reading, onKeep, onLeave }: { reading: TheLastLine; onKeep: (text: string) => void; onLeave: () => void }): React.ReactElement {
  if (reading.line === null) {
    const why = reading.why === 'not-shown' ? t('terminals.keep.notShownWord') : reading.why === 'too-long' ? t('terminals.keep.tooLongWord') : t('terminals.keep.none')
    return (
      <p className="tm-keep-says" role="status">
        {why}{' '}
        <Btn size="sm" onClick={onLeave}>
          {t('terminals.keep.cancel')}
        </Btn>
      </p>
    )
  }
  const text = reading.line.text
  return (
    <div className="tm-keep-offer">
      <p className="tm-keep-heading">{t('terminals.keep.heading')}</p>
      <p className="tm-keep-line tm-mono">{text}</p>
      {reading.looksLikeAKey ? <p className="tm-keep-key">{t('terminals.keep.looksLikeAKey')}</p> : null}
      <div className="tm-keep-presses">
        <Btn size="sm" variant="primary" onClick={() => onKeep(text)}>
          {t('terminals.keep.press')}
        </Btn>
        <Btn size="sm" onClick={onLeave}>
          {t('terminals.keep.cancel')}
        </Btn>
      </div>
    </div>
  )
}

const KEEP_MY_LINE_CSS = `
.tm-keep { margin: 0.5rem 0 0 0; display: grid; gap: 0.4rem; justify-items: start; }
.tm-keep-says { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.tm-keep-offer {
  border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel-2);
  padding: 0.6rem var(--pad); display: grid; gap: 0.4rem; max-width: 100%; min-width: 0;
}
.tm-keep-heading { margin: 0; font-weight: 600; color: var(--text); }
.tm-keep-line { margin: 0; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
.tm-keep-key { margin: 0; font-size: 0.9em; color: var(--text); border-left: 3px solid var(--warn, var(--text-2)); padding-left: 0.5rem; }
.tm-keep-presses { display: flex; flex-wrap: wrap; gap: 0.5rem; }
`
