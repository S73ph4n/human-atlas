# Anatomy data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The source contains 2,234 individual OBJ meshes; all remain represented. The combined hierarchy contains 3,432 named FMA concepts, which may reference multiple meshes. Original source identity is preserved in the manifest.

Source OBJ comments mention an older CC BY-SA 2.1 Japan license. The official current database license linked above supersedes that legacy text and explicitly permits redistribution and adaptation under CC BY 4.0.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## CT radioanatomy data

TotalSegmentator dataset v2.0.1, subjects `s0476` (chest to pelvis) and `s0777` (head and neck), by Jakob Wasserthal et al., licensed under CC Attribution 4.0 International.

- Dataset: https://zenodo.org/records/10047292
- License terms: https://creativecommons.org/licenses/by/4.0/
- Publication: Wasserthal et al. (2023), TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. Radiology: Artificial Intelligence. https://doi.org/10.1148/ryai.230024

Adaptations: reoriented to RAS voxel order; cropped to the body, with the scanner table and surrounding air set to −1000 HU; intensities stored as one byte per voxel with piecewise-linear Hounsfield coding (precision concentrated in soft tissue); the 108 non-empty label masks merged into one label volume; display names and system groupings curated for this interface. Voxel spacing (1.5 mm isotropic) is unchanged. The study is a contrast-enhanced clinical CT of an adult male from the lower neck to the upper thighs; labels are dataset annotations and can be imprecise at boundaries.

The head and neck study `s0777` is cropped from a contrast-enhanced whole-body trauma CT of an adult male, keeping the region from the third thoracic vertebra to the vertex. Intensities are stored as 16-bit HU + 1024 (unchanged values) so narrow windows such as brain keep full precision. It has 115 labels: 47 non-empty dataset labels and 68 labels generated for this viewer with the TotalSegmentator model (https://github.com/wasserth/TotalSegmentator, Apache 2.0) subtasks `head_glands_cavities`, `head_muscles`, `headneck_bones_vessels`, `headneck_muscles`, and `craniofacial_structures` (run on a head-only crop, then placed back in the full grid). Generated labels are drawn over dataset labels (for example, the mandible over the dataset skull), labels under 30 voxels are dropped, and generated labels are marked in the manifest. They are model predictions that have not been checked by an expert. The scan shows dental-filling streak artefacts and what appears to be a cervical collar.

## MRI brain atlas

All or portions of this licensed product (such portions are the "Software") have been obtained under license from The Brigham and Women's Hospital, Inc. and are subject to the following terms and conditions: the [3D Slicer License](https://github.com/Slicer/Slicer/blob/main/License.txt).

- Atlas: SPL/PNL/NAC Brain Atlas, release `brain-2017-01`, Open Anatomy Project (https://www.openanatomy.org/atlas-pages/atlas-spl-nac-brain.html), developed by the Surgical Planning Laboratory and the Psychiatry Neuroimaging Laboratory, Brigham and Women's Hospital, with support from NIH grants P41 EB015902, P41 RR013218 and R01 MH050740.
- Reference: http://www.spl.harvard.edu/publications/item/view/1265
- Download: https://www.openanatomy.org/atlases/nac/brain-2017-01.zip

This is a modified version, not the original atlas: the 1 mm T1- and T2-weighted MRI and the label map were cropped to the labelled head, reoriented to RAS, the MRI intensities robustly rescaled to 8 bits per series, and the 311 named label values renumbered; names and hierarchy come from the atlas's `atlasStructure.json`, cerebellar lobule codes are expanded into readable names, and the viewer's region groups are curated for this interface. The atlas represents one healthy volunteer. It is for education and research only and not for clinical use; the Brigham and Women's Hospital does not endorse this application. The license notice is also shipped with the data in `public/mri/spl-brain/LICENSE.txt`.

## Historical assets (not included in the current release)

Earlier repository revisions included female reference anatomy: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). CC BY 4.0. Geometry adapted for this viewer.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage, coincident vertices welded and source normals averaged, geometry simplified with a 0.2% per-structure relative error bound, and normals quantized. Colors and display systems are curated for this interface. All 888 source meshes are represented, with 1,073 source nodes available as selectable individual or compound concepts.

This is a reference assembly with whole-body surface and selected organs, including female reproductive anatomy. Its skeleton and muscle coverage is partial. It is not a complete model of every human structure or a single-person scan. Eight placenta/umbilical structures are classified under Pregnancy reference and hidden by default.
