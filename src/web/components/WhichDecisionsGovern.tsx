// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH DECISIONS GOVERN A PLACE, ON THE DECISIONS PAGE.
 *
 * A reader writes a path, or the id of a module, flow or pipeline, and the page asks GET /api/decisions/governing.
 * The answer is drawn as the server gives it: newest first, each decision with how its `governs` reaches the place,
 * and a replaced one marked with what replaced it. Nothing is worked out here.
 *
 * THE FORM OPENS ON A PRESS. The Decisions page is read, and a page being read draws no box or dropdown until somebody
 * presses for one, so the form sits in a fold that is shut on arrival.
 *
 * NO MATCH IS NOT "NOTHING GOVERNS THIS". The count of decisions that say nothing in `governs` is drawn under every
 * answer, because those were not asked, and a module list that could not be read is said, not left out.
 */
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { WhichDecisionsGovern } from '../../server/lib/governs.ts'
import { api } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { recordPath, RouteLink } from './router.tsx'
import { Absence, Btn, ErrorNote, Field, Panel, Select, TextInput } from './ui.tsx'

type AskedBy = 'path' | 'record'

type Answer =
  | { status: 'none' }
  | { status: 'asking' }
  | { status: 'ready'; value: WhichDecisionsGovern }
  | { status: 'error'; message: string }

export function WhichDecisionsGovernAPlace() {
  const inspect = useInspect()
  const [by, setBy] = useState<AskedBy>('path')
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState<Answer>({ status: 'none' })

  async function ask(): Promise<void> {
    const place = text.trim()
    setAnswer({ status: 'asking' })
    try {
      setAnswer({ status: 'ready', value: await api.decisionsGoverning(by === 'path' ? { path: place } : { record: place }) })
    } catch (err) {
      setAnswer({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'decisions.governing' }} title={t('decisions.governing.title')} rank={1}>
      <details className="dg-fold">
        <summary className="dg-open">{t('decisions.governing.open')}</summary>
        <form
          className="dg-ask"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim() !== '') void ask()
          }}
        >
          <Field label={t('decisions.governing.by')}>
            <Select<AskedBy>
              value={by}
              onChange={setBy}
              options={[
                { value: 'path', label: t('decisions.governing.by.path') },
                { value: 'record', label: t('decisions.governing.by.record') },
              ]}
            />
          </Field>
          <Field label={t('decisions.governing.box')}>
            <TextInput value={text} onChange={setText} mono />
          </Field>
          <Btn
            type="submit"
            variant="primary"
            disabled={text.trim() === '' || answer.status === 'asking'}
            reason={t('decisions.governing.askWhy')}
            pending={answer.status === 'asking'}
          >
            {t('decisions.governing.ask')}
          </Btn>
        </form>
      </details>
      {answer.status === 'error' ? <ErrorNote message={answer.message} retry={() => void ask()} /> : null}
      {answer.status === 'ready' ? <TheAnswer answer={answer.value} inspect={inspect} /> : null}
      <style href="mole-office-which-decisions-govern" precedence="default">
        {CSS}
      </style>
    </Panel>
  )
}

function TheAnswer({ answer, inspect }: { answer: WhichDecisionsGovern; inspect: boolean }) {
  return (
    <div className="dg-answer" data-found={String(answer.decisions.length)}>
      {answer.decisions.length === 0 ? (
        <Absence say title={t('decisions.governing.none')} />
      ) : (
        <ol className="dg-list">
          {answer.decisions.map((one) => (
            <li key={one.id} className="dg-row" data-replaced={one.replacedBy === null ? undefined : 'yes'}>
              <RouteLink to={recordPath(one.id)}>{one.title}</RouteLink>
              {one.replacedBy === null ? null : (
                <span className="dg-replaced">
                  {t('decisions.governing.replacedBy')} <RouteLink to={recordPath(one.replacedBy.id)}>{one.replacedBy.title}</RouteLink>
                </span>
              )}
              <ul className="dg-how">
                {one.how.map((how, i) => (
                  <li key={i}>
                    {how.reaches === 'claims-it'
                      ? t('decisions.governing.reaches.claims-it', { module: how.module.title })
                      : t(REACHES_WORDS[how.reaches], { place: 'path' in how.place ? how.place.path : how.place.record })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="dg-note">{t('decisions.governing.notPlaced', { n: answer.notPlaced.count, of: answer.notPlaced.of })}</p>
      {answer.couldNotRead.length === 0 ? null : (
        <p className="dg-note dg-unread">
          {t('decisions.governing.modulesUnread')}
          {inspect ? <span className="dg-detail"> {answer.couldNotRead.join(' ')}</span> : null}
        </p>
      )}
    </div>
  )
}

/** How an entry reaches the place, in words: one word each, named in full so every word is read where it is used. */
const REACHES_WORDS = {
  'names-it': 'decisions.governing.reaches.names-it',
  'covers-it': 'decisions.governing.reaches.covers-it',
  'inside-it': 'decisions.governing.reaches.inside-it',
} as const

const CSS = `
.dg-open { cursor: pointer; color: var(--text-2); }
.dg-ask { margin-top: var(--gut); display: flex; flex-wrap: wrap; gap: var(--gut); align-items: end; }
.dg-ask > * { min-width: 0; }
.dg-ask .px-field:nth-child(2) { flex: 1 1 16rem; }
.dg-answer { margin-top: var(--pad); }
.dg-list { margin: 0; padding-left: 1.4em; display: grid; gap: var(--gut); }
.dg-row { overflow-wrap: anywhere; }
.dg-replaced { display: block; color: var(--text-2); }
.dg-how { margin: 2px 0 0; padding-left: 1.2em; color: var(--text-2); }
.dg-note { color: var(--text-2); margin: var(--gut) 0 0; }
`
