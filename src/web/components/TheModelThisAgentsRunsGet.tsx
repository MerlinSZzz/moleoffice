// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * THE MODEL THIS AGENT'S RUNS GET, ON ITS PROFILE. Criterion U2.
 *
 * One row in the profile's "What is known" list, straight after the runtime. It shows the agent's
 * own model, kept on its record beside the runtime and for that runtime, or says none is set and
 * what its runs get instead, with the layer each came from. The server writes every sentence
 * (`anAgentsRunModel` in src/server/lib/run-models.ts); this file only draws them.
 *
 * THE PRESS IS THE PERSON'S. It is drawn when the reader is a person, as the inject switch beside
 * it is, and the server refuses any agent with a 403 whose words are drawn where the press was.
 *
 * THE BOX OPENS ON A PRESS. A profile is a page being read, and a page being read draws no box until
 * a press asks for one (tests/read-before-edit.test.ts). So "Change" opens the box, and "Clear" is
 * a press on its own.
 */

import { useState } from 'react'

import type { AnAgentsRunModel, TheModelARunGets } from '@shared/run-models.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { ErrorNote } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { api, errorMessage } from '../api.ts'

export function TheModelThisAgentsRunsGet({ agent, mayPress }: { agent: string; mayPress: boolean }) {
  useLanguage()
  const [state, readAgain] = useProjectAsync(() => api.agentRunModel(agent), [agent])
  if (state.status !== 'ready') {
    return (
      <div className="prof-fact">
        <dt className="prof-label">{t('g6b.runs.model')}</dt>
        <dd className="prof-value">
          {state.status === 'loading' ? <span role="status">{t('g6b.loading')}</span> : <ErrorNote message={state.message} fault={state.fault} />}
        </dd>
      </div>
    )
  }
  return <TheModel key={`${state.value.model ?? ''}:${state.value.variant ?? ''}`} said={state.value} agent={agent} mayPress={mayPress} onChanged={readAgain} />
}

/**
 * WHAT A RUN GETS, AS THE LINE'S LABEL. With no model the label says so in its own sentence
 * (wave 13k round 37): "工作运行使用未设模型" read as if 未设模型 were the name of a model.
 */
function builderLabel(answered: TheModelARunGets): string {
  return answered.model === null ? t('g6b.model.builderNone') : t('g6b.model.builder', { model: content(answered.model) })
}

function conversationLabel(answered: TheModelARunGets): string {
  return answered.model === null ? t('g6b.model.conversationNone') : t('g6b.model.conversation', { model: content(answered.model) })
}

/** The model this profile sets, with its runtime and reasoning effort only where each is recorded. */
function modelSaid(said: AnAgentsRunModel): string {
  const onIt = said.runtime === null
    ? content(said.model ?? '')
    : t('g6b.model.onRuntime', { model: content(said.model ?? ''), runtime: content(said.runtime) })
  return said.variant === null ? onIt : t('g6b.model.withEffort', { what: onIt, effort: content(said.variant) })
}

function TheModel({ said, agent, mayPress, onChanged }: { said: AnAgentsRunModel; agent: string; mayPress: boolean; onChanged: () => void }) {
  const [model, setModel] = useState(said.model ?? '')
  const [variant, setVariant] = useState(said.variant ?? '')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const takesAVariant = said.runtime !== null && (said.theWorkerGives.aVariantTo as readonly string[]).includes(said.runtime)

  const write = (next: string | null): void => {
    if (next !== null && next.trim() === '') {
      setFault(t('g6b.model.needsModel'))
      return
    }
    setBusy(true)
    setFault(null)
    api
      .setAgentRunModel(agent, next, next === null || !takesAVariant || variant.trim() === '' ? null : variant)
      .then(() => {
        onChanged()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="prof-fact tmr" data-agent-model={said.model ?? ''}>
      <style href="mole-office-agent-model" precedence="default">
        {AGENT_MODEL_CSS}
      </style>
      <dt className="prof-label">{t('g6b.runs.model')}</dt>
      <dd className="prof-value tmr-value" data-empty={said.model === null ? 'yes' : 'no'}>
        <span>
          {said.model === null
            ? t('g6b.model.none')
            : t('g6b.model.here', { what: modelSaid(said) })}
        </span>
        {/* IN THE PAGE'S LANGUAGE (wave 13k round 35): each sentence is the server's codes, drawn by the words, and
            the label and the sentence are one word, so a Chinese page joins them with its own colon. */}
        <span className="prof-says-inline">
          {t('g6b.model.line', { label: builderLabel(said.builder), says: saidOnThePage(said.builder.said, said.builder.says) })}
        </span>
        <span className="prof-says-inline">
          {t('g6b.model.line', { label: conversationLabel(said.conversation), says: saidOnThePage(said.conversation.said, said.conversation.says) })}
        </span>
        {!mayPress ? null : !editing ? (
          <span className="tmr-control">
            <button
              type="button"
              className="tmr-press"
              disabled={busy}
              onClick={() => {
                setEditing(true)
              }}
            >
              {t('g6b.model.change')}
            </button>
            <button
              type="button"
              className="tmr-press"
              disabled={busy || said.model === null}
              onClick={() => {
                write(null)
              }}
            >
              {t('g6b.model.clear')}
            </button>
          </span>
        ) : (
          <span className="tmr-control">
            <input
              className="tmr-input"
              type="text"
              aria-label={t('g6b.model.modelLabel')}
              autoComplete="off"
              spellCheck={false}
              value={model}
              disabled={busy}
              onChange={(event) => {
                setModel(event.target.value)
              }}
            />
            {takesAVariant ? (
              <input
                className="tmr-input tmr-short"
                type="text"
                aria-label={t('g6b.model.effortLabel')}
                autoComplete="off"
                spellCheck={false}
                value={variant}
                disabled={busy}
                onChange={(event) => {
                  setVariant(event.target.value)
                }}
              />
            ) : null}
            <button
              type="button"
              className="tmr-press"
              disabled={busy}
              onClick={() => {
                write(model)
              }}
            >
              {t('g6b.model.set')}
            </button>
            <button
              type="button"
              className="tmr-press"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setFault(null)
              }}
            >
              {t('g6b.model.cancel')}
            </button>
          </span>
        )}
        {fault === null ? null : <span className="tmr-refuse">{fault}</span>}
      </dd>
    </div>
  )
}

/** Its own few rules. Every value is a token, so a preset swap re-skins it with everything else. */
const AGENT_MODEL_CSS = `
.tmr-value { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.tmr-control { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-top: 4px; min-width: 0; }
.tmr-input {
  width: 14rem; max-width: 100%; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.tmr-short { width: 7rem; }
.tmr-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.tmr-press {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.tmr-press:hover:not(:disabled) { background: var(--hover); }
.tmr-press:disabled { color: var(--text-3); cursor: default; }
.tmr-refuse {
  max-width: 60ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
`
