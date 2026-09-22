# Human Atlas

An interactive anatomy explorer for the browser: a 3D model of the adult male body with 2,234 selectable structures, plus labelled CT and MRI for radioanatomy training.

[Demo of the original project](https://human-atlas-seven.vercel.app) (does not include slicing, CT, or MRI).

## Features

Pick a study at the top of the panel, then view it in **3D** or, for CT and MRI studies, in **2D** slices. Switching views keeps your place: the same plane, level, and selected structure.

| Study | 3D | 2D |
|---|---|---|
| Reference body (BodyParts3D) | 2,234 modelled structures | — |
| CT · Chest – pelvis | Reconstructed from the labels | 108 labelled structures |
| CT · Head & neck | Reconstructed from the labels | 115 labelled structures |
| MRI · Brain atlas | Reconstructed from the labels | 311 expert-labelled structures, T1 and T2 |

**3D**
- Orbit, zoom, and tap any structure to read about it.
- Turn systems or brain regions on and off, or hide single structures to see what lies beneath.
- Isolate a structure, or explode the body into a spaced inventory of every piece.
- Slice along axial, coronal, and sagittal planes. On CT and MRI studies the real image appears on the cut, inside the 3D anatomy.

**2D**
- Scroll through slices in all three planes, with soft-tissue, lung, bone, and brain windows for CT and T1/T2 for MRI.
- Coloured label overlay: hover to name a structure, tap for details, search to jump to it.
- Brain structures are grouped by region (lobes, thalamus, cerebellum, …) and show their place in the anatomical hierarchy.

## Install and run

You need [Node.js](https://nodejs.org) 22.13 or newer and Git. No accounts or API keys.

```sh
git clone https://github.com/S73ph4n/human-atlas.git
cd human-atlas
npm ci
npm run dev
```

Open http://localhost:3016. The dev server also listens on your local network, so a phone on the same Wi-Fi can open `http://<your-computer's-IP>:3016`.

The first load downloads about 33 MB of 3D geometry. Each CT or MRI study (16 MB, 6.5 MB, and 7.3 MB) and each reconstructed 3D model (4.3 MB, 2.3 MB, and 6.9 MB) downloads only when you open it.

To build a static site instead:

```sh
npm run build         # output in dist/
npx vite preview      # serve dist/ at http://localhost:4173
```

`dist/` can be hosted on any static host. For Vercel, import the repository; `vercel.json` is already configured.

## Controls

| | 3D | 2D |
|---|---|---|
| Move through slices | Slider, or `[` `]` (Shift: 1 cm) | Mouse wheel, slider, or `[` `]` (Shift: 10 slices) |
| Zoom | Scroll or pinch | Ctrl/⌘ + scroll, or pinch |
| Inspect | Tap a structure | Tap a labelled structure |
| Hide selected structure | `H` | — |
| Search | `/` | `/` |

## Data and credits

- **3D model:** [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), an adult male reference anatomy, CC BY 4.0. It does not include every structure (for example, the lungs are missing).
- **CT studies:** [TotalSegmentator dataset v2.0.1](https://zenodo.org/records/10047292), CC BY 4.0: subject s0476 (chest to pelvis, 108 labels) and subject s0777 (head and neck, 115 labels). 68 of the head and neck labels were generated with the [TotalSegmentator model](https://github.com/wasserth/TotalSegmentator) and are marked as unverified in the app.
- **MRI brain atlas:** [SPL/PNL/NAC Brain Atlas](https://www.openanatomy.org/atlas-pages/atlas-spl-nac-brain.html) from the Open Anatomy Project, obtained under license from The Brigham and Women's Hospital, Inc. and subject to the [3D Slicer License](https://github.com/Slicer/Slicer/blob/main/License.txt). The version here is modified (cropped, reoriented, rescaled, renumbered).

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

**Rebuilding the MRI brain atlas.** Download and unzip [brain-2017-01.zip](https://www.openanatomy.org/atlases/nac/brain-2017-01.zip), then run `pip install nibabel numpy pynrrd` and `python scripts/convert-spl-atlas.py brain-2017-01`.

**Rebuilding the reconstructed 3D models.** After converting a study, run `pip install numpy scipy scikit-image`, then `python scripts/build-study-meshes.py public/ct/<subject>/ct.json` (or `public/mri/spl-brain/study.json`), `node scripts/optimize-anatomy.mjs studies/<id>.json` and `node scripts/compress-models.mjs studies/<id>.json`, and list the model in `MODELS` in `app/anatomy.ts`.

**Rebuilding the 3D geometry** is optional. From the BodyParts3D OBJ archive and metadata tables, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`.

## License

The application code is under the [MIT License](LICENSE). The 3D anatomy and CT data are under CC BY 4.0, and the MRI brain atlas under the 3D Slicer License; keep their notices when redistributing them.
