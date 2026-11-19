// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import type { MessageOnTheWire } from '@shared/messages.ts'
import { theModelsName } from '@shared/model-names.ts'
import { RUNTIME_WORDS } from '@shared/participants.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'

/**
 * THE TOOL AND THE MODEL OF THE RUN A MESSAGE CAME OUT OF, drawn as a small mark beside it.
 *
 * A message is marked with the tool the agent's
 * run used, for example a small "claude", "codex" or "opencode" label beside the conversation. Problem
 * 2tbFWxiFyjtv adds the model: a person cannot weigh what they read without knowing which model wrote
 * it. The model is named by its name from the one table, src/shared/model-names.ts, in a sentence in
 * the reader's language; the stored id is drawn only in developer mode.
 *
 * NOTHING IS DRAWN WHERE NOTHING IS KNOWN. A message a person wrote came out of no run, and a run
 * whose session record never said which tool it was cannot be named either. Both come back as null
 * from the server and both draw nothing here — no dash, no "unknown", and above all no guess. A run
 * that names its tool and not its model draws the tool alone, and its sentence says the model was
 * not recorded. A model the table has no name for is said to be one, never shown as its id.
 *
 * THE SHORT WORDS ARE ON THE SCREEN AND THE WHOLE SENTENCE IS BEHIND THEM. The mark sits in the
 * corner of a chat bubble; a reader who wants the tool's own name reads the hover text, and a reader
 * who hears the page is told the whole sentence.
 */
export function RanBy({ ranBy }: { ranBy: MessageOnTheWire['ranBy'] }) {
  useLanguage()
  const inspect = useInspect()
  if (ranBy === null) return null
  const tool = RUNTIME_WORDS[ranBy.runtime]
  const name = ranBy.model === null ? null : theModelsName(ranBy.model)
  const sentence =
    ranBy.model === null
      ? t('chat.ranBy.modelNotRecorded', { tool: tool.full })
      : name === null
        ? t('chat.ranBy.modelUnnamed', { tool: tool.full })
        : t('chat.ranBy.modelNamed', { tool: tool.full, model: name })
  const model = ranBy.model === null ? null : (name ?? t('chat.ranBy.unnamedModel'))
  return (
    <span className="px-chat-ranby" title={sentence} aria-label={sentence}>
      <span aria-hidden="true">
        {tool.short}
        {model === null ? null : <span className="px-chat-ranby-model"> · {model}</span>}
        {inspect && ranBy.model !== null ? <code className="px-chat-ranby-id"> {ranBy.model}</code> : null}
      </span>
      <span className="px-sr">{sentence}</span>
    </span>
  )
}
