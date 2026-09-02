# Private programmable Three scenes

This extends the isolated prototype, not the public application renderer.
Three.js 0.185.1 is MIT-licensed and pinned in the runtime image/lockfile. Private
TSX can import its core and the explicit SVGRenderer addon. Arbitrary dependency
installation, other addons, network imports and host modules remain denied.

Local qualification passed 16 unit tests plus actual isolated PNG geometry:
front/back depth ordering, a frame-driven translated/rotated box and reduced
projected area from a farther perspective camera. The complete network/metadata,
watchdog, cancellation, private-media and audio suite also passed on the same
image. The suite additionally requires a six-frame encoded 3D video whose decoded
geometry moves; protected Linux qualification remains a release gate.

The vector renderer deliberately has no textures, shadows or advanced shading:
https://threejs.org/docs/pages/SVGRenderer.html. It does not establish WebGL/WebGPU
compatibility or broad Three/Remotion parity. The pinned dependency includes its
MIT license. No competitor implementation is copied, and no GPU/sandbox privilege
or network permission was added.
