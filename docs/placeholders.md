# Placeholders and what work may not claim

How something deliberately unresolved is kept unresolved, and how the work around it is stopped from
claiming more than it can.

## A placeholder

A **placeholder** is a slot in the work that is deliberately unresolved, and a statement of what
that stops the project claiming. It may carry a temporary substitute — a value made up to get a
pipeline running — and it does not require one. Its incompleteness and its validity boundaries are
explicit.

You file one when you decide to continue past something that is not settled or not measured: a value
invented to get moving, a section left until the hardware trial, an implementation nobody has
written yet.

The point is not the substitute. The point is that everything downstream knows what it may not
claim.

## A fallback: what ran instead

A **ran_instead** record says the canonical method for a step is one thing and the thing that
actually ran was another.

**The canonical method is not changed by this record and must not be.** A fallback may preserve
execution; it does not prove the canonical method works. File it before the result is used for
anything.

This is the sixth engineering rule written as a record kind: substituting a method and reporting
success is forbidden, so when a substitution happens it is recorded as a substitution.

## Restrictions, and re-checking after one lifts

A placeholder puts a limit on the work in its scope. Ask what limits a record or a whole module and
the answer names the placeholders that reach it and how far away each one is.

When a placeholder is resolved, the work that was limited by it does not silently become valid.
Rows are written for each piece of work that has to be looked at again, and each is judged
explicitly — *not affected, with a reason* is an answer, and so is *nobody has judged this yet*.

The restore proof compares these rows, including the case of a judgement made after the resolution,
so this history survives a backup.

## Where you meet them

The `placeholders` page in the browser holds both: what has deliberately been left unresolved, and
what ran when the agreed method could not. They are on one page because they answer the same
question — **what this work may not be used to claim.**

Context bundles put that answer above the content rather than below it.
[context-bundles.md](context-bundles.md).

## Status

The kinds, the restriction reading and the re-checking rows are built. **No placeholder has been
filed in this project yet**, so nothing here claims the workflow has been exercised on real work.
Checked 27 August 2026.
