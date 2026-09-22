"""Build a 3D model (surface meshes) from a slice study's label volume, for the 3D viewer.

Usage: python scripts/build-study-meshes.py <study manifest under public/, e.g. public/ct/s0476/ct.json>
Requires numpy, scipy and scikit-image. Then run:
  node scripts/optimize-anatomy.mjs studies/<id>.json
  node scripts/compress-models.mjs studies/<id>.json
Output: public/models/studies/<id>.json plus binary chunks in the same format as the reference model.

Each label becomes one closed surface: the mask is lightly blurred (0.7 voxel) and marching cubes runs at the 50%
level, which removes voxel stair-steps without moving boundaries noticeably. RAS millimetres become the viewer's
metres with +x toward the body's left, +y up and +z anterior, standing on the stage.
"""
import gzip, json, os, re, sys

import numpy as np
from scipy import ndimage
from skimage.measure import marching_cubes

ROOT = os.path.join(os.path.dirname(__file__), '..')
SMOOTH_SIGMA = 0.7
CHUNK_BYTES = 4_000_000


def system_colors():
    """System colours from app/anatomy.ts, so the 3D model matches the slice overlay."""
    source = open(os.path.join(ROOT, 'app', 'anatomy.ts')).read()
    return dict(re.findall(r"\{id:'(\w+)',name:'[^']*',color:'(#[0-9a-f]{6})'", source))


def label_color(label, colors):
    # Mirrors labelColors() in app/ct.ts: the system colour, alternating in lightness between neighbouring labels.
    if label.get('color'):
        return label['color']
    base = colors.get(label['system'], '#aebbb8')
    shift = [1.25, .8, 1.1, .9][label['id'] % 4]
    return [min(255, round(int(base[i:i + 2], 16) * shift)) for i in (1, 3, 5)]


def surface(mask, spacing):
    """Closed surface of a boolean mask in millimetres (voxel space), with unit normals."""
    padded = np.pad(mask, 2).astype(np.float32)
    for sigma in (SMOOTH_SIGMA, 0):  # very thin structures can vanish when blurred
        volume = ndimage.gaussian_filter(padded, sigma) if sigma else padded
        if volume.max() > .5:
            verts, faces, normals, _ = marching_cubes(volume, .5, spacing=spacing, allow_degenerate=False)
            return verts - 2 * np.asarray(spacing), faces, normals
    return None


def main(manifest_path):
    study = json.load(open(manifest_path))
    labels_file = study['files']['labels']
    raw = gzip.decompress(open(os.path.join(ROOT, 'public', labels_file['url'].lstrip('/')), 'rb').read())
    X, Y, Z = study['shape']
    volume = np.frombuffer(raw, '<u2' if labels_file.get('bits') == 16 else 'u1').reshape(Z, Y, X).transpose(2, 1, 0)
    spacing = tuple(study['spacing'])
    colors = system_colors()

    meshes = []
    for label in study['labels']:
        lo = np.maximum(np.array(label['min']) - 1, 0)
        hi = np.minimum(np.array(label['max']) + 2, volume.shape)
        mask = volume[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]] == label['id']
        result = surface(mask, spacing)
        if result is None:
            continue
        verts, faces, normals = result
        verts = verts + lo * np.asarray(spacing)
        # RAS voxel axes (right, anterior, superior) → viewer axes (left, up, anterior); a proper rotation keeps winding.
        verts = np.stack([-verts[:, 0], verts[:, 2], verts[:, 1]], 1)
        normals = np.stack([-normals[:, 0], normals[:, 2], normals[:, 1]], 1)
        meshes.append((label, verts, faces, normals))
        print(f"\r{len(meshes)}/{len(study['labels'])} {label['name'][:40]:40}", end='', flush=True)
    print()

    everything = np.concatenate([m[1] for m in meshes])
    offset = np.array([-(everything[:, 0].min() + everything[:, 0].max()) / 2, -everything[:, 1].min(), -(everything[:, 2].min() + everything[:, 2].max()) / 2])

    out_dir = os.path.join(ROOT, 'public', 'models', 'studies')
    os.makedirs(out_dir, exist_ok=True)
    sid = study['id']
    chunks, parts, segments, size = [], [], [], 0

    def flush():
        nonlocal segments, size
        if size:
            name = f'{sid}-{len(chunks)}.bin'
            with open(os.path.join(out_dir, name), 'wb') as f:
                f.write(b''.join(segments))
            chunks.append({'url': f'/models/studies/{name}', 'bytes': size})
            segments, size = [], 0

    def append(array):
        nonlocal size
        padding = (4 - size % 4) % 4
        if padding:
            segments.append(b'\0' * padding)
            size += padding
        start = size
        data = np.ascontiguousarray(array).tobytes()
        segments.append(data)
        size += len(data)
        return start

    for label, verts, faces, normals in meshes:
        if size > CHUNK_BYTES:
            flush()
        positions = ((verts + offset) / 1000).astype('<f4')
        quantized = np.clip(np.rint(normals * 32767), -32767, 32767).astype('<i2')
        part = {'id': f"{sid}-{label['key']}", 'name': label['name'], 'conceptId': f"{sid}:{label['key']}", 'system': label['system'],
                'color': label_color(label, colors), 'chunk': len(chunks), 'vertexCount': len(positions), 'indexCount': faces.size,
                'bounds': [positions.min(0).round(5).tolist(), positions.max(0).round(5).tolist()]}
        for key in ('group', 'generated'):
            if label.get(key):
                part[key] = label[key]
        part['positions'] = append(positions)
        part['normals'] = append(quantized)
        part['indices'] = append(faces.astype('<u4'))
        parts.append((part, label.get('path', [])))
    flush()

    # Search entries: every structure, every ancestor in the atlas hierarchy, and every filter group.
    concepts = [{'id': p['conceptId'], 'name': p['name'], 'elements': [p['id']]} for p, _ in parts]
    ancestors = {}
    for p, path in parts:
        for name in path:
            ancestors.setdefault(name, []).append(p['id'])
    concepts += [{'id': f'{sid}:path:{name}', 'name': name, 'elements': ids} for name, ids in ancestors.items() if len(ids) > 1]
    for group in study.get('groups', []):
        ids = [p['id'] for p, _ in parts if p.get('group') == group['id']]
        if len(ids) > 1 and group['name'] not in ancestors:
            concepts.append({'id': f"{sid}:group:{group['id']}", 'name': group['name'], 'elements': ids})

    model = {'version': study['source'], 'source': study['source'], 'study': sid, 'modality': study.get('modality', 'CT'),
             'scope': f"Surfaces reconstructed from the {sid} label volume", 'parts': [p for p, _ in parts], 'concepts': concepts,
             'chunks': chunks, 'triangles': sum(p['indexCount'] // 3 for p, _ in parts),
             # Marching-cubes surfaces are dense and smooth, so they tolerate stronger simplification than the reference meshes.
             'simplify': {'ratio': .12, 'error': .003}, 'gzipOnly': True,
             # Voxel (i, j, k) of the study sits at ((-i·sx + o0), (k·sz + o1), (j·sy + o2)) / 1000 in the scene, so slices line up exactly.
             'volume': {'offset': offset.round(4).tolist(), 'spacing': list(spacing), 'shape': study['shape']}}
    if study.get('groups'):
        # Muscles wrapping the head would hide the brain, so that group starts switched off.
        model['groups'] = [{**g, 'hidden': True} if g['id'] == 'muscles' else g for g in study['groups']]
    with open(os.path.join(out_dir, f'{sid}.json'), 'w') as f:
        json.dump(model, f, separators=(',', ':'))
    print(f"{sid}: {len(parts)} surfaces, {model['triangles']:,} triangles, {sum(c['bytes'] for c in chunks) / 1e6:.1f} MB before optimisation")


if __name__ == '__main__':
    main(sys.argv[1])
