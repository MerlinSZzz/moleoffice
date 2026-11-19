// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTERRUPTED RUNS, AND ONE PRESS TO RESUME EACH. Criterion W7 (piece H7 of plan hp7Z-IW9JWSX).
 *
 * Every run Mole Office started for a message that stopped before it answered: paused by a shutdown,
 * or ended mid-turn. Each says which agent, which message, when it stopped and why. A run that can be
 * resumed has one button. A run that cannot has no button, only its reason, because a button whose
 * press can only be refused is a dead end.
 *
 * The press is the person's alone; the server refuses anybody else and its sentence is drawn here.
 * src/server/lib/interrupted.ts works out which runs are listed and why one cannot resume, so this
 * page decides nothing about that and only draws what it was sent.
 */

import { t } from '@shared/i18n.ts'
import type { AnInterruptedRun } from '@shared/interrupted.ts'
import { useState } from 'react'
import { faultOf, api, errorMessage } from '../api.ts'
import { recordPath } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'

export function InterruptedRunsPage() {
  useLanguage()
  const [state, reload] = useProjectAsync(() => api.interruptedRuns().then((r) => r.runs), [])
  return (
    <div className="page ir">
      <style href="mole-office-interrupted" precedence="default">
        {INTERRUPTED_CSS}
      </style>
      <header className="ir-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="ir-title" data-title-is="its-label">{t('w13t.nav.interrupted')}</h1>
        <p className="ir-intro">{t('w13t.interrupted.intro')}</p>
      </header>
      {state.status === 'loading' ? <Loading label={t('w13t.interrupted.loading')} rows={2} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {state.status === 'ready' ? <TheInterruptedRuns runs={state.value} onAsked={reload} /> : null}
    </div>
  )
}

/** The list, drawn from what was fetched. Exported so a test can render it with no server. */
export function TheInterruptedRuns({ runs, onAsked }: { runs: readonly AnInterruptedRun[]; onAsked?: () => void }) {
  if (runs.length === 0) return <Absence looked tier="told-apart" title={t('w13t.nav.interrupted')} word={t('w13t.interrupted.none')} />
  return (
    <div className="ir-list">
      {runs.map((run) => (
        <OneRun key={run.session} run={run} {...(onAsked === undefined ? {} : { onAsked })} />
      ))}
    </div>
  )
}

function OneRun({ run, onAsked }: { run: AnInterruptedRun; onAsked?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const press = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .resumeARun(run.session)
      .then(() => {
        setBusy(false)
        onAsked?.()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  return (
    <Panel
      declares={{ surface: 'interrupted.run' }}
      title={run.agent?.handle ?? t('w13t.interrupted.because.agent-gone')}
      kind={t(`w13t.interrupted.how.${run.how}`)}
    >
      <div className="ir-run" data-run={run.session} data-can-resume={run.resume.can ? 'yes' : 'no'}>
        <dl className="ir-facts">
          <dt>{t('w13t.interrupted.message')}</dt>
          <dd>
            {run.message === null ? (
              t('w13t.interrupted.because.message-gone')
            ) : (
              <a href={`#${recordPath(run.message.id)}`}>{run.message.title === '' ? t('w13t.interrupted.untitled') : run.message.title}</a>
            )}
          </dd>
          <dt>{t('w13t.interrupted.stopped')}</dt>
          <dd>
            {run.stoppedAt === null ? t('w13t.interrupted.stoppedUnknown') : <Stamp at={run.stoppedAt} />}
          </dd>
          <dt>{t('w13t.interrupted.why')}</dt>
          <dd>{run.why ?? t('w13t.interrupted.whyUnknown')}</dd>
          <dt>{t('w13t.interrupted.tool')}</dt>
          <dd>
            {run.runtime ?? t('w13t.interrupted.toolUnknown')}
            <span className="ir-measured">{t(`w13t.interrupted.measured.${run.measured}`)}</span>
          </dd>
        </dl>
        {run.failed === null ? null : <p className="ir-failed">{t('w13t.interrupted.failed', { why: run.failed })}</p>}
        {!run.resume.can ? (
          // NO BUTTON, ONLY THE REASON. The server would refuse the press, so none is offered.
          <p className="ir-cannot" data-because={run.resume.because}>
            {/* Its own line, so no space is typed between the two sentences: Chinese takes none. */}
            <strong>{t('w13t.interrupted.cannot')}</strong>
            {t(`w13t.interrupted.because.${run.resume.because}`)}
          </p>
        ) : run.asked !== null ? (
          <p className="ir-asked" role="status">
            {t('w13t.interrupted.asked')} <Stamp at={run.asked.at} />
          </p>
        ) : (
          <div className="ir-press">
            {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
            <Btn variant="primary" onClick={press} pending={busy} disabled={busy} reason={busy ? t('w13t.interrupted.pressing') : undefined}>
              {t('w13t.interrupted.resume')}
            </Btn>
          </div>
        )}
      </div>
    </Panel>
  )
}

export const INTERRUPTED_CSS = `
.ir { min-width: 0; }
.ir-head { display: grid; gap: var(--pad); min-width: 0; margin: 0 0 var(--gut); }
.ir-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.ir-intro { margin: 0; max-width: 70ch; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.ir-list { display: grid; gap: var(--gut); min-width: 0; }
.ir-run { display: grid; gap: var(--pad); min-width: 0; }
.ir-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px var(--gut); margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.ir-facts dt { color: var(--text-3); }
.ir-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.ir-measured { display: block; color: var(--text-3); font-size: var(--fs-1); }
.ir-cannot, .ir-asked, .ir-failed { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.ir-cannot strong { display: block; color: var(--text); }
.ir-press { display: grid; justify-items: start; gap: var(--pad); }
@media (max-width: 480px) {
  .ir-facts { grid-template-columns: minmax(0, 1fr); }
  .ir-facts dt { margin-top: 4px; }
}
`
