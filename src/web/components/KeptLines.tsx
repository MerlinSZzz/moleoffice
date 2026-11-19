// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINES THE PERSON TYPED IN A TERMINAL, ON THE NOTE THAT KEEPS THEM. Wave 13u, round 4; decision YLv8grhgilBV, points
 * 2 and 4. One line per line of `body`, each with a press that deletes it, and how many lines were left out, by why.
 * Deleting a line writes `body` without it; deleting the whole note is the record's own delete. A delete is written on
 * the version the page draws, and asks first when another writer changed the note since (src/web/components/AnotherWriter.tsx).
 */

import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import { theLeftOutCountsOf } from '@shared/terminals.ts'
import type { PanelRecord } from '@shared/types.ts'
import { useWriteThisRecord } from './AnotherWriter.tsx'
import { Btn } from './ui.tsx'
import { errorMessage } from '../api.ts'

export function KeptLines({ record, editable, onChanged }: { record: PanelRecord; editable: boolean; onChanged: () => void }): React.ReactElement {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const body = typeof record.data['body'] === 'string' ? record.data['body'] : ''
  const lines = body === '' ? [] : body.split('\n')
  const leftOut = theLeftOutCountsOf(record.data)
  const left = leftOut.notShown + leftOut.edited + leftOut.tooLong + leftOut.before + leftOut.typedByAnother
  const write = useWriteThisRecord(record.id, 'drawn')
  const remove = async (at: number): Promise<void> => {
    setBusy(at)
    setError(null)
    try {
      // THE BODY IS WRITTEN WHOLE, so on a newer version it is written again from that version's lines: the same line
      // is taken out, found by its words and by how many lines with the same words come before it.
      const gone = lines[at]
      const before = lines.slice(0, at).filter((line) => line === gone).length
      const without = (data: Record<string, unknown>) => {
        const all = typeof data['body'] === 'string' && data['body'] !== '' ? data['body'].split('\n') : []
        const same = all.flatMap((line, i) => (line === gone ? [i] : []))
        const rest = all.filter((_, i) => i !== same[before])
        return { dataPatch: { body: rest.length === 0 ? null : rest.join('\n') } }
      }
      const written = await write(without(record.data), (theirs) => without(theirs.data))
      if (!('notNow' in written)) onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="kl">
      <style href="mole-office-kept-lines" precedence="default">
        {KEPT_LINES_CSS}
      </style>
      <p className="kl-heading">{t('terminals.keeping.lines')}</p>
      {lines.length === 0 ? (
        <p className="kl-says">{t('terminals.keeping.noLines')}</p>
      ) : (
        <ol className="kl-lines">
          {lines.map((line, i) => (
            <li key={`${i}:${line}`} className="kl-line">
              <span className="kl-text">{line}</span>
              {editable ? (
                <Btn size="sm" onClick={() => void remove(i)} pending={busy === i} disabled={busy !== null && busy !== i} reason={t('terminals.keeping.deleting')}>
                  {t('terminals.keeping.deleteLine')}
                </Btn>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <p className="kl-says">
        {t('terminals.keeping.counts', { kept: lines.length, left })}
        {left - leftOut.typedByAnother === 0 ? null : <> {t('terminals.keeping.why', { ...leftOut })}</>}
        {leftOut.before === 0 ? null : <> {t('terminals.keeping.keyLikeBefore', { n: leftOut.before })}</>}
        {leftOut.typedByAnother === 0 ? null : <> {t('terminals.keeping.typedByAnother', { n: leftOut.typedByAnother })}</>}
      </p>
      {error === null ? null : (
        <p className="kl-says" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const KEPT_LINES_CSS = `
.kl { display: grid; gap: 0.4rem; min-width: 0; }
.kl-heading { margin: 0; font-weight: 600; color: var(--text); }
.kl-lines { margin: 0; padding: 0 0 0 1.6rem; display: grid; gap: 0.3rem; }
.kl-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.6rem; min-width: 0; }
.kl-text { font-family: var(--font-mono); color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.kl-says { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
`
