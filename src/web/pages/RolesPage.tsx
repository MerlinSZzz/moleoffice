// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect } from 'react'
import { useChannel } from '../lib/channel.ts'
import { useInspect } from '../lib/mode.ts'
import { NotebookNumbers, ParticipantName } from './NotebookPage.tsx'
import { content, t, wordLanguage } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'
// A CARD'S HOW IT WORKS, drawn the one way every card page draws it.
import { HowItWorksText, howItWorksHere } from '../components/HowItWorks.tsx'
import { TheShippedWords, whenACardsShippedWordsAreCopied } from '../components/TheShippedWords.tsx'
import { TheHandbooksOnACard } from '../components/TheHandbooksOnACard.tsx'
import type { HandbookRead } from '@shared/handbooks.ts'
/**
 * `#/roles` — THE ROLE CARDS, ONE BLOCK EACH, WITH THE ADD BLOCK AT THE END.
 *
 * Criterion P44 of design/permissions/ACCEPTANCE.md section 8: the way in to the role cards is in the
 * Embassy. Before it, the cards were visible only as a declaration file and five records whose page
 * drew nothing of the card (problem `76Yh8qLhHdGY`). This is that way in.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS BLOCKS AND NOT A LIST OF ROWS. Criteria P48, P49 and P50
 * ---------------------------------------------------------------------------------------
 *
 * The role cards were bare, all text. They should be laid out block by block, each with a large
 * portrait, the story, and the duties and permissions.
 *
 * The page was five rows of a name, a rung, one sentence and a link, on the ordinary rule that a
 * list locates and a detail page explains. That rule is wrong here, and it
 * is: there are six cards in this whole product, they never grow to a hundred, and a person opening
 * this page is not trying to FIND a card, they are trying to read what the roles are. So the block
 * carries the portrait, the story and both permission lines, and the card's own page carries the
 * parts a block does not: what it must read, who it reports to, what ends it, who may grant it.
 *
 * ---------------------------------------------------------------------------------------
 * THREE KINDS OF BLOCK, AND EACH ONE SAYS WHICH IT IS
 * ---------------------------------------------------------------------------------------
 *
 *   · a card Mole Office ships with — the five agent roles and the person's, from
 *     `design/permissions/roles.json`. Marked as a default (P49), because that file is the only
 *     thing that decides what an agent may do;
 *   · a card somebody wrote here (P51). Drawn exactly like a default one, and carrying the one line
 *     saying nothing enforces it, measured rather than assumed: `isARole` reads the declaration and
 *     has never read a record;
 *   · the add block (P50): a mole in black with a large plus in the middle, every other field
 *     empty, and pressing it opens the card's own page to fill in.
 */

import { api } from '../api.ts'
import { Absence, ErrorNote, Explain, Hint, Loading, ServerNote } from '../components/ui.tsx'
import { useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { BackLink } from '../components/BackLink.tsx'
import { InReach } from '../components/InReach.tsx'
import { RouteLink, navigate, recordPath, pathFor, roleCensusPath, notebookPath } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { MoleSilhouette } from '../components/MoleSilhouette.tsx'
import { theCrossOriginOfALoad, whereRequestsGo } from '../lib/visiting.ts'
import { smallPortrait, theFirstPortraitOf, type PortraitOnOffer } from '@shared/portraits.ts'
import { OpensLarge } from '../components/PictureLarge.tsx'
import { THE_PERSON } from '@shared/person.ts'
import { WIDE_SCREEN } from '../components/SideBySide.tsx'
// A POWER'S NAME IN THE PAGE'S LANGUAGE, read the one way the card's own page reads it.
import { powerNameHere } from '../components/RoleCard.tsx'
import { theCardOffTheTree, whoTheCardReportsTo, type ElevationRule, type RoleCard, type RoleCardCopy, type WhatTheRolesSay } from '@shared/roles.ts'
import {
  type NotebookOnACard,
} from '@shared/notebook.ts'

/**
 * Every word this page draws that is not read off the server.
 *
 * THE PAGE'S OWN NAME IS NOT HERE. It is `PAGE_TITLES.roles` in Sidebar.tsx, which is where every
 * page's name is declared.
 */
export const ROLES_WORDS = {
  /** The heading over a card's How it works, its handbook text, where it has one. */
  get flow() { return t('g6b.roles.flow') },
  /** The two lists. Criterion P45: an agent's roles and a person's are two lists, never one. */
  get agents() { return t('g6b.roles.agents') },
  get people() { return t('g6b.roles.people') },
  /** The third list: the cards somebody wrote here. Criterion P51. */
  get madeHere() { return t('g6b.roles.madeHere') },
  /** On a person's card, before the standing it gives. */
  get standing() { return t('g6b.roles.standing') },
  /** On a person's card, where the tree word would be on an agent's. */
  get notARung() { return t('g6b.roles.notARung') },
  /** On a block, before the number. */
  get rung() { return t('g6b.roles.rung') },
  /** On a block for a role that is not on the tree. */
  get noRung() { return t('g6b.roles.noRung') },
  /** The press into the card's own page. */
  get open() { return t('g6b.roles.open') },
  /**
   * SAID ON A BLOCK THAT HAS NO PAGE IN THIS PROJECT. Criterion P66.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT SAID, WHY IT WAS QUESTIONED, AND WHAT IT MEANS
   * ---------------------------------------------------------------------------------------
   *
   * It said *not copied into this project yet*, and a reader could not tell what that meant.
   *
   * MEASURED ON THE OWNER'S OWN CORPUS AT THE TIME: all five cards said it. `GET /api/roles` answered "5 of 5
   * cards have no current copy in this project", so every block on the page carried the line and
   * NOTHING on the page opened a card at all. What it meant was that no `role_card` record had ever
   * been written here, which is what `POST /api/roles/mirror` writes.
   *
   * SO THE WORDS NAMED THE MECHANISM AND NOT THE STATE, which chapter 6's fourth rule forbids: a
   * copy is how a card's page comes to exist, and what a reader wants to know is that there is no
   * page. The word now says that.
   */
  get noPage() { return t('g6b.roles.noPage') },
  /** The detail on the empty mark when no card is declared. */
  get none() { return t('g6b.roles.none') },
  /** The mark on a card Mole Office ships with. Criterion P49. */
  get aDefault() { return t('addedRoles.locked') },
  /** The mark on a card somebody wrote here. Criterion P51. */
  get written() { return t('g6b.roles.written') },
  /** The powers line on a block. Criterion P56: names, and no May or May-not list anywhere. */
  get powers() { return t('g6b.roles.powers') },
  /** Said on a block where nobody has painted a portrait for the role. */
  get noPortrait() { return t('g6b.roles.noPortrait') },
  /**
   * SAID WHERE A CARD HOLDS NO POWER AT ALL. No card ships that way, and one written here can. A
   * heading over an empty space reads as a list that has not arrived, so it goes through `Absence`
   * at the tier this product uses for an emptiness somebody looked for.
   */
  get noPowersWord() { return t('g6b.roles.noPowersWord') },
  /**
   * THE WAY INTO THE STATISTICS, FOLDED SHUT. Criterion P72.
   *
   * The way in needs a press to open, is not open already, and pressing through it opens the
   * statistics screen.
   *
   * THE FOLD CARRIES NO NUMBER. A count on the closed fold would be the statistics drawn on the
   * page they were to be kept off, and a reader would take the one number for the whole answer.
   */
  /**
   * THE NOTEBOOKS KEPT UNDER THIS CARD, criterion N3. Named by what they are to a reader.
   *
   * NOT INSIDE THE FOLD BELOW. That fold is the way into the role census and carries no number;
   * these are a different set of numbers, and they belong on the card.
   */
  get notebooks() { return t('g6b.roles.notebooks') },
  get whoHolds() { return t('g6b.roles.whoHolds') },
  get whoHoldsOpens() { return t('g6b.roles.whoHoldsOpens') },
  get whoHoldsPress() { return t('g6b.roles.whoHoldsPress') },
  /** The add block. Criterion P50. */
  get addName() { return t('g6b.roles.addName') },
  get addPress() { return t('g6b.roles.addPress') },
  /**
   * WHAT ACTING FOR THE PERSON IS, on the one card that can hold it. Criteria P59 and P64.
   *
   * THERE ARE NO WORDS FOR A PRESS HERE any more. The press, the choice of end and the press that
   * ends one are on the agent's own profile, reached from the Embassy, because appointing a role and
   * choosing for how long belong there. This page describes.
   */
  get actingFor() { return t('g6b.roles.actingFor') },
  /** The way to the page where the person does it. It is a link and not an instruction to go somewhere. */
  get whereItIsDone() { return t('g6b.roles.whereItIsDone') },
  /**
   * THE POWER TREE, DRAWN. Criterion P68: the Role cards page could draw the power tree.
   *
   * The words are the shape of the drawing and nothing else. WHO IS ON THE TREE, IN WHAT ORDER AND
   * WITH WHAT POWERS ARE THE SERVER'S ANSWER, from the same reply the blocks below are drawn from,
   * so the drawing and the cards cannot come to say different things.
   */
  get tree() { return t('g6b.roles.tree') },
  /** Said over the rung the person holds, which is above the tree rather than on it. */
  get above() { return t('g6b.roles.above') },
  /** Said beside a card the declaration gives no rung. */
  get beside() { return t('g6b.roles.beside') },
  /** The mark on the card off the tree, which checks a started agent's work rather than working. */
  get checks() { return t('g6b.roles.checks') },
  /** On each node's fold. Named, because a fold that cannot say what it holds is the word "more". */
  get opensPowers() { return t('g6b.roles.opensPowers') },
  /** The unit on the fold's count. */
  get powersHeld() { return t('g6b.roles.powersHeld') },
  /** What a node says where a card holds no power at all. */
  get noPowersOnANode() { return t('g6b.roles.noPowersOnANode') },
} as const

export function RolesPage() {
  useLanguage()
  const [state, readAgain] = useProjectAsync(() => api.roles(), [])
  useChannel(event => { if (event.name === 'machine.changed' && event.changed.includes('settings')) readAgain() }, ['machine.changed'])
  useEffect(() => whenACardsShippedWordsAreCopied(readAgain), [readAgain])
  // THE PICTURES, ASKED FOR SEPARATELY BECAUSE THEY ARE FILES AND NOT RULES. A block draws the
  // portrait when this has arrived and says nobody has painted one when the folder is empty; while
  // it is still on its way the block draws no picture and claims nothing about there being none.
  const [portraits] = useAsync(() => api.portraits(), [])
  return (
    <div className="page rol">
      <style href="mole-office-roles" precedence="default">
        {ROLES_CSS}
      </style>
      <BackLink page="embassy" />
      <h1 className="rol-title" data-title-is="its-label">{t('g6b.roles.title')}</h1>
      {state.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheCards said={state.value} portraits={portraits.status === 'ready' ? portraits.value.roles : null} />
      ) : null}
    </div>
  )
}

/**
 * The page, given the one reply.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER, the way `TheEmbassy` is: this half is a pure
 * function of what was fetched, and that is the half a test can hold still.
 */
export function TheCards({
  said,
  portraits,
}: {
  said: WhatTheRolesSay
  /** Every role's pictures, by role, or null because the reading has not arrived. */
  portraits: Readonly<Record<string, PortraitOnOffer[]>> | null
}) {
  useLanguage()
  const copyOf = new Map<string, RoleCardCopy>(said.mirror.map((one) => [one.role, one]))
  const wordsOf = new Map(said.words.map((one) => [one.role, one.record]))
  return (
    <>
      {/* THE POWER TREE, ABOVE THE CARDS. Criterion P68. It is first because it is what the page
          answers in one look — who stands above whom, and what each rung adds — and the blocks
          below are what a reader goes to next for one card. */}
      <TheTree said={said} portraits={portraits} />

      {/* TWO LISTS, BECAUSE THE DECLARATION HOLDS TWO AND NOTHING READS ACROSS THEM. Criterion P45:
          people have role cards too. A role a person holds is never one an agent can be registered as,
          so drawing them in one list would be the page saying they are interchangeable. */}
      <section className="rol-group" {...declaredAttributes({ surface: 'roles.agents' })}>
        <h2 data-title-is="its-label" className="rol-group-name">{ROLES_WORDS.agents}</h2>
        {said.cards.length === 0 ? (
          <p className="rol-absent"><Absence title={ROLES_WORDS.none} /></p>
        ) : (
          <ul className="rol-blocks">
            {said.cards.map((card) => (
              <Block
                card={card}
                copy={copyOf.get(card.name) ?? null}
                wordsRecord={wordsOf.get(card.name) ?? null}
                portraits={portraits}
                mark={card.source === 'added' ? t('addedRoles.added') : t('addedRoles.locked')}
                addedName={card.source === 'added' ? card.name : undefined}
                /* WHAT ACTING FOR THE PERSON IS, on the one card the declaration lets do it. Criteria P59
                   and P64: the description, and no press. Every other block draws neither. */
                elevation={card.name === said.elevation.rule.onlyThisCardCanHoldIt ? said.elevation : undefined}
                /* AND THE NOTEBOOKS KEPT UNDER THAT CARD, criterion N3: their numbers are seen on the role
                   card. The same question as the line above, asked once. */
                notebooks={card.name === said.elevation.rule.onlyThisCardCanHoldIt ? said.notebooks : undefined}
                handbooks={said.handbooks?.[card.name] ?? []}
                key={card.name}
              />
            ))}
          </ul>
        )}
      </section>
      <section className="rol-group" {...declaredAttributes({ surface: 'roles.people' })}>
        <h2 data-title-is="its-label" className="rol-group-name">{ROLES_WORDS.people}</h2>
        {said.personCards.length === 0 ? (
          <p className="rol-absent"><Absence title={ROLES_WORDS.none} /></p>
        ) : (
          <ul className="rol-blocks">
            {said.personCards.map((card) => (
              <Block
                card={card}
                copy={copyOf.get(card.name) ?? null}
                wordsRecord={wordsOf.get(card.name) ?? null}
                portraits={portraits}
                standing={card.standing}
                mark={t('addedRoles.locked')}
                key={card.name}
              />
            ))}
          </ul>
        )}
      </section>

      {said.leftOut && said.leftOut.length > 0 ? <section className="rol-group" data-left-out-roles="" role="status">
        <h2>{t('addedRoles.leftOutTitle')}</h2>
        {said.leftOut.map(row => <article key={row.name}><h3>{cardWord(row.name)}</h3><ul>{row.problems.map(problem => <li key={problem}>{problem}</li>)}</ul><RouteLink to={`/roles/added/${encodeURIComponent(row.name)}/history`}>{t('addedRoles.restore')}</RouteLink></article>)}
      </section> : null}

      {said.removedAddedRoles && said.removedAddedRoles.length > 0 ? <section className="rol-group" data-removed-roles=""><h2>{t('addedRoles.removedTitle')}</h2><ul>{said.removedAddedRoles.map(name => <li key={name}>{cardWord(name)} · <RouteLink to={`/roles/added/${encodeURIComponent(name)}/history`}>{t('addedRoles.history')}</RouteLink></li>)}</ul></section> : null}

      <section className="rol-group" data-added-role-entrance=""><h2>{t('addedRoles.addTitle')}</h2><ul className="rol-blocks"><AddBlock /></ul></section>

      {/* THE CARDS SOMEBODY WROTE HERE. The Add press above makes enforced settings.
          THE ORIGINAL REASON FOR ADDING ON THIS PAGE STILL APPLIES. Criteria P50 and P51:
          the present cards are
          Mole Office's defaults, and a new one is added on that same page. Originally the add block was in this
          group because it made a project card of this third kind. A decision now makes the press
          an added office setting, so its own section above names what it creates.
          THE DOOR THAT WROTE THESE CARDS IS SWITCHED OFF, the owner's decision. The cards stay, and a role is
          added now in the add block above. */}
      <section className="rol-group" {...declaredAttributes({ surface: 'roles.madehere' })}>
        <h2 data-title-is="its-label" className="rol-group-name">{ROLES_WORDS.madeHere}</h2>
        <ul className="rol-blocks">
          {said.madeHere.map((one) => (
            <Block
              card={one.card}
              copy={{
                role: one.role,
                heldBy: 'agent',
                record: one.record,
                state: 'current',
                differsIn: [],
                copiedAt: one.madeAt,
              }}
              portraits={portraits}
              chosenPortrait={one.portrait}
              mark={ROLES_WORDS.written}
              /* WHAT A CARD WRITTEN HERE IS WORTH, ON THE CARD. It is not a footnote under the list: a
                 reader meets one card at a time, and the state is about THIS card rather than about the
                 page. Criterion P51 asks for this line. */
              enforces={t('addedRoles.notEnforced')}
              key={one.record}
            />
          ))}
        </ul>
      </section>

      {/* THE COPY GRANTS NOTHING, the server's own sentence, drawn for a developer only, as decided in
          November 2026. */}
      <ServerNote text={said.theCopyGrantsNothing} />
    </>
  )
}

/** The address of the picture on a block, or null because there is none to draw. */
function pictureFor(
  role: string,
  portraits: Readonly<Record<string, PortraitOnOffer[]>> | null,
  chosen: string | null | undefined,
): string | null {
  if (chosen !== null && chosen !== undefined && chosen !== '') return chosen
  if (portraits === null) return null
  const held = Object.hasOwn(portraits, role) ? portraits[role] : undefined
  if (held === undefined || held.length === 0) return null
  // THE FIRST OF THE ROLE'S PICTURES. Which one that is comes from `theFirstPortraitOf`, the shared
  // rule the server uses when it copies a card, so the two cannot come to disagree about it.
  const first = held.find((one) => one.address === theFirstPortraitOf(role)) ?? held[0]
  return first?.address ?? null
}

/**
 * ONE ROLE CARD, AS A BLOCK. Criteria P48 and P61.
 *
 * The portrait, the name and the rung, the duties, and the powers as names. What is NOT here is the
 * parts a card's own page carries — what it must read, who it reports to, what ends it, who
 * appoints it — because a block that carried all of them would be the card page drawn twice.
 *
 * THERE IS NO MAY LINE AND NO MAY-NOT LINE. Criterion P56: no separate may and may-not lines, but a
 * name, duties and powers. The block drew every act of both, which is what made the card a second file of rules.
 */
function Block({
  card,
  copy,
  portraits,
  chosenPortrait,
  wordsRecord,
  addedName,
  standing,
  mark,
  enforces,
  elevation,
  notebooks,
  handbooks,
}: {
  card: RoleCard
  copy: RoleCardCopy | null
  portraits: Readonly<Record<string, PortraitOnOffer[]>> | null
  /** The picture this card names, on a card written here. Undefined on a declared one. */
  chosenPortrait?: string | null
  /** From GET roles on declared cards; absent on cards made here. */
  wordsRecord?: string | null
  addedName?: string
  standing?: string
  /** Which of the two kinds of card this is: a Mole Office default, or one written here. */
  mark: string
  /** The state saying nothing enforces this card. Undefined on a declared one, which is enforced. */
  enforces?: string
  /** The elevation rule, on the one card that can hold one. Criteria P59 and P64: no press here. */
  elevation?: { rule: ElevationRule }
  /**
   * THE NOTEBOOK OF EVERY AGENT HOLDING THIS CARD, with its numbers. Criterion N3.
   *
   * Undefined on every card but the one that can act for the person, which is the same card
   * `elevation` above is given to and is decided the same way, at the call. A list because the person may
   * have more than one secretary, and an empty list means
   * nobody holds the card at all.
   */
  notebooks?: NotebookOnACard[]
  /** The handbooks hung on this card. Undefined on a person's card and on one written here, which none can hang on. */
  handbooks?: readonly HandbookRead[]
}) {
  const inspect = useInspect()
  const record = copy === null ? null : copy.record
  const picture = pictureFor(card.name, portraits, chosenPortrait)
  const howItWorks = howItWorksHere(card)
  return (
    <li className="rol-block">
      {/* THE PORTRAIT, LARGE, which was the first thing asked for. It is a square
          beside the words where there is room and the block's own width where there is not. */}
      <div className="rol-face">
        {picture === null ? (
          <p className="rol-absent rol-no-portrait"><Absence title={ROLES_WORDS.noPortrait} /></p>
        ) : (
          // THE PAGE DRAWS A SMALL COPY AND A PRESS OPENS THE WHOLE PICTURE. Five whole portraits made this
          // page's first load 14.0 MB; the copy is made on the server and the chosen address is unchanged.
          <OpensLarge src={whereRequestsGo(picture)} crossOrigin={theCrossOriginOfALoad()} alt={t('g6b.cardPicture', { name: cardWord(card.name) })}>
            <img className="rol-portrait" src={whereRequestsGo(smallPortrait(picture))} crossOrigin={theCrossOriginOfALoad()} alt={t('g6b.cardPicture', { name: cardWord(card.name) })} />
          </OpensLarge>
        )}
      </div>
      <div className="rol-body">
        <div className="rol-top">
          <h3 className="rol-name">{cardWord(card.name)}</h3>
          {/* A PERSON'S CARD IS OFF THE AGENT LADDER, and the block says so in those words rather
              than printing "not on the ladder", which here would read as a rung it had lost. */}
          <span className="rol-rung">
            {standing !== undefined
              ? ROLES_WORDS.notARung
              : card.rung === null
                ? ROLES_WORDS.noRung
                : `${ROLES_WORDS.rung} ${String(card.rung)}`}
          </span>
          {/* WHICH KIND OF CARD THIS IS. Criterion P49: the shipped ones are marked as defaults. */}
          <span className="rol-mark">{mark}</span>
          {addedName !== undefined ? <div className="rol-added-actions"><RouteLink to={`/roles/added/${encodeURIComponent(addedName)}`}>{t('addedRoles.edit')}</RouteLink><RouteLink to={`/roles/added/${encodeURIComponent(addedName)}/history`}>{t('addedRoles.history')}</RouteLink><RouteLink to={`/roles/added/${encodeURIComponent(addedName)}/remove`}>{t('addedRoles.remove')}</RouteLink></div> : null}
        </div>

        {/* THE DUTIES: what the role is responsible for, in the words of whoever defined it. */}
        <p className="rol-for">{card.duties}</p>
        {wordsRecord === undefined ? null : (
          <p>
            {wordsRecord === null ? (
              <Absence title={t('roleWords.noRecord')} />
            ) : (
              <RouteLink to={recordPath(wordsRecord)}>{t('roleWords.change')}</RouteLink>
            )}
          </p>
        )}
        {/* ONLY A SHIPPED CARD HAS SHIPPED WORDS. A card added on the Roles page has a words record too, but the
            shipped file does not declare it, so it has no shipped words and its block draws none. */}
        {wordsRecord && addedName === undefined ? <TheShippedWords role={card.name} /> : null}

        {/* THE WORDS NAME NOBODY THE OFFICE KNOWS ABOVE THE HOLDER, so an overlap adds nobody above it.
            Only an added card is warned: on a card the office ships the declaration decides who is added,
            and the words record changes only what is shown. */}
        {addedName !== undefined && whoTheCardReportsTo(card) === 'nobody the office can name' ? (
          <p className="rol-reports-to-nobody" role="status" data-reports-to-names-nobody="">{t('addedRoles.reportsToNamesNobody')}</p>
        ) : null}

        {/* HOW IT WORKS, UNDER ITS OWN HEADING, where the card has one. It is the card's handbook text
            in the page's language, read by the one function every card page
            asks. A card with none draws nothing here, and its older flow notes are never drawn instead.
            It is folded to its first points on every load, and the text's own How it works line is left
            out because the heading above says it, by items 4 and 6 of a decision. */}
        {howItWorks === null ? null : (
          <div className="rol-how">
            <h4 data-title-is="its-label" className="rol-how-name">{ROLES_WORDS.flow}</h4>
            <HowItWorksText text={howItWorks} underAHeading />
          </div>
        )}
        {/* THE HANDBOOK RECORDS HUNG ON THIS CARD, in one line under How it works. A card with none draws nothing. */}
        {handbooks === undefined ? null : <TheHandbooksOnACard handbooks={handbooks} />}
        {standing === undefined ? null : (
          <p className="rol-standing">
            <span className="rol-key">{ROLES_WORDS.standing}</span> {standing}
          </p>
        )}

        {/* THE POWERS, AS NAMES. Criterion P61. The server fills them in from the rung and the tree
            before it serves the card, with the same reading the refusal uses, so a block cannot come
            to show a power the server does not grant. */}
        <Powers names={card.powers ?? []} />

        {/* WHAT ACTING FOR THE PERSON IS. Criterion P59, described here and pressed on the agent's
            own profile since criterion P64. */}
        {elevation === undefined ? null : <TheElevation said={elevation} />}

        {/* THE ONE LINE SAYING NOTHING ENFORCES THIS CARD, on the cards that is true of. */}
        {enforces === undefined ? null : <p className="rol-not-enforced">{enforces}</p>}

        {/* THE NOTEBOOKS KEPT UNDER THIS CARD, AND THEIR NUMBERS. Criterion N3.
            DRAWN OPEN AND NOT BEHIND THE FOLD BELOW. That fold is criterion P72's way into the role
            census — how many citizens hold each card — and it puts THOSE
            numbers behind a press and carries none on the closed fold. These are different numbers,
            about a notebook rather than about who holds a card, and they belong on the card itself. */}
        {notebooks === undefined ? null : (
          <div className="rol-notebooks">
            <p className="rol-notebooks-key">{ROLES_WORDS.notebooks}</p>
            {notebooks.length === 0 ? (
              <p className="rol-notebooks-none">
                <Absence title={t('g6b.roles.noHolders')} />
              </p>
            ) : (
              notebooks.map((one) => (
                <div className="rol-notebook" key={one.agent}>
                  <p className="rol-notebook-who">
                    <RouteLink to={notebookPath('agent', one.agent)}><ParticipantName kind="agent" id={one.agent} /></RouteLink>
                  </p>
                  {one.isThere ? (
                    <dl className="rol-notebook-counts">
                      <NotebookNumbers notebook={one} className="rol-notebook-count" />
                    </dl>
                  ) : (
                    <p className="rol-notebook-none">
                      <Absence title={t('g6b.notebook.noNotebook')} />
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* THE WAY INTO THE STATISTICS, FOLDED SHUT. Criterion P72: the way in needs a press to open
            and is not open already. `Explain` is drawn with no `open`, which is closed — the same
            fold the tree's nodes use one section down, for the same reason. */}
        <Explain
          declares={{ surface: null }}
          meaning={ROLES_WORDS.whoHolds}
          opens={ROLES_WORDS.whoHoldsOpens}
        >
          {/* THE FOLD'S NAME AND THIS PRESS ARE THE WHOLE OF IT. A sentence here saying what the
              statistics page holds would be the page explained twice, once where it is not. */}
          <p className="rol-census-open">
            <RouteLink to={roleCensusPath()}>{ROLES_WORDS.whoHoldsPress}</RouteLink>
          </p>
        </Explain>

        {/* THE WAY IN, OR THE STATE THAT THERE IS NONE. Criterion P66. A press that goes nowhere is
            worse than saying there is no page. */}
        {record === null ? (
          <p className="rol-absent">
            <Absence title={ROLES_WORDS.noPage} />
          </p>
        ) : (
          <p className="rol-open">
            <RouteLink to={recordPath(record)}>{ROLES_WORDS.open}</RouteLink>
          </p>
        )}
        {copy !== null && copy.state === 'out of date' ? (
          <p className="rol-stale">{inspect ? t('g6b.roles.staleFields', { fields: content(copy.differsIn.join(', ')) }) : t('g6b.roles.stale')}</p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * WHAT ACTING FOR THE PERSON IS, AND WHERE THEY SAY SO. Criterion P64.
 *
 * ---------------------------------------------------------------------------------------
 * THIS BLOCK DESCRIBES. IT APPOINTS NOBODY
 * ---------------------------------------------------------------------------------------
 *
 * Appointing a secretary does not belong on the
 * role cards page; the role cards describe, and appointing a role and choosing for how long belong
 * on the role profile reached from the Embassy.
 *
 * So what was here — the choice of end, the box for it, the press and the press that ended it — is
 * on `TheirCard`, on the agent's own profile. What stays is the first sentence of the declaration's
 * own description behind the hint, and the way to the page where the person does it.
 *
 * THE STATE IS NOT HERE EITHER. Who is acting for the person right now is on that agent's profile and on
 * this card's own page; a card in a list of cards is not where somebody looks for it, and drawing it
 * in three places would be three readings of one fact.
 */
function TheElevation({ said }: { said: { rule: ElevationRule } }) {
  return (
    <div className="rol-elev">
      <div className="rol-elev-head">
        <span className="rol-key">{ROLES_WORDS.actingFor}</span>
        <Hint>{cutAfterTheFirstSentence(said.rule.whatItIs[wordLanguage() === 'zh' ? 'zh' : 'en'] ?? '').first}</Hint>
      </div>
      {/* THE PRESS STAYS IN SIGHT, outside the hint. */}
      <RouteLink to={pathFor('embassy')}>{ROLES_WORDS.whereItIsDone}</RouteLink>
    </div>
  )
}

/** A text cut after its first sentence: the first sentence and the rest, which is empty when there is one sentence. */
export function cutAfterTheFirstSentence(text: string): { first: string; rest: string } {
  const trimmed = text.trim()
  const cut = /^(.*?(?:[.!?](?=\s)|[。！？]))\s*(\S[\s\S]*)$/u.exec(trimmed)
  return cut === null ? { first: trimmed, rest: '' } : { first: cut[1] ?? trimmed, rest: cut[2] ?? '' }
}

/**
 * THE POWER TREE, DRAWN AS A HIERARCHY. Criteria P68 and P79.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHAT CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * The Role cards page could draw the power tree. The first drawing did not: it only put the parts
 * into words, with no hierarchy as a graph. It stacked
 * the cards and put a rung number on each, which is the cards labelled rather than a hierarchy.
 *
 * So each card is a node with its portrait, its name, and the powers it holds behind a fold, and the
 * nodes are connected top to bottom: the person's own card above, then the secretary, then the
 * supervisor, then the worker, with the card off the tree under the chain and to one side. The line between
 * one node and the one below it says what the upper card may do to the lower one.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE DECIDES ANYTHING. IT IS THE SAME READING AS THE CARDS
 * ---------------------------------------------------------------------------------------
 *
 * Which cards are on the tree, in what order, what each holds and what each may do to the one below
 * all come off the SAME reply the blocks below are drawn from: `tree` gives the rungs, the order and
 * the acts (`whatTheCardAboveMayDoToThis`), and every node's powers are the card's own `powers`,
 * which the server filled in from the tree with the reading a refusal uses. So a drawing that
 * disagreed with a card would be the server disagreeing with itself. The names of the roles are
 * never typed here; the drawing reads them from the reply.
 *
 * A card the declaration gives no rung is drawn under the chain and to one side rather than left out.
 * Leaving it out would be the drawing saying there are three cards when the page shows four.
 *
 * THE POWERS ARE FOLDED, which is what criterion P68 asks for: the tree answers who is above whom
 * at a glance, and a reader who wants the powers of one rung opens that one.
 *
 * ---------------------------------------------------------------------------------------
 * THE PORTRAIT AND THE PRESS, AND THE ONE NUMBER THAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * The portrait is the one the page already fetched for the blocks, so a node and the block below it
 * cannot show different pictures. The press opens the card's own page where the reply carries a
 * copy of it; where there is no copy there is no page, and the node says so rather than drawing a
 * press that would go nowhere (criterion P66).
 *
 * THE COUNT OF CITIZENS HOLDING A CARD IS NOT IN THIS REPLY. The design asks the node to carry it,
 * and the number lives in GET /api/roles/who-holds-them, which this page does not fetch: adding a
 * second request would be a second reading of who holds what, and the brief forbids inventing one.
 * So the node draws no count and guesses none.
 */
function TheTree({
  said,
  portraits,
}: {
  said: WhatTheRolesSay
  /** Every role's pictures, by role, or null because the reading has not arrived. */
  portraits: Readonly<Record<string, PortraitOnOffer[]>> | null
}) {
  const cardOf = new Map<string, RoleCard>(said.cards.map((one) => [one.name, one]))
  const copyOf = new Map<string, RoleCardCopy>(said.mirror.map((one) => [one.role, one]))
  // HIGHEST RUNG FIRST, so the drawing reads the way the words do: a secretary is above a supervisor
  // is above a worker. The order is the declaration's own, sorted by the rung it gives.
  const rungs = [...said.tree].sort((a, b) => b.rung - a.rung)
  const onTheTree = new Set(said.tree.map((one) => one.role))
  // A CARD THE DECLARATION GIVES NO RUNG STANDS OFF TO ONE SIDE, BELOW THE CHAIN, AND NOT LEVEL
  // WITH THE TOP OF IT. The first version of the design put the one that checks beside the
  // secretary; the twelfth objection to it overruled that and said why: the declaration gives the
  // inspector `rung: null` and the worker's two powers, so drawing it at the secretary's height
  // tells a reader it is the secretary's peer in power, which the declaration does not say. Its
  // words: "TheTree today draws it off to one side and labels it 'beside the tree'; keep that."
  const beside = said.cards.filter((one) => one.rung === null && !onTheTree.has(one.name))
  // ONLY THE ONE THAT CHECKS IS MARKED SO. A card beside the tree is not always the checker: the
  // mailer card stands there too, and may do nothing but read the
  // summonses. Which card checks is worked out once, by theCardOffTheTree, for the server and here.
  // The mailer card left the declaration on 1 October 2026. The rule stays.
  const checker = theCardOffTheTree({ cards: said.cards.filter(card => card.source !== 'added') })?.name ?? null

  return (
    <section className="rol-tree" {...declaredAttributes({ surface: 'roles.tree' })}>
      <h2 data-title-is="its-label" className="rol-group-name">{ROLES_WORDS.tree}</h2>
      {/* THE DRAWING FITS 390, and if a card is ever wider than its box it scrolls inside that box
          rather than pushing the page sideways. AND IT SAYS SO: `InReach` draws the rule and the fade on whichever edge the drawing carries
          on past. A box that takes content off the edge in silence is a defect, and on a platform whose scrollbar is
          0px wide there is nothing else to notice it by. */}
      <InReach box="rol-tree-scroll" name={ROLES_WORDS.tree} shape={String(said.tree.length)}>
        <div className="rol-tree-inner">
          <ol className="rol-tree-stack">
            {/* THE PERSON, ABOVE. Not a rung: the administrator card is the person's own and carries
                no place on the agent tree, so it is drawn above the line and says which it is. */}
            {said.personCards.map((card) => (
              <li className="rol-tree-row" key={card.name}>
                <Node
                  card={card}
                  where={ROLES_WORDS.above}
                  portraits={portraits}
                  copy={copyOf.get(card.name) ?? null}
                />
              </li>
            ))}
            {/* THE RUNGS, HIGHEST AT THE TOP. The line above each one is what the card above it may
                do to it, and it is the declaration's own words, read off the step. */}
            {rungs.map((step) => {
              const card = cardOf.get(step.role)
              if (card === undefined) return null
              return (
                <li className="rol-tree-row" key={step.role}>
                  <TheLine to={step.role} acts={step.whatTheCardAboveMayDoToThis} />
                  <div className="rol-tree-card">
                    <Node
                      card={card}
                      where={`${ROLES_WORDS.rung} ${String(step.rung)}`}
                      portraits={portraits}
                      copy={copyOf.get(card.name) ?? null}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
          {/* AND THE CARDS OFF THE CHAIN, under it and to one side, each saying it is off the tree
              and what it is there for. No line runs into them: no card on the tree stands above a
              card the declaration gives no rung, and a line drawn here would say one does. */}
          {beside.length === 0 ? null : (
            <div className="rol-tree-aside">
              {beside.map((off) => (
                <div className="rol-tree-beside" key={off.name}>
                  <Node
                    card={off}
                    where={ROLES_WORDS.beside}
                    marks={off.name === checker ? [ROLES_WORDS.checks] : []}
                    portraits={portraits}
                    copy={copyOf.get(off.name) ?? null}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </InReach>
    </section>
  )
}

/**
 * ONE LINE OF THE TREE: what the card above may do to the card below it. Criterion P79.
 *
 * `to` names the card this line leads down to, and it is the step's own role. The acts are the
 * declaration's words, never written here, so the test that reads the same reply can hold the two
 * together. The attribute is how that test finds one line rather than searching the whole drawing.
 */
function TheLine({ to, acts }: { to: string; acts: readonly string[] }) {
  return (
    <div className="rol-tree-line" data-tree-line={to}>
      <span className="rol-tree-rule" aria-hidden="true" />
      {acts.length === 0 ? null : (
        <ul className="rol-tree-acts">
          {acts.map((one) => (
            <li className="rol-tree-act" key={one}>
              {one}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One card on the drawing: its portrait, its name, where it stands, and its powers behind a fold. */
function Node({
  card,
  where,
  marks,
  portraits,
  copy,
}: {
  card: RoleCard
  where: string
  /** Small marks beside the name, such as the one saying the off-tree card is the one that checks. */
  marks?: readonly string[]
  portraits: Readonly<Record<string, PortraitOnOffer[]>> | null
  copy: RoleCardCopy | null
}) {
  const powers = card.powers ?? []
  const picture = pictureFor(card.name, portraits, undefined)
  const record = copy === null ? null : copy.record
  return (
    <div className="rol-tree-node">
      <div className="rol-tree-face">
        {picture === null ? (
          // NOT YET READ IS NOT THE SAME AS NOBODY PAINTED ONE, so the empty box says nothing until
          // the pictures have arrived.
          portraits === null ? null : <span className="rol-absent rol-tree-no-portrait"><Absence title={ROLES_WORDS.noPortrait} /></span>
        ) : (
          <img className="rol-tree-portrait" src={whereRequestsGo(smallPortrait(picture))} crossOrigin={theCrossOriginOfALoad()} alt={t('g6b.cardPicture', { name: cardWord(card.name) })} />
        )}
      </div>
      <div className="rol-tree-body">
        <p className="rol-node-top">
          <span className="rol-node-name">{cardWord(card.name)}</span>
          <span className="rol-node-where">{where}</span>
          {(marks ?? []).map((one) => (
            <span className="rol-tree-mark" key={one}>
              {one}
            </span>
          ))}
        </p>
        {record === null ? (
          <p className="rol-tree-no-page">
            <Absence title={ROLES_WORDS.noPage} />
          </p>
        ) : (
          <p className="rol-tree-open">
            <RouteLink to={recordPath(record)}>{ROLES_WORDS.open}</RouteLink>
          </p>
        )}
        <Explain
          declares={{ surface: null }}
          meaning={<span className="rol-node-meaning">{ROLES_WORDS.powers}</span>}
          opens={ROLES_WORDS.opensPowers}
          holds={{ count: powers.length, what: t('g6b.roles.powerUnit', { n: powers.length }) }}
        >
          {powers.length === 0 ? (
            <Absence title={ROLES_WORDS.noPowersWord} />
          ) : (
            <ul className="rol-powers">
              {powers.map((one) => (
                <li className="rol-power" key={one}>
                  {powerNameHere(one)}
                </li>
              ))}
            </ul>
          )}
        </Explain>
      </div>
    </div>
  )
}

/**
 * THE POWERS A CARD HOLDS, as names. Criterion P56: names, not sentences, and no complement.
 *
 * The acts under each name are on the card's own page. A block that listed them would be the act
 * matrix again under a different heading, and that matrix was to go.
 */
function Powers({ names }: { names: readonly string[] }) {
  return (
    <section className="rol-act-group">
      <h4 data-title-is="its-label" className="rol-act-name">{ROLES_WORDS.powers}</h4>
      {names.length === 0 ? (
        <Absence title={ROLES_WORDS.noPowersWord} />
      ) : (
        <ul className="rol-powers">
          {names.map((one) => (
            <li className="rol-power" key={one}>
              {powerNameHere(one)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * THE BLOCK THAT MAKES A NEW CARD. Criterion P50.
 *
 * The portrait is a mole all in black with a large plus in the middle, every other field is empty,
 * and you fill it in after pressing into it.
 *
 * SO NOTHING IS FILLED IN HERE. The block has the portrait's place, a name and a press, and the
 * places the story and the two permission lines sit on every other block are EMPTY rather than
 * carrying an invitation. An example role, a greyed-out sentence or a "your role here" would each
 * be a card somebody had started writing for them, which is the opposite of what was asked for.
 *
 * IT IS A BUTTON AND THE WHOLE BLOCK IS THE PRESS, because a person presses into the block rather
 * than looking for a link inside it.
 */
function AddBlock() {
  return (
    <li className="rol-block rol-add">
      <button
        type="button"
        className="rol-add-press"
        onClick={() => navigate('/roles/new')}
        {...declaredAttributes({ surface: 'roles.add' })}
      >
        <span className="rol-face rol-add-face">
          <MoleSilhouette className="rol-silhouette" />
        </span>
        <span className="rol-body rol-add-body">
          <span className="rol-name">{ROLES_WORDS.addName}</span>
          {/* THE PLACES THE OTHER BLOCKS' WORDS SIT, LEFT EMPTY. They hold the block's height so it
              stands beside the others rather than collapsing to the size of its own title. */}
          <span className="rol-add-empty" aria-hidden="true" />
          <span className="rol-add-empty" aria-hidden="true" />
          <span className="rol-add-word">{ROLES_WORDS.addPress}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * This page's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
export const ROLES_CSS = `
.rol-added-actions { display: flex; flex-wrap: wrap; gap: var(--pad); }
.rol-notebooks { margin: var(--gut) 0 0 0; }
.rol-notebooks-key { margin: 0 0 var(--pad) 0; color: var(--text-3); font-size: var(--fs-1); }
.rol-notebooks-none, .rol-notebook-none { margin: 0; }
.rol-notebook { min-width: 0; margin: 0 0 var(--pad) 0; }
.rol-notebook-who { margin: 0; overflow-wrap: anywhere; }
.rol-notebook-counts { display: flex; flex-wrap: wrap; gap: var(--gut); margin: var(--pad) 0 0 0; }
.rol-notebook-count { min-width: 0; display: flex; gap: var(--pad); align-items: baseline; }
.rol-notebook-count dt { color: var(--text-3); font-size: var(--fs-1); }
.rol-notebook-count dd { margin: 0; color: var(--text); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.rol { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.rol-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); }

/* ONE BLOCK PER CARD, AND ONE COLUMN UNTIL THERE IS ROOM FOR TWO. A card carries a large picture
   and two lists of acts, so two of them side by side on a narrower window leave neither a readable
   width. The cards are one kind, so this is a list grid and not the two columns of a mixed page; it
   only reads its switch from components/SideBySide.tsx, the product's one number for a wide screen. */
.rol-blocks {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: 1fr; gap: var(--gut);
  min-width: 0;
}
@media ${WIDE_SCREEN} {
  .rol-blocks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.rol-block {
  display: flex; flex-wrap: wrap; gap: var(--gut);
  min-width: 0;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border); border-radius: var(--radius);
  background: var(--panel);
}

/* THE PORTRAIT, LARGE. This page leads with a large portrait. It is a
   fixed square beside the words where there is room and the block's own width where there is not. */
.rol-face {
  flex: 0 0 auto;
  width: 176px; height: 176px;
  display: flex; align-items: center; justify-content: center;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
  padding: var(--pad);
  text-align: center;
  overflow: hidden;
}
.rol-face .sb-image-opens { width: 100%; height: 100%; }
.rol-portrait { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm); }
.rol-no-portrait { margin: 0; }
@media (max-width: 40rem) {
  .rol-face { width: 100%; height: 200px; }
}

.rol-body { flex: 1 1 18rem; min-width: 0; display: flex; flex-direction: column; gap: var(--pad); }
.rol-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; min-width: 0; }
.rol-name { margin: 0; font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.rol-rung {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
/* WHICH KIND OF CARD THIS IS: one Mole Office ships with, or one somebody wrote here. A quiet pill,
   because it is a fact about where the card came from rather than something to act on. */
.rol-mark {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-pill);
  color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.rol-for {
  margin: 0; max-width: var(--measure-in-box);
  font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text);
  overflow-wrap: anywhere;
}
.rol-how { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.rol-how-name {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.rol-census-says { margin: 0 0 var(--pad); color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.rol-census-open { margin: 0; font-size: var(--fs-1); }
.rol-open { margin: 0; font-size: var(--fs-2); }
.rol-group { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rol-group-name[data-title-is="its-label"] {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: var(--section-space); text-transform: var(--section-case);
}
.rol-standing { margin: 0; font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.rol-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}

/* THE POWER TREE, DRAWN AS A HIERARCHY. Criteria P68 and P79. The chain runs top to bottom, so the
   reading does not depend on the window. The card off the tree sits under the chain, to one side.
   IT FITS A PHONE. The drawing used to be held at least 30rem wide, so at 390 every card on the
   chain ran past the right edge of its box and a reader saw half of each one (wave 13q's
   pictures). Each node and each line of acts wraps, so the drawing needs no minimum.
   The box still scrolls sideways, and says so, if one long unbroken word ever makes a card wider. */
.rol-tree { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rol-tree-scroll { min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; }
.rol-tree-inner { min-width: 0; }
.rol-tree-stack { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 0; }
.rol-tree-row { min-width: 0; }
/* THE LINE BETWEEN TWO NODES. A rule runs down the left and the acts the upper card may do to the
   lower one sit beside it, so what the line says is on the line. */
.rol-tree-line {
  display: grid; grid-template-columns: 2.5rem minmax(0, 1fr);
  align-items: center; gap: var(--pad);
  padding: calc(var(--pad) / 2) 0; min-width: 0;
}
.rol-tree-rule {
  justify-self: center; align-self: stretch; width: var(--border-w); min-height: 1.5rem;
  background: var(--border-strong); border-radius: var(--radius-pill);
}
.rol-tree-acts { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.rol-tree-act {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-pill);
  background: var(--panel-2, var(--panel)); color: var(--text-2);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
/* THE CARDS OFF THE TREE, UNDER THE CHAIN AND TO ONE SIDE. Objection 12 to the design: a card the
   declaration gives no rung is not at the height of the top rung, because that reads as its peer in
   power. Indented so it is plainly not part of the chain, and no line runs into it. */
.rol-tree-card { min-width: 0; }
.rol-tree-aside {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--gut);
  margin-top: var(--gut); padding-left: 2.5rem; min-width: 0;
}
.rol-tree-beside { flex: 0 1 16rem; min-width: 0; }
/* ONE NODE: the portrait, the name, the way into the card and the powers behind a fold. */
.rol-tree-node {
  display: flex; flex-wrap: wrap; gap: var(--pad); align-items: flex-start;
  min-width: 0;
  padding: var(--pad);
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
}
.rol-tree-face {
  flex: 0 0 auto; width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel); padding: 2px;
  text-align: center; overflow: hidden;
}
.rol-tree-portrait { width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm); }
.rol-tree-no-portrait { margin: 0; }
.rol-tree-body { flex: 1 1 12rem; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rol-tree-mark {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-pill);
  color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.rol-tree-open, .rol-tree-no-page { margin: 0; font-size: var(--fs-1); }
.rol-node-top { margin: 0 0 2px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; }
.rol-node-name { font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.rol-node-where {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.rol-node-meaning { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); }

/* THE POWERS, AS NAMES IN A ROW. One line of short names reads as a set; a column of them reads as
   a list of rules, which is what the block stopped being. */
.rol-act-group { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rol-act-name {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.rol-powers { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.rol-power {
  padding: 1px 8px;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-pill);
  background: var(--panel-2, var(--panel)); color: var(--text);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  overflow-wrap: anywhere;
}

/* NOTHING ENFORCES THIS CARD. It is a fact a reader has to act on — do not rely on it — so it
   carries the weight the drawing chapter gives a warning, and it sits above the way in. */
.rol-not-enforced {
  margin: 0; max-width: var(--measure-in-box);
  padding: 2px var(--pad);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  background: var(--st-failed-bg); color: var(--st-failed);
  font-size: var(--fs-1); line-height: var(--lh-read);
}

/* THE WORDS NAME NOBODY THE OFFICE KNOWS ABOVE THE HOLDER. The card can still be applied, so this is
   a caution about what the office will do rather than a fault, and it wraps rather than pushing the
   page sideways at a phone width. */
.rol-reports-to-nobody {
  margin: 0; max-width: var(--measure-in-box);
  padding: 2px var(--pad);
  border-left: var(--rail) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
  background: var(--st-inferred-bg); color: var(--st-inferred);
  font-size: var(--fs-1); line-height: var(--lh-read);
  overflow-wrap: anywhere;
}

/* WHAT ACTING FOR THE PERSON IS. Criteria P59 and P64. It is a description on a card, so it carries
   the weight of a fact somebody reads rather than of a control: the presses are on the profile. */
.rol-elev { margin: 0; max-width: var(--measure-in-box); min-width: 0; display: grid; gap: var(--pad); justify-items: start; }
.rol-elev-head { display: flex; align-items: center; min-width: 0; }

/* AN ABSENCE AND A STALE COPY. Both are quieter than a fact and both say what they are. */
.rol-absent { margin: 0; font-size: var(--fs-1); font-style: italic; color: var(--text-3); }
.rol-stale { margin: 0; font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- the block that makes a card
   THE WHOLE BLOCK IS THE PRESS, because a person presses INTO it. A dashed edge,
   which is what this product draws for a thing that is not there yet. */
.rol-add { padding: 0; border-style: dashed; }
.rol-add-press {
  display: flex; flex-wrap: wrap; gap: var(--gut);
  width: 100%; min-width: 0;
  margin: 0; padding: var(--pad-lg);
  border: 0; border-radius: var(--radius);
  background: none; color: var(--text);
  text-align: start; cursor: pointer;
  font: inherit;
}
.rol-add-press:hover { background: var(--hover); }
.rol-add-press:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rol-add-face { border-style: dashed; }
.rol-silhouette { width: 100%; height: 100%; color: var(--text); }
.rol-add-body { gap: var(--pad); }
/* THE PLACES THE OTHER BLOCKS' WORDS SIT, EMPTY. The other options are left blank. */
.rol-add-empty { display: block; min-height: var(--fs-4); }
.rol-add-word {
  align-self: start;
  min-height: 30px; display: inline-flex; align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
`
