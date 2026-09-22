"""Convert the SPL/PNL/NAC Brain Atlas (Open Anatomy Project) into the browser slice-viewer format.

Usage: python scripts/convert-spl-atlas.py <brain-2017-01 folder> [--out DIR]
Download: https://www.openanatomy.org/atlases/nac/brain-2017-01.zip (3D Slicer License).
Requires nibabel, numpy and pynrrd.

Output (default public/mri/spl-brain/):
  study.json        manifest: grid, series, label names, hierarchy paths, groups and colours
  t1.u8.gz, t2.u8.gz  MRI series, one byte per voxel (robustly rescaled per series)
  labels.u16.gz     label index per voxel (the atlas has more than 255 labels)
  LICENSE.txt       3D Slicer License notice required for redistribution
Volumes use the same x-fastest RAS+ voxel order as scripts/convert-ct.py.
"""
import argparse, gzip, json, os, re

import nibabel as nib
import nrrd
import numpy as np

# Panel filter groups, chosen from the first matching ancestor (or the name for structures outside the hierarchy).
GROUPS = [
    ('frontal', 'Frontal lobe', r'frontal lobe$'), ('parietal', 'Parietal lobe', r'parietal lobe$'),
    ('temporal', 'Temporal lobe', r'temporal lobe$'), ('occipital', 'Occipital lobe', r'occipital lobe$'),
    ('limbic', 'Limbic lobe', r'limbic lobe$'), ('insula', 'Insula', r'insula$'),
    ('ventricles', 'Ventricles & CSF', r'(ventricle|aqueduct|choroid plexus)'),
    ('basal', 'Basal ganglia & deep nuclei', r'(^subcortex|claustrum|caudate|putamen|pallidus|accumbens|subthalamic)'),
    ('thalamus', 'Thalamus', r'(^|\s)(thalamus|metathalamus)$|thalamic nucleus|geniculate|pulvinar|medullary lamina'),
    ('hypothalamus', 'Hypothalamus & pituitary', r'(hypothalamus|epithalamus|neurohypophysis|hypophysis|mammillary|pineal)'),
    ('midbrain', 'Midbrain', r'midbrain'), ('cerebellum', 'Cerebellum', r'cerebell'),
    ('hindbrain', 'Pons & medulla', r'(rhombencephalon|pons|medulla)'),
    ('orbit', 'Eye & visual pathway', r'(Extraocular|Eyeball|eyeball|optic (nerve|chiasm|tract))'),
    ('whitematter', 'White matter & commissures', r'(white matter|corpus callosum|fornix|commissure|capsule|tract|lamina|septum)'),
    ('muscles', 'Head & neck muscles', r'Muscles'), ('skin', 'Skin', r'^skin$'),
]
SYSTEM_OF_GROUP = {'orbit': 'sensory', 'muscles': 'muscular', 'skin': 'integumentary'}
CEREBELLAR_PART = {'v': 'vermis', 'm': 'medial hemisphere', 'l': 'lateral hemisphere', 'l1': 'lateral hemisphere, part 1', 'l2': 'lateral hemisphere, part 2'}
FOLIUM = {'VIIAf': 'VIIA folium', 'VIIAt': 'VIIA tuber'}


def readable(name):
    """Expand the atlas's cerebellar lobule codes, e.g. 'left VIIA crusI m' → 'left cerebellar lobule VIIA crus I (medial hemisphere)'."""
    m = re.fullmatch(r'(left|right)[ -]((?:I II|[IVX]+[AB]?[ft]?))(?:[ -](crus ?I{1,2}))?[ -](v|m|l1|l2|l)', name)
    if not m:
        return name.replace('FaGE nuclei', 'fastigial, globose and emboliform nuclei')
    side, lobule, crus, part = m.groups()
    lobule = FOLIUM.get(lobule, lobule.replace('I II', 'I–II'))
    crus = f' crus {crus[4:].strip() or crus[-2:]}'.replace('crus crus', 'crus') if crus else ''
    return f'{side} cerebellar lobule {lobule}{crus} ({CEREBELLAR_PART[part]})'


def ras_canonical(data, header):
    """NRRD (LPS space) → array in canonical RAS+ voxel order, via an explicit affine."""
    affine = np.eye(4)
    affine[:3, :3] = np.array(header['space directions'], dtype=float).T
    affine[:3, 3] = header['space origin']
    assert header['space'] == 'left-posterior-superior'
    affine = np.diag([-1, -1, 1, 1]) @ affine  # LPS → RAS
    return np.asarray(nib.as_closest_canonical(nib.Nifti1Image(data, affine)).dataobj)


def rescale(volume, mask):
    """Robust 0–255 rescale: MRI intensities have no absolute scale, so each series is normalised within the head."""
    lo, hi = np.percentile(volume[mask], [0.5, 99.8])
    return np.clip(np.rint((volume - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)


def main(src, out_dir=None):
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), '..', 'public', 'mri', 'spl-brain')
    os.makedirs(out_dir, exist_ok=True)
    vol = lambda p: nrrd.read(os.path.join(src, 'volumes', p))
    labels_raw, lh = vol('labels/hncma-atlas.nrrd')
    labels = ras_canonical(labels_raw, lh)
    # The 1 mm images share the label grid (their NRRD origins differ by half a voxel, a corner/centre convention).
    series = {k: ras_canonical(*vol(f'imaging/A1_gray{k.upper()}-1mm_resample.nrrd')) for k in ('t1', 't2')}
    assert all(s.shape == labels.shape for s in series.values())

    # Hierarchy: structure name, colour and ancestor path for each label value.
    items = json.load(open(os.path.join(src, 'atlasStructure.json')))
    by_id = {i['@id']: i for i in items}
    parent = {m: g['@id'] for g in items if g['@type'] == 'Group' for m in g['member']}
    structures = {}
    for s in (i for i in items if i['@type'] == 'Structure'):
        key = next(sel['dataKey'] for sel in s['sourceSelector'] if sel.get('dataKey') is not None)
        path, node = [], s['@id']
        while node in parent:
            node = parent[node]
            path.insert(0, by_id[node]['annotation']['name'])
        color = [int(c) for c in re.findall(r'\d+', s['renderOption']['color'])[:3]]
        structures.setdefault(key, (s['annotation']['name'], path, color))
    lut = {}
    with open(os.path.join(src, 'labelinfo', 'hncma-atlas-lut.tsv')) as f:
        next(f)
        for row in f:
            value, name, color = row.rstrip('\n').split('\t')[:3]
            lut[int(value)] = (name, [], [int(c) for c in re.findall(r'\d+', color)[:3]])

    head = labels > 0
    lo = np.maximum(np.argwhere(head).min(0) - 4, 0)
    hi = np.minimum(np.argwhere(head).max(0) + 5, labels.shape)
    crop = tuple(slice(a, b) for a, b in zip(lo, hi))
    labels = labels[crop]
    head = head[crop]

    compact = np.zeros(labels.shape, np.uint16)
    entries = []
    for value in np.unique(labels):
        if value == 0 or (value not in structures and value not in lut):
            continue  # unnamed values are left unlabelled
        name, path, color = structures.get(value) or lut[value]
        mask = labels == value
        where = np.argwhere(mask)
        # The structure's own name decides first, then its closest ancestor.
        chain = path + [name, readable(name)]
        group = next((g for part in reversed(chain) for g, _, pattern in GROUPS if re.search(pattern, part)), 'other')
        index = len(entries) + 1
        compact[mask] = index
        entries.append({'id': index, 'key': str(int(value)), 'name': readable(name), 'system': SYSTEM_OF_GROUP.get(group, 'nervous'),
                        'group': group, 'path': path, 'color': color, 'voxels': len(where),
                        'center': [round(float(c), 1) for c in where.mean(0)], 'min': where.min(0).tolist(), 'max': where.max(0).tolist()})

    def write(name, volume):
        raw = np.ascontiguousarray(volume.transpose(2, 1, 0)).astype(volume.dtype.newbyteorder('<')).tobytes()  # x fastest
        packed = gzip.compress(raw, 9)
        with open(os.path.join(out_dir, name), 'wb') as f:
            f.write(packed)
        return {'url': f'/mri/spl-brain/{name}', 'bytes': len(raw), 'gzipBytes': len(packed)}

    files = [dict(id=k, name=k.upper(), **write(f'{k}.u8.gz', rescale(v[crop].astype(np.float32), head))) for k, v in series.items()]
    used = {e['group'] for e in entries}
    manifest = {
        'id': 'spl-brain', 'modality': 'MR', 'source': 'SPL/PNL/NAC Brain Atlas (Open Anatomy Project, brain-2017-01)',
        'license': '3D Slicer License', 'citation': 'SPL-PNL Brain Atlas, Surgical Planning Laboratory, Brigham and Women\'s Hospital. http://www.spl.harvard.edu/publications/item/view/1265',
        'shape': list(labels.shape), 'spacing': [1.0, 1.0, 1.0], 'orientation': 'RAS', 'bits': 8, 'huKnots': [[0, 0], [255, 1000]],
        'series': files, 'files': {'ct': files[0], 'labels': {**write('labels.u16.gz', compact), 'bits': 16}},
        'groups': [{'id': g, 'name': n} for g, n, _ in GROUPS + [('other', 'Other', '')] if g in used], 'labels': entries,
    }
    with open(os.path.join(out_dir, 'study.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    with open(os.path.join(out_dir, 'LICENSE.txt'), 'w') as f:
        f.write('All or portions of this licensed product (such portions are the "Software") have been obtained under license from '
                'The Brigham and Women\'s Hospital, Inc. and are subject to the following terms and conditions: '
                'https://github.com/Slicer/Slicer/blob/main/License.txt\n\n'
                'This is a modified version of the SPL/PNL/NAC Brain Atlas (brain-2017-01): cropped to the labelled head, reoriented '
                'to RAS, MRI intensities rescaled to 8 bits, and label values renumbered. It is not the original atlas. '
                'Research and education only; not for clinical use.\n')
    total = sum(f['gzipBytes'] for f in files) + manifest['files']['labels']['gzipBytes']
    counts = {g['id']: sum(e['group'] == g['id'] for e in entries) for g in manifest['groups']}
    print(f'spl-brain: grid {labels.shape}, {len(entries)} labels, {total / 1e6:.1f} MB compressed\n{counts}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('src')
    parser.add_argument('--out')
    args = parser.parse_args()
    main(args.src, args.out)
