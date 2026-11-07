# Basic land printings are stored, refreshed when a new set appears

Status: Accepted

Pool cards are snapshotted per draft (ADR 0013), but a **basic land** is never a pool card, so its printings had no snapshot to come from. #372 read them live from Scryfall: the Printing picker searched Scryfall from the browser, one land at a time and at no more than 2 searches a second, and setting a **preferred printing** asked Scryfall to check the printing and copied its details. Basic land printings almost never change; new ones appear only when a new set comes out.

So the api stores every English printing of each basic land with a single-faced image, and the picker and preferred printings read only what is stored (#526). A preferred printing refers to its stored printing instead of copying it. Asking for a land's printings answers at once from what is stored, and starts one refresh in the background when none has finished yet, or when Scryfall's list of sets has a set released since the last refresh started. A refresh reads each basic land with Scryfall's search, and upserts: it never deletes a printing, so no preferred printing loses its own.

A refresh is keyed on release dates, not on new set codes. A set still in spoiler season waits until its release, by which time its basic lands are complete, and sets that never hold basic lands, such as tokens and promos, can't trigger a refresh again and again.

## Considered Options

- **Keep reading them live from Scryfall.** Rejected: every opening of the picker cost several paced searches, and setting a preferred printing failed whenever Scryfall did, for data that almost never changes.
- **Import Scryfall's bulk data files.** Rejected: they are hundreds of MB, for the one or two thousand printings needed; six paged searches read them all.
- **Refresh on a schedule.** Rejected: there is no scheduler, and a refresh would mostly find nothing new. Checking the cached set list on each request costs nothing extra.

## Consequences

- A newly released set's printings don't appear until the refresh it triggers finishes, and the picker shows nothing to choose until the first refresh has stored any.
- A printing Scryfall drops stays stored, and stays offered by the picker.
