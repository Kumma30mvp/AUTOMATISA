# AUTOMATISA — Landing image assets

Convention folder for landing-page image files introduced in Phase 10d
(chunk 4). The landing components reference these files by literal
path through `next/image`. Drop the actual files into this folder
using exactly the filenames below.

## Expected filenames

| Filename | Wired in component | Visual treatment |
|---|---|---|
| `hero-logo.png` | `src/components/sections/Hero.tsx` | Full-bleed background, `opacity-40` with the existing navy gradient overlay. The original Phase 10c visual treatment is preserved verbatim; only the source path changes. |
| `about-workshop.jpg` | `src/components/sections/About.tsx` | Rounded card on the left half of the desktop two-column "Quiénes somos" section. `object-cover`, fills the column. |
| `diagnostico-electronico.jpg` | `src/components/sections/Services.tsx` (large card) | Half-width image overlay inside the Diagnóstico Electrónico bento card. `object-cover`. |
| `mantenimiento-preventivo.jpg` | *reserved — not yet wired* | Available for a future card-image upgrade on the Mantenimiento Preventivo dark card. Surface only with explicit approval. |
| `mantenimiento-correctivo.jpg` | *reserved — not yet wired* | Available for a future card-image upgrade on the Mantenimiento Correctivo card. |
| `repuestos.jpg` | *reserved — not yet wired* | Available for a future card-image upgrade on the Venta de Repuestos card. |

## Notes

- `next/image` is used in every wired component; `sizes` / `fill` /
  `object-cover` settings live in the consuming JSX.
- Until the actual files are uploaded, the live site will render the
  next/image broken-image fallback for the wired paths. TypeScript
  and `npm run build` do **not** fail on missing static assets.
- Phase 10d chunk 4 intentionally does **not** add image slots to
  service cards that currently render icon-only (Mantenimiento
  Preventivo / Correctivo / Venta de Repuestos). Those three
  filenames are documented above so the convention is future-ready;
  surfacing them visually is a separate scoped change.

## Legacy file mapping

The pre-Phase-10d landing referenced these files in `public/images/`:

| Legacy path | New canonical path |
|---|---|
| `/images/hero-bg.png` | `/images/automatisa/hero-logo.png` |
| `/images/about.png` | `/images/automatisa/about-workshop.jpg` |
| `/images/diagnostic.png` | `/images/automatisa/diagnostico-electronico.jpg` |

Other legacy files (`/images/map-placeholder.png` used by
`Location.tsx`) remain in use elsewhere and are out of scope for
this chunk.
