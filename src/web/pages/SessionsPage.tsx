// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Agent runs: every run Mole Office knows about, under the work it belongs to.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS CALLED "AGENT RUNS" AND THE RAIL ROW THAT OPENS IT SAYS THE SAME THREE WORDS
 * ---------------------------------------------------------------------------------------
 * It was "Sessions" at both ends until this pass. "Session" is the word Mole Office stores in the
 * record; what is on this page is the runs, and the count line below already said "91 agent runs"
 * under a heading saying "Sessions". The row in src/web/components/Sidebar.tsx and the heading here
 * moved together.
 *
 * DO NOT WRITE A LEVEL-ONE HEADING TAG IN THIS COMMENT. A test that read this file as text took
 * the page's name from the first one it found; a tag typed in prose here made it
 * report a paragraph of this docstring as the page's name. Say "the heading" in words.
 *
 * THE STORED WORD IS UNTOUCHED. A record's kind is still `session`, and `kindWord` below still
 * prints "session" for it — in Developer mode as well as Normal, because "session" is already the
 * reader's word for one record. This page's NAME is what changed, not the vocabulary for a row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE PAGE THIS REPLACES, MEASURED
 * ---------------------------------------------------------------------------------------
 * 9,504px tall at 1440 and 17,676px at 390, for 101 runs. An earlier pass had already stopped the
 * MACHINE from setting the length — every unclaimed process used to be a row of its own, and the
 * number of processes an operating system is running has nothing to do with the research. What was
 * still setting it was the research itself, drawn flat:
 *
 *   1. ONE LEVEL OF GROUPING, AND IT WAS THE WRONG ONE FIRST. Six state groups, seventy-three open
 *      runs, and a heading that says what happened without ever saying what it happened TO. The
 *      primary grouping is now the PIPELINE OR MODULE a run belongs to, and the state word is the
 *      question asked inside it. The server decides which one a run belongs to and says why on
 *      every row — see `placementOf` in src/server/lib/sessions.ts, and `placementRule` on the
 *      reply, for what counts as evidence: typed links and the change log, never a title.
 *
 *   2. EVERY ROW RENDERED ITS EXPLANATION. A row was its state reason, its `doing` line, its
 *      written-state mark and then a fold: four lines at rest, ninety-one times. A row is now one
 *      line — `ScanRow`, the shared primitive — carrying what it is, what is wrong, how loud and
 *      how old, with everything else one press away and counted on the fold.
 *
 *   3. AND THE EXPLANATIONS WOULD HAVE MULTIPLIED. Each state group printed its own meaning and
 *      the sentences its rows share. With a second level of grouping that is the same paragraph
 *      once per state group per project. They are said once now, at the head, measured over every
 *      run rather than over the two in one group — which is also the only scale at which
 *      "thirty-seven rows say this" means anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS FOLDED, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 * Three levels of prominence, in this order, inside every project group:
 *
 *   what died or left something running — open, and first;
 *   what is running or waiting — open, and compact;
 *   what ended or never said — folded, with its count and every state group inside it named.
 *
 * A whole project group folds when nothing in it is alive and nothing in it needs a person.
 *
 * FOLDING `unknown` AND `no state` IS NOT CALLING THEM FINISHED. They are in the same fold as the
 * runs somebody wrote down as finished and they are drawn as their own groups inside it, with their
 * own counts, because they are different things: a run recorded as `unknown` is a judgement, a run
 * with no state word is a gap somebody can close, and only `finished` on a record is a person
 * saying the work is done. The fold's own summary names all three before it is opened, and the
 * arithmetic above the list says so in words.
 *
 * Every fold on this page carries its exact count and names what is inside it. Nothing is behind
 * the word "more".
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE PIECES LIVE
 * ---------------------------------------------------------------------------------------
 * All of them are in components/SessionPanel.tsx. The home page drew a compact panel from the same
 * components until Home stopped drawing sessions, and wave 13y round 32 removed that panel. This
 * page is the one surface built from them.
 *
 * ---------------------------------------------------------------------------------------
 * NORMAL AND DEVELOPER ON THIS PAGE: WHAT IT OWNS AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 * This file draws headings, panels and one sentence of arithmetic. The rows, the state chips, the
 * placement sentences and the machine surface are all components/SessionPanel.tsx.
 *
 * The one stored word this file names is the record kind `session`, and it goes through `kindWord`
 * in src/web/lib/words.ts rather than being typed out — not because "session" reads badly, it is
 * already the reader's word, but because a page naming a kind in its own spelling is how the
 * catalogue came to say `wanna_try` where its own menu one line away said "worth a try". One
 * reader, so this page cannot be the one that disagrees.
 *
 * MEASURED, rather than assumed: the normal-mode test, deleted on 12 November 2026, rendered this whole page from fixtures
 * in Normal mode — two runs, one placed under a module by a stored link and one placed nowhere,
 * plus the machine panel with an orphaned process and a lock file — and found no record id, no
 * request line, no header name and no stored kind or link word in anything either file draws. The
 * link reading that reaches the screen is "part of", which is the reader's word for it.
 */

import { t } from '@shared/i18n.ts'
import type { ReactNode } from 'react'
import { useInspect, useMode } from '../lib/mode.ts'
import { kindWord } from '../lib/words.ts'
import { Absence, ErrorNote, Loading, Panel, Tag, UnmarkedRowsNote, surfaceEmphasis } from '../components/ui.tsx'
import {
  LookForRuns,
  MachineLine,
  MachineSurface,
  NO_PLACEMENT_READ,
  NoSessionsNote,
  OrphanBlock,
  PanelProblems,
  ProjectBlock,
  ReadAt,
  SESSIONS_CSS,
  SearchedNote,
  SessionExplanations,
  SessionTally,
  belongsToSession,
  placementsOf,
  projectSessions,
  releaseOrphan,
  useMachineReading,
  type MachineRead,
  type Orphan,
  type PanelProblem,
  type PlacementReading,
  type ReleaseFn,
  type SessionLine,
  type UnclaimedRead,
} from '../components/SessionPanel.tsx'
import { ConversationSyncPanel } from '../components/ConversationSyncPanel.tsx'

// ---------------------------------------------------------------------------- the page

/**
 * THIS PAGE SAYS WHEN IT WAS READ. IT DOES NOT READ ITSELF AGAIN ON A TIMER, AND THAT IS DELIBERATE.
 *
 * Approved decision 9 resolves three things and only two of them apply here. "Anything that reads
 * as current must say when it was read" applies: this whole page is an observation of a machine and
 * it never carried a stamp, so it does now — see `ReadAt` at the head of the list.
 *
 * "Machine truth may refresh automatically" is not taken up, because the sentence in front of it in
 * the same decision is "the reader's position must never be silently disrupted", and this page is
 * the surface where that would bite. The home block that does refresh is a fixed summary: a tally,
 * four rows, one machine line, nothing that opens. This is a reading surface — the reader scrolls
 * it, opens a project group, opens a run inside it, and reads a release confirmation with a phrase
 * they are about to send back to the server. A timer that reflowed nine thousand pixels underneath
 * that reader, closing folds and moving the confirmation they were reading, is the disruption the
 * decision forbids, and it would do it to the one screen in this product where a misread line kills
 * the wrong process.
 *
 * So the stamp is the answer here, and beside it a control. Reading again is a press, and the press
 * is the reader's. A switch of project is the reader's own act as well, and it reads the new
 * project's runs at once. The comment on `useMachineReading` says what is on screen meanwhile.
 */
export function SessionsPage() {
  // No polling: the page reads when it opens, when a person presses, and when they switch project.
  const machine = useMachineReading()
  const mode = useMode()

  return (
    <>
      <style href="mole-office-sessions" precedence="default">
        {SESSIONS_CSS}
      </style>

      {/* Nobody has looked yet — which is not the same as looked and found nothing. */}
      {/* THE PANEL USES THE PAGE'S OWN WORD, through nav.sessions, WHILE THERE IS NO LIST YET.
          Nothing else in either state names this room, so this is the one heading the reader sees. */}
      {machine.taken === null && machine.failed === null ? (
        <Panel titleIs="label" declares={{ surface: 'sessions.runs' }} title={t('nav.sessions')}>
          <Loading label={t('g6a.sessions.loading')} rows={4} />
        </Panel>
      ) : null}

      {machine.taken === null && machine.failed !== null ? (
        <Panel titleIs="label" declares={{ surface: 'sessions.runs' }} title={t('nav.sessions')}>
          {/* The server's own words, never replaced with a friendlier lie. Any of the three
              requests failing lands here, in the exact terms it failed in, which is what makes it
              reportable rather than mysterious. */}
          <ErrorNote message={machine.failed.message} fault={machine.failed.fault} retry={machine.readAgain} />
        </Panel>
      ) : null}

      {machine.taken === null ? null : (
        <SessionsView
          lines={machine.taken.data.lines}
          orphans={machine.taken.data.orphans}
          // Null means the ledger answered without a sweep, which is not "nothing unclaimed".
          // Passed through rather than defaulted, so the page can never quietly show a clean bill
          // of health for a question nobody answered.
          unclaimed={machine.taken.data.unclaimed}
          problems={machine.taken.data.problems}
          searched={machine.taken.data.searched}
          warnings={machine.taken.data.warnings}
          placementRead={machine.taken.data.placementRead}
          // The clock is the moment of the reading, so every age on the page is measured from when
          // the machine was actually looked at rather than from when this render happened.
          now={machine.taken.at}
          read={{
            at: machine.taken.at,
            inFlight: machine.inFlight,
            inFlightFromAPress: machine.inFlightFromAPress,
            theLastReadWasFromAPress: machine.theLastReadWasFromAPress,
            failed: machine.failed,
            onReadAgain: machine.readAgain,
          }}
          onRelease={releaseOrphan}
          onReread={machine.readAgain}
          conversationSync={<ConversationSyncPanel />}
        />
      )}

      {/* WHAT A ROW WITH NO MARK MEANS — AFTER THE ROWS, WHICH IS WHERE A STATEMENT ABOUT A LIST
          BELONGS. It was drawn first, above the heading, so this page opened with a sentence about
          the rows and named itself underneath: photographed at 1440 on 15 August, "Agent runs" was
          the second thing on the screen and a two-line footnote was the first. Every family page
          already puts this line at the foot, for the reason written on `PageFoot` in
          components/family/parts.tsx.

          IT IS DRAWN ONLY WHEN THERE ARE ROWS. While the reading is in flight, or when it failed,
          there is no list for it to be about. The word for the kind comes from `kindWord` and is
          not typed here; see the head.

          IT IS ABOUT THE FILED ROWS (wave 13y round 142). A run found on disk has no record, so it carries no
          origin mark, only its "not filed" tag, and "every other session carries a mark" was untrue of it. */}
      <div className="sx-origin-note-foot" data-has-note={machine.taken === null || machine.taken.data.lines.length === 0 ? undefined : '1'}>
        {machine.taken === null || machine.taken.data.lines.length === 0 ? null : <UnmarkedRowsNote what={t('g6a.sessions.filedKind', { kind: kindWord('session', mode).text })} />}
      </div>
    </>
  )
}

/**
 * The page once the data is in hand. Split out from the fetching so it can be rendered straight
 * from fixtures in a test and in a screenshot without a server.
 *
 * IT CARRIES ITS OWN STYLESHEET, and so does the panel, even though the page above also emits one.
 * React 19 de-duplicates `<style href>` by href, so the second copy costs nothing — and without it
 * this component is only styled when something ELSE happened to render first. That is not
 * hypothetical: rendering it straight from fixtures, exactly as its own docstring invites, produced
 * an unstyled page whose every flex gap was missing.
 */
export function SessionsView({
  lines,
  orphans,
  // Not fetched and not answered are the same thing to a reader: neither says what is running.
  // Leaving the prop out cannot buy a caller the quiet "no orphans" over a machine full of
  // processes nobody wrote down.
  unclaimed = null,
  problems,
  searched = [],
  warnings = [],
  // The empty reading, so a caller rendering from fixtures says nothing about how much of the
  // change log the placement saw rather than claiming it saw all of it.
  placementRead = NO_PLACEMENT_READ,
  now,
  read,
  onRelease,
  onReread,
  conversationSync = null,
}: {
  /** Every session, joined to its record — see `joinSessionRecords` in SessionPanel.tsx. */
  lines: readonly SessionLine[]
  orphans: readonly Orphan[]
  /** What is running that no session claims. Null when the reply carried no sweep. */
  unclaimed?: UnclaimedRead | null
  problems: readonly PanelProblem[]
  searched?: readonly string[]
  warnings?: readonly string[]
  /**
   * The conversation sync's own panel, drawn above the runs. The page passes it; a caller rendering this view from
   * fixtures leaves it out, because there is no server to read and no reading to draw.
   */
  conversationSync?: ReactNode
  /** What the server's placement rule read to answer. Drawn only when it read a partial log. */
  placementRead?: PlacementReading
  now: number
  /**
   * When this reading was taken, and how it is kept. REQUIRED.
   *
   * Every fact on this page is an observation of a machine at a moment. Letting a caller leave the
   * moment out is letting them draw the observation as a standing fact, which is the one
   * arrangement decision 9 rules out.
   */
  read: MachineRead
  onRelease: ReleaseFn
  onReread: () => void
}) {
  const inspect = useInspect()
  // The placement is the server's answer, carried on each row. This page only groups by it.
  const placements = placementsOf(lines)
  const projects = projectSessions(lines, placements, now)
  // The arithmetic the reader is owed for every fold on this page, computed from the same groups
  // that are drawn rather than counted a second way.
  const needAction = projects.reduce((sum, entry) => sum + entry.counts.action, 0)
  const alive = projects.reduce((sum, entry) => sum + entry.counts.alive, 0)
  const ended = projects.reduce((sum, entry) => sum + entry.counts.ended, 0)
  const quiet = projects.filter((entry) => entry.counts.action + entry.counts.alive === 0)
  const quietRows = quiet.reduce((sum, entry) => sum + entry.lines.length, 0)

  // An orphan whose session is not in the list would otherwise be shown only inside a session that
  // is not there. The machine surface is always the complete set; the per-session lists are the
  // subsets, which is what makes an orphan findable without already suspecting it is one.
  const homeless = orphans.filter((o) => !lines.some((line) => belongsToSession(o, line)))
  const mute = orphans.filter((o) => o.releaseAction === null)
  /**
   * How loud the machine surface is.
   *
   * The sweep decides it, not the orphan count. Something running that nothing wrote down cannot be
   * attributed to a session or released from this page — and a MISSING sweep counts as trouble too,
   * because "the ledger did not answer that question" must never be drawn as "nothing to see".
   */
  const unswept = unclaimed === null || unclaimed.resources.length > 0

  return (
    /*
     * THIS SURFACE IS ANALYTICAL, AND IT IS DECLARED HERE ONCE.
     *
     * The two emphases and what each does to a chip are documented in components/ui.tsx beside the
     * alarm scale — search THE SAME SEMANTIC FACT. Nothing about what a state MEANS changes here;
     * what changes is which of two things already on the chip owns its colour.
     *
     * WHY THIS PAGE AND NOT HOME. Home asks "what needs me?" and is scanned, so colour is spent on
     * the alarm scale and every chip gives up its hue to it. This page asks "which state is this?"
     * — six states arrive at once, four of them carrying an age-derived level, and at the
     * perceptual emphasis those four came out as the same grey. A list whose whole job is telling
     * six session states apart had four of them drawn identically, and the words were the only
     * thing left doing the telling. So the state gets its hue back and the level keeps the weight.
     *
     * ONE DECLARATION, ON THE ELEMENT THE WHOLE PAGE HANGS OFF. The stylesheet reads it with
     * descendant selectors, so the machine panel and the not-readable panel below are drawn
     * analytically too — which is right, they are read the same way — and a second declaration
     * anywhere inside this tree would say nothing and drift on the day the two disagree.
     */
    <div className="stack" {...surfaceEmphasis('analytical')}>
      <style href="mole-office-sessions" precedence="default">
        {SESSIONS_CSS}
      </style>
      <header className="sx-page-head">
        {/* THE NAME OF THE PAGE, AND THAT IS THE WHOLE HEAD.
            Every other page in this app opens with its name in an h1 and this one opened with a
            paragraph, so it read as a page whose heading had failed to render — and a screen reader
            had no landmark to jump to. Same element and same size as Records, Pipelines and
            Queries, because four pages of one product may not disagree about where their name is.

            THE LEDE UNDER IT IS GONE. It was six sentences, then two, then one, and now none:
            everything the last one said is drawn as structure a few hundred pixels below it.
            "Every agent run on file" is the count on the panel and the arithmetic line under it;
            "under the pipeline or module it belongs to" is said precisely, with the rule it uses,
            by `SessionExplanations`, and drawn by the project heading on every group; "with what
            needs you first inside each one" is the band order, `need you` first, in every group. */}
        <h1 className="sx-page-title" data-title-is="its-label">{t('nav.sessions')}</h1>
      </header>

      {/* WHEN ALL OF THIS WAS READ, once at the head, because every panel below is one reading of
          one machine taken at one moment. The machine panel at the foot says it again — this page
          is nine thousand pixels tall, and a stamp a reader has scrolled past is a stamp that is
          not beside what it is about. */}
      <ReadAt read={read} />

      {/* THE CONVERSATION COPIES, ABOVE THE RUNS THEY CAME FROM. The sync keeps each run's scrubbed conversation on
          that run's record, so this is the page where a reader already looks for the run. It is a panel and not a page
          or a menu row: where a thing goes in the menus is the person's choice. A caller drawing this view from
          fixtures leaves the panel out; the page is the only caller with a server to read. */}
      {conversationSync}

      {/* HOW A RUN GETS ONTO THIS PAGE IN THE FIRST PLACE, offered where the runs are listed.
          A run Mole Office has never found on this computer has no conversation anybody can reopen, so
          it cannot be sent a message however clearly it is named — and nothing else in this product
          runs the sweep that writes that down. It is a press and never a page load: it reads files
          on this machine, and the control says so before it is pressed. */}
      <LookForRuns onFound={onReread} />

      {inspect ? warnings.map((warning, i) => (
        <p className="sx-warning" key={i}>
          {warning}
        </p>
      )) : warnings.length > 0 ? <p className="sx-warning">{t('g6a.sessions.incomplete')}</p> : null}

      {/* NOT "AGENT RUNS" A SECOND TIME, AND NOT THE PLACEMENT RULE EITHER.
          The heading above says what the page is. This panel only has to be told apart from the
          one below it, which is the machine, so it says what it holds: every run, ended ones
          included.

          IT SAID "Every run, under the work it belongs to" FOR ONE DRAFT. Two things were wrong
          with that, and both were seen in the photographs rather than reasoned out. `SessionExplan-
          ations`, 40px below, already says "A run is filed under the pipeline or module it is
          linked to, or wrote to" — the same fact, said better, in the place that owns it. And at
          390 the longer title wrapped to two lines and pushed the count onto a third. */}
      <Panel titleIs="label" declares={{ surface: 'sessions.runs' }} title={t('g6a.sessions.every')} actions={<Tag tone="quiet">{lines.length}</Tag>}>
        <SessionTally sessions={lines} />

        {/* THE ARITHMETIC, AND IT IS COUNTED FROM THE GROUPS THAT ARE DRAWN RATHER THAN A SECOND
            WAY. Nine wrapped lines at 1440, seven now: the counts are what a reader comes back
            for, and every rule about folding is demonstrated by the fold that follows it rather
            than described here first. The three totals are a list rather than a sentence with
            three verbs in it — they are compared with each other, not read aloud. */}
        {/* ONE WORD FOR THE THING BEING COUNTED. This sentence said "91 sessions on file … and 4
            runs that no recorded link places anywhere" — two words for one thing inside one
            sentence, under a heading that now says a third. It is "run" throughout, which is the
            word the heading, the fold below and the second clause here already use. */}
        <p className="sx-arithmetic">
          {t('g6a.sessions.summary', {n: projects.length, total: lines.length, groups: projects.length, action: needAction, alive, ended})}
        </p>
        {inspect && ended > 0 ? <p className="sx-arithmetic">
          {/* ZERO GROUPS IS AN ABSENCE, NOT A SECOND COUNT. "including 0 in 0 whole folded groups" makes
              a reader check whether the zero is a fault; when no whole group is folded there is nothing
              for the clause to include, so the line says only what the reader came for. */}
          {t(quietRows === 0 || quiet.length === 0 ? 'g6a.sessions.foldedEndedNoGroups' : 'g6a.sessions.foldedEnded', {n: ended, rows: quietRows, groups: quiet.length})}{' '}
          {t('g6a.sessions.aRunThatHasMerelyGoneQuietIs')}
        </p> : null}

        {inspect ? <SessionExplanations lines={lines} /> : null}

        {/* The unassigned group is only trustworthy if the reading behind it was complete. There
            is no per-module fetch to fail any more — the server reads the links table itself — so
            the one thing that can still be partial is the change log, and it says so here. */}
        {!inspect || !placementRead.changesCapped ? null : (
          <p className="sx-warning">{t('g6a.sessions.thePlacementReadChangeRowsAndTheLog', { value1: (placementRead.changes) })}</p>
        )}

        {/* The machine in one line, here, and in full at the foot. There is no link: this app reads
            the address bar to decide which page to draw, so an in-page anchor would be read as a
            page that does not exist. */}
        <MachineLine unclaimed={unclaimed} orphans={orphans} />

        {projects.length === 0 ? (
          // ONE MARK, WRITTEN IN ONE PLACE. This page and the home preview each used to carry their
          // own account of what Mole Office reads before it can show a run, and they had already
          // drifted apart. The preview is gone; the mark is NoSessionsNote.
          <NoSessionsNote searched={searched} />
        ) : (
          <div className="sx-projects">
            {projects.map((entry) => (
              <ProjectBlock
                key={entry.project?.id ?? 'unassigned'}
                entry={entry}
                now={now}
                placements={placements}
                orphans={orphans}
                onRelease={onRelease}
                onReread={onReread}
              />
            ))}
          </div>
        )}

        <SearchedNote searched={searched} />
      </Panel>

      {/* ---------------------------------------------------------------------------------
          THE MACHINE, ON ITS OWN SURFACE.

          It is a separate panel and not a block inside the sessions list, because it answers a
          different question about a different thing: the sessions above are claims somebody made
          about research, and this is an observation of a computer. Its length is set by the
          operating system, so it is at the foot, grouped by holder, capped with the count of what
          is folded — and it is drawn quietly when the sweep found nothing, because a block that
          shouts when there is nothing to shout about teaches a reader to stop looking at it.
      --------------------------------------------------------------------------------- */}
      {inspect ? <Panel titleIs="label" declares={{ surface: 'sessions.machine' }}
        title={t('g6a.sessions.thisMachine')}
        kind={t('g6a.sessions.runningAndNobodyClaimsIt')}
        id="machine"
        // THREE STEPS, NOT TWO, and the middle one is approved decision 2.
        //
        //   rank 0, the alarm panel — either something a session REGISTERED has outlived it, which
        //     is a concrete failure with an owner, or the sweep did not answer at all, which is the
        //     silence this whole feature exists to break.
        //   rank 1, an ordinary panel — the sweep answered and found processes nobody wrote down.
        //     Worth reading and neither urgent nor overdue: five of them on a developer's machine
        //     is the normal Tuesday. This used to be rank 0 too, so the panel was the alarm colour
        //     on every load and there was nothing louder left for the case above.
        //   rank 2, quiet — swept, and clear.
        rank={orphans.length > 0 || unclaimed === null ? 0 : unswept ? 1 : 2}
        tone={unswept ? 'broken' : 'overdue'}
        actions={<Tag tone={orphans.length === 0 ? 'quiet' : 'warn'}>{orphans.length} {' '}{t('g6a.sessions.orphaned')}</Tag>}
      >
        {/* THE STAMP THE DECISION NAMES, on the panel it names. This one is the reading of a live
            machine drawn at full length, and it is at the foot of a very long page: the same
            sentence is at the head, and a reader who arrived here by scrolling has not seen it. */}
        <ReadAt read={read} />

        {/* Above the orphans, and summarised by the machine line at the head of the page: an
            orphan has a session to blame and a button that says what killing it would end, and an
            unclaimed process has neither. */}
        <MachineSurface unclaimed={unclaimed} />

        {orphans.length === 0 ? (
          // SOMEBODY LOOKED AND THERE ARE NONE, and the panel's corner already says "0 orphaned", so
          // the foot draws nothing (wave 13y round 146; it drew a lone "none" under that corner).
          //
          // WHY THIS ONE MAY GO QUIET WHEN THE SWEEP ABOVE MAY NOT. The dangerous case is not this
          // one. A ledger that did not answer at all is drawn by `MachineSurface` at full weight,
          // a reply with no `orphans` key becomes a printed line in the "Not readable" panel
          // below, and both leave this panel at rank 0 in the alarm tone. What is left here is the
          // answer "the ledger was read and nothing registered has outlived its session", which a
          // reader does nothing about. Its sentence is read out by a screen reader.
          <p className="px-sr">{t('g6a.sessions.nothingASessionRegisteredHasOutlivedTheSession')}</p>
        ) : (
          <>
            <OrphanBlock
              orphans={orphans}
              onRelease={onRelease}
              onReread={onReread}
              heading={t('g6a.sessions.orphanCount', {n: orphans.length})}
            />
            {/* MUST ACT ON, AND IT KEEPS EVERY WORD. Something is running, nothing on this page
                claims it, and no session is going to end and clean it up. That is a finding with
                an action behind it, which is the one tier that pays sentence weight. */}
            {homeless.length === 0 ? null : (
              <Absence
                tier="must-act-on"
                sentence={
                  <>
                    {homeless.length === 1 ? t('g6a.sessions.oneOfTheseIs') : t('g6a.sessions.ofTheseAre', { value1: (homeless.length) })} {' '}{t('g6a.sessions.notClaimedByAnySessionOnThisPage')}</>
                }
              />
            )}
            {/* THE COUNT, AND THE ROW KEEPS THE REASON. Two reasons can take a release button away
                — the server could not say what killing it would act on, or it is a lock file,
                which Mole Office never deletes — and this paragraph named both and then said "each row
                says which". Each row does: `whyNotReleasable` prints the whole reason, in full,
                in the place the button would have been, and the safety note about lock files is
                there and is untouched. What a reader cannot get by looking is how many of the
                orphans above are in that position, so that is what is left here. */}
            {mute.length === 0 ? null : (
              <p className="sx-empty">
                {mute.length === 1
                  ? t('g6a.sessions.oneOfTheseHasNoReleaseButtonAnd')
                  : t('g6a.sessions.ofTheseHaveNoReleaseButtonAndEach', { value1: (mute.length) })}
              </p>
            )}
          </>
        )}
      </Panel> : null}

      {/* THE EYEBROW USED TO SAY "from the sessions and resource APIs", which names the mechanism
          that produced the panel rather than what the panel is about. The two readings this page
          takes are the sessions list and the sweep of this machine, and both are already named on
          screen, so the eyebrow can say which of them could not be read. */}
      {problems.length === 0 ? null : (
        <Panel titleIs="label" declares={{ surface: 'sessions.unreadable' }} title={t('g6a.sessions.notReadable')} kind={t('g6a.sessions.fromTheSessionsListAndTheMachineSweep')} rank={0} tone="broken">
          {/* THE COUNT AND THE RULE, and nothing between them. That these are listed rather than
              dropped is what the panel underneath IS — every one of them is on screen, under a
              heading in the alarm tone. The rule stays: it is why a control a reader might look for
              is absent. */}
          <p className="sx-empty">{t('g6a.sessions.theServerSentThisPageCouldNotRead', { value1: t('g6a.sessions.resourceCount', {n: problems.length}) })}</p>
          <PanelProblems problems={problems} />
        </Panel>
      )}
    </div>
  )
}
