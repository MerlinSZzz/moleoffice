// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PAGE. Plan row C1.
 *
 * The second design draft puts the chat in the sidebar as well as in the corner, and not tied to a
 * project. The sidebar's Chat opens this page. It draws the same contacts, groups and conversations
 * as the corner panel, from the same component and through the same doors, so a message sent in one
 * is in the other. The corner is not drawn while this page is on screen, because this page is the
 * chat already.
 *
 * The chat's own logic is not changed here: contacts, groups, grouping and
 * the conversation are what the corner always drew. What the page adds is room: the lists stay
 * beside the open conversation on a wide screen, and on a narrow one the page shows one at a time,
 * as the corner does.
 */

import { t } from '@shared/i18n.ts'
import { ChatOnThePage } from '../components/Chat.tsx'

export function ChatPage() {
  return (
    <div className="chat-page">
      <style href="mole-office-chat-page" precedence="default">
        {CHAT_PAGE_CSS}
      </style>
      {/* THE PAGE IS NAMED WHAT THE SIDEBAR CALLS IT, from the same word. */}
      <h1 className="chat-page-title">{t('nav.chat')}</h1>
      <ChatOnThePage />
    </div>
  )
}

const CHAT_PAGE_CSS = `
.chat-page { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.chat-page-title { margin: 0; font-size: var(--fs-5); }
`
