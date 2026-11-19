// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { PixelAppearanceEditor } from '../components/pixel-office/PixelAppearanceEditor.tsx'
import { RevokeTheirKey } from '../components/RevokeTheirKey.tsx'
/**
 * `#/who/<kind>/<id>` — ONE PARTICIPANT'S OWN PAGE.
 *
 * Criterion M51 of design/messages/ACCEPTANCE.md section 18: pressing an agent's picture in the chat
 * opened Everything / Reports and notes, not a profile page, and the picture, the name and the other
 * facts could not be changed anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT PRESSING A PICTURE USED TO DO
 * ---------------------------------------------------------------------------------------
 *
 * It opened `#/r/<the agent's record id>`, which is the record page — a title, a summary and a list
 * of records. That page answers "what has been written about this agent"; the person pressed the picture
 * asking "who is this", and there was no page for that question at all. There was also nowhere for a
 * person to change their own picture and name except the Settings page, which is a page about this
 * browser.
 *
 * ---------------------------------------------------------------------------------------
 * A PERSON EDITS THEIR OWN THINGS HERE THROUGH THE SETTINGS PAGE'S OWN CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * `YourAppearance` is the control the Settings page draws, and this page draws THE SAME COMPONENT
 * rather than a second one shaped like it. So the picture picker, the name editor and the status
 * editor behave identically in both places, and both go through the same two routes. A copy here
 * would be the defect CLAUDE.md names: one fact worked out in two places, drifting the first time
 * somebody changed one of them.
 *
 * WHO MAY CHANGE WHAT IS THE SERVER'S RULE AND NOT THIS PAGE'S. The editor is drawn on a person's
 * own page and nowhere else, which is what the door allows; the door refuses anything else with a
 * sentence naming the rule, and this page shows that sentence rather than repeating the rule.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS INVENTED WHERE NOTHING IS KNOWN
 * ---------------------------------------------------------------------------------------
 *
 * Every value that can be missing is drawn with the words for missing rather than with a plausible
 * default, and each list that can be empty for more than one reason carries the server's sentence
 * saying which reason it was. An agent has no presence choice, no contact group of its own making
 * and often no machine recorded against it; the page says so instead of leaving a gap a reader
 * would fill in themselves.
 */

import { api, ApiError, errorMessage, faultOf, getActor, type ProfileReply, type ParticipantOnTheWire, type ReleaseReadingReply } from '../api.ts'
import type { ParticipantsNamed } from '../lib/participant-lookup.ts'
import { Avatar } from '../components/Avatar.tsx'
import { BackLink } from '../components/BackLink.tsx'
import { YourAppearance } from '../components/Appearance.tsx'
import { YourCard } from '../components/YourCard.tsx'
import { TheCardAsk, TheirCard, TheRaise } from '../components/TheirCard.tsx'
import { TheRightToInject, WhoHasInjectedToThem } from '../components/TheRightToInject.tsx'
import { ProposedNamesPanel } from '../components/ProposedNames.tsx'
import { TheAgentsRuns } from '../components/TheAgentsRuns.tsx'
import { TheLoginsWeek } from '../components/TheLoginsWeek.tsx'
import { TheModelThisAgentsRunsGet } from '../components/TheModelThisAgentsRunsGet.tsx'
import { AgentRenames } from '../components/AgentRenames.tsx'
import { Dot } from '../components/ContactChooser.tsx'
import { Absence, Btn, ErrorNote, Panel, TextArea } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, recordPath } from '../components/router.tsx'
import { type MayRetire, type TheHandoverPart } from '@shared/profile.ts'
import { whoRegisteredTheWorkAreaSays } from '@shared/roles.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { presenceWord, sentenceOnThePage, worldNameOnThePage } from '../lib/server-sentences.ts'
import { groupHeading } from '@shared/contacts.ts'
import { RUNTIME_WORDS, type AgentRuntime, type ParticipantKind, type ParticipantRef } from '@shared/participants.ts'
import { kindWord } from '@shared/words.ts'
import { ADDRESS_AS_PARTS, type AddressAs, type AddressAsPart } from '@shared/address-as.ts'
import { content, t, writtenMoment } from '@shared/i18n.ts'
import { broadcastLines, type BroadcastReading } from '@shared/broadcast.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { peekPreparedProfile, consumePreparedProfile } from '../lib/prepared-profile.ts'
import { writerNamed } from '../lib/participant-lookup.ts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useInspect } from '../lib/mode.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { ParticipantName } from './NotebookPage.tsx'
// AN AGENT'S TERMINALS (wave 13u, round 2): its own terminal and the ones it opened.
import { AgentTerminals } from '../components/AgentTerminals.tsx'
import { ResidentSection } from '../components/ResidentSection.tsx'
import { ResidentSleepPlace } from '../components/ResidentSleep.tsx'
import { AgentLiveSteps } from '../components/AgentLiveSteps.tsx'
import { AgentLiveTerminal } from '../components/AgentLiveTerminal.tsx'
import { AgentQuickInputs } from '../components/AgentQuickInputs.tsx'
import { AgentWayBack } from '../components/AgentWayBack.tsx'
import { AgentProjectMove } from '../components/AgentProjectMove.tsx'
import { AgentStarterMove } from '../components/AgentStarterMove.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import { momentOfStampInZone } from '@shared/time.ts'
import { whenInWords } from '../components/RaiseEndChoice.tsx'
import { TheDutyLine } from '../components/ChatDuty.tsx'
import { AgentProjectMarks } from '../components/AgentProjectMarks.tsx'
import { PersonalAgentTags } from '../components/PersonalAgentTags.tsx'


/**
 * A BROADCAST'S STORED STAMP, SAID IN THE OFFICE'S OWN WORDS FOR A TIME on the office's clock: "today at
 * 13:00", "明天 07:00", "on 2026/10/03 at 07:00". With no office zone, or a stamp that does not read,
 * the stamp is said as it is stored.
 */
function broadcastTimeInWords(stamp: string, zone: string | null): string {
  if (zone === null) return stamp
  const at = momentOfStampInZone(stamp, zone)
  return at === null ? stamp : whenInWords(at, Date.now(), zone)
}

export function ProfilePage({ kind, id }: { kind: ParticipantKind; id: string }) {
  useLanguage()
  const [held] = useState(() => peekPreparedProfile(kind, id))
  const used = useRef(false)
  const ready = used.current || held === undefined ? undefined : peekPreparedProfile(kind, id, held)
  const [reply, reload] = useProjectAsync(() => {
    if (ready !== undefined && !used.current) {
      used.current = true
      consumePreparedProfile(ready)
      return Promise.resolve(ready.value)
    }
    used.current = true
    return api.profile(kind, id)
  }, [kind, id], ready === undefined ? {} : { startFrom: { value: ready.value } })
  useEffect(() => { if (held !== undefined) consumePreparedProfile(held) }, [held])
  return (
    <div className="page prof">
      <style href="mole-office-profile" precedence="default">
        {PROFILE_CSS}
      </style>
      <BackLink page="embassy" />
      {reply.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {reply.status === 'error' ? (
        <ErrorNote message={reply.message} fault={reply.fault} label={t('g6b.profile.notFound')} />
      ) : null}
      {reply.status === 'ready' ? <TheProfile said={reply.value} onChanged={reload} /> : null}
    </div>
  )
}

/**
 * The page, given the one reply.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER, the way `TheOffice` on the Worlds page is: this
 * half is a pure function of what was fetched, and that is the half a test can hold still.
 */
export function TheProfile({ said, onChanged }: { said: ProfileReply; onChanged: () => void }) {
  useLanguage()
  const inspect = useInspect()
  const who = said.participant
  const kind = who.kind as ParticipantKind
  const [saving, setSaving] = useState<string | null>(null)
  const [fault, setFault] = useState<string | null>(null)
  /**
   * WHETHER THE READER IS LOOKING AT THEMSELVES, which is the one thing that decides whether the
   * editor is drawn. A person's name and status line are their own to set, and the door says so; a
   * page that drew the editor for everybody would be offering a press that is always refused.
   */
  const actor = getActor()
  const yours = kind === 'person' && actor.type === 'human' && actor.id === who.id

  const run = (what: Promise<unknown>): void => {
    setFault(null)
    void what
      .then(() => {
        setSaving(null)
        onChanged()
      })
      .catch((err: unknown) => {
        setSaving(null)
        setFault(errorMessage(err))
      })
  }

  /**
   * THE PARTS OF THE PAGE, EACH WORKED OUT ONCE. A person's page and an agent's page set the same parts in two
   * arrangements, and the owner's decision drew the agent's again. So each part is a value
   * here and the two layouts below only say where it stands. A part drawn twice would be one fact in two places.
   */
  const head = (
      <header className="prof-head">
        {/* THE PICTURE, BIG, BECAUSE THIS IS THE PAGE ABOUT THE PERSON IN IT. It is not a press
            here: on your own page the editor below opens the picker, and on somebody else's there
            is nothing a press could do. */}
        <Avatar kind={kind} id={who.id} name={who.name} url={who.avatarUrl} size={64} />
        <div className="prof-titles">
          <p className="prof-kind">{kind === 'agent' ? t('g6b.profile.agent') : t('g6b.profile.person')}</p>
          <h1 className="prof-name">{who.name}</h1>
          <TheDutyLine who={who} />
          {kind === 'agent' && 'projects' in who && Array.isArray(who.projects) ? <AgentProjectMarks projects={who.projects as string[]} /> : null}
          <p className="prof-presence">
            <Dot reading={{ ...said.presence, word: presenceWord(said.presence), says: inspect ? sentenceOnThePage(said.presence.says) : '' }} />
            <span className="prof-presence-word">{presenceWord(said.presence)}</span>
            {/* IN THE PAGE'S LANGUAGE (wave 13k round 35): the server's presence sentence, by its word. */}
            <span className="prof-presence-says">{inspect ? sentenceOnThePage(said.presence.says) : null}</span>
          </p>
        </div>
      </header>
  )

  /* THAT THIS ROW IS ALREADY RETIRED, problem zyCcJYCLsAe7. A Codex agent used only for testing had
     been closed, and its row was still
     in the Embassy as an active contact, because nothing retired a registry row.

     THE NOTICE IS HIGH ON THE PAGE because it changes how everything under it reads: a card, a
     machine and a trip on a closed row are all history. The press that closes a row is at the
     foot of the page instead — see `RetireThisAgent` at the end of this list. */
  const retiredNotice = kind !== 'agent' ? null : <RetiredNotice who={who} />

  /* THE SECRETARY'S BROADCAST, by a decision: the next slot, the last broadcast and whether the
     unanswered rule has paused it, in plain words. It is drawn from the reading
     the office already built for this page, and only where the office holds one, which is an agent that
     has held the secretary card. The sentences are made from that reading's facts in the page's
     language, by the function the server makes its English `says` with, so a Chinese page draws them in
     Chinese. Each time in them is said in the office's own words for a time, on the office's clock
     ("today at 13:00", "今天 13:00"), as the acting-for-you line on this page says its end. Where the
     reply names no office zone, the stamp is drawn as it is stored, not worked out on this computer's
     clock. */
  const broadcasts = kind !== 'agent' || who.broadcast === null || who.broadcast === undefined ? null : (
    <Panel declares={{ surface: 'profile.broadcast' }} titleIs="label" title={t('g6b.profile.broadcasts')}>
      {broadcastLines(who.broadcast, t, (stamp) => broadcastTimeInWords(stamp, said.theCardTheyHold?.elevation?.officeTimeZone ?? null)).map((one) => (
        <p className="prof-says" key={one}>
          {one}
        </p>
      ))}
      <SkipTheNextBroadcast agent={who.id} reading={who.broadcast} onChanged={onChanged} />
    </Panel>
  )

  /* THE WORK AREA IS PATHS, SO ITS CONTENTS ARE DEVELOPER MODE'S (plan 7FEOshq3mBGG). ITS PRESS IS
     NOT: criterion M97 sends a person here by a lead to press Change work area, so normal mode
     keeps the panel with the press alone, wherever this reader may change the area. */
  const workArea = kind === 'agent' ? <WorkArea said={said} onChanged={onChanged} inspect={inspect} /> : null
  /* WHETHER A RELEASE WAKES THIS AGENT, on its page in normal mode, with who said so and why (the first condition,
     HeBxwj6QRGjS). The press is drawn only for the two who may say it: the owner, and the agent itself. */
  const releases = kind === 'agent' ? <ReleaseReading agentId={who.id} zone={said.theCardTheyHold?.elevation?.officeTimeZone ?? null} /> : null

  /* WHAT EACH RUN OF THIS AGENT DECLARED, AND THE TOTALS OVER THEM. Criterion P91. Its own
     panel and not a row on the work-area panel, so P85's sentence and the wave-3 sentence that
     will join it stay exactly where they are. `agentRuns` is null on a person, who starts no
     runs, so nothing is drawn there. */
  const runs = !inspect || kind !== 'agent' || said.agentRuns === null ? null : <TheAgentsRuns reading={said.agentRuns} />

  /* ITS CURRENT HANDOVER, wave 13k round 46, by item 2 of a decision: the text, when it was written and in which run,
     or that nobody has written one. In normal mode, because a handover is written for whoever
     takes over the work. */
  const handover = kind !== 'agent' || said.handover === null ? null : <TheHandover part={said.handover} />

  /* EACH MODEL LOGIN'S WEEK, on a secretary's page in Developer mode (wave 13p round 29). The server sends it only for a
     secretary, so its absence is what keeps it off every other page. */
  const loginsWeek = !inspect || said.loginsWeek === undefined ? null : <TheLoginsWeek reading={said.loginsWeek} />

  /* WHETHER AGENTS MAY INJECT, and that the switch is on the Settings page. Criteria M84 and
     M91: the switch is one for every agent, so this page draws the answer and no press. On a
     person's page the other half is drawn instead: how many messages each sender has injected
     to them. Each component draws nothing on the page it is not for, and which of the two that
     is comes from the server. */
  const inject = (
    <>
      <TheRightToInject said={said} />
      <WhoHasInjectedToThem said={said} />
    </>
  )

  /* WHAT THE REGISTRY HOLDS. One label with one value per row, never a sentence: the fifth
     rule's words for missing are values here, so "not set" reads as the answer it is. */
  const facts = (
          <Panel declares={{ surface: 'profile.facts' }} titleIs="label" title={t('g6b.profile.facts')}>
            <dl className="prof-facts">
              <Fact label={t('g6b.profile.status')} value={who.state} missing={<Absence say title={t('g6b.profile.noStatus')} />} />
              {inspect ? <Fact label={t('g6b.profile.handle')} value={who.handle} missing={<Absence />} /> : null}
              {!inspect || kind !== 'agent' ? null : (
                <Fact
                  label={t('g6b.profile.runtime')}
                  // THE TOOL'S OWN WORD, from the one table that holds it. `claude-code` never reaches
                  // this screen; a runtime nobody declared is absent rather than guessed.
                  value={who.runtime == null ? null : RUNTIME_WORDS[who.runtime as AgentRuntime].full}
                  missing={<Absence say title={t('g6b.profile.noRuntime')} />}
                />
              )}
              {!inspect || kind !== 'agent' ? null : <TheModelThisAgentsRunsGet agent={who.id} mayPress={actor.type === 'human'} />}
              <Fact
                label={t('g6b.profile.group')}
                // THE GROUP'S HEADING, read the way the contacts list reads it: a declared group in the
                // page language, a group somebody made or renamed as it was written (problem SGTqdnfCmQxh).
                value={said.group === null ? null : groupHeading(said.group)}
                missing={<Absence say title={t('g6b.profile.noGroup')} />}
              />
              <Fact
                label={t('g6b.profile.world')}
                value={said.citizenOf === null ? null : said.citizenOf.name === null ? (inspect ? said.citizenOf.databaseIdentity : null) : worldNameOnThePage(said.citizenOf.name, said.citizenOf.kind, inspect)}
                missing={<Absence say title={t('g6b.profile.noWorld')} />}
                says={inspect ? saidOnThePage(said.citizenshipSaid, sentenceOnThePage(said.citizenshipSays)) : undefined}
              />
              {/* TO THE MINUTE, as every time on this page, by the shared rule R7. */}
              <Fact label={t('g6b.profile.registered')} value={who.createdAt == null ? who.createdAt : writtenMoment(who.createdAt)} missing={<Absence say title={t('g6b.profile.noStatus')} />} />
              {/* THE CREDENTIAL THE OFFICE LET THIS AGENT IN ON, criterion P74's last clause. The
                  Embassy is one list now and what was a section of credentials is a mark on a row, so
                  the credential itself is named here, on the page that row opens. A person needs none
                  and the row is not drawn for one. */}
              {!inspect || kind !== 'agent' ? null : (
                <Fact
                  label={t('g6b.profile.credential')}
                  value={who.credential}
                  missing={<Absence say title={t('g6b.profile.noCredential')} />}
                  says={who.credential === null ? undefined : t('g6b.profile.credentialSays')}
                />
              )}
            </dl>
            {/* AND WHETHER THIS ROW WAS ADMITTED BEFORE P88. Criterion P88. The sentence names the
                runtime the row declares and the date it was registered, so a row the old door let in is
                never read as one the new gate governs. Absent on every row P88 does not. */}
            {!inspect || said.admittedBeforeP88 === null ? null : <p className="prof-says">{said.admittedBeforeP88}</p>}
          </Panel>
  )

  /* HOW THIS ONE WISHES TO BE ADDRESSED. On every page,
     person and agent. The four labels are drawn even when no part is set, so a reader can see
     the field exists and is empty. The editor is not here: on a person's own page it is in the
     panel of what they may change, below. */
  const addressAs = <HowToAddress who={who} yours={yours} />

  /* WHETHER A SESSION HOLDS THIS AGENT'S HANDLE RIGHT NOW. It is its own panel and not a row
     above, because the sentence is the answer: "a run is answering" and "a terminal is
     answering" send a message to two different places. */
  const answering = !inspect || said.answering === null ? null : (
    <Panel declares={{ surface: 'profile.answering' }} titleIs="label" title={t('g6b.profile.answering')}>
      <p className="prof-answering">
        <span className="prof-how">{said.answering.how === 'nobody' ? t('chat.answeringNow.nobody') : said.answering.how}</span>
        {/* IN THE PAGE'S LANGUAGE (wave 13k round 35): the server sends the sentence as a code beside its English. */}
        <span className="prof-says">{saidOnThePage(said.answering.said, said.answering.says)}</span>
      </p>
    </Panel>
  )

  /* THE SHORT NAME PROPOSED FOR THIS AGENT, criterion M50. It is here because this is where a
     name is chosen; it was on the Settings page, which is a page about this browser and no place
     for it. The panel draws nothing once the name has
     been changed, so this is empty on every agent nobody has proposed a name for. */
  const proposedName = kind !== 'agent' || said.proposedName === null ? null : <ProposedNamesPanel only={who.id} />

  /* WHAT THIS AGENT HOLDS: the records it filed in this project lately. The sentence beside the
     list says what was counted, because "nothing filed" and "this counts only what it created"
     are different answers and a reader cannot tell them apart from an empty list. */
  const filed = said.filedLately === null ? null : (
            <Panel declares={{ surface: 'profile.filed' }} titleIs="label" title={t('g6b.profile.filedLately')}>
              {inspect ? <p className="prof-says">{sentenceOnThePage(said.filedLatelySays ?? '')}</p> : null}
              {said.filedLately.length === 0 ? (
                <p className="prof-none">{<Absence say title={t('g6b.profile.nothingFiled')} />}</p>
              ) : (
                <ul className="prof-filed">
                  {said.filedLately.map((one) => (
                    <li key={one.id} className="prof-filed-row">
                      <RouteLink to={recordPath(one.id)} className="prof-filed-link">
                        {one.title}
                      </RouteLink>
                      <span className="prof-key">{kindWord(one.kind).text}</span>
                      <span className="prof-when">{writtenMoment(one.when)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
  )

  /* THE MACHINES THEIR REQUESTS ARRIVED FROM. A network address and not a name: nothing gave
     these machines a name, so a friendly one here would be invented. */
  const machines = inspect ? <Panel declares={{ surface: 'profile.machines' }} titleIs="label" title={t('g6b.profile.seenFrom')}>
            <p className="prof-says">{sentenceOnThePage(said.seenFromSays)}</p>
            {said.seenFrom.length === 0 ? (
              <p className="prof-none">{<Absence say title={t('g6b.profile.noMachines')} />}</p>
            ) : (
              <ul className="prof-machines">
                {said.seenFrom.map((one) => (
                  <li key={one.address} className="prof-machine">
                    <span className="prof-address">{one.address}</span>
                    <span className="prof-key">{t('g6b.profile.last')}</span>
                    <span className="prof-when">{writtenMoment(one.lastSeen)}</span>
                    <span className="prof-key">{t('g6b.profile.requests')}</span>
                    <span className="prof-count">{one.calls}</span>
                  </li>
                ))}
              </ul>
            )}
           </Panel> : null

  /* THE TRIPS THEY HAVE MADE ACROSS WORLDS, criterion C4. A visitor says which world it came
     from and when, which is the same pair the embassy draws. */
  const visits = (
          <Panel declares={{ surface: 'profile.visits' }} titleIs="label" title={t('g6b.profile.visits')}>
            {inspect ? <p className="prof-says">{sentenceOnThePage(said.visitsSay)}</p> : null}
            {said.visits.length === 0 ? (
              <p className="prof-none">{<Absence say title={t('g6b.profile.noVisits')} />}</p>
            ) : (
              <ul className="prof-visits">
                {said.visits.map((one) => (
                  <li key={one.id} className="prof-visit">
                    <span className="prof-why">{one.why}</span>
                    <span className="prof-hops">{inspect ? t('g6b.profile.visitFrom', { from: content(one.fromWorld), since: content(one.since) }) : writtenMoment(one.since)}</span>
                    {one.until === null ? null : (
                      <>
                        <span className="prof-key">{t('g6b.profile.until')}</span>
                        <span className="prof-when">{writtenMoment(one.until)}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
  )

  /* YOUR OWN PICTURE, NAME AND STATUS, THROUGH THE CONTROL THE SETTINGS PAGE DRAWS. The same
     component and the same two routes; nothing about the rules is decided twice. */
  const yourOwn = !yours ? (
            kind === 'person' ? (
              <p className="prof-not-yours">{t('g6b.profile.notYours')}</p>
            ) : null
          ) : (
            <Panel declares={{ surface: 'profile.yours' }} titleIs="label" title={t('g6b.profile.yours')}>
              <YourAppearance
                person={who}
                presence={said.presence.choice}
                busy={saving}
                fault={fault}
                onPresence={(choice) => {
                  setSaving('presence')
                  run(api.changeParticipant('person', who.id, { presence: choice }))
                }}
                onPresenceForgotten={() => {
                  setSaving('presence')
                  run(api.changeParticipant('person', who.id, { presence: '' }))
                }}
                onPicked={onChanged}
                onName={(name) => {
                  setSaving('name')
                  run(api.changeParticipant('person', who.id, { name }))
                }}
                onState={(state) => {
                  setSaving('state')
                  run(api.changeParticipant('person', who.id, { state }))
                }}
                onPicture={(bytes) => {
                  setSaving('picture')
                  run(api.sendAvatar('person', who.id, { bytes }))
                }}
              />
              {/* HOW YOU WISH TO BE ADDRESSED, the four boxes and one save. Drawn only here, on a
                  person's own page. An agent sets its own with its own key, and no page does it. */}
              <YourAddressAs personId={who.id} addressAs={who.addressAs} onChanged={onChanged} />
            </Panel>
          )

  /* THE KEYS THIS ONE HOLDS, EACH WITH ITS REVOKE PRESS. Drawn under the page since the Embassy
     sent its presses here; on an agent's page it stands with Retire at the foot, by answer 7 of the owner's
     decision. It is there because both take access away and neither is why a reader came. */
  const keys = <RevokeTheirKey who={{ kind, id: who.id }} />

  /* THE PRESS THAT CLOSES THIS AGENT, problem zyCcJYCLsAe7. It is last on the page because
     nobody has to do it: it is a rare act on a row a reader mostly came to read, and the sixth
     rule weighs a thing by whether somebody must act on it. Above the card it was the first
     thing said about a citizen, which is not what a citizen is.

     THE PRESS IS DRAWN FOR WHOEVER MAY PRESS IT, AND THE ANSWER COMES FROM THE REPLY.
     Criterion P82. The rule is the rank rule in src/server/api/participants.ts, and the server
     is the only place it is worked out: the page would need its own copy of the power tree to
     decide, which is one permission in two places. Where the reader may not, the panel is
     still drawn with the door's own sentence and no press, so a reader is told who may rather
     than meeting a control that is refused or a panel that is silently missing. */
  const retire = kind !== 'agent' || who.retired === true || said.mayRetire === null ? null : (
    <RetireThisAgent who={who} may={said.mayRetire} onChanged={onChanged} />
  )

  if (kind === 'agent') {
    /**
     * AN AGENT'S PAGE IS ONE COLUMN, by the owner's decision on the proposal of report bBeOH2QwTAcJ, which took
     * all seven answers as recommended. In this order: the head; the card it asked for, when it
     * asked, because that needs the person (R6); the raise, second, because giving authority is the act the
     * person comes here for (answer 3), with the page's one primary press at the foot of its form (answer 1); the
     * card, its name and picture only, with a row to the Role cards page (answer 4); then what is known about it;
     * and last, apart, the two presses that take access away, Revoke and Retire, together (answer 7).
     *
     * IT IS NOT SET SIDE BY SIDE. A decision sets two kinds of section side by side on a wide
     * window. The owner's later decision took a one-column agent page, so the raise, the
     * card and the facts stand in the order above at every width, on one label column. A
     * person's page keeps the two columns.
     */
    return (
      <div className="prof-one">
        {head}
        {retiredNotice}
        {/* THE PERSON'S OWN TAGS FOR IT stand under the head, because the head holds no press. */}
        <PersonalAgentTags agent={who.id} />
        {/* THE CARD IT ASKED FOR, AND THE PERSON'S PRESS. F15 point 2: the ask used to be a 409 an agent could
            only say out loud in a terminal. It waits here and on GET /api/needs-you until the person presses. */}
        {said.cardAsk === null ? null : <TheCardAsk ask={said.cardAsk} onChanged={onChanged} />}
        {/* ITS NEW NAME THAT WAITS, AND THE PERSON'S PRESS TO APPROVE OR REFUSE IT, with its earlier names (item 42). */}
        <AgentRenames agentId={who.id} onChanged={onChanged} />
        {/* WHETHER IT MAY ACT FOR THE PERSON, AND WHICH CARD IT HOLDS. Criterion P64: appointing a role
            and choosing for how long belong on the agent's profile in the Embassy. Both presses are
            the person's, both routes refuse every other caller, and the refusal is shown where the press was —
            the arrangement every other act of theirs has here. */}
        <TheRaise said={said} onChanged={onChanged} />
        <TheirCard said={said} onChanged={onChanged} />
        {broadcasts}
        {facts}
        {handover}
        {/* ITS LIVE VIEW AND THE WAY BACK, wave 13u's three parts (a decision, agreed in message kS6lqIJaMnc7): the
            terminals the office holds, then its own pane when it runs on this computer, or its steps when it runs in
            a sandbox (each draws nothing otherwise), and under them the command that brings it
            back. Each takes the agent and nothing else, and reads what it shows itself. */}
        <AgentTerminals agentId={who.id} />
        <AgentLiveTerminal agentId={who.id} />
        <AgentLiveSteps agentId={who.id} />
        {/* THE QUICK INPUTS IT ASKED FOR, and when the next may be typed for it (wave 13u round 21). It reads its own asks. */}
        <AgentQuickInputs agentId={who.id} />
        <AgentWayBack agentId={who.id} />
        {addressAs}
        {workArea}
        {releases}
        {inject}
        <HowItLooksOnTheMap agentId={who.id} />
        {/* A PERMANENT RESIDENT'S OWN SECTION: its residency, its personal space and who may read it, or for an agent
            that is not one the rows of any open proposal to make it one. How it wishes to be
            addressed and its heartbeat are left out there, because this page draws them already. */}
        <ResidentSection agent={who} onTheProfile />
        {/* A PERMANENT RESIDENT'S SLEEP, HEARTBEAT AND NAMING, its
            sleep presses, and beside its compactions the office flow of its newest run here (round 47). It draws
            nothing for an agent that is not a resident. */}
        <ResidentSleepPlace agentId={who.id} newestRun={said.agentRuns?.runs[0]?.id ?? null} />
        {runs}
        {loginsWeek}
        {answering}
        {machines}
        {proposedName}
        {filed}
        {visits}
        {/* MOVING IT TO ANOTHER PROJECT, the person's press, from wave 13u round 184. It is
            rare and changes much, so it sits low, just above the foot that takes its access away. It reads what would
            move and what would stay itself. */}
        <AgentProjectMove agentId={who.id} />
        <AgentStarterMove agentId={who.id} />
        <div className="prof-away" data-part="take-access-away">
          {keys}
          {retire}
        </div>
      </div>
    )
  }

  return (
    <>
      {head}
      {/* THE CARD AND THE FACTS ARE TWO KINDS, so they stand side by side on a wide window by the
          shared rule, item 2 of a decision: the card this one holds on the left, what is known
          about them on the right. This is a person's page; an agent's page
          is one column since the owner's decision named above. */}
      <SideBySide className="prof-sides">
        <div data-column="start" className="prof-col">
          {/* WHICH CARD YOU HOLD, WHAT YOU DO, AND THE PICTURE ON IT. Criterion P52: the role card could not
              be changed on the profile. Drawn only on your own page, which is what
              the door that writes it allows; on anybody else's it would be a press always refused. */}
          {yours ? <YourCard said={said} onChanged={onChanged} /> : null}
        </div>
        <div data-column="end" className="prof-col">
          {broadcasts}
          {workArea}
          {runs}
          {loginsWeek}
          {inject}
          {facts}
          {addressAs}
          {answering}
          {proposedName}
          {filed}
          {machines}
          {visits}
          {yourOwn}
        </div>
      </SideBySide>
      {keys}
    </>
  )
}

/**
 * HOW THIS AGENT LOOKS ON THE OFFICE MAP, AND THE PRESS THAT OPENS ITS EDITOR. It was a bare button drawn under the
 * page, outside every panel (the drawing's item 8); since the owner's decision it is a panel among the facts about
 * the agent, with a plain press.
 */
function HowItLooksOnTheMap({ agentId }: { agentId: string }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <Panel declares={{ surface: 'profile.map' }} titleIs="label" title={t('g6b.profile.mapAppearance')}>
      <Btn variant="ghost" onClick={() => setOpen(!open)}>
        {t(open ? 'agentPage.map.close' : 'agentPage.map.change')}
      </Btn>
      {open ? <PixelAppearanceEditor agentId={agentId} /> : null}
    </Panel>
  )
}

/**
 * ONE LABEL AND ONE VALUE, with the words for missing where there is no value.
 *
 * `missing` is drawn quieter than a value and is never dressed as one, so a reader can tell "nobody
 * has said" from something somebody said. `says` is the sentence that explains an absence that has
 * more than one possible reason.
 */
function Fact({
  label,
  value,
  missing,
  says,
}: {
  label: string
  value: string | null | undefined
  missing: ReactNode
  says?: string
}) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="prof-fact">
      <dt className="prof-label">{label}</dt>
      <dd className="prof-value" data-empty={empty ? 'yes' : 'no'}>
        {empty ? missing : value}
        {says === undefined ? null : <span className="prof-says-inline">{says}</span>}
      </dd>
    </div>
  )
}

/**
 * THE FOUR PARTS OF HOW SOMEBODY WISHES TO BE ADDRESSED, one label and one value each.
 *
 * EACH VALUE IS DRAWN AS WRITTEN. By a decision, the values are content and are never
 * translated. A missing part draws the word list's short mark through Fact.
 */
function HowToAddress({ who, yours }: { who: ParticipantOnTheWire; yours: boolean }) {
  useLanguage()
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const setter = who.addressAsSetBy
  let setBy: string | null = null
  if (setter == null) {
    if (ADDRESS_AS_PARTS.some((part) => who.addressAs[part] !== undefined)) setBy = t('address.setBeforeRecording')
  } else {
    const actor = getActor()
    const own = setter.kind === who.kind && setter.id === who.id
    const known = own ? who : participants.status === 'ready'
      ? [...participants.value.people, ...participants.value.agents].find((one) => one.kind === setter.kind && one.id === setter.id)
      : undefined
    const at = content(setter.at)
    if (setter.kind === 'person' && actor.type === 'human' && setter.id === actor.id) {
      setBy = t('address.setByYou', { at })
    } else if (known !== undefined) {
      // The stamp gives no past role. A different agent is named without claiming which card it held.
      setBy = t(own ? setter.kind === 'agent' ? 'address.setBySelfAgent' : 'address.setBySelfPerson' : 'address.setByNamed', {
        name: content(known.name), at,
      })
    } else {
      setBy = t(setter.kind === 'agent' ? 'address.setByUnknownAgent' : 'address.setByUnknownPerson', { at })
    }
  }
  return (
    <Panel
      declares={{ surface: 'profile.addressas' }}
      titleIs="label"
      title={t(yours ? 'address.titleYours' : 'address.titleTheirs')}
    >
      <dl className="prof-facts prof-address-as">
        {ADDRESS_AS_PARTS.map((part) => (
          <Fact
            key={part}
            label={t(`address.part.${part}`)}
            value={content(who.addressAs[part])}
            missing={t('address.notSet')}
          />
        ))}
      </dl>
      {setBy === null ? null : <p className="prof-address-as-set-by">{setBy}</p>}
    </Panel>
  )
}

/**
 * A PERSON SETS HOW THEY WISH TO BE ADDRESSED: four boxes and one save.
 *
 * THE BOXES START FROM WHAT IS STORED. A part nobody has set starts empty, so nothing is put in a
 * box that the person did not write. An empty box clears that part, because the door replaces the
 * whole field and stores an empty part as not set.
 *
 * WHO MAY SET IT AND WHAT A VALUE MAY BE ARE THE DOOR'S RULES. The boxes have no length limit of
 * their own: the door checks each value, and its refusal is drawn by its code where it has one.
 */
function YourAddressAs({
  personId,
  addressAs,
  onChanged,
}: {
  personId: string
  addressAs: AddressAs
  onChanged: () => void
}) {
  useLanguage()
  const [typed, setTyped] = useState<Record<AddressAsPart, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<unknown>(null)
  const serverFault = fault instanceof ApiError && fault.status > 0 && fault.fault?.kind !== 'unreachable'

  const start = (): void => {
    setFault(null)
    setTyped(
      Object.fromEntries(ADDRESS_AS_PARTS.map((part) => [part, addressAs[part] ?? ''])) as Record<AddressAsPart, string>,
    )
  }

  const save = (): void => {
    if (typed === null) return
    setBusy(true)
    setFault(null)
    api
      .setAddressAs('person', personId, typed)
      .then(() => {
        setBusy(false)
        setTyped(null)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(err)
      })
  }

  return (
    <div className="prof-address-as-edit">
      {typed === null ? (
        <p className="prof-address-as-open">
          <Btn onClick={start}>{t('address.change')}</Btn>
        </p>
      ) : (
        <div className="prof-address-as-form">
          {/* THE BOXES ARE HEADED, because the lines above them in this panel carry a name too:
              without the heading, a second "name" under the first reads as the same field twice. */}
          <h3 className="prof-address-as-head">{t('address.titleYours')}</h3>
          {ADDRESS_AS_PARTS.map((part) => (
            <label key={part} className="prof-address-as-field">
              <span className="prof-label">{t(`address.part.${part}`)}</span>
              <input
                type="text"
                name={part}
                value={content(typed[part])}
                onChange={(event) => {
                  setTyped({ ...typed, [part]: event.target.value })
                }}
              />
            </label>
          ))}
          <p className="prof-address-as-presses">
            <Btn
              variant="primary"
              onClick={save}
              disabled={busy}
              reason={busy ? t('address.saving') : undefined}
            >
              {t('address.save')}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setTyped(null)
                setFault(null)
              }}
            >
              {t('address.leave')}
            </Btn>
          </p>
        </div>
      )}
      {fault === null ? null : (
        <div className="prof-address-as-failure" role="status">
          {/* THE DOOR'S REFUSAL, IN THE READER'S LANGUAGE. The door gives each of its refusals a code
              (src/shared/refusal-codes.ts), and ErrorNote draws a coded refusal from the word lists in
              the page's language. A refusal with no code is drawn as the door wrote it. Wave 13q's
              E1 left this card drawing the door's English sentence (report h3Rjf86iBrO5). */}
          {serverFault ? (
            <ErrorNote message={fault.message} fault={fault.fault} label={t('address.faultLead')} />
          ) : (
            <p className="prof-address-as-fault">{t('address.faultUnconfirmed')}</p>
          )}
        </div>
      )}
    </div>
  )
}

export const PROFILE_CSS = `
/* HOW SOMEBODY WISHES TO BE ADDRESSED. The editor sits under the
   picture, name and status on a person's own page, with a rule above it. Each box takes the width
   it is given and no more, so a box never runs past the panel at 390. */
.prof-address-as-edit { display: flex; flex-direction: column; gap: var(--pad); margin-top: var(--pad); padding-top: var(--pad); border-top: 1px solid var(--border); min-width: 0; }
.prof-address-as-open { margin: 0; }
.prof-address-as-head { margin: 0; font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text); }
.prof-address-as-form { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.prof-address-as-field { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.prof-address-as-field input { flex: 1 1 12rem; min-width: 0; max-width: 24rem; }
.prof-address-as-presses { margin: 0; display: flex; flex-wrap: wrap; gap: var(--pad); }
.prof-address-as-fault { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-2); color: var(--st-failed); overflow-wrap: anywhere; }
.prof-address-as-failure > p { margin: 0; }
.prof-address-as-set-by { margin: var(--pad) 0 0; max-width: var(--measure-in-box); font-size: var(--fs-2); color: var(--text-3); overflow-wrap: anywhere; }

/* THE PRESS THAT CLOSES AN AGENT. */
.prof-retire { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.prof-retire-why { flex: 1 1 14rem; min-width: 0; max-width: 24rem; }

.prof { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

/* AN AGENT'S PAGE, ONE COLUMN, as was decided: at most 60rem wide, every part one under the other at every
   width, and every fact on one label column, the one the raise's form and the card use (THEIR_CARD_CSS): a 9rem label
   in sentence case, a 16 pixel gap, the value. At 40rem and below the label stands above its value. */
.prof-one { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; width: 100%; max-width: 60rem; }
.prof-one .prof-fact { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: 4px 16px; align-items: baseline; }
.prof-one .prof-label {
  min-width: 0; letter-spacing: 0; text-transform: none;
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .prof-one .prof-fact { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
/* TAKING ACCESS AWAY, LAST AND TOGETHER (answer 7): the keys with their Revoke presses, then Retire. */
.prof-away { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.prof-away:empty { display: none; }
/* The two columns keep the page's own spacing between panels, inside each and between the two. */
.prof-sides { gap: var(--gut); }
.prof-col { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.prof-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--gut); min-width: 0; }
.prof-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.prof-kind {
  margin: 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.prof-name { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.prof-presence { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.prof-presence-word { font-size: var(--fs-2); color: var(--text-2); }
.prof-presence-says { font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

.prof-facts { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.prof-fact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.prof-label {
  margin: 0;
  min-width: 8rem;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.prof-value { margin: 0; font-size: var(--fs-2); color: var(--text); min-width: 0; overflow-wrap: anywhere; }
/* NOBODY HAS SAID, DRAWN QUIETER THAN AN ANSWER. It must never read as a value somebody set. */
.prof-value[data-empty='yes'] { color: var(--text-3); font-style: italic; }
.prof-says-inline { display: block; font-size: var(--fs-1); font-style: normal; color: var(--text-3); }

.prof-says { margin: 0 0 var(--pad) 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-3); }
.prof-none { margin: 0; font-size: var(--fs-2); font-style: italic; color: var(--text-3); }

.prof-answering { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.prof-how { font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.prof-says { overflow-wrap: anywhere; }
/* A REASON A PERSON TYPED, in a box of several lines, keeps its line breaks when it is read back. */
.prof-said-why { white-space: pre-wrap; }

/* WHO REGISTERED THE WORK AREA, criterion P85. An aside under the paths and quieter than them, and
   a block rather than one line because wave 3 (P92-P95) adds a second sentence under the same
   heading. */
.prof-work-area-says { display: flex; flex-direction: column; gap: 2px; margin: var(--pad) 0 0 0; }
.prof-work-area-says p {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-1);
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.prof-filed, .prof-machines, .prof-visits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.prof-filed-row, .prof-machine, .prof-visit {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: var(--fs-2);
}
.prof-filed-link { color: var(--text); overflow-wrap: anywhere; }
.prof-key {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.prof-when, .prof-count, .prof-address, .prof-hops { color: var(--text-2); overflow-wrap: anywhere; }
.prof-why { color: var(--text); overflow-wrap: anywhere; }

.prof-not-yours { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-2); color: var(--text-3); }

/* THE AGENT'S RUNS, criterion P91. One row per run, separated by a rule; each value that nobody
   recorded is drawn quieter than a value somebody did. The timeline place is set apart because it
   is an explanation and not a measurement. */
.prof-runs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.prof-run { display: flex; flex-direction: column; gap: 6px; min-width: 0; border-top: 1px solid var(--border); padding-top: var(--pad); }
.prof-run-head { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.prof-run-title { font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.prof-run-facts { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 1rem; min-width: 0; }
.prof-run-says { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }
.prof-timeline { margin-top: var(--pad); font-style: italic; }
/* WHAT IS SUMMED ON THE AGENT BESIDE THE TOKENS (wave 13k round 52): a label over a sentence or a short list. */
.prof-summed { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin-top: var(--pad); }
.prof-summed > .prof-label { margin: 0; }
.prof-declared { margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
`

/**
 * THAT THIS ROW IS RETIRED, AND WHY. Problem zyCcJYCLsAe7.
 *
 * IT DRAWS NOTHING ON A LIVE ROW, and no press: a closed row has nothing left to do to it. What it
 * draws is what was recorded — when and why — which is what a reader came to find out.
 *
 * IT IS SEPARATE FROM THE PRESS BELOW so the two can stand in different places on the page. The
 * notice is high, because a row being closed changes how everything under it reads; the press is
 * last, because nobody has to close a row.
 */
function RetiredNotice({
  who,
}: {
  who: ProfileReply['participant'] & { retiredBy?: ParticipantRef | null; retiredByHandle?: string | null }
}) {
  const inspect = useInspect()
  if (who.retired !== true) return null
  return (
    <Panel declares={{ surface: 'profile.retired' }} titleIs="label" title={t('g6b.profile.retired')}>
      <p className="prof-says prof-said-why">{who.retiredBecause ?? <Absence say title={t('g6b.profile.retiredNothingSaid')} />}</p>
      {/* AND WHOSE HAND, criterion P82: a retirement says who did it and why. The row has carried
          the retirer since problem zyCcJYCLsAe7 and no screen drew it, so a reader could see that a
          row was closed and not who closed it. Drawn only where one was recorded — a row retired
          before anybody was written down says nothing rather than naming nobody. */}
      {who.retiredBy == null ? null : (
        <p className="prof-when">
          <span className="prof-key">{t('g6b.profile.retiredBy')}</span>{' '}
          {inspect ? who.retiredByHandle ?? who.retiredBy.id : <ParticipantName kind={who.retiredBy.kind} id={who.retiredBy.id} />}
        </p>
      )}
      {who.retiredAt == null ? null : <p className="prof-when">{who.retiredAt}</p>}
    </Panel>
  )
}

/**
 * RETIRE THIS AGENT. Problem zyCcJYCLsAe7.
 *
 * A REASON IS REQUIRED, and the door says so too. The complaint was that a reader could not tell a
 * closed test agent from a live one, and a retirement with no reason recreates exactly that.
 *
 * AT REST IT IS A PRESS AND NOT A FORM, which is the rule tests/read-before-edit.test.ts holds every
 * page to: nothing on a page you are reading is a field standing open.
 *
 * A ROW ALREADY RETIRED NEVER REACHES HERE. The page draws `RetiredNotice` for it instead, and the
 * caller checks, so this component is only ever about a row that is still open.
 */
function RetireThisAgent({
  who,
  may,
  onChanged,
}: {
  who: ProfileReply['participant']
  /** Whether this reader may, and why not. The server's answer, criterion P82. Never decided here. */
  may: MayRetire
  onChanged: () => void
}) {
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')

  const retire = async (): Promise<void> => {
    await api.retireThisAgent(who.handle, why.trim())
    setAsking(false)
    onChanged()
  }

  /**
   * A READER WHO MAY NOT GETS THE SENTENCE AND NO PRESS. Criterion P82.
   *
   * The door's own words, so the page never composes a second version of the rule. Chapter 6's
   * sixth rule puts this quietly: nobody reading it has to do anything about it.
   */
  if (!may.may) {
    return (
      <Panel declares={{ surface: 'profile.retire' }} titleIs="label" title={t('g6b.profile.retire')}>
        <p className="prof-not-yours">{may.whyNot}</p>
      </Panel>
    )
  }

  return (
    <Panel declares={{ surface: 'profile.retire' }} titleIs="label" title={t('g6b.profile.retire')}>
      <p className="prof-says">{t('g6b.profile.retireSays')}</p>
      {!asking ? (
        <Btn variant="ghost" onClick={() => setAsking(true)}>
          {t('g6b.profile.retire')}
        </Btn>
      ) : (
        <div className="prof-retire">
          <div className="prof-retire-why">
            <TextArea rows={2} value={why} placeholder={t('g6b.profile.retireWhy')} aria-label={t('g6b.profile.retireWhy')} onChange={setWhy} />
          </div>
          {/* THE REASON IS WHAT MADE THE PAGE GO WHITE, and it is on the press now. Problem
              yYxbn3S06Y8c, measured in claim B37w7yXUxxt0: this button was drawn disabled with an
              empty box and no reason on it, `Btn` then refused to draw such a button and threw while
              drawing, and React unmounted the page before anything was sent. A disabled control
              that will not say what would enable it is a dead end; here it says. */}
          <TieredPress tier="confirm" press={t('g6b.profile.retire')} pending={t(why.trim() === '' ? 'g6b.profile.retireNeedsWhy' : 'g6b.profile.retiring')}
            disabled={why.trim() === ''}
            question={t('g6b.profile.retireQuestion')} quote={who.name}
            warning={t('g6b.profile.retireSays')} cancel={t('g6b.profile.retireKeep')} onPress={retire} />
          <Btn variant="ghost" onClick={() => setAsking(false)}>
            {t('g6b.profile.retireKeep')}
          </Btn>
        </div>
      )}
    </Panel>
  )
}

/**
 * WHO SAID HOW THIS AGENT READS RELEASES, in one sentence with when and why. The owner; the agent itself, whose own
 * key the door stores as its registry id; or another agent. The door lets another agent say it only under a raise the
 * owner gave it (`whyThisReleaseReadingWriteIsRefused`), so that sentence names the agent and says so.
 */
export function whoSaidTheReleaseReading(
  said: NonNullable<ReleaseReadingReply['readsReleasesFromTheCheck']>,
  agentId: string,
  participants: ParticipantsNamed | undefined,
  zone: string | null,
): string {
  const values = { when: broadcastTimeInWords(said.at, zone), because: said.because }
  if (said.by.kind === 'person') return t('releaseReading.byTheOwner', values)
  if (said.by.id === agentId) return t('releaseReading.byItself', values)
  return t('releaseReading.byARaisedSecretary', { ...values, who: writerNamed({ actorType: 'agent', actorId: said.by.id }, participants) })
}

/**
 * AN AGENT'S CURRENT HANDOVER, drawn from the profile reply. The server decides whether this reader may read it, by the
 * handover door's own rule, so a page never shows a handover the door would refuse.
 */
export function TheHandover({ part }: { part: TheHandoverPart }) {
  const current = part.current
  return (
    <Panel declares={{ surface: 'profile.handover' }} titleIs="label" title={t('handoverPlace.title')}>
      {!part.read ? (
        <p className="prof-says">{t('handoverPlace.notRead')}</p>
      ) : current === null ? (
        <p className="prof-none">{t('handoverPlace.none')}</p>
      ) : (
        <>
          <p className="prof-handover-text" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current.text}</p>
          <p className="prof-when">{t('handoverPlace.written', { when: writtenMoment(current.writtenAt) })}</p>
          <p className="prof-says">
            {current.sessionId === null ? (
              t('handoverPlace.inNoRun')
            ) : (
              <>
                {t('handoverPlace.inRun')}{' '}
                <RouteLink to={recordPath(current.sessionId)} className="prof-filed-link">{current.sessionId}</RouteLink>
              </>
            )}
          </p>
          {part.earlier === 0 ? null : <p className="prof-says">{t('handoverPlace.earlier', { n: String(part.earlier) })}</p>}
        </>
      )}
    </Panel>
  )
}

/** Whether a release wakes this agent, said in words, and the press that changes it. */
function ReleaseReading({ agentId, zone }: { agentId: string; zone: string | null }) {
  const [reply, readAgain] = useProjectAsync(() => api.releaseReading(agentId), [agentId])
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const actor = getActor()
  const mayChange = actor.type === 'human' || actor.id === agentId
  const [editing, setEditing] = useState(false)
  const [because, setBecause] = useState('')
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [saving, setSaving] = useState(false)
  if (reply.status === 'loading') return null
  if (reply.status === 'error') {
    return (
      <Panel declares={{ surface: 'profile.releases' }} titleIs="label" title={t('releaseReading.title')}>
        <ErrorNote message={reply.message} fault={reply.fault} retry={readAgain} />
      </Panel>
    )
  }
  const said = reply.value.readsReleasesFromTheCheck
  const on = said?.on === true
  return (
    <Panel declares={{ surface: 'profile.releases' }} titleIs="label" title={t('releaseReading.title')}>
      <p className="prof-says">{t(said === null ? 'releaseReading.nobody' : on ? 'releaseReading.on' : 'releaseReading.off')}</p>
      {said === null ? null : (
        <p className="prof-says prof-said-why">
          {whoSaidTheReleaseReading(said, agentId, participants.status === 'ready' ? participants.value : undefined, zone)}
        </p>
      )}
      {!mayChange ? null : editing ? (
        <form style={{ display: 'grid', gap: '0.75rem' }} onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          void api.sayReleaseReading(agentId, !on, because)
            .then(() => { setEditing(false); setBecause(''); readAgain() })
            .catch((why: unknown) => setError({ message: errorMessage(why), fault: faultOf(why) }))
            .finally(() => setSaving(false))
        }}>
          <label>{t('releaseReading.why')}
            <TextArea rows={2} required value={because} onChange={setBecause} />
          </label>
          <Btn type="submit" disabled={saving} reason={t('releaseReading.saving')}>{t('releaseReading.save')}</Btn>
          <Btn type="button" variant="ghost" onClick={() => setEditing(false)}>{t('releaseReading.cancel')}</Btn>
          {error === null ? null : <ErrorNote message={error.message} fault={error.fault} />}
        </form>
      ) : (
        <Btn variant="ghost" onClick={() => { setError(null); setEditing(true) }}>
          {t(on ? 'releaseReading.turnOff' : 'releaseReading.turnOn')}
        </Btn>
      )}
    </Panel>
  )
}

/**
 * THE PERSON'S PRESS THAT SKIPS A SECRETARY'S NEXT BROADCAST. The owner decided that a quiet day needs no
 * report.
 * Drawn for the person only, while the schedule runs and its next slot is not already skipped. The door also
 * lets the secretary itself say it, and refuses everybody else in words, which this press shows.
 */
function SkipTheNextBroadcast({ agent, reading, onChanged }: { agent: string; reading: BroadcastReading; onChanged: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const next = reading.next
  if (getActor().type !== 'human' || !reading.on || next === null || reading.skipped?.at === next.at) return null
  return (
    <>
      <Btn variant="ghost" disabled={saving} reason={t('broadcast.skip.pressing')} onClick={() => {
        setSaving(true)
        setError(null)
        void api.skipABroadcast(agent, next.at)
          .then(() => onChanged())
          .catch((why: unknown) => setError({ message: errorMessage(why), fault: faultOf(why) }))
          .finally(() => setSaving(false))
      }}>{t('broadcast.skip.press')}</Btn>
      {error === null ? null : <ErrorNote message={error.message} fault={error.fault} />}
    </>
  )
}

function WorkArea({ said, onChanged, inspect }: { said: ProfileReply; onChanged: () => void; inspect: boolean }) {
  const who = said.participant
  const actor = getActor()
  const mayChange = actor.type === 'human' || (who.startedBy?.kind === 'agent' && who.startedBy.id === actor.id)
  const [editing, setEditing] = useState(false)
  const [area, setArea] = useState((who.workArea ?? []).join('\n'))
  const [because, setBecause] = useState('')
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [saving, setSaving] = useState(false)
  if (!inspect && !mayChange) return null
  return (
    <Panel declares={{ surface: 'profile.workarea' }} titleIs="label" title={t('g6b.profile.workArea')}>
      {editing ? (
        <form style={{ display: 'grid', gap: '0.75rem' }} onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          void api.changeWorkArea(who.id, area.split('\n').filter((line) => line.trim() !== ''), because)
            .then(() => { setEditing(false); setBecause(''); onChanged() })
            .catch((why: unknown) => setError({ message: errorMessage(why), fault: faultOf(why) }))
            .finally(() => setSaving(false))
        }}>
          <label>{t('g6b.profile.files')}
            <textarea className="px-input" rows={4} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label>{t('g6b.profile.areaWhy')}
            <TextArea rows={2} required value={because} onChange={setBecause} />
          </label>
          <Btn type="submit" disabled={saving} reason={t('g6b.profile.areaSaving')}>{t('g6b.profile.areaSave')}</Btn>
          <Btn type="button" variant="ghost" onClick={() => setEditing(false)}>{t('g6b.profile.cancel')}</Btn>
          {error === null ? null : <ErrorNote message={error.message} fault={error.fault} />}
        </form>
      ) : (
        <>
          {/* AN EMPTY WORK AREA SAYS "—" ON THE NORMAL PAGE TOO, as the recent-records and trips cards
              do (round 38, review AEczCyDHb-Xu). A filled one is listed in developer mode only. */}
          {inspect || (who.workArea ?? []).length > 0 ? null : (
            <p className="prof-none"><Absence say title={t('g6b.profile.noWorkArea')} /></p>
          )}
          {!inspect ? null : <>
          {who.workArea == null ? <p><Absence /></p> : who.workArea.length === 0 ? <p><Absence /></p> : (
            <ul style={{ overflowWrap: 'anywhere' }}>{who.workArea.map((path, i) => <li key={i}>{path}</li>)}</ul>
          )}
          {/* WHO REGISTERED THIS WORK AREA, criterion P85, in the words of the record's own mark.
              The sentence is worked out by the shared sentence-maker, so this component never
              restates it, and it says nobody recorded it where there is no mark rather than leaving
              a gap. THE BLOCK HAPPENS TO HOLD ONE LINE TODAY AND IS WRITTEN TO HOLD TWO: wave 3
              (P92-P95) adds a second sentence under this heading, about an area registered before
              the rule, below this one and without touching it. */}
          <div className="prof-work-area-says">
            <p>{whoRegisteredTheWorkAreaSays(said.workAreaChange, t)}</p>
          </div>
          {/* AND, WHERE IT PREDATES THE WORK-AREA RULE, THE SENTENCE SAYING SO. Criterion P92 and
              the secretary's ruling of 12 September 2026: an area stored before the rule keeps
              working and is never refused after the fact, and the page says so with the date. A
              separate block from the one above, because that one is P85's and holds one sentence. */}
          {said.workAreaBeforeTheRule === null ? null : (
            <div className="prof-work-area-before-rule">
              <p>{said.workAreaBeforeTheRule}</p>
            </div>
          )}
          {/* AND, WHERE THIS AREA OVERLAPS ANOTHER AGENT'S, THE SENTENCE SAYING SO. Criterion P95.
              The overlap opened a group and refused nothing, and both citizen pages say so. */}
          {said.workAreaOverlap === null ? null : (
            <div className="prof-work-area-overlap">
              <p>{said.workAreaOverlap}</p>
            </div>
          )}
          </>}
          {mayChange ? <Btn variant="ghost" onClick={() => {
            setArea((who.workArea ?? []).join('\n')); setError(null); setEditing(true)
          }}>{t('g6b.profile.areaChange')}</Btn> : null}
        </>
      )}
    </Panel>
  )
}
