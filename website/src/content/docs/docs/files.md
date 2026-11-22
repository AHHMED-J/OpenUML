---
title: Files (.mdj)
description: 'How OpenUML stores models: one .mdj file of JSON per project, the format other UML tools that use .mdj files read and write.'
---

OpenUML saves each project as one `.mdj` file: JSON text with the model elements and the diagrams that show them. It is the format other UML tools that use `.mdj` files read and write, so models can move between them.

- Opening a file never changes it until you save.
- Unsaved work is kept for recovery after a crash.
- Export a diagram as PNG, SVG or PDF, or the whole model as an offline interactive website.
