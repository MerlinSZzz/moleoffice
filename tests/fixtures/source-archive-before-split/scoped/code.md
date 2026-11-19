# The code this project's work is implemented in

Three things are here: the repositories somebody registered, the code revisions somebody named, and every
relationship somebody stated between a record and some code. All three were written on purpose by a person
or an agent, and nothing can work any of them out again.

WHAT IS NOT HERE is what a resolver worked out. Those rows are rebuilt whole by the next scan of their
repository, so a restored copy would describe the files of whichever machine this came from.

`root` IS A PATH ON THE MACHINE THIS WAS WRITTEN ON. It travels with the row, so an archive restored
somewhere else carries every repository name and every relationship and one path that machine may not have.
The first rebuild there refuses, naming the value, and a person re-points it once. THE RELATIONSHIPS ARE
UNTOUCHED BY THAT, because every pattern is written relative to its repository. A `root` that is null means
the repository is named and there is no checkout of it on this machine, which is a real answer.

TWO ROWS MAY SAY THE SAME THING ABOUT THE SAME CODE and that is not a duplicate. `provenance` is in the
unique index, so a person's statement and an agent's guess about one pattern are two rows that coexist.
They are never merged and neither overwrites the other.

### Repository a — /fixture/a

```mole-office repositories
id: "repo-a"
workspaceId: "default"
name: "Repository a"
note: null
root: "/fixture/a"
createdAt: "2026-08-12 10:00:00"
updatedAt: "2026-08-12 10:00:00"
createdBy: "agent:fixture"
```

### ref-a — Repository a

```mole-office implementation_revisions
id: "revision-a"
workspaceId: "default"
repositoryId: "repo-a"
ref: "ref-a"
label: null
note: null
statedAt: "2026-08-12 10:00:00"
statedBy: "agent:fixture"
```

### Work a implements Repository a/src/a.ts

```mole-office implementation_map
id: "map-a"
workspaceId: "default"
recordId: "record-a"
repositoryId: "repo-a"
pattern: "src/a.ts"
relation: "implements"
provenance: "stated"
note: null
revisionId: "revision-a"
statedAt: "2026-08-12 10:00:00"
statedBy: "agent:fixture"
acceptedAt: null
acceptedBy: null
deletedAt: null
```
