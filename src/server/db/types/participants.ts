// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/participants.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged.
 */

import type { PixelScale } from '@shared/pixel-scale.ts'
import type { PixelAppearance } from '@shared/pixel-office.ts'
import type { Elevation, WhoChoseTheCard } from '@shared/roles.ts'
import type { Language, MessageProjectMark, ChatButtonStays, ChatOpensAs, ChatLayout, ChatTextSize, CircleShows, MessageLinkLayout, MessageLinkLevel, ParticipantRef, PresenceChoice, SendKeySetting, ShortcutSettings } from '@shared/participants.ts'
import type { AddressAs, AddressAsSetBy } from '@shared/address-as.ts'
import type { MessagePictureChoice } from '@shared/messagepictures.ts'
import type { MediaLoadChoice } from '@shared/mediaload.ts'
import type { TheStoredMessageLabels } from '@shared/message-label.ts'
import type { StoredShippedFlags } from '@shared/intent-mark.ts'

/** One durable agent as the registry holds it. */
export interface RegisteredAgent {
  pixelScale?: PixelScale | null
  pixelAppearance?: PixelAppearance | null

  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /**
   * Who set the state line, or null because nobody recorded it.
   *
   * Null is not "the agent set it": it is what every row written before criterion M21 holds, and
   * naming a setter nobody wrote down would be inventing a record of an act nobody witnessed.
   */
  stateBy: ParticipantRef | null
  /** The runtime word when this product has an adapter for it, or null because the record names none it has. */
  runtime: string | null
  /**
   * THE HARNESS THE AGENT'S RECORD NAMES, as stored, or null because it names none. Any harness's word: for one with
   * no adapter, `runtime` is null and this still says which harness serves the agent.
   */
  harness: string | null
  /**
   * Who started this agent, or null because nobody recorded one.
   *
   * NULL IS NOT "THE PERSON STARTED IT". It is what every row registered before 6 September 2026
   * holds and what an agent a person registered by hand holds. Reading the absence as the owner
   * would make 199 unregistered writers the person's own children on the strength of a missing value.
   */
  startedBy: ParticipantRef | null
  /** The agent responsible for this agent, kept separately from its starter. */
  ownerId: string | null
  ownerKind: string | null
  /**
   * The word on the role card this agent holds, or null because nobody set one.
   *
   * A row with null here is READ AS a worker — `A_ROW_WITH_NO_ROLE_READS_AS` in shared/roles.ts is
   * the one place that says so — and a screen says "no role set" rather than drawing that word,
   * because nobody chose it.
   */
  role: string | null
  /**
   * WHO CHOSE THAT CARD, as it is stored, or null because nobody recorded it. Criterion P75.
   *
   * NULL IS NOT "THE RULE CHOSE IT". It is what every row registered before 8 September 2026 holds,
   * and the word on such a row may have been a starter's choice or may be the word the row was read
   * as. A screen says nobody recorded it; nothing infers which.
   */
  cardChosenBy: WhoChoseTheCard | null
  /**
   * The person's say that this agent may act for them, as it is stored, or null because they never
   * said. Criterion P59.
   *
   * A GRANT THAT HAS ENDED IS STILL HERE, with `endedAt` set. Whether it still HOLDS is a different
   * question — it asks the clock and asks whether this card can hold one at all — and
   * `theElevationHeldBy` in lib/elevation.ts is what answers it. Nothing decides a refusal from this
   * field directly.
   */
  elevation: Elevation | null
  /** Every grant they ever made to this agent, oldest first. Empty because they never made one. */
  everyElevation: Elevation[]
  /**
   * The folders and files this agent was started to change, or null because nobody recorded any.
   *
   * Null and an empty list are different answers. Null is nobody recorded one; an empty list is
   * somebody saying there is no area. Criterion P43.
   */
  workArea: string[] | null
  /**
   * The record whose end ends this role, or null because nobody said. Criterion P15.
   *
   * Null is never read as "there is no end": it is read as nobody having named one, and an agent
   * with none is never retired by the rule that reads it.
   */
  startedFor: string | null
  /** The session record of the run that registered this agent, or null because nobody recorded one. */
  startedByRun: string | null
  retired: boolean
  retiredBecause: string | null
  /**
   * WHEN IT WAS RETIRED AND BY WHOM, and null on a row that is not retired.
   *
   * Null on a RETIRED row is a real answer as well: every row retired before the retire door existed
   * was retired by the release of a claim, and nobody recorded the moment or the hand.
   */
  retiredAt: string | null
  retiredBy: ParticipantRef | null
  createdAt: string
  /** The world it is a citizen of, or null because nobody could say. */
  homeWorld: string | null
  /** The installation that world belongs to, or null because nobody could say. */
  homeInstallation: string | null
  /** When it became a citizen, which is when it was registered. Null exactly when `homeWorld` is. */
  citizenSince: string | null
  /**
   * THE VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or null because it needed none. P69.
   *
   * Null is the ordinary answer and means this machine: a registration made here needs no
   * credential, and one made from elsewhere cannot be written without one. So null says "none was
   * needed" and never "nobody looked".
   */
  credential: string | null
  /**
   * HOW THIS AGENT WISHES TO BE ADDRESSED. A part left out is a
   * part nobody has set; an empty object is an agent that has set none.
   */
  addressAs: AddressAs
  /** Who last set `addressAs`, and when, or null because nobody recorded it. */
  addressAsSetBy: AddressAsSetBy
}

/** One person as the registry holds it. */
export interface RegisteredPerson {
  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /** What they said about whether they are here, or null because they have never said. */
  presenceChoice: PresenceChoice | null
  /** When they said it. Null exactly when `presenceChoice` is null. */
  presenceChoiceAt: string | null
  /**
   * How they want the number on the chat circle drawn, or null because they have never chosen.
   *
   * Null is read as `CIRCLE_BEFORE_ANYBODY_CHOOSES` by whatever draws it, and it is not the same
   * fact as having chosen that word. Criterion M32.
   */
  circleShows: CircleShows | null
  /**
   * Which picture they put on the round chat button, or null because they never chose. Criterion
   * M38; with null, the page draws mole-at-the-sill in both looks.
   */
  circlePicture: string | null
  /**
   * Which name a record named in a message is drawn under: `label`, `title`, or null because they
   * have never chosen. Criterion M47; null is read as `MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES`.
   */
  messageLinkLevel: MessageLinkLevel | null
  /**
   * How a link in a message is laid out in the bubble: `own-line`, `inline`, or null because they
   * have never chosen. Criterion M48; null is read as `MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES`.
   */
  messageLinkLayout: MessageLinkLayout | null
  /**
   * Whether a message says which project it is in: `always`, `never`, or null because they have
   * never chosen. Criterion M73; null is read as `MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES`.
   */
  messageProjectMark: MessageProjectMark | null
  /**
   * How a picture in a message is drawn: `shown`, `pressed`, `path`, or null because they have
   * never chosen. Criterion M64, moved off the browser by a decision; null is read as
   * `MESSAGE_PICTURE_BY_DEFAULT`.
   */
  messagePictures: MessagePictureChoice | null
  /**
   * Whether media a record points at are loaded: `with-page`, `never`, `on-press`, or null because
   * they have never chosen. Criterion U5; null is read as `MEDIA_LOAD_BY_DEFAULT`.
   *
   * IT IS NOT `messagePictures` ABOVE. That one is about a picture inside a chat message and answers
   * `shown`, `pressed` or `path`; this one is about media a report points at.
   */
  mediaLoad: MediaLoadChoice | null
  /**
   * How big the chat's own text is: `small`, `normal`, `large`, or null because they have never
   * chosen. Criterion M112; null is read as `CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES`.
   */
  chatTextSize: ChatTextSize | null
  /**
   * Which key sends a message: `shift-or-alt-enter` or `enter`, or null because they have never
   * chosen. Null is read as `SEND_KEY_BEFORE_ANYBODY_CHOOSES`.
   */
  sendKey: SendKeySetting | null
  /**
   * Which keyboard shortcuts are on, or null because they have never chosen,
   * at item 5. Null is read as `SHORTCUTS_BEFORE_ANYBODY_CHOOSES`, every shortcut on.
   */
  shortcuts: ShortcutSettings | null
  /**
   * When the chat circle shows: `when-unread`, `always`, or null because they have never chosen. Null
   * is read by `chatButtonStaysBeforeAnybodyChooses` according to the reader kind.
   */
  chatButtonStays: ChatButtonStays | null
  /**
   * How the chat opens: `split` (beside the page), `window`, or null because they have never chosen.
   * Null is read as `CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES`.
   */
  chatOpensAs: ChatOpensAs | null
  /** The chosen column layout, or null to follow the available width. */
  chatLayout: ChatLayout | null
  /**
   * The mode the person starts in while their browser has stored none: `inspect`, Developer mode, for a
   * person the office made, or null for a person made before the column, read as Normal mode. Migration 0354.
   */
  startingMode: 'inspect' | null
  /** The person's own labels for the messages they write, unreadable with the reader's sentences, or null because they have never made one. Migration 0341. */
  chatLabels: TheStoredMessageLabels
  /** The person's own settings for the four shipped flags and 'No mark', or null because they changed none. Migration 0346. */
  shippedFlags: StoredShippedFlags | null
  language: Language | null
  createdAt: string
  /** The world they are a citizen of, or null because nobody could say. */
  homeWorld: string | null
  /** The installation that world belongs to, or null because nobody could say. */
  homeInstallation: string | null
  /** When they became a citizen, which is when they were registered. Null exactly when `homeWorld` is. */
  citizenSince: string | null
  /**
   * WHICH ROLE CARD THEY HOLD, one word from `personCards` in design/permissions/roles.json, or null
   * because nobody wrote one. Criterion P45. Null is read as `A_PERSON_WITH_NO_ROLE_READS_AS`, and a
   * screen says no role set rather than drawing a word nobody chose.
   */
  role: string | null
  /**
   * WHAT THEY DO, in their own words, or null because nobody has written one. Criterion P45. It is
   * theirs to write and nothing checks it; the role above is where they stand in the Office.
   */
  occupation: string | null
  /**
   * WHICH PORTRAIT IS ON THEIR CARD, by the address it is served at, or null because they have not
   * chosen. Criterion P47. Null is not "no picture": the card's own portrait is drawn instead.
   */
  portrait: string | null
  /**
   * HOW THIS PERSON WISHES TO BE ADDRESSED. A part left out is a
   * part nobody has set; an empty object is a person who has set none.
   */
  addressAs: AddressAs
  /** Who last set `addressAs`, and when, or null because nobody recorded it. */
  addressAsSetBy: AddressAsSetBy
}

export type ReadAll = { all: (...args: unknown[]) => unknown[] }

/** The fields of a participant stored on its registry row as they are, which the plugins' roster carries. */
export type WhoAnAgentIs = Pick<RegisteredAgent, 'id' | 'handle' | 'name' | 'role' | 'retired' | 'credential' | 'startedBy' | 'createdAt'>
