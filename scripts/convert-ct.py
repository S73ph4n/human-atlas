"""Convert one TotalSegmentator subject into the browser CT format.

Usage: python scripts/convert-ct.py <TotalSegmentator subject dir> [output dir]
Requires nibabel, numpy and scipy. The subject directory holds ct.nii.gz and segmentations/*.nii.gz.

Output (default public/ct/<subject>/):
  ct.json          manifest: grid, HU coding, label names and systems
  ct.u8.gz         CT intensities, one byte per voxel (see HU_KNOTS)
  labels.u8.gz     label index per voxel, 0 = unlabelled
Volumes are stored x-fastest in canonical RAS+ voxel order: +x toward the patient's right,
+y anterior, +z superior.
"""
import gzip, json, os, re, sys

import nibabel as nib
import numpy as np
from scipy import ndimage

# Piecewise-linear byte coding of Hounsfield units. Most codes go to soft tissue, where windows are narrow;
# lung and bone keep enough precision for their wide windows.
HU_KNOTS = [[0, -1024], [64, -200], [224, 300], [255, 2000]]

SYSTEM_PATTERNS = [
    ('skeletal', r'^(sacrum|vertebrae_|humerus|scapula|clavicula|femur|hip_|skull|rib_|sternum)'),
    ('connective', r'^costal_cartilages'),
    ('muscular', r'^(gluteus|autochthon|iliopsoas)'),
    ('cardiac', r'^(heart|atrial_appendage)'),
    ('arterial', r'^(aorta|brachiocephalic_trunk|subclavian_artery|common_carotid_artery|iliac_artery)'),
    ('venous', r'^(pulmonary_vein|brachiocephalic_vein|superior_vena_cava|inferior_vena_cava|portal_vein|iliac_vena)'),
    ('respiratory', r'^(lung_|trachea)'),
    ('digestive', r'^(esophagus|stomach|small_bowel|duodenum|colon|liver|gallbladder|pancreas)'),
    ('urinary', r'^(kidney|urinary_bladder)'),
    ('reproductive', r'^prostate'),
    ('endocrine', r'^(adrenal_gland|thyroid_gland)'),
    ('lymphatic', r'^spleen'),
    ('nervous', r'^(spinal_cord|brain)'),
]

NAMES = {
    'clavicula': 'clavicle', 'hip': 'hip bone', 'autochthon': 'erector spinae', 'iliac_vena': 'common iliac vein',
    'iliac_artery': 'common iliac artery', 'small_bowel': 'small intestine', 'portal_vein_and_splenic_vein': 'portal and splenic veins',
    'costal_cartilages': 'costal cartilages', 'atrial_appendage': 'atrial appendage', 'kidney_cyst': 'kidney cyst',
    'pulmonary_vein': 'pulmonary veins', 'adrenal_gland': 'adrenal gland', 'thyroid_gland': 'thyroid gland',
}


def display_name(key):
    if m := re.fullmatch(r'vertebrae_([CTLS]\d+)', key):
        return f'{m[1]} vertebra'
    if m := re.fullmatch(r'rib_(left|right)_(\d+)', key):
        return f'{m[1]} rib {m[2]}'
    if m := re.fullmatch(r'lung_(upper|middle|lower)_lobe_(left|right)', key):
        return f'{m[1]} lobe of {m[2]} lung'
    side = ''
    if m := re.fullmatch(r'(.+)_(left|right)', key):
        key, side = m[1], m[2] + ' '
    return side + NAMES.get(key, key.replace('_', ' '))


def system_of(key):
    return next(system for system, pattern in SYSTEM_PATTERNS if re.match(pattern, key))


def encode_hu(hu):
    knots = np.array(HU_KNOTS, dtype=np.float32)
    return np.rint(np.interp(hu, knots[:, 1], knots[:, 0])).astype(np.uint8)


def main(subject_dir, out_dir=None):
    subject = os.path.basename(os.path.normpath(subject_dir))
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), '..', 'public', 'ct', subject)
    os.makedirs(out_dir, exist_ok=True)
    image = nib.as_closest_canonical(nib.load(os.path.join(subject_dir, 'ct.nii.gz')))
    ct = np.asarray(image.dataobj, dtype=np.float32)
    spacing = [float(s) for s in image.header.get_zooms()[:3]]

    # Keep the largest body-density component: this removes the scanner table and air around the patient.
    body, count = ndimage.label(ndimage.binary_opening(ct > -300, iterations=2))
    body = body == (np.argmax(np.bincount(body.ravel())[1:]) + 1)
    body = ndimage.binary_fill_holes(ndimage.binary_dilation(body, iterations=3))
    lo = np.maximum(np.argwhere(body).min(0) - 4, 0)
    hi = np.minimum(np.argwhere(body).max(0) + 5, ct.shape)
    crop = tuple(slice(a, b) for a, b in zip(lo, hi))
    ct = np.where(body, ct, -1000)[crop]

    labels = np.zeros(ct.shape, np.uint8)
    entries = []
    seg_dir = os.path.join(subject_dir, 'segmentations')
    for file in sorted(os.listdir(seg_dir)):
        key = file.removesuffix('.nii.gz')
        mask = np.asarray(nib.as_closest_canonical(nib.load(os.path.join(seg_dir, file))).dataobj)[crop] > 0
        voxels = int(mask.sum())
        if not voxels:
            continue
        index = len(entries) + 1
        labels[mask] = index
        where = np.argwhere(mask)
        entries.append({'id': index, 'key': key, 'name': display_name(key), 'system': system_of(key), 'voxels': voxels,
                        'center': [round(float(c), 1) for c in where.mean(0)], 'min': where.min(0).tolist(), 'max': where.max(0).tolist()})

    files = {}
    for name, volume in [('ct', encode_hu(ct)), ('labels', labels)]:
        raw = np.ascontiguousarray(volume.transpose(2, 1, 0)).tobytes()  # x fastest
        packed = gzip.compress(raw, 9)
        with open(os.path.join(out_dir, f'{name}.u8.gz'), 'wb') as f:
            f.write(packed)
        files[name] = {'url': f'/ct/{subject}/{name}.u8.gz', 'bytes': len(raw), 'gzipBytes': len(packed)}

    manifest = {
        'id': subject, 'source': 'TotalSegmentator dataset v2.0.1', 'license': 'CC BY 4.0',
        'citation': 'Wasserthal J. et al., TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. Radiology: Artificial Intelligence, 2023.',
        'shape': list(ct.shape), 'spacing': spacing, 'orientation': 'RAS', 'huKnots': HU_KNOTS, 'files': files, 'labels': entries,
    }
    with open(os.path.join(out_dir, 'ct.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    total = sum(f['gzipBytes'] for f in files.values()) / 1e6
    print(f'{subject}: grid {ct.shape} at {spacing} mm, {len(entries)} labels, {total:.1f} MB compressed')


if __name__ == '__main__':
    main(*sys.argv[1:])
