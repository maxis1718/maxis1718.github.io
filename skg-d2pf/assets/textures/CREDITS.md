# Texture credits — assets/textures (desktop) and assets/textures/m (mobile, half resolution)

All maps are **CC0 1.0 (public domain)** or generated procedurally for this project (also CC0). Built by
`tools/lookdev-textures.py` (look-dev sets, WebP) and `tools/realism-textures.py` (older JPG sets). Every photographic
albedo is de-lit (low-frequency shading flattened) and colour-graded in linear light; see `meta.json` for per-set
scale (`size` = metres one texture covers), normal scale and roughness.

| Set (files) | Used on | Source | Licence | Source URL (GitHub-hosted mirror) |
|---|---|---|---|---|
| `marble_{albedo,normal,rough}.webp` | living / dining / kitchen / hall porcelain floor (600×1200 tiles composed in-shader) | ambientCG **Marble004** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/marfil-levante-c.webp (+ `-n.webp`) |
| `veneer_{albedo,normal,rough}.webp` | oak furniture (console, table legs, chairs, …) | ambientCG **Wood021** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/roble-nordico-c.webp (+ `-n.webp`) |
| `travert_{albedo,normal,rough}.webp` | dining table top (sintered travertine look) | ambientCG **Travertine009** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/travertino-albar-c.webp |
| `plaster_normal.webp` | wall / ceiling plaster relief | ambientCG **Plaster001** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/cal-blanca-n.webp |
| `feature_{albedo,normal}.webp` | limewash feature wall (one non-repeating map per 3.23 × 2.75 m face) | ambientCG **Plaster001**, high-passed + tiled at 1 m, procedural ±4 % drift + trowel marks | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/cal-blanca-c.webp |
| `oakfloor_{albedo,normal,rough}.webp` | bedroom plank floors (0.19 m planks, 1.2–1.8 m staggered, per-plank cuts) | ambientCG **Wood021** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/roble-nordico-c.webp |
| `worktop_{albedo,rough}.webp` | kitchen worktops (white sintered stone, soft grey veins) | ambientCG **Marble019** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/statuario-alba-c.webp |
| `bathwall_{albedo,normal,rough}.webp` | bathroom wall tiles 600×300, per-tile cuts, 1.5 mm grout | ambientCG **Marble005** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/carrara-hielo-c.webp |
| `bathfloor_{albedo,normal,rough}.webp` | bathroom floor tiles 300×300, per-tile cuts, 2 mm grout | ambientCG **Concrete034** photoscan | CC0 1.0 | https://raw.githubusercontent.com/jpiedra181/vetaAtlas/HEAD/public/tex/d/cemento-tiza-c.webp |
| `linen_{albedo,normal,rough}.webp` | sofa, chair seats, drapes | procedural plain weave (slub yarns, mélange) × ambientCG **Fabric031** fibre detail | CC0 1.0 | https://raw.githubusercontent.com/NeoAxis/NeoAxisEngine/HEAD/Project/Assets/Content/Materials/Basic%20Library/Fabric/Textures/Fabric031_2K_Color.jpg |
| `rug_{albedo,normal,rough}.webp` | living-room rug | procedural flat-weave jute / wool × ambientCG **Fabric031** fibre detail | CC0 1.0 | (as above) |
| `decking_*.jpg` | balcony decking | ambientCG **Wood051** + board layout | CC0 1.0 | https://raw.githubusercontent.com/jason9075/standard_RGB/main/public/textures/Wood051/Wood051_1K-JPG_Color.jpg |
| `steel_*.jpg` | brushed metal | procedural | CC0 1.0 | generated |

ambientCG (https://ambientcg.com) and Poly Haven (https://polyhaven.com) publish all their assets under CC0 1.0. The
mirrors above re-host those CC0 files; ambientCG asset ids for the vetaAtlas files are listed in that repository's
`src/data/catalog.json`. HDR skies in `assets/env` are credited separately in `tools/realism-env.py`.
