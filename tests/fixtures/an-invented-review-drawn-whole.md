# Round two of the allotment planner, reviewed

> **This review is invented for a test.** Nothing in it happened. Every name, number and quotation
> in it is made up, and it stands in for a long review somebody really wrote, with the same shapes:
> wrapped bullets, a table in the middle of a section, section breaks and three heading levels.

**One review, at the end of one pass. Nothing here needs a decision from you to carry on — it is a
report on what the planner does now, what four volunteers found when they used it, and what is
still wrong.**

Your notes are kept whole beside this review. Everything below was counted; where a number
appears, somebody measured it.

---

## The short version

**Your season closes now.** Every arrow in it has a screen:

> rough sketch → beds and rows → a neighbour's comments → sowing becomes dated work →
> the whole site's calendar → Month/Week/Day → Today

The step that was missing entirely is the third and fourth: a sketch connected to nothing. Both
routes that would bind a row of seeds to dated work existed and **no button in the interface called
either**. They do now, and sowing a row keeps the bed you drew it in.

**The thing I would fix first if you only read one paragraph:** four gardeners who had never seen
the planner were given it with no manual and asked to plan a spring. Three of them typed their
whole plan into the bed's *label* box, because it was an unmarked text area sitting where a title
goes. One lost 1,204 characters and every newline, and the page said "Saved." That is fixed, and
finding it was worth more than the rest of the testing put together.

---

## What each thing you named does now

### The bed editor

| You said | What it does now |
|---|---|
| *"I still want plain buttons such as Save and Back"* | **Save now** and **Back** are there. Background saving stays and keeps its quiet status line. Save now says what it did, including *"Nothing to save. Every letter was already kept."* **Ctrl+S** works. Back refuses to leave with words unsaved and says so |
| *"the new-bed form pops up in the far corner"* | Confirmed in the code — the button and the form were both children of a stretched header, so the form landed about 1,040px from the title. It opens where you pressed now |
| *"the second pane … repeats the first"* | The second pane is no longer the same text again. It opens on **the plants in this bed** — every row at the depth you wrote it, which are dated work, what stage, how many weeks — and it is where *Make it dated work*, *Point at a sowing that exists* and *Give it a week* live. It switches to the drawn sketch, and **it folds away**, which gives the whole width to writing |

**Your reason is quoted in the code**, because it travels well: an interface should not remove a
useful control merely because the automatic mechanism usually works. It also reverses a rule round
one settled — a bed had no Save and no Back on purpose. Both design notes now say why it changed.

### The grid

**A row is a planting, not a stored line.** Blank lines and remarks are no longer rows, a heading no
longer shows its hashes, and depth comes from the indentation you already type. Parents fold. One
press flattens everything and moves the bed's path into its own column, which is how you see every
level together when choosing dates.

Names, tick boxes, durations and remarks are edited in place. **Editing a name rewrites the
sketch** — there is one store and two readings of it.

That last sentence was false when I first wrote it, and a careful checker proved it in a browser:
a grid edit reached the server, the writing box went on holding the old sketch, and the next
keystroke saved the old text back over the edit, silently. It is repaired and pinned by a browser
test that fails if it returns.

### Seasons, coarse to fine

`grows_in` already existed among the link words — *"grows in"* forward, *"holds"* back — so nothing
new was invented. What did not exist was **one reader**: belonging is stored three ways (an ordered
list for rotations, a checklist for beds, a link for everything else) and nothing joined them. Now
one function answers *where does this grow*, and it is the only code that knows about all three.

**Three numbers worth knowing before judging the calendar.** Of 164 plantings on the site,
**none has a harvest date**, **4 have ever been given weeks**, and **the deepest nesting is 2**.

---

## How the volunteers were chosen

Four members answered a notice pinned beside the water butts: a retired teacher, a nurse working
night shifts, a student studying chemistry and a carpenter who keeps bees. None had opened the
planner before. Each was handed a borrowed laptop, a printed list of seventeen tasks and a mug of
tea, then left alone for ninety minutes with a camera recording the screen. Afterwards each one
described, in an interview of about twenty minutes, which moments felt confusing, tedious,
reassuring or genuinely delightful. Their recordings were watched twice, once quickly for obvious
blockers and once slowly, pausing whenever somebody hesitated longer than five seconds.

Their tasks covered sowing broad beans, rotating potatoes away from last year's ground, sharing
a greenhouse shelf, borrowing a wheelbarrow, logging rainfall, flagging slugs, ordering compost,
cancelling a delivery and printing a laminated sign for the gate. Nobody finished every task; the
quickest finished fifteen, the slowest eleven.

---

## What four volunteers found

### Their own words

> *"Yes, I would use this over a notebook and a spreadsheet — which surprised me. A spreadsheet
> cannot refuse to plant two crops in one bed, and this does."*

> *"I lost my plan four times, and three of those times the page said Saved. at that moment."*

### The rest of the list

- **Home is per gardener.** Today and this week, above the weather band, across every plot.
  It also stopped opening on the wrong plot: a browser that had never chosen one landed on an empty
  corner and was told *"Nothing needs watering"* while the next plot held 37 seedlings needing water.
- **Crops have colours.** Five families — not twenty varieties — as a mark and a coloured edge on
  the one label component, so every place that draws a label inherited it together.
- **Density.** Four pages had their headings, label columns and row heights brought into line;
  *Unused seed packets* was the worst and was the one no earlier pass reached.
- **Plain versus Expert.** One vocabulary layer every stored word passes through, and a check that
  fails when an internal code or a storage name reaches a Plain screen.
- **Menus.** Two named groups: what you have to do, and what this plot holds. *Jobs* was the last
  label naming a mechanism; it is *Garden work* now.
- **A planting can be moved between plots**, and a plot can be created — neither was possible.
- **Names.** Every lookup that turned a name into a planting now refuses when more than one
  answers, naming every candidate. **The unique rule deliberately stays** until that holds
  everywhere; dropping it early would have turned loud refusals into quiet wrong writes.

---

## What is still wrong

Nothing here is hidden, and none of it blocks the season.

1. **Two windows open on one bed still overwrite each other.** The page no longer *claims* a state
   it has not checked, but the conflict underneath is untouched.
2. **A planting page still prints stored shapes** — a frost date shows a bracketed object.
3. **The day view has no plot chooser.** The week and the month got one; the day did not.
   - The chooser is built for the week and could be borrowed.
   - Borrowing it means the day must read two plots at once, which nothing tests yet.

---

## What only you can decide

- **What the shared corner should be called**, and whether a **Personal** plot should exist.
  The mechanism is built either way: you can create a plot and move plantings into it.
- **Whether a harvest date belongs on the planting or on the bed.** It is on the planting today,
  and the reason is written on screen: a date on the bed would let two rows disagree.

---

## How to try it

The planner is running. Open it, press **Beds**, and write something real — headings, nested
bullets, a numbered list. Then press **Grid**, sow two or three rows as dated work, and give one of
them a week in this month. Then look at **Today**.

If anything puzzles you, write a remark straight onto the screen where it happened; remarks are
gathered quietly and nobody acts on them until you press **Finish**. Expect rough edges around
autumn pruning, irrigation timers and frost warnings, which arrive in the third round.

```
npm run planner -- --port 4100
```

#### A smaller heading, for the fourth level

Volunteer sketches named `bed 1`, `bed 2` and `bed test` held no rows at all and were deleted.
