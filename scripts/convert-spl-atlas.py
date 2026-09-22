"""Convert an Open Anatomy Project (SPL) atlas into the browser slice-viewer format.

Usage: python scripts/convert-spl-atlas.py <atlas: brain | knee | inner-ear> <unzipped atlas folder> [--out DIR]
Downloads (3D Slicer License): https://www.openanatomy.org/atlases/nac/{brain-2017-01,knee-2016-09,inner-ear-2018-02}.zip
Requires nibabel, numpy, scipy and pynrrd.

Output (default public/mri/<id>/ for MRI, public/ct/<id>/ for CT):
  study.json        manifest: grid, series, label names, hierarchy paths, groups and colours
  <series>.u8.gz    MRI series, one byte per voxel (robustly rescaled per series)
  ct.u8.gz          CT, one byte per voxel with a bone-weighted piecewise-linear coding (EAR_KNOTS)
  labels.u16.gz     label index per voxel
  LICENSE.txt       3D Slicer License notice required for redistribution
Volumes use the same x-fastest RAS+ voxel order as scripts/convert-ct.py. Atlases whose image and label grids differ, or
whose voxels are not cubic, are resampled onto an isotropic RAS grid (linear for images, nearest for labels).
"""
import argparse, gzip, json, os, re

import nibabel as nib
import nrrd
import numpy as np
from scipy import ndimage

NOTICE = ('All or portions of this licensed product (such portions are the "Software") have been obtained under license from '
          'The Brigham and Women\'s Hospital, Inc. and are subject to the following terms and conditions: '
          'https://github.com/Slicer/Slicer/blob/main/License.txt\n\n')
ATLASES = {
    'brain': {'id': 'spl-brain', 'modality': 'MR', 'name': 'SPL/PNL/NAC Brain Atlas', 'release': 'brain-2017-01',
              'series': [('t1', 'T1', 'volumes/imaging/A1_grayT1-1mm_resample.nrrd'), ('t2', 'T2', 'volumes/imaging/A1_grayT2-1mm_resample.nrrd')],
              'labels': 'volumes/labels/hncma-atlas.nrrd', 'lut': 'labelinfo/hncma-atlas-lut.tsv', 'spacing': None, 'groups': 'brain',
              'citation': 'SPL-PNL Brain Atlas, Surgical Planning Laboratory, Brigham and Women\'s Hospital. http://www.spl.harvard.edu/publications/item/view/1265',
              'crop': 'the labelled head'},
    'knee': {'id': 'spl-knee', 'modality': 'MR', 'name': 'SPL Knee Atlas', 'release': 'knee-2016-09',
             'series': [('mr', 'MRI', 'Data/I.nrrd')], 'labels': 'Data/seg.nrrd', 'lut': 'Data/knee.ctbl', 'spacing': 0.5, 'groups': 'parent',
             'citation': 'SPL Knee Atlas, Surgical Planning Laboratory, Brigham and Women\'s Hospital. https://www.openanatomy.org/atlas-pages/atlas-spl-knee.html',
             'crop': 'the labelled knee'},
    'inner-ear': {'id': 'spl-ear', 'modality': 'CT', 'name': 'SPL Inner Ear Atlas', 'release': 'inner-ear-2018-02',
                  'series': [('ct', 'CT', 'image-volumes/Ear-CT.nrrd')], 'labels': 'image-volumes/Ear-seg.nrrd', 'lut': 'colortables/EarAtlasColors.ctbl',
                  # Cropped to the named ear structures: the temporal bone and jugular labels fill the whole 16 cm field of view.
                  'spacing': 0.4, 'crop_labels': [4, 5, 9, 10, 12, 14, 17, 19, 23, 25, 28, 140], 'margin': 5,
                  'groups': 'parent', 'extra_groups': {'Temporal_Bone': 'Bones'},
                  # Flat-panel CT: dense petrous bone reaches ~5000, so the bone window is wider than for body CT.
                  'windows': [{'id': 'soft', 'name': 'Soft tissue', 'width': 600, 'level': 100}, {'id': 'bone', 'name': 'Temporal bone', 'width': 4500, 'level': 1500}],
                  'citation': 'S. Bartling, M. Jakab, R. Kikinis. SPL Inner Ear Atlas, DKFZ and Surgical Planning Laboratory, Brigham and Women\'s Hospital. https://www.openanatomy.org/atlas-pages/atlas-spl-inner-ear.html',
                  'crop': 'the middle and inner ear structures'},
}
# One byte per voxel for the inner ear: soft tissue at ~9 HU per code, the dense petrous bone at ~46 per code.
EAR_KNOTS = [[0, -1024], [64, -100], [160, 800], [255, 5200]]


# Brain panel filter groups, chosen from the first matching ancestor (or the name for structures outside the hierarchy).
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


def affine_of(header):
    """NRRD index → RAS millimetres (NRRD atlases here are in LPS space)."""
    affine = np.eye(4)
    affine[:3, :3] = np.array(header['space directions'], dtype=float).T
    affine[:3, 3] = header['space origin']
    assert header['space'] == 'left-posterior-superior'
    return np.diag([-1, -1, 1, 1]) @ affine  # LPS → RAS


def ras_canonical(data, header):
    """NRRD → array in canonical RAS+ voxel order, via an explicit affine."""
    return np.asarray(nib.as_closest_canonical(nib.Nifti1Image(data, affine_of(header))).dataobj)


def resample(data, affine, origin, spacing, shape, order):
    """Sample a volume on an RAS-aligned grid where voxel (i, j, k) sits at origin + (i, j, k)·spacing."""
    inverse = np.linalg.inv(affine)
    source = data.astype(np.float32) if order else data
    return ndimage.affine_transform(source, inverse[:3, :3] * spacing, inverse[:3, :3] @ origin + inverse[:3, 3],
                                    output_shape=shape, order=order, mode='constant')  # outside the source field of view stays empty


def rescale(volume, mask):
    """Robust 0–255 rescale: MRI intensities have no absolute scale, so each series is normalised within the head."""
    lo, hi = np.percentile(volume[mask], [0.5, 99.8])
    return np.clip(np.rint((volume - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)


def read_lut(path):
    """Label value → (name, [], rgb) from an SPL colour table (.tsv or Slicer .ctbl)."""
    lut = {}
    with open(path) as f:
        for row in f:
            if row.startswith(('#', 'value')) or not row.strip():
                continue
            if path.endswith('.tsv'):
                value, name, color = row.rstrip('\n').split('\t')[:3]
                rgb = [int(c) for c in re.findall(r'\d+', color)[:3]]
            else:
                value, name, *rgba = row.split()
                rgb = [int(c) for c in rgba[:3]]
            lut[int(value)] = (name, [], rgb)
    return lut


# Order matters: tissue words (ligament, muscle, fat…) are tested before bone names, which also appear inside them
# ("infrapatellar fat", "tibialis anterior muscle", "fibular collateral ligament").
SYSTEM_PATTERNS = [('arterial', r'arter'), ('venous', r'vein'), ('nervous', r'nerve|meatus'), ('sensory', r'tympanic|labyrinth|rotunda|spiral|inner ear'),
                   ('connective', r'cartilage|menisc|ligament|tendon|tract'), ('muscular', r'muscle'), ('integumentary', r'fat'),
                   ('skeletal', r'bone|malleus|incus|stapes|femur|tibia|fibula|patella'), ('sensory', r'ear')]


def system_of(name, parent):
    """Body system for atlases grouped by hierarchy parent: the structure's own name decides first."""
    for text in (name.lower(), parent.lower()):
        for system, pattern in SYSTEM_PATTERNS:
            if re.search(pattern, text):
                return system
    return 'connective'


def main(atlas, src, out_dir=None):
    cfg = ATLASES[atlas]
    sid, mr = cfg['id'], cfg['modality'] == 'MR'
    base = f"/{'mri' if mr else 'ct'}/{sid}"
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), '..', 'public', base.strip('/'))
    os.makedirs(out_dir, exist_ok=True)
    labels_raw, lh = nrrd.read(os.path.join(src, cfg['labels']))
    images = {k: nrrd.read(os.path.join(src, path)) for k, _, path in cfg['series']}
    if cfg['spacing'] is None:
        # The brain's 1 mm images share the label grid (their NRRD origins differ by half a voxel, a corner/centre convention).
        labels = ras_canonical(labels_raw, lh)
        series = {k: ras_canonical(*v) for k, v in images.items()}
        assert all(s.shape == labels.shape for s in series.values())
        spacing = [1.0, 1.0, 1.0]
        head = labels > 0
        lo = np.maximum(np.argwhere(head).min(0) - 4, 0)
        hi = np.minimum(np.argwhere(head).max(0) + 5, labels.shape)
        crop = tuple(slice(a, b) for a, b in zip(lo, hi))
        labels, head = labels[crop], head[crop]
        series = {k: v[crop] for k, v in series.items()}
    else:
        # Resample images and labels onto one isotropic RAS grid around the labelled region.
        step, margin = cfg['spacing'], cfg.get('margin', 3)
        labelled = np.isin(labels_raw, cfg['crop_labels']) if cfg.get('crop_labels') else labels_raw > 0
        bounds = [np.flatnonzero(labelled.any(axis=tuple(a for a in range(3) if a != d)))[[0, -1]] for d in range(3)]
        corners = np.array([[a, b, c, 1] for a in bounds[0] for b in bounds[1] for c in bounds[2]], float)
        world = (affine_of(lh) @ corners.T)[:3].T
        origin = world.min(0) - margin
        shape = tuple(int(np.ceil(n)) + 1 for n in (world.max(0) + margin - origin) / step)
        labels = resample(labels_raw, affine_of(lh), origin, step, shape, 0)
        series = {k: resample(d, affine_of(h), origin, step, shape, 1) for k, (d, h) in images.items()}
        spacing = [float(step)] * 3
        head = labels > 0

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
    lut = read_lut(os.path.join(src, cfg['lut']))

    compact = np.zeros(labels.shape, np.uint16)
    entries, group_names = [], {}
    for value in np.unique(labels):
        if value == 0 or (value not in structures and value not in lut):
            continue  # unnamed values are left unlabelled
        name, path, color = structures.get(value) or lut[value]
        mask = labels == value
        where = np.argwhere(mask)
        if cfg['groups'] == 'brain':
            # The structure's own name decides first, then its closest ancestor.
            chain = path + [name, readable(name)]
            group = next((g for part in reversed(chain) for g, _, pattern in GROUPS if re.search(pattern, part)), 'other')
            display, system = readable(name), SYSTEM_OF_GROUP.get(group, 'nervous')
        else:
            parent_name = path[-1] if path else cfg.get('extra_groups', {}).get(name, 'Other')
            group = re.sub(r'\W+', '-', parent_name.lower()).strip('-')
            group_names.setdefault(group, parent_name)
            display = name.replace('_', ' ').lower()
            system = system_of(display, parent_name)
        index = len(entries) + 1
        compact[mask] = index
        entries.append({'id': index, 'key': str(int(value)), 'name': display, 'system': system,
                        'group': group, 'path': path, 'color': color, 'voxels': len(where),
                        'center': [round(float(c), 1) for c in where.mean(0)], 'min': where.min(0).tolist(), 'max': where.max(0).tolist()})

    def write(name, volume):
        raw = np.ascontiguousarray(volume.transpose(2, 1, 0)).astype(volume.dtype.newbyteorder('<')).tobytes()  # x fastest
        packed = gzip.compress(raw, 9)
        with open(os.path.join(out_dir, name), 'wb') as f:
            f.write(packed)
        return {'url': f'{base}/{name}', 'bytes': len(raw), 'gzipBytes': len(packed)}

    if mr:
        files = [dict(id=k, name=label if cfg['groups'] != 'brain' else k.upper(), **write(f'{k}.u8.gz', rescale(series[k].astype(np.float32), head)))
                 for k, label, _ in cfg['series']]
        bits, knots = 8, [[0, 0], [255, 1000]]
    else:
        knots = np.array(EAR_KNOTS, dtype=np.float32)
        coded = np.rint(np.interp(series['ct'], knots[:, 1], knots[:, 0])).astype(np.uint8)
        files = [dict(id='ct', name='CT', **write('ct.u8.gz', coded))]
        bits, knots = 8, EAR_KNOTS
    used = {e['group'] for e in entries}
    groups = ([{'id': g, 'name': n} for g, n, _ in GROUPS + [('other', 'Other', '')] if g in used] if cfg['groups'] == 'brain'
              else [{'id': g, 'name': n} for g, n in group_names.items()])
    manifest = {
        'id': sid, 'modality': cfg['modality'], 'source': f"{cfg['name']} (Open Anatomy Project, {cfg['release']})",
        'license': '3D Slicer License', 'citation': cfg['citation'],
        'shape': list(labels.shape), 'spacing': spacing, 'orientation': 'RAS', 'bits': bits, 'huKnots': knots,
        'series': files, 'files': {'ct': files[0], 'labels': {**write('labels.u16.gz', compact), 'bits': 16}},
        'groups': groups, 'labels': entries,
    }
    if cfg.get('windows'):
        manifest['windows'] = cfg['windows']
    with open(os.path.join(out_dir, 'study.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    resampled = f"resampled to {spacing[0]} mm isotropic voxels, " if cfg['spacing'] else ''
    values = 'MRI intensities rescaled to 8 bits' if mr else 'CT values coded to 8 bits (piecewise-linear, finest in soft tissue)'
    with open(os.path.join(out_dir, 'LICENSE.txt'), 'w') as f:
        f.write(NOTICE + f"This is a modified version of the {cfg['name']} ({cfg['release']}): cropped to {cfg['crop']}, {resampled}reoriented "
                f"to RAS, {values}, and label values renumbered. It is not the original atlas. Research and education only; not for clinical use.\n")
    total = sum(f['gzipBytes'] for f in files) + manifest['files']['labels']['gzipBytes']
    counts = {g['id']: sum(e['group'] == g['id'] for e in entries) for g in manifest['groups']}
    print(f'{sid}: grid {labels.shape}, {len(entries)} labels, {total / 1e6:.1f} MB compressed\n{counts}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('atlas', choices=ATLASES)
    parser.add_argument('src')
    parser.add_argument('--out')
    args = parser.parse_args()
    main(args.atlas, args.src, args.out)
