// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to participants, their profiles and work areas, and
// agents' notebooks. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds
// its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ParticipantForThePage, type ParticipantOnTheWire, type ParticipantsForThePageReply, type ParticipantsReply, type ProfileReply, type ReleaseReadingReply, moleOfficeRequest, request } from '../api.ts'
import { everyParticipantPage } from '@shared/every-participant-page.ts'
import type { TheStoredMessageLabels } from '@shared/message-label.ts'
import type { ChatButtonStays, ChatOpensAs, ChatLayout, ChatTextSize, CircleShows, MessageLinkLayout, MessageLinkLevel, MessageProjectMark, ParticipantKind, PresenceChoice, SendKeySetting, ShortcutSettings } from '@shared/participants.ts'
import type { MessagePictureChoice } from '@shared/messagepictures.ts'
import type { MediaLoadChoice } from '@shared/mediaload.ts'
import type { AddressAs, AddressAsPart } from '@shared/address-as.ts'
import type { PresenceHere } from '../components/graph/Presence.tsx'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { type ProjectChoice, projectsQuery } from '@shared/across-projects.ts'
import type { TheNotebookRead } from '@shared/notebook.ts'

async function allParticipantPages<Row>(first: string, init?: RequestInit): Promise<{ people: Row[]; agents: Row[] }> {
  type Page = { people: Row[]; agents: Row[]; next?: string | null }
  const pages = await everyParticipantPage<Page>(first, async path => ({ ok: true, body: await request<Page>(path, init) }))
  return { people: pages.flatMap(page => page.people), agents: pages.flatMap(page => page.agents) }
}

export const participantsDoors = {
  /** Whether a release wakes this agent: what it or the owner said, with who, when and why, or null for nobody. */
  releaseReading: (id: string) => request<ReleaseReadingReply>(`/api/participants/agent/${encodeURIComponent(id)}/reads-releases-from-the-check`),
  sayReleaseReading: (id: string, on: boolean, because: string) => request<ReleaseReadingReply>(
    `/api/participants/agent/${encodeURIComponent(id)}/reads-releases-from-the-check`,
    { method: 'POST', body: JSON.stringify({ on, because }) },
  ),

  /** Say one slot of a secretary's broadcast has nothing to report. `at` is `YYYY-MM-DD HH:MM`. */
  skipABroadcast: (id: string, at: string) => moleOfficeRequest(
    `/api/participants/agent/${encodeURIComponent(id)}/broadcast-skip`,
    { method: 'POST', body: JSON.stringify({ at }) },
  ),
  changeWorkArea: (id: string, workArea: string[], because: string) => moleOfficeRequest(
    `/api/participants/agent/${encodeURIComponent(id)}/work-area`,
    { method: 'POST', body: JSON.stringify({ workArea, because }) },
  ),

  /**
   * WHO TAKES PART: both registries, each with the address of its picture.
   *
   * The pages are read one after another and joined before drawing. Each row is as it stood when its page was read, so two rows can come from moments a little apart.
   */
  participants: (init?: RequestInit): Promise<ParticipantsReply> => allParticipantPages<ParticipantOnTheWire>('/api/participants', init),

  /**
   * One registry row, with the arriving id or handle resolved by the existing participant door. The door refuses a
   * project the server does not hold, so a caller whose answer must not depend on the switcher names one.
   */
  participant: (kind: ParticipantKind, id: string, workspaceId?: string) => request<{ participant: ParticipantOnTheWire }>(
    `/api/participants/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } },
  ),

  /** Both registries, each row with only the fields the shared page cache's readers read. */
  participantsForThePage: (): Promise<ParticipantsForThePageReply> => allParticipantPages<ParticipantForThePage>('/api/participants?shape=page'),

  /**
   * ONE PARTICIPANT'S WHOLE PAGE, IN ONE READ. Criterion M51.
   *
   * ONE CALL AND NOT EIGHT. The page draws the registry row, whether they can be reached, the
   * contact group, the world they are a citizen of, their trips, the machines they were seen from
   * and — for an agent — who is answering as it, what it filed lately and the name proposed for it.
   * Eight routes answer parts of that, and calling all of them would read eight clocks: two halves
   * of one page could then be drawn from moments seconds apart. `whoIsWorking` above is one request
   * for the same reason.
   */
  profile: (kind: ParticipantKind, id: string) =>
    request<ProfileReply>(
      `/api/participants/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/profile`,
    ),

  /** Change a name or a state. The door decides who may; the reply is what is stored now. */
  changeParticipant: (
    kind: ParticipantKind,
    id: string,
    change: {
      name?: string
      state?: string
      stateWas?: string | null
      presence?: PresenceChoice | ''
      circle?: CircleShows | ''
      circlePicture?: string
      messageLinkLevel?: MessageLinkLevel | ''
      messageLinkLayout?: MessageLinkLayout | ''
      /** Whether a message says which project it is in. Criterion M73. */
      messageProjectMark?: MessageProjectMark | ''
      /** How a picture in a message is drawn. Criterion M64, decision rJphPkCG3l7X. */
      messagePictures?: MessagePictureChoice | ''
      /** Whether media a record points at are loaded. Criterion U5; a different setting. */
      mediaLoad?: MediaLoadChoice | ''
      /** How big the chat's own text is. Criterion M112. */
      chatTextSize?: ChatTextSize | ''
      /** When the chat circle shows, and how the chat opens. Each a person's own. */
      chatButtonStays?: ChatButtonStays | ''
      chatOpensAs?: ChatOpensAs | ''
      chatLayout?: ChatLayout | ''
      /** Which key sends a message, a person's own. */
      sendKey?: SendKeySetting | ''
      /** Which keyboard shortcuts are on, or null to go back to every one on. */
      shortcuts?: ShortcutSettings | null
      /** The person's own labels for the messages they write, in their order, unreadable with the reader's sentences, or null for none. */
      chatLabels?: TheStoredMessageLabels
      /** The person's own settings for the two shipped flags and 'No mark', or null for every default; migration 0346. */
      shippedFlags?: import('@shared/intent-mark.ts').StoredShippedFlags | null
      /** The person's look and own themes, or null for none; theirs alone (migration 0347). */
      themes?: import('@shared/own-themes.ts').TheLook | null
      language?: import('@shared/i18n.ts').Language | ''
      /** What a person writes on their own card: what they do, and which portrait is on it. P45, P47. */
      occupation?: string
      portrait?: string
      /** Which card a person holds. Criterion P46; the rule is on the door. */
      role?: string
      /**
       * SAY YOU STARTED THIS AGENT. The only value is "me": a person names themselves and nobody
       * else, because a starter has to have agreed to answer for the agent. Criterion P1.
       */
      startedBy?: 'me'
    },
  ) =>
    request<{ participant: ParticipantOnTheWire }>(
      `/api/participants/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(change) },
    ),

  /**
   * SAY HOW YOU WISH TO BE ADDRESSED. The body replaces the whole
   * field, so an empty part clears that part. The door decides who may and reads each value; this
   * sends what was typed and nothing else.
   */
  setAddressAs: (kind: ParticipantKind, id: string, parts: { [part in AddressAsPart]: string }) =>
    request<{ participant: ParticipantOnTheWire; addressAs: AddressAs; says: string }>(
      `/api/participants/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/address-as`,
      { method: 'PUT', body: JSON.stringify(parts) },
    ),

  /**
   * Send a picture, or go back to the one Mole Office drew.
   *
   * The picture goes as base64 because this server takes JSON bodies and nothing else; the note on
   * the route says why that is a decision rather than a shortcut.
   */
  sendAvatar: (kind: ParticipantKind, id: string, what: { bytes: string } | { reset: true }) =>
    request<{ participant: ParticipantOnTheWire }>(
      `/api/participants/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/avatar`,
      { method: 'POST', body: JSON.stringify(what) },
    ),

  /**
   * WHO IS WORKING ON EACH OF THESE RECORDS, IN ONE REQUEST, OVER THE CARDS ON SCREEN.
   *
   * NOT OVER THE PROJECT. A canvas showing 19 of 727 records that computed presence for the whole
   * project on every draw would do 700 records' work to draw 19 markers, and would do it again on
   * every press. The wave that asked for this said so in those words.
   *
   * TWO DIMENSIONS COME BACK AND THEY ARE NOT ONE WORD. `presence` says whether anybody is here,
   * banded from an age; `stage` says where the work stands. Nothing joins them.
   */
  presenceOnThese: (recordIds: readonly string[], projects?: ProjectChoice) =>
    request<{
      byRecord: Record<string, PresenceHere[]>
      domainsRead: number
      couldNotCheck: { what: string; because: string }[]
      note: string
    }>(`/api/work-domains/presence?records=${encodeURIComponent(recordIds.join(','))}${projects === undefined ? '' : `&${projectsQuery(projects)}`}`),

  /**
   * ONE SECRETARY'S NOTEBOOK, AND THE FOUR THINGS DONE TO IT. Criteria N1 to N4.
   *
   * The three writes take the entry's kind and its words and nothing else. Who wrote it and when
   * are written by the server from who is asking and from the clock, so there is nothing here for a
   * page to fill in and nothing a page could get wrong.
   */
  notebook: (handle: string) => request<TheNotebookRead>(`/api/agents/${encodeURIComponent(handle)}/notebook`),
  addANotebookEntry: (handle: string, entry: { entryKind: string; text: string }) =>
    request<TheNotebookRead>(`/api/agents/${encodeURIComponent(handle)}/notebook/entries`, {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
  changeANotebookEntry: (handle: string, entryId: string, change: { entryKind?: string; text?: string }) =>
    request<TheNotebookRead>(
      `/api/agents/${encodeURIComponent(handle)}/notebook/entries/${encodeURIComponent(entryId)}`,
      { method: 'PATCH', body: JSON.stringify(change) },
    ),
  removeANotebookEntry: (handle: string, entryId: string) =>
    request<TheNotebookRead>(
      `/api/agents/${encodeURIComponent(handle)}/notebook/entries/${encodeURIComponent(entryId)}`,
      { method: 'DELETE' },
    ),

  /**
   * RETIRE AN AGENT. Problem zyCcJYCLsAe7. The person's press, or the agent's own starter's.
   *
   * The row is kept and reads retired; nothing is deleted, and the handle is free again for a new agent.
   */
  retireThisAgent: (handle: string, because: string) =>
    request<{ agent: unknown }>(`/api/participants/agent/${encodeURIComponent(handle)}/retire`, {
      method: 'POST',
      body: JSON.stringify({ because }),
    }),

  /**
   * EVERY OVERLAP BETWEEN EVERY PAIR OF OPEN WORK DOMAINS, as that thread computes them.
   *
   * IT ANSWERS ABOUT NOW. It takes no window and echoes none, which is why the Usage page draws no
   * hotspot rows from it: current state under a heading about a range would be history that is not
   * history, with nothing failing anywhere.
   */
  workDomainOverlaps: () => request<unknown>('/api/work-domains/overlaps'),
}
