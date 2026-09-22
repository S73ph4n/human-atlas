# Human Atlas

An interactive anatomy explorer for the browser: a 3D model of the adult male body with 2,234 selectable structures, plus labelled CT scans for radioanatomy training.

[Demo of the original project](https://human-atlas-seven.vercel.app) (does not include slicing or CT mode).

## Features

**3D atlas**
- Orbit, zoom, and tap any structure to read about it.
- Turn anatomical systems on and off, or hide single structures to see what lies beneath.
- Isolate a structure, or explode the body into a spaced inventory of every piece.
- Slice the body along axial, coronal, and sagittal planes as filled cross-sections.

**CT radioanatomy**
- Two real CT studies: chest to pelvis, and head and neck.
- Scroll through slices in all three planes with soft-tissue, lung, bone, and brain windows.
- Coloured label overlay: hover to name a structure, tap for details, search to jump to it.

## Install and run

You need [Node.js](https://nodejs.org) 22.13 or newer and Git. No accounts or API keys.

```sh
git clone https://github.com/ashemag/human-atlas.git
cd human-atlas
npm ci
npm run dev
```

Open http://localhost:3016. The dev server also listens on your local network, so a phone on the same Wi-Fi can open `http://<your-computer's-IP>:3016`.

The first load downloads about 33 MB of 3D geometry. Each CT study (16 MB and 6.5 MB) downloads only when you open it.

To build a static site instead:

```sh
npm run build         # output in dist/
npx vite preview      # serve dist/ at http://localhost:4173
```

`dist/` can be hosted on any static host. For Vercel, import the repository; `vercel.json` is already configured.

## Controls

| | 3D atlas | CT |
|---|---|---|
| Move through slices | Slider, or `[` `]` (Shift: 1 cm) | Mouse wheel, slider, or `[` `]` (Shift: 10 slices) |
| Zoom | Scroll or pinch | Ctrl/⌘ + scroll, or pinch |
| Inspect | Tap a structure | Tap a labelled structure |
| Hide selected structure | `H` | — |
| Search | `/` | `/` |

## Data and credits

- **3D model:** [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), an adult male reference anatomy, CC BY 4.0. It does not include every structure (for example, the lungs are missing).
- **CT studies:** [TotalSegmentator dataset v2.0.1](https://zenodo.org/records/10047292), CC BY 4.0: subject s0476 (chest to pelvis, 108 labels) and subject s0777 (head and neck, 115 labels). 68 of the head and neck labels were generated with the [TotalSegmentator model](https://github.com/wasserth/TotalSegmentator) and are marked as unverified in the app.

Full credits and a description of every adaptation are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational tool, not a diagnostic or surgical one.

## For developers

**Checks**

```sh
npm run check                            # TypeScript
node scripts/validate-atlas.mjs          # 3D data integrity
node scripts/validate-interactions.mjs   # tap and drag handling
```

**Adding a CT study.** Download a subject folder from the TotalSegmentator dataset (it contains `ct.nii.gz` and `segmentations/`), then:

```sh
pip install nibabel numpy scipy
python scripts/convert-ct.py <subject folder> --bits 16
```

Use `--bits 16` for studies read with narrow windows such as brain, and `--generated <folder> …` to merge masks predicted by TotalSegmentator subtasks. The output goes to `public/ct/<subject>/`; register it in `CT_STUDIES` in `app/ct.ts`.

**Rebuilding the 3D geometry** is optional. From the BodyParts3D OBJ archive and metadata tables, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`.

## License

The application code is under the [MIT License](LICENSE). The anatomy and CT data are under CC BY 4.0; keep the attribution when redistributing them.
