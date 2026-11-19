# The implementation map

How project meaning is joined to code, without either one pretending to be the other.

## Three things, and the joins between them

1. **A record** — a module, a block, a problem. It says what something *means*.
2. **A repository** — a checkout on this machine, or a repository named with no checkout here. A
   repository with no root is a real state: it can be named, hold relationships and be read, and it
   cannot be scanned.
3. **A source index** — files, their language, size, what each imports and exports, when each last
   changed. Built by scanning. **Derived: rebuilt, never edited**, because the next scan would
   delete anything anybody typed into it.

## Every join says where it came from and how strongly it is held

Read on 27 August 2026 from this project's corpus, on a module joined to a route file:

```
pattern:    src/server/api/queries.ts
relation:   implements
provenance: declared
authority:  stated — "somebody said this on purpose. It counts as ownership."
```

The other authority is a guess: the product worked it out, it is shown as a guess, and it counts as
ownership only once a person accepts it. Accepting one is its own act, and the change is kept. The
restore proof compares all three cases — a stated relationship, an un-accepted guess, and a guess a
person accepted — so the difference survives a backup.

**A guess that nobody accepted is not ownership.** That is the fifth operating rule again: the
product distinguishes what it worked out from what somebody said.

## What the join answers

- **Unclaimed code** — files no module has taken responsibility for.
- **Stale claims** — modules pointing at paths that are no longer there.

Those are the same shape as the unconsumed-results question one level up, asked about a codebase
instead of about results.

## The rule that makes the split worth having

**The scan is right about what exists. The module is right about what it means.** The index is never
canonical and never hand-maintained; the module is never scraped from the code. When the two
disagree about a file, that disagreement is the finding — do not edit either one into agreement.

## The index is per project, and it is not built until you build it

Each project holds its own index, because a project describes its own checkout. Another project
having one is not this one having one.

It is not built on read, on purpose: a scan triggered by a read would make "when was this built"
always answer *now*, and an empty file list would read as "this repository has no code".

Checked 27 August 2026 on the corpus this campaign serves: the index for this project is not built,
and asking for coverage says exactly that, names the command that builds it, and answers nothing
else. That refusal is the product working.
