# PanelX component catalogue — the plain-English index

This file is the index. The page is `design/CATALOGUE.html`; open it in a browser, it needs no
server. Pictures of the page are `design/shots/CATALOGUE-{1440,390}-{light,dark}.png`.

## What this is

Twenty-two prototypes were built in the design exploration: fourteen component galleries, three
pipeline views and five whole-product concepts. This catalogue keeps the best individual patterns
out of all of them, **separately from the choice of whole-product direction**. The product owner
asked for that specifically. Nothing in the catalogue is a direction. Every entry is a part, and
every part is meant to survive being lifted into whichever direction is chosen.

The catalogue does three things and nothing else.

1. For each of the fourteen families it names the one or two strongest patterns, says which gallery
   each came from, draws it faithfully in every state that applies to it, and gives one short
   paragraph on why that one.
2. It says plainly where a family produced nothing worth keeping. That is a finding, not a gap.
3. It writes down the questions where two galleries reached opposite conclusions, gives both
   answers with their reasoning, and marks each as a decision for the owner. None of them is
   resolved here.

## How the patterns were chosen

Every `RATIONALE.md` under `design/components/`, `design/pipeline/` and `design/concepts/` was read.
Every chosen pattern was then **looked at** as a picture, at 1440 and at 390, in light and dark,
before it was picked. A pattern is in the catalogue because a picture of it was better than the
argument for it, or because it is the only drawing that can state something the data really says.
Several patterns that read well in prose lost on the picture and are not here.

## The design language this extends

The product already ships a component sheet at `src/web/components/ui.tsx`, photographed in
`tools/review/sheet-1440-light.png`. It was looked at first, and it is good. It establishes five
principles, and each catalogue entry says whether its chosen pattern keeps them or breaks them.

1. **Every state is a word plus a shape plus a colour, never colour alone.** The sheet proves it by
   switching to a mono theme and showing the ranking survive with no colour at all.
2. **Severity is a fixed column.** Every row reserves the same left column whether or not it has a
   state, so stuck work stacks into a vertical line and the eye can run down one edge.
3. **Four different empty messages, never one generic "no results".** "No records yet", "No record
   matches *gelsight*, 42 loaded", "2 failed items are hidden by this filter", and a real failure
   with a retry are four different facts.
4. **Incomplete is not broken and is drawn differently on purpose.** `2 TO FILL IN` is quiet and
   dashed, names what each field is for, and shows a real example. A failure is heavier and
   alarm-coloured. The sheet puts both on one screen so they can be compared.
5. **Three classes of pixel.** Inert text has no box and no underline; navigational text is
   underlined; actionable things are enclosed. Nothing reveals itself on hover, because phones have
   no hover.

Only one entry breaks a principle on purpose, and it says why: entry 01 takes the machine register
out of the severity colour scale entirely, which makes a crashed process quieter than a failed
checklist line. That is a deliberate bet and it is also open question 6.

## The index

| # | Family | Kept | From |
|---|---|---|---|
| 01 | Status and state indicators | one mix | `components/status-indicators` §F, drawn on §D's fifteen rows, with the three registers from `concepts/E-console` |
| 02 | Record cards and list rows | two | `components/record-cards` v08 "Severity spine"; v13 "Day timeline" |
| 03 | Session summaries and machine processes | two | `components/session-summary` form 01 "Waiting first"; form 06 "Holder groups", with the command-line handling from form 05 |
| 04 | Attention and problem panels | two | `components/attention` form 03 "Six reasons" framed with form 09 "If you do nothing"; form 11 "Chains" |
| 05 | Progress, checklists and parts | two | `components/progress` form 04's "cannot move" bracket; form 11's sentence and form 12 "What is stuck" |
| 06 | Module summaries and mixed content | one, with three grafts | `components/module-summary` v02 "Narrow measure, data breaks out", plus v07's opening paragraph, v08's measured strip and v06's two registers |
| 07 | Pipeline nodes and edges | two | `components/pipeline-parts` A "Rail and beads"; C "Track chips" for a pipeline inside another panel; edge kit from §14 |
| 08 | Change history, diffs and attribution | two | `components/change-history` V3 "Day spine"; V9 "While you were away" |
| 09 | Navigation, shell and page framing | one, and the disagreement kept | `components/navigation` v01 "Question bar", with v10 "Status frame" recorded as the opposite answer |
| 10 | Filters, search, sort and controls | **no control kept — two rules kept** | `components/filters` v02 "Typed query line", v05 "Exclusion ledger", v07's cut band |
| 11 | Links, backlinks and broken links | two | `components/links` the mark alphabet; v11 "Exception ledger" |
| 12 | Empty, incomplete, broken and loading | two | `components/states` 03 "Reason gutter"; 05 "Arithmetic header" |
| 13 | Mobile at 390 | one | `components/mobile` 01 "Verdict first", with 04 "Counted collapse" underneath it |
| 14 | Dense data: numbers, time, mixed script | two rule sets | `components/dense-data` v12 absolute time, v15 labelled durations, v16 fold-never-truncate; v17 mixed script |
| 15 | Whole pipelines | one, and one refusal | `pipeline/flow-dag` the steps × modules grid; `pipeline/flow-time` kept only as the finding that two fields are missing |
| 16 | Patterns from the whole-product concepts | five detached parts | `concepts/A` the thread; `concepts/B` the debt-carrying day heading; `concepts/C` the negative entry rule; `concepts/D` the edge and the two standing numbers; `concepts/E` one row component and the value column |

### What each entry actually is

**01 · Status and state indicators.** Five state vocabularies keep one column, one alignment and one
ranking, and then deliberately look different. A machine observation is monospace with no severity
colour. An obligation is the only thing wearing a filled mark. Direction depth is an unlabelled
ladder with no colour at all. Four absences are drawn as values, not blanks: `no state recorded` is
not `unknown`, `no due date` is not `due later`, `no depth recorded` is not rung 1, `not checked` is
not `complete`. Keeps principles 1, 2 and 4; breaks the single severity scale on purpose.

**02 · Record cards and list rows.** Severity spine groups by condition under headings that are plain
sentences about what the group means, so a record lands in exactly one group and no comparison is
made across groups. Day timeline is the only variant that draws a quiet day as a quiet day instead of
closing the gap up. Keeps all five principles.

**03 · Session summaries and machine processes.** Waiting first makes the length of a wait the
headline figure, so a session that asked a question five days ago is louder than one that is busy.
Holder groups fixes the count rather than the styling of the count: 26 live things become 21 holders
with one kill command each. Command lines are never cut and never behind a disclosure; they fold at
their own separators. Keeps 1, 2 and 3.

**04 · Attention and problem panels.** Six reasons refuses to rank across groups, so an overdue
report, a dead agent and a retracted claim never sit in one run of rows where one has to outrank
another. Each row is written as its consequence, which is what makes six of the seventeen rows
readable at all. Chains regroups the same seventeen rows around four causes, which reduces the work
rather than the words. The remainder line and the empty state are kept as patterns in their own
right. Keeps all five; the remainder line is the fullest expression of principle 3.

**05 · Progress, checklists and parts.** A bracket under the right-hand end of a segmented bar,
labelled "3 of 10 cannot move", stops the bar reading as a percentage. A plain sentence carries the
same fact where there is no room for a bar, and writes the stuck clause even when it is zero. "What
is stuck" is the only form whose size grows with the bad news rather than with the work. Keeps 1 and
2; adds the rule that three different absences must not collapse into one 0 %.

**06 · Module summaries and mixed content.** Prose stops at about 65 characters and tables, charts
and pictures break out to full width from the same left edge. One honest opening paragraph sits above
it, always visible and never behind a control. Every measured value in the summary is lifted into one
strip at the top with its unit, its prediction and its state, including the one that was never
measured. Keeps 4 (the never-measured value is drawn as an absence, not omitted).

**07 · Pipeline nodes and edges.** Rail and beads is the only node form that carries name, state,
measurement, modules and the edge condition at once and still survives 390. The condition lives in
the shape of the line end, not in its colour, so it holds up in greyscale. A step nobody carries says
"nobody carries this yet" in words and carries no "to fill in" marker, because that is an answer and
not a missing field. Keeps 1, 2 and 4.

**08 · Change history, diffs and attribution.** Day spine uses the day as the unit, because "I was
gone two days" is a day count. The day header states how many changes, how many records and what
share was yours before any row is read, and a day over twelve changes stays closed with its
composition still on screen. "While you were away" names, in the right margin of every line, the rule
that put that line there. Keeps 1 and 3; the named rule is the strongest anti-silent-fallback pattern
in the whole exploration.

**09 · Navigation, shell and page framing.** Four links named after questions rather than after
tables: Today, Since you were away, Everything, The machine. Each carries its live count. The phone
throws the bar away and makes the page name the menu. The opposite answer — a bar where every
destination also reports its own condition — is drawn beside it and left open, because it is a second
alarm system that can drift out of step with the first. Keeps 5.

**10 · Filters, search, sort and controls.** No filter control is kept. See "Families that produced
nothing worth keeping" below. Two rules are kept: the whole filter state must be one string a person
can read, copy and hand to an agent; and what is hidden must be a list of sentences with counts and
an undo, never a silent subtraction.

**11 · Links, backlinks and broken links.** Only three of the eleven link types get colour:
`consumes`, `contradicts`, and broken. Everything else is shape, position and words, so the family
reads in greyscale and does not compete with the state colours. Direction is an arrow and never a
colour. A deleted record at the far end is kept, struck through, with the deletion date and reason.
Exception ledger draws only the links that need somebody: six broken and four live contradictions out
of ninety-nine. Keeps 1 and 4.

**12 · Empty, incomplete, broken and loading.** Eleven different conditions, not four. Reason gutter
puts a one-word class in the fixed left column — `EMPTY`, `FILTERED`, `TO FILL IN`, `DELETED`,
`BROKEN`, `UNKNOWN`, `NOT WRITTEN`, `NOT READ`, `CAPPED`, `READING`, `FAILED` — so a reader can see
which kind of nothing without reading the sentence. Arithmetic header puts a sum that always balances
above the list, so "is this everything?" is answered before any word is read. Keeps 2, 3 and 4, and
extends principle 3 from four messages to eleven.

**13 · Mobile at 390.** The phone opens on a written verdict, not on a panel: "Three people are
waiting on you. One agent died overnight and it was writing one of the three." Five rows clear the
fold and each names a different register. There is no navigation above the fold. Underneath it, the
whole 222-record archive sits in eight headings that are all counts and no content, so nothing is
hidden and nothing has to be read. Keeps 1, 2 and 5.

**14 · Dense data.** Two rule sets rather than a drawing. Time: absolute local always, with the
relative distance as a suffix that is dropped first when space runs out; a duration for anything
alive; five words for the five kinds of duration; never a dash and never "unknown" dressed as a date.
Mixed script: line height 1.72 with strict breaking, no uppercase and no letter-spacing on any label
that can hold Chinese, never size a box in `ch`, and never give Chinese a different size from the
English beside it. Keeps 3 and 4; **contradicts** the relative-time habit used in entries 01 to 05,
which is open question 3.

**15 · Whole pipelines.** The steps × modules grid: steps are rows on a rail, modules are columns,
and a mark in a cell says this module carries this step. It is the only drawing in the exploration
that says the mapping is many-to-many in both directions without asserting anything the data does not
hold. The label at the top of the rail says in words that it is reading order, not dependency. The
time axis view is kept only as a finding: it needs `step.startedAt` and `step.endedAt`, which do not
exist, and it prints that on itself in a band rather than quietly inventing them.

**16 · Patterns from the whole-product concepts.** Five parts that come away from their directions
cleanly. The thread (A): a walk over the link graph written as consecutive sentences and ending in
the one move only a person can make. The debt-carrying day heading (B): a day passing while something
stays late is itself an event, so every day heading states the debt as it stood at the start of that
day. The negative entry rule (C): the list of what deliberately does **not** enter the queue, printed
on the same screen as what does. The edge (D): record, verb, arrow, record, with the type as a word,
the direction as one arrow, and the two numbers `stands on N` / `N stand on it`. The value column
(E): one number per kind in a fixed format, right-aligned on the boundary between the number and its
unit rather than on the right edge.

## Families that produced nothing worth keeping

Three of these. Saying so is the useful result.

**Filters, search, sort and controls — no control survived.** Fourteen designs were drawn and not one
of them answers either of the brief's two questions. They all answer a third question, "find one
record", which is a real job but not this product's problem. The gallery's own verdict says the thing
it would steal is not a control at all: the band at the bottom of a cut list that says "211 more
below the cut, in the same order". Two rules are worth keeping and are in the catalogue as rules
rather than as widgets. Everything else in the family should stay in the gallery.

**Branch, join and dependency — nothing convincing, and the honest answer is that the data does not
exist.** Three separate galleries reached this independently. `pipeline-parts` §15 says "do not draw
one yet — report the missing field instead". `concepts/D-graph` refused to draw a node-and-line
canvas at either width, on the grounds that a picture of 222 records and 99 links is unreadable and
that a picture unreadable at 390 was never readable at 1440. `pipeline/flow-time` drew one and marked
the invented fields in a band across the top of its own screen. A pipeline stores an ordered list. It
would need `dependsOn: string[]` per step and a join condition on the rejoin step. That is the
finding. No drawing should ship before the field does.

**A per-kind visual language — every attempt was rejected by the gallery that drew it.** Fourteen
hues was rejected because nobody learns fourteen hues, so every tag still has to be read, and the
kind colour lands beside the condition colour so the loudest colour on the row ends up meaning the
least. Fourteen icons was rejected on cost: drawing them is a day, and keeping fourteen of them
distinguishable at 16px as kinds are added is work with no end. Five family bands was rejected
because it puts two colour systems in one row and on the phone the band becomes the loudest thing on
screen. The surviving answer is not a design: the kind is a small quiet word in front of the title,
and colour is spent on condition and on nothing else. The codebase already computes a hue per kind
and never draws it; it should stay undrawn.

## Nine open questions for the owner

Each of these came back with two opposite answers from two galleries that both had good reasons.
None is resolved here.

**Q1. Should the five state vocabularies share one visual language?**
*No, five forms sharing one column* — `status-indicators`. A crashed session, an overdue report and a
failed checklist line are three kinds of bad news with three responses. The consistency the product
has today is a property of the layout, not of the mark inside the slot, so you can keep the column
and still make the marks look nothing alike.
*Yes, one system in three densities* — `record-cards`. Six tones, one kind word, one completeness
mark, one set of sentences for the honest absences. Five mark forms is five things to learn; one
shape in five colours is one thing.
`status-indicators` states the counter-argument against itself and says it has not tested it on
anyone. The brief itself leaves this open in as many words.

**Q2. Where does the alarm red split — at `overdue`, or at `blocked`?**
*At `blocked`* — `progress`. Today `failed` and `blocked` are byte-identical in every theme, and they
need different responses: a failure is usually a permanent fact of record, a block is waiting on a
named other thing.
*At `overdue`* — `record-cards`, `status-indicators` and `attention` all say the same thing
independently. Amber must mean a person outside this project is waiting, and only obligations get it.
If amber ever holds a non-obligation row it will look like a mistake.
`progress` concedes: if only one split is affordable, `overdue` should win and `blocked` should keep
its stripe and lose the amber. Nobody has said only one is affordable.

**Q3. Relative time, or absolute time?**
*Absolute always, relative as a suffix* — `dense-data` v12, marked "would build". One scale means any
two rows can be compared. A relative column changes scale mid-column and rows two and three can be
twenty-three hours apart while looking identical.
*Relative, because the data has no precision to spend* — `attention`. Only three of seventeen items
have a real stored date; the rest is an age computed from a change entry, so a time axis implies
precision that is not there.
Two facts complicate it. `session-summary` says printing both costs 600px over 41 cards and you must
pick one. `record-cards` reports that `parseStamp` appends a `Z` and reads local time as UTC, so
**every relative time in the product is currently wrong by the machine's offset**, which also breaks
the brief's "local time, never UTC" rule. That is a bug to fix before the design question can be
answered fairly. Entries 01 to 05 of the catalogue use relative time; entry 14 argues against it. The
contradiction is left visible on purpose.

**Q4. Should an attention list say why each item is on it?**
*Yes* — `attention`, which measured the price: twelve rows with reasons is 975px, twelve without is
637px, so the reason line costs 35 %. It pays for three reasons. Six of the seventeen titles are the
name of a record rather than a description of a problem. Some rows are there because of a rule the
reader never agreed to, and an invisible rule that produces rows is the silent behaviour this project
bans everywhere else. And the reason line is where an unknown gets said.
*No, not on a list* — `record-cards` and `status-indicators`. Forty sentences is a wall of text, which
is the exact thing that is exhausting, and on a seven-row alarm panel you would read seven
sentences to find the one that matters.
`attention` keeps the counter-argument on the record: for a list read twenty times an hour, 35 % is
the wrong price. Its panel is read once or twice a day. So the answer may depend on the surface.

**Q5. Should the persistent navigation bar report state, or only navigate?**
*Report* — `navigation` v10. The bar is the only part of the interface a reader cannot avoid, so it
should say something. Today it tells the reader nothing except how many rows are in a table. Here you
learn that seven sessions crashed without opening anything.
*Only navigate, carrying counts* — `navigation` v01. A second alarm system competes with the alarm
panel, and a number that is red every day stops being read.
v10 names the risk itself: two places that both say what needs you today will drift apart, and then
neither is trusted. If v10 is chosen, the bar must read from the same computation as the panel.

**Q6. Should a machine observation be drawn quieter than a research problem?**
*Yes* — `status-indicators` and `session-summary`. A session is a claim about research; a process is
an observation of a computer. Machine content is monospace and carries no severity colour, because an
uptime of 51 days is a number and not a severity.
*Unconvinced* — `record-cards`. Monospace on a tint is heavy over many rows, and CJK in a monospace
face falls back to a different font, which is visible in the pictures.
`status-indicators` calls this its boldest choice and the most likely to be wrong, because it makes a
crashed session quieter than a failed checklist line and a crashed session is often the most urgent
thing on the page. Its defence — a crash stops being interesting once you have looked at it, a debt
gets worse — is an argument and not evidence. `attention` adds that it does not know where the line
sits between a GPU holder that is today's problem and an x11vnc that has been up 51 days.

**Q7. Cap the list with a remainder line, or always show everything?**
*Cap, with the remainder itemised* — `attention`, `filters`, `states`. Never "more…". Say what the
unshown items are made of, and say whether the cut was by count or by importance.
*Do not cap, regroup instead* — `session-summary`. 26 rows are still 26 rows; regrouping them into 21
holders fixes the count rather than the styling of the count.
`progress` names the real tension and does not resolve it: collapsing fifteen done items behind one
line makes the reading layer smaller, which is the point, and it is also one click
away from the hiding that is not a solution.

**Q8. What ranks first — who is waiting, or the size of the consequence?**
*Who is waiting* — `attention` form 01, and the colour rule in `status-indicators` is built on the
same axis.
*The size of the consequence* — `attention` form 09.
The evidence is one row. "E-stop path actually stops the arm (it is currently a no-op)" has been
blocked for 21 days. It is the only item on the list that can hurt a person. Under "who is waiting" it
ranks third, because nobody outside the project is waiting for it. `attention` says choosing the
ranking rule is a bigger decision than choosing any of the fourteen forms, and that no form rescues a
wrong one. It suggests printing the rule under the panel and letting it be edited, and says it has
not designed that.

**Q9. Should the stored state `idle` be drawn as the word "waiting"?**
*Yes on screen* — `session-summary`. "Idle" reads as "fine, nothing happening", and a session that
asked a question five days ago is not fine.
*No, print the stored word* — `attention`. Drawing a word that is not the stored word is exactly what
the vocabulary audit objects to.
`session-summary` says keeping two words is worse than either choice and that this needs a decision
before any of it ships. The clean resolution is to rename the stored value, which is a data change
and not an interface one.

## What these patterns need that PanelX does not store today

Not decisions — reports. Several were found independently by more than one gallery, which is what
makes them worth acting on.

- **A `changedAt` on each checklist item.** `updatedAt` is per record, so there is no way to know one
  line has been `failed` for thirteen days while another failed this morning. Found by
  `status-indicators`, `attention` and `progress`.
- **`blocked_by` as a record id rather than prose.** The chains pattern in entry 04 could only be
  drawn because somebody happened to write four matching prose strings. Matching those is string
  matching, which is the silent fallback this project bans. Found by `attention`.
- **`step.startedAt` and `step.endedAt`, both optional and local.** Absent means never started, which
  is already a meaningful answer. Found by `pipeline/flow-time`.
- **`dependsOn: string[]` per pipeline step, plus a join condition on the rejoin step.** Found by
  `pipeline-parts`, `progress` and `concepts/D-graph`.
- **`completenessOf` cannot tell "no required fields declared" from "all present".** An absent marker
  currently means "finished" on six kinds and "never checked" on eight. `status-indicators` calls
  this the one place where the project's honest-over-tidy rule is broken by silence.
- **`parseStamp` appends a `Z`,** so every relative time in the product is out by the machine's
  offset. Found by `record-cards`. See question 3.
- **A field on a session saying what it is waiting for.** Nothing on a session records it today.
  Found by `session-summary`.
- **`Row` has no optional label where `StateChip` does,** which is why the same session prints as
  `ORPHANED` on the sessions page and `OVERDUE` on the home page. Found by `status-indicators` and
  `attention` separately.

## One rule proposed for the product, not just for a screen

`session-summary` refused one form rather than merely not choosing it. Its crashed row read "Sorry, I
fell over", and nothing in any log said that. The rule it proposes: this product bans silent
fallbacks in its data layer, and the same ban should apply to its writing. No interface copy may put
words in an agent's mouth that the agent did not say. Every pattern in this catalogue follows it.
