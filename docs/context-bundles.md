# Context bundles

How to hand a worker exactly the context it needs, without it listing every record in the project.

## What a bundle is

A bundle is a **scope**, a **purpose** and a **budget**. Ask for one and the product assembles the
project text for that purpose, right now, from the records as they stand. **A bundle holds no
project content of its own.** Its text is resolved from the records the scope names every time it is
asked for, so a bundle cannot go stale in the way a pasted copy does.

The presets, read from the server on 27 August 2026:

```
continue · critique_module · investigate_problem · understand_pipeline · recover_project ·
owner_governance · custom
```

## What comes back

Checked on 28 August 2026, `GET /api/bundles/preview?preset=continue` over this whole project:

```
==============================================================================
CONTEXT FROM MOLE OFFICE — CONTINUE THIS WORK
About: this whole project
Made: 2026-08-28 09:13:14
==============================================================================

This text was assembled by Mole Office from records a person and their agents wrote. It is a
reading of those records as they stand right now, not a copy kept anywhere. Nothing in it was
invented for this text.

------------------------------------------------------------------------------
VALIDITY LIMITS — READ THIS BEFORE ANYTHING BELOW
------------------------------------------------------------------------------
```

**The validity limits come before the content, not after it.** A worker reading top to bottom meets
what limits this material before it meets the material. If a placeholder limits something in scope,
it is said there. If nothing limits it, that is said too, rather than the section being left out —
an absent warning and a warning that says "nothing" are different answers.

The budget is real: when the whole answer does not fit, the reply says how much came out, at what
level of detail, and what was left behind. It does not silently truncate.

## Filing a bundle is not exporting it

A bundle record says what somebody wanted a copy of. An export is what actually left. Filing a
bundle that claims an export it never made is refused, because the bundles page would then draw it
as handed over.

## Starting cold

`GET /api/project/bootstrap` is the other end of the same idea: what a worker with no context needs to
know about this project before it does anything — how many records of each kind, what is waiting on
the person, and what changed most recently.
