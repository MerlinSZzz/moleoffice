// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH SECTION OF A RECORD A PANEL IS DRAWING, SO A RIGHT-CLICK ON IT LANDS ON THAT SECTION.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A person right-clicks a paragraph and the browser walks UP the document until it finds an element
 * that says what it is. Measured on 29 August 2026 on module `cegP4HnIk9nd`: twenty-one headings,
 * twenty-one presses, one answer — the whole module, every time. Every panel on a record page
 * declared `{ surface: null }`, which means see-through, so the walk ran past all of them.
 *
 * The sections were never missing from the product. `recordRegionsOf` in src/shared/regions.ts
 * derives one region per section a record has. Nothing on the screen carried one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * One function. It takes a record and gives back the answer a panel drawing one of its sections
 * puts in its `declares` prop. Two answers, and which one comes back is not this file's decision:
 *
 *   · The record HAS this section  → the section's own region, `section.<key>` of this record.
 *   · The record has not filled it → `{ surface: null }`, exactly as before, and the walk carries
 *     on to the record. A module with no paths still draws its Paths panel, with "none linked"
 *     inside it; a target there would name a region this record does not have, and the server would
 *     answer `gone` about a box a reader is looking at.
 *
 * `sectionsOnThisRecord` is the one that decides, in src/shared/regions.ts, and it is the same
 * function the region tree is built from. So a panel cannot come to think it draws a section the
 * tree does not hold.
 *
 * ---------------------------------------------------------------------------------------
 * A KEY THE KIND DOES NOT DECLARE THROWS, AND THAT IS NOT THE SAME AS AN EMPTY SECTION
 * ---------------------------------------------------------------------------------------
 *
 * An empty section is a state a record is in. A key nobody declared is a mistyped string in this
 * repository, and returning `{ surface: null }` for it would hide a broken panel behind the same
 * silence the empty case uses honestly. So it throws, on the screen, where somebody will see it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH PANELS OF A RECORD PAGE BECAME SECTIONS, AND WHICH DID NOT, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Not every DOM wrapper is meant to become a semantic region, so this is the list
 * rather than a rule that swept the page. Counted on 30 August 2026: 39 panels are drawn on a
 * record page and each declared no surface, and every panel that still declares none has a reason
 * below that is not "nobody got to it".
 *
 * THE SPLIT BETWEEN THE TWO LISTS HAS MOVED THREE TIMES SINCE AND THE NUMBERS ARE GONE. This
 * paragraph used to say "ten of them draw a declared section and twenty-nine do not", and the two
 * headings below carried those two numbers. Steps D2, F2 and G3 each moved a panel across, and the
 * numbers were only ever re-read once — so they were three counts of a page nobody had recounted,
 * which is the defect this repository keeps producing. The lists are what matter and they are
 * complete; a count of them is one line of arithmetic away for anybody who wants one.
 *
 * THE PANELS THAT DRAW A SECTION.
 *   What happens if this is left alone      section.consequence
 *   Context, Parts, Paths (module)          section.context, section.parts, section.paths
 *   Curated summary (module)                section.summary
 *   Shorter forms, in all three states      section.shortForms, and one region per written line
 *   What is still open around this          section.openAround
 *   The History fold, in all three states   section.history
 *   The fold holding the change log         section.changes
 *   Links, and one list per relation        section.links, section.<relation>
 *   Where this module stands                section.standing
 *   Claimed source (module)                 section.claimedSource
 *   How this subsystem may evolve           section.mayEvolve
 *   Reports about this module               section.reportsAbout
 *   Where this work sits, and how big it is section.whereItSits
 *   What has already been tried (problem)   section.attempts
 *   Waiting on you (proposal)               section.question and the five beside it
 *   Who made this, and whose move it is     section.whoseMove
 *   What breaks (problem)                   section.symptom
 *   Every fold of the body stack            section.<field>, one per field this record wrote
 *
 * THE PANELS THAT DO NOT, IN FIVE GROUPS.
 *
 * 1. THE FIELD IS IN THE HEADLINE, SO IT IS NOT A BODY SECTION AND NO SECTION EXISTS FOR IT.
 *    What this claim measures; What this run is doing; What it would need; The question this is
 *    chasing; What this note says; What this message says; What this comment says; What it is
 *    about; What is owed, and to whom; How long is left.
 *    **AND THIS IS A REAL GAP, SAID PLAINLY RATHER THAN LEFT TO BE FOUND.** A note IS its body, and
 *    `IN_HEADLINE` claims `body` for a note — so a note's own words have no section and a press on
 *    them answers the note. That is the declaration in src/shared/sections.ts being narrower than
 *    the page, and it belongs to whoever revisits `IN_HEADLINE` rather than to this file.
 *    **THREE HAVE LEFT THIS GROUP AND THE WAY OUT IS THE SAME EVERY TIME.** *Where this work sits*
 *    and *What has already been tried* left at steps F2, and *What breaks* on 31 August 2026. In
 *    each case the field was named in `DRAWN_BY_THE_HEADLINE` in src/shared/sections.ts, which says
 *    a panel above the body really draws it — so a section exists after all, and the panel says so
 *    through `sectionsOf` below. Being in the headline never meant the words were nowhere.
 *
 * 2. MACHINERY, NOT READING MATTER. `NOT_BODY` names fields that no section is declared for:
 *    What this record's own state says; Extra; Other stored fields; Stored fields; Every field this
 *    kind declares; Change what this report says about itself; This record is deleted; the
 *    read-problems banner. A control is not a place in the record, and a comment about a control is
 *    about Mole Office.
 *    **TWO PANELS WERE IN THIS GROUP AND WERE PUT HERE BY READING THE FIELD RATHER THAN THE PANEL.**
 *    *Where this module stands* left at step F2. *Who made this, and whose move it is* left on
 *    31 August 2026: `NOT_BODY` names `whose_move`, and this list read that as the whole panel —
 *    but the panel's first row is WHO FILED THE RECORD, read off the change ledger, which is
 *    provenance and is not a control at all. Criterion 8 of design/problem-03/ACCEPTANCE.md names
 *    provenance by name. It is `section.whoseMove`, and `WHOSE_MOVE_KEY` in src/shared/sections.ts
 *    holds the decision.
 *
 * 3. NOT THIS RECORD'S OWN WRITING. Source files; What this may not be used to claim. Each is
 *    derived from OTHER records or from the repository on disk, so the thing to point at is the
 *    record it came from.
 *    **THREE PANELS LEFT THIS GROUP AT STEP F2 AND THE ARGUMENT THEY LEFT ON IS WORTH KEEPING.**
 *    *Where this lives*, *How this subsystem may evolve* and *What this was made of* are still not
 *    this record's own writing, and the ROWS inside them still name the records and files they came
 *    from. What was wrong was concluding that the PANEL is therefore nowhere: the panel is the
 *    place a reader is looking at and the thing they mean when they press its heading, which is the
 *    sentence `WHERE_IT_LIVES_KEY` in src/shared/sections.ts already carried.
 *
 * 4. INSIDE A SECTION THAT IS ALREADY DRAWN, AND ONE REGION MAY ONLY BE ON ONE LIVE ELEMENT.
 *    How this record got here; Versions of this record; What happened to this record. All three are
 *    what the record HELD, all three are `section.history`, and the History fold carries it.
 *    `MarkLayer` finds a stored comment's element with `document.querySelector`, which takes the
 *    FIRST match — so two elements carrying one id would paint one person's comment in the wrong
 *    place.
 *
 *    **RECENT CHANGES WAS THE FOURTH ENTRY HERE AND IT WAS THE WRONG ANSWER.** It is not inside
 *    the History fold and it is not the same thing: History is what the record HELD and can put a
 *    version back; the change log is WHO WROTE WHICH FIELD. Calling them one section meant one of
 *    them had to carry no target at all, and it was the change log — so every press inside it
 *    walked eight to fifteen silent elements to the whole record, 585 of them over the eight record
 *    pages the re-gate read. The page has two provenance parts, so the model has two keys:
 *    `HISTORY_KEY` and `CHANGES_KEY` in src/shared/sections.ts, where the decision is written out.
 *
 * 5. A LINK RELATION, WHICH IS NOW BUILT AND IS IN THE LIST ABOVE. *Links* and *Reports about this
 *    module* were the last two entries of this group and both draw a section of their own now, so
 *    what is left here is the RELATION rather than a panel that declares nothing.
 *    A record's link rows are grouped by the relation they are read under — *about*,
 *    *discussed by*, *subject of* — and each of those groups is a `section.<relation>` region of
 *    this record, declared through this same function. The rows inside one declare the RECORD they
 *    name, through `theLinkedRecord` at the foot of this file. Both lists of rows do it: the rail's
 *    five, and all twenty in the panel the rail's fold opens.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ANCHOR NAMING ANOTHER RECORD ANSWERS, MEASURED TWICE
 * ---------------------------------------------------------------------------------------
 *
 * On the five records the owner's gate names there are 120 anchors whose address is another record.
 * 4 answered that record before any of this; **87** after the link rows were declared, on
 * 30 August 2026; **120** on 31 August 2026, which is criterion 9 of
 * `design/problem-03/ACCEPTANCE.md` met. `design/problem-03/baseline/link-rows.mjs` is the
 * instrument and it was run before and after each step.
 *
 * THE LAST 33 WERE NOT WHAT THIS FILE SAID THEY WERE, and the sentence that said so is deleted
 * rather than softened. It read: *the 33 that do not are change-log lines … the record they mention
 * is not what a comment on that sentence is about*. Measured on problem `a62SOh9fsPe5` on 31 August
 * 2026, the press told against it: a right-click on the session NAME in a change row walked up
 * twelve elements that said nothing and answered the problem whose page it was printed on, which is
 * the root, which the owner's rule keeps for last. The row is a sentence about a change to this record; the
 * NAME inside it is a linked record reference, and that one must stay identifiable. So
 * the anchor declares the record it names — see `SessionRef` and `LinkTarget` in
 * components/ChangeLog.tsx — and the row around it still answers the record whose history it is.
 */
import { sectionRegionId, sectionsOnThisRecord } from '@shared/regions.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import { relationSectionsOf, SECTIONS_OF, titleOfSection } from '@shared/sections.ts'
import type { RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { declaredAttributes, type Declares } from './declares.ts'

/** What a section target needs from the record it is on, and from the links drawn on its page. */
export interface RecordOnThePage {
  id: string
  kind: RecordKind
  data: Record<string, unknown>
  /**
   * THE RECORD'S OWN TITLE, the envelope column.
   *
   * REQUIRED FOR THE REASON `summary` BELOW IS: on a report the title is
   * reading length 2 and has a `section.titleLine`, so a surface that left it out would hold a
   * different set of sections from the tree the server resolves against.
   */
  title: string
  /**
   * THE RECORD'S ONE-LINE SUMMARY, the envelope column — `PanelRecord.summary`, not `data.summary`.
   *
   * REQUIRED FOR THE REASON `relations` IS. It is what decides whether this record HAS a
   * `section.summaryLine`, and a surface that left it out would tell the header to declare a
   * section on a paragraph the tree does not hold. A surface drawing a record that has none says
   * `null`, which is a statement about the record.
   */
  summary: string | null
  /**
   * THE RELATION PHRASES THIS RECORD HAS LINKS OF — `ResolvedLink.label`, one per row, repeats and
   * all. `relationSectionsOf` drops the repeats; passing the labels as they came keeps the order
   * the page draws them in.
   *
   * REQUIRED FOR THE REASON `RecordRegionSource.relations` IS. A panel that drew link rows and was
   * handed no relations would ask for `section.about`, be told the record declares no such section,
   * and throw on the screen — which is loud, and is what this file already does for a mistyped key.
   * A surface that draws no link rows says `[]`, which is a statement about that surface.
   */
  relations: readonly string[]
}

/**
 * What a panel drawing one section of this record declares.
 *
 * IT DERIVES THE SECTION LIST AND NOT THE WHOLE TREE. `sectionsOnThisRecord` reads the record's
 * stored fields and stops; `recordRegionsOf` walks every paragraph of the report body under them.
 * A record page draws its report body through `SummaryBlocks`, which derives that walk already, and
 * a second one on every render would be the same work done twice.
 */
export function sectionsOf(record: RecordOnThePage): (key: string) => Declares {
  // WHAT THE KIND DECLARES, PLUS WHAT THIS RECORD'S LINKS DECLARE. A relation section is not in
  // `SECTIONS_OF` — which relations a record has is a fact about the record — so both lists are read
  // and neither is restated here. `relationSectionsOf` is the same function the region tree calls.
  const declared = new Set([
    ...(SECTIONS_OF[record.kind] ?? []).map((spec) => spec.key),
    ...relationSectionsOf(record.relations).map((spec) => spec.key),
  ])
  const here = new Set(sectionsOnThisRecord(record).map((spec) => spec.key))
  return (key: string): Declares => {
    if (!declared.has(key)) {
      // THE KIND IS NAMED IN THE READER'S WORD AND NOT THE STORED ONE, because this sentence is one
      // somebody reads. `kindWord` is the one table that turns a stored kind into words.
      const said = kindWord(record.kind).text
      throw new Error(
        `A panel says it draws the "${key}" section of a ${said}, and a ${said} declares no such section. The ` +
          `sections it declares are: ${[...declared].join(', ')}. src/shared/sections.ts is where they are ` +
          `written.`,
      )
    }
    if (!here.has(key)) return { surface: null }
    return { about: { kind: 'region', recordId: record.id, regionId: sectionRegionId(key) } }
  }
}

/**
 * WHAT A PANEL DRAWING ONE SECTION PUTS IN ITS HEADING.
 *
 * Section declarations keep their keys. The page reads their titles in its language, with the
 * kind-specific headings preserved. F9qzbFgbN4g5 assigns this reader to G2a of 7FEOshq3mBGG.
 *
 * A KEY THE KIND DOES NOT DECLARE THROWS, on the screen, for the reason `sectionsOf` throws: an
 * empty heading would hide a mistyped string behind a panel that looks fine.
 */
export function titleHere(kind: RecordKind, key: string): string {
  const title = titleOfSection(kind, key)
  if (title === null) {
    const said = kindWord(kind).text
    throw new Error(
      `A panel says it draws the "${key}" section of a ${said}, and a ${said} declares no such section, so ` +
        `there is no name for it. src/shared/sections.ts is where the sections and their names are written.`,
    )
  }
  return t(sectionTitleKey(kind, key), { kind: kindWord(kind).text })
}

/**
 * THE WORD-LIST KEY A SECTION'S TITLE IS READ FROM, worked out here and nowhere else. Nine titles
 * differ by kind and carry the kind in their key. tests/every-section-title-has-a-word.test.ts
 * asks this for every section every kind declares, so a new section without a word fails there.
 *
 * A session's `detail` is how the run ended, and a context bundle's is how detailed its copy is. One
 * title for both called a session's ending 详细程度, "how detailed" (problem gyRw1dubpNbK's sweep).
 * A role card's words hold `standing` as where a person stands, and a module's is where the module stands.
 * An emergency push's `by` is who pushed, its `message` the chat message, its `switch` the switch row
 * (wave 13u round 82) and its `line` the line the fix came from; other kinds' fields of those names hold something else.
 */
export function sectionTitleKey(kind: RecordKind, key: string): WordKey {
  const specific = (key === 'summary' && (kind === 'module' || kind === 'report')) ||
    (key === 'attempts' && kind === 'problem') || (key === 'detail' && kind === 'session') ||
    (key === 'standing' && kind === 'role_card_words') ||
    (kind === 'emergency_push' && (key === 'by' || key === 'message' || key === 'switch' || key === 'line'))
  return ('record.section.' + (specific ? kind + '.' : '') + key) as WordKey
}

/**
 * WHAT ONE LINE INSIDE A SECTION CARRIES, when the line is not a component that takes `declares`.
 *
 * The five authored short forms are the case this exists for: each is a region of its own —
 * `data.shortForms.gist.text` — drawn as a plain paragraph inside the *Shorter forms* panel. A
 * right-click on an item in that panel used to fall back to the whole report.
 *
 * IT GOES THROUGH `declaredAttributes` LIKE EVERY OTHER DECLARATION, so there is still one function
 * in this product that writes a `data-target`.
 */
export function theRegion(recordId: string, regionId: string): Record<string, string> {
  return declaredAttributes({ about: { kind: 'region', recordId, regionId } })
}

/**
 * WHAT A ROW NAMING ANOTHER RECORD DECLARES: THAT RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A linked record reference has to stay identifiable as a linked semantic object, and carry enough
 * context to suggest a recipient or an agent.
 *
 * Measured on 30 August 2026 across the five records the owner's gate names: 120 anchors whose address is
 * another record, 4 of which resolved to the record they name. The other 116 resolved to the record
 * they were PRINTED ON, because nothing between the anchor and the page said anything at all.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE `{about: Target}` ARM, WHICH HAD NO CALL SITES UNTIL NOW
 * ---------------------------------------------------------------------------------------
 *
 * `Declares` has said since it was written that a container drawn FOR one thing declares that
 * thing, and its own header names the case: *"A panel whose heading is a record's title answers
 * this and never the one above."* A link row is that sentence exactly. Nothing had ever used the
 * arm, so this is the declaration being used rather than a new one being invented.
 *
 * ---------------------------------------------------------------------------------------
 * A COMMENT LEFT ON ONE NOW BELONGS TO THE RECORD IT NAMES. THAT IS A BEHAVIOUR CHANGE.
 * ---------------------------------------------------------------------------------------
 *
 * A review collects what is filed against the thing it is about, and the thing is now the LINKED
 * record — so a note written on a link row appears in that record's review scope and not in the
 * scope of the page it was written on. That follows from naming the linked object and there is no
 * version of this fix without it. `Context.drawnIn` is what keeps the page it was written on from
 * being lost: the row sits inside the relation's region, and that region names this record.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROJECT COMES FROM THE PAGE'S OWN RECORD, MEASURED RATHER THAN READ OFF A GLOBAL
 * ---------------------------------------------------------------------------------------
 *
 * A link joins two records of one project — `checkLinkKinds` never writes one across a boundary —
 * so the record at the other end is in the project the page's record is in. That is a fact about
 * the link, and it is read from the record the caller is drawing rather than from
 * `currentWorkspace()`, which is a fact about the address bar.
 */
export function theLinkedRecord(recordId: string, workspaceId: string): Declares {
  return { about: { kind: 'record', recordId, workspaceId } }
}
