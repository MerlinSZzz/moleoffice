# The project model

How a project is stored, and what a write is allowed to leave out.

## Three tables carry the tracking layer

| Table | What it holds |
|---|---|
| `records` | every thing the project knows about, of any kind, told apart by a `kind` column |
| `links` | typed relationships between any two records |
| `changes` | what happened, when, and who did it |

Every view of the tracking layer is a query over these three. Backlinks are a query on `links`. A
day or a week is a filter on `changes`, which is why no daily page is stored anywhere.

A project — a **workspace** in the database — is the fourth thing, and it is not a filter. It is its
own table, with a project id on every record and every change row, a header on every request, and a
selector on the screen. The other tables are listed in [architecture.md](architecture.md).

## Strict about keys and values, flexible about how much you have written

These are two different questions and Mole Office answers them differently on purpose.

**Strict about keys and values.** An unknown or misspelled key inside a record's `data` is refused
with a 400 that names the key and suggests the field you probably meant. It is never stored and then
quietly ignored by the reader — a record that looks filed but renders as raw JSON is the exact
failure this contract exists to prevent. The same refusal covers a value of the wrong type, a value
outside a field's declared vocabulary, a nested object written only halfway, a blank or
whitespace-only value, and a broken cross-field rule. **Nothing is stored in any of those cases.**

Checked 27 August 2026 against the running server:

```
POST /api/records {"kind":"module","title":"…","data":{"contxet":"typo"}}
400  This module record was not stored, because one field is wrong:
       - unknown key "contxet" — did you mean "context"?
```

Anything real that the schema has no field for goes in `data.extra`, which every kind declares, so
nothing has to be dropped or invented at the top level.

**`extra` is the one place strictness stops.** What goes inside it is checked as an object and no
further: a value of any shape, under any key, is stored. That is what makes it useful, and it is the
exception every absolute statement about the write path has to survive.

**Flexible about how much you have written.** A field the schema marks required is required for the
record to be *complete*, not to create it. A record may be filed with a title and nothing else. It
is stored, and it counts as incomplete until the rest arrives, which you add later with a `PATCH`
rather than by resending the whole record. Measured on this project's own corpus on 27 August 2026:
518 records, 5 of them incomplete and readable as such.

A write that stores an incomplete record answers with the list of fields it still wants and a
sentence saying how to send them. Reading a record back carries the same list, and a listing carries
the count.

Completeness is **computed, never stored**: it is derived from the same field declarations on every
read, so there is no column and no flag to go stale when a declaration changes. It runs in the
browser too, so a page works out the same answer without a round trip.

## A write also tells you what it looks like

A create answers with `similar` — live records whose titles are close to the one you sent — and a
sentence about them, so filing the same thing twice is visible at the second write instead of by
accident a month later.

## Two ordered lists, and both refuse a write made against a stale read

A pipeline's blocks and a module's checklist are the two things several writers edit at once.

Replacing a pipeline's order takes the *whole* order and refuses a list that leaves a block out,
rather than deleting it. A caller that has not seen a block somebody added a minute ago would
otherwise remove it by saying nothing about it, and be answered 200.

The checklist had exactly that hole and it cost real work: one agent's write replaced another's
three items with four new ones, was answered 200, and no item id survived. Now a single line can be
added without sending the checklist, and a write that drops a stored line is refused unless it
carries the version the read handed back.

## The version token is the whole API's concurrency primitive

`version` comes back on a create and on every read. Sending it back as `ifVersion` is *required*
only for the one write that removes a checklist line; on every other `PATCH` it is optional, and
when you send it it is a compare-and-set.

Measured 11 August 2026, when the product was called PanelX, on an ordinary summary patch: the right
version returned 200; the same version a second time returned **409**, naming both versions, writing
nothing, and telling the caller to re-read and re-apply. If two agents may touch a record, that is
how you find out rather than overwriting.

## Nothing is truly deleted

A deleted record is marked deleted. A link pointing at one is shown as **broken** rather than
quietly disappearing, and the record's history stays readable. [history.md](history.md) covers what
can be brought back.

## Where the fields are

`GET /api/kinds` serves every kind, every field it takes, the type, whether the field is needed for
the record to be complete, an example, and the cross-field rules written out in English.
`GET /api/kinds/<kind>` serves one kind.

**No document in this repository restates those fields**, including this one. The schema is served
from the same declaration that enforces a write, so the two cannot disagree. A document could.
