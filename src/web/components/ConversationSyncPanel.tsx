// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC'S PANEL, ON THE RUNS PAGE.
 *
 * The sync itself is proved in tests/the-conversation-sync.test.ts: a run's conversation file is read, scrubbed and
 * stored on that run's session record, the person turns the sync on and runs it, and another machine can install a
 * copy. This panel is the half the owner reads. It says whether the sync is on, lists every copy with the tool's small
 * word beside it, and offers the person the two presses the doors allow. It adds no page and no menu entry: the runs
 * page is where a run's conversation belongs, so that is where its copy is read.
 *
 * THE TOOL'S WORD IS THE PERSON'S, NOT THE STORED ONE. `RUNTIME_WORDS` in src/shared/participants.ts is the one table
 * the chat's mark already uses: claude-code is drawn as "claude", codex as "codex", opencode as "opencode", each with
 * the tool's own name behind it. A runtime this office does not know, or a run that recorded none, is drawn as the
 * stored word rather than guessed at — the same rule the chat's mark follows.
 *
 * NOTHING IS DRAWN WHERE NOTHING WAS READ. While the read is in flight the panel says it is reading; when the read
 * failed it says what failed and offers to read again. It never draws "no conversations" for a reading it did not get.
 */
import { t } from '@shared/i18n.ts'
import type { ConversationLine, ConversationSyncReply, ConversationSyncState } from '@shared/conversation-sync.ts'
import { isAgentRuntime, RUNTIME_WORDS } from '@shared/participants.ts'
import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, faultOf, getActor, type Fault } from '../api.ts'
import { Btn, ErrorNote, Loading, Panel, ServerNote, Tag, type TagTone } from './ui.tsx'

/** What the panel knows about the sync at one moment. */
export interface ConversationSyncReading {
  reply: ConversationSyncReply | null
  failed: { message: string; fault: Fault | null } | null
}

/** The panel's drawing, separated from its read so it can be rendered straight from a made-up reading. */
export interface ConversationSyncPanelViewProps extends ConversationSyncReading {
  /** Whether the person is reading: only the person may turn the sync on or off, or run it. */
  person: boolean
  /** A press is in flight. The presses stay out of reach until the server answers. */
  busy?: boolean
  onRead?: () => void
  onRun?: () => void
  onTurnOn?: (enabled: boolean) => void
}

/** The word a person reads for a copy's state, from the one list the kind declares. */
function theStateWord(state: ConversationSyncState): string {
  switch (state) {
    case 'synced':
      return t('conversation.state.synced')
    case 'missing':
      return t('conversation.state.missing')
    case 'unreadable':
      return t('conversation.state.unreadable')
    case 'too-large':
      return t('conversation.state.too-large')
    case 'deleted':
      return t('conversation.state.deleted')
    case 'not-synced':
      return t('conversation.state.not-synced')
  }
}

/** How loud a state is drawn: a copy is quiet, a failure is a warning, and a copy not expected is quieter still. */
function theStateTone(state: ConversationSyncState): TagTone {
  if (state === 'synced') return 'quiet'
  if (state === 'not-synced') return 'neutral'
  return 'warn'
}

/**
 * The tag's word and the sentence behind it. The stored runtime word is read through `RUNTIME_WORDS`; an unknown
 * runtime is the stored word, and `conversation.runtime.notRecorded` when there is none at all.
 */
function theTool(line: ConversationLine): { word: string; name: string } {
  if (line.runtime.known && isAgentRuntime(line.runtime.word)) {
    const words = RUNTIME_WORDS[line.runtime.word]
    return { word: words.short, name: words.full }
  }
  return { word: line.runtime.word, name: t('conversation.runtime.notRecorded') }
}

export function ConversationSyncPanelView({
  reply,
  failed,
  person,
  busy = false,
  onRead,
  onRun,
  onTurnOn,
}: ConversationSyncPanelViewProps) {
  return (
    <Panel
      declares={{ surface: 'sessions.conversations' }}
      titleIs="label"
      title={t('conversation.sync.title')}
      actions={reply === null ? null : <Tag tone="quiet">{reply.total}</Tag>}
    >
      <style href="mole-office-conversation-sync" precedence="default">
        {CONVERSATION_SYNC_CSS}
      </style>
      {failed !== null ? (
        <ErrorNote message={failed.message} fault={failed.fault} retry={onRead} />
      ) : reply === null ? (
        <Loading label={t('conversation.sync.loading')} rows={2} />
      ) : (
        <TheReading reply={reply} person={person} busy={busy} onRun={onRun} onTurnOn={onTurnOn} />
      )}
    </Panel>
  )
}

function TheReading({
  reply,
  person,
  busy,
  onRun,
  onTurnOn,
}: {
  reply: ConversationSyncReply
  person: boolean
  busy: boolean
  onRun?: () => void
  onTurnOn?: (enabled: boolean) => void
}) {
  return (
    <div className="csp">
      <p className="csp-line">{t(reply.enabled ? 'conversation.sync.state.on' : 'conversation.sync.state.off')}</p>
      {reply.lastOutcome === null ? null : <p className="csp-note">{t('conversation.sync.state.last', { at: reply.lastOutcome.at, synced: reply.lastOutcome.synced })}</p>}
      {reply.lastOutcome === null ? null : <ServerNote text={reply.lastOutcome.says} />}

      {person ? (
        <div className="csp-presses">
          {reply.enabled ? (
            <>
              <Btn size="sm" variant="primary" onClick={onRun} disabled={busy}>
                {t(busy ? 'conversation.sync.copying' : 'conversation.sync.run')}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => onTurnOn?.(false)} disabled={busy}>
                {t('conversation.sync.turnOff')}
              </Btn>
            </>
          ) : (
            <Btn size="sm" variant="primary" onClick={() => onTurnOn?.(true)} disabled={busy}>
              {t('conversation.sync.turnOn')}
            </Btn>
          )}
        </div>
      ) : null}

      {reply.enabled ? (
        reply.conversations.length === 0 ? (
          <p className="csp-note">{t('conversation.sync.state.none')}</p>
        ) : (
          <ul className="csp-list">
            {reply.conversations.map((line) => {
              const tool = theTool(line)
              return (
                <li className="csp-row" data-conversation-run={line.runId} key={line.runId}>
                  <Tag tone={line.runtime.known ? 'quiet' : 'warn'} title={tool.name}>
                    {tool.word}
                  </Tag>
                  <span className="csp-title">{line.title}</span>
                  <Tag tone={theStateTone(line.state)}>{theStateWord(line.state)}</Tag>
                </li>
              )
            })}
          </ul>
        )
      ) : null}

      {reply.left > 0 ? (
        <p className="csp-note">{t('conversation.sync.more', { shown: reply.reading, total: reply.total })}</p>
      ) : null}
    </div>
  )
}

/**
 * THE PANEL WITH ITS READ. It reads once when the runs page mounts; a press reads again after the write it asked for.
 * A failed press is said in the panel rather than thrown away, and the copy read is kept so the reader does not lose
 * what was already drawn.
 */
export function ConversationSyncPanel() {
  const [reply, setReply] = useState<ConversationSyncReply | null>(null)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const read = useCallback(async (): Promise<void> => {
    try {
      setReply(await api.conversationSync())
      setFailed(null)
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  const run = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await api.runConversationSync()
      await read()
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }, [read])

  const turnOn = useCallback(async (enabled: boolean): Promise<void> => {
    setBusy(true)
    try {
      setReply(await api.setConversationSync(enabled))
      setFailed(null)
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <ConversationSyncPanelView
      reply={reply}
      failed={failed}
      person={getActor().type === 'human'}
      busy={busy}
      onRead={() => void read()}
      onRun={() => void run()}
      onTurnOn={(enabled) => void turnOn(enabled)}
    />
  )
}

const CONVERSATION_SYNC_CSS = `
.csp { display: flex; flex-direction: column; gap: 8px; }
.csp-line, .csp-note { margin: 0; }
.csp-note { color: var(--text-2); font-size: var(--fs-2); }
.csp-presses { display: flex; flex-wrap: wrap; gap: 8px; }
.csp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.csp-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.csp-title { min-width: 0; overflow-wrap: anywhere; }
`
