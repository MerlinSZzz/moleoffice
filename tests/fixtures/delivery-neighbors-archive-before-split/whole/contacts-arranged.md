# How the contacts list is arranged

Which second-level group each contact is in, in what order, and which groups one person has folded away.
The first level is two locked top groups, Human and Agent, DECLARED by the product rather than stored; under
Agent the default second-level groups are by role — secretary, inspector, supervisor, worker, other and
retired — and under Human there is one. Criteria M119 to M121.

SO THESE ROWS ARE ONLY WHAT SOMEBODY CHANGED. A group they made, a default one they renamed or moved, a
contact they moved, an order they set by hand, or a group they folded. An archive with none of these rows is
not an archive of a product with no groups: it is one where nobody has changed the arrangement the product
declares.

AN ARRANGEMENT BELONGS TO A PERSON AND TO THE INSTALLATION, not to a project — which group an agent belongs
in is a fact about the agent, and the registries these arrange are in every project on this machine. So a
project-scoped archive carries none of these, and says so in its notes.

### A group — agent agent-a

```mole-office contact_groups
id: "contact-group-a"
ownerKind: "agent"
ownerId: "agent-a"
key: "group-a"
side: null
name: "A group"
at: 1
createdAt: "2026-08-12 10:00:00"
```

### A group — agent agent-z

```mole-office contact_groups
id: "contact-group-z"
ownerKind: "agent"
ownerId: "agent-z"
key: "group-z"
side: null
name: "A group"
at: 1
createdAt: "2026-08-12 10:00:00"
```

### contact-a — agent agent-a

```mole-office contact_placements
id: "placement-a"
ownerKind: "agent"
ownerId: "agent-a"
contact: "contact-a"
groupKey: "group-a"
at: 1
placedAt: "2026-08-12 10:00:00"
```

### contact-z — agent agent-z

```mole-office contact_placements
id: "placement-z"
ownerKind: "agent"
ownerId: "agent-z"
contact: "contact-z"
groupKey: "group-z"
at: 1
placedAt: "2026-08-12 10:00:00"
```

### group-a — agent agent-a

```mole-office contact_group_collapses
id: "collapse-a"
ownerKind: "agent"
ownerId: "agent-a"
groupKey: "group-a"
collapsed: 1
setAt: "2026-08-12 10:00:00"
```

### group-z — agent agent-z

```mole-office contact_group_collapses
id: "collapse-z"
ownerKind: "agent"
ownerId: "agent-z"
groupKey: "group-z"
collapsed: 1
setAt: "2026-08-12 10:00:00"
```
