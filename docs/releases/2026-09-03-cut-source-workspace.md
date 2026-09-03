# Expandable CutStudio source workspace candidate

The actual signed-in production source test at release `4af98a7b` passed private
immutable save/reopen, unchanged timeline revision and anonymous denial. Its
full-page screenshot also showed that source editing occupied the narrow studio
sidebar. Functional custody does not establish an efficient editing experience.

This candidate adds a 96vw, bounded-height source workspace using the app's
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
