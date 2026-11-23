// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { WordKey } from './i18n.ts'
import { storedWordIfDeclared } from './stored-word-reader.ts'
/**
 * THE PARTS OF MOLE OFFICE'S OWN SCREEN, EACH WITH A NAME AND A LABEL, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A person can point at a record, a block, a line of a plan. They could not point at the rail, the
 * composer, the theme control or the note above a report — the parts of Mole Office itself. Those parts
 * hold no stored text: their words live in a .tsx file and in no record, so there is nothing to look
 * up and nothing to quote back.
 *
 * The answer is to give each part a NAME, and to keep the names in one list. The name is the whole
 * identity of the part. Where somebody was standing when they pointed at it, and what it drew on
 * their screen at that moment, are measurements and are kept separately — see `Seen` in
 * ./targets.ts. Putting the route in the name would turn one rail into sixteen different things.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ID IS, AND WHAT A LABEL IS
 * ---------------------------------------------------------------------------------------
 *
 * The KEY is the id. It is durable: it is what a comment stores, and it is compared against later.
 * It is written with dots because a path reads well to a person. NOTHING PARSES THE DOTS. There is
 * no tree here and no inheritance; two ids that share a prefix are two ids.
 *
 * The VALUE is the label. It is what a person reads on a chip and on a review row.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO RULES ON A LABEL, AND `mechanismWordIn` BELOW ENFORCES THE SECOND
 * ---------------------------------------------------------------------------------------
 *
 * 1. A LABEL IS A LABEL, NOT A CLAUSE. These are drawn beside record titles. A lower-case clause
 *    among titles reads as a fragment of a sentence somebody forgot to finish.
 *
 * 2. A LABEL IS NAMED FOR WHAT THE THING IS TO A READER, NEVER FOR THE MACHINERY THAT DRAWS IT.
 *    This is docs/UX-CONTRACT.md and chapter 6 rule 4 of the office regulations. Four names in the
 *    design drafts broke it and each was changed: a portal host called `Floating layer` became
 *    `Popups`, a `Detail fold` became `More`, `Intents` became `Kind of ask`, and a `Reading style
 *    note` became `What this is about`. `mechanismWordIn` below is the list of words that gave
 *    those away.
 *
 * ---------------------------------------------------------------------------------------
 * RENAMING AN ID THROWS AWAY THE COMMENTS LEFT ON IT
 * ---------------------------------------------------------------------------------------
 *
 * Read `WHY_A_RENAMED_SURFACE_LOSES_ITS_COMMENTS` below. There is deliberately no map from old
 * names to new ones. A rename is a real loss and Mole Office says so; a guess about which new name means
 * the same thing as an old one would be Mole Office inventing what somebody was pointing at.
 *
 * ---------------------------------------------------------------------------------------
 * THIS LIST IS NOT FINISHED, AND THAT IS VISIBLE RATHER THAN HIDDEN
 * ---------------------------------------------------------------------------------------
 *
 * The list started at twenty-two and grows as the code that draws each part is made to declare
 * itself. An id that is not in this list is a compile error at the call site, because `SurfaceId`
 * is the keys of this object and nothing else — so a part of the screen cannot be pointed at by a
 * name nobody wrote down.
 *
 * It is still not finished, and what is missing is written down rather than left to be found: the
 * record page's own panels, which answer the record around them instead; and the component sheet,
 * which is a catalogue of the parts rather than a part. The composer's regions were the third
 * entry on that list and they are drawn now, in components/agent/TalkBox.tsx and Recipients.tsx.
 */
import { KIND_FAMILIES } from './work.ts'

/**
 * EVERY NAMED PART OF MOLE OFFICE'S OWN SCREEN. The key is the durable name; the value is what a person
 * reads.
 *
 * The list is the one in design/ROUND-NINE-INTERACTION-CONTRACT.md §2.4.1, unchanged. Some of these
 * parts are on screen today and some are built later in this campaign; a name for a part nothing
 * draws yet costs nothing, because a comment can only be written against a part that drew itself.
 */
export const SURFACES = {
  shell: 'Mole Office',
  'rail.chat': 'Chat',
  'settings.projects': 'Projects',
  rail: 'Left rail',
  // Rail names stay English here. RAIL_WORD_KEYS selects each page word.
  'rail.home': 'Home',
  'rail.plans': 'Plans',
  'rail.work': KIND_FAMILIES.work.label,
  'rail.schedule': 'Schedule',
  'rail.horizons': 'Goals',
  'rail.decisions': 'Decisions',
  'rail.modules': 'Modules',
  'rail.pipeline': 'Pipelines',
  // THE PROJECT BOARD, wave 13u round 216: one row for each step of the master pipeline.
  'rail.board': 'Board',
  'rail.findings': KIND_FAMILIES.findings.label,
  'rail.shelved': 'Shelved',
  'rail.ideas': KIND_FAMILIES.ideas.label,
  'rail.notes': 'Reports',
  // MY NOTES, wave 13y round 167: every quick note the person wrote, on a page of its own after Reports.
  'rail.mynotes': 'My notes',
  'rail.working': 'Agents at work',
  'rail.sessions': 'Agent runs',
  'rail.versionhistory': 'Version history',
  'rail.interrupted': 'Interrupted runs',
  'rail.mergequeue': 'Merge queue',
  'rail.agents': 'Agent conversations',
  'rail.messages': 'Messages',
  'rail.placeholders': 'Placeholders',
  'rail.usage': 'Agent use',
  'rail.records': 'All records',
  'rail.queries': 'Missing and unused',
  'rail.worlds': 'Worlds',
  'rail.terminals': 'Terminal management',
  'rail.embassy': 'Embassy',
  'rail.roles': 'Role cards',
  // THE CASTING TABLE (选角表), beside the role cards in the Agents group.
  'rail.casting': 'Casting',
  'rail.regulations': 'Office regulations',
  // THE GATES PAGE, wave 13y round 125: the gates were a panel on Settings, and are a page in the Office group now.
  'rail.gates': 'Gates',
  'rail.toolset': 'Toolset',
  'rail.settings': 'Settings',
  // THE SIDEBAR'S ENTRY FOR EVERY PAGE THAT IS NOT IN FRONT.
  'rail.allpages': 'All pages',
  // THE SIDEBAR'S PRESS THAT OPENS THE QUICK SEARCH over the page being read.
  'rail.quicksearch': 'Quick search',
  // THE SIDEBAR'S PRESS THAT OPENS A NEW QUICK NOTE, wave 13y round 167.
  'rail.quicknote': 'New note',
  // THE SIDEBAR'S PRESS THAT OPENS A WEB PAGE in the window, wave 13t package OT-B (src/web/components/WebPage.tsx).
  'rail.webpage': 'Web page',
  'rail.sheet': 'Mole Office component sheet',
  // THE OFFICE CONTROLS PAGE, wave 13y round 125: a panel on Settings before, now the Developer group's last page.
  'rail.officecontrols': 'Office controls',
  header: 'Top bar',
  overlays: 'Popups',
  // ---------------------------------------------------------------------------------- the home page
  'home.since': 'Since you last looked',
  'home.today': 'Today',
  'home.today.day': 'Today’s hours',
  // 'home.today.week' was here until wave 13w's round 21: the week's hours on Home, which was taken off
  // Home. The plan page draws the week.
  'home.empty': 'Nothing in this project',
  // 'home.needs', 'home.needs.newer' and 'home.needs.why' were here until wave 13k's round 19: the
  // attention panel's ranked list, its update offer and its explanation, which were
  // removed at item 6. A comment somebody filed against one of them reads as gone rather
  // than unknown, which is what the note at the foot of this file describes. The pauses note below
  // is drawn by the questions block, which is kept.
  'home.needs.pauses': 'Pauses left out',
  'home.reports': 'Reports waiting for you',
  'home.decisions': 'Decisions waiting on you',
  'home.decided': 'Recently decided',
  'home.modules.rule': 'Which modules are here',
  // WHAT HAS BEEN SAID. The band on Home that counts what has passed between a person and an
  // agent. Named for the question rather than for the message store underneath it.
  'home.said': 'What has been said',
  // ---------------------------------------------------------------------------- who is working
  // The page's own bands. `working.nobody` is drawn when the page has nobody to draw, and it is a
  // named part rather than a blank space precisely because the sentence in it is the answer.
  'working.roster': 'At work now',
  'working.nobody': 'Why this is empty',
  'working.machinery': 'How this was worked out',
  'working.unregistered': 'Unregistered agents',
  // ------------------------------------------------------------------------------ everything, by kind
  'records.new': 'New record',
  'records.unfiled': 'Under no heading',
  'records.filter': 'Filter',
  // -------------------------------------------------------------------- what is deliberately open
  // The page's own bands. Named for what a reader is looking at rather than for the severity token
  // underneath: `stops_final` is a stored word and `Stops work being called final` is the reading.
  'rail.bundles': 'Context bundles',
  // THE PACKAGED TASKS, criterion F16 point 2. The owner's own name for the column, through the coordinator's
  // ruling, and it is not renamed. It is a project's list — GET /api/delegation reads the project in
  // the switcher — so its rail row is under "What this project holds".
  'rail.tasks': 'Tasks to take',
  // THE COUNTERS OF THIS PROJECT, criterion CT8 of design/counters/ACCEPTANCE.md. A row of its own
  // in the Project group, right after Tasks to take (decision uLV_1NVD8jeV point 15). A counter
  // counts something in this project and does one thing when it has counted enough, so it belongs
  // with the rows that read the project rather than with the agent rows below.
  'rail.counters': 'Counters',
  // THE WORDS WAITING FOR THE PERSON TO CONFIRM, look A of a decision: its own row under All projects,
  // with the count beside it, because the notes come from every project.
  'rail.yourwords': 'Words for you to confirm',
  // One note on that page: the words as the secretary wrote them down, and the two presses on them.
  'yourwords.note': 'One note to confirm',
  // THE RESOURCES EVERY PROJECT SHARES, report peyJSnLoz_Bk. A row under All projects right after Schedule,
  // because a booking is time across every project, as the schedule is. The page's parts follow.
  'rail.resources': 'Resources',
  'resources.gpu': 'Host GPU',
  'resources.book': 'Book the GPU',
  'resources.seat': 'Full-suite test seat',
  // EVERYBODY'S CHECKLISTS, part 2 of the checklists work: a person's and every agent's, in every project.
  'rail.checklists': 'Checklists',
  // THE FLOWS PAGE, every project's flows, each with its runs.
  'rail.flows': 'Office flows',
  'rail.knowledge': 'Knowledge',
  // THE READINESS CHECKLISTS, wave 13u round 13: an operation that reaches others waits for their signatures.
  'rail.readiness': 'Readiness checklists',
  'rail.signingpackages': 'Signing packages',
  'signingpackages.waiting': 'Packages waiting for you',
  'signingpackages.answered': 'Answered packages',
  'signingpackages.open': 'One signing package',
  'readiness.waiting': 'Waiting for a signature',
  'readiness.list': 'Every readiness checklist',
  'readiness.open': 'One readiness checklist',
  // THE HONOUR BOARD, wave 13u round 15: the runs praised for what they left behind, and the weekly table.
  'rail.honour': 'Honour board',
  'honour.exemplary': 'Exemplary runs',
  'honour.noted': 'Noted runs',
  // The table's heading on the page stays "Signals by model and temperature", which is 32 characters and
  // too long for a chip beside a record title. The note above `usage.gaps` below says why.
  'honour.table': 'Signals by model',
  'bundles.make': 'New copy',
  'bundles.reads': 'The copy',
  'bundles.filed': 'Kept bundles',
  // THE COLUMN ON THE TASKS TO TAKE PAGE, criterion F16 point 2. The page's one list: every packaged
  // task in this project, newest package first, each row locating the task and saying where it
  // stands. It is a separate name from the rail row because a chip on the panel and a chip on the
  // rail row are two parts of the screen, and two parts with one name leave a person unable to say
  // which they commented on.
  'tasks.list': 'Tasks you can take',
  // THE PACKAGES THE LIST COULD NOT DRAW. The reply names a task whose `package` key is present but
  // unreadable rather than dropping it, and this is the part of the page that says so. It is named
  // rather than see-through so a comment on the band is about the band.
  'tasks.unreadable': 'Packages we could not read',
  // THE LIST ON THE SHELVED PAGE, criterion S2. Named separately from the rail row for the reason
  // `tasks.list` above gives: a chip on the panel and a chip on the row are two parts of the screen,
  // and one name for both leaves a person unable to say which they commented on.
  'shelved.list': 'Shelved directions',
  'interrupted.run': 'An interrupted run',
  'mergequeue.lane': 'Merge queue lane',
  // THE MERGE QUEUE'S MEASURES ON ITS PAGE: the last seven days as one table, where each figure comes from, and what
  // the measures do not give. Named rather than see-through because nothing around it says what it is.
  'mergequeue.measures': 'Merge queue measures',
  // THE MERGE ENTRIES THE QUEUE CANNOT READ, on its page (wave 13u round 99): each with its title and the queue's
  // reason, apart from the lanes, which leave them out. Named for the reason `tasks.unreadable` above is.
  'mergequeue.unreadable': 'Unreadable merge entries',
  // THE TABLE ON THE CASTING PAGE. Named separately from the rail row for the
  // reason `tasks.list` above gives.
  'casting.table': 'The Casting table',
  // THE LIST ON THE COUNTERS PAGE, criterion CT8. Named separately from the rail row for the same
  // reason `tasks.list` above gives. An empty list still draws this named panel, so the sentence the
  // door wrote for an empty project has a part of the screen it belongs to. It lists the counters of
  // every project or of one chosen project, so its name names no project.
  'counters.list': 'The list of counters',
  // ONE COUNTER, OPENED: its own words, its count and amount, its triggers and action, when it last
  // fired and why, when a timer is next due, whether it is paused, whether a firing was held back,
  // its rows and its changes. Named rather than see-through because it is the part of the screen a
  // person reads when they have opened one counter.
  'counters.open': 'One counter and its history',
  // THE CHECKLISTS PAGE'S LIST, ONE CHECKLIST OPENED, AND THE WINDOW AT THE TOP RIGHT.
  'checklists.list': 'The list of checklists',
  'checklists.open': 'One checklist and its items',
  'checklists.window': 'The checklists window',
  // THE FLOWS PAGE'S LIST, AND ONE FLOW: its facts, its stages in order, its latest runs over them, and the fold of
  // each stage's why and sources.
  'flows.list': 'The list of office flows',
  'flows.facts': "An office flow's facts",
  'flows.stages': "An office flow's stages",
  'flows.runs': "An office flow's latest runs",
  'flows.reasons': "An office flow's reasons and changes",
  // THE FLOW EDITOR (round 36): one flow's stages being changed, or a new flow being filed.
  'flows.editor': 'The office flow editor',
  // THE PACKAGE ON THE TASK'S OWN PAGE, criterion F16 point 3. A task that has a package shows it
  // where a person reads that task; a task with none draws nothing at all rather than an empty
  // panel. Named so a comment left on the panel is about the package and not the whole record.
  'package.here': 'The package',
  // THE PLAN A SUPERVISOR SENT WITH AN ALIGNMENT, drawn inside the package panel. Named apart from
  // `package.here` so a comment left on it is about the plan and not the whole package.
  'package.plan': "The package's plan",
  // WHAT AN ARRIVING AGENT IS TOLD, on the one page whose subject is text leaving the building.
  // It is a reading and not a preset: it comes from a different assembler and nothing merges them.
  // Criterion B17 of design/bundle/ACCEPTANCE.md.
  'bundles.brief': 'The agent brief',
  // ------------------------------------------------------------------- how agents read this project
  //
  // THE LABEL IS WHAT A CHIP SAYS BESIDE A RECORD TITLE, so each of these is short where the panel's
  // own heading on the page is a sentence. `usage.gaps` was drawn as "What agents went outside
  // Mole Office for", which is 35 characters and reads as a clause where a name belongs.
  'usage.stretches': 'Pieces of work',
  'usage.operations': 'What agents ask for',
  'usage.gaps': 'Trips outside Mole Office',
  'usage.patterns': 'Crossed thresholds',
  'usage.sequences': 'What agents do next',
  'usage.hotspots': 'Where work meets',
  'usage.lifecycle': 'Agent working time',
  'usage.receipts': 'Runtime token usage',
  'usage.receipts.counting': 'Receipt counting rules',
  'usage.frameworks': 'Which tool, which project',
  'usage.refusals': 'Where agents are turned away',
  'usage.arrivals': 'Arrival to first write',
  'folderreading.pieces': 'What it would file',
  // ------------------------------------------------------------------------------ what is running
  //
  // The five panels of the runtime page, which is the one page in this app that draws any of it.
  // Every other page draws nothing about the world it is in, which is the owner's F2 answer.
  'runtime.api': 'The API answering',
  'runtime.database': 'The database open',
  'runtime.checkout': 'The checkout and commit',
  'runtime.freshness': 'How new the code is',
  'runtime.worker': 'The message worker',
  // WHICH RUNS GO WHERE, and which tools are on this machine. Criterion T7: a person has to be able
  // to see that the office's own runs and a builder's runs are not on one model by accident.
  'runtime.places': 'Which runs go where',
  'runtime.tools': 'The agent tools here',
  // WHAT THE LAST STARTS COST, AGAINST THE PERSON'S CEILING. A start that cost more than the person allowed is
  // visible here rather than only inside a session record, at F15 point 6.
  'runtime.starts': 'What starts cost',
  // THE OFFICE'S OWN READ TIME, CPU AND MEMORY. Shown where a person looks on
  // purpose, with a line to the secretaries when one stays out of range, at wave 13y round 21.
  'runtime.load': "The office's own load",
  // ------------------------------------------------------------------------------------ the office
  //
  // The three panels of the Worlds page. Criterion C7 of design/messages/ACCEPTANCE.md section 8.
  'worlds.open': 'Open now',
  'worlds.visitors': 'Away from home',
  'worlds.gone': 'Ended',
  // THE WORLD THE READER IS STANDING IN, criterion C33. Three panels of one page: what the world is
  // for, what it says about being a copy, and the press that stops it.
  'world.here': 'What to look at',
  'world.copy': 'About this copy',
  'world.stop': 'When you have seen enough',
  // WHO LIVES IN THOSE WORLDS AND WHO IS VISITING, criterion M52. The page is called the Embassy.
  //
  // RENAMED TO CITIZENS ON 8 SEPTEMBER 2026, criterion P78. The list had become `who the office knows`, and
  // Citizens is the word for it: it was the list's word before P74
  // widened it. The key is unchanged, so a comment somebody left on the panel still points at it.
  //
  // ONE PANEL SINCE CRITERION P74, and it kept the key it had. Separate visitors and
  // visiting agents were not needed, because an agent is already counted as online or offline.
  // There were three — Citizens, Visitors, Visiting agents — and they were three MECHANISMS drawn as
  // three kinds of participant: a roll, a registered trip and a credential. What was a panel is a
  // mark on a row now, and the key stays `embassy.citizens` so a comment somebody left on that
  // panel still points at the list it was left on.
  'embassy.citizens': 'Citizens',
  // WHAT IS WAITING FOR THE PERSON, ABOVE THE LIST. Criterion P78: a request was
  // inside the list rather than in a block of its own. A credential waiting for them was one row
  // among citizens who need nothing, and chapter 6's sixth rule puts weight where somebody has to
  // act. It is its own block now, above the list, and it is drawn only while something is waiting.
  'embassy.asking': 'Asking to come in',
  // NOT "Worlds": the Worlds page's own panels are called that, and two parts of the screen reading
  // alike leave a person unable to say which one they commented on. This one is about what each
  // world has done at the office, which is a different question from which worlds there are.
  'embassy.worlds': 'Worlds at the office',
  // ONE VISITING AGENT'S CREDENTIAL, criteria P24 to P29. The order is the order a person reads it
  // in: where it stands and the press that changes that, then what it cannot prove, then the facts,
  // then what was done under it.
  'credential.standing': 'Where this stands',
  'credential.cannotprove': 'What this cannot prove',
  'credential.facts': 'The run behind it',
  'credential.did': 'What was done under it',
  // THE TWO LISTS ON THE ROLE CARDS PAGE. Criterion P45: the roles an agent holds and the roles a
  // person holds are two lists in one declaration, and nothing reads across them.
  // THE POWER TREE, DRAWN ABOVE THE CARDS. Criterion P68: the Role cards
  // part draws the power tree.
  // THE MACHINES THIS OFFICE TRUSTS, criterion P73: the trusted devices and addresses could be changed
  // neither in Settings nor in Worlds. Two surfaces for one list: the world's page sets it and Settings
  // shows the same rows read-only, and a screen reader that could not tell them apart would say the
  // Settings copy carried presses it does not have.
  // RETIRING AN AGENT, problem zyCcJYCLsAe7, about an agent that had already been closed.
  // Two surfaces because they are two states of one panel and only one is ever drawn: the press
  // while the agent is working, and what was recorded once it has been closed.
  // A DECISION THE PERSON CAN CHANGE, criterion M83: a press used to choose at once,
  // with no way to change the option or add a comment. The panel on a decision's own page that
  // holds the words they can add and the press that chooses again.
  'decision.change': 'This decision',
  // THE TWO HALVES OF A DECISION, criterion P76: the decision itself, which only whoever made it
  // and the person may change, and the notes around it, which any agent may change. A second panel
  // on the decision's page, so it has its own name rather than borrowing the change panel's.
  'decision.halves': 'The decision and its notes',
  'profile.retire': 'Retire this agent',
  'profile.retired': 'Retired',
  // ONE ROW PER LIVE KEY OF THE CITIZEN, each with its own Revoke press (problem yZ71bheXm-Ji). On the profile and
  // on the credential page.
  'profile.keys': 'Keys',
  // THE PERSON'S BROWSERS AND THE MACHINES THIS OFFICE TRUSTS, ON THEIR OWN CARD. Design C of early idea B9: the one
  // place for them and their presses, so its name says whose they are.
  'profile.browsers': 'Your browsers and machines',
  'worlds.trusted': 'Machines this office trusts',
  // NOT THE SAME WORDS AS THE PANEL ABOVE, deliberately. It is one list drawn twice, and two chips
  // reading alike would leave a person unable to say which of the two they had commented on. The
  // Settings panel's job is to say where the list is SET and to show it, and its name says that.
  'settings.trusted': 'Trusted machines',
  // WHO HAS CALLED WITH A CLAIM AND NO KEY, criterion P83 point 6. Its own panel on the Settings
  // page, beside the trusted machines it sits with in the window: the list the person reads before they close
  // the window. It is named for the callers a reader sees and not for the header mechanism that let
  // them in, because the list is of callers.
  'settings.headeronly': 'Callers with no key',
  // THE HIGHEST CARD A VISITOR MAY HOLD, criterion P86. It is its own panel beside the other office
  // settings, and it is read-only: the ceiling is a setting turned in the environment, as
  // MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES is.
  'settings.visitorceiling': 'The visitor card ceiling',
  // PAIR THIS BROWSER, criterion P83 point 2. The one panel of the pairing page, and the only live
  // element that carries this name: the page draws it paired, offered or not offered here, and those
  // are three states of one region rather than three panels. It is named for the act a person makes
  // rather than for the cookie the office sets behind it.
  pairing: 'Pairing this browser',
  'roles.tree': 'The power tree',
  'roles.agents': 'Cards an agent holds',
  'roles.people': 'Cards a person holds',
  // THE THIRD LIST AND THE PRESS AT THE END OF IT, criteria P50 and P51: the shipped cards are the
  // defaults and a new one is added on the same page.
  'roles.madehere': 'Cards written here',
  'roles.add': 'Add a card',
  // WHO HOLDS EACH CARD, criterion P72: a press opens a count page, with a bar chart of how many hold each
  // card and each card's list of citizens below it. The chart and the lists are two panels because they
  // answer two questions: how many, and which ones.
  'rolecensus.chart': 'How many hold each card',
  'rolecensus.holders': 'Who holds them',
  'rolecensus.gone': 'Cards nothing declares',
  // ONE INCIDENT'S SCENE, criterion I3. The panels are the parts of the scene in the order they are
  // read: the loss first, then what happened, what was expected, who answers, and what is
  // being done.
  'incident.loss': 'The loss',
  'incident.timeline': 'What happened, in order',
  'incident.expected': 'Expected and actual',
  'incident.causes': 'The causes',
  'incident.responsibility': 'Responsibility',
  'incident.corrective': 'Corrective actions',
  'incident.verification': 'Verification',
  // THE OFFICE REGULATIONS PAGE, criterion G5. Two panels, because they answer two questions: what
  // the person has bound themselves to, and what the chapters the agents read say.
  'regulations.person': 'The person’s regulations',
  'regulations.chapters': 'The chapters',
  // THE TOOLSET PAGE, piece P3. The filter by who uses a tool, the tools whose category is missing,
  // the pages on the office's own parts (headed so a reader knows they are the office's and not
  // tools), and one tool's manual page. Each category's own box
  // declares the category record it draws, so it needs no name here.
  'toolset.filter': 'Who uses it',
  'toolset.nocategory': 'Tools with no category',
  'toolset.parts': 'The office’s own parts',
  'toolset.manual': 'The manual page',
  // The old role card form's seven parts (roles.new and its panels) left this list with the form in wave 13r
  // round 5. A comment left on one of them reads as gone, as isSurfaceId below says.
  // ------------------------------------------------------------------------- one participant's page
  //
  // The panels of a profile page, criterion M51.
  'profile.workarea': 'Work area',
  // WHETHER A RELEASE WAKES THIS AGENT (wave 13y round 9, answer HeBxwj6QRGjS). On an agent's page only.
  'profile.releases': 'Releases',
  'profile.facts': 'What is known',
  // AN AGENT'S CURRENT HANDOVER, at wave 13k round 46. On an agent's page only.
  'profile.handover': 'Handover',
  // HOW THIS ONE WISHES TO BE ADDRESSED. On every profile page,
  // person and agent. Named by what a reader meets: the heading changes with whose page it is.
  'profile.addressas': 'How to address',
  // WHICH CARD A PERSON HOLDS, WHAT THEY DO, AND THE PICTURE ON IT. Criterion P52: a person's card
  // could not be changed on their profile. Drawn only on a person's own page, which is what
  // the door that writes it allows.
  'profile.yourcard': 'Your card',
  // WHETHER AGENTS MAY INJECT, drawn on an agent's page. Criterion M84: this feature
  // must not be abused. Since M91 it carries no press: the
  // switch is one for every agent, on the Settings page, and this panel only reads it and says where
  // it is set. So its name says that, and never reads like the switch itself ('settings.inject').
  'profile.inject': 'Inject, set in Settings',
  // AND ITS OTHER HALF, ON A PERSON'S PAGE: how many messages each sender has injected to them.
  'profile.injected': 'Injected to you',
  // WHICH CARD AN AGENT HOLDS, AND WHETHER IT MAY ACT FOR THE PERSON. Criterion P64: appointing each
  // card, and choosing for how long, belong on the agent's profile in the Embassy. The two presses are
  // the person's and the Role cards page has neither since; that page describes the cards.
  'profile.theircard': 'Card',
  // ACTING FOR THE PERSON, THE RAISE, as its own section second on an agent's page, by answer 3 of a
  // decision. It was a part of the card panel until then.
  'profile.raise': 'Acting for you',
  // HOW AN AGENT LOOKS ON THE OFFICE MAP, and the press that opens its editor. A bare button under the page until
  // a decision changed that.
  'profile.map': 'Map appearance',
  // A PERMANENT RESIDENT'S SECTION, at wave 13r round 4. Three parts, one per panel
  // ResidentSection.tsx draws: the residency, how the resident wishes to be addressed beside it, and
  // its personal space.
  'resident.residency': 'Permanent resident',
  'resident.addressas': 'How to address a resident',
  'resident.space': 'Personal space',
  // A PERMANENT RESIDENT'S SLEEP PLACE ON ITS PROFILE, with its heartbeat and compactions, and whether its picture and
  // name were chosen, at wave 13k round 46.
  'profile.sleep': 'Sleep',
  'profile.naming': 'Picture and name',
  // ONE SECRETARY'S NOTEBOOK, criteria N1 to N4. Two regions: the entries somebody reads, and the
  // form that adds one. Named by what a reader meets rather than by the record behind them.
  'notebook.entries': 'What is written here',
  'notebook.add': 'Write an entry',
  'profile.answering': 'Answering now',
  // AN AGENT'S TERMINALS (wave 13u): its own terminal and the ones it opened, beside who it is.
  'profile.terminals': 'Terminals',
  // AN AGENT'S LIVE TERMINAL, ITS LIVE STEPS AND THE WAY BACK, wave 13u round 10: its
  // tmux pane, a sandboxed run's steps with a box to write to it, and the command that brings it
  // back.
  'profile.pane': 'Live terminal',
  'profile.steps': 'Live steps',
  'profile.wayback': 'The way back',
  // MOVING AN AGENT TO ANOTHER PROJECT, at wave 13u round 184: what would move, what
  // would stay and why, and the person's press.
  'profile.projectmove': 'Move to another project',
  'profile.quickinputs': 'Quick inputs it asked for',
  'profile.filed': 'Filed lately',
  'profile.machines': 'Seen from',
  'profile.visits': 'Trips',
  'profile.yours': 'What you may change',
  // WHAT EACH RUN OF AN AGENT DECLARED, AND THE TOTALS OVER THEM. Criterion P91. Its own panel, so
  // the work-area panel and P85's sentence under it are untouched.
  'profile.runs': 'Its runs',
  // THE SHORT NAME PROPOSED FOR THIS AGENT, criterion M35. A name is a person's to give, so it is a
  // row the person presses rather than something an agent did. It was `settings.shortnames` until 6
  // September 2026, when it left the Settings page, where it was not needed.
  // The id changed with the place, because the id names a part of the screen and this is a
  // different part; a comment written on the old panel names a part that is no longer there.
  'profile.shortname': 'Proposed short names',
  // THE SECRETARY'S BROADCAST, as decided on 16 September 2026: the next slot, the last
  // broadcast and whether the unanswered rule has paused it. On the page that already draws a
  // secretary's state, so no new page was made.
  'profile.broadcast': 'Broadcasts',
  // EACH MODEL LOGIN'S WEEK, on a secretary's page in Developer mode (wave 13p round 29, lib/logins-week.ts).
  'profile.week': "Each model login's week",
  'placeholders.open': 'Still open',
  'placeholders.answered': 'Answered',
  'placeholders.gaps': 'What could not be checked',
  // ------------------------------------------------------------------------------------ work to do
  'work.cut': 'This list is cut',
  'work.disagree': 'Two stores disagree',
  'work.late': 'Past its date',
  'work.all': 'Every piece of work',
  // ---------------------------------------------------------------------- what a project holds
  // The rail row and the band on the page are two different parts of the screen that carry the
  // same word, so the labels here say which one a chip means.
  'structure.modules': 'Modules in this project',
  'structure.pipelines': 'Pipelines in this project',
  'modules.all': 'Every module',
  'findings.explored': 'Being explored',
  'findings.measured': 'Measured',
  // ------------------------------------------------------------------------------------ agent runs
  'sessions.runs': 'Every run on file',
  'sessions.conversations': 'Conversations between machines',
  'sessions.grouping': 'Why these groups',
  'sessions.machine': 'This machine',
  'sessions.unwritten': 'Nobody wrote these down',
  'sessions.unreadable': 'Not readable',
  // ONE AGENT RUN'S OWN PAGE, criterion E2. Four named parts, one per panel
  // the page draws: what the run is, where it ran, the report it named, and the office's timeline of
  // its calls. Named so a person can point at one of them and leave a comment about it.
  'session.what': 'What this run is',
  'session.where': 'Where it ran',
  'session.report': 'The report of this run',
  'session.did': 'What it did, in order',
  // -------------------------------------------------------------------------------------- schedule
  'plan.period': 'The plan',
  'plan.words': 'Time in words',
  // The board's heading is read from here rather than written twice; see BOARD_TITLE in
  // components/Planning.tsx.
  'plan.board': 'When work happens this week',
  'plan.hours': 'Hours in this period',
  'plan.work': 'Work in this period',
  'plan.goals': 'Goals and deadlines',
  'plan.became': 'What became of it',
  'plan.days': 'Which days work is on',
  'plan.server': 'What the server says',
  'plan.toward': 'Working toward',
  'plan.omitted': 'What is left out',
  'plan.drawing': 'What this drawing stores',
  'plans.review': 'Ask an agent to look',
  // -------------------------------------------------------------- goals, clusters and their parts
  // THE HORIZONS PAGE, criterion P5. Each band is its own named surface, so a comment left on the
  // dropped lines is about that band and not about the whole page.
  'horizons.short': 'Short goals',
  'horizons.medium': 'Medium goals',
  'horizons.long': 'Long goals',
  'horizons.distant': 'Distant goals',
  'horizons.against': 'Planned against actual',
  // ------------------------------------------------------------------------------------ governance
  // THE KEYS STILL SAY `decisions` AND THE PAGE IS THE GOVERNANCE QUEUE. A key here is a DURABLE
  // name: a comment somebody left on a band is stored against it, so renaming one would orphan the
  // comment rather than move it. The words are what changed, and they are what a person reads.
  //
  // `decisions.waiting` is the first of three tiers rather than the whole queue, and it keeps the
  // key it had because it is the same band it always was: the forks only a person may settle.
  'decisions.waiting': 'Yours to settle',
  'governance.asked': 'Asked of you',
  'governance.messages': 'Messages you have not read',
  'governance.aside': 'Set aside',
  'governance.excluded': 'What is not counted',
  'decisions.decided': 'What you decided',
  // WHICH DECISIONS GOVERN A PLACE, asked by a path or a module.
  'decisions.governing': 'Decisions governing a place',
  // The two controls that choose which order each of those two lists is read in.
  'governance.order': 'Order of what is waiting',
  'governance.decidedorder': 'Order of what you decided',
  // --------------------------------------------------------------------------- agent conversations
  'agents.work': 'Work you can talk about',
  'agents.threads': 'Conversations',
  'agents.thread': 'One conversation',
  // ------------------------------------------------------------------------------------- messages
  'messages.noticerules': 'Your notice wake rules',
  'messages.waiting': 'Waiting for your answer',
  'messages.narrow': 'Show fewer of them',
  'messages.all': 'Everything said',
  // ONE MESSAGE'S OWN PAGE, criterion E2. Three named parts, one per panel
  // the page draws: the letter and who sent it, where it went, and what it points at. They are named
  // so a person can point at one of them and leave a comment about it.
  'message.says': 'What it says',
  'message.went': 'Where it went',
  'message.about': 'What it is about',
  // ----------------------------------------------------------------------------- missing and unused
  'queries.unconsumed': 'Results nothing is using',
  'queries.unconsumed.limit': 'What this count covers',
  'queries.unmet': 'Work waiting on a gap',
  'queries.unmet.limit': 'What is checked',
  // ------------------------------------------------------------------------------------ the source
  'source.stale': 'Claims that point nowhere',
  'source.unclaimed': 'Code nobody owns',
  'source.claims': 'What each module claims',
  'source.files': 'Every file the scan found',
  'source.limits': 'What this index misses',
  // ------------------------------------------------------------------------- pipelines and structure
  'pipeline.detail': 'In detail',
  'pipeline.index': 'Pipelines on file',
  'pipeline.drawn': 'Which one is drawn',
  // 5 words on purpose: the registry allows at most five. Nothing else here answers to these words.
  'pipeline.tiers': 'How much the pipeline says',
  'pipeline.opener': 'What is on this page',
  'structure.view': 'The project structure',
  'structure.isolated': 'What is not drawn',
  'structure.stored': 'What is stored here',
  'structure.order': 'Reading order',
  'structure.canvas': 'How much is drawn',
  'structure.edit': 'How edits are made',
  // -------------------------------------------------------------------------------------- settings
  'settings.look': 'How Mole Office looks',
  // THE THEMES PANEL OF WAVE 14D: the themes a person may use, and the ones they make from a copy.
  'settings.ownthemes': 'Themes',
  'settings.theme': 'Theme',
  // The five appearance axes. The words a person reads on each control are read from here, so the
  // control and the chip cannot come to say different things.
  'settings.density': 'Density',
  'settings.corners': 'Corners',
  'settings.type': 'Type',
  // This one was asked for by name. `Text size` and not `Size`, because `Size` beside
  // `Density` on the same bar reads as two words for the same thing.
  'settings.size': 'Text size',
  'settings.writer': 'Writing as',
  // Round nine, step 26: the panel titled `How much detail is shown` was the Normal/Developer
  // switch, and the new grid is what that title actually describes. So the switch is named for the
  // two words on it, and this id keeps its meaning and gains the panel that means it.
  'settings.mode': 'Normal or Developer',
  // ONE WORD FOR THIS PANEL, criterion M37: a press on one's own picture opens Settings at one's own profile. It was
  // "Your picture, name and state", which listed the parts and called the second line a state where
  // the line itself says Status — one panel with two words for one thing. The name of the thing is
  // shorter than the list of its parts and it is the word criterion M37 uses.
  'settings.appearance': 'Your profile',
  // THE ROUND CHAT BUTTON: the picture it carries (M38) and how its number is drawn (M32). It is
  // under the panel above because the number was asked for together with the panel it
  // changes, and because both are stored on the server rather than in this browser. It is named
  // after the button rather than after either setting, because it holds two settings about one
  // thing and a reader looking for the picture would not find "The number on the chat circle".
  'settings.chatbutton': 'The chat button',
  // WHICH NAME A RECORD NAMED IN A MESSAGE IS DRAWN UNDER, criterion M47, and how that link is laid
  // out in the bubble, criterion M48. It is under the chat button because the button is what a
  // reader presses to get to a message and this is about what is inside one, and it is stored on
  // the server for the same reason the button's settings are. It is named after the thing it
  // changes rather than after either setting.
  'settings.messagelinks': 'A link in a message',
  'settings.detail': 'How much each thing says',
  // WHETHER THE NUMBER OF REPORTS NOBODY HAS READ IS DRAWN. It is beside how much a page says because it is one
  // more choice about what is drawn, and it is kept on the server so every browser the person reads in draws it.
  'settings.reportcount': 'Unread reports',
  // THE ONE PANEL ON THIS PAGE THAT IS NOT ABOUT THIS BROWSER. It is registered on the Mole Office
  // computer and it belongs to one project, and the panel says both. `implementation-map.md` §9.4
  // puts it here — "registering a repository is configuration and not project work" — and
  // `settings-and-governance.md` gives it the sixth row of the page's layout.
  'settings.repositories': 'Repositories',
  // HOW MUCH REVIEW A FINISHED RUN IN THIS PROJECT GETS. None, light or
  // full, set per project. The second panel on the page that belongs to ONE project rather than
  // to this browser, so it names the project above its own title exactly as Repositories does. The
  // title is the reader's question — what happens to finished work here — and not "review level",
  // which is the mechanism's name for its own column.
  // THE LIST ON THE GATES PAGE. It was a panel on Settings and kept its name when it moved to a page of
  // its own, so it is named apart from that page's sidebar row, for the reason `tasks.list` gives.
  'settings.gates': 'The list of gates',
  'settings.workswitches': 'Work switches',
  'settings.reviewlevel': 'Review of finished work',
  // THE DIRECTORIES A PREVIEW MAY READ, criterion U4 in its rewritten
  // form. ONE PROJECT, like the two panels above it: an installation holds several checkouts and
  // this list is derived for each project from its own registered repositories and work areas. The
  // label is a label and not a clause, and it says "folders" because that is the word the
  // Repositories panel already draws a root as. The environment variable it is added beside is
  // named in the panel's own body, not in this label.
  'settings.previewroots': 'Folders a preview may read',
  // WHETHER OTHER COMPUTERS CAN OPEN THIS MOLE OFFICE, which today is: no, on every installation. The
  // panel is drawn and photographed saying no before it can ever say yes, because "no" is the
  // ordinary state rather than the edge case. Its title is the reader's question, not the
  // mechanism's name: "Remote access" is a networking word and "Other computers" is not.
  'settings.access': 'Other computers',
  // THE FACTS ABOUT THIS INSTALLATION A PERSON NEEDS, read-only.
  // Where the work is stored, which code is running, which project, and the address other machines
  // open. The Runtime page has drawn all of it since it was built and the Settings page did not say
  // that page existed. Its title is the reader's question rather than a word for an installation.
  'settings.thiscomputer': 'This computer',
  // THE LIST ON THE OFFICE CONTROLS PAGE, named apart from that page's sidebar row as the gates' list is.
  'settings.officecontrols': 'The list of office controls',
  'settings.restart': 'Restart the office',
  // THE TWO COLOURS REVIEW DRAWS ITS MARKS IN. The marker colours are
  // configurable. Colour never carries the distinction on its own: a comment about one thing
  // draws one edge and a comment about the whole thing draws a doubled edge.
  'settings.review': 'Review marks',
  // HOW THE WAITING-ON-YOU PAGE DRAWS EACH THING, criterion P54: the Decisions page had turned into a
  // list view for no clear reason, and the view belongs in a setting. The page used to pick its own shape
  // from what happened to be waiting, which reads as a setting having moved on its own. The title
  // names the page it changes, because that is what somebody looking for it is holding in mind.
  'settings.queueview': 'The Decisions page',
  // HOW A PICTURE INSIDE A MESSAGE IS DRAWN, criterion M64: three choices, to
  // show the picture, to show it after a press, or to show only its path. The name says what the setting is
  // about and not what it does to it, the way `settings.messagelinks` beside it does.
  'settings.chatpictures': 'Pictures in a message',
  // HOW BIG THE CHAT'S OWN TEXT IS, criterion M112: the chat's text
  // size is set in Settings. NOT `settings.size`: that one is the appearance bar's own text size, for
  // the whole app, remembered in this browser. This one is the chat alone, and it follows the person.
  'settings.language': 'Language',
  'settings.words': 'Page words',
  // The office-wide groups and order of the sidebar's pages, on a page of their own since wave 13y round 125.
  'settings.sidebar': 'Sidebar',
  // THE ENTRY IN LOOKS THAT LEADS TO THAT PAGE, which has no sidebar row of its own.
  'settings.arrangesidebar': 'Arrange the sidebar',
  'settings.chattextsize': "The chat's text size",
  // THE PERSON'S FLAGS FOR THE MESSAGES THEY WRITE (wave 14d): one list of the four flags the office ships and
  // the person's own, with the menu's 'No mark' entry. They follow the person.
  'settings.chatlabels': 'Your flags',
  // WHICH KEY SENDS A MESSAGE. By default Enter starts a new line, and Shift+Enter
  // or Alt+Enter sends. It is the first panel in the `keys` category,
  // `Keyboard shortcuts`, and the name is what the control is about rather than the stored word.
  'settings.sendkey': 'The send key',
  // WHICH KEYBOARD SHORTCUTS ARE ON, at item 5 of a decision.
  // The second panel in the `keys` category, under the send key.
  'settings.shortcuts': 'The shortcut keys',
  // WHETHER MEDIA A RECORD POINTS AT ARE LOADED, criterion U5. NOT `settings.chatpictures` above:
  // that is a picture inside a chat message, and this is a picture or video in a report. The name
  // says what the panel is about, and the three answers on it are With the page, Never and On a
  // press.
  'settings.mediaload': 'Loading pictures and video',
  // WHAT THE OFFICE KEEPS: HOW MANY BACKUPS, AND HOW LONG THE TWO KINDS OF REQUEST ROW SURVIVE.
  // Criterion U6. The panel is the page's first numeric control;
  // every kept setting above it is a text enum. The name is the reader's question, not the store's.
  'settings.storage': 'Storage destinations',
  'settings.whatiskept': 'What the office keeps',
  'settings.datafolder': 'Data folder',
  // THE PRICE TABLE THE USAGE PAGE ESTIMATES FROM. Criterion U3. The person sets a price per model
  // here, and the Usage page works out an estimate from it. The name is what the panel holds.
  'settings.prices': 'Price table',
  'settings.quickinputs': 'Quick inputs',
  // THE PROGRAM THAT KEEPS THE OFFICE'S TERMINALS OPEN, AND THE PRESS THAT RESTARTS IT (wave 13u round 23).
  // The name is what the panel is about, as the terminal pages name it.
  'settings.terminalholder': 'Terminal holder',
  // WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criterion M91: one
  // setting for all, in Settings, drawn as a toggle.
  // The page's first toggle. The name is the question the switch answers.
  'settings.inject': 'Agents may inject',
  // THE PLUGINS IN THE INSTALL'S plugins/ FOLDER, A SWITCH FOR EACH (wave 13x round 14, block N0TWpg5xe6mo of the plugin
  // pipeline udGnc-Bsr15R). The name is what the panel holds.
  'settings.plugins': 'Plugins',
  // A SWITCHED-ON PLUGIN'S PAGES, IN THE SIDEBAR, AND ONE OF THEM ON ITS OWN PAGE (wave 13x round 15, block 3nJsBlPlYhcl).
  // The group in the sidebar is named for what it lists. The page is the plugin's frame, or the words saying it has none.
  'plugins.pages': 'Plugin pages',
  'plugins.page': 'Plugin page',
  'settings.machinenames': 'Machine names',
  // WHICH SECRETARY TAKES THE DEAD LETTERS, problem 0WUuvB0IhRfb. The person names one agent; the name is
  // a noun phrase, short enough to be a label (wave 13y round 121, the secondary-text clean-up).
  'settings.deadletters': 'Dead-letter secretary',
  // WHO OWNS THE MERGE QUEUE, by a decision and its answer EI3_Msuradr7. The person names one
  // secretary, which may then move a merge entry to the front of its lane. The name is a
  // noun phrase (wave 13y round 121).
  'settings.mergequeueowner': 'Merge queue owner',
  // WHICH SECRETARY IS REMINDED ABOUT EACH PROJECT'S MODULES, decision aZGg6gerakM1 (wave 13p round 29). One secretary
  // per project, set here or by the .env line; the name is a noun phrase (wave 13y round 121).
  'settings.modulereminders': 'Module reminders',
  // WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' LOGIN, AND WHAT THE ONE AT 80% SAYS TO DO, two settings of wave 13y
  // round 136 in one panel (round 137). The name is a noun phrase.
  'settings.usagenotices': 'Usage notices',
  // WHETHER A MESSAGE TO AN OFFLINE OR INACTIVE AGENT IS REFUSED, read-only, in normal mode (w13n round 32). The same
  // line the developer panel "This computer" draws; the message door's refusal sentence sends the person here.
  'settings.messagedoor': 'Messages to offline agents',
  // HOW LONG A PERSON'S MESSAGE MAY GO WITHOUT A REPLY BEFORE THE AGENT IS REMINDED ONCE, read-only (wave 13y round 11).
  'settings.replyreminder': 'Reminder when no reply',
  // WHAT THE SHUTDOWN PRESS DOES IN THE WINDOW, criterion W5 (w13n round 58): shut Mole Office down, or close only the
  // window and keep the service. Drawn only in the window, because a browser tab has no service of its own to keep.
  'settings.windowshutdown': 'Shutdown in this window',
  // WHETHER THE OFFICE STARTS WHEN THE PERSON LOGS IN (wave 13t round W18c): the start-at-login card of Terminal
  // management, drawn again where Normal mode finds it. The name is the card's own heading.
  'settings.startatlogin': 'Start at login',
  // THE KEYS THIS OFFICE HAS: ITS OWN TWO, AND THE SANDBOXES' LOGINS. Criterion U2.
  // The reader's question is "which keys does this office have?". Each runtime's own key was a
  // third half here until wave 13u round 242 gave each coding tool a line in 'settings.codingtools'.
  // The name is short because a chip draws it.
  'settings.keys': 'Keys and runtimes',
  // ONE LINE FOR EACH CODING TOOL, WITH ITS SET UP PRESS (wave 13u round 242). The reader's question is "where do I
  // set up a coding tool and its key?", and the answer is one line for each tool and one press that asks a secretary.
  'settings.codingtools': 'Coding tools',
  'settings.providerkeys': 'Keys for the id service and its mail',
  // NOTIFICATIONS ON THIS DEVICE. The reader's question is "will I be
  // told here when a secretary calls me?", and the answer is one press on each device.
  'settings.notifications': 'Notifications on this device',
  // THE MODEL EACH RUN USES, criterion U2. The reader's question is "which model do my runs get?":
  // for a run the office starts by itself to answer a message. A builder's model for each role, and
  // the check's, are on the Casting page.
  'settings.runmodels': 'The model each run uses',
  // THE ENTRY THAT PUTS MOLE OFFICE IN EVERY SESSION, F15 point 1. The reader's question is "does
  // every agent I open find Mole Office?", and the answer is one skill link and three hook lines in
  // the person's home directory. The name is short because a chip draws it.
  'settings.entry': 'The entry for every session',
  // THE MAIL TOOL. The reader's question is "will a summons reach me by mail?", and the answer
  // is one press that installs the tool as a service of the person's login, and its own page for the addresses.
  'settings.mailtool': 'The summons mail',
  // ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER. The reader's question is "how much of
  // this computer may the sandboxes take?", and the answer is one press that runs a fixed command as administrator.
  'settings.sandboxmemory': 'Sandbox memory limit',
  // WHO IS THE GPU WATCHER (wave 13v round 35b). The reader's question is "which agent may hand in readings of the GPU
  // card?", and the answer is one agent or nobody, chosen here, or named by the .env line, which comes first.
  'settings.gpuwatcher': 'The GPU watcher',
  // HOW MUCH OF A REPORT IS DRAWN. It was one control called Reading style, offering four
  // typographic presets that drew an identical tree of the same 1,836 words. What a reader
  // actually decides is how much of the report is drawn and whether its pictures are drawn; how
  // large the type is is `settings.size` on the appearance bar and is not a second control here.
  //
  // TWO IDS BECAUSE ONE CONTROL IS DRAWN TWICE, above the report and again below it,
  // because it belongs in both places. The two set one stored value, so they are
  // one control; they are two REGIONS of one page, and a record page is checked as a tree of
  // declared sections in which one key may name only one element. Two elements answering to one key
  // is the defect this cluster fixed, so the second instance is declared rather than copied.
  //
  // ONLY THE SECOND NAME SAYS WHERE IT IS. The first is the control a reader meets, at the top of
  // the report, and *How much to read* is what it is; the second is the same control drawn again
  // where the reading ends, and *below* is the only thing that tells the two apart in a list.
  'report.readas': 'How much to read',
  'report.readas.foot': 'How much to read, below',
  composer: 'Composer',
  'composer.subject': 'Subject',
  // 'composer.intent' was here until 16 September 2026: the row of five chips asking what a message
  // means. Since that day the words are the message, and the right-click panel holds only
  // a dialog, a contact chooser and three presses (criterion W4), so the chips left and the name
  // they carried names nothing a person can point at. A comment against it reads as gone rather
  // than unknown, which is what the note at the foot of this file describes.
  'composer.recipient': 'Recipient',
  'composer.recipient.list': 'Recipient list',
  'composer.actions': 'Actions',
  'composer.detail': 'More',
  // THE PANEL THAT CHANGES AN UNSENT INSTRUCTION IS A SECOND FRAME, so it needs a name of its own.
  // Without one, a right-click inside it walked past the composer and answered the page behind it,
  // and the composer was then re-aimed at the page with the half-written instruction gone from the
  // box. Measured on 20 August 2026. The label is the words on the panel's own title bar.
  'composer.change': 'Change this instruction',
  // 'review.strip' was here until 5 September 2026: the band across the top of every page, which
  // was removed (problem Wa-23qH_zbPx). A comment somebody filed against it
  // reads as gone rather than unknown, which is what the note at the foot of this file describes.
  'review.pane': 'Review column',
  // 'organise.yours' and 'organise.pieces' were here until wave 13y round 169: the two columns of Organise, which left
  // the right-click box. A comment somebody filed against one of them reads as gone rather than unknown, which is what
  // the note at the foot of this file describes.
  'reach.say': 'Off-screen row',
} as const satisfies Record<string, string>

/** The name of one part of Mole Office's own screen. */
export type SurfaceId = keyof typeof SURFACES

/** The names, in declaration order, so every list built from them reads the same way twice. */
export const SURFACE_IDS = Object.keys(SURFACES) as readonly SurfaceId[]

/** What a person reads for this part of the screen. */
export function surfaceLabel(id: SurfaceId): string {
  return SURFACES[id]
}

/**
 * Is this word the name of a part of the screen Mole Office knows?
 *
 * A comment stored against a name that is not in the list is not a comment about a part of the
 * screen nobody has looked for. Mole Office DID look, here, which is the only place such a name lives.
 * That is why the reading for it is `gone` and not `unknown` — see `CONTEXT_READINGS` in
 * ./targets.ts.
 */
export function isSurfaceId(word: string): word is SurfaceId {
  return Object.prototype.hasOwnProperty.call(SURFACES, word)
}

/**
 * WHAT MOLE OFFICE CAN OPEN TO PUT A PART OF THE SCREEN BACK ON IT.
 *
 * Some parts exist only while something is open. The composer's subject line is there while a
 * composer is open and nowhere else. A row in the review column that points at one of these would
 * otherwise be permanently inert: press it, and nothing is there to ring.
 *
 * Opening a composer is something the product can do, so it does it, and only then says whether the
 * part is on screen. A part with no entry here is either always available or is something Mole Office
 * has no way to summon, and both of those answer the same way: look, and say what was found.
 */
export const SURFACE_OPENS_WITH: Partial<Record<SurfaceId, 'composer' | 'reviewPane'>> = {
  composer: 'composer',
  'composer.subject': 'composer',
  'composer.recipient': 'composer',
  'composer.recipient.list': 'composer',
  'composer.actions': 'composer',
  'composer.detail': 'composer',
  'composer.change': 'composer',
  'review.pane': 'reviewPane',
}

/**
 * IS THIS PART OF THE SCREEN ONE OF THE COMPOSER'S OWN?
 *
 * It is DERIVED from the list above rather than written out again beside it. The two questions —
 * *what does Mole Office open to put this part back on screen* and *is this part of the composer* — have
 * one answer, and a second list of composer names would be free to disagree with the first. That is
 * the defect this repository keeps finding.
 *
 * NOTHING PARSES THE DOTS to answer this, and that matters: the ids are written with dots because a
 * path reads well to a person, and a rule that read `composer.` as a prefix would be inventing a
 * tree the file header says does not exist.
 *
 * WHAT READS IT. A right-click inside an open composer must be about the composer rather than about
 * the page behind it, and it must not throw away the instruction being written. `openAbout` in
 * components/agent/open.ts asks this, and offers the part instead of replacing the subject.
 */
export function isTheComposersOwn(word: string): boolean {
  return isSurfaceId(word) && SURFACE_OPENS_WITH[word] === 'composer'
}

/**
 * WORDS THAT NAME MACHINERY RATHER THAN A THING ON A SCREEN.
 *
 * A label containing one of these is describing how the part is built. Nobody reading a chip wants
 * to be told that the thing they right-clicked is a portal. The list is short on purpose: it holds
 * the words that actually produced bad labels in this design, and it grows when a bad label gets
 * through, never in anticipation of one.
 *
 * `row` is the exception and is only refused when it is the WHOLE label, because `Off-screen row`
 * says what a person sees and `Row` says nothing at all.
 */
export const MECHANISM_WORDS: readonly string[] = [
  'layer',
  'fold',
  'portal',
  'wrapper',
  'container',
  'pane',
  'intent',
  'node',
  'field',
]

/** Refused only as a whole label. See `MECHANISM_WORDS`. */
export const MECHANISM_WORDS_ALONE: readonly string[] = ['row']

/**
 * The machinery word in this label, or null. One function, so the rule and the test that enforces
 * it cannot say different things.
 */
export function mechanismWordIn(label: string): string | null {
  const words = label
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word !== '')
  for (const word of words) {
    const singular = word.endsWith('s') ? word.slice(0, -1) : word
    if (MECHANISM_WORDS.includes(singular)) return singular
  }
  if (words.length === 1) {
    const only = words[0] ?? ''
    const singular = only.endsWith('s') ? only.slice(0, -1) : only
    if (MECHANISM_WORDS_ALONE.includes(singular)) return singular
  }
  return null
}

/**
 * WHAT HAPPENS TO COMMENTS ON A PART OF THE SCREEN THAT GETS RENAMED, in the words a person reads.
 *
 * It is written once, here, because three places would each have written their own version of it
 * and one of them would have promised that Mole Office would work out the new name. It will not, and
 * there is no list of old names anywhere: a guess about which new name means the same thing as an
 * old one is Mole Office inventing what somebody was pointing at.
 */
export const WHY_A_RENAMED_SURFACE_LOSES_ITS_COMMENTS =
  'A part of the screen is remembered by the name it was given. Change that name and the comments left on it ' +
  'are left on the old name: Mole Office says the part is gone rather than guessing which new name means the same ' +
  'thing. Keep the name and change the words a person reads instead.'

/** Rail words use these keys; surface names stay English for stored references and server replies. */
export const RAIL_WORD_KEYS = {
  'rail.chat': 'nav.chat',
  'rail.home': 'nav.home',
  'rail.plans': 'nav.plans',
  'rail.work': 'nav.work',
  'rail.schedule': 'nav.schedule',
  'rail.horizons': 'nav.horizons',
  'rail.decisions': 'nav.decisions',
  'rail.modules': 'nav.modules',
  'rail.pipeline': 'nav.pipeline',
  'rail.board': 'nav.board',
  'rail.findings': 'nav.findings',
  'rail.shelved': 'nav.shelved',
  'rail.ideas': 'nav.ideas',
  'rail.notes': 'nav.notes',
  'rail.mynotes': 'myNotes.title',
  'rail.working': 'nav.working',
  'rail.sessions': 'nav.sessions',
  'rail.versionhistory': 'nav.versionHistory',
  'rail.interrupted': 'w13t.nav.interrupted',
  'rail.mergequeue': 'mergeQueuePage.nav',
  'rail.agents': 'nav.agents',
  'rail.messages': 'nav.messages',
  'rail.placeholders': 'nav.placeholders',
  'rail.usage': 'nav.usage',
  'rail.records': 'nav.records',
  'rail.queries': 'nav.queries',
  'rail.worlds': 'nav.worlds',
  'rail.terminals': 'nav.terminals',
  'rail.embassy': 'nav.embassy',
  'rail.roles': 'nav.roles',
  'rail.casting': 'nav.casting',
  'rail.regulations': 'nav.regulations',
  'rail.gates': 'gates.title',
  'rail.toolset': 'nav.toolset',
  'rail.settings': 'nav.settings',
  'rail.allpages': 'nav.allPages',
  'rail.quicksearch': 'nav.quickSearch',
  'rail.quicknote': 'nav.newNote',
  'rail.webpage': 'nav.webPage',
  'rail.sheet': 'nav.sheet',
  'rail.officecontrols': 'runtimeSettings.title',
  'rail.bundles': 'nav.bundles',
  'rail.tasks': 'nav.tasks',
  'rail.counters': 'nav.counters',
  'rail.yourwords': 'nav.yourWords',
  'rail.resources': 'nav.resources',
  'rail.checklists': 'nav.checklists',
  'rail.flows': 'nav.flows',
  'rail.knowledge': 'knowledge.title',
  'rail.readiness': 'nav.readiness',
  'rail.signingpackages': 'nav.signingPackages',
  'rail.honour': 'nav.honourBoard',
} as const satisfies Record<Extract<SurfaceId, `rail.${string}`>, WordKey>

/** Surface identity stays fixed; an edited caption uses the office's effective word reader. */
export function surfaceWord(surface: keyof typeof SURFACES): string {
  return storedWordIfDeclared('surfaceWords.'+surface) ?? SURFACES[surface]
}
