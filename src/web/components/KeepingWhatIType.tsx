// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * KEEPING WHAT THEY TYPE, WITH NO PRESS. Wave 13u, round 4; decision YLv8grhgilBV, under one of the owner's
 * decisions.
 *
 * Under each terminal: a switch, on when the terminal opens, and a line that says whether keeping is on and what it
 * leaves out. While it is on, the note the lines go in is named with how many lines it holds and how many were left
 * out, by why. While it is off, round 3's press to keep one line is shown instead (point 5). The note grows as they
 * type, so the reading is asked for again every few seconds while the view is open.
 *
 * ONE SENTENCE IN NORMAL MODE (round 11), as a message says. Normal mode shows the switch, one
 * sentence and the note's link. Developer mode shows the whole block: what keeping leaves out, the note's counts and
 * why lines were left out. The switch, the reading and round 3's press are the same in both modes.
 *
 * A KEPT LINE THAT LOOKS LIKE A KEY IS SAID, AND NOTHING IS BLOCKED (round 12). A key a user chooses to give an agent
 * is warned about, then kept and carried out as normal. While the note holds such a line, one
 * sentence says so, in both modes; typing goes on and the line stays kept until the person deletes it.
 */

import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { TheKeeping } from '@shared/terminals.ts'
import { useMode } from '../lib/mode.ts'
import { KeepMyLine } from './KeepMyLine.tsx'
import { recordPath, RouteLink } from './router.tsx'
import { setTheKeeping, theKeeping, whatARefusalSays } from '../lib/terminals.ts'

/** How often the reading is asked for again, so the counts follow their typing. */
const READ_AGAIN_MS = 3_000

type Reading = { kind: 'reading' } | { kind: 'read'; keeping: TheKeeping } | { kind: 'failed'; sentence: string }

export function KeepingWhatIType({ terminal }: { terminal: string }): React.ReactElement {
  const [reading, setReading] = useState<Reading>({ kind: 'reading' })
  const [pressing, setPressing] = useState(false)
  const whole = useMode() === 'inspect'
  useEffect(() => {
    let stopped = false
    const read = (): void => {
      theKeeping(terminal).then(
        (keeping) => {
          if (!stopped) setReading({ kind: 'read', keeping })
        },
        (err: unknown) => {
          if (!stopped) setReading({ kind: 'failed', sentence: whatARefusalSays(err) })
        },
      )
    }
    read()
    const every = setInterval(read, READ_AGAIN_MS)
    return () => {
      stopped = true
      clearInterval(every)
    }
  }, [terminal])
  const turn = (on: boolean): void => {
    setPressing(true)
    setTheKeeping(terminal, on).then(
      (keeping) => {
        setPressing(false)
        setReading({ kind: 'read', keeping })
      },
      (err: unknown) => {
        setPressing(false)
        setReading({ kind: 'failed', sentence: whatARefusalSays(err) })
      },
    )
  }
  return (
    <div className="tm-keeping">
      <style href="mole-office-keeping-what-i-type" precedence="default">
        {KEEPING_CSS}
      </style>
      {reading.kind === 'failed' ? (
        <p className="tm-keeping-says" role="status">
          {t('terminals.keeping.unknown')} <span className="tm-mono">{reading.sentence}</span>
        </p>
      ) : null}
      {reading.kind === 'read' ? (
        <>
          <label className="tm-keeping-switch" data-keeping={reading.keeping.on ? 'on' : 'off'}>
            <input type="checkbox" role="switch" checked={reading.keeping.on} disabled={pressing} onChange={(e) => turn(e.target.checked)} />
            <span>{t('terminals.keeping.switch')}</span>
          </label>
          {whole ? (
            <TheNote keeping={reading.keeping} />
          ) : reading.keeping.note === null ? null : (
            <p className="tm-keeping-says tm-keeping-open">
              <RouteLink to={recordPath(reading.keeping.note.id, 'note')}>{t('terminals.keeping.open')}</RouteLink>
            </p>
          )}
          {reading.keeping.note !== null && reading.keeping.note.keyLike > 0 ? (
            <p className="tm-keeping-says tm-keeping-key" data-key-like={reading.keeping.note.keyLike}>
              {t('terminals.keeping.looksLikeAKey', { n: reading.keeping.note.keyLike })}
            </p>
          ) : null}
          {reading.keeping.on ? null : <KeepMyLine terminal={terminal} />}
        </>
      ) : null}
    </div>
  )
}

function TheNote({ keeping }: { keeping: TheKeeping }): React.ReactElement {
  const note = keeping.note
  if (note === null) return <p className="tm-keeping-says">{t('terminals.keeping.noNote')}</p>
  const left = note.leftOut.notShown + note.leftOut.edited + note.leftOut.tooLong + note.leftOut.before + note.leftOut.typedByAnother
  return (
    <p className="tm-keeping-says">
      <RouteLink to={recordPath(note.id, 'note')}>{t('terminals.keeping.open')}</RouteLink>{' '}
      {t('terminals.keeping.counts', { kept: note.lines, left })}
      {left - note.leftOut.typedByAnother === 0 ? null : <> {t('terminals.keeping.why', { ...note.leftOut })}</>}
      {note.leftOut.before === 0 ? null : <> {t('terminals.keeping.keyLikeBefore', { n: note.leftOut.before })}</>}
      {note.leftOut.typedByAnother === 0 ? null : <> {t('terminals.keeping.typedByAnother', { n: note.leftOut.typedByAnother })}</>}
    </p>
  )
}

const KEEPING_CSS = `
.tm-keeping { margin: 0.5rem 0 0 0; display: grid; gap: 0.35rem; justify-items: start; min-width: 0; }
.tm-keeping-switch { display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 600; color: var(--text); cursor: pointer; }
.tm-keeping-says { margin: 0; color: var(--text-2); overflow-wrap: anywhere; max-width: 70ch; }
.tm-keeping-key { color: var(--text); border-left: 3px solid var(--warn, var(--text-2)); padding-left: 0.5rem; }
`
