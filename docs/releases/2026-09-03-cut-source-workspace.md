# Expandable CutStudio source workspace candidate

The actual signed-in production source test at release `4af98a7b` passed private
immutable save/reopen, unchanged timeline revision and anonymous denial. Its
full-page screenshot also showed that source editing occupied the narrow studio
sidebar. Functional custody does not establish an efficient editing experience.

This candidate adds a 96vw (up to 1400px), bounded-height source workspace using the app's
existing dialog and black/blue visual language. It presents only one editable
copy of the existing parent-owned draft, preserving file selection, source
selection/scroll where dimensions allow, undo/redo and actual saved identity.
Closing by button or Escape changes the view, not the draft. Focus returns to
the expansion control; native Tab traversal remains intact. The expanded text
area is larger and supports horizontal code scrolling without wrapping.

The same private ZIP/lockfile save flow operates inside the workspace. No new
source execution, provider, dependency, server route, schema or infrastructure
is introduced. Tests cover both viewport sizes, actual workspace dimensions,
selection/focus, one editor instance, undo/redo, no write on expand/close and
actual saved source bytes. Qualification and deployment remain pending.

This is an editing-ergonomics improvement, not full IDE/Remotion parity: code
execution/preview, language services, service isolation and authorized
same-input competitor benchmarks remain open.

## Visual follow-up

Initial head `252c15ec` passed types and all 16 local authoring browser journeys,
plus 729 protected root and 378 protected browser journeys with 24 existing skips
and no retries. Manual inspection of the retained mobile screenshot nevertheless
found that Tab followed by focus returning to the textarea could clip its first
lines above the scroll viewport. The candidate now reveals the focused source
box within its own scroll container without resetting its internal text scroll
or selection. A geometric first-line visibility assertion accompanies the real
screenshot. These new changes require fresh qualification; the earlier pass is
not treated as proof of the visual fix.
