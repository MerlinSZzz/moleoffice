// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/roles/who-holds-them` — HOW MANY CITIZENS HOLD EACH CARD, AND WHO THEY ARE. Criterion P72.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The lookup goes both ways: a citizen's page shows that citizen's role, and the role cards lead to
 * the counts. The counts are behind a press rather than open at once, and the press opens a page with
 * a bar chart of the roles and, under it, each role's list of citizens.
 *
 * Two directions on one fact. Criterion P71 is the first: a citizen's page shows the card it holds.
 * This is the second: a card shows its citizens. The way in is folded shut on the Role cards page
 * and pressing it comes here.
 *
 * ---------------------------------------------------------------------------------------
 * THE BAR CHART IS HORIZONTAL, AND THE BARS ARE DRAWN IN TWO PARTS
 * ---------------------------------------------------------------------------------------
 *
 * HORIZONTAL because the labels are card names. A column chart puts them under the columns, where at
 * 390 four names either overlap or turn sideways; a row per card reads at every width, and the
 * number sits at the end of its own bar where a reader looks for it.
 *
 * TWO PARTS because a row with no card written on it is READ AS the worker card by every refusal in
 * this product, and most rows in this installation are like that. One solid bar would say somebody
 * chose the card for all of them. So the bar is the whole count and the part nobody chose is drawn
 * differently, with the legend saying which is which. Chapter 6's fourth rule: say the state, not
 * the mechanism.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS COUNTED IN THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The counts, the order and the sentence saying what was counted are the server's. A page that added
 * up its own rows would be a second answer to the same question, drifting from the first the day
 * somebody changed which rows count.
 */

import { api } from '../api.ts'
import { Avatar } from '../components/Avatar.tsx'
import { whereRequestsGo } from '../lib/visiting.ts'
import { Absence, ErrorNote, Loading, Panel } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, pathFor, whoPath } from '../components/router.tsx'
import type { CardHolders, WhoHoldsTheCards } from '@shared/roles.ts'
import { t } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useLanguage } from '../lib/language.ts'

/** Every word this page draws that is not read off the reply. */
export const CENSUS_WORDS = {
  /** The way back to the cards themselves. */
  get back() { return t('pageWords.RoleCensusPage.003') },
  /** Over the chart. */
  get chart() { return t('pageWords.RoleCensusPage.004') },
  /** Over the lists under it. */
  get lists() { return t('pageWords.RoleCensusPage.005') },
  /** The two parts of a bar, said once under the chart. */
  get legendChose() { return t('pageWords.RoleCensusPage.006') },
  get legendRead() { return t('pageWords.RoleCensusPage.007') },
  /** The unit after a count, so a bare number never stands alone. */
  get citizens() { return t('g4.embassy.worldCitizens') },
  get one() { return t('pageWords.RoleCensusPage.008') },
  /** Said on a card nobody holds. It is a real answer and not a list still arriving. */
  get nobody() { return t('pageWords.RoleCensusPage.009') },
  get nobodySays() { return t('pageWords.RoleCensusPage.010') },
  /** Said beside a citizen whose row names no card. */
  get readAs() { return t('g6b.profile.cardReadAs') },
  /** The heading over cards a row names that no declaration holds. */
  get gone() { return t('pageWords.RoleCensusPage.011') },
  get goneSays() { return t('pageWords.RoleCensusPage.012') },
  /** Which of the two lists a card is on. They never cross: criterion P45. */
  get forAgents() { return t('pageWords.RoleCensusPage.013') },
  get forPeople() { return t('pageWords.RoleCensusPage.014') },
} as const

export function RoleCensusPage() {
  // The card names follow the page language, so a change of language draws them again.
  useLanguage()
  const [state] = useProjectAsync(() => api.whoHoldsTheCards(), [])
  return (
    <div className="page cen">
      <style href="mole-office-role-census" precedence="default">
        {CENSUS_CSS}
      </style>
      <header className="cen-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="cen-title">{t('unlistedWords.page.roleCensus')}</h1>
        <RouteLink to={pathFor('roles')} className="cen-back">
          {CENSUS_WORDS.back}
        </RouteLink>
      </header>
      {state.status === 'loading' ? <Loading what={t('pageWords.RoleCensusPage.002')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheCensus said={state.value} /> : null}
    </div>
  )
}

/**
 * The page, given the one reply.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER, the way `TheEmbassy` and `TheCards` are: this
 * half is a pure function of what was fetched, and that is the half a test can hold still.
 */
export function TheCensus({ said }: { said: WhoHoldsTheCards }) {
  // THE LONGEST BAR IS THE BIGGEST COUNT, and never nought: dividing by nought would draw every bar
  // full on a chart where nobody holds anything.
  const most = Math.max(1, ...said.cards.map((one) => one.holds))
  return (
    <>
      <Panel titleIs="label" declares={{ surface: 'rolecensus.chart' }} title={CENSUS_WORDS.chart}>
        <p className="cen-says">{said.says}</p>
        <ul className="cen-bars">
          {said.cards.map((one) => (
            <Bar key={`${one.forWhom}:${one.card}`} card={one} most={most} />
          ))}
        </ul>
        <p className="cen-legend">
          <span className="cen-swatch cen-swatch-chose" aria-hidden="true" />
          <span className="cen-legend-word">{CENSUS_WORDS.legendChose}</span>
          <span className="cen-swatch cen-swatch-read" aria-hidden="true" />
          <span className="cen-legend-word">{CENSUS_WORDS.legendRead}</span>
        </p>
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'rolecensus.holders' }} title={CENSUS_WORDS.lists}>
        {said.cards.map((one) => (
          <Holders key={`${one.forWhom}:${one.card}`} card={one} />
        ))}
      </Panel>

      {/* A CARD A ROW NAMES THAT NOTHING DECLARES. Empty is the ordinary answer, and an empty
          heading would read as a list still arriving, so the whole panel goes rather than the rows
          inside it. */}
      {said.cardsNoLongerDeclared.length === 0 ? null : (
        <Panel titleIs="label" declares={{ surface: 'rolecensus.gone' }} title={CENSUS_WORDS.gone}>
          <p className="cen-says">{CENSUS_WORDS.goneSays}</p>
          {said.cardsNoLongerDeclared.map((one) => (
            <Holders key={`gone:${one.card}`} card={one} />
          ))}
        </Panel>
      )}
    </>
  )
}

/** How many citizens are read as one card, as a bar with the part nobody chose drawn apart. */
function Bar({ card, most }: { card: CardHolders; most: number }) {
  const wide = (card.holds / most) * 100
  // THE PART OF THE BAR SOMEBODY CHOSE, as a share of this bar rather than of the chart, because
  // that is what the second colour is dividing.
  const chosen = card.holds === 0 ? 0 : (card.chose / card.holds) * 100
  return (
    <li className="cen-bar-row">
      <span className="cen-bar-name">{cardWord(card.card)}</span>
      <span className="cen-bar-track">
        <span className="cen-bar-fill cen-bar-read" style={{ width: `${String(wide)}%` }}>
          <span className="cen-bar-fill cen-bar-chose" style={{ width: `${String(chosen)}%` }} />
        </span>
      </span>
      <span className="cen-bar-count num">{card.holds}</span>
    </li>
  )
}

/** One card and its citizens, each with their picture, their name, and the way to their own page. */
function Holders({ card }: { card: CardHolders }) {
  return (
    <section className="cen-card">
      <h3 className="cen-card-name">
        <img className="cen-card-portrait" src={whereRequestsGo(card.portrait)} alt={t('g6b.cardPicture', { name: cardWord(card.card) })} />
        <span className="cen-card-word">{cardWord(card.card)}</span>
        <span className="cen-card-for">
          {card.forWhom === 'agent' ? CENSUS_WORDS.forAgents : CENSUS_WORDS.forPeople}
        </span>
        <span className="cen-card-count num">
          {card.holds} {card.holds === 1 ? CENSUS_WORDS.one : CENSUS_WORDS.citizens}
        </span>
      </h3>
      {card.holders.length === 0 ? (
        <p className="cen-none">
          <Absence tier="told-apart" looked word={CENSUS_WORDS.nobody} title={CENSUS_WORDS.nobodySays} />
        </p>
      ) : (
        <ul className="cen-holders">
          {card.holders.map((one) => (
            <li key={`${one.kind}:${one.id}`} className="cen-holder">
              {/* THE WAY TO THE CITIZEN'S OWN PAGE, which is the other half of the two-way lookup: from a
                  card to its citizens here, and from a citizen to its card there. */}
              <RouteLink to={whoPath(one.kind, one.id)} className="cen-holder-link">
                <Avatar kind={one.kind} id={one.id} name={one.name} url={one.avatarUrl ?? ''} size={32} />
                <span className="cen-holder-name">{one.name}</span>
              </RouteLink>
              {one.readNotChosen ? <span className="cen-holder-read">{CENSUS_WORDS.readAs}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The page's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const CENSUS_CSS = `
.cen-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); min-width: 0; }
.cen-title { margin: 0; font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); }
.cen-back { font-size: var(--fs-1); }
.cen-says { margin: 0 0 var(--gut); color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }

/* THE CHART. One row per card: the name, the bar, the number. It reads the same at 1440 and at 390
   because nothing about it depends on the row being wide. */
.cen-bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.cen-bar-row { display: grid; grid-template-columns: 8rem 1fr 3rem; align-items: center; gap: var(--pad); min-width: 0; }
.cen-bar-name { color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; }
.cen-bar-track { display: block; height: 18px; background: var(--hover); border-radius: var(--radius-sm); min-width: 0; }
.cen-bar-fill { display: block; height: 100%; border-radius: var(--radius-sm); }
/* THE WHOLE COUNT, and inside it the part somebody actually wrote on a row. Two shades of one
   colour and not two colours: they are parts of one number, not two things being compared. */
.cen-bar-read { background: var(--accent-soft, var(--hover)); border: 1px solid var(--accent); }
.cen-bar-chose { background: var(--accent); border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.cen-bar-count { text-align: right; color: var(--text); font-size: var(--fs-2); font-variant-numeric: tabular-nums; }
.cen-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--pad); margin: var(--gut) 0 0; }
.cen-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; flex: none; }
.cen-swatch-chose { background: var(--accent); }
.cen-swatch-read { background: var(--accent-soft, var(--hover)); border: 1px solid var(--accent); }
.cen-legend-word { color: var(--text-3); font-size: var(--fs-1); }

/* THE LISTS UNDER THE CHART, one section per card. */
.cen-card { margin-bottom: var(--gut); min-width: 0; }
.cen-card-name {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0;
  margin: 0 0 var(--pad); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text);
}
.cen-card-portrait { width: 32px; height: 32px; object-fit: cover; border-radius: var(--radius-sm); flex: none; }
.cen-card-for { color: var(--text-3); font-weight: 400; font-size: var(--fs-1); }
.cen-card-count { color: var(--text-2); font-weight: 400; font-size: var(--fs-1); font-variant-numeric: tabular-nums; }
.cen-holders { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); }
.cen-holder { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cen-holder-link { display: flex; align-items: center; gap: 6px; min-width: 0; text-decoration: none; color: var(--text); }
.cen-holder-link:hover .cen-holder-name { text-decoration: underline; }
.cen-holder-name { font-size: var(--fs-2); overflow-wrap: anywhere; }
.cen-holder-read { color: var(--text-3); font-size: var(--fs-1); }
.cen-none { margin: 0; }

@media (max-width: 40rem) {
  .cen-bar-row { grid-template-columns: 6rem 1fr 2.5rem; gap: 6px; }
  .cen-bar-name { font-size: var(--fs-1); }
}
`
