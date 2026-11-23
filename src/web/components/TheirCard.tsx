// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t, wordLanguage } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * `Card` — WHICH CARD AN AGENT HOLDS, AND WHETHER IT MAY ACT FOR THE PERSON. Criterion P64.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Appointing a secretary does not belong on the role cards page. The role cards describe.
 * Appointing a role, and choosing
 * for how long, belong on the role profile reached from the Embassy, and pressing into that
 * profile could change nothing.
 *
 * So the two presses are here and the Role cards page has neither. The cards page keeps the
 * description of what acting for them IS, because that is a description.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS DRAWN ON EVERY AGENT'S PAGE, TO EVERYBODY, BECAUSE MOLE OFFICE AUTHENTICATES NOBODY
 * ---------------------------------------------------------------------------------------
 *
 * The browser writes as the person, both routes refuse every other caller, and the refusal is shown
 * where the press was. That is the arrangement every other act of theirs has here. A control hidden by
 * a guess about who is looking would be a rule this product cannot keep, and the panel beside this
 * one — a person's own card — is drawn on that same rule read the other way: it is the one page the
 * door allows, and this is a door the person may use on any agent's page.
 *
 * WHAT DECIDES WHETHER THE ELEVATION HALF IS DRAWN IS THE SERVER. `theCardTheyHold.elevation` is null
 * on a card the declaration does not let act for them, which is `mayBeElevated` — the same reading the
 * route refuses with. A page that decided for itself would offer a press that is always refused.
 */

import { useState } from 'react'

import { api, errorMessage, faultOf, getActor, type Fault, type ProfileReply } from '../api.ts'
import { TieredPress } from './TieredPress.tsx'
import { WhatTheGrantCarries } from './WhatTheGrantCarries.tsx'
// THE RAISE'S END, CHOSEN AND NOT TYPED.
import { RaiseEndChoice, howLongInWords, whenInWords } from './RaiseEndChoice.tsx'
import { momentOfStampInZone } from '@shared/time.ts'
import { actingForHead, theEndOfTheLine } from '../lib/acting-line.ts'
import { wordWithSpacedValues } from '@shared/spacing.ts'
import { thePress } from '@shared/the-press.ts'
import { useInspect } from '../lib/mode.ts'
import { NotebookNumbers, ParticipantName } from '../pages/NotebookPage.tsx'
import { Absence, Btn, ErrorNote, Panel, ServerNote, TextArea } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { ThePressReason } from './ThePressReason.tsx'
// THE LIMIT ON A GOVERNANCE ACT, DRAWN AND NEVER RETYPED. Criteria P20 and P16: this is the one
// exported sentence, and a second copy of it is the defect P16 exists to stop.
import { RouteLink, pathFor, notebookPath, recordPath } from './router.tsx'
import { theCrossOriginOfALoad, whereRequestsGo } from '../lib/visiting.ts'
import { OpensLarge } from './PictureLarge.tsx'
import { smallPortrait } from '@shared/portraits.ts'
import { whatAdmittingSays, type AGrantToWithdraw, type ProfileFacts, type TheAgentsRuns, type TheCardDrawn, type TheCardTheyHold, type WaitingCardAsk, type WhatAnAskShows } from '@shared/profile.ts'
import { theModelsName } from '@shared/model-names.ts'
import { theModelThatAnsweredSentence } from '@shared/session-page.ts'
// WHO CHOSE THE CARD, in the one sentence the Embassy row draws too. Criterion P75.
import { whoChoseTheCardSays, type ElevationHeld, type ActUnderThePeriod, type SayWhoChoseTheCard } from '@shared/roles.ts'
import { actorTypeWord } from '@shared/words.ts'
import {
  type NotebookOnACard,
} from '@shared/notebook.ts'

export function TheirCard({ said, onChanged }: { said: ProfileReply; onChanged: () => void }) {
  useLanguage()
  const held = said.theCardTheyHold
  if (held === null) return null
  return (
    <Panel declares={{ surface: 'profile.theircard' }} titleIs="label" title={t('g6b.profile.card')}>
      <style href="mole-office-their-card" precedence="default">
        {THEIR_CARD_CSS}
      </style>
      {/* THE CARD ITSELF, ABOVE THE PRESS THAT CHANGES IT. Criterion P71: after a press, the Card part shows the
          role card and its description. The card is what a reader came here to see, so
          it is drawn first and the press to give another one sits under it. Since answer 4 of the
          owner's decision, the card here is its picture, its name and its rung; its duties and How it works
          are on the Role cards page, which the row under the notebook opens. */}
      <TheCardItself said={held} />
      {said.agentRuns === null ? null : <ItsModel runs={said.agentRuns} />}
      <WhichCard handle={said.participant.handle} said={held} onChanged={onChanged} />
      {/* THE WAY INTO ITS NOTEBOOK, criteria N1 to N4. Only on the card that can act for the person,
          which is the secretary's card: `elevation` is null on every other card, and that is the
          reply already saying which one this is rather than this file naming it. The notebook
          sits under the agent, so the way in is on the agent's page. */}
      {held.notebook === null ? null : (
        <ItsNotebook handle={said.participant.handle} notebook={held.notebook} />
      )}
      {/* WHAT THE CARD DOES, ON THE ROLE CARDS PAGE. By the owner's answer 4, the card's duties and How it works
          left this page, so a row here leads to the page that holds them. */}
      {held.card === null ? null : (
        <p className="tc-card-all">
          <RouteLink to={pathFor('roles')} className="tc-card-all-link">
            <span className="tc-card-all-title">{wordWithSpacedValues(t, 'agentPage.card.whatItDoes', { card: cardWord(held.card.name) })}</span>
          </RouteLink>
        </p>
      )}
    </Panel>
  )
}

/**
 * WHICH MODEL ITS NEWEST RUN IN THIS PROJECT WAS STARTED ON, in the model's own name. Problem 2tbFWxiFyjtv: a person
 * weighs what an agent wrote by the model that wrote it, and had to ask to find out.
 *
 * IN THE PLAIN VIEW, because it is a fact about who wrote what, for the person reading it. The stored id is the
 * machine detail, so it is drawn only in developer mode; a model this office has no name for is said to be one
 * (`theModelsName` in @shared/model-names.ts), never shown as its id. The run is the newest `agentRuns` lists, the
 * one reading of which runs are this agent's here (`theAgentsRuns` in src/server/lib/agent-runs.ts). Its model is
 * the one it was started on; what the runtime then served is on the run's own page.
 */
function ItsModel({ runs }: { runs: TheAgentsRuns }) {
  const inspect = useInspect()
  const newest = runs.runs[0]
  let says: string
  if (newest === undefined) says = t('agentPage.model.noRunWord')
  else if (newest.model === null) says = t('agentPage.model.notRecorded')
  else {
    const name = theModelsName(newest.model)
    says = name === null ? t('agentPage.model.unnamed') : t('agentPage.model.named', { model: name })
  }
  // AND THE MODEL THAT ANSWERED, only when the runtime reported a different one: the run page's own sentence, from its one
  // reading (an engineering decision of wave 13q's round 39). "Not reported" adds nothing here.
  const answered = newest === undefined ? null : theModelThatAnsweredSentence(newest.model, newest.served, inspect)
  return (
    <p className="tc-model" data-testid="their-card-model">
      {says}
      {answered?.differs === true ? ` ${answered.text}` : null}
      {inspect && newest?.model != null ? (
        <>
          {' '}
          <code className="tc-model-id">{newest.model}</code>
        </>
      ) : null}
    </p>
  )
}

/**
 * ACTING FOR THEM: THE RAISE, AS ITS OWN SECTION. As answers 1 and 3 of the owner's decision set it, the raise is
 * second on the agent's page, above the card, and its press is the page's one primary press, at the foot of
 * its form. It was a part of the card panel until then. Nothing is drawn on a card the
 * declaration does not let act for them (`elevation` null).
 */
export function TheRaise({ said, onChanged }: { said: ProfileReply; onChanged: () => void }) {
  useLanguage()
  const elevation = said.theCardTheyHold?.elevation ?? null
  if (elevation === null) return null
  return (
    <Panel declares={{ surface: 'profile.raise' }} titleIs="label" title={t('g6b.profile.actingForYou')}>
      <style href="mole-office-their-card" precedence="default">
        {THEIR_CARD_CSS}
      </style>
      <TheElevation handle={said.participant.handle} name={said.participant.name} said={elevation} onChanged={onChanged} />
    </Panel>
  )
}

/**
 * THE ROLE CARD THIS AGENT HOLDS, DRAWN. Criterion P71.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME CARD THE ROLE CARDS PAGE DRAWS, FROM THE SAME PLACE
 * ---------------------------------------------------------------------------------------
 *
 * The name, the picture, the rung and the duties are the server's, read off the declaration by the
 * word the row is read as. Nothing here works any of them out, so the card at #/roles and the card
 * on this page cannot come to disagree — a two-way lookup,
 * one card looked at from two ends.
 *
 * WHAT IS NOT HERE. What the card must read, who appoints it, whom it appoints and what ends it are
 * on the card's own page. A profile carrying all of them would be the card page drawn twice, and
 * criterion P48 already refused that for the block at #/roles. Since the owner's decision, in its answer 4,
 * the duties and How it works are not here either: this page draws the name, the picture and the rung,
 * and a row that opens the Role cards page, where the rest of the card is. The reply still
 * carries the duties, so the restore read and the card message keep them.
 *
 * A CARD THE DECLARATION NO LONGER HOLDS SAYS SO. The investigator rung left the tree,
 * and a row written while it existed still names it. That is a state — the card
 * is gone — and it goes through `Absence` rather than being drawn as an empty card.
 */
/**
 * THE WAY INTO THIS SECRETARY'S NOTEBOOK. Criteria N1 to N4.
 *
 * A link and not a fold: the notebook is a list somebody reads and writes in, with a form and a
 * press on every row, and this page is a page somebody reads.
 */
function ItsNotebook({ handle, notebook }: { handle: string; notebook: NotebookOnACard }) {
  return (
    <div className="tc-notebook">
      <p className="tc-notebook-line">
        <RouteLink to={notebookPath('agent', handle)}>{t('g6b.profile.notebookOpen')}</RouteLink>
      </p>
      {/* Criterion N3: the server counts these values. NotebookNumbers draws the same translated
          labels here and on the Role cards page, and reads the last writer's name. */}
      {notebook.isThere ? (
        <dl className="tc-notebook-counts">
          <NotebookNumbers notebook={notebook} className="tc-notebook-count" />
        </dl>
      ) : (
        <p className="tc-notebook-none">
          <Absence say title={t('g6b.notebook.noNotebook')} />
        </p>
      )}
    </div>
  )
}

function TheCardItself({ said }: { said: TheCardTheyHold }) {
  const card: TheCardDrawn | null = said.card
  if (card === null) {
    return (
      <p className="tc-card-gone">
        <Absence tier="told-apart" looked word={t('g6b.profile.cardNotDeclared')} title={t('g6b.profile.cardNotDeclaredTitle')} />
      </p>
    )
  }
  return (
    <div className="tc-card">
      {/* THE PICTURE, from the card's own set. It is the card's face and not the agent's: the
          agent's own picture is at the top of this page, where a reader looks for a face. A small copy
          is drawn, and a press opens the whole picture. */}
      <OpensLarge src={whereRequestsGo(card.portrait)} crossOrigin={theCrossOriginOfALoad()} alt={t('g6b.cardPicture', { name: cardWord(card.name) })}>
        <img className="tc-card-portrait" src={whereRequestsGo(smallPortrait(card.portrait))} crossOrigin={theCrossOriginOfALoad()} alt={t('g6b.cardPicture', { name: cardWord(card.name) })} />
      </OpensLarge>
      <div className="tc-card-body">
        <div className="tc-card-top">
          <h3 className="tc-card-name">{cardWord(card.name)}</h3>
          <span className="tc-card-rung">
            {card.rung === null ? t('g6b.profile.cardNoRung') : t('g6b.profile.cardRung', { n: card.rung, steps: card.steps })}
          </span>
        </div>
        {/* THE WAY TO THE TREE ITSELF (the review of wave 13q's round 32). The number stays on the card, as the
            owner's decision says in answer 4. */}
        {card.rung === null ? null : (
          <p className="tc-card-step">
            <RouteLink to={pathFor('roles')} className="tc-card-tree">{t('g6b.profile.cardSeeTree')}</RouteLink>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * THE CARD IT HOLDS, AND THE PRESS THAT GIVES IT ANOTHER.
 *
 * AT REST IT IS A VALUE AND ONE PRESS. `tests/read-before-edit.test.ts` holds the rule that nothing
 * on a page you are reading can be typed into or chosen from, and the person's own card beside this
 * one already works that way for that reason.
 *
 * THE WORD NOBODY WROTE IS NEVER DRAWN AS THOUGH SOMEBODY HAD. A row with no card is read as the
 * worker card everywhere in this product; the value says nobody wrote one and the reading is beside
 * it, marked as a reading.
 */
function WhichCard({
  handle,
  said,
  onChanged,
}: {
  handle: string
  said: TheCardTheyHold
  onChanged: () => void
}) {
  const inspect = useInspect()
  const [editing, setEditing] = useState(false)
  const [card, setCard] = useState(said.role ?? said.readAs)
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  if (!editing) {
    return (
      <div className="tc-fact">
        <span className="tc-label">{t('g6b.profile.whichCard')}</span>
        <span className="tc-value">
          {said.says === null ? (
            said.role === null ? null : cardWord(said.role)
          ) : (
            <>
              <Absence say title={t('g6b.cardUnchosen')} />
              <span className="tc-read-as">
                {t('g6b.profile.cardReadAs')} {cardWord(said.readAs)}
              </span>
            </>
          )}
        </span>
        <Btn variant="ghost" onClick={() => setEditing(true)}>
          {t('g6b.profile.appoint')}
        </Btn>
        {/* AND WHO CHOSE THE CARD, criterion P75. It is the row's own stored mark, read and never
            worked out: a card the rule wrote and a card a starter chose are two facts about the same
            word, and before the mark existed the only way to tell them apart was the word being
            missing. A row with no mark says nobody recorded it — every row written before
            8 September 2026 — which is not the same as saying nobody chose it. */}
        {/* WHO GAVE THE CARD IS NOT MACHINERY (7FEOshq3mBGG b-6 names what normal mode may never show), so it is said in
            both modes. Its sentence is built in src/shared/roles.ts, which the server reads too, and said here in the page's
            language through the word lists (SAY_WHO_CHOSE_IT below), with the name spaced from the Chinese around it by
            gapBetween. */}
        <span className="tc-chosen-by">{whoChoseTheCardSays(said.chosenBy, said.chosenByHandle, SAY_WHO_CHOSE_IT)}</span>
      </div>
    )
  }

  const save = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .giveThisAgentACard(handle, card)
      .then(() => {
        setBusy(false)
        setEditing(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  return (
    <div className="tc-field">
      <label className="tc-label" htmlFor="mole-office-their-card">
        {t('g6b.profile.whichCard')}
      </label>
      <select
        id="mole-office-their-card"
        className="px-select tc-pick"
        value={card}
        onChange={(e) => setCard(e.target.value)}
      >
        {/* THE CARDS AN AGENT MAY HOLD, AND ONLY THOSE. The list is the server's, from the cards
            list of the declaration; a card a person holds is never offered here. */}
        {said.cardsOnOffer.map((one) => (
          <option key={one} value={one}>
            {cardWord(one)}
          </option>
        ))}
      </select>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <div className="tc-acts">
        <Btn onClick={save} disabled={busy} reason={busy ? t('g6b.profile.appointing') : undefined}>
          {t('g6b.profile.appoint')}
        </Btn>
        <Btn variant="ghost" onClick={() => setEditing(false)}>
          {t('g6b.profile.keepTheCard')}
        </Btn>
      </div>
    </div>
  )
}

/**
 * THE CARD THIS AGENT ASKED THE PERSON FOR, AND THE PRESS THAT ANSWERS IT. F15 point 2; criterion P65.
 *
 * The ask used to be a 409 to an agent whose starter is the person, and the agent had no way to turn
 * "please give me a card" into a press on their screen. It waits on GET /api/needs-you and here, and
 * this draws the two presses. The sentence saying what the press does is the server's own `says`, so
 * this page and the needs-you list cannot describe the ask differently.
 *
 * ONE PRESS IS ENOUGH. Where the ask is also a session that registered itself and waits for their
 * press, granting it admits the agent and gives the card together, and the server does both; the
 * sentence says so. Where the ask is an agent asking for a new key, granting it revokes the agent's
 * keys and lets it ask once for a new one. The button is named by `press`, which the server sends.
 *
 * IT IS DRAWN IN TWO PLACES: here on the agent's page, and on the ask's own record page, where a
 * waiting registration is drawn because it has no agent page yet. It carries its own styles so the
 * record page needs nothing else.
 */
export function TheCardAsk({
  ask,
  onChanged,
  project,
}: {
  ask: NonNullable<ProfileFacts['cardAsk']>
  /** Called after the server has answered a press, with which of the two presses it was. */
  onChanged: (answered: 'grant' | 'refuse') => void
  /**
   * The project the ask was filed in, when the page drawing it may be reading another one: Home and the
   * Embassy draw asks from every project (problem NXEhOBumu5ZZ). Left out, the presses go to the project
   * in the switcher, as they always did.
   */
  project?: string
}) {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  const answer = (what: 'grant' | 'refuse'): void => {
    setFault(null)
    setBusy(true)
    void api
      .answerACardRequest(ask.requestId, what, undefined, project)
      .then(() => {
        setBusy(false)
        onChanged(what)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  // WHAT THE PRESS DOES, in the page's words where the server sent the facts for them, and in its English where not.
  const says = ask.admits === undefined ? ask.says : whatAdmittingSays(t, ask.name, cardWord(ask.asking), ask.admits)

  return (
    <div className="tc-ask">
      <style href="mole-office-their-card" precedence="default">
        {THEIR_CARD_CSS}
      </style>
      <p className="tc-ask-says">{says}</p>
      {/* A FAILED PRESS SAYS SO in a plain sentence, and the reason follows. */}
      {fault === null ? null : <p className="tc-ask-failed">{whatAFailedPressSays(ask)}</p>}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <div className="tc-acts">
        <Btn onClick={() => answer('grant')} disabled={busy} reason={busy ? CARD_ASK_WORDS.working : undefined}>
          {ask.press === 'admit'
            ? CARD_ASK_WORDS.admit
            : ask.press === 'new-key'
              ? CARD_ASK_WORDS.newKey
              : CARD_ASK_WORDS.grant}
        </Btn>
        <TieredPress tier="confirm" press={CARD_ASK_WORDS.refuse} pending={CARD_ASK_WORDS.working}
          disabled={busy} question={t(ask.press === 'admit' ? 'g6b.ask.refuseAdmission' : ask.press === 'new-key' ? 'g6b.ask.refuseKey' : 'g6b.ask.refuseCard')}
          quote={says} warning={t('g6b.ask.finalAnswer')} cancel={t('g6b.profile.retireKeep')}
          onPress={async () => { await api.answerACardRequest(ask.requestId, 'refuse', undefined, project); onChanged('refuse') }} />
      </div>
    </div>
  )
}

/** What a press that failed says, above the reason the office or the browser gave. */
function whatAFailedPressSays(ask: WaitingCardAsk): string {
  if (ask.press === 'admit') return t('cardAsk.failed.admit', { handle: ask.name })
  if (ask.press === 'new-key') return t('cardAsk.failed.newKey', { handle: ask.name })
  return t('cardAsk.failed.card', { handle: ask.name, card: cardWord(ask.asking) })
}

/**
 * WHAT ONE PRESS ON A WAITING ASK DID, said where the press was once the server has answered it: on a row at the door
 * and on the ask's own page. Letting an agent in also says what the agent can do now.
 */
export function whatThePressDid(ask: WaitingCardAsk, did: 'grant' | 'refuse'): string {
  const name = ask.name
  if (did === 'refuse') return t('doorAsks.done.refused', { handle: name })
  if (ask.press === 'admit') return `${t('doorAsks.done.admitted', { handle: name, card: cardWord(ask.asking) })} ${t('doorAsks.done.admittedCanNow')}`
  if (ask.press === 'new-key') return t('doorAsks.done.newKey', { handle: name })
  return t('doorAsks.done.card', { handle: name, card: cardWord(ask.asking) })
}

/**
 * THE PRESS ON AN ASK'S OWN PAGE, AND WHAT IT DID ONCE THE SERVER HAS ANSWERED IT. The page reads the record again after
 * the press, and the server sends no press for an answered ask, so the press used to vanish with nothing saying that it
 * worked. The sentence stays where the press was until the person leaves the page.
 */
export function ThePressOnAnAsk({ ask, onChanged }: { ask: WaitingCardAsk | undefined; onChanged: () => void }) {
  useLanguage()
  const [done, setDone] = useState<{ ask: WaitingCardAsk; did: 'grant' | 'refuse' } | null>(null)
  if (done !== null) {
    return (
      <p className="tc-ask-done" role="status">
        <style href="mole-office-their-card" precedence="default">
          {THEIR_CARD_CSS}
        </style>
        {whatThePressDid(done.ask, done.did)}
      </p>
    )
  }
  if (ask === undefined) return null
  return (
    <TheCardAsk
      ask={ask}
      onChanged={(did) => {
        setDone({ ask, did })
        onChanged()
      }}
    />
  )
}

/**
 * THE PRESS THAT WITHDRAWS A NEW-KEY GRANT NOBODY COLLECTED, by point 9 of a decision.
 *
 * Drawn on the ask's own record page, to the person only, while the ask is granted and nobody has
 * collected the key: the server sends it only then. The server's sentence of what it does is drawn in developer mode.
 * A starter that granted the ask withdraws it through the door with its own key, not here.
 */
export function TheGrantToWithdraw({ grant, onChanged }: { grant: AGrantToWithdraw; onChanged: () => void }) {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  const withdraw = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .withdrawANewKeyGrant(grant.requestId)
      .then(() => {
        setBusy(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  return (
    <div className="tc-ask tc-withdraw">
      <style href="mole-office-their-card" precedence="default">
        {THEIR_CARD_CSS}
      </style>
      <ServerNote text={grant.says} />
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <div className="tc-acts">
        <Btn onClick={withdraw} disabled={busy} reason={busy ? WITHDRAW_WORDS.working : undefined}>
          {WITHDRAW_WORDS.withdraw}
        </Btn>
      </div>
    </div>
  )
}

/** The label on the withdraw press. A short label, never a sentence: the sentence is the server's. */
const WITHDRAW_WORDS = {
  get withdraw() { return t('g6b.withdraw.withdraw') },
  get working() { return t('g6b.withdraw.working') },
} as const

/**
 * WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED. Finding 83, mend b2.
 *
 * The ask's own page and its line on the person's waiting list both draw this, so a person answering
 * a new-key ask, or admitting a registration, sees whether the ask proved anybody, where its
 * connection came from, and whether the key it says is lost is still in use. Both sentences are the
 * server's (src/server/lib/where-an-ask-came-from.ts); this draws two short labels beside them.
 */
export function TheAskItself({ shows, stands }: { shows: WhatAnAskShows; stands?: string }) {
  useLanguage()
  const inspect = useInspect()
  return (
    <dl className="tc-asked">
      <style href="mole-office-the-ask-itself" precedence="default">
        {THE_ASK_ITSELF_CSS}
      </style>
      {/* WHERE A NEW-KEY ASK STANDS, first, so after their press the page says that it worked and what the
          agent does next. The sentence is the server's. Problem sgjHE9R2vSEZ. */}
      {stands === undefined ? null : (
        <>
          <dt>{ASK_ITSELF_WORDS.stands}</dt>
          <dd data-fact="stands">{stands}</dd>
        </>
      )}
      {inspect ? <><dt>{ASK_ITSELF_WORDS.cameFrom}</dt>
      <dd data-fact="came-from">{shows.cameFrom}</dd>
      <dt>{ASK_ITSELF_WORDS.keyLastUsed}</dt>
      <dd data-fact="key-last-used">{shows.keyLastUsed}</dd></> : null}
    </dl>
  )
}

/** The two labels. Short labels, never sentences: the sentences are the server's. */
const ASK_ITSELF_WORDS = {
  get stands() { return t('g6b.askFacts.stands') },
  get cameFrom() { return t('g6b.askFacts.cameFrom') },
  get keyLastUsed() { return t('g6b.askFacts.keyLastUsed') },
} as const

/**
 * A label above its sentence at every width: at 390 a label beside a sentence wraps into it. Quiet
 * type for the labels, the reading face for the sentences. No backtick in this string.
 */
const THE_ASK_ITSELF_CSS = `
.tc-asked { margin: 0 0 var(--pad); min-width: 0; max-width: var(--measure); }
.tc-asked dt {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.tc-asked dd { margin: 0 0 calc(var(--pad) / 2); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
`

/** The labels on the two presses. Short labels, never sentences: the sentence is the server's. */
const CARD_ASK_WORDS = {
  get grant() { return t('g6b.ask.grant') },
  get admit() { return t('g6b.ask.admit') },
  get newKey() { return t('g6b.ask.newKey') },
  get refuse() { return t('g6b.ask.refuse') },
  get working() { return t('g6b.ask.working') },
} as const

/**
 * ACTING FOR THE PERSON, AND THE PRESS THAT SAYS SO. Criterion P59, moved here by P64, and drawn again by the
 * owner's decision.
 *
 * WHILE IT HOLDS: one box — Acting for (the person's name) until today at 18:15 — with how long is left and when they gave it, their
 * reason, and one plain press to end it. The end is the stored stamp read on the office's clock and said to the minute;
 * in developer mode it is the server's own `untilInWords`.
 *
 * WHILE IT DOES NOT: a form on the page's one label column. Why, then How long as three choices, then the end: for a
 * time, RaiseEndChoice.tsx; for a piece of work, the box for its record. The three come from the declaration; nothing
 * here knows how many there are. The press is the page's one primary press, at the form's foot (answer 1). By a
 * decision, the press asks for a reason, so it stays unpressable while the box is empty, and a time left unchosen
 * is a day. What it sends is what a raise stores, `{reason, endsWhen, until}`, and nothing
 * more.
 */

/**
 * THE END OF THE ACTING-FOR-YOU LINE, with the separator before it. Both are worked out as words by
 * `theEndOfTheLine` in src/web/lib/acting-line.ts, where every join of the line is `gapBetween`'s
 * answer; this only draws what that returns, so the line follows one spacing rule.
 */
function GrantEnd({ held, zone, before }: { held: ElevationHeld; zone: string; before: string }) {
  const inspect = useInspect()
  const isWork = held.endsWhen === 'when a piece of work ends'
  const [work] = useProjectAsync(() => isWork && held.until !== null ? api.getRecord(held.until) : Promise.resolve(null), [isWork, held.until])
  const read = work.status === 'ready' && work.value !== null ? { id: work.value.record.id, title: work.value.record.title } : null
  const end = theEndOfTheLine(before, held, zone, { inspect, work: read, now: Date.now() })
  if (end.draw === 'absent') return <>{end.gap}<Absence /></>
  if (end.draw === 'link' && end.to !== null) return <>{end.gap}<RouteLink to={recordPath(end.to)}>{end.words}</RouteLink></>
  return <>{end.gap}{end.words}</>
}

/** How long is left of a raise that ends at a time, and when they gave it, both on the office's clock. */
function HowLongItHasLeft({ held, zone }: { held: ElevationHeld; zone: string }) {
  const now = Date.now()
  const end = held.endsWhen === 'at a time' && held.until !== null ? momentOfStampInZone(held.until, zone) : null
  const given = momentOfStampInZone(held.grantedAt, zone)
  const parts: string[] = []
  if (end !== null && end > now) parts.push(t('agentPage.raise.endsIn', { howLong: howLongInWords(end - now) }))
  if (given !== null) parts.push(t('agentPage.raise.given', { when: whenInWords(given, now, zone) }))
  if (parts.length === 0) return null
  return <p className="tc-elev-left">{parts.join(' ')}</p>
}

/** The longest reason a raise takes. The server refuses a longer one (src/server/api/roles.ts, the raise's body). */
const A_REASON_IS_AT_MOST = 500

function TheElevation({
  handle,
  name,
  said,
  onChanged,
}: {
  handle: string
  /** The agent's registry name, as the page's head shows it. The press names the agent by it. */
  name: string
  said: NonNullable<TheCardTheyHold['elevation']>
  onChanged: () => void
}) {
  const [endsWhen, setEndsWhen] = useState(said.rule.howItEnds[0]?.kind ?? '')
  const [until, setUntil] = useState('')
  // THE END CHOSEN FOR "AT A TIME": a whole stamp, or null while the chosen time has passed (RaiseEndChoice.tsx).
  const [chosenEnd, setChosenEnd] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  useLanguage()
  const [busy, setBusy] = useState(false)
  // THE REFUSAL AND ITS FAULT, so ErrorNote draws a coded refusal in the page language (E1's way). Wave 13q's report
  // 81bt4r1n6_8W block b-5b: faultOf(err) is kept beside errorMessage(err), and both reach ErrorNote.
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  const press = (run: Promise<unknown>): void => {
    setFault(null)
    setBusy(true)
    void run
      .then(() => {
        setBusy(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  // WHAT THE END NEEDS depends on which end was chosen, and the box appears only for the ends that
  // need one. An empty box beside "until you say" would be asking for something nothing reads.
  const needsARecord = endsWhen === 'when a piece of work ends'

  const panel =
    said.holding !== null ? (
      <div className="tc-elev tc-elev-on">
        <div className="tc-elev-top">
          <p className="tc-elev-line">
            {actingForHead(said.holding.actingFor)}
            <span className="tc-elev-until"><GrantEnd held={said.holding} zone={said.officeTimeZone} before={actingForHead(said.holding.actingFor)} /></span>
          </p>
          <Btn
            variant="ghost"
            onClick={() => press(api.endWhatItIsDoingForYou(handle))}
            disabled={busy}
            reason={busy ? t('g6b.profile.ending') : undefined}
          >
            {t('g6b.elevation.END_IT')}
          </Btn>
        </div>
        <HowLongItHasLeft held={said.holding} zone={said.officeTimeZone} />
        {said.holding.reason === null ? null : (
          <dl className="tc-grid tc-elev-why">
            <dt className="tc-grid-label">{t('g6b.elevation.WHY')}</dt>
            <dd className="tc-grid-value">{said.holding.reason}</dd>
          </dl>
        )}
        {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      </div>
    ) : (
      <div className="tc-elev tc-grid">
        <label className="tc-grid-label" htmlFor="mole-office-raise-why">
          {t('g6b.elevation.WHY')}
        </label>
        <div className="tc-grid-value">
          {/* A BOX OF SEVERAL LINES, so a reason can be written as it is meant.
              The office's box takes no length limit, so the 500 the server holds a reason to is kept
              here: nothing past it is taken, as the one-line box's own limit did. */}
          <div className="tc-elev-reason-box">
            <TextArea
              id="mole-office-raise-why"
              value={reason}
              rows={2}
              placeholder={t('g6b.elevation.WHY_ASKS')}
              onChange={(next) => setReason(next.slice(0, A_REASON_IS_AT_MOST))}
            />
          </div>
        </div>
        <span className="tc-grid-label" id="mole-office-raise-ends">
          {t('g6b.elevation.HOW_LONG')}
        </span>
        <div className="tc-grid-value">
          {/* THE THREE ENDS, SIDE BY SIDE AND ONE CHOSEN, where a menu stood (the drawing's item 1: the menu sat 12 px
              lower than the box beside it). A label round a radio each, so the keyboard moves through them as
              through any radio group. */}
          <div className="tc-ends" role="radiogroup" aria-labelledby="mole-office-raise-ends">
            {said.rule.howItEnds.map((one) => (
              <label key={one.kind} className="tc-end" data-end={one.kind} data-chosen={endsWhen === one.kind ? 'yes' : undefined}>
                <input type="radio" name="mole-office-raise-ends" value={one.kind} checked={endsWhen === one.kind} onChange={() => setEndsWhen(one.kind)} />
                {/* THE KIND READ THROUGH THE WORD LISTS, on this line, so the machine-word gate sees it read. */}
                <span>{t(one.kind === 'at a time' ? 'g6b.elevation.time' : one.kind === 'when a piece of work ends' ? 'g6b.elevation.work' : 'g6b.elevation.ended')}</span>
              </label>
            ))}
          </div>
        </div>
        {endsWhen === 'at a time' ? (
          <div className="tc-grid-value tc-grid-under">
            <RaiseEndChoice onChange={setChosenEnd} officeZone={said.officeTimeZone} />
          </div>
        ) : needsARecord ? (
          <>
            <label className="tc-grid-label" htmlFor="mole-office-raise-work">
              {t('agentPage.raise.whichWork')}
            </label>
            <div className="tc-grid-value">
              <input
                id="mole-office-raise-work"
                className="px-input tc-elev-until-box"
                value={until}
                placeholder={t('g6b.profile.aRecord')}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
          </>
        ) : null}
        <div className="tc-grid-value tc-grid-under tc-elev-foot">
          {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
          <Btn
            variant="primary"
            onClick={() => press(api.letThisAgentActForYou(handle, reason.trim(), endsWhen, endsWhen === 'at a time' ? chosenEnd : until.trim() === '' ? null : until.trim()))}
            disabled={busy || reason.trim() === '' || (endsWhen === 'at a time' && chosenEnd === null)}
            reason={busy ? t('g6b.profile.granting') : reason.trim() === '' ? t('g6b.elevation.WHY_FIRST') : endsWhen === 'at a time' && chosenEnd === null ? t('raiseChoose.chooseALaterTime') : undefined}
          >
            {thePress(name, t)}
          </Btn>
        </div>
      </div>
    )

  return (
    <div className="tc-elev-block">
      {panel}
      {/* THE PERIOD'S OWN PAGE, ON THE PAGE WHERE IT IS GRANTED. Criterion P19: the acts made under
          it are listed, read from the ledger by the grant's id. P20: the sentence saying what a
          permission on an unprovable identity cannot prove is drawn here too, from the one exported
          constant and never retyped. */}
      {said.period === null ? null : <TheActsOfThisPeriod period={said.period} onChanged={onChanged} />}
      {/* WHAT THE GRANT CARRIES IN THIS OFFICE (wave 13s round 2a): each door's answer, and the person's press that
          changes it. */}
      <WhatTheGrantCarries />
    </div>
  )
}

/**
 * WHO CHOSE THE CARD, IN THE PAGE'S LANGUAGE (wave 13q round 19). `whoChoseTheCardSays` builds the sentence; this says
 * each of its words through the word lists, whose English entries are the server's own. The rule's `{card}` is the
 * card `whoChoseTheCardSays` passes in, `A_ROW_WITH_NO_ROLE_READS_AS` in src/shared/roles.ts, put in the page's word by
 * `cardWord` in src/shared/card-words.ts, the one reading of a card name. Which card the rule wrote is decided there
 * alone (wave 13q round 20: the scoped re-check 1HDiEz_wWdFx refused a page that always said the worker card).
 */
const SAY_WHO_CHOSE_IT: SayWhoChoseTheCard = (word, values = {}) =>
  word === 'theRule'
    ? wordWithSpacedValues(t, 'r19card.chosenBy.theRule', { card: cardWord(values['card'] ?? '') })
    : wordWithSpacedValues(t, `r19card.chosenBy.${word}`, values)

/**
 * WHAT THE PERIOD DID, AND WHAT IT CANNOT PROVE. Criteria P19 and P20.
 *
 * THE LIST IS READ FROM THE LEDGER BY THE GRANT'S ID. It is not derived from what the page already
 * holds, and the page does not decide which writes count: `actsUnderThePeriod` in
 * `src/server/lib/elevation.ts` reads the change rows and revisions that name the grant.
 *
 * IT IS DRAWN AFTER THE PERIOD ENDS TOO. The server hands the last grant they made and ended when
 * none holds, and `period.holds` says which it is. So a reader can still see what the period did
 * after it stopped, which is what "ending it undoes none" means to the person reading.
 *
 * THE LIMIT IS THE P16 SENTENCE, DRAWN. `THE_LIMIT_ON_A_GOVERNANCE_ACT` is imported and never
 * retyped: a second copy of those words is the defect criterion P16 exists to stop. It says what
 * the permission cannot prove, and it belongs where the permission is granted.
 */
function TheActsOfThisPeriod({
  period,
  onChanged,
}: {
  period: NonNullable<NonNullable<TheCardTheyHold['elevation']>['period']>
  onChanged: () => void
}) {
  const acts: ActUnderThePeriod[] = period.acts
  // THE PRESS THAT TAKES ONE ACT BACK IS THE PERSON'S, as the press on an act done on their words is (OnYourWords.tsx):
  // the revoke door answers them alone, and since wave 13n's round 28 it reaches an act made under a period they
  // granted (problem yW5Qt7TgM1lE). Drawn on an act with a revision to undo that nobody has taken back yet.
  const isThePerson = getActor().type === 'human'
  const [pressing, setPressing] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const takeBack = (one: ActUnderThePeriod): void => {
    if (one.seq === null || one.recordId === null) return
    const key = `${one.recordId}:${String(one.seq)}`
    setPressing(key)
    setFailed(null)
    api
      .revokeAct(one.recordId, one.seq)
      .then(() => {
        onChanged()
      })
      .catch((err: unknown) => {
        // SAID OUT LOUD AND NOT SWALLOWED: a press that did nothing and looked like it worked is the failure this
        // product is written against.
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      })
      .finally(() => {
        setPressing(null)
      })
  }
  return (
    <div className="tc-period">
      <p className="tc-period-head">
        <span className="tc-label">{t('g6b.profile.periodActs')}</span>
        {period.holds ? null : <span className="tc-period-ended">{t('g6b.profile.periodEndedWord')}</span>}
      </p>
      {acts.length === 0 ? (
        <p className="tc-period-none"><Absence say title={t('g6b.profile.periodNothingYet')} /></p>
      ) : (
        <ul className="tc-period-list">
          {/* THE KEY CARRIES NO STORED WORD. `op` would be unique enough and it is the raw ledger
              word — create, update, link — which nothing on this line reads. A key is never drawn,
              so a reader would never see it, but the machine-word gate reads a template literal in a
              .tsx file as drawn text and cannot tell an attribute from a run of text. Rather than
              write a false line into its allowlist saying a stored word reaches prose here, the key
              is built from the record and the row's place in the reply, which say the same thing
              about uniqueness and say nothing about the ledger. What a person reads is `one.what`,
              which is WHAT_THE_PERIOD_DID's reading of `op`, which is the whole point of the gate. */}
          {acts.map((one, index) => (
            <li className="tc-period-act" key={`${one.recordId ?? 'a press'}:${String(index)}`}>
              {/* A PRESS THAT WROTE NO CHANGE ROW names no record, so it is named by its door, and nothing on it can be
                  opened or taken back: there is no revision to undo. */}
              {one.recordId === null ? (
                <>
                  <TheDoorPressed door={one.door} />{' '}
                  <span className="tc-period-what">{t('w13s.press.pressed')}</span>
                </>
              ) : (
                <>
                  <RouteLink to={recordPath(one.recordId)}>{one.title}</RouteLink>{' '}
                  <span className="tc-period-what">{one.whatKey === null ? one.what : t(one.whatKey)}</span>
                </>
              )}{' '}
              <span className="tc-period-when">{one.at}</span>
              {one.recordId === null ? null : one.revoked !== null ? (
                <span className="tc-period-taken-back" data-period-revoked={`${one.recordId}:${String(one.seq)}`}>
                  {t('g2b.onYourWords.revoked', { actor: actorTypeWord(one.revoked.actorType).text, id: one.revoked.actorId, at: one.revoked.at })}
                </span>
              ) : isThePerson && one.seq !== null ? (
                // THE MARK IS ON A SPAN AROUND THE PRESS because `Btn` draws no attribute it was not built to carry.
                <span className="tc-period-take-back" data-period-revoke={`${one.recordId}:${String(one.seq)}`}>
                  <Btn
                    variant="secondary"
                    size="sm"
                    pending={pressing === `${one.recordId}:${String(one.seq)}`}
                    onClick={() => {
                      takeBack(one)
                    }}
                  >
                    {t('r19card.period.revoke', { title: content(one.title) })}
                  </Btn>
                </span>
              ) : null}
              <ThePressReason reason={one.reason} className="tc-period-reason" />
            </li>
          ))}
        </ul>
      )}
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} />}
      <p className="tc-period-limit">{t('g6b.elevation.limit')}</p>
    </div>
  )
}

/**
 * THE DOOR A PRESS UNDER THE GRANT PRESSED, named as the server read it (`TheDoorOfAPress` in src/shared/roles.ts): the
 * list's words in the page's language, or the route's own sentence, which is English only and is marked so, or the
 * sentence that Mole Office has no words for it. The operation is in the title, for a reader who needs the exact door.
 */
function TheDoorPressed({ door }: { door: ActUnderThePeriod['door'] }) {
  const words = door?.words ?? null
  const inChinese = wordLanguage() === 'zh' && words?.zh !== null && words?.zh !== undefined
  return (
    <span className="tc-period-door" title={door?.operation}>
      {words === null ? (
        t('w13s.press.noWordsForTheDoor')
      ) : inChinese ? (
        content(words.zh)
      ) : (
        <span lang="en">{content(words.en)}</span>
      )}
    </span>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const THEIR_CARD_CSS = `
.tc-notebook { margin: var(--gut) 0 0 0; }
.tc-notebook-line { margin: 0; }
.tc-notebook-none { margin: var(--pad) 0 0 0; }
.tc-notebook-counts { display: flex; flex-wrap: wrap; gap: var(--gut); margin: var(--pad) 0 0 0; }
.tc-notebook-count { min-width: 0; display: flex; gap: var(--pad); align-items: baseline; }
.tc-notebook-count dt { color: var(--text-3); font-size: var(--fs-1); }
.tc-notebook-count dd { margin: 0; color: var(--text); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
/* THE CARD ITSELF. Criterion P71: the card's picture beside its name. Since the decision to keep the card to one
   row, the picture is 64 pixels at every width, and its duties and How it works are on the Role cards page. */
.tc-card {
  display: flex; gap: var(--gut); align-items: center; min-width: 0;
  margin-bottom: var(--pad);
}
.tc-card > .sb-image-opens { flex: none; }
.tc-card .sb-image-hint { right: 1px; bottom: 1px; padding: 0 2px; font-size: 10px; line-height: 1; }
.tc-card-portrait {
  display: block; flex: none; width: 64px; height: 64px; object-fit: cover;
  border-radius: var(--radius-sm); background: var(--hover);
}
.tc-card-body { flex: 1 1 auto; min-width: 0; }
.tc-card-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0; }
.tc-card-name { margin: 0; font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.tc-card-rung { color: var(--text-3); font-size: var(--fs-1); }
.tc-card-step { margin: 4px 0 0; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-body, 1.45); }
/* THE ROW THAT OPENS THE ROLE CARDS PAGE: a title and a quiet line under it, the whole row the link. */
.tc-card-all { margin: var(--pad) 0 0; padding-top: var(--pad); border-top: 1px solid var(--border); }
.tc-card-all-link { display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--text); text-decoration: none; }
.tc-card-all-link:hover .tc-card-all-title { text-decoration: underline; }
.tc-card-all-title { font-size: var(--fs-2); overflow-wrap: anywhere; }
.tc-card-gone { margin: 0 0 var(--pad); }
/* WHICH MODEL ITS NEWEST RUN HERE WAS STARTED ON: one quiet line under the card. */
.tc-model { margin: 0 0 var(--pad); color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.tc-model-id { overflow-wrap: anywhere; }

/* THE ONE LABEL COLUMN, by a decision: a 9rem label, a 16 pixel gap, then the value, the same column the
   page's facts use (PROFILE_CSS). At 40rem and below the label stands above its value. */
.tc-grid {
  display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: var(--pad) 16px; align-items: center;
  min-width: 0; margin: 0;
}
.tc-grid-label { grid-column: 1; margin: 0; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.tc-grid-value { grid-column: 2; margin: 0; min-width: 0; overflow-wrap: anywhere; }
.tc-grid-under { grid-column: 2; }
@media (max-width: 40rem) {
  .tc-grid { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .tc-grid-label, .tc-grid-value, .tc-grid-under { grid-column: 1; }
  .tc-grid-label:not(:first-child) { margin-top: var(--pad); }
}

.tc-fact, .tc-field {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-width: 0;
  margin-bottom: var(--pad);
}
.tc-label { flex: none; width: 9rem; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.tc-value { color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
/* THE WORD A REFUSAL READS THE ROW AS, beside the absence and quieter than a value: nobody chose it. */
.tc-read-as { margin-left: 8px; color: var(--text-3); font-size: var(--fs-1); }
/* WHO CHOSE THE CARD, criterion P75. Its own line under the card rather than beside it: it is a
   sentence and not a value, and at 390 a sentence beside a label wraps into the label. */
.tc-chosen-by { grid-column: 1 / -1; color: var(--text-3); font-size: var(--fs-1); }
/* THE CARD IT ASKED FOR, AND THE PERSON'S PRESS. F15 point 2. It carries the weight of a thing the person must act on:
   a rule a person has to answer gets more than metadata and less than an alarm. */
.tc-ask {
  padding: var(--pad);
  border-left: var(--rail) solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--hover);
  margin-bottom: var(--pad);
  min-width: 0;
}
.tc-ask-says { margin: 0 0 var(--pad); max-width: var(--measure); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.tc-ask-failed { margin: 0 0 calc(var(--pad) / 2); max-width: var(--measure); color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); }
/* WHAT THE PRESS DID, where the press was on the ask's own page: the same box, with the quiet rail of an answered ask. */
.tc-ask-done {
  margin: 0 0 var(--pad);
  padding: var(--pad);
  max-width: var(--measure);
  border-left: var(--rail) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--hover);
  color: var(--text);
  font: var(--fs-2)/var(--lh-read) var(--font-ui);
}
.tc-pick { flex: 1 1 12rem; min-width: 0; max-width: 20rem; }
.tc-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }

/* ACTING FOR THE PERSON. It carries the weight the drawing chapter gives a thing a reader has to act
   on while it holds (one box with the accent rail), and the weight of an ordinary form while it does not (no box). */
.tc-elev { min-width: 0; }
.tc-elev-on {
  display: flex; flex-direction: column; gap: var(--pad);
  padding: var(--pad);
  border-left: var(--rail) solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--hover);
}
.tc-elev-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--pad) var(--gut); min-width: 0; }
.tc-elev-line { margin: 0; flex: 1 1 16rem; min-width: 0; font: var(--fs-3)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.tc-elev-until { font-weight: 600; font-variant-numeric: tabular-nums; }
.tc-elev-left { margin: 0; font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.tc-elev-why .tc-grid-value { font-size: var(--fs-2); color: var(--text); white-space: pre-wrap; }
.tc-elev-until-box { width: 100%; max-width: 20rem; box-sizing: border-box; }
.tc-elev-reason-box { width: 100%; max-width: 32rem; box-sizing: border-box; }
/* THE PRESS AT THE FORM'S FOOT, in the value column, with the refusal above it when there is one. */
.tc-elev-foot { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); }
/* THE THREE ENDS: one row of choices that wraps, each the height of a field. The chosen one takes the chosen colours. */
.tc-ends { display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.tc-end {
  display: inline-flex; align-items: center; gap: 6px; min-height: var(--row-h); padding: 0 var(--pad);
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel);
  color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.tc-end input { margin: 0; accent-color: var(--chosen-edge); }
.tc-end[data-chosen="yes"] { background: var(--chosen-bg); color: var(--chosen-ink); border-color: var(--chosen-edge); box-shadow: var(--chosen-shadow); }
.tc-end:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 40rem) {
  .tc-end { min-height: 44px; flex: 1 1 100%; }
  .tc-elev-top > .px-btn { width: 100%; }
}

/* THE PERIOD'S OWN PAGE, drawn under the press. Criteria P19 and P20. The list wraps, so it never
   pushes the page sideways and needs no scrolling box. */
.tc-elev-block { min-width: 0; }
.tc-period { margin-top: var(--pad); border-top: 1px solid var(--border); padding-top: var(--pad); min-width: 0; }
.tc-period-head { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--pad); }
.tc-period-ended { color: var(--text-3); font-size: var(--fs-1); }
.tc-period-none { margin: 4px 0 0; color: var(--text-3); font-size: var(--fs-1); }
.tc-period-list { list-style: none; margin: 6px 0 0; padding: 0; min-width: 0; }
.tc-period-act { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; min-width: 0; margin: 2px 0; }
.tc-period-what { color: var(--text-2); font-size: var(--fs-1); }
.tc-period-when { color: var(--text-3); font-size: var(--fs-1); font-variant-numeric: tabular-nums; }
.tc-period-reason { flex-basis: 100%; min-width: 0; overflow-wrap: anywhere; color: var(--text-2); font-size: var(--fs-1); }
/* THE TAKE-BACK PRESS NAMES THE RECORD, so its label can be longer than a phone's card is wide. It wraps inside the
   card, the way the chat's member presses do (.px-chat-member-acts .px-btn in Chat.tsx), and never runs past it. */
.tc-period-take-back { max-width: 100%; }
.tc-period-take-back .px-btn { max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: left; }
.tc-period-taken-back { color: var(--text-3); font-size: var(--fs-1); }
.tc-period-limit { margin: var(--pad) 0 0; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-read); }
@media (max-width: 40rem) {
  .tc-label { flex: 1 1 100%; width: auto; min-width: 0; }
}
`
