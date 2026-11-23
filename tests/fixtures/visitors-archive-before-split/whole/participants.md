# Who takes part

The people and the durable agents of this installation. Each has a name, a short address, a picture and
a state it set itself, and a message names one of them by kind and id.

NEITHER TABLE BELONGS TO A PROJECT. The owner is the same person in every project on this machine, and
so is a durable agent, which is why these rows are here rather than among the records. A restore must
write `assets.md` first: every row below names the picture it is drawn with.

`state` IS SOMEBODY'S OWN WORDS AND IS NEVER A READING. Whether anybody is reachable right now is
worked out from what is running, is stored nowhere, and is therefore in no archive.

## People

### jory — Jory

```mole-office people
id: "jory"
name: "Jory"
handle: "jory"
avatarAssetId: "avatar-default-person-jory"
state: null
stateAt: null
presenceChoice: null
presenceChoiceAt: null
circleShows: null
circlePicture: null
messageLinkLevel: null
messageLinkLayout: null
messageProjectMark: null
messagePictures: null
chatTextSize: null
sendKey: null
shortcuts: null
chatButtonStays: null
chatOpensAs: null
chatLabels: null
shippedFlags: null
chatLayout: null
startingMode: "inspect"
themes: null
agentTags: null
officeOwner: "named-by-the-installer"
language: null
mediaLoad: null
createdAt: "2026-08-12 10:00:00"
createdByKind: null
createdById: null
homeWorld: "world-a"
homeInstallation: "installation-fixture"
citizenSince: "2026-08-12 10:00:00"
role: null
occupation: null
portrait: null
addressName: null
addressSecondPerson: null
addressThirdPerson: null
addressTitle: null
addressSetByKind: null
addressSetById: null
addressSetAt: null
```

## Durable agents

`retired` MEANS NO NEW WORK AND NOTHING ELSE. A retired agent still resolves, still has whatever is
waiting for it, and can be made active again, so a restore that dropped these rows would strand
whatever was addressed to them.

### fixture-office — Mole Office

```mole-office agents
pixelAppearance: null
pixelScale: "{\"version\":1,\"roleAtGeneration\":null,\"value\":1}"
id: "fixture-office"
name: "Mole Office"
handle: "mole-office"
avatarAssetId: "fixture-avatar"
state: null
stateAt: null
stateByKind: null
stateById: null
runtime: null
startedByKind: null
startedById: null
ownerId: null
ownerKind: null
role: null
cardChosenBy: null
elevation: null
workArea: null
startedFor: null
startedByRun: null
credential: null
retired: 0
retiredBecause: null
retiredAt: null
retiredByKind: null
retiredById: null
createdAt: "2026-08-12 10:00:00"
createdByKind: null
createdById: null
homeWorld: "world-a"
homeInstallation: "installation-fixture"
citizenSince: "2026-08-12 10:00:00"
addressName: null
addressSecondPerson: null
addressThirdPerson: null
addressTitle: null
addressSetByKind: null
addressSetById: null
addressSetAt: null
residentSince: null
residentProposal: null
residentDecision: null
residentConfirmedByKind: null
residentConfirmedById: null
successorId: null
successorNamedAt: null
successorNamedByKind: null
successorNamedById: null
residentNamingAskedAt: null
residentNamedAt: null
residentNamedByKind: null
residentNamedById: null
readsReleasesFromTheCheck: null
runKeysOnly: 0
sleepTimeStarts: null
sleepTimeMinutes: null
sleepTimeSetAt: null
sleepTimeSetBy: null
```

## Which record is which agent

One row per record of kind `agent`, saying which registry row that record is. The records are kept
and linked, never replaced: an inbox, a conversation and a work domain all still point at the
record. A row here names a record that IS in a project and an agent that is in none, so it travels
with the registry rather than with the record: only the whole-installation archive carries it.

No record of kind `agent` is mapped, which is what a database with no such record holds.

## Which installation this is

One row, saying which installation the citizens above belong to. An installation is one person's
Mole Office on one machine: the canonical database, every worktree of it, and every world any of
them starts. Every world the office lists says which installation it belongs to, so two offices
could be told apart if they ever have to talk to each other.

IT IS CARRIED BECAUSE NOTHING CAN REBUILD IT. The id was worked out from the declaration on the day
this database was first migrated. Working it out again on a restore would answer about the
declaration of whatever machine the restore happens on, which is a different fact under the same
name — and every citizen above would then belong to an installation they were never registered in.

### installation-fixture

```mole-office installation
onlyRow: 1
id: "installation-fixture"
how: "fixture"
writtenAt: "2026-08-12 10:00:00"
windowClosedAt: null
windowClosedByKind: null
windowClosedById: null
keepBackups: null
untracedRequestDays: null
tracedRequestDays: null
goalShortDays: null
goalMediumDays: null
goalLongDays: null
agentsMayInject: null
machineNames: null
deadLetterSecretary: null
deadLetterAfterDays: null
deadLetterAfterCount: null
addressForBrowsers: null
mergeQueueOwner: null
relatedTestsFirst: null
loadReadMsTop: null
loadCpuPercentTop: null
loadMemoryMbTop: null
pluginSwitches: null
checksInMergesOnly: null
staleForkBases: null
otherProjectsMessagesSince: null
ownerChangesSince: null
```

## Whether the reading-measure words carry their new names

One row once the stored words were renamed, and no row before that. On 11 September 2026 the preset
word `readable` was renamed narrow, so the old `narrow` became `narrowest` and the
old `readable` became `narrow`. The migration reads this row to decide whether to rename the words.

```mole-office measure_words_renamed
onlyRow: 1
renamedAt: "2026-08-12 10:00:00"
because: "The stored reading-measure words were renamed: `narrow` became `narrowest`, then `readable` became `narrow`."
```


## Pixel office scene

Nobody has saved shared pixel office scene settings.

## Saved office map assignments

No stable office map assignments have been saved.

## The model each run uses

Nobody has set a model on the Settings page.

## The Casting table

Nobody has cast any role.

## Changes to the Casting table

The Casting table has never been changed.

## The Casting labels

Nobody has made a Casting label.

## Changes to the Casting labels

The Casting labels have never been changed.

## The Casting table before migration 0190, kept as it was

It held no row.

## Changes to the Casting table before migration 0190, kept as they were

It held no row.

## Directories a preview may read, added by hand

Nobody has added a directory by hand as a preview root.

## The price table

Nobody has set a price table.
