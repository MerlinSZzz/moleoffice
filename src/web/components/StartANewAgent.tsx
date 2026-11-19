// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START A NEW AGENT: one press, one dialogue, drawn in two places.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M78. A message that would be answered by starting a NEW agent — one with no
 * conversation of its own here to pick up — waits, and the person is asked before anything starts.
 * A new agent is never started directly for an agent that cannot be reached: a dialogue first asks
 * "Cannot link ... Start a new agent?", and only a press on confirm starts one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ONE COMPONENT AND NOT SEVERAL
 * ---------------------------------------------------------------------------------------
 *
 * Starting a new agent works from the chat box, the contacts and the right-click menu: the
 * press has to work in several places. Presses written separately in each would be several sets of
 * words, several dialogues and several chances for one of them to stop matching what the server
 * does. So the press, the dialogue, the call and every sentence a person reads are here once, and
 * each place draws this.
 *
 * ---------------------------------------------------------------------------------------
 * TWO PLACES SINCE 11 SEPTEMBER 2026, AND A CONTACT ROW IS NOT ONE OF THEM
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M100: offering a new run on every offline contact is not needed there.
 * A contact row carries the presence mark and nothing about starting a run, and the offer is drawn
 * inside the conversation once it is opened. Criterion M78 asked for three places; this is the
 * later word on the third of them, and M78's own wording still says three.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A DIALOGUE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The press makes a mind that has never heard of the work and hands it their words. That is not
 * something to do on a stray click beside a name, and the dialogue is what the criterion asks for:
 * they are asked, and only their answer starts anything. The dialogue says what will happen and what
 * happens if they do not press, because the second is the question a person actually has.
 */

import { useRef, useState, useSyncExternalStore } from 'react'

import { t } from '@shared/i18n.ts'
import { CANNOT_REACH_WORDS } from '@shared/messages.ts'

import { api, errorMessage } from '../api.ts'
import { hearAlways, useChannel, whenEventsWereLost, whenTheStreamCameBack } from '../lib/channel.ts'
import { Overlay } from './ui.tsx'

/**
 * Where the press is drawn, so each place can style it without a second component.
 *
 * A contact row was a third value until 11 September 2026 and is gone rather than left unused:
 * criterion M100 took the offer off the row, and a word here that nothing draws would read as a
 * place this press still appears.
 */
export type WhereThePressIs = 'the conversation' | 'the right-click menu'

/**
 * THE AGENTS A PRESS ON THIS PAGE MADE, BY HANDLE, UNTIL EACH IS SEEN ANSWERING. Problem T6e9AVCcZyhb.
 *
 * A new agent has no run until the message worker starts one, so for a while nothing is answering
 * as it. Its conversation then showed Cannot reach and offered this press again, and a second press
 * made a second agent. So a press that made an agent puts its handle here, and every press drawn for
 * that handle is held: it cannot be pressed and says so. The conversation lets it go once the office
 * reads somebody answering as the agent (`letThePressGoFor`).
 *
 * IT IS THIS PAGE'S MEMORY AND NOTHING MORE. Loading the page again empties it, and the press is
 * offered again. The server's handle is the key because the press answers with the handle, not the
 * registry id, and a handle names one live agent (criterion I3).
 */
const madeOnThisPage = new Set<string>()
const watchers = new Set<() => void>()

function sayThePressesChanged(): void {
  for (const one of watchers) one()
}

function watchThePresses(change: () => void): () => void {
  watchers.add(change)
  return () => {
    watchers.delete(change)
  }
}

/** Whether a press on this page made the agent with this handle and nobody has been seen answering as it. */
export function useMadeOnThisPage(handle: string | undefined): boolean {
  const read = (): boolean => handle !== undefined && madeOnThisPage.has(handle)
  return useSyncExternalStore(watchThePresses, read, read)
}

/** The office read somebody answering as this agent, so its press is no longer held. */
export function letThePressGoFor(handle: string): void {
  if (madeOnThisPage.delete(handle)) sayThePressesChanged()
}

interface StartANewAgentProps {
  /** The registry id of the agent nothing is answering as. */
  agentId: string
  /** Its handle, which is how a press on this page remembers the agents it made. */
  handle: string
  workspaceId?: string
  /** What a reader calls that agent. Its name, not its handle. */
  name: string
  /** Which of the three places this one is, drawn as `data-where` so a test can tell them apart. */
  where: WhereThePressIs
  /** Check the selected candidate before offering the confirmation. */
  checkBeforeAsking?: boolean
  /**
   * Called after the press went through, when the dialogue stays open with what the server said, so
   * the place around it can read its lists again.
   */
  onDone?: () => void
  /**
   * OPENS THE NEW AGENT'S CONVERSATION, criterion M88: one confirmation, and then the conversation
   * follows by itself. It is called only when the press made a new agent, with that agent's handle.
   * It answers true when it opened the conversation, and the dialogue then closes. It answers false
   * when it could not, and the dialogue then shows what the server said, which names the new agent.
   */
  follow?: (handle: string) => Promise<boolean>
}

/**
 * THE PRESS, AND THE ONE DIALOGUE BEHIND IT.
 *
 * The press is a question — "Start a new agent?" — because pressing it makes something that was not
 * there before. The dialogue repeats the agent's name, because a person who reached this from a
 * contact row may have pressed the row below the one they meant.
 */
export function StartANewAgent({ agentId, handle, workspaceId, name, where, checkBeforeAsking = false, onDone, follow }: StartANewAgentProps) {
  const held = useMadeOnThisPage(handle)
  const [asking, setAsking] = useState(false)
  const [working, setWorking] = useState(false)
  const [checking, setChecking] = useState(false)
  const checkingNow = useRef(false)
  const [canConfirm, setCanConfirm] = useState(true)
  const [fault, setFault] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const ask = async (): Promise<void> => {
    if (checkingNow.current) return
    setSaid(null)
    setFault(null)
    setCanConfirm(true)
    if (!checkBeforeAsking) {
      setAsking(true)
      return
    }
    checkingNow.current = true
    setChecking(true)
    try {
      const reading = await api.wouldThePressCarry(agentId, workspaceId)
      if (!reading.wouldCarry) {
        setCanConfirm(false)
        setSaid(t('newAgentKeys.nothingToCarry'))
      }
    } catch (err: unknown) {
      setCanConfirm(false)
      setFault(t('newAgentKeys.readingFailed', { who: name, handle, why: errorMessage(err) }))
    } finally {
      checkingNow.current = false
      setChecking(false)
      setAsking(true)
    }
  }

  const press = async (): Promise<void> => {
    setWorking(true)
    setFault(null)
    try {
      const done = await api.startANewAgentFor(agentId, workspaceId)
      // THE AGENT IT MADE IS REMEMBERED BEFORE ANYTHING IS DRAWN FOR IT, so its own press is held
      // from the first frame of its conversation (problem T6e9AVCcZyhb).
      if (done.handle !== '') {
        madeOnThisPage.add(done.handle)
        sayThePressesChanged()
      }
      // A NEW AGENT WAS MADE: its conversation opens and the dialogue closes (criterion M88). The
      // new conversation's first line says where it came from. An empty handle means the server
      // made no agent, and then its words below say why.
      if (done.handle !== '' && follow !== undefined && (await followed(follow, done.handle))) {
        setAsking(false)
        return
      }
      // WHAT THE SERVER SAID, WORD FOR WORD. It is the half of this a person cannot see: whether
      // anything was actually waiting for the press. Writing our own sentence here would be this
      // page claiming to know what the server did.
      setSaid(done.says)
      onDone?.()
    } catch (err: unknown) {
      setFault(errorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="px-start-agent"
        data-where={where}
        data-agent={agentId}
        data-held={held ? 'yes' : 'no'}
        disabled={held || checking}
        title={held ? t('newAgentKeys.whyHeld') : CANNOT_REACH_WORDS.whatThePressDoes}
        onClick={(e) => {
          // A CONTACT ROW IS ITSELF A PRESS THAT OPENS A CONVERSATION, so this one stops there.
          e.stopPropagation()
          void ask()
        }}
      >
        {held ? t('newAgentKeys.held') : CANNOT_REACH_WORDS.startANewAgent}
      </button>
      {!checking ? null : <span className="px-start-agent-checking" role="status">{t('newAgentKeys.checking')}</span>}
      {!asking ? null : (
        <Overlay>
          <div className="px-start-agent-behind" aria-hidden="true" />
          <div
            className="px-start-agent-ask"
            role="alertdialog"
            aria-modal="true"
            aria-label={CANNOT_REACH_WORDS.startANewAgent}
          >
            {!canConfirm ? null : <>
              <p className="px-start-agent-who">{CANNOT_REACH_WORDS.cannotReach(name)}</p>
              <p className="px-start-agent-what">{CANNOT_REACH_WORDS.whatThePressDoes}</p>
              <p className="px-start-agent-otherwise">{CANNOT_REACH_WORDS.whatHappensIfNobodyPresses}</p>
            </>}
            {fault === null ? null : <p className="px-start-agent-fault">{fault}</p>}
            {said === null ? null : <p className="px-start-agent-said">{said}</p>}
            <div className="px-start-agent-presses">
              {said !== null || !canConfirm ? null : (
                <button
                  type="button"
                  className="px-start-agent-yes"
                  disabled={working}
                  onClick={() => {
                    void press()
                  }}
                >
                  {CANNOT_REACH_WORDS.startANewAgent}
                </button>
              )}
              <button
                type="button"
                className="px-start-agent-no"
                onClick={() => {
                  setAsking(false)
                }}
              >
                {said === null && canConfirm ? CANNOT_REACH_WORDS.notNow : CANNOT_REACH_WORDS.close}
              </button>
            </div>
          </div>
          <style href="px-start-agent" precedence="medium">
            {START_AGENT_CSS}
          </style>
        </Overlay>
      )}
    </>
  )
}

/**
 * Whether the place around the press opened the new agent's conversation.
 *
 * The agent is already made when this runs, so a failure here must not read as a failed press: the
 * press would then be offered again and make a second agent. A failure is answered as "not opened",
 * and the dialogue shows the server's words, which say the agent was made.
 */
async function followed(follow: (handle: string) => Promise<boolean>, handle: string): Promise<boolean> {
  try {
    return await follow(handle)
  } catch {
    return false
  }
}

/**
 * The stylesheet.
 *
 * NO BACKTICK ANYWHERE IN HERE, including inside a comment: this is a template literal inside a
 * .tsx file, and one backtick closes the string and turns the rest of the file into nonsense that
 * the compiler reports as a missing semicolon on a line of prose. Chapter 6.
 */
const START_AGENT_CSS = `
.px-start-agent {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.78rem;
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
}
.px-start-agent:hover { background: var(--panel-2); }
.px-start-agent[disabled] { color: var(--text-2); cursor: default; background: var(--panel); }
.px-start-agent[data-where='the conversation'] { align-self: center; }

.px-start-agent-behind {
  position: fixed;
  inset: 0;
  z-index: var(--z-blocked);
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.25);
}
.px-start-agent-ask {
  position: fixed;
  z-index: var(--z-wrong-world);
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(28rem, calc(100vw - 2rem));
  box-sizing: border-box;
  background: var(--panel);
  color: var(--text);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  padding: 1rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.35);
}
.px-start-agent-who { margin: 0 0 0.5rem; font-weight: 600; }
.px-start-agent-what,
.px-start-agent-otherwise { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--text-2); }
.px-start-agent-fault { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--st-broken); }
.px-start-agent-said { margin: 0 0 0.5rem; font-size: 0.85rem; }
.px-start-agent-presses { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
.px-start-agent-yes,
.px-start-agent-no {
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  background: var(--panel-2);
  color: var(--text);
  font-size: 0.85rem;
}
.px-start-agent-yes { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.px-start-agent-yes[disabled] { opacity: 0.6; cursor: default; }
`

/**
 * THE RIGHT-CLICK ENTRY: start a new agent for one that cannot be reached, from anywhere.
 *
 * Starting a new agent works from several places, the right-click menu among them. There is one
 * right-click menu in the product — the composer that opens on a right-click anywhere — so this is
 * where the third place is, beside `FollowFromHere` in components/Leading.tsx, which is the entry
 * for the other half of the same question: that one lists the agents something IS serving, and this
 * one lists agents nothing is answering as whose messages the press would carry.
 *
 * The list contains grey agents with a message the press would carry. The selected row is checked
 * again before the confirmation is offered, because the list may have changed.
 *
 * IT DRAWS NOTHING WHEN NOTHING IS WAITING, rather than an empty heading.
 */
export function StartANewAgentFromHere({
  onDone,
  showLabelWhenEmpty = false,
}: {
  onDone?: () => void
  /**
   * DRAW THE LABEL EVEN WHEN NOTHING IS WAITING. The right-click menu leaves this off, because a
   * menu that offers nothing should not open an empty heading. The chat's one New agent button
   * (criterion M115) opens this chooser as a dialogue, and there the label is the answer to the
   * press: it says which list is empty rather than leaving a blank box.
   */
  showLabelWhenEmpty?: boolean
}) {
  const { agents, fault } = useAgentsNobodyAnswersFor()

  if (fault !== null) return <p className="px-start-agent-fault">{fault}</p>
  if (agents.length === 0 && !showLabelWhenEmpty) return null

  return (
    <div className="px-start-agent-here">
      <p className="px-start-agent-here-label">{CANNOT_REACH_WORDS.noneOfTheseIsAnswering}</p>
      <ul className="px-start-agent-here-list">
        {agents.map((one) => (
          <li key={one.id}>
            <span className="px-start-agent-here-name">{one.name}</span>
            <StartANewAgent agentId={one.id} handle={one.handle} name={one.name} where="the right-click menu" checkBeforeAsking onDone={onDone} />
          </li>
        ))}
      </ul>
      <style href="px-start-agent-here" precedence="medium">
        {HERE_CSS}
      </style>
    </div>
  )
}

/** An agent on the list, as the press needs it. */
interface AgentNobodyAnswersFor {
  id: string
  handle: string
  name: string
}

/** The list, or the reason it could not be read. A fault comes with no agents, not with an old list. */
interface TheAgentsNobodyAnswersFor {
  agents: AgentNobodyAnswersFor[]
  fault: string | null
}

/**
 * AGENTS NOTHING IS ANSWERING AS, WITH A MESSAGE THE PRESS WOULD CARRY: one reading for the page,
 * read again when the answering changes.
 *
 * `StartANewAgentFromHere` draws its list from this, and the right-click panel reads the count on
 * its More line from this, so the list and the count are one rule. They are
 * also one reading: every place that draws the list draws this one, so no two of them can disagree.
 *
 * UNTIL 12 OCTOBER 2026 EACH PLACE READ THE LIST ONCE, WHEN IT WAS DRAWN. An agent that began to
 * answer stayed on the list, offered a new agent nobody needed, until the place was closed and
 * opened again. Now the list is read again when the server announces `answering.changed`, which it
 * does when a hold is taken or let go, when a session record is written, when a message is taken,
 * and when its once-a-minute look finds that who answers as an agent changed. An agent that starts
 * answering leaves the list, and one that stops answering joins it if a message would be carried.
 * It is also read again when events were lost and when the stream came back, because the
 * page was not told what happened meanwhile. There is no timer here.
 *
 * Each place that is drawn reads it once more as well, so a place opened later never starts from a
 * reading older than itself. An event heard while a read is out is read again once that read is
 * back, because the read that was out may have been answered before the change. When the last place
 * is closed the page stops listening and forgets the list.
 */
const NOBODY_YET: TheAgentsNobodyAnswersFor = { agents: [], fault: null }
let theList: TheAgentsNobodyAnswersFor = NOBODY_YET
const listWatchers = new Set<() => void>()
/** Counts the times the last place closed, so a read that was out then is not put on the next one. */
let listening = 0
/** The `listening` count a read that is out was asked under, or null when none is out. */
let readOutFor: number | null = null
/** A change was heard while a read was out, so one more read is owed when it is back. */
let owedAfterThisRead = false
let stopHearing: (() => void) | null = null

async function whoNobodyAnswersFor(): Promise<AgentNobodyAnswersFor[]> {
  const [registries, seen, carrying] = await Promise.all([
    api.participants(),
    api.presence(),
    api.carryableAgentIds(),
  ])
  const grey = new Set(
    seen.presence
      .filter((one) => one.colour === 'grey' && one.who.kind === 'agent')
      .map((one) => one.who.id),
  )
  const carryingFor = new Set(carrying.agentIds)
  const candidates = registries.agents
    .filter((one) => grey.has(one.id) && carryingFor.has(one.id) && !madeOnThisPage.has(one.handle))
    .map((one) => ({ id: one.id, handle: one.handle, name: one.name }))
  return candidates
}

function readTheList(): void {
  if (readOutFor === listening) {
    owedAfterThisRead = true
    return
  }
  const askedFor = listening
  readOutFor = askedFor
  void whoNobodyAnswersFor().then(
    (agents): TheAgentsNobodyAnswersFor => ({ agents, fault: null }),
    (err: unknown): TheAgentsNobodyAnswersFor => ({ agents: [], fault: errorMessage(err) }),
  ).then((next) => {
    if (askedFor !== listening) return
    readOutFor = null
    theList = next
    for (const one of listWatchers) one()
    if (!owedAfterThisRead) return
    owedAfterThisRead = false
    readTheList()
  })
}

function watchTheList(change: () => void): () => void {
  listWatchers.add(change)
  if (stopHearing === null) {
    const stops = [
      hearAlways(readTheList, ['answering.changed']),
      whenEventsWereLost(readTheList),
      whenTheStreamCameBack(readTheList),
    ]
    stopHearing = () => {
      for (const stop of stops) stop()
    }
  }
  // A READ ALREADY OUT IS JOINED, not asked twice: a change after it was asked is an event, and an
  // event marks one more read owed.
  if (readOutFor !== listening) readTheList()
  return () => {
    listWatchers.delete(change)
    if (listWatchers.size > 0 || stopHearing === null) return
    stopHearing()
    stopHearing = null
    listening += 1
    readOutFor = null
    owedAfterThisRead = false
    theList = NOBODY_YET
  }
}

const theListNow = (): TheAgentsNobodyAnswersFor => theList

/** The agents nothing is answering as with a message waiting for them, as the page last read them. */
export function useAgentsNobodyAnswersFor(): TheAgentsNobodyAnswersFor {
  // THIS OPENS THE CONNECTION the reading listens on, or joins the one the page already has.
  useChannel()
  return useSyncExternalStore(watchTheList, theListNow, theListNow)
}

const HERE_CSS = `
.px-start-agent-here { margin: 0.4rem 0 0; }
.px-start-agent-here-label { margin: 0 0 0.25rem; font-size: 0.78rem; color: var(--text-2); }
.px-start-agent-here-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.px-start-agent-here-list li { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
.px-start-agent-here-name { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
