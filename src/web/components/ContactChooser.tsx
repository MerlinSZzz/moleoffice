// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'
import { currentMode } from '../lib/mode.ts'
/**
 * THE CONTACTS, GROUPED, AND THE ARRANGING OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * The chat drew this list; the right-click panel offers the same contacts, and drawing the same
 * contacts means drawing ONE LIST and not two buildable lists. Under
 * criterion W4 of design/ui-words/ACCEPTANCE.md, the right-click panel's chooser offers the
 * same contacts the chat offers — people and registered agents, never a session — so the chooser
 * is one component both draw. The lift was whole: facesInAGroup, theNameOfAContact,
 * ContactsInGroups, TheAgentsItStarted, One contact row and the inline-marker reader moved here
 * exactly as they were in Chat.tsx. Chat.tsx imports them; nothing was rewritten.
 *
 * THE STYLESHEET still lives at the foot of Chat.tsx and it carries these classes, whichever
 * system draws them.
 */

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CHAT_WORDS,
  firstWordsOfAMessage,
  whenAContactLastSpoke,
  participantKey,
  unregisteredName,
  type UnregisteredWriter,
} from '@shared/messages.ts'
import { isMoleOffice, MOLE_OFFICE_NAME, type ParticipantKind } from '@shared/participants.ts'
import { theLastLineInWords } from '@shared/short-lists.ts'
import { useTheLineWithItsLinksInWords } from './ChatLinks.tsx'
import {
  groupHeading,
  groupHeadingIs,
  theRowsOnTopInDrawnOrder,
  theRowsOnTopOfOneGroup,
  theTypedWordsFindAContact,
  type ContactGroup,
  type ContactSide,
} from '@shared/contacts.ts'
import { GROUP_WORDS, type GroupMemberOnTheWire } from '@shared/groups.ts'
import type { PoolEntry } from '../api.ts'
import type { WorkspaceReading } from '@shared/workspaces.ts'
import { ProjectMarks } from './ProjectMarks.tsx'
import { PersonalAgentMarks } from './PersonalAgentTags.tsx'
import type { PersonalAgentMark } from '@shared/agent-tags.ts'
import {
  api,
  errorMessage,
  type ContactLineOnTheWire,
  type ParticipantOnTheWire,
  type ShortContactLine,
  type PresenceOnTheWire,
} from '../api.ts'
import { Avatar } from './Avatar.tsx'
import { inlinePieces } from '@shared/inline.ts'
import { SleepLine } from './SleepLine.tsx'
import { TheDutyLine } from './ChatDuty.tsx'

/**
 * THE FACES A GROUP DRAWS: its members, with a retired agent left out.
 *
 * Criterion M114: a retired agent is not shown on the chat page. A retired
 * agent is still a member of every group it joined — `membersOf` on the server still answers with it,
 * a message to the group still carries a delivery row for it, and the lines it wrote in the group
 * still name it — so nothing here is less of the record. It leaves the retired agent out of the
 * faces, exactly as a group of nine already draws only four of them.
 *
/**
 * THE ONE DOT THAT SAYS WHETHER SOMEBODY CAN BE REACHED, criterion M20.
 *
 * EXPORTED FOR THE PROFILE PAGE (criterion M51), which draws the same reading beside the same name.
 * A second dot written there would be the colour rule decided twice, and the two would disagree the
 * first time somebody changed one — the defect CLAUDE.md names.
 */
export function Dot({ reading }: { reading: PresenceOnTheWire | undefined }) {
  // NOT READ YET: the dot is drawn without a colour, and not grey, because grey says that nothing is serving them.
  if (reading === undefined) return <span className="px-chat-dot" data-colour="none" aria-hidden="true" />
  return <span className="px-chat-dot" data-colour={reading.colour} title={reading.word} aria-label={reading.word} role="img" />
}

/** Only the registry fields a contact row draws, and the handle the filter box finds an agent's row by. */
export type ContactParticipant = Pick<ParticipantOnTheWire, 'kind' | 'id' | 'name' | 'handle' | 'avatarUrl' | 'retiredAt' | 'newerOfASharedName' | 'role'>

/**
 * THE FACES A GROUP DRAWS: its members, with a retired agent left out.
 *
 * Criterion M114: a retired agent is not shown on the chat page. A retired
 * agent is still a member of every group it joined — `membersOf` on the server still answers with it,
 * a message to the group still carries a delivery row for it, and the lines it wrote in the group
 * still name it — so nothing here is less of the record. It leaves the retired agent out of the
 * faces, exactly as a group of nine already draws only four of them.
 *
 * IT READS ONLY EACH MEMBER'S `who`, so it takes a whole member or the short one the page's groups
 * list carries (src/shared/short-lists.ts), and hands back the same kind it was given.
 *
 * THE COUNT BESIDE THE FACES IS THE WHOLE MEMBERSHIP and is not filtered with them. A retired agent
 * is in the group, and that number is the number of members rather than the number of pictures.
 */
export function facesInAGroup<M extends Pick<GroupMemberOnTheWire, 'who'>>(
  members: readonly M[],
  everybody: ReadonlyMap<string, Pick<ParticipantOnTheWire, 'retired'>>,
): M[] {
  return members.filter((member) => everybody.get(participantKey(member.who))?.retired !== true)
}

/** The name a contact row carries, whichever shape it is. The filter narrows on this and on an agent's handle. */
export function theNameOfAContact(
  line: Pick<ContactLineOnTheWire, 'who' | 'unregistered'>,
  everybody: ReadonlyMap<string, Pick<ParticipantOnTheWire, 'name'>>,
): string {
  if (line.who === null) return unregisteredName(line.unregistered ?? { typed: null, said: null })
  return everybody.get(participantKey(line.who))?.name ?? (currentMode() === 'inspect' ? line.who.id : unregisteredName({ typed: null, said: line.who }))
}

/**
 * WHETHER WHAT WAS TYPED FINDS A CONTACT ROW: by the name the row draws, or, for an agent, by its handle. Every filter
 * box over the chat's contacts reads this, and the contact list door finds rows by the same rule
 * (`theTypedWordsFindAContact`), so the same words find the same rows on the panel and on the server.
 */
export function theTypedWordsFindARow(
  line: Pick<ContactLineOnTheWire, 'who' | 'unregistered'>,
  everybody: ReadonlyMap<string, Pick<ParticipantOnTheWire, 'name' | 'handle'>>,
  typed: string,
): boolean {
  const one = line.who === null ? undefined : everybody.get(participantKey(line.who))
  return theTypedWordsFindAContact({ kind: line.who?.kind ?? null, name: theNameOfAContact(line, everybody), handle: one?.handle }, typed)
}

/**
 * THE NAME A ROW DRAWS, WITH ITS RETIREMENT DATE WHERE IT HAS ONE. Criterion I4.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NAME IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * An agent keeps its name when it is retired, and a live agent may bear the same name. Two rows
 * that read the same tell a reader nothing about which agent is which, so the retired one carries
 * its retirement date beside its name. This is the same answer the recipient picker gives when two
 * candidates would read alike — it draws them whole rather than leaving two rows nobody can tell
 * apart (`namesInList` in src/web/components/agent/Recipients.tsx) — with the date as the fact that
 * tells a retired agent from a live one.
 *
 * THE ID IS NOT A NAME. `fallback` is drawn only where no registry row answers, so a row with
 * nothing to name it says which participant it is rather than printing a handle as a second name
 * (Appearance.tsx's rule).
 *
 * A NULL DATE ADDS NOTHING. A row retired before the date was recorded has a state and no date,
 * and inventing one would be the guess this product refuses.
 */
export function theNameBesideItsDate(name: string, retiredAt: string | null | undefined): string {
  return retiredAt === null || retiredAt === undefined || retiredAt === ''
    ? name
    : t('chat.retiredName', { name, at: retiredAt })
}

/**
 * THE CONTACTS LIST, IN TWO LOCKED TOP GROUPS. Criteria M119 to M124:
 * the first level is Human and Agent, they do not mix and cannot be renamed;
 * under each sit the second-level groups; under Agent the default arrangement is by role; every
 * group folds, with retired folded by default and the fold kept on the server; the New agent press
 * sits beside the Agent heading and a grey placeholder beside Human; an Edit entry at the right of
 * each heading opens the arrangement for that side alone; and a filter box narrows the list by name.
 *
 * NOTHING HERE DECIDES WHERE ANYBODY SITS. The server worked out the side, the group and the order,
 * and this draws them.
 *
 * IT DRAWS THE FIRST ROWS OF THE LIST, AS MANY AS THE PANEL HAS READ. The chat reads the first screen of contacts, and
 * more as the person scrolls, which a decision wants. The list is drawn in its order as far as
 * the last row read, and the end of the rows drawn reads the next page when it is scrolled into view (`onMore`). A
 * group after that row is not drawn until its rows are read, so no group says it is empty when nobody has looked.
 */
/** Keep the rows until their fold has closed, so the groups below move with its height. */
function ContactMotionFold({open,children}:{open:boolean;children:React.ReactNode}) {
  const [present,setPresent]=useState(open)
  const held=useRef(children)
  if(open)held.current=children
  useLayoutEffect(()=>{
    if(open){setPresent(true);return}
    const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()
    const duration=Number.parseFloat(value)*(value.endsWith('ms')?1:1000)
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||duration===0){setPresent(false);return}
    const timer=window.setTimeout(()=>setPresent(false),duration)
    return ()=>window.clearTimeout(timer)
  },[open])
  return <div className="px-contact-motion-fold" data-open={open?'yes':'no'} aria-hidden={open?undefined:true} inert={!open}>
    <div className="px-contact-motion-inside">{present?(open?children:held.current):null}</div>
  </div>
}

export function ContactsInGroups({
  contacts,
  groups,
  sides,
  everybody,
  readingOf,
  arranging,
  draftFor,
  now,
  onArranging,
  onNewAgent,
  onChanged,
  onTalkTo,
  onOpenUnregistered,
  known = [],
  narrowed = false,
  filter,
  rowsIn,
  left,
  inTheList,
  onMore,
}: {
  /** The rows the panel holds: the first rows of the list as it is drawn, with the rows folded under them. */
  contacts: readonly ShortContactLine[]
  groups: readonly ContactGroup[]
  /** The two locked top groups, with the fold state the person set on each. Criterion M121. */
  sides: readonly { key: ContactSide; name: string; collapsed: boolean }[]
  everybody: ReadonlyMap<string, ContactParticipant>
  readingOf: (who: { kind: ParticipantKind; id: string }) => PresenceOnTheWire | undefined
  /** The side whose arrangement is open, or null because none is. Criterion M123. */
  arranging: ContactSide | null
  /** What is waiting unsent in one row's conversation, or null. Criterion M99's pencil. */
  draftFor: (line: ShortContactLine) => string | null
  /** The clock every row's time is read against. */
  now: string
  onArranging: (side: ContactSide | null) => void
  /** Open the one chooser for summoning an agent. Criterion M122. */
  onNewAgent: () => void
  onChanged: () => void
  onTalkTo: (who: { kind: ParticipantKind; id: string }) => void
  onOpenUnregistered: (writer: UnregisteredWriter) => void
  /**
   * Every project the office lists, for the names on each row's project mark. Left out, no
   * list of projects has been read, and no row draws a mark.
   */
  known?: readonly WorkspaceReading[]
  /** Whether `contacts` is narrowed to one project. A group with nothing in that project is then not drawn. */
  narrowed?: boolean
  /** What is typed in the filter box, which the panel draws above the list, because the door is asked for the same words. */
  filter: string
  /** How many rows each group holds under the narrowings, by the door's count. A folded group draws none of them. */
  rowsIn: Readonly<Record<string, number>>
  /** How many rows drawn on top come after the last one the panel holds. */
  left: number
  /** How many rows the list holds under the project chosen, read or not. None says there are no contacts. */
  inTheList: number
  /** Read the next page. Null while the rows held were read under other words than the ones typed. */
  onMore: (() => void) | null
}) {
  useLanguage()
  const [fault, setFault] = useState<string | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const run = (what: Promise<unknown>): void => {
    setFault(null)
    void what.then(onChanged).catch((err: unknown) => setFault(errorMessage(err)))
  }

  // THE FILTER NARROWS BY NAME AS ONE TYPES, criterion M124: a reader who searches types into the box, and one who
  // looks down the list by hand needs no box in the way.
  // The box is the panel's, in the row above the list that is hidden until a scroll up shows it (wave 13y round 113,
  // item 45). It matches the name a row draws, registered or not, and an agent's handle. The rows held are narrowed
  // here at once, by the rule the door narrows with; the panel asks the door for the same words a moment later, which
  // finds the rows it has not read.
  const shown = contacts.filter((line) => theTypedWordsFindARow(line, everybody, filter))
  const narrowedAtAll = filter.trim() !== '' || narrowed
  // WHERE THE ROWS HELD END: the group of the last row drawn on top, while more rows come after it. Nothing after that
  // group is drawn, and the end of its rows reads the next page.
  const onTopHeld = theRowsOnTopInDrawnOrder(shown, groups, sides)
  const last = left > 0 ? groups.find((one) => one.key === onTopHeld.at(-1)?.row.group) : undefined
  const lastSide = last === undefined ? -1 : sides.findIndex((one) => one.key === last.side)
  const groupsDrawn = (side: ContactSide): ContactGroup[] => {
    const itsGroups = groups.filter((one) => one.side === side)
    if (last === undefined || side !== last.side) return itsGroups
    return itsGroups.slice(0, itsGroups.findIndex((one) => one.key === last.key) + 1)
  }

  /** The field for a new group's name, or for one group's new name. */
  const theNamingField = (onMake: (name: string) => Promise<unknown>): React.JSX.Element => (
    <span className="px-chat-naming">
      <input
        type="text"
        className="px-chat-name-field"
        value={typed}
        autoFocus
        placeholder={t('chat.contact.newGroupPlaceholder')}
        onChange={(event) => setTyped(event.target.value)}
      />
      <button
        type="button"
        disabled={typed.trim() === ''}
        onClick={() => {
          run(onMake(typed))
          setNaming(null)
          setTyped('')
        }}
      >
        {t('chat.contact.makeIt')}
      </button>
      <button type="button" onClick={() => setNaming(null)}>
        {t('chat.contact.leaveTheName')}
      </button>
    </span>
  )

  /** One second-level group: its heading, its fold, and the contacts under it. */
  const oneGroup = (group: ContactGroup): React.JSX.Element | null => {
    const inGroup = shown.filter((line) => line.group === group.key)
    // A FOLDED GROUP HOLDS ROWS THE PANEL HAS NOT READ, because its fold draws none of them; the door counts them.
    // Every other group drawn holds all its rows, except the last, which holds at least one.
    const holds = group.collapsed ? (rowsIn[group.key] ?? 0) : inGroup.length
    // A GROUP WITH NOBODY IN IT IS NOT DRAWN, except while its side is being arranged, where it can be renamed and
    // moved and somebody can be moved into it. Wave 13y round 113: a heading over a lone dash was a line that said
    // nothing.
    // AND WHEN A FILTER IS ON, A GROUP WITH NOTHING MATCHING IS NOT DRAWN EVEN THEN. An empty heading saying "nobody
    // is in this group" over a filter that is hiding them would be a false sentence. THE SAME FOR THE PROJECT CHOSEN
    // ABOVE THE LIST (wave 13n, 8 October): the rows it leaves out are still there.
    if (holds === 0 && (narrowedAtAll || arranging !== group.side)) return null
    // WHO IS FOLDED UNDER WHOM. Criterion P10: their list holds the secretary and every agent they have
    // spoken to; every other registered agent sits under the agent that started it, one press away.
    // The server decides which — `foldedUnder` on the row — and this only draws it, by the rule the door
    // pages the list with (`theRowsOnTopOfOneGroup`). A row whose starter is not in this group stays where
    // it is rather than disappearing.
    const onTop = theRowsOnTopOfOneGroup(shown, group.key)
    // ONLY THE GROUPS ON THIS CONTACT'S OWN SIDE can be offered, so the chooser never offers a move
    // the server would refuse. Criterion M119.
    const itsSide = groups.filter((one) => one.side === group.side)
    return (
      <section key={group.key} className="px-chat-group-of" data-group={group.key} data-side={group.side}>
        <h4 className="px-chat-group-name">
          {naming === group.key ? (
            theNamingField((name) => api.changeAContactGroup(group.key, { name }))
          ) : (
            <>
              {/* THE FOLD IS THE PERSON'S AND LIVES ON THE SERVER, criterion M121. Pressing it writes
                  the state and the panel reads it back, so the same fold holds on every machine. */}
              <button
                type="button"
                className="px-chat-fold"
                aria-expanded={!group.collapsed}
                aria-label={groupHeading(group)}
                onClick={() => run(api.changeAContactGroup(group.key, { collapsed: !group.collapsed }))}
              >
                <span className="px-chat-fold-arrow" aria-hidden="true">
                  ▸
                </span>
              </button>
              <span className="px-chat-group-words" data-heading-is={groupHeadingIs(group)}>{groupHeading(group)}</span>
              {/* NO COUNT ON A GROUP HEADING. Criterion M123: no unread count is shown. The
                  number a reader needs is on the contact row and on the tab, which is where it was. */}
              {arranging !== group.side ? null : (
                <span className="px-chat-group-presses">
                  <button
                    type="button"
                    title={t('chat.contact.rename')}
                    onClick={() => {
                      setTyped(group.name)
                      setNaming(group.key)
                    }}
                  >
                    {t('chat.contact.rename')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('chat.contact.moveUp')}
                    title={t('chat.contact.moveUp')}
                    onClick={() => run(api.changeAContactGroup(group.key, { moveBy: -1 }))}
                  >
                    {UP}
                  </button>
                  <button
                    type="button"
                    aria-label={t('chat.contact.moveDown')}
                    title={t('chat.contact.moveDown')}
                    onClick={() => run(api.changeAContactGroup(group.key, { moveBy: 1 }))}
                  >
                    {DOWN}
                  </button>
                </span>
              )}
            </>
          )}
        </h4>
        <ContactMotionFold open={!group.collapsed}>{inGroup.length === 0 ? (
          // AN EMPTY GROUP IS DRAWN ONLY WHILE IT IS ARRANGED, and its heading is what shows it is empty. The sentence
          // saying so is still read out, because a heading followed by silence says nothing to a screen reader.
          <p className="px-chat-group-empty">
            <ReadOutOnly sentence={t('absence.none')} />
          </p>
        ) : (
          <ul className="px-chat-list">
            {onTop.map(({ row: line, started }, at) => (
              <Fragment key={line.key}>
                <ContactRow
                  line={line}
                  everybody={everybody}
                  readingOf={readingOf}
                  arranging={arranging === group.side}
                  groups={itsSide}
                  first={at === 0}
                  last={at === onTop.length - 1}
                  draft={draftFor(line)}
                  now={now}
                  known={known}
                  onMove={(what) => run(api.placeAContact(line.key, what))}
                  onTalkTo={onTalkTo}
                  onOpenUnregistered={onOpenUnregistered}
                />
                <TheAgentsItStarted
                  starter={line}
                  started={started}
                  everybody={everybody}
                  readingOf={readingOf}
                  groups={itsSide}
                  draftFor={draftFor}
                  now={now}
                  known={known}
                  onMove={(key, what) => run(api.placeAContact(key, what))}
                  onTalkTo={onTalkTo}
                  onOpenUnregistered={onOpenUnregistered}
                />
              </Fragment>
            ))}
            {group.key !== last?.key || onMore === null ? null : <TheRestOfTheList key={onTopHeld.length} onReached={onMore} />}
          </ul>
        )}</ContactMotionFold>
      </section>
    )
  }

  return (
    <>
      {fault === null ? null : (
        <p className="px-chat-arrange-fault" role="status">
          {fault}
        </p>
      )}

      {sides.filter((_, at) => lastSide < 0 || at <= lastSide).map((side) => (
        <section key={side.key} className="px-chat-top-group" data-side={side.key}>
          <h3 className="px-chat-top-heading">
            <button
              type="button"
              className="px-chat-fold"
              aria-expanded={!side.collapsed}
              aria-label={t(side.key === 'human' ? 'chat.contact.human' : 'chat.contact.agent')}
              onClick={() => run(api.changeAContactGroup(side.key, { collapsed: !side.collapsed }))}
            >
              <span className="px-chat-fold-arrow" aria-hidden="true">
                ▸
              </span>
            </button>
            <span className="px-chat-top-name">{t(side.key === 'human' ? 'chat.contact.human' : 'chat.contact.agent')}</span>
            {/* THE NEW AGENT PRESS, BESIDE THE AGENT HEADING. Criterion M122: it moved here from the
                panel's own header, and the header one is gone. Criterion M115's chooser is unchanged;
                only the press that opens it moved. */}
            {side.key === 'agent' ? (
              <button type="button" className="px-chat-new-agent" onClick={onNewAgent}>
                {t('chat.contact.newAgent')}
              </button>
            ) : (
              // THE GREY PLACEHOLDER BESIDE HUMAN. Criterion M122. It is
              // disabled, and its tooltip is the sentence saying it is not built yet.
              <button
                type="button"
                className="px-chat-new-agent-placeholder"
                disabled
                title={t('chat.contact.newAgentPlaceholderTitle')}
              >
                {t('chat.contact.newAgentPlaceholder')}
              </button>
            )}
            {/* THE EDIT ENTRY, AT THE RIGHT OF THE HEADING. Criterion M123: it opens the arrangement
                for this side alone. The Arrange press that used to sit above the list is gone. */}
            <button
              type="button"
              className="px-chat-edit"
              aria-pressed={arranging === side.key}
              onClick={() => {
                setNaming(null)
                onArranging(arranging === side.key ? null : side.key)
              }}
            >
              {arranging === side.key ? t('chat.contact.doneEditing') : t('chat.contact.edit')}
            </button>
          </h3>

          <ContactMotionFold open={!side.collapsed}>
            <>
              {arranging !== side.key ? null : (
                <div className="px-chat-arrange">
                  {naming === `new:${side.key}` ? (
                    theNamingField((name) => api.makeAContactGroup(name, side.key))
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTyped('')
                        setNaming(`new:${side.key}`)
                      }}
                    >
                      {t('chat.contact.addAGroup')}
                    </button>
                  )}
                </div>
              )}
              {groupsDrawn(side.key).map((group) => oneGroup(group))}
            </>
          </ContactMotionFold>
        </section>
      ))}

      {inTheList === 0 ? <p className="px-chat-empty"><ReadOutOnly sentence={CHAT_WORDS.noContacts} /></p> : null}
    </>
  )
}

/**
 * AN EMPTY LIST OR CONVERSATION IN THE CHAT, DRAWN AS NOTHING AND READ OUT AS A SENTENCE. Wave 13y round 113: the chat
 * drew a lone dash in each of these places, and a dash said nothing to the person looking at it. The blank says it
 * now. The sentence the dash carried as its hover text is still read out, because a list that is silent to a screen
 * reader is the blank the dash was drawn to avoid.
 */
export function ReadOutOnly({ sentence }: { sentence: string }): React.JSX.Element {
  return <span className="px-sr">{sentence}</span>
}

/**
 * THE END OF THE ROWS DRAWN WHILE THE LIST HOLDS MORE. Scrolled into view, it reads the next page. Round 9 of wave 13x
 * drew a group's rows thirty at a time this way, because a group of a thousand agents drew a thousand rows and the
 * panel read a dot for each of them; round 20 of wave 13u reads them a page at a time as well.
 * It is drawn again with a new key each time more rows are held, so it is watched again from where it now stands.
 */
function TheRestOfTheList({ onReached }: { onReached: () => void }): React.JSX.Element {
  const end = useRef<HTMLLIElement>(null)
  const reached = useRef(onReached)
  reached.current = onReached
  useEffect(() => {
    const node = end.current
    if (node === null) return
    const watching = new IntersectionObserver((seen) => {
      if (seen.some((one) => one.isIntersecting)) reached.current()
    })
    watching.observe(node)
    return () => watching.disconnect()
  }, [])
  return <li ref={end} className="px-chat-more-rows" aria-hidden="true" />
}

/**
 * THE AGENTS ONE AGENT STARTED, FOLDED UNDER IT. Criterion P10.
 *
 * Under the message-pool plan, every started agent is registered, its reports go to its
 * starter's conversation, and those conversations are folded under the starter rather than sitting
 * in their contact list. One press opens them.
 *
 * NOTHING IS HIDDEN AND NOTHING IS LOST. The heading says how many are inside before it is opened,
 * and every row inside is the ordinary contact row with the ordinary way to write to it. An agent
 * that writes to them stops being folded, because they can answer it — the server decides that and
 * this only draws what it decided.
 *
 * IT DRAWS NOTHING WHEN NOTHING IS FOLDED, rather than an empty fold saying a starter has no
 * children. A starter with none looks exactly like every other contact, which is what it is.
 */
function TheAgentsItStarted({
  starter,
  started,
  everybody,
  readingOf,
  groups,
  draftFor,
  now,
  known,
  onMove,
  onTalkTo,
  onOpenUnregistered,
}: {
  starter: ShortContactLine
  started: readonly ShortContactLine[]
  everybody: ReadonlyMap<string, ContactParticipant>
  readingOf: (who: { kind: ParticipantKind; id: string }) => PresenceOnTheWire | undefined
  groups: readonly ContactGroup[]
  draftFor: (line: ShortContactLine) => string | null
  now: string
  known: readonly WorkspaceReading[]
  onMove: (key: string, what: { group: string } | { moveBy: -1 | 1 }) => void
  onTalkTo: (who: { kind: ParticipantKind; id: string }) => void
  onOpenUnregistered: (writer: UnregisteredWriter) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (started.length === 0) return null
  const unread = started.reduce((sum, one) => sum + one.unread, 0)
  return (
    <li className="px-chat-folded" data-px-folded-under={starter.key}>
      <button
        type="button"
        className="px-chat-fold-press"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="px-chat-fold-arrow" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {t('chat.startedAgentCount', { n: started.length })}
        {unread > 0 ? <span className="px-chat-unread">{unread}</span> : null}
      </button>
      {!open ? null : (
        <ul className="px-chat-list px-chat-fold-list">
          {started.map((line, at) => (
            <ContactRow
              key={line.key}
              line={line}
              everybody={everybody}
              readingOf={readingOf}
              arranging={false}
              groups={groups}
              first={at === 0}
              last={at === started.length - 1}
              draft={draftFor(line)}
              now={now}
              known={known}
              onMove={(what) => onMove(line.key, what)}
              onTalkTo={onTalkTo}
              onOpenUnregistered={onOpenUnregistered}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The two arrows on the move presses. What each does is on the label a reader hears. */
const UP = '↑'
const DOWN = '↓'

/**
 * ONE CONTACT.
 *
 * A ROW IS ONE OF TWO THINGS: somebody a registry holds, or a writer nobody registered. The second
 * has no avatar, no presence and no door to write back through, and it says so rather than being
 * drawn as the first with pieces missing. Criterion M25.
 */
/**
 * ONE LINE OF A MESSAGE WITH ITS INLINE MARKERS TAKEN OFF, for a contact's row. Criteria M99, M103.
 *
 * Once the chat drew Markdown, a row preview began with the characters the bubble no longer shows:
 * a row read `**没有新的事项需要你决策。` where the message reads bold words. Seen on 11 September 2026
 * in the chat-2 handback screens.
 *
 * IT ASKS THE PRODUCT'S ONE INLINE READER rather than matching markers here. `inlinePieces` is the
 * pure half of src/shared/inline.ts and is what decides what a marker means everywhere, so a row
 * and a bubble cannot come to two answers about the same sentence.
 *
 * A BLOCK MARKER IS STILL DRAWN, and that is stated rather than fixed: which lines are headings,
 * bullets and table rows is answered by two readers already (a plan's and a record's), and a third
 * one written here for a preview is the defect this file's own comments keep naming. A message that
 * opens with a heading shows its hashes in the row.
 */
function withoutTheInlineMarkers(body: string): string {
  return inlinePieces(body)
    .map((piece) => {
      if (piece.kind === 'words' || piece.kind === 'image') return piece.raw
      if (piece.kind === 'maths') return piece.tex
      return piece.text
    })
    .join('')
}

function ContactRow({
  line,
  everybody,
  readingOf,
  arranging,
  groups,
  first,
  last,
  draft,
  now,
  known,
  onMove,
  onTalkTo,
  onOpenUnregistered,
}: {
  line: ShortContactLine
  everybody: ReadonlyMap<string, ContactParticipant>
  readingOf: (who: { kind: ParticipantKind; id: string }) => PresenceOnTheWire | undefined
  arranging: boolean
  groups: readonly ContactGroup[]
  first: boolean
  last: boolean
  /** What is waiting unsent in this conversation, or null because nothing is. Criterion M98. */
  draft: string | null
  /** The clock this row's time is read against, so a test can put the question. */
  now: string
  /** Every project the office lists, for the names on the row's project mark. */
  known: readonly WorkspaceReading[]
  onMove: (what: { group: string } | { moveBy: -1 | 1 }) => void
  onTalkTo: (who: { kind: ParticipantKind; id: string }) => void
  onOpenUnregistered: (writer: UnregisteredWriter) => void
}) {
  const writer = line.unregistered
  const them = line.who
  const one = them === null ? undefined : everybody.get(participantKey(them))
  /**
   * THE CARD THIS CONTACT HOLDS, or null because nobody wrote one. Criterion M99's tag.
   *
   * `role` is the word somebody chose and `roleReadAs` is what a row with no word is READ as. Only
   * the first is drawn: a tag on every row would say every contact carries a card, which is the
   * fifth invariant's difference between nothing being there and nobody having looked.
   */
  const card = typeof one?.role === 'string' && one.role !== '' ? one.role : null
  /**
   * THE ONE LINE UNDER THE NAME: the draft where one is waiting, otherwise the last thing said.
   *
   * The draft wins because it is the reader's own unfinished sentence and it is what they came back
   * for. The pencil beside it says which of the two this is, so the words are never mistaken for
   * something the contact wrote.
   *
   * A last line Mole Office wrote is drawn in the page's language, from `theWordsOfAnOfficeLine`,
   * the one function the opened conversation words it with (by `theLastLineInWords`, from the facts the
   * short row carries for it); its stored body is English (problem
   * muiPzUf5KFbJ). Every other line is drawn as it was written.
   * The links in a line are the exception: a record's id and a page's address are worded as the bubble words them,
   * after the markers are taken off as the bubble takes them off (wave 13y round 146). A draft is the reader's own
   * words and is drawn as typed.
   */
  const lastSaid = useTheLineWithItsLinksInWords(withoutTheInlineMarkers(line.last === null ? '' : theLastLineInWords(t, line.last)))
  const preview = firstWordsOfAMessage(draft === null ? lastSaid : withoutTheInlineMarkers(draft))
  /**
   * WHETHER THE LAST THING SAID HERE WAS THE OFFICE'S OWN LINE, AND NOT THIS CONTACT'S WORDS.
   * Criterion M105: the reader can tell an office message from a person's and an agent's, and that
   * has to hold here too, not only inside the open conversation — a pair conversation the office
   * wrote into (a run that waited and nobody came, M22; a restart that cut a run off, M24) can be
   * this contact's newest line, and `line.last.body` alone reads exactly like something the contact
   * said. `isASystemLine` is the one function that answers "did the office write this" inside the open
   * conversation; the short row carries `office` exactly where the same test holds (`aContactRowForThePage`
   * in src/shared/short-lists.ts), so the two places cannot disagree about the same message.
   *
   * NO DRAFT IS EVER MISTAKEN FOR THIS. `draft ?? line.last?.body` above already puts the reader's
   * own unfinished words first — a draft is never Mole Office speaking — so this is asked only about
   * `line.last`, never about what is being typed.
   */
  const lastIsFromTheOffice = draft === null && line.last !== null && line.last.office !== undefined

  return (
    <li>
      <button
        type="button"
        className="px-chat-contact"
        data-unregistered={them === null ? 'yes' : undefined}
        // WHETHER ANYTHING HERE IS UNREAD, which is what makes the name bold. Criterion M33: a
        // system line alone is enough, and it puts no number on the row.
        data-unread={line.anythingUnread ? 'yes' : 'no'}
        data-contact={line.key}
        onClick={() => {
          if (them !== null) onTalkTo(them)
          else if (writer !== null) onOpenUnregistered(writer)
        }}
      >
        {them === null || one === undefined ? null : (
          <Avatar kind={one.kind as ParticipantKind} id={one.id} name={one.name} url={one.avatarUrl} size={32} />
        )}
        {/* THE ROW THEIR PICTURE DRAWS, criterion M99, from chat-contatct.jpg in a message:
            a round picture, the name in bold with the time of the last message at the right of it,
            and under them one line — a pencil where a draft is waiting, the contact's card as a
            tag, the first words of the draft or of the last message, and the count of unread
            messages at the right. The presence mark stays the small dot it was (M100). */}
        <span className="px-chat-contact-words">
          <span className="px-chat-contact-top">
            {them === null ? null : <Dot reading={readingOf(them)} />}
            <span className="px-chat-name">
              {them === null
                ? unregisteredName(writer ?? { typed: null, said: null })
                : theNameBesideItsDate(one?.name ?? (currentMode() === 'inspect' ? them.id : unregisteredName({ typed: null, said: them })), one?.retiredAt)}
            </span>
            {/* A PERMANENT RESIDENT'S SLEEP, from the dot's own reading: no request of its own. */}
            {them === null ? null : <SleepLine reading={readingOf(them)} />}
            {/* THE NEWER OF TWO AGENTS THAT SHARE A NAME, marked beside the name and not in it (problem
                hqbovBMnTu-z). The server says which one is newer. */}
            {one?.newerOfASharedName === true ? (
              <span className="px-chat-newer">{t('chat.newerOfASharedName')}</span>
            ) : null}
            {them === null ? <span className="px-chat-unregistered">{CHAT_WORDS.unregistered}</span> : null}
            <ProjectMarks projects={line.projects} known={known} agent={them?.kind === 'agent'} />
            {them?.kind === 'agent' ? <PersonalAgentMarks marks={(line as typeof line & { personalTags?: PersonalAgentMark[] }).personalTags ?? []} /> : null}
            {/* THE TIME AT THE RIGHT OF THE NAME. It is the time today, the month and day this
                year, and the whole stamp before that — see `whenAContactLastSpoke`, because a row
                that says 11:44 about last Tuesday is a row that lies. */}
            {line.last === null ? null : (
              <span className="px-chat-contact-when">{whenAContactLastSpoke(line.last.sentAt, now)}</span>
            )}
          </span>
          {/* A SECRETARY'S ONE-LINE DUTY, under the name (wave 13y round 86, item 12). Nothing for anybody else yet. */}
          {them === null ? null : <TheDutyLine who={them} />}
          {/* THE LAST THING SAID, WHICH STAYS ON EVERY CONTACT. M18 keeps it: a name with nothing
              under it does not say whose turn it is. */}
          <span className="px-chat-contact-line">
            {draft === null ? null : (
              <span className="px-chat-pencil" title={CHAT_WORDS.aDraftIsWaiting} aria-label={CHAT_WORDS.aDraftIsWaiting}>
                {'✎'}
              </span>
            )}
            {card === null ? null : (
              <span className="px-chat-tag" data-card={card}>
                {cardWord(card)}
              </span>
            )}
            {/* THE OFFICE'S OWN MARK ON THE PREVIEW LINE, criterion M105. The same muted ink
                `.px-chat-system-block` speaks in inside the open conversation (`var(--text-3)`), so a
                reader who has seen the office's grey block there recognises the same voice here —
                one visual identity for the office, not two. It is a plain word, not a glyph: unlike
                the clock, queued tick, delivered muted double ticks and read green double ticks
                M113 draws on the reader's OWN sent messages (`.px-chat-mark`,
                which this row never draws at all — a contact row carries no delivery status), a
                reader must not have to learn what a new symbol means. */}
            {lastIsFromTheOffice ? <span className="px-chat-last-office">{MOLE_OFFICE_NAME}:</span> : null}
            <span className="px-chat-last">{preview}</span>
            {line.unread > 0 ? (
              <span className="px-chat-unread" data-counts="messages">
                {line.unread}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {/* NOTHING HERE OFFERS TO START A RUN. Criterion M100: a contact row says only
          whether the agent is online, and starting a new run is offered once the
          conversation is opened.

          The press used to be drawn here, as a sibling of the row, for every agent whose presence
          mark was grey — which on their list was most of them, so the list read as a column of
          offers rather than as a list of people. The row now carries the presence mark and nothing
          else, and the offer is inside the conversation, under the line saying the agent cannot be
          reached. The press itself is unchanged and is still one component; criterion M78 drew it
          in three places and this leaves two, the conversation and the right-click menu. */}
      {!arranging ? null : (
        <span className="px-chat-place">
          <label className="px-chat-place-group">
            <span className="px-sr">{t('chat.contact.whichGroup')}</span>
            <select
              value={line.group}
              onChange={(event) => onMove({ group: event.target.value })}
              aria-label={t('chat.contact.whichGroup')}
            >
              {groups.map((group) => (
                <option key={group.key} value={group.key}>
                  {groupHeading(group)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={first}
            aria-label={t('chat.contact.moveUp')}
            title={t('chat.contact.moveUp')}
            onClick={() => onMove({ moveBy: -1 })}
          >
            {UP}
          </button>
          <button
            type="button"
            disabled={last}
            aria-label={t('chat.contact.moveDown')}
            title={t('chat.contact.moveDown')}
            onClick={() => onMove({ moveBy: 1 })}
          >
            {DOWN}
          </button>
        </span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------- the panel

/** True when Mole Office itself wrote this line, which is what makes it a notice and not a message. */
export function isASystemLine(said: PoolEntry): boolean {
  return said.sentBy !== null && isMoleOffice(said.sentBy)
}
