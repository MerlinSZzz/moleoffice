// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to messages and chat: contacts, conversations, pictures,
// groups, waiting, and messages sent through the record door. Wave 13y's round 68 moved them here out of the one
// `api` object in src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts joins every
// part into `api`.
import { type APageToAskFor, type AnchorMove, type AnchorReading, type AsSideReply, type BetweenAgentsReply, type CommentOnThePage, type ContactListPage, type ContactsReply, type ConversationReply, type GroupsReply, type MessagesPageAsk, type OffersWaitingForMe, type OneGroupReply, type PoolEntry, type RecordReply, type ShortBetweenAgentsReply, type ShortContactsReply, type ShortGroupsReply, type UnregisteredReply, json, request, theQueryOfAPage } from '../api.ts'
import type { RemindMeLaterChoice } from '@shared/remind-me-later.ts'
import type { TheCircle } from '@shared/short-lists.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import type { GroupOnTheWire } from '@shared/groups.ts'
import type { ContactGroup, ContactSide } from '@shared/contacts.ts'
import type { DeliveryMark, MessageOnTheWire } from '@shared/messages.ts'
import type { AMarkedPart, IntentMark } from '@shared/intent-mark.ts'
import type { MessageLabel } from '@shared/message-label.ts'
import type { PoolPage } from '../../server/api/messages.ts'
import type { WaitingReply } from '../../server/api/waiting.ts'
import type { WhatHasBeenSaid } from '../../server/lib/communication.ts'
import type { MessageContext } from '../../server/lib/agents.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { annotationTitle } from '../components/agent/context.ts'
import { betweenAgentsPagePath, type AgentConversationPage } from '../lib/between-agent-pages.ts'
import type { ImageBlock } from '@shared/types.ts'
import type { TheDuties } from '../../server/lib/grant/secretary-duties.ts'
import type { TheUsageDecision, TheUsageNoticeSecretary } from '../../server/lib/usage-notices.ts'

export const messagesDoors = {
  /**
   * EVERYTHING WAITING ON THE PERSON, IN EVERY PROJECT — the one reading every number about that
   * comes from.
   *
   * Three sources: an act refused to every agent, a live record carrying a request for a person,
   * and what the owner set aside. It takes no workspace and no parameters at all, which is the same
   * structural promise `forks` above makes and is what keeps a cross-project reading from being a
   * way to read a project.
   *
   * ONE CALLER FETCHES IT AND HANDS IT ON. App.tsx asks once per navigation and gives the same
   * reply to the frame and to the page, because two components asking is two clocks in one frame —
   * and two numbers that can disagree is the defect this reading exists to end.
   */
  waiting: () => request<WaitingReply>('/api/waiting'),

  // -------------------------------------------------------------------- the message pool

  /** Everybody this reader could write to, with the last thing said and how many are unread. */
  messageContacts: () => request<ContactsReply>('/api/messages/contacts'),
  contactsForThePage: () => request<ShortContactsReply>('/api/messages/contacts?shape=page'),
  /**
   * ONE PAGE OF THE CHAT'S CONTACT LIST, in the order the list draws it, narrowed by the name typed and the project
   * chosen. The chat reads the first screen of contacts and more as the person scrolls, by a
   * decision. The pickers that need every contact still read `contactsForThePage`.
   *
   * `signal` lets the chat take back a read that has not answered: on the Between agents tab, that list's first page
   * is asked before the contact list (Chat.tsx `readTheContactListFromTheTop`).
   */
  contactList: (asked: { limit?: number; offset: number; name: string; project: string | null }, signal?: AbortSignal) => {
    const query = new URLSearchParams({ offset: String(asked.offset) })
    if (asked.limit !== undefined) query.set('limit', String(asked.limit))
    if (asked.name.trim() !== '') query.set('name', asked.name.trim())
    if (asked.project !== null) query.set('project', asked.project)
    return request<ContactListPage>(`/api/messages/contact-list?${query.toString()}`, signal === undefined ? {} : { signal })
  },
  /**
   * Who is reading and the number on the chat circle, and nothing else. A closed chat panel reads
   * this instead of the contact list; the number is the contact list's own `unread`.
   */
  messageCircle: () => request<TheCircle>('/api/messages/circle'),

  /**
   * Make a second-level group under one of the two top groups. It goes at the end, empty.
   *
   * `side` fixes which top group it sits under for good. Criterion M119: it is chosen when the
   * group is made and no later press changes it.
   */
  makeAContactGroup: (name: string, side: ContactSide) =>
    request<{ group: ContactGroup; groups: ContactGroup[] }>('/api/messages/contact-groups', {
      method: 'POST',
      body: JSON.stringify({ name, side }),
    }),

  /**
   * Rename a group, move it one place up or down inside its side, or fold it away.
   *
   * `collapsed` is the person's fold state (criterion M121). It is stored against the person, so
   * the next page reads it back even though the panel is thrown away.
   */
  changeAContactGroup: (
    key: string,
    what: { name: string } | { moveBy: -1 | 1 } | { collapsed: boolean },
  ) =>
    request<{ groups: ContactGroup[]; contactSides: { key: ContactSide; name: string; collapsed: boolean }[] }>(
      `/api/messages/contact-groups/${encodeURIComponent(key)}`,
      { method: 'PATCH', body: JSON.stringify(what) },
    ),

  /** Move one contact to a group, or one place up or down inside the group it is in. */
  placeAContact: (contact: string, what: { group: string } | { moveBy: -1 | 1 }) =>
    request<{ contacts: { key: string; group: string; at: number }[]; groups: ContactGroup[] }>(
      '/api/messages/contact-placements',
      { method: 'POST', body: JSON.stringify({ contact, ...what }) },
    ),

  /**
   * What one writer nobody registered has sent this reader, oldest first.
   *
   * IT WRITES ONLY WHEN A PERSON READS, for the reason a person opening a conversation does: the ones
   * still queued for them have reached their screen, so they become delivered. None becomes seen. When
   * an agent reads, nothing is marked (criterion M127).
   */
  messagesFromUnregistered: (writer: string) =>
    request<UnregisteredReply>(`/api/messages/unregistered?writer=${encodeURIComponent(writer)}`),


  /**
   * What this reader and one other participant have said, oldest first.
   *
   * IT WRITES ONLY WHEN A PERSON READS: every message in it that was addressed to them and was still
   * queued becomes delivered, because it has reached their screen. When an agent reads, nothing is
   * marked, because a message to an agent is moved by the hand that gives it the words (criterion
   * M127). It never marks one read.
   *
   * `page` ASKS FOR ONE PAGE rather than the whole conversation: the newest `limit` messages, the page
   * before a message, or what came after one (src/web/lib/conversationpages.ts says which the chat
   * asks when). A read of one page marks the whole conversation, as a whole read does.
   */
  conversationWith: (kind: ParticipantKind, id: string, workspaceId?: string, page?: APageToAskFor) =>
    request<ConversationReply>(
      `/api/messages/conversation?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}${page === undefined ? '' : theQueryOfAPage(page)}`,
      workspaceId === undefined ? undefined : {headers:{[WORKSPACE_HEADER]:workspaceId}},
    ),

  /**
   * THE SAME READ, NARROWED TO THIS READER'S OWN COMMENTS IN THE CONVERSATION THAT NOBODY HAS SENT YET, each as a whole
   * read gives it. It marks as a read of one page does. The review's send compares these with the ones it showed.
   */
  myUnsentInTheConversationWith: (kind: ParticipantKind, id: string, workspaceId?: string) =>
    request<ConversationReply>(
      `/api/messages/conversation?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}&only=my-unsent`,
      workspaceId === undefined ? undefined : {headers:{[WORKSPACE_HEADER]:workspaceId}},
    ),

  /**
   * THE EMERGENCY MESSAGES THIS SCREEN HAS NOT DISMISSED. Criterion M62.
   *
   * The narrowing is the server's: a message may be for one machine and one browser, and a page
   * cannot read the name of the computer it is on. What comes back is what this screen must draw.
   */
  forcedMessages: () => request<{ messages: PoolEntry[] }>('/api/messages/forced'),

  /**
   * NOT NOW ON A LEAD OFFER. The message stays unread, and the offers read leaves it out for a while
   * (`A_PUT_OFF_OFFER_COMES_BACK_AFTER_MINUTES` in src/shared/short-lists.ts).
   */
  putOffALeadOffer: (id: string) =>
    request<{ changed: boolean; putOffAt: string | null; comesBackInSeconds: number | null; because: string }>(
      `/api/messages/${encodeURIComponent(id)}/not-now`,
      { method: 'POST' },
    ),

  /**
   * REMIND ME LATER ON A LEAD OFFER. The office brings the message back once, at the chosen time
   * (`REMIND_ME_LATER_TIMES` in src/shared/remind-me-later.ts), and says the time as `remindAt` and the press as
   * `pressedAt`, both on the office's own clock.
   */
  remindMeLater: (id: string, choice: RemindMeLaterChoice) =>
    request<{ messageId: string; choice: RemindMeLaterChoice; remindAt: string; pressedAt: string; because: string }>(
      `/api/messages/${encodeURIComponent(id)}/remind-me-later`,
      { method: 'POST', body: json({ choice }) },
    ),

  /** Say how far a message got with you. A mark never moves backwards. */
  markMessage: (id: string, mark: 'delivered' | 'seen') =>
    request<{ message: PoolEntry; changed: boolean; because: string }>(
      `/api/messages/${encodeURIComponent(id)}/mark`,
      { method: 'POST', body: json({ mark }) },
    ),

  /**
   * Say you have seen several messages at once: the marks for what is on a screen, written in one transaction.
   * At most `SEEN_MARKS_IN_ONE_REQUEST_AT_MOST` (src/shared/messages.ts) ids in one call.
   */
  markSeen: (ids: readonly string[]) =>
    request<{ marks: { messageId: string; changed: boolean; mark: DeliveryMark; because: string }[] }>(
      '/api/messages/seen',
      { method: 'POST', body: json({ messages: ids }) },
    ),

  /**
   * Send a message to one participant.
   *
   * Through POST /api/records, because a message is a record and a second write door would be a
   * second set of rules about somebody's own words.
   */
  sendMessage: (
    to: { kind: ParticipantKind; id: string },
    body: string,
    pictures?: readonly ImageBlock[],
    workspaceId?: string,
    /**
     * SO A CALLER MAY GIVE UP WAITING. Criterion M113: a send that gets no answer within a chosen
     * time is shown as failed, with a press to try again. `fetch` needs the browser's own
     * AbortSignal to do that; nothing here invents a second timeout mechanism, and a caller that
     * does not pass one waits exactly as long as it always has.
     */
    signal?: AbortSignal,
    /**
     * THE CHAT'S OWN ID FOR THIS PRESS, stored on the message as `sendId`. Problem KzLydNEm4HYX:
     * after an answer is lost, the chat finds its own letter in the conversation by this id.
     */
    sendId?: string,
    /**
     * THE MARK THE PERSON CHOSE BESIDE SEND: none, just ask or proposal first. The composer
     * writes "none" too, so the record keeps the difference from a message sent where no selector was offered.
     * Left out, the message carries no mark, which is what every other sender writes.
     */
    intent?: IntentMark,
    /**
     * THE QUOTES ABOVE THE MESSAGE'S WORDS, taken from the page before it is sent. Each is the
     * same context a comment stores. Left out, the message quotes nothing.
     */
    quotes?: readonly MessageContext[],
    /**
     * A LABEL OF THE PERSON'S OWN, chosen on the flag beside Send in place of a mark (src/shared/message-label.ts). Left
     * out, the message carries no label.
     */
    label?: MessageLabel,
    quotePositions?: readonly number[],
    /**
     * THE RUNS OF THE WORDS THE PERSON MARKED IN THE BOX (DB-2). A message carries either these or one flag on the
     * whole message, never both, so a caller with parts passes no `intent` and no `label`. Left out, the message
     * carries no parts.
     */
    markedParts?: readonly AMarkedPart[],
  ) =>
    request<RecordReply>('/api/records', {
      ...(workspaceId === undefined ? {} : {headers:{[WORKSPACE_HEADER]:workspaceId}}),
      ...(signal === undefined ? {} : { signal }),
      method: 'POST',
      // THE TITLE IS THE FIRST OF THE WORDS, by the same rule a comment's is: one place decides how a
      // record made of somebody's words is named, so the two cannot drift apart.
      body: json({
        kind: 'message',
        title: annotationTitle(body),
        // THE PAGE WRITES NO `urgent`: the person's writing row has no second way to send. An agent's
        // urgent message is written through its own doors, which this is not.
        // A MESSAGE WITH NO PICTURES WRITES NO `pictures` KEY: an empty list and an absent field say
        // the same thing, and one of them would be on every row.
        data: {
          body,
          to: [to],
          ...(pictures !== undefined && pictures.length > 0 ? { pictures } : {}),
          ...(quotes !== undefined && quotes.length > 0 ? { quotes } : {}),
          ...(quotePositions !== undefined ? { quotePositions } : {}),
          ...(sendId === undefined ? {} : { sendId }),
          ...(intent === undefined ? {} : { intent }),
          ...(label === undefined ? {} : { label }),
          ...(markedParts === undefined ? {} : { markedParts }),
        },
      }),
    }),

  /**
   * "MARK BROKEN": THE PERSON SAYS AN AGENT'S REPLY BROKE THE MARK ON THEIR MESSAGE. `reply` is
   * the agent's message the press is on; `markedMessage` is the person's marked message the page drew it under. The
   * server files one problem in `workspaceId` and tells the agent once; a second press files nothing and names the first.
   */
  markBroken: (reply: string, markedMessage: string, workspaceId?: string) =>
    request<{ problem: string; filed: boolean; told: string | null; says: string }>(
      `/api/messages/${encodeURIComponent(reply)}/mark-broken`,
      {
        ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
        method: 'POST',
        body: json({ markedMessage }),
      },
    ),

  /**
   * SEND TO ONE CONTACT, ABOUT SOMETHING.
   *
   * The right-click panel's send is the chat's send about a place: one message record, addressed to
   * one participant the contact list holds, that also says what on a page it is about. Criterion W4:
   * the right-click panel is contact based, like the chat. The
   * same write door — POST /api/records — and the same shape `sendMessage` above writes, plus
   * `target`, which the message kind already declares: a comment is a message that says what on the
   * page it is about, and the server works the delivery rows out from `to` the same way it always
   * has. There is no second door and no second shape of message.
   */
  sendMessageAbout: (to: { kind: ParticipantKind; id: string }, body: string, context: MessageContext) =>
    request<RecordReply>('/api/records', {
      method: 'POST',
      body: json({
        kind: 'message',
        title: annotationTitle(body),
        data: { body, to: [to], target: context },
      }),
    }),

  /**
   * START A NEW AGENT FOR ONE AGENT THAT CANNOT BE REACHED. Criterion M78.
   *
   * ONE CALL BEHIND ALL THREE PLACES the press is drawn in — the chat, the contact row and the
   * right-click menu — because the press works in all three.
   * Three presses calling three doors would be three behaviours to learn.
   *
   * IT STARTS NOTHING ITSELF. It says a run may be started for whatever of theirs is waiting on the
   * press, and the message worker starts it. The reply says how many messages that was, and says so
   * plainly when it was none.
   */
  startANewAgentFor: (agentId: string, workspaceId?: string) =>
    request<{ agent: string; handle: string; branchedFrom: string; moved: string[]; says: string }>(
      `/api/agents/${encodeURIComponent(agentId)}/start-a-new-agent`,
      { method: 'POST', body: json({}), ...(workspaceId === undefined ? {} : {headers:{[WORKSPACE_HEADER]:workspaceId}}) },
    ),

  /**
   * WHETHER THAT PRESS WOULD CARRY ANYTHING FOR THIS AGENT, read with the press's own reading. The chat
   * asks it before it offers the press, so the press is offered only where it would do something.
   */
  wouldThePressCarry: (agentId: string, workspaceId?: string) =>
    request<{ wouldCarry: boolean }>(
      `/api/agents/${encodeURIComponent(agentId)}/start-a-new-agent`,
      workspaceId === undefined ? undefined : {headers:{[WORKSPACE_HEADER]:workspaceId}},
    ),

  /**
   * WHAT MAY BE SENT AS A PICTURE IN A MESSAGE: how big, and which three types. Criterion M65.
   *
   * Read before anybody chooses a file, so the composer says the limit rather than refusing after.
   * The numbers are the server's own, from the declarations its refusals name.
   */
  whatAPictureMayBe: () =>
    request<{ picture: { maxBytes: number; types: string[]; said: string } }>('/api/messages/pictures'),

  /**
   * PUT A PICTURE WHERE A MESSAGE CAN POINT AT IT, and get back the path. Criterion M65.
   *
   * It writes no record. The message that carries the picture goes through `sendMessage` above, the
   * one write door for somebody's words, with the path this hands back inside an image block.
   *
   * BASE64 FOR THE REASON THE AVATAR DOOR TAKES BASE64: there is no multipart parser in this server.
   */
  sendAPicture: (bytes: string, workspaceId?: string) =>
    request<{ picture: { path: string; mime: string; bytes: number } }>('/api/messages/pictures', {
      ...(workspaceId === undefined ? {} : {headers:{[WORKSPACE_HEADER]:workspaceId}}),
      method: 'POST',
      body: json({ bytes }),
    }),

  /**
   * PUT ANY OTHER FILE WHERE A MESSAGE CAN POINT AT IT, under the name it was sent with, and get back the path. It
   * writes no record either, and the message carries the path in an image block whose alt is the name.
   */
  sendAFile: (bytes: string, name: string, workspaceId?: string) =>
    request<{ file: { path: string; bytes: number } }>('/api/messages/files', {
      ...(workspaceId === undefined ? {} : {headers:{[WORKSPACE_HEADER]:workspaceId}}),
      method: 'POST',
      body: json({ bytes, name }),
    }),

  /**
   * ANSWER A COMMENT WHERE IT WAS LEFT.
   *
   * The answer is a message like any other: it says what on the page it is about, which is the same
   * place the comment it answers named, and it is addressed to whoever wrote that comment. So it
   * enters that agent's queue the way every message to an agent does. Criterion M7.
   *
   * AND IT NAMES THE MESSAGE IT ANSWERS. `inReplyTo` used to be left out here, on the argument that
   * a comment is a message with a target and two comments about one place are already an exchange
   * about that place. The argument was right until the worker gave `inReplyTo` a meaning and the
   * schema promised that anybody answering writes it — and then no screen did, so the document
   * agents read before they write described a behaviour that did not exist, and an agent with two
   * comments on one page could not tell which one had been answered. Problem `Wjb30lfFs62C`.
   *
   * The server still works out on its own whether a message is an answer when nobody said, so this
   * adds a fact rather than a second mechanism.
   */
  replyWhereItWasSaid: (
    to: { kind: ParticipantKind; id: string },
    body: string,
    context: MessageContext,
    inReplyTo: string,
  ) =>
    request<RecordReply>('/api/records', {
      method: 'POST',
      body: json({
        kind: 'message',
        title: annotationTitle(body),
        data: { body, to: [to], target: context, inReplyTo },
      }),
    }),

  /**
   * EVERY MESSAGE IN THIS PROJECT, newest first, with how far each got with each recipient.
   *
   * The offers to take somebody to a page are read out of this rather than out of a route of their
   * own: an offer is a message with a `lead`, and a second route answering "the leads" would be a
   * second reading of one pool. The Reports and notes page reads the same call for the same reason:
   * whether a message has been read is a delivery row, and a second answer worked out from the
   * record would be the two stores that page used to have.
   */
  /**
   * ONE MESSAGE, AND HOW FAR IT GOT WITH EACH RECIPIENT, by criterion E2 and a decision.
   *
   * The door is GET /api/messages/:id, which has existed since the pool did; what was missing was a
   * page that reads one message rather than the whole pool. The reply shape is the same
   * `MessageOnTheWire` every screen already reads, so the own page and the pool cannot disagree
   * about one message.
   */
  getMessage: (id: string) => request<{ message: MessageOnTheWire }>(`/api/messages/${encodeURIComponent(id)}`),

  carryableAgentIds: () => request<{ agentIds: string[] }>('/api/messages/carryable-agent-ids'),

  /**
   * THE POOL, OR THE PART OF IT A READER NEEDS. `only` narrows at the door: 'waiting-for-me' is the
   * messages with a delivery to the reader not marked seen (the lead pop-up's offers), 'queued-for-
   * agents' the messages nothing has taken for an agent yet. The whole
   * pool is 2.4 MB on their machine and was read for a handful of lines on every delivery change
   * (problem 9UeL9VeVPn33).
   */
  messagePool: (only?: 'waiting-for-me' | 'queued-for-agents' | 'addressed-to-me-or-nobody' | 'waiting-for-my-answer', narrow?: boolean, page?: { limit: number; offset: number }) =>
    request<{ messages: PoolEntry[]; workspaceId: string } & Partial<PoolPage>>(
      '/api/messages?' +
        [only === undefined ? null : `only=${encodeURIComponent(only)}`, narrow === true ? 'narrow=1' : 'full=1', page === undefined ? null : `limit=${String(page.limit)}&offset=${String(page.offset)}`]
          .filter((one) => one !== null)
          .join('&'),
    ),

  /**
   * ONE PAGE OF THE MESSAGES PAGE. Every narrowing is worked out by the door
   * over the whole pool before it cuts the page, and the answer says how many there are in all.
   */
  messagesPage: (ask: MessagesPageAsk) => {
    const params = new URLSearchParams()
    if (ask.sender !== undefined) params.set('sender', ask.sender)
    if (ask.contact !== undefined) params.set('contact', ask.contact)
    if (ask.group !== undefined) params.set('group', ask.group)
    if (ask.state !== undefined) params.set('state', ask.state)
    if (ask.words !== undefined) params.set('words', ask.words)
    params.set('limit', String(ask.limit))
    params.set('offset', String(ask.offset))
    params.set('full', '1')
    return request<{ messages: PoolEntry[]; workspaceId: string } & PoolPage>(`/api/messages?${params.toString()}`)
  },

  /**
   * EVERY UNREAD MESSAGE FOR THIS READER THAT THE PAGE'S NARROWINGS KEEP, ON EVERY PAGE, as ids.
   *
   * The Messages page's mark-all-read press marks these. It asks the pool
   * door's own `only=waiting-for-me` with the same narrowings the page draws, without the words, a
   * thousand at a time, and follows the door's `next` until nothing is left, so no page is missed.
   */
  unreadMessageIdsForMe: async (ask: Omit<MessagesPageAsk, 'limit' | 'offset'>): Promise<string[]> => {
    const params = new URLSearchParams({ only: 'waiting-for-me', narrow: '1' })
    if (ask.sender !== undefined) params.set('sender', ask.sender)
    if (ask.contact !== undefined) params.set('contact', ask.contact)
    if (ask.group !== undefined) params.set('group', ask.group)
    if (ask.state !== undefined) params.set('state', ask.state)
    if (ask.words !== undefined) params.set('words', ask.words)
    params.set('limit', '1000')
    const ids: string[] = []
    for (let offset = 0; ; ) {
      params.set('offset', String(offset))
      const page = await request<{ messages: PoolEntry[] } & PoolPage>(`/api/messages?${params.toString()}`)
      ids.push(...page.messages.map((one) => one.id))
      if (page.next === null || page.returned === 0) return ids
      offset += page.returned
    }
  },

  /**
   * What is waiting for this reader, only the entries that carry a lead, without the ones the reader
   * put off with Not now a short while ago. The offers panel draws nothing else: an entry without a
   * lead is never an offer (`carriesALead` in src/shared/short-lists.ts).
   */
  offersWaitingForMe: (offset = 0, offerFrom?: string) => {
    const query = new URLSearchParams({ only: 'waiting-for-me', leads: '1', full: '1', limit: '50', offset: String(offset) })
    if (offerFrom !== undefined) query.set('offerFrom', offerFrom)
    return request<OffersWaitingForMe>(`/api/messages?${query.toString()}`)
  },

  /**
   * Every conversation between two agents, newest first.
   *
   * Only a person may read one, and the reply says whether the caller may and why rather than
   * answering an empty list to somebody who is not allowed to look.
   */
  agentConversations: () => request<BetweenAgentsReply>('/api/messages/between-agents'),
  /** The same list with each row cut to what the chat's Between agents tab draws. */
  agentConversationsForThePage: () => request<ShortBetweenAgentsReply>('/api/messages/between-agents?shape=page'),
  /** One short page of the conversations, optionally narrowed to a project. */
  agentConversationPage: (project: string | null, cursor: string | null) =>
    request<AgentConversationPage>(betweenAgentsPagePath(project, cursor)),

  /**
   * One conversation between two agents, read as one of the two sees it.
   *
   * Reading writes nothing on any message. The read itself is recorded the way every request is.
   */
  conversationBetween: (pair: string, asSide: string | null, page: APageToAskFor = { limit: 50 }) => {
    const query = new URLSearchParams({ limit: String(page.limit) })
    if (asSide !== null) query.set('as', asSide)
    if (page.before !== undefined) query.set('before', page.before)
    if (page.after !== undefined) query.set('after', page.after)
    if (page.since !== undefined) query.set('since', page.since)
    if (page.from !== undefined) query.set('from', page.from)
    return request<AsSideReply>(`/api/messages/between/${encodeURIComponent(pair)}?${query.toString()}`)
  },

  /** Every group in this project, with who is in each and which of them this reader is in. */
  groups: () => request<GroupsReply>('/api/groups'),
  /** The same list with each row cut to what the chat's Groups tab and the claims band draw. */
  groupsForThePage: () => request<ShortGroupsReply>('/api/groups?shape=page'),

  /**
   * Open a group, with whoever it starts with. The Groups tab's New group press uses this.
   *
   * `because` is required by the door and is where the group's own line records why it was opened.
   */
  openAGroup: (
    name: string,
    because: string,
    members: { who: { kind: ParticipantKind; id: string }; because: string }[],
  ) => request<{ group: GroupOnTheWire; workspaceId: string }>('/api/groups', {
    method: 'POST',
    body: json({ name, because, members }),
  }),

  /** One group and everything said in it. `as` reads it from one member's side (M12). */
  oneGroup: (id: string, asSide?: string) =>
    request<OneGroupReply>(
      asSide === undefined
        ? `/api/groups/${encodeURIComponent(id)}`
        : `/api/groups/${encodeURIComponent(id)}?as=${encodeURIComponent(asSide)}`,
    ),

  /**
   * Send a message to a group. Every member of it gets one delivery mark; the sender gets none.
   *
   * Through POST /api/records for the reason `sendMessage` above is: a message is a record, and a
   * second write door would be a second set of rules about somebody's own words.
   */
  sendToGroup: (groupId: string, body: string, pictures?: readonly ImageBlock[], intent?: IntentMark, quotes?: readonly MessageContext[], label?: MessageLabel, quotePositions?: readonly number[], markedParts?: readonly AMarkedPart[]) =>
    request<RecordReply>('/api/records', {
      method: 'POST',
      body: json({
        kind: 'message',
        title: annotationTitle(body),
        // A PICTURE GOES TO A GROUP THE WAY IT GOES TO ONE PERSON. The composer is the same box, so
        // a picture chosen and then sent to a group without it would be a loss with nothing saying
        // it had happened. Criterion M65.
        data: {
          body,
          toGroup: groupId,
          ...(pictures !== undefined && pictures.length > 0 ? { pictures } : {}),
          ...(quotes !== undefined && quotes.length > 0 ? { quotes } : {}),
          ...(quotePositions !== undefined ? { quotePositions } : {}),
          ...(intent === undefined ? {} : { intent }),
          ...(label === undefined ? {} : { label }),
          ...(markedParts === undefined ? {} : { markedParts }),
        },
      }),
    }),

  /** Leave a group. A person may leave; an agent may take nobody else out. */
  leaveGroup: (id: string, who: { kind: ParticipantKind; id: string }) =>
    request<{ group: GroupOnTheWire }>(`/api/groups/${encodeURIComponent(id)}/members/remove`, {
      method: 'POST',
      body: json({ who }),
    }),

  /**
   * WHAT HAS BEEN SAID, in three directions, with how far each one actually gets.
   *
   * Its own call rather than a field on `attention`: what has been said is not what needs somebody,
   * and folding it into that reply would put it inside a ranked list it is not ranked in.
   */
  whatHasBeenSaid: () => request<WhatHasBeenSaid>('/api/communication'),

  /**
   * What has changed since you last looked.
   *
   * The anchor is on the SERVER and belongs to the person, so the desk and the phone read the same
   * bookmark and move it for each other. It is deliberately NOT read from localStorage: the phone
   * is always the second browser, and a mark in one browser's storage is one the other can never
   * answer from.
   *
   * A reader who has never looked gets `anchor: null` and `changes: null` — never an empty list.
   * See `anchorState` in lib/attention.ts, which turns those three answers into one named thing.
   */
  anchor: (opts: { limit?: number } = {}) =>
    request<AnchorReading>(opts.limit === undefined ? '/api/anchor' : `/api/anchor?limit=${opts.limit}`),

  /**
   * Mark the point you have read to.
   *
   * The moment itself is the server's clock and cannot be sent — an anchor an hour out hides an
   * hour of agent work, silently. `lastChangeId` says "I have read as far as this row" and defaults
   * to the newest row in the log. Who it belongs to is the actor headers every request carries.
   */
  markReadTo: (opts: { lastChangeId?: string } = {}) =>
    request<AnchorMove>('/api/anchor', {
      method: 'PUT',
      body: json(opts.lastChangeId === undefined ? {} : { lastChangeId: opts.lastChangeId }),
    }),

  /**
   * EVERY COMMENT IN THIS PROJECT, of both kinds, with only the fields the pages read.
   *
   * Not `listRecords('annotation')`, which from the one message pool on is half of them: a comment
   * written now is a message that says what on a page it is about. The page shape keeps each row's
   * id, kind, time and the four data fields the marks and the agent's card read; the whole rows are
   * what the door answers anybody else.
   */
  commentRecords: () => request<{ comments: readonly CommentOnThePage[]; recipientNames?: Record<string, string | null> }>('/api/messages/comments?shape=page'),

  /**
   * EVERY SECRETARY, WITH THE AREA OF ITS DUTIES IN ANY PROJECT, or null where nobody recorded them. The chat's duty line
   * under a name reads it, once for the page (src/web/components/ChatDuty.tsx), across the office, so a secretary's duty
   * reads the same from any project the chat is opened in (wave 13y round 111). The door is in
   * src/server/api/secretary-duties.ts.
   */
  secretariesDuties: () => request<SecretariesDutiesReply>('/api/secretaries/duties?scope=office'),

  /**
   * EVERY SECRETARY, WITH ITS DUTIES IN ONE PROJECT, or null where nobody recorded them there. The right-click box's
   * contact list pins the secretaries with duties in the project of what it is about (wave 13y round 169). The project is
   * the one named, or the switcher's when none is.
   */
  secretariesDutiesIn: (workspaceId?: string) =>
    request<SecretariesDutiesReply>(
      '/api/secretaries/duties',
      workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: workspaceId } },
    ),

  /**
   * WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' LOGIN, and the secretaries that may be chosen. The Settings panel
   * "Usage notices" reads it (wave 13y round 137). The door is in src/server/api/usage-notice-secretary.ts.
   *
   * NO NAME HERE BEGINS WITH "usage". A call whose name does is one of the usage page's measurement reads under
   * /api/usage, and tests/usage-page.test.ts makes every such call against that route table. These four are settings
   * under /api/office.
   */
  secretaryForTheUsageNotices: () => request<TheUsageNoticeSecretary>('/api/office/usage-notice-secretary'),

  /** CHOOSE WHO TAKES THE USAGE NOTICES by the agent's id, or null for nobody. Answers the reading as it now stands. */
  setSecretaryForTheUsageNotices: (agent: string | null) =>
    request<TheUsageNoticeSecretary>('/api/office/usage-notice-secretary', { method: 'POST', body: JSON.stringify({ agent }) }),

  /** WHAT THE USAGE NOTICE AT 80% SAYS TO DO, and the decision it comes from. The door is in src/server/api/usage-decision.ts. */
  whatTheUsageNoticeSaysToDo: () => request<TheUsageDecision>('/api/office/usage-decision'),

  /** SET THE WORDS AND THE DECISION THEY COME FROM, or both null for nothing. Answers the reading as it now stands. */
  setWhatTheUsageNoticeSaysToDo: (whatToDo: string | null, decision: string | null) =>
    request<TheUsageDecision>('/api/office/usage-decision', { method: 'POST', body: JSON.stringify({ whatToDo, decision }) }),
}

/**
 * WHAT GET /api/secretaries/duties ANSWERS, in the fields the chat's duty line reads: each secretary's registry id, and its
 * duties' area or null. The door answers more than this. The area is typed by the stored duties' own declaration.
 */
export interface SecretariesDutiesReply {
  secretaries: { agent: { id: string }; duties: Pick<TheDuties, 'area' | 'supervisors'> | null }[]
}
