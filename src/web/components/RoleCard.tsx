// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD, DRAWN. The parts of the card, on the record page of the copy that holds it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FIXES
 * ---------------------------------------------------------------------------------------
 *
 * Problem `76Yh8qLhHdGY`. The role cards are mirrored into a project as `role_card` records so that
 * a card is a thing a person can open. The record page drew the title, the summary and three
 * collapsed rows — Role name, Copied from, Copied at — and nothing of the card itself, because the
 * whole card sits in one field of type `Record<string, unknown>` and the generic body has no way to
 * draw one. A card could be opened and could not be read.
 *
 * ---------------------------------------------------------------------------------------
 * THE CARD IS DUTIES AND POWERS, AND THERE IS NO MAY OR MAY-NOT LIST. Criteria P56 and P61
 * ---------------------------------------------------------------------------------------
 *
 * This drew every act of a May list and every act of a May-not list, which is what made the card a
 * second file of rules, beside agent.md, holding agents back.
 * It now draws the duties, the named powers, and the acts under each name.
 *
 * ---------------------------------------------------------------------------------------
 * THE COPY IS THE WORDS, AND THE DECLARATION IS THE POWERS
 * ---------------------------------------------------------------------------------------
 *
 * `design/permissions/roles.json` is what decides what a role may do. The card's own words — its
 * duties, its powers by name, whom it answers to, what ends it — are read off the RECORD, which is a
 * copy, and this grants nothing. The POWER NAMES on the copy were filled in from the tree when the
 * copy was written, so a copy taken before a power moved says so on the list at #/roles rather than
 * quietly showing today's answer. What is NOT on the copy is the acts under each name: those are the
 * declaration's and are read live, so a name whose acts have changed shows the acts it has now.
 *
 * A PART THE COPY DOES NOT HOLD SAYS SO. A card is stored as an unknown object, so this reads it
 * defensively and prints a plain line where a part is missing rather than leaving a gap that reads
 * as "this role has no such rule".
 *
 * ---------------------------------------------------------------------------------------
 * THE CHAPTERS ARE LINKS, BECAUSE A CHAPTER IS A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * Decision `JC_raqC0fRCh`: a chapter of the code of law is a record in Mole Office and that record is
 * the only authority. A chapter record is a `module` carrying `extra.chapter`, its number — the same
 * rule tools/rules-chapters.mjs finds them by, so there is no second list of ids here. The Must read
 * line names chapter numbers; each one that a record in this project answers to is a link to it, and
 * each one nothing answers to is drawn by its number with a line saying nobody has filed it here.
 */

import { api } from '../api.ts'
import { Absence } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, recordPath } from './router.tsx'
import { theCrossOriginOfALoad, whereRequestsGo } from '../lib/visiting.ts'
import { OpensLarge } from './PictureLarge.tsx'
import { smallPortrait } from '@shared/portraits.ts'
import { useLanguage } from '../lib/language.ts'
// A CARD'S HOW IT WORKS, drawn the one way every card page draws it.
import { HowItWorksText, howItWorksHere } from './HowItWorks.tsx'
import type { PanelRecord } from '@shared/types.ts'
import { chapterNumberOf } from '@shared/office-rules.ts'
import { READING_LEVELS, type NamedChapter, type NamedPower, type ReadingLevel } from '@shared/roles.ts'
import { THE_PERSON } from '@shared/person.ts'
import { t, wordLanguage, WORD_LISTS, type WordKey } from '@shared/i18n.ts'
import { ACTING_FOR, UNTIL } from '@shared/elevation.ts'

/**
 * Every word this component draws that is not read off the record.
 *
 * EACH IS READ FROM THE WORD LISTS WHEN IT IS DRAWN, so a Chinese page draws the card's headings in
 * Chinese (round 19 found them in English on a Chinese card page). They are getters rather than
 * strings fixed when the file loads, because the page's language can change after that. Where the
 * Role cards page already has a word for the same thing, this reads that word, so the two pages call
 * one part of a card by one name.
 */
export const ROLE_CARD_WORDS = {
  get duties() { return t('roleCard.part.duties') },
  /** The heading over a card's How it works, its handbook text, where it has one. */
  get flow() { return t('g6b.roles.flow') },
  get powers() { return t('g6b.roles.powers') },
  get mustRead() { return t('roleCard.part.mustRead') },
  get reportsTo() { return t('roleCard.part.reportsTo') },
  get whatEndsIt() { return t('roleCard.part.whatEndsIt') },
  get appointedBy() { return t('roleCard.part.appointedBy') },
  get appoints() { return t('roleCard.part.appoints') },
  get rung() { return t('roleCard.part.rung') },
  get portrait() { return t('record.section.portrait') },
  /** Said where the copy holds no such part, which is not the same as the role having none. */
  get missing() { return t('roleCard.missing') },
  /** Said where a role is not on the tree. */
  get noRung() { return t('g6b.roles.noRung') },
  /** What is said before the chapters a starter adds on top. */
  get andItsStarter() { return t('roleCard.andItsStarter') },
  /** Said where nothing in this project answers to a chapter number. */
  get noChapterRecord() { return t('roleCard.noChapterRecord') },
  /** Said where nobody has painted a portrait for this role yet. */
  get noPortrait() { return t('g6b.roles.noPortrait') },
  /** Said while the declaration is still on its way, so no power is claimed either way. */
  get powersOnTheirWay() { return t('roleCard.powersOnTheirWay') },
  /** Said where the card holds no power at all. */
  get noPowers() { return t('roleCard.noPowers') },
  /** The heading over the elevation state, on the one card that can hold one. Criterion P59. */
  get elevation() { return t('g6b.roles.actingFor') },
  /**
   * SAID ON THAT CARD WHILE NOBODY IS. It goes through `Absence` at the told-apart tier, which is
   * what this product draws for an emptiness somebody LOOKED for: nothing has gone missing and there
   * is nothing to do about it, so `must-act-on` would be wrong and a dash would be wrong the other
   * way. The press itself is on the list at #/roles and the sentence says so.
   */
  get notActingWord() { return t('roleCard.notActingWord') },
}

/**
 * A POWER'S NAME IN THE PAGE'S LANGUAGE. The names are declared in design/permissions/roles.json,
 * in English, and the declaration holds no Chinese name. So each declared name has a word,
 * `role.power.<name>`, whose English is the declared name itself. A name no word is kept for is drawn as it is stored: that is a copy of a card naming a power
 * the declaration no longer holds, and the copy's own word is what it says.
 */
export function powerNameHere(name: string): string {
  const key = `role.power.${name}`
  return Object.hasOwn(WORD_LISTS.en, key) ? t(key as WordKey) : name
}

/*
 * THERE IS NO LINE UNDER THE CARD SAYING THE COPY GRANTS NOTHING, and that is deliberate.
 *
 * It said so in two sentences, and docs/UX-CONTRACT.md has said since round three that a fix
 * amounting to "add a sentence explaining it" is a failed fix. The fact is on the page already, in structure rather than in prose: the
 * record's own folds say Copied from and Copied at, which is what a copy is, and the list at
 * #/roles carries the server's own sentence beside every card. The kind's declaration says it too,
 * for anybody reading GET /api/kinds.
 */

/**
 * HOW MUCH OF A CHAPTER A ROLE READS, as the word-list key of the words a person reads on this screen.
 *
 * IT IS TOTAL OVER `ReadingLevel`, so a fourth level added to the declaration is a missing property
 * and a build that stops, rather than a screen quietly drawing a stored word nobody wrote for a
 * reader. The three words themselves are the declaration's, and `READING_LEVELS` in
 * src/shared/roles.ts is where they are declared.
 *
 * IT IS NOT A COPY OF `readingLevels[].meaning` IN THE DECLARATION. That is an instruction to an
 * agent holding the card — "Read the whole chapter." — and this is the label under a chapter's name
 * on a page. A card whose level this build has never heard of draws the stored word instead, which
 * says what the copy holds rather than guessing which of the three was meant.
 */
const HOW_MUCH: Readonly<Record<ReadingLevel, WordKey>> = {
  full: 'roleCard.howMuch.full',
  conclusion: 'roleCard.howMuch.conclusion',
  'label-and-title': 'roleCard.howMuch.labelAndTitle',
}

/** The stored word for a reading level, or null where the copy holds something else. */
function levelOf(value: unknown): ReadingLevel | null {
  return typeof value === 'string' && (READING_LEVELS as readonly string[]).includes(value)
    ? (value as ReadingLevel)
    : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A stored string with something in it, or null. */
function words(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** The record of one chapter of the code of law, by its number, or null because nothing here is it. */
function chapterRecord(records: readonly PanelRecord[], number: number): PanelRecord | null {
  // THE ONE DEFINITION OF A CHAPTER (chapterNumberOf, from A_CHAPTER in src/shared/office-rules.ts), which
  // the server's neighbourhood of a role card asks too, so the page names the records the server sent.
  return records.find((one) => chapterNumberOf(one.kind, one.data) === number) ?? null
}

/**
 * ONE CHAPTER ON THE MUST-READ LINE, BY ITS NAME, linked to its record. The name is the one GET /api/roles gives it, which
 * is the name the office's chapter record gives it, with the Chinese from the same record on a Chinese page; never a
 * name the card file typed. Until that reply has come, the line says the chapter's number,
 * as it does for a chapter with no record. A chapter with no Chinese is drawn in English on a Chinese page, marked so.
 */
function ChapterLink({ record, number, named }: { record: PanelRecord; number: number; named: NamedChapter | null }) {
  const inChinese = wordLanguage() === 'zh'
  return (
    <RouteLink className="rc-chapter-name" to={recordPath(record.id)}>
      {named === null ? (
        t('roleCard.chapter', { n: number })
      ) : (
        <span lang={inChinese && named.zh === null ? 'en' : undefined}>{inChinese && named.zh !== null ? named.zh : named.name}</span>
      )}
    </RouteLink>
  )
}

/** One labelled part of the card. The label is a heading and the part is under it. */
function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rc-part">
      <h3 className="rc-part-name">{label}</h3>
      {children}
    </section>
  )
}

/** A part the copy does not hold. Said in words, because a gap reads as "there is no such rule". */
function Missing() {
  return <p className="rc-absent">{ROLE_CARD_WORDS.missing}</p>
}

/**
 * THE POWERS THIS CARD HOLDS, each name with the acts under it.
 *
 * The names come from the tree and the acts from the declaration's `powers`, so nothing here is a
 * second statement of either. The block on #/roles draws the names alone; this is the page where a
 * reader can see which acts a name covers.
 */
function Powers({ held }: { held: readonly NamedPower[] }) {
  if (held.length === 0) return <p className="rc-absent">{ROLE_CARD_WORDS.noPowers}</p>
  return (
    <ul className="rc-powers">
      {held.map((power) => (
        <li className="rc-power" key={power.name}>
          <span className="rc-power-name">{powerNameHere(power.name)}</span>
          <ul className="rc-acts">
            {power.acts.map((act) => (
              <li className="rc-act" key={act.act}>
                <span className="rc-act-words">{act.inWords}</span>
                {/* THE ACT'S OWN KEY, because a refusal names it and a reader matching one to the
                    other needs the word Mole Office uses. It is a machine word and drawn as one. */}
                <code className="rc-act-key">{act.act}</code>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export interface RoleCardProps {
  /** The record holding the copy. Its `card` field is the whole card. */
  record: PanelRecord
  /** Every record in this project, so a chapter number can be drawn as a link to its chapter. */
  records: readonly PanelRecord[]
}

/**
 * ONE ROLE CARD: the portrait, the name and rung, the duties, the powers, and the lines that place
 * the role in the Office.
 */
export function RoleCard({ record, records }: RoleCardProps) {
  // THE DECLARATION, FOR THE ACTS UNDER EACH POWER. The names are on the copy; what each name
  // covers is the declaration's, so it is read live rather than copied into the record.
  // THE PAGE'S LANGUAGE, so How it works is drawn again in the other language when the switch moves.
  useLanguage()
  const [decl] = useProjectAsync(() => api.roles(), [])
  const card = record.data['card']
  if (!isObject(card)) {
    return (
      <div className="rc">
        <style href="mole-office-role-card" precedence="default">
          {ROLE_CARD_CSS}
        </style>
        <p className="rc-absent">{ROLE_CARD_WORDS.missing}</p>
      </div>
    )
  }

  const mustRead = isObject(card['mustRead']) ? (card['mustRead'] as Record<string, unknown>) : null
  const chapters = mustRead !== null && Array.isArray(mustRead['chapters']) ? mustRead['chapters'] : null
  const alsoNamed = mustRead === null ? null : words(mustRead['andWhatItsStarterNames'])
  const rung = typeof card['rung'] === 'number' ? card['rung'] : null
  // THE PORTRAIT, WHEN SOMEBODY HAS CHOSEN ONE. Criterion P47: three per role, painted elsewhere and
  // picked by the person or agent holding the card. This draws the one the record names and says
  // plainly when there is none; it never draws a picture nobody chose.
  const portrait = words(record.data['portrait'])

  // HOW IT WORKS, off the copy, and whether the declaration's card of the same name has one. A card
  // written here is not a copy of any declared card, so it is never compared with one.
  const howItWorks = howItWorksHere(card)
  const roleName = words(record.data['roleName'])
  const theDeclarationHasOne =
    howItWorks === null &&
    record.data['madeHere'] !== true &&
    roleName !== null &&
    decl.status === 'ready' &&
    [...decl.value.cards, ...decl.value.personCards].some((one) => one.name === roleName && one.howItWorks !== undefined)
  // A COPY OF A CARD THE DECLARATION NO LONGER HOLDS. The mirror copies what is declared and leaves a
  // copy of a card that has gone exactly as it was, so the record keeps its id, history and links. The
  // mailer card is the first to have gone, by a decision of 1 October 2026. Without
  // this mark its page drew the card as though it were still one an agent could be given. Only asked once
  // the declaration has arrived, and never of a card written here, which no declaration ever held.
  const goneFromTheDeclaration =
    record.data['madeHere'] !== true &&
    roleName !== null &&
    decl.status === 'ready' &&
    ![...decl.value.cards, ...decl.value.personCards].some((one) => one.name === roleName)

  // THE POWERS THE COPY NAMES, and the acts under each once the declaration has arrived. Null while
  // the read is on its way, which is a third state and not an empty list: a card with no power and a
  // card nobody has asked about yet are different things, and the screen says which.
  const names: string[] = Array.isArray(card['powers'])
    ? (card['powers'] as unknown[]).filter((one): one is string => typeof one === 'string')
    : []
  const held: NamedPower[] | null =
    decl.status !== 'ready'
      ? null
      : names.map(
          (name) =>
            decl.value.powers.find((one) => one.name === name) ?? {
              name,
              // A NAME THE DECLARATION NO LONGER HOLDS. The copy says the card had it; the
              // declaration says what it covers, and it says nothing about this one. Both are shown.
              whatItIs: '',
              acts: [],
            },
        )

  return (
    <div className="rc">
      <style href="mole-office-role-card" precedence="default">
        {ROLE_CARD_CSS}
      </style>

      <div className="rc-top">
        <div className="rc-face">
          {portrait === null ? (
            <p className="rc-absent rc-no-portrait">{ROLE_CARD_WORDS.noPortrait}</p>
          ) : (
            // THE WORDS UNDER IT ARE THE RECORD'S OWN TITLE. A picture of a role needs no caption of
            // its own invention, and a made-up one would be a second name for the card.
            // WHERE THE REQUEST GOES, worked out by the same function every picture in this app
            // uses: the page's own origin in a build, the API's door under `npm run dev`, and the
            // visited world's address while the page is visiting one. A SMALL COPY IS DRAWN, AND A PRESS OPENS
            // THE WHOLE PICTURE: the portrait is about 1 MB and is drawn 128 pixels wide.
            <OpensLarge src={whereRequestsGo(portrait)} crossOrigin={theCrossOriginOfALoad()} alt={record.title}>
              <img className="rc-portrait" src={whereRequestsGo(smallPortrait(portrait))} crossOrigin={theCrossOriginOfALoad()} alt={record.title} />
            </OpensLarge>
          )}
        </div>
        <div className="rc-lead">
          <Part label={ROLE_CARD_WORDS.duties}>
            {words(card['duties']) === null ? <Missing /> : <p className="rc-line">{words(card['duties'])}</p>}
          </Part>
          <p className="rc-rung">
            <span className="rc-key">{ROLE_CARD_WORDS.rung}</span>
            <span className="rc-value">{rung === null ? ROLE_CARD_WORDS.noRung : String(rung)}</span>
          </p>
          {goneFromTheDeclaration ? (
            <p className="rc-gone">
              <Absence tier="told-apart" looked word={t('g6b.profile.cardNotDeclared')} title={t('roleCard.goneTitle')} />
            </p>
          ) : null}
        </div>
      </div>

      {/* HOW IT WORKS, UNDER ITS OWN HEADING: the copy's handbook text in the page's language,
          read by the one function every card page asks. Like every other word
          on this page it is the COPY'S, and a copy older than the text says so on the list at #/roles.
          Here it says so too: where the copy holds none and the declaration's card of the same name
          holds one, the part is drawn with the line saying this copy does not hold it. A card with
          none at all draws nothing, and its older flow notes are never drawn instead. It is folded to
          its first points on every load, and the text's own How it works line is left out because the
          part's label says it, as items 4 and 6 of a decision say. */}
      {howItWorks !== null ? (
        <Part label={ROLE_CARD_WORDS.flow}>
          <HowItWorksText text={howItWorks} underAHeading />
        </Part>
      ) : theDeclarationHasOne ? (
        <Part label={ROLE_CARD_WORDS.flow}>
          <Missing />
        </Part>
      ) : null}

      <Part label={ROLE_CARD_WORDS.powers}>
        {held === null ? <p className="rc-absent">{ROLE_CARD_WORDS.powersOnTheirWay}</p> : <Powers held={held} />}
      </Part>

      {/* ACTING FOR THE PERSON, on the one card the declaration lets hold one. Criterion P61 asks
          the card to carry the elevation STATE; the press is on the agent's own profile, reached
          from the Embassy — criterion P64: appointing a role, and for how long, belongs on
          that profile — so this page says the state and offers no button. A card
          that can never hold one draws nothing at all. */}
      {decl.status !== 'ready' || words(card['name']) !== decl.value.elevation.rule.onlyThisCardCanHoldIt ? null : (
        <Part label={ROLE_CARD_WORDS.elevation}>
          {/* EVERY AGENT ACTING FOR THE PERSON, and not the first of them. Criterion P67: there is
              more than one secretary — several may hold this card, and each may be acting
              for the person under its own grant with its own end. One line each. */}
          {decl.value.elevation.holding.length === 0 ? (
            <Absence
              tier="told-apart"
              looked
              word={ROLE_CARD_WORDS.notActingWord}
              /* THE SENTENCE IS WRITTEN HERE rather than pulled out into the words above, which is
                 what tests/absence-weight.test.ts asks for: a sentence that states an absence has to
                 be inside the element that chooses how much weight it gets, so nobody can move one
                 out and quietly draw it as a paragraph. Since wave 13k's round 22 its words are read
                 from the word lists by their key, here inside the element, so a Chinese page says it
                 in Chinese; the key is named here and nowhere in the words above. */
              title={t('roleCard.notActingTitle')}
            />
          ) : (
            decl.value.elevation.holding.map((one) => (
              <p className="rc-line" key={one.agent}>
                {`${one.agent}: ${ACTING_FOR} ${one.actingFor} ${UNTIL} ${one.untilInWords}`}
              </p>
            ))
          )}
        </Part>
      )}

      <Part label={ROLE_CARD_WORDS.mustRead}>
        {chapters === null ? (
          <Missing />
        ) : (
          <>
            <ul className="rc-chapters">
              {chapters.map((one, index) => {
                if (!isObject(one) || typeof one['chapter'] !== 'number') return null
                const number = one['chapter']
                const held2 = chapterRecord(records, number)
                const level = levelOf(one['level'])
                return (
                  <li className="rc-chapter" key={`${String(number)}-${String(index)}`}>
                    {held2 === null ? (
                      <>
                        <span className="rc-chapter-name">{t('roleCard.chapter', { n: number })}</span>
                        <span className="rc-absent">{ROLE_CARD_WORDS.noChapterRecord}</span>
                      </>
                    ) : (
                      <ChapterLink
                        record={held2}
                        number={number}
                        named={decl.status === 'ready' ? (decl.value.chapters.find((named) => named.number === number) ?? null) : null}
                      />
                    )}
                    <span className="rc-how-much">{level === null ? String(one['level']) : t(HOW_MUCH[level])}</span>
                  </li>
                )
              })}
            </ul>
            {alsoNamed === null ? null : (
              <p className="rc-line">
                <span className="rc-key">{ROLE_CARD_WORDS.andItsStarter}</span> {alsoNamed}
              </p>
            )}
          </>
        )}
      </Part>

      <Part label={ROLE_CARD_WORDS.reportsTo}>
        {words(card['reportsTo']) === null ? <Missing /> : <p className="rc-line">{words(card['reportsTo'])}</p>}
      </Part>

      <Part label={ROLE_CARD_WORDS.whatEndsIt}>
        {words(card['whatEndsIt']) === null ? <Missing /> : <p className="rc-line">{words(card['whatEndsIt'])}</p>}
      </Part>

      {/* WHO APPOINTS IT AND WHOM IT APPOINTS. Criterion P58: both are the card's own stored words,
          and both are what the registration route reads, so a reader sees the rule it will meet. */}
      <Part label={ROLE_CARD_WORDS.appointedBy}>
        {words(card['appointedBy']) === null ? <Missing /> : <p className="rc-line">{words(card['appointedBy'])}</p>}
      </Part>

      <Part label={ROLE_CARD_WORDS.appoints}>
        {words(card['appoints']) === null ? <Missing /> : <p className="rc-line">{words(card['appoints'])}</p>}
      </Part>
    </div>
  )
}

/**
 * The card's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, including in a comment: this is a template literal inside a .tsx
 * file, and one backtick closes the string and turns the rest of the file into nonsense.
 */
const ROLE_CARD_CSS = `
.rc { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

/* THE PORTRAIT AND THE OPENING LINE, SIDE BY SIDE WHERE THERE IS ROOM AND STACKED WHERE THERE IS
   NOT. At 390 a picture beside a paragraph leaves neither of them a readable width. */
.rc-top { display: flex; flex-wrap: wrap; gap: var(--gut); align-items: flex-start; min-width: 0; }
.rc-face {
  flex: 0 0 auto;
  width: 128px; height: 128px;
  display: flex; align-items: center; justify-content: center;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
  padding: var(--pad);
  text-align: center;
}
.rc-face .sb-image-opens { width: 100%; height: 100%; }
.rc-face .sb-image-hint { right: 2px; bottom: 2px; padding: 0 3px; }
.rc-portrait { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm); }
.rc-no-portrait { margin: 0; }
.rc-lead { flex: 1 1 16rem; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

.rc-part { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rc-part-name {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.rc-line {
  margin: 0; max-width: var(--measure-in-box);
  font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text);
  overflow-wrap: anywhere;
  /* A card's own words may hold line breaks, typed in a box of several lines, so they are shown as written. */
  white-space: pre-wrap;
}
.rc-rung { margin: 0; display: flex; gap: 6px; align-items: baseline; }
.rc-gone { margin: 0; }
.rc-key {
  font-size: var(--fs-1); font-weight: 600; color: var(--text-3);
  letter-spacing: .06em; text-transform: uppercase;
}
.rc-value { font-size: var(--fs-2); color: var(--text); }

/* ONE POWER, ITS NAME AND THE ACTS UNDER IT. The name carries the weight, because the name is what
   a card says and what a person quotes; the acts are the detail under it. */
.rc-powers, .rc-acts, .rc-chapters { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rc-power { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rc-power-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.rc-acts { padding-inline-start: var(--pad); gap: 3px; }
.rc-act, .rc-chapter { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; min-width: 0; }
.rc-act-words { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.rc-act-key { font-size: var(--fs-1); color: var(--text-3); font-family: var(--font-mono); overflow-wrap: anywhere; }
.rc-chapter-name { font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.rc-how-much { font-size: var(--fs-1); color: var(--text-3); }

/* AN ABSENCE, DRAWN QUIETER THAN A FACT, because it is the absence of one. */
.rc-absent { margin: 0; font-size: var(--fs-1); font-style: italic; color: var(--text-3); }

`
