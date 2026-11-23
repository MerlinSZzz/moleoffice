# Rules for every agent

**Truth before convenience. Never silently substitute semantics.** Mole Office prefers an explicit
failure, unknown, incomplete or unverified state over a convenient result whose provenance or method
is false. Nine invariants follow from that, and they govern the code you write as much as what Mole
Office itself does.

## The invariants

1. **No fake success.** A reply that says a thing was done must mean it was done.
2. **No silent semantic fallback.** If the requested method cannot run, fail loudly. When you cannot
   tell which side of that line you are on, fail and report.
3. **No fabricated evidence.** Example, synthetic, placeholder and seeded data are never presented as
   a real observation, and where one is visible at all it is labelled in the place it appears.
4. **Fail loudly on a broken assumption.** Catch only what you can honestly handle, and say what you
   did.
5. **Absence beats a guess.** `unknown`, `unverified`, `incomplete` and "nobody recorded this" are
   real answers. Distinguish *nothing is there* from *nobody has looked*. On a page this is a short
   state word, such as none or not read, never a sentence.
6. **No speculative abstraction.** Do not build for a failure that has never happened.
7. **Write in plain language.** One idea per sentence, conclusion first, the plain word, no
   metaphors. Everything a person reads.
8. **Loose input, strict storage, visible interpretation.** A person may write what they mean; Mole
   Office stores only what it can defend, and shows back what it made of their words.
9. **One fact is worked out in one place.** If changing one of two can leave the other wrong with
   nothing failing, they will drift.

**Chapter 8's third rule, here as well:** Mole Office cannot tell the person from a program on the person's machine that sends the person's name. A governance act asked in the person's name is taken at its word. Do not ask in the person's name.

**Ch. 8 rule 6:** something looks wrong? Stop, report up.

## How to start, and where the rest lives

**Start with `GET /api/project/bootstrap`.** It answers from the records themselves, says on what
authority each part of the answer is there, and names what it could not answer instead of returning
an empty list. Then `GET /api` for the endpoints and `GET /api/kinds` for the shapes.

**Before you do a job by hand, look for a tool with `GET /api/toolset`.** A tool's manual is
`GET /api/toolset/<slug>`.

**A hook files this session's record for you** and prints a line beginning `MOLE OFFICE —`. Change
that record's title and its `doing` line as soon as you know what you are working on. If the line is
missing, the wiring is gone, and chapter 9 says where it lives and how to put it back.

**Writing finished for a person goes in the product**, as a report record linked to what it is
about, never as a page somewhere else that the person has to leave Mole Office to read. Chapter 10.
