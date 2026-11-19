// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PROJECT THE BROWSER IS READING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A WORKSPACE IS
 * ---------------------------------------------------------------------------------------
 *
 * One Mole Office installation holds several isolated projects — this product's own development
 * record, the greenhouse work, whatever comes next — and a WORKSPACE is one of them. What that
 * means, and everything it deliberately is not (a user, a role, an access rule, a record kind),
 * is written once in src/shared/workspaces.ts and is not restated here. This file is only the
 * browser's half: which project this window is looking at, and how every request says so.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ---------------------------------------------------------------------------------------
 *
 * NEARLY EVERY NUMBER, ROW, GRAPH AND COUNT ON A SCREEN IS RELATIVE TO ONE WORKSPACE. So the
 * workspace is not a filter the pages apply — it is the IDENTITY OF THE WHOLE SCREEN. When it
 * changes, everything drawn from the old one stops being true, all at once, and the interface has
 * one obligation: never draw the old project's rows under the new project's name without the
 * re-read mark, not even for a frame. An unmarked stale list under a new heading is the silent
 * substitution this product forbids, and it would be the most convincing lie the interface could
 * tell, because every row in it is real.
 *
 * WHERE THAT IS ENFORCED. `useProjectAsync` in src/web/lib/project-async.ts subscribes to this
 * store and reads its reading again when the project changes. Until the new answer comes, what the
 * reading shows carries the re-read mark, which `useAsync` in components/ui.tsx sets in a layout
 * effect, before the browser paints the first frame under the new name. Every
 * project-scoped reading in this app comes through that hook; a reading the server answers the same
 * in every project stays on `useAsync`, and a switch leaves it alone. The mark is not set in a
 * passive effect: that runs after the commit, and one commit of old rows without the mark is the
 * whole defect.
 *
 * IT USED TO BE A REACT `key` ON THE WHOLE SHELL, which met the same rule by throwing the entire
 * interface away — the chat panel and whatever was typed in it included. Criterion M61 records the
 * fault: switching project made the whole of Mole Office flash, and emptied the composer.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CHOICE LIVES
 * ---------------------------------------------------------------------------------------
 *
 * In localStorage, exactly like the actor in src/web/api.ts, and for the same reason: it is a
 * standing choice about how this browser is being used rather than a property of the page you are
 * on. A reload keeps the project you were reading.
 *
 * IT IS DELIBERATELY NOT IN THE ADDRESS. Putting it in the hash would make a project bookmarkable
 * and would let two tabs read two projects, and both are real gains — but every address in this
 * app is `FLAT_ROUTES` in components/router.tsx and every link in the product is built from it, so
 * a workspace segment is a change to what an address MEANS in eleven files. Reported, not
 * smuggled: see the report for this pass. Nothing here blocks it later, because every reader goes
 * through `currentWorkspace()` and would keep working if the store read the address instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ABSENCE MEANS, AND WHAT A BAD VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * Nothing stored -> `DEFAULT_WORKSPACE`, which is the STATED default the server answers a request
 * with no header from. The browser and the server therefore agree without either guessing.
 *
 * THAT ID IS WHICH PROJECT IS BEING ASKED ABOUT. IT IS NOT WHERE A STRANGER SHOULD START READING.
 * On this installation `default` holds one or two stray records, so a browser that had never chosen
 * opened on a page that said nothing needed anybody. Two separate things fix that and they do
 * different jobs:
 * `openingWorkspace` below moves a never-chosen browser to a project with work in it, and Home's
 * top band does not read a project at all. The second is the one that holds when the first cannot —
 * an installation whose every project is empty, or a reader who chose an empty project on purpose.
 *
 * A stored value that is not a workspace id at all — the shape rule is `workspaceIdFault` in
 * shared/workspaces.ts — is dropped and reported. It cannot have come from this app, and sending
 * it would make every request on every screen fail with the same 400. THE RESET IS NOT SILENT:
 * `workspaceBootFault()` carries the sentence and the sidebar prints it, because a browser that
 * quietly moved you to another project is the failure this file is about.
 *
 * A stored value that IS a workspace id but names no workspace HERE is not this file's to judge —
 * only the server holds the registry. It is sent, the server refuses it with 404, and the switcher
 * says so with the list of what does exist. See `WorkspaceSwitcher` in components/Sidebar.tsx.
 */

import { content, readStoredWord, t } from '@shared/i18n.ts'
import { DEFAULT_WORKSPACE, workspaceIdFault } from '@shared/workspaces.ts'
import { clearStored, readStored, writeStored } from './store.ts'
// TYPE ONLY, and erased before this module runs — the same rule api.ts follows for LinksReply.
// It is imported rather than restated so that this file cannot disagree with the route it reads.
import type { WorkspacesReply } from '../../server/api/workspaces.ts'

/**
 * The header that names the project on every request.
 *
 * TWO PLACES MUST AGREE: this, and `WORKSPACE_HEADER` in src/server/lib/http.ts. The browser
 * bundle may not import a value out of src/server — that pulls the database client into the page —
 * and the server's copy is the one the request reader uses, so neither can be derived from the
 * other today.
 *
 * SO A TEST MAKES THEM AGREE instead of a comment asking. tests/workspace-switcher.test.ts calls the
 * browser's own wrappers, whose headers `moleOfficeHeaders` in api.ts sets under this name, and feeds
 * them to the REAL server: if the two strings ever part, the server answers about `default` while
 * the browser believes it asked about something else, and that test goes red naming both. The
 * honest fix is for `WORKSPACE_HEADER` to move into src/shared/workspaces.ts beside
 * `DEFAULT_WORKSPACE`, where both ends could read one declaration; that file is not this pass's to
 * change, so it is reported.
 */
export const WORKSPACE_HEADER = 'x-mole-office-workspace'

/** Where the choice is kept. Namespaced like `mole-office.actor`, which is the neighbouring key. */
const WORKSPACE_KEY = 'mole-office.workspace'

/**
 * What was wrong with the stored workspace when this window started, or null when nothing was.
 *
 * Read ONCE, at module load, because that is when the value is read. Kept as a module constant
 * rather than as store state because it is a fact about boot: nothing that happens later can make
 * it true or untrue, and a fault that could come and go is one a reader learns to ignore.
 *
 * IT HOLDS HOW TO SAY THE FAULT, NOT THE SENTENCE. The fault is found before the page knows the
 * person's language, so the sentence is said each time it is read, in the language of that moment.
 */
let bootFault: (() => string) | null = null

/**
 * Has this browser ever chosen a project? `openingWorkspace` is the only thing that reads it.
 *
 * A MUTABLE FLAG, AND THAT IS THE WHOLE FIX. It used to be `export const projectWasNeverChosen =
 * localStorage.getItem(key) === null`, read once when this module was imported and never again. Its
 * own docstring said the auto-open "fires ONCE ... the moment somebody picks a project the choice is
 * remembered and this is never consulted again", and the code did not do that: the constant stayed
 * `true` for the life of the page, App.tsx is rebuilt from scratch every time the project changes,
 * and the effect that auto-opens therefore ran again on every rebuild.
 *
 * WHAT THAT DID, and it is reproducible in three presses: choose Default in the switcher — a real
 * project on this installation, holding nothing — and the browser bounces you straight back to
 * Greenhouse, because Default has no records and the flag still says nobody has chosen. There is no
 * way out of it without reloading the page. A browser that silently moves you to another project is
 * the exact failure the header of this file is about.
 *
 * A MALFORMED STORED VALUE COUNTS AS A CHOICE, so it stays `true` here. `bootFault` below tells the
 * reader the value was dropped and that they are now reading the stated default, and asks them to
 * choose. Moving them somewhere else in the same breath would make that sentence false.
 */
let everChosen = false

function loadWorkspace(): string {
  // THROUGH `readStored`, WHICH CANNOT THROW. This line read `window.localStorage.getItem` directly
  // and ran while this module was being evaluated, so a browser with site storage blocked stopped
  // the whole app from starting rather than losing one remembered setting. Problem `uihbRUojyr2p`.
  const held = readStored(WORKSPACE_KEY)
  if (!held.ok) {
    // NOBODY COULD LOOK, WHICH IS NOT THE SAME AS NOTHING BEING STORED. `everChosen` therefore stays
    // false: this browser has made no choice this page can see, which is what it means.
    // The reason is the browser's own words, and the project's id is content: neither is translated.
    const because = held.reason
    bootFault = () =>
      readStoredWord('frameWords.workspace.cannotRemember', { because: content(because), project: content(DEFAULT_WORKSPACE) })
    return DEFAULT_WORKSPACE
  }
  const raw = held.value
  if (raw === null) return DEFAULT_WORKSPACE
  everChosen = true
  const fault = workspaceIdFault(raw)
  if (fault === null) return raw
  // The stored value, the reason it is not an id and the project name are content: never translated.
  bootFault = () =>
    readStoredWord('frameWords.workspace.storedNotAnId', {
      raw: content(raw),
      fault: content(fault),
      project: content(DEFAULT_WORKSPACE),
    })
  clearStored(WORKSPACE_KEY)
  return DEFAULT_WORKSPACE
}

/**
 * True when this browser has never chosen a project, so the id above is a stated default rather
 * than somebody's choice. `openingWorkspace` below is what may act on that, and only then.
 *
 * A FUNCTION, NOT A CONSTANT. See `everChosen`: a constant is read once per page load, and this
 * answer changes the moment somebody presses a project in the switcher.
 */
export function projectWasNeverChosen(): boolean {
  return !everChosen
}

/**
 * WHICH PROJECT TO OPEN ON, for a browser that has never chosen one.
 *
 * ------------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, and all three independent reviewers hit it in their first minute
 * ------------------------------------------------------------------------------------------
 *
 * `DEFAULT_WORKSPACE` is the id the SERVER answers a request with no project header. It is a
 * contract about headers, and this browser was treating it as an opinion about where to start
 * reading. On this installation that project holds zero records, so the product's first screen said
 * "This project is empty" and "Nothing is owed" — under a cross-project band showing four urgent
 * questions about the tool's own source code. One reviewer's verdict was that everything they
 * misread in their first two minutes came from this single decision.
 *
 * ------------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS NOT "LEAVE THE DEFAULT ALONE IF IT HOLDS ANYTHING"
 * ------------------------------------------------------------------------------------------
 *
 * A NEVER-CHOSEN BROWSER OPENS ON THE PROJECT HOLDING THE MOST RECORDS. Ties are broken by id, and
 * a browser already sitting on that project is left where it is.
 *
 * That was written the other way first — leave the current project alone whenever it holds anything
 * at all — and the whole fix evaporated the day somebody filed one record into `default`. Measured
 * in a fresh browser on 14 August 2026: `default` held two records, Greenhouse held 198 and PanelX
 * held 237, and this returned null, so a stranger's first screen was two records deep and said
 * "Nothing is owed and nothing has stopped short."
 *
 * ONE RECORD IS NOT A PROJECT. The server's own note on `default` says a record left in it is a
 * record nobody has assigned to a project, so counting it as evidence that a reader belongs there
 * was reading a leftover as a choice. Most records wins outright: there is no threshold, no
 * "enough" and nothing for a reader to work out.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THIS IS NOT A GUESS THE PRODUCT IS FORBIDDEN TO MAKE
 * ------------------------------------------------------------------------------------------
 *
 * The rule is that absence beats a guess — that `unknown` and "nobody has looked" are real answers
 * and must not be filled in with a plausible default. Nothing is being filled in here. Nobody has
 * chosen, the product must draw SOMETHING, and the choice is between projects of known sizes. What
 * the rule does demand is that the choice is not silent, which is why this returns the reason with
 * the id, why the reason carries BOTH counts, and why the frame prints it on arrival. A reader who
 * disagrees can check the arithmetic against the switcher and press another project.
 *
 * It fires ONCE, for a browser with nothing stored. The moment somebody picks a project — or this
 * one does it for them — the choice is remembered and this is never consulted again. That sentence
 * used to be false; `everChosen` above says what was wrong and how it showed on the screen.
 *
 * ------------------------------------------------------------------------------------------
 * IT IS NOT THE ONLY THING STOPPING AN EMPTY FIRST SCREEN, AND IT IS NO LONGER THE MAIN ONE
 * ------------------------------------------------------------------------------------------
 *
 * Home's top band reads GET /api/planning/today and GET /api/work, and neither takes a project. So
 * a reader who lands in an empty project is still shown their own work, in every project, before
 * anything project-scoped. This function chooses where the project-scoped bands start; it is no
 * longer what stands between a stranger and a page that says nothing needs them.
 */
export function openingWorkspace(
  list: readonly { id: string; title: string; records: number }[],
): { id: string; because: string } | null {
  const fullest = theProjectToOpenOn(list)
  if (fullest === null) return null
  const here = list.find((w) => w.id === current) ?? null
  // THE TITLES, NOT THE IDS, AND BOTH COUNTS. This sentence is what the reader is shown the moment
  // the page opens. "Opened greenhouse — default has nothing in it" names two lookup keys where two
  // project names belong, and a version without the counts asked the reader to take the move on
  // trust. `here` is null when the installation does not list the project this browser is sending,
  // and then the id is the only true name there is.
  const because =
    `Opened ${fullest.title}, which holds ${records(fullest.records)}. You have not chosen a project, and ` +
    (here === null
      ? `this installation does not list "${current}".`
      : `${here.title} holds ${records(here.records)}.`)
  // OFFERED, NOT YET TRUE. It becomes the note only if `setWorkspace` is actually called with this
  // id — see `openedNote`. A sentence saying a move happened, written before it happened, is the
  // fake success this product is against.
  proposed = { id: fullest.id, because }
  return { id: fullest.id, because }
}

/**
 * The project a never-chosen browser moves to, or null when it stays where it is. The rule is the
 * one `openingWorkspace` above describes; it is here alone so that `thePageWaitsForItsProject` below
 * asks the same question without offering the move.
 */
function theProjectToOpenOn<T extends { id: string; records: number }>(list: readonly T[]): T | null {
  if (everChosen) return null
  // MOST RECORDS FIRST, THEN BY ID. Without the second key two projects holding the same number
  // are separated by whatever order the server happened to list them in, so two browsers can open
  // on two different projects from one installation and neither can be told why.
  const fullest = [...list].sort((a, b) => b.records - a.records || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
  if (fullest === undefined || fullest.records === 0 || fullest.id === current) return null
  return fullest
}

/**
 * WHETHER THE PAGE WAITS BEFORE IT READS ANYTHING. Problem ipeva-Ir-5by.
 *
 * A browser that has never chosen a project sends the stated default, and `openingWorkspace` may
 * move it once the list of projects has answered. A page that read before that move asked the
 * default project for things that are in another one: a record's address answered 404 three times
 * before the record was drawn. So, for a never-chosen browser, the page waits:
 * - while the list of projects is being read;
 * - once it has answered, until the move `openingWorkspace` offers has been made.
 * It does not wait when the list could not be read, because then nothing will move the browser: the
 * page reads the stated default, and the sidebar says the list failed. `list` is the list's
 * answer, or 'reading', or 'failed'.
 */
export function thePageWaitsForItsProject(
  list: readonly { id: string; records: number }[] | 'reading' | 'failed',
): boolean {
  if (everChosen || list === 'failed') return false
  if (list === 'reading') return true
  return theProjectToOpenOn(list) !== null
}

/** "1 record" / "12 records". The one place this file inflects a count. */
function records(n: number): string {
  return `${String(n)} record${n === 1 ? '' : 's'}`
}

/**
 * The move `openingWorkspace` last offered, or null. Not a claim that anything moved.
 *
 * It is a separate variable from `openedNote` below precisely because offering and doing are two
 * different facts, and only the second one may be printed.
 */
let proposed: { id: string; because: string } | null = null

/**
 * WHY THIS BROWSER IS READING THIS PROJECT WHEN NOBODY CHOSE IT, in words, or null.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, OBSERVED IN A BROWSER ON 14 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The auto-open moved a fresh browser to another project and NOTHING ON THE SCREEN SAID SO. The
 * sentence was built, handed to App.tsx, and destroyed in the same tick: App.tsx held it in
 * `useState` inside `Shell`, and `Shell` is keyed on the workspace, so calling `setWorkspace` threw
 * away the component holding the explanation for the switch it had just made. `.shell-opened` was
 * not in the document at all afterwards. A browser that silently moves you to another project is
 * the exact failure the header of this file is about.
 *
 * ---------------------------------------------------------------------------------------
 * SO IT IS A FACT ABOUT THIS WINDOW, KEPT WHERE A REBUILT INTERFACE CANNOT LOSE IT
 * ---------------------------------------------------------------------------------------
 *
 * Module state, exactly like `bootFault` above and for the same reason: it is a fact about how this
 * window started, nothing that happens later can make it true or untrue, and every component that
 * could hold it is thrown away when the project changes.
 *
 * IT IS ONLY SET WHEN THE MOVE ACTUALLY HAPPENED. `openingWorkspace` proposes; `setWorkspace`
 * promotes the proposal to this note when it is called with that id and no choice had been made.
 * A caller that ignored the proposal leaves this null, so the sentence can never describe a move
 * nobody made.
 *
 * WHO DRAWS IT: `ThisProject` in src/web/pages/HomePage.tsx. App.tsx still has its own `opened`
 * state and passes it to the sidebar; that copy has never reached a screen, and the fix there is to
 * read this function instead of holding a second answer. Reported, not smuggled — App.tsx is not
 * this pass's file.
 */
let openedNote: string | null = null

export function workspaceOpenedNote(): string | null {
  return openedNote
}

let current: string = loadWorkspace()
const listeners = new Set<() => void>()

/** The project every request this window makes is about. */
export function currentWorkspace(): string {
  return current
}

/**
 * The sentence saying the stored project was unreadable, or null. See `bootFault`.
 *
 * A function rather than an exported constant because module constants are read at import time by
 * whoever imports first, and this one is set inside `loadWorkspace()` on the same tick.
 */
export function workspaceBootFault(): string | null {
  return bootFault === null ? null : bootFault()
}

/**
 * Read this project. Everything drawn from the previous one is read again, marked until the new
 * answer comes — see the header.
 *
 * A malformed id THROWS rather than being cleaned up or ignored. The only caller is the switcher,
 * which offers ids the server sent, so this can only fire when something else is calling it, and
 * a workspace chosen by accident is precisely what must not be possible to do quietly.
 */
export function setWorkspace(id: string): void {
  const fault = workspaceIdFault(id)
  if (fault !== null) throw new Error(`Cannot read that project: ${fault}`)
  if (id === current) return
  // THE MOVE THAT NOBODY ASKED FOR, RECORDED AS IT HAPPENS. Only here, and only when this is the
  // move `openingWorkspace` proposed to a browser that had not chosen: a person pressing a project
  // in the switcher needs no explanation of their own press. See `openedNote`.
  if (!everChosen && proposed !== null && proposed.id === id) openedNote = proposed.because
  current = id
  // A BROWSER THAT REFUSES TO REMEMBER IT STILL MOVES. `writeStored` says so in its answer and the
  // switcher has already changed what is on screen; failing the press would be refusing the move
  // over the memory of it.
  writeStored(WORKSPACE_KEY, id)
  // A CHOICE HAS NOW BEEN MADE, so `openingWorkspace` never fires again in this browser. Set here
  // rather than beside the auto-open, because the switcher and the auto-open both come through this
  // one function and a flag set in only one of them would let the other be overruled.
  everChosen = true
  for (const listener of listeners) listener()
}

/** React subscribes here, so choosing a project rebuilds the screen. See `useWorkspace`. */
export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/*
 * `workspaceKey()` WAS HERE AND IS GONE, and what it did is worth recording.
 *
 * It answered "what makes this screen a different screen", and App.tsx hung the whole shell off it
 * as a React `key` so that changing project discarded the interface. Nothing calls it now: a
 * reading about one project asks this store directly, through `useProjectAsync`. A named function
 * with no caller is a second answer to a question something else is already answering, so it is
 * deleted rather than kept for a reader who might want it. Criterion M61.
 */

// ---------------------------------------------------------------------------- what to print

/**
 * WHICH PROJECT THIS SCREEN IS SHOWING, in the words a reader gets — and what is wrong, if
 * anything is.
 *
 * A PURE READING, so it can be tested without a browser and so nothing here can fetch. It takes
 * the project this browser is sending and the installation's answer to `GET /api/workspaces`, or
 * null while that has not arrived.
 *
 * THE ID IS ALWAYS KNOWN AND THE TITLE IS NOT. `greenhouse` is what this browser puts in the header;
 * `Greenhouse` is what the server calls it, and until the list arrives nothing here knows that. So
 * the id stands in for the title, which is honest in both directions: it is the true name of what
 * is being asked for, and it is never a title somebody else's project happens to have.
 */
export interface WorkspaceSight {
  /** The workspace id on every request this window makes. */
  id: string
  /** What to print: the title once the installation names it, the id until then. */
  title: string
  /** True once the list of projects has named this one. */
  named: boolean
  /** One sentence for a title attribute, saying what the reader is looking at. */
  what: string
  /**
   * What is wrong with the project this screen claims to be showing, or null.
   *
   * IT IS NEVER A GUESS AND IT IS NEVER SWALLOWED. Each case below is a state in which the number
   * at the top of the page and the rows underneath it may be about two different projects, which
   * is the one thing this whole boundary exists to prevent.
   *
   * A FEW WORDS, AND THE SENTENCE BEHIND THEM. A warning to a person needs only a few words, such as
   * "No such workspace". The old warning was a five-sentence paragraph in the sidebar of a world the
   * reader had just walked into. Problem `DDOmWnhiVa00`.
   */
  fault: WorkspaceWarning | null
}

/**
 * A WARNING A PERSON READS: a few words, and the whole of it behind them.
 *
 * `short` is what is on screen — three or four words, no id, no route, no instruction. `said` is
 * the sentence, which the reader opens when they want it. Both are always there: shortening a
 * warning must not throw the sentence away, which is the other half of what was asked for.
 */
export interface WorkspaceWarning {
  short: string
  said: string
}

/**
 * THE FEW WORDS FOR A LIST OF PROJECTS THAT COULD NOT BE READ.
 *
 * The commonest case by far, and the one the owner met: the page carries a project into a world that has
 * never heard of it, and every request refuses. It is told from any other failure by the status the
 * server gave, not by reading its sentence: a warning that guessed its own words from somebody
 * else's prose would say the wrong thing the first time that prose changed.
 */
export function theWarningForAProjectListThatFailed(message: string, status: number | undefined): WorkspaceWarning {
  return { short: t(status === 404 ? 'nav.fault.noSuchProject' : 'nav.projectsFailed'), said: message }
}

/** The few words for a stored project this browser could not read at all. */
export function theWarningForAnUnreadableStoredProject(said: string): WorkspaceWarning {
  return { short: t('nav.fault.storedUnreadable'), said }
}

/**
 * WHICH PROJECT THIS SCREEN IS SHOWING, in the words a reader gets — and what is wrong, if
 * anything is.
 *
 * `readFor` IS THE PROJECT THE REPLY'S REQUEST WAS SENT UNDER, and it is not always the project on
 * screen. `readWorkspacesOnce` reads the list of projects ONCE and does not read it again when the
 * reader switches (src/web/lib/oneread.ts says why), so after a move the reply in hand was sent
 * under the project the reader LEFT. A browser can also move while the read is out. Either way the
 * reply's `current` field names the project it was sent under. Comparing that against the project
 * on screen would draw "Wrong project answered" when nothing is wrong — the false warning this
 * parameter exists to stop. The `current` checks therefore run only when `readFor` is the project
 * being drawn. The frame passes the project `readWorkspacesOnce` recorded for the reply. A caller
 * that leaves it out gets the project on screen, which is only right for a reply it has just asked
 * for under that project.
 */
export function workspaceSight(
  workspace: string,
  reply: WorkspacesReply | null,
  readFor: string = workspace,
): WorkspaceSight {
  const listed = reply?.workspaces.find((w) => w.id === workspace) ?? null
  const title = listed?.title ?? workspace
  const base: Omit<WorkspaceSight, 'fault'> = {
    id: workspace,
    title,
    named: listed !== null,
    // The project's id, title and note are content: they are never translated.
    what:
      listed === null
        ? readStoredWord('frameWords.workspace.aboutUnlisted', { project: content(workspace) })
        : readStoredWord('frameWords.workspace.aboutListed', { title: content(listed.title), n: listed.records }) +
          (listed.note === null ? '' : ` ${content(listed.note)}`),
  }

  if (reply === null) return { ...base, fault: null }

  // THE REPLY IS EVIDENCE ONLY ABOUT THE PROJECT IT WAS READ FOR. When the project on screen has
  // moved on, `reply.current` describes the project the reader left and nothing here may be read
  // as a fault. The list of projects is still used above for the name, because that half does not
  // change with the project.
  if (readFor !== workspace) return { ...base, fault: null }

  // THE HEADER DID NOT ARRIVE. The server answers a request that names no project from the stated
  // default, so this is what a misspelt header name, a proxy that strips it, or a transport that
  // forgot it all look like — and all three would draw the default project's records under this
  // project's name with nothing else failing. It is checked on the one reply that reports what the
  // server heard, because there is no other way for a browser to find out.
  if (!reply.current.stated) {
    return {
      ...base,
      fault: {
        short: t('nav.fault.headerLost'),
        said: readStoredWord('frameWords.workspace.headerLost', {
          asked: content(workspace),
          answered: content(reply.current.id),
          title: content(title),
          header: content(WORKSPACE_HEADER),
        }),
      },
    }
  }
  if (reply.current.id !== workspace) {
    return {
      ...base,
      fault: {
        short: t('nav.fault.wrongProject'),
        said: readStoredWord('frameWords.workspace.wrongProject', {
          asked: content(workspace),
          answered: content(reply.current.id),
        }),
      },
    }
  }
  if (listed === null) {
    // The registry accepted the id and the list does not contain it: two answers from one server
    // about what a workspace is. Reported rather than hidden by printing the id and moving on.
    return {
      ...base,
      fault: {
        short: t('nav.fault.noSuchProject'),
        said: readStoredWord('frameWords.workspace.notListed', { asked: content(workspace) }),
      },
    }
  }
  return { ...base, fault: null }
}
