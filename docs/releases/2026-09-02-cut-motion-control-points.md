# Preserve native graphic animation boundaries

The earlier compiler reduced even explicitly authored graphic controls to at most
twelve sampled frames. The new compiler keeps every supported authored boundary,
including the held frame immediately before a step. It does not smooth over or
drop controls merely to fit the old sampling count. More than fifty essential
boundary frames now produces an explicit native compilation error instead of an
apparently successful but different edit. The underlying EDL limit is unchanged.

Native graphic-expression timestamps retain six decimal places instead of three,
reducing rounding drift at ordinary frame rates. Compiler sampling validates the
complete manifest once and evaluates the already-validated individual layer;
the public evaluation entry still validates untrusted inputs. This removes the
previous repeated whole-manifest parsing and all-layer evaluation per sample.

## Evidence boundary

Three regression tests reproduced the original dropped-control, lost-held-frame
and silent-overflow behavior before implementation. The revised focused suite
passes thirty tests across motion boundaries, existing production compilation
and graphic geometry, including a fourth test proving one full parse per compile
and continued rejection of invalid input.

An owned two-second browser/native test is added for twenty alternating step
and linear controls, eight decoded frame positions, and failed-admission revision
preservation. Its actual execution, full root regressions, protected merge and
deployment are pending.

Nonlinear easing still uses supplemental samples. Step preservation is to the
authored composition-frame grid; different export frame rates require separate
qualification. This does not claim general curve/frame identity, arbitrary
keyframe capacity, improved GPU/3D effects or Remotion parity.
