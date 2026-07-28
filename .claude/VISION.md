# VISION — modulab

Physical sensor modules plug into dev boards; a browser turns them into live
3D digital twins inside physics scenes; analytical overlays (forces, angles,
energy, eventually stress and mechanics-of-materials quantities) render
INSIDE the world. The long-term shape is an authoring platform — "a tiny
domain-specific Unity" (Arath, 2026-07-27) — where users build, wire, save,
and share experiments entirely in-app, and hardware modules self-register
("hello" frames) so the right lesson loads itself.

Origin: Andrew Frueh's Powder Of Life (Unity + Arduino digital twin), ported
2026-07-26, then rebuilt clean-room for the browser. Wire-compatible with PoL
serial sketches; zero PoL code (MIT, one attributed CC/OHL model asset).

North star for lessons: physics → statics → forces → materials → mechanics
of materials, each as scene documents with overlay data, driven by cheap
open hardware instead of $1k lab kits.
