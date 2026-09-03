# Selected-file visibility in the source workspace

The retained mobile production image `source-workspace-mobile.png` from
`source-authoring-production-20260903055750611` showed the file selector partly
above the scrolling viewport when code was focused. The code remained editable,
but the current file was unnecessarily difficult to identify or change.

This candidate makes the existing file selector sticky inside the expanded
workspace and reserves its measured height when revealing focused code. Viewport
resize reruns that positioning without resetting the selected file, text,
selection or in-memory undo history. The inline editor and private save/lockfile
workflows are unchanged. No duplicate editor or executable-code path is added.

A new browser check asserts that the selector is actually unobscured at its hit
target, that the first visible code line stays below it, that scrolling and file
switching work, and that a reduced viewport and return to the studio preserve the
draft. This is not proof of every physical mobile keyboard/browser combination.

The first candidate (`5b8f618`) passed 794 root tests, nonincremental types,
build and bundle checks locally. Protected Verify `33729328078` exposed a real
mobile transition failure twice: changing files while the textarea retained
focus did not emit another focus event, leaving its first line under the sticky
selector. The retained screenshot and trace are not passing evidence. Desktop
also had one recovered native-title-motion retry. The correction reveals code
when the selected path changes as well as on focus and resize; the regression
check explicitly covers retained focus and a separate blur/refocus transition.

Corrected-candidate tests and normal-user field verification are pending. Existing
source-workspace and private persistence checks remain in place with their
original assertions and deadlines. This is an authoring ergonomics correction,
not Remotion feature parity.
