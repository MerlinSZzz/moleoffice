# Concepts

The words this product uses, and what each one means. Get these right first; most confusion about
Mole Office is a confusion about one of them.

## An Office

An **Office** is a durable project environment shared across temporary workers.

Skills help a worker do something. Harnesses guide a worker while it works. An Office keeps the
project coherent after that worker is gone. The project is the thing that lasts; the worker is not.

## The two layers

Mole Office keeps two layers, and only one of them is in Mole Office.

| Layer | What is in it | Where it lives |
|---|---|---|
| The archive | Reports, code, CAD, raw data, notebooks, images | Your project directories, exactly where they already are. Never copied. |
| The tracking layer | What each of those things is, what it means, what it is waiting on, and who decided what | Mole Office |

The tracking layer is deliberately small. It is the part a person has to hold in their head, so
anything that can stay in the archive stays there and is referenced by path.

## A record

A **record** is any single thing the project knows about: a problem, a claim, a decision, a session,
a module, a report, a block, a placeholder. Every record has a kind, and the kind decides what
fields it takes. One table holds them all.

Ask the running product for the list of kinds — `GET /api/kinds` — rather than trusting a list in a
document. New kinds arrive; documents go stale.

Why one table instead of one per kind: a review of this project found that each new record type
otherwise has to be handled in about ten places, and with a dozen-odd types that repetition was two
to three weeks of work producing nothing new. With a shared base, adding a kind means adding one
name to a list.

## A link

A **link** is a typed relationship between two records: *this problem is about that module*, *this
claim contradicts that one*, *this block blocks that block*. Links are stored once, in one
direction, and the reverse wording is shown rather than stored — two rows meaning the same thing
would eventually disagree.

`GET /api/kinds` serves the link types with their forward and reverse wording, and says which of
them may carry a gate.

## A project

A **project** is the boundary every record, link and change row belongs to. Every request names one.
A request that names none is answered from the default project and told so.

A project is not a folder and not a repository. A project can span several repositories, and one
repository can carry work for several projects.

## A module, a block and a pipeline

This is the one piece of vocabulary worth getting right before anything else.

- A **module** is a subsystem: a thing you would write a separate report about. It has its own
  checklist, its own findings, and it claims paths in a repository.
- A **pipeline** is an ordered set of blocks.
- A **block** is one step of one pipeline, and it is **its own record**, with its own id, its own
  history and its own age.

A block is created through its pipeline, and a bare "create a block" is refused with the route to
use, because two facts about a block live on the pipeline and nowhere else: its position in the
order, and the pipeline half of its title.

**Which modules carry a block is a many-to-many relationship**, recorded as `implements` links from
the module to the block. It runs both ways and neither side contains the other. Measured on the live
database on 11 August 2026, when the product was called PanelX: of 67 blocks, 12 were carried by no
module, 35 by one, 15 by two, three by four, one by five and one by eight; one module carried ten
blocks. **A block carried by no module is a real answer**, not a gap to be filled, and the pipeline
page draws it as a band with words in it rather than as a blank row.

Blocks became records so that a problem, a claim, an idea or a measured timing could attach to the
step rather than to whatever implements it. That was structurally impossible before: a link's two
ends are foreign keys to records, and a step used to be an object nested inside a pipeline's JSON,
so nothing could point at one.

### The old word has not finished leaving

Measured 11 August 2026: nine files in the drawing layer still said *step* where they now mean
*block*, and two server refusals an agent will meet still say step. The sharper case is that the
published note for creating a link was corrected to say "a block id" while the refusal that same
rule produces was not — so the note and the message a caller provokes disagree about the word. This
is the repository's own recurring defect: one fact worked out in two places.

## The layers of a module

| Layer | Lives where |
|---|---|
| Structure — identity, checklist, states, links | Mole Office |
| Curated summary — the findings worth knowing, with charts, media and equations | Mole Office |
| Full report and materials — code, CAD, raw data | your project directory, referenced by path |

## Curated and derived

A module is the **canonical** description of a subsystem: what it is responsible for, what state it
is in, what was decided about it and why. It is curated, by a person or by an agent, and it is meant
to be stable. A module survives a refactor that moves every file it covers, because what it
describes is not the files.

Under it sits a **source index**, built by scanning a repository. It is **derived**: rebuilt, never
edited, because the next scan would delete anything anybody typed into it.

**The scan is right about what exists. The module is right about what it means.** When the two
disagree about a file, that disagreement is the finding — do not edit either one into agreement.
[implementation-map.md](implementation-map.md) has the rest.

## Complete, incomplete, unknown

A field the schema marks required is required for a record to be **complete**, not to create it. A
record may be filed with a title and nothing else. It is stored, and it counts as incomplete until
the rest arrives.

That is deliberate: the record that is never written is the one nobody can see is missing.

Completeness is computed on every read from the same field declarations the write path enforces, so
there is no stored flag to go stale.

`unknown`, `unverified` and "nobody has looked" are answers, not failures. Mole Office keeps
*nothing is there* apart from *nobody has looked*, and says which one it means.
