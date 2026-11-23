// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A DECISION IN THE PERSON'S NAME STANDS ON THE PERSON'S OWN WORDS, AND THE DOOR THAT FILES WORDS SAID
 * ELSEWHERE AS THEIR OWN. A decision, option C on problem bXW3UpEsrsoZ.
 *
 * `TheMarkOnADecision` is drawn on a decision's own page when the server marks it: written in the person's name by
 * somebody other than the person, citing a record that is not the person's own. `TheDecisionsNotOnTheirWords` lists the
 * marked ones on the Decisions page. Both say the mark with `sayTheMark` (src/shared/the-persons-own-words.ts), so the
 * two pages cannot word one decision two ways.
 *
 * `FileAsMyWords` is drawn on a note a secretary prepared for the person to file. The person's press files the words
 * as a note of their own; anybody else is offered no press. The server is what refuses an agent's press that the
 * person's grant does not carry; this page only does not offer it to an agent. The words are not quoted here: the
 * note's own body is drawn right below (the picture review of round 11).
 *
 * THE PAGE ADDRESSES ITS READER, as "What you decided" does: the person reads "you", and an agent reading the door reads
 * "the person".
 */
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import { sayTheMark, sayTheMarkHeading, sayWhatYouCanDo, type NotOnThePersonsOwnWords } from '@shared/the-persons-own-words.ts'
import { faultOf, api, errorMessage, getActor } from '../api.ts'
import { Btn, ErrorNote, Panel } from './ui.tsx'
import { recordPath, RouteLink } from './router.tsx'

const THEIR_OWN_WORDS_CSS = `
.tow-mark { margin: 0; line-height: var(--lh-body); overflow-wrap: anywhere; }
.tow-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.tow-list li { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tow-list li > span { font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.tow-line { margin: 0; font-size: var(--fs-2); color: var(--text-2); line-height: var(--lh-body); }
.tow-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); }
`

function Style() {
  return (
    <style href="mole-office-their-own-words" precedence="default">
      {THEIR_OWN_WORDS_CSS}
    </style>
  )
}

/** The mark on one decision, on its own page. */
export function TheMarkOnADecision({ mark }: { mark: NotOnThePersonsOwnWords }) {
  return (
    <Panel titleIs="label" declares={{ surface: null }} title={sayTheMarkHeading()} rank={0} tone="inferred">
      <Style />
      <p className="tow-mark" data-part="not-on-their-own-words">
        {sayTheMark(mark)}
      </p>
      <p className="tow-line">{sayWhatYouCanDo('page')}</p>
    </Panel>
  )
}

/** One decision the Decisions page lists as marked. */
export interface AMarkedDecision {
  recordId: string
  title: string
  mark: NotOnThePersonsOwnWords
}

/** The Decisions page's list of the decisions in the person's name that do not stand on the person's own words. */
export function TheDecisionsNotOnTheirWords({ rows }: { rows: readonly AMarkedDecision[] }) {
  if (rows.length === 0) return null
  return (
    <Panel titleIs="label" declares={{ surface: null }} title={sayTheMarkHeading()} rank={0} tone="inferred">
      <Style />
      <p className="tow-line">{t('ownWords.band.count', { n: rows.length })}</p>
      <p className="tow-line">{sayWhatYouCanDo('list')}</p>
      <ul className="tow-list" data-part="decisions-not-on-their-own-words">
        {rows.map((row) => (
          <li key={row.recordId}>
            <RouteLink to={recordPath(row.recordId)}>{row.title}</RouteLink>
            <span>{sayTheMark(row.mark)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** The press that files a prepared note's words as the person's own note, on the prepared note's page. */
export function FileAsMyWords({
  recordId,
  filed,
  onFiled,
}: {
  recordId: string
  filed: { id: string; title: string } | null
  onFiled: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const thePerson = getActor().type === 'human'

  const press = () => {
    if (busy) return
    setBusy(true)
    setFailed(null)
    api.fileAsMyWords(recordId).then(
      () => {
        setBusy(false)
        onFiled()
      },
      (err: unknown) => {
        setBusy(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <Panel
      titleIs="label"
      declares={{ surface: null }}
      title={t(thePerson ? 'ownWords.door.heading' : 'ownWords.door.headingForOthers')}
      rank={0}
      tone={filed === null ? 'ask' : 'done'}
    >
      <Style />
      {filed !== null ? (
        <p className="tow-line" data-part="filed-as-their-own-words">
          {t(thePerson ? 'ownWords.door.filed' : 'ownWords.door.filedForOthers')} <RouteLink to={recordPath(filed.id)}>{filed.title}</RouteLink>
        </p>
      ) : (
        <>
          {thePerson ? (
            <div className="tow-acts">
              <Btn variant="primary" pending={busy} onClick={press}>
                {t('ownWords.door.press')}
              </Btn>
            </div>
          ) : null}
          {failed === null ? null : <ErrorNote label={t('ownWords.door.notFiled')} message={failed.message} fault={failed.fault} />}
        </>
      )}
    </Panel>
  )
}
