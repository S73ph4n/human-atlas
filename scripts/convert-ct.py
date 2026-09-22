"""Convert one TotalSegmentator subject into the browser CT format.

Usage: python scripts/convert-ct.py <TotalSegmentator subject dir> [--out DIR] [--bits 8|16] [--generated DIR ...]
Requires nibabel, numpy and scipy. The subject directory holds ct.nii.gz and segmentations/*.nii.gz.
--generated adds masks predicted by TotalSegmentator subtasks (e.g. `TotalSegmentator -ta head_muscles`); they are
marked as generated in the manifest and drawn over the dataset labels. Keys already present, and the whole-head
envelope, are skipped.
--bits 16 stores HU + 1024 (clamped to 12 bits) instead of the byte coding, for narrow windows such as brain.

Output (default public/ct/<subject>/):
  ct.json          manifest: grid, HU coding, label names and systems
  ct.u8.gz         CT intensities, one byte per voxel (see HU_KNOTS), or ct.u16.gz with --bits 16
  labels.u8.gz     label index per voxel, 0 = unlabelled
Volumes are stored x-fastest in canonical RAS+ voxel order: +x toward the patient's right,
+y anterior, +z superior.
"""
import argparse, gzip, json, os, re

import nibabel as nib
import numpy as np
from scipy import ndimage

# Piecewise-linear byte coding of Hounsfield units. Most codes go to soft tissue, where windows are narrow;
# lung and bone keep enough precision for their wide windows.
HU_KNOTS = [[0, -1024], [64, -200], [224, 300], [255, 2000]]
HU_KNOTS_16 = [[0, -1024], [4095, 3071]]
SKIP_GENERATED = {'head'}
# Fragments at the edge of the field of view, or structures too small for the voxel size, are dropped.
MIN_VOXELS = 30

SYSTEM_PATTERNS = [
    ('skeletal', r'^(sacrum|vertebrae_|humerus|scapula|clavicula|femur|hip_|skull|rib_|sternum|hyoid|zygomatic_arch|styloid_process|mandible|hard_palate)'),
    ('connective', r'^(costal_cartilages|thyroid_cartilage|cricoid_cartilage)'),
    ('muscular', r'^(gluteus|autochthon|iliopsoas|masseter|temporalis|lateral_pterygoid|medial_pterygoid|digastric|sternocleidomastoid|trapezius|platysma|levator_scapulae|.*_scalene|sterno_thyroid|thyrohyoid|prevertebral|.*pharyngeal_constrictor)'),
    ('sensory', r'^(eye|auditory_canal)'),
    ('cardiac', r'^(heart|atrial_appendage)'),
    ('arterial', r'^(aorta|brachiocephalic_trunk|subclavian_artery|common_carotid_artery|iliac_artery|internal_carotid_artery)'),
    ('venous', r'^(pulmonary_vein|brachiocephalic_vein|superior_vena_cava|inferior_vena_cava|portal_vein|iliac_vena|internal_jugular_vein)'),
    ('respiratory', r'^(lung_|trachea|nasal_cavity|nasopharynx|larynx_air|sinus_)'),
    ('digestive', r'^(esophagus|stomach|small_bowel|duodenum|colon|liver|gallbladder|pancreas|parotid_gland|submandibular_gland|tongue|soft_palate|oropharynx|hypopharynx|teeth_)'),
    ('urinary', r'^(kidney|urinary_bladder)'),
    ('reproductive', r'^prostate'),
    ('endocrine', r'^(adrenal_gland|thyroid_gland)'),
    ('lymphatic', r'^spleen'),
    ('nervous', r'^(spinal_cord|brain|optic_nerve)'),
]

NAMES = {
    'clavicula': 'clavicle', 'hip': 'hip bone', 'autochthon': 'erector spinae', 'iliac_vena': 'common iliac vein',
    'iliac_artery': 'common iliac artery', 'small_bowel': 'small intestine', 'portal_vein_and_splenic_vein': 'portal and splenic veins',
    'costal_cartilages': 'costal cartilages', 'atrial_appendage': 'atrial appendage', 'kidney_cyst': 'kidney cyst',
    'pulmonary_vein': 'pulmonary veins', 'adrenal_gland': 'adrenal gland', 'thyroid_gland': 'thyroid gland',
    'eye_lens': 'lens', 'auditory_canal': 'external acoustic meatus', 'larynx_air': 'laryngeal airway', 'sterno_thyroid': 'sternothyroid',
    'prevertebral': 'prevertebral muscles', 'teeth_lower': 'lower teeth', 'teeth_upper': 'upper teeth', 'sinus_maxillary': 'maxillary sinus',
    'sinus_frontal': 'frontal sinus', 'parotid_gland': 'parotid gland', 'submandibular_gland': 'submandibular gland',
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


def main(subject_dir, out_dir=None, bits=8, generated=()):
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
    sources = [(os.path.join(subject_dir, 'segmentations'), False)] + [(d, True) for d in generated]
    for seg_dir, is_generated in sources:
        for file in sorted(os.listdir(seg_dir)):
            key = file.removesuffix('.nii.gz')
            if is_generated and (key in SKIP_GENERATED or any(e['key'] == key for e in entries)):
                continue
            mask = np.asarray(nib.as_closest_canonical(nib.load(os.path.join(seg_dir, file))).dataobj)[crop] > 0
            if not mask.any():
                continue
            # Generated labels are finer subdivisions, so they are drawn over the dataset labels.
            index = len(entries) + 1
            labels[mask] = index
            entries.append({'id': index, 'key': key, 'name': display_name(key), 'system': system_of(key), 'generated': is_generated})
    assert len(entries) < 256, 'labels are stored in one byte'
    # Measure after all labels are merged, so overwritten voxels are not counted twice.
    for entry in entries:
        where = np.argwhere(labels == entry['id'])
        if not len(where):  # fully covered by later labels
            entry['voxels'] = 0
            continue
        entry.update({'voxels': len(where), 'center': [round(float(c), 1) for c in where.mean(0)], 'min': where.min(0).tolist(), 'max': where.max(0).tolist()})
    for entry in entries:
        if entry['voxels'] < MIN_VOXELS:
            labels[labels == entry['id']] = 0
    entries = [e for e in entries if e['voxels'] >= MIN_VOXELS]

    files = {}
    intensities = np.clip(np.rint(ct) + 1024, 0, 4095).astype('<u2') if bits == 16 else encode_hu(ct)
    for name, volume in [('ct', intensities), ('labels', labels)]:
        raw = np.ascontiguousarray(volume.transpose(2, 1, 0)).tobytes()  # x fastest
        packed = gzip.compress(raw, 9)
        file = f'{name}.u{volume.itemsize * 8}.gz'
        with open(os.path.join(out_dir, file), 'wb') as f:
            f.write(packed)
        files[name] = {'url': f'/ct/{subject}/{file}', 'bytes': len(raw), 'gzipBytes': len(packed)}

    manifest = {
        'id': subject, 'source': 'TotalSegmentator dataset v2.0.1', 'license': 'CC BY 4.0',
        'citation': 'Wasserthal J. et al., TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. Radiology: Artificial Intelligence, 2023.',
        'shape': list(ct.shape), 'spacing': spacing, 'orientation': 'RAS', 'bits': bits, 'huKnots': HU_KNOTS_16 if bits == 16 else HU_KNOTS,
        'files': files, 'labels': entries,
    }
    with open(os.path.join(out_dir, 'ct.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    total = sum(f['gzipBytes'] for f in files.values()) / 1e6
    print(f'{subject}: grid {ct.shape} at {spacing} mm, {len(entries)} labels ({sum(e["generated"] for e in entries)} generated), {total:.1f} MB compressed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('subject_dir')
    parser.add_argument('--out')
    parser.add_argument('--bits', type=int, choices=[8, 16], default=8)
    parser.add_argument('--generated', nargs='*', default=[])
    args = parser.parse_args()
    main(args.subject_dir, args.out, args.bits, args.generated)
