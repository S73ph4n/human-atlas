# Human Atlas

An interactive anatomy explorer for the browser: a 3D model of the adult male body with 2,234 selectable structures, plus labelled CT and MRI for radioanatomy training.

[Demo of the original project](https://human-atlas-seven.vercel.app) (does not include slicing, CT, or MRI).

## Features

Pick a study at the top of the panel, then view it in **3D** or, for CT and MRI studies, in **2D** slices. Switching views keeps your place: the same plane, level, and selected structure.

| Study | 3D | 2D |
|---|---|---|
| Reference body · male (BodyParts3D) | 2,234 modelled structures | — |
| Reference body · female (HRA) | 888 modelled structures, partial skeleton and muscles | — |
| CT · Chest – pelvis | Reconstructed from the labels | 108 labelled structures |
| CT · Head & neck | Reconstructed from the labels | 115 labelled structures |
| CT · Inner ear atlas | Reconstructed from the labels | 15 expert-labelled structures, high-resolution CT |
| MRI · Brain atlas | Reconstructed from the labels | 311 expert-labelled structures, T1 and T2 |
| MRI · Abdomen (AMOS) | Reconstructed from the labels | 13 organs annotated by radiologists |
| MRI · Knee atlas | Reconstructed from the labels | 48 expert-labelled structures |

**3D**
- Orbit, zoom, and tap any structure to read about it: a Wikipedia summary, its Latin name, and what supplies it (artery, vein, nerve), with origin, insertion and action for muscles.
- Turn systems or brain regions on and off, or hide single structures to see what lies beneath.
- Isolate a structure, or explode the body into a spaced inventory of every piece.
- Slice along axial, coronal, and sagittal planes. On CT and MRI studies the real image appears on the cut, inside the 3D anatomy.

**2D**
- Scroll through slices in all three planes, with soft-tissue, lung, bone, and brain windows for CT and T1/T2 for MRI.
- Coloured label overlay: hover to name a structure, tap for details, search to jump to it. The same facts as in 3D appear beside the label.
- Brain structures are grouped by region (lobes, thalamus, cerebellum, …) and show their place in the anatomical hierarchy.

**Quiz**
- Radioanatomy practice on any CT or MRI study: an unlabelled slice, an arrow, and four names. Keys `1`–`4` answer, `Enter` moves on.
- Questions come from the study's own labels, all of them, on any slice where the structure appears — not only its widest one. The arrow points at the deepest interior pixel, so an imprecise boundary never makes a question unfair.
- The three wrong answers are structures of the same region or system, or the nearest neighbours, so they are worth ruling out.
- Answering reveals the structure on the image with its summary; from there one click opens it labelled in 2D.

## Install and run

You need [Node.js](https://nodejs.org) 22.13 or newer and Git. No accounts or API keys.

```sh
git clone https://github.com/S73ph4n/human-atlas.git
cd human-atlas
npm ci
npm run dev
```

Open http://localhost:3016. The dev server also listens on your local network, so a phone on the same Wi-Fi can open `http://<your-computer's-IP>:3016`.

The first load downloads about 33 MB of 3D geometry. The female reference body (24 MB), each CT or MRI study (7–16 MB), and each reconstructed 3D model (1–7 MB) download only when you open them.

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
| Answer a quiz question | — | `1`–`4`, then `Enter` for the next |

## Data and credits

- **3D model:** [BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), an adult male reference anatomy, CC BY 4.0. It does not include every structure (for example, the lungs are missing).
- **CT studies:** [TotalSegmentator dataset v2.0.1](https://zenodo.org/records/10047292), CC BY 4.0: subject s0476 (chest to pelvis, 108 labels) and subject s0777 (head and neck, 115 labels). 68 of the head and neck labels were generated with the [TotalSegmentator model](https://github.com/wasserth/TotalSegmentator) and are marked as unverified in the app.
- **Female reference body:** [HRA 3D Reference Organ Set for Female v1.5](https://doi.org/10.48539/HBM352.BTSQ.586), CC BY 4.0.
- **Brain, knee and inner ear atlases:** [SPL atlases](https://www.openanatomy.org/atlas-pages/) from the Open Anatomy Project, obtained under license from The Brigham and Women's Hospital, Inc. and subject to the [3D Slicer License](https://github.com/Slicer/Slicer/blob/main/License.txt). The versions here are modified (resampled, cropped, reoriented, rescaled, renumbered).
- **Abdominal MRI:** case amos_0590 of [AMOS](https://zenodo.org/records/7262581), CC BY-SA 4.0; its adapted files are shared under the same license.
- **Structure facts:** summaries and anatomy infobox fields from [English Wikipedia](https://en.wikipedia.org), CC BY-SA 4.0, reached through [Wikidata](https://www.wikidata.org) identifiers (CC0). Matching is automatic: a structure may be described by the article on a broader one.

Full credits and a description of every adaptation are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational tool, not a diagnostic or surgical one.

## For developers

**Checks**

```sh
npm run check                            # TypeScript
node scripts/validate-atlas.mjs          # 3D data integrity
node scripts/validate-interactions.mjs   # tap and drag handling
node scripts/validate-facts.mjs          # structure facts and their coverage
node scripts/validate-quiz.mjs           # quiz questions: every arrow lands inside its answer
```

**Adding a CT study.** Download a subject folder from the TotalSegmentator dataset (it contains `ct.nii.gz` and `segmentations/`), then:

```sh
pip install nibabel numpy scipy
python scripts/convert-ct.py <subject folder> --bits 16
```

Use `--bits 16` for studies read with narrow windows such as brain, and `--generated <folder> …` to merge masks predicted by TotalSegmentator subtasks. The output goes to `public/ct/<subject>/`; register it in `CT_STUDIES` in `app/ct.ts`.

**Rebuilding the SPL atlases and AMOS.** Download and unzip an SPL atlas ([brain](https://www.openanatomy.org/atlases/nac/brain-2017-01.zip), [knee](https://www.openanatomy.org/atlases/nac/knee-2016-09.zip), [inner ear](https://www.openanatomy.org/atlases/nac/inner-ear-2018-02.zip)), run `pip install nibabel numpy scipy pynrrd`, then `python scripts/convert-spl-atlas.py <brain|knee|inner-ear> <folder>`. For AMOS, extract an MRI case and its label from `amos22.zip` and run `python scripts/convert-amos-mri.py <image> <label> amos_0590`.

**Rebuilding the reconstructed 3D models.** After converting a study, run `pip install numpy scipy scikit-image`, then `python scripts/build-study-meshes.py public/ct/<subject>/ct.json` (or `public/mri/spl-brain/study.json`), `node scripts/optimize-anatomy.mjs studies/<id>.json` and `node scripts/compress-models.mjs studies/<id>.json`, and list the model in `MODELS` in `app/anatomy.ts`.

**Rebuilding the structure facts.** `python scripts/build-facts.py [dataset …] [--report]` rewrites `public/facts/<dataset>.json` from Wikidata and Wikipedia; `--report` lists the structures that stayed unmatched, which is how the synonym table in the script grows. Responses are cached under `work/facts-cache`, so re-runs are free; delete that folder to refresh from the live sources. No key is needed, but the public Wikidata endpoint is rate-limited and a full run takes a while.

**Rebuilding the 3D geometry** is optional. From the BodyParts3D OBJ archive and metadata tables, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`.

## License

The application code is under the [MIT License](LICENSE). The data keep their own licenses: CC BY 4.0 (BodyParts3D, HRA, TotalSegmentator), the 3D Slicer License (SPL atlases), and CC BY-SA 4.0 (AMOS and the Wikipedia-derived facts). Keep their notices when redistributing them.
