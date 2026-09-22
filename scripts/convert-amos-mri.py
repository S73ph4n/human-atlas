"""Convert one AMOS abdominal MRI case into the browser slice-viewer format.

Usage: python scripts/convert-amos-mri.py <image .nii.gz> <label .nii.gz> <case id, e.g. amos_0590> [--out DIR]
Data: AMOS (https://zenodo.org/records/7262581, amos22.zip); MRI cases are amos_0500 and above. Requires nibabel, numpy,
scipy and pynrrd (the resampling helpers are shared with scripts/convert-spl-atlas.py).

The case is resampled to 1 mm isotropic RAS voxels around the solid organs (15 mm margin), background outside the
body is set to zero, and MRI intensities are rescaled to 8 bits. Output (default public/mri/<id>/): study.json, mr.u8.gz, labels.u8.gz, LICENSE.txt.
"""
import argparse, gzip, importlib, json, os, sys

import nibabel as nib
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
spl = importlib.import_module('convert-spl-atlas')

# AMOS label values; the dataset spells aorta "arota" and calls the inferior vena cava "postcava".
LABELS = {1: ('spleen', 'lymphatic'), 2: ('right kidney', 'urinary'), 3: ('left kidney', 'urinary'), 4: ('gallbladder', 'digestive'),
          5: ('esophagus', 'digestive'), 6: ('liver', 'digestive'), 7: ('stomach', 'digestive'), 8: ('aorta', 'arterial'),
          9: ('inferior vena cava', 'venous'), 10: ('pancreas', 'digestive'), 11: ('right adrenal gland', 'endocrine'),
          12: ('left adrenal gland', 'endocrine'), 13: ('duodenum', 'digestive'), 14: ('urinary bladder', 'urinary'),
          15: ('prostate or uterus', 'reproductive')}
STEP, MARGIN = 1.0, 15
# The crop follows the solid organs; the aorta, vena cava and oesophagus run the whole field of view and are cut at its edges.
CROP_LABELS = [1, 2, 3, 4, 6, 7, 10, 11, 12, 13, 14, 15]


def main(image_path, label_path, case, out_dir=None):
    sid = case.replace('_', '-')
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), '..', 'public', 'mri', sid)
    os.makedirs(out_dir, exist_ok=True)
    image, label = nib.load(image_path), nib.load(label_path)
    raw_labels = np.asarray(label.dataobj).astype(np.int16)
    bounds = [np.flatnonzero(np.isin(raw_labels, CROP_LABELS).any(axis=tuple(a for a in range(3) if a != d)))[[0, -1]] for d in range(3)]
    corners = np.array([[a, b, c, 1] for a in bounds[0] for b in bounds[1] for c in bounds[2]], float)
    world = (label.affine @ corners.T)[:3].T  # NIfTI affines are already RAS
    origin = world.min(0) - MARGIN
    shape = tuple(int(np.ceil(n)) + 1 for n in (world.max(0) + MARGIN - origin) / STEP)
    labels = spl.resample(raw_labels, label.affine, origin, STEP, shape, 0)
    mr = spl.resample(np.asarray(image.dataobj), image.affine, origin, STEP, shape, 1)
    # Background noise outside the body compresses badly: keep the largest tissue component (holes filled) and zero the rest.
    body, _ = ndimage.label(ndimage.binary_opening(mr > np.percentile(mr, 60) * .3, iterations=2))
    body = ndimage.binary_fill_holes(ndimage.binary_dilation(body == np.argmax(np.bincount(body.ravel())[1:]) + 1, iterations=3))
    mr = np.where(body, mr, 0)

    compact = np.zeros(shape, np.uint8)
    entries = []
    for value in sorted(set(np.unique(labels).tolist()) - {0}):
        name, system = LABELS[value]
        mask = labels == value
        where = np.argwhere(mask)
        compact[mask] = len(entries) + 1
        entries.append({'id': len(entries) + 1, 'key': name.replace(' ', '_'), 'name': name, 'system': system, 'voxels': len(where),
                        'center': [round(float(c), 1) for c in where.mean(0)], 'min': where.min(0).tolist(), 'max': where.max(0).tolist()})

    def write(name, volume):
        raw = np.ascontiguousarray(volume.transpose(2, 1, 0)).tobytes()  # x fastest
        packed = gzip.compress(raw, 9)
        with open(os.path.join(out_dir, name), 'wb') as f:
            f.write(packed)
        return {'url': f'/mri/{sid}/{name}', 'bytes': len(raw), 'gzipBytes': len(packed)}

    series = [{'id': 'mr', 'name': 'MRI', **write('mr.u8.gz', spl.rescale(mr, body))}]
    manifest = {
        'id': sid, 'modality': 'MR', 'source': f'AMOS (amos22), case {case}', 'license': 'CC BY-SA 4.0',
        'citation': 'Ji Y. et al., AMOS: A Large-Scale Abdominal Multi-Organ Benchmark for Versatile Medical Image Segmentation. NeurIPS 2022 Datasets and Benchmarks.',
        'shape': list(shape), 'spacing': [STEP] * 3, 'orientation': 'RAS', 'bits': 8, 'huKnots': [[0, 0], [255, 1000]],
        'series': series, 'files': {'ct': series[0], 'labels': write('labels.u8.gz', compact)}, 'labels': entries,
    }
    with open(os.path.join(out_dir, 'study.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    with open(os.path.join(out_dir, 'LICENSE.txt'), 'w') as f:
        f.write(f'Adapted from the AMOS dataset (https://zenodo.org/records/7262581), case {case}, licensed CC BY-SA 4.0 '
                '(https://creativecommons.org/licenses/by-sa/4.0/); this adaptation is shared under the same license. '
                'Changes: cropped to the solid organs and resampled to 1 mm isotropic RAS voxels, background outside the body set to zero, intensities rescaled to 8 bits, '
                'labels renamed and renumbered.\n')
    total = sum(f['gzipBytes'] for f in (series[0], manifest['files']['labels']))
    print(f'{sid}: grid {shape}, {len(entries)} labels, {total / 1e6:.1f} MB compressed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('image')
    parser.add_argument('label')
    parser.add_argument('case')
    parser.add_argument('--out')
    args = parser.parse_args()
    main(args.image, args.label, args.case, args.out)
