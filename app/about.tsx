import type {ReactNode} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {SheetTitle,SheetDescription} from '@/components/ui/sheet';
import type {Locale} from './i18n';

/** Sources and licences, one version per language: the credits are prose with links, so they are written out in full
 *  rather than assembled from translated fragments. */
export default function AboutContent({locale}:{locale:Locale}){
 return locale==='fr'?<AboutFr/>:<AboutEn/>;
}

const Link=({href,children}:{href:string;children:ReactNode})=><a href={href} target="_blank" rel="noreferrer">{children} <ArrowUpRight size={14}/></a>;

function AboutEn(){
 return <><div className="eyebrow">SOURCE & SCOPE</div><SheetTitle className="structure-title">A body, revealed.</SheetTitle><SheetDescription>Explore male and female reference anatomy, CT and MRI studies, and 3D models reconstructed from them.</SheetDescription><div className="about-copy">
  <p><strong>Male · BodyParts3D</strong><br/>2,234 individual meshes and 3,432 named concepts from an adult male reference anatomy.</p>
  <p>This reference does not contain every human structure or variation. Named concepts can contain multiple pieces; each source mesh is rendered once.</p>
  <p>Colors and system groupings are designed for exploration. The geometry is simplified for the web, and short explanations provide general educational context. This is an anatomical reference, not a diagnostic or surgical tool.</p>
  <h3>Source</h3><p>BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.</p>
  <Link href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html">Dataset license</Link><Link href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html">Original geometry & metadata</Link><Link href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752">Read the source publication</Link>
  <h3>Female reference body</h3><p>Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, 3D Reference Organ Set for Female v1.5 (2023), licensed under CC Attribution 4.0 International. A reference assembly of the body surface and selected organs, including female reproductive anatomy, with partial skeleton and muscle coverage. Eight placenta and umbilical structures are grouped as Pregnancy reference and hidden by default.</p>
  <Link href="https://doi.org/10.48539/HBM352.BTSQ.586">HRA female reference organs</Link>
  <h3>CT radioanatomy</h3><p>Two contrast-enhanced CT studies from the TotalSegmentator dataset v2.0.1 by Wasserthal et al., licensed under CC Attribution 4.0 International: subject s0476 (neck to upper thighs, 108 labelled structures) and subject s0777 (head and neck, cropped from a whole-body trauma scan, 115 labelled structures). Voxels are 1.5 mm; images are cropped to the body and the scanner table is removed.</p>
  <p>68 of the head and neck labels (glands, eyes, pharynx, muscles, larynx cartilages, jugular veins, mandible, teeth, and sinuses) were generated with the TotalSegmentator model (Apache 2.0) and have not been checked by an expert; they are marked in each structure's details.</p>
  <Link href="https://github.com/wasserth/TotalSegmentator">TotalSegmentator model</Link>
  <h3>MRI brain atlas</h3><p>The SPL/PNL/NAC Brain Atlas (brain-2017-01) from the Open Anatomy Project: T1- and T2-weighted MRI of one healthy volunteer at 1 mm, with 311 labelled structures segmented and refined by experts over many years at the Surgical Planning Laboratory and Psychiatry Neuroimaging Laboratory, Brigham and Women's Hospital. All or portions of this licensed product have been obtained under license from The Brigham and Women's Hospital, Inc. and are subject to the 3D Slicer License. This is a modified version (cropped, reoriented, intensities rescaled, labels renumbered), not the original atlas, and it is for education and research only.</p>
  <Link href="https://www.openanatomy.org/atlas-pages/atlas-spl-nac-brain.html">SPL/NAC Brain Atlas</Link><Link href="https://github.com/Slicer/Slicer/blob/main/License.txt">3D Slicer License</Link><Link href="https://zenodo.org/records/10047292">TotalSegmentator dataset</Link><Link href="https://pubs.rsna.org/doi/10.1148/ryai.230024">Read the TotalSegmentator publication</Link>
  <h3>Knee and inner ear atlases</h3><p>The SPL Knee Atlas (knee-2016-09; MRI of one left knee, 48 structures) and the SPL Inner Ear Atlas (inner-ear-2018-02; high-resolution flat-panel CT by S. Bartling, M. Jakab and R. Kikinis, DKFZ and SPL, 15 structures) from the Open Anatomy Project, under the same 3D Slicer License and Brigham and Women's Hospital notice as the brain atlas. Both are modified versions: resampled to isotropic voxels, cropped, reoriented, intensities recoded, labels renumbered.</p>
  <Link href="https://www.openanatomy.org/atlas-pages/">Open Anatomy atlases</Link>
  <h3>Abdominal MRI</h3><p>Case amos_0590 of the AMOS dataset (Ji et al., NeurIPS 2022): a contrast-enhanced abdominal MRI with 13 organs annotated by radiologists, licensed under CC Attribution-ShareAlike 4.0. The adapted images, labels and 3D model are shared under the same license.</p>
  <Link href="https://zenodo.org/records/7262581">AMOS dataset</Link>
  <h3>3D reconstructions</h3><p>The CT and MRI 3D models are surfaces reconstructed here from each study's label volume (marching cubes after light smoothing, then simplification). They inherit their study's source, license and label accuracy, and show one person's anatomy, not the reference body.</p>
  <h3>Wikipedia</h3><p>Structure summaries and infobox facts come from English Wikipedia (CC BY-SA 4.0) through Wikidata (CC0); each one links to its article.</p>
 </div></>;
}

function AboutFr(){
 return <><div className="eyebrow">SOURCES ET PÉRIMÈTRE</div><SheetTitle className="structure-title">Un corps, dévoilé.</SheetTitle><SheetDescription>Explorez l’anatomie de référence masculine et féminine, des études TDM et IRM, et les modèles 3D reconstruits à partir de celles-ci.</SheetDescription><div className="about-copy">
  <p><strong>Homme · BodyParts3D</strong><br/>2 234 maillages et 3 432 concepts nommés issus d’une anatomie de référence d’homme adulte.</p>
  <p>Cette référence ne contient pas toutes les structures ni toutes les variations humaines. Un concept nommé peut regrouper plusieurs pièces ; chaque maillage source n’est affiché qu’une fois.</p>
  <p>Les couleurs et les regroupements par système sont pensés pour l’exploration. La géométrie est simplifiée pour le web et les explications courtes donnent un contexte pédagogique général. Il s’agit d’une référence anatomique, pas d’un outil diagnostique ou chirurgical.</p>
  <h3>Source</h3><p>BodyParts3D, © The Database Center for Life Science, sous licence CC Attribution 4.0 International.</p>
  <Link href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html">Licence du jeu de données</Link><Link href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html">Géométrie et métadonnées d’origine</Link><Link href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752">Lire la publication source</Link>
  <h3>Corps de référence féminin</h3><p>Kristen Browne et Heidi Schlehlein, Human Reference Atlas / HuBMAP, 3D Reference Organ Set for Female v1.5 (2023), sous licence CC Attribution 4.0 International. Un assemblage de référence de la surface du corps et d’organes choisis, dont l’anatomie reproductrice féminine, avec une couverture partielle du squelette et des muscles. Huit structures placentaires et ombilicales sont regroupées sous « Référence de grossesse » et masquées par défaut.</p>
  <Link href="https://doi.org/10.48539/HBM352.BTSQ.586">Organes de référence féminins HRA</Link>
  <h3>Radioanatomie TDM</h3><p>Deux TDM avec injection de produit de contraste issues du jeu de données TotalSegmentator v2.0.1 de Wasserthal et al., sous licence CC Attribution 4.0 International : le sujet s0476 (du cou au haut des cuisses, 108 structures étiquetées) et le sujet s0777 (tête et cou, recadré à partir d’un scanner corps entier de traumatologie, 115 structures étiquetées). Les voxels mesurent 1,5 mm ; les images sont recadrées sur le corps et la table du scanner est retirée.</p>
  <p>68 des étiquettes de la tête et du cou (glandes, yeux, pharynx, muscles, cartilages du larynx, veines jugulaires, mandibule, dents et sinus) ont été générées par le modèle TotalSegmentator (Apache 2.0) sans vérification par un expert ; elles sont signalées dans le détail de chaque structure.</p>
  <Link href="https://github.com/wasserth/TotalSegmentator">Modèle TotalSegmentator</Link>
  <h3>Atlas IRM du cerveau</h3><p>L’atlas du cerveau SPL/PNL/NAC (brain-2017-01) de l’Open Anatomy Project : IRM pondérées T1 et T2 d’un volontaire sain à 1 mm, avec 311 structures segmentées et affinées par des experts pendant de nombreuses années au Surgical Planning Laboratory et au Psychiatry Neuroimaging Laboratory du Brigham and Women’s Hospital. Tout ou partie de ce produit sous licence a été obtenu sous licence auprès de The Brigham and Women’s Hospital, Inc. et est soumis à la licence 3D Slicer. Il s’agit d’une version modifiée (recadrée, réorientée, intensités remises à l’échelle, étiquettes renumérotées) et non de l’atlas original, réservée à l’enseignement et à la recherche.</p>
  <Link href="https://www.openanatomy.org/atlas-pages/atlas-spl-nac-brain.html">Atlas du cerveau SPL/NAC</Link><Link href="https://github.com/Slicer/Slicer/blob/main/License.txt">Licence 3D Slicer</Link><Link href="https://zenodo.org/records/10047292">Jeu de données TotalSegmentator</Link><Link href="https://pubs.rsna.org/doi/10.1148/ryai.230024">Lire la publication TotalSegmentator</Link>
  <h3>Atlas du genou et de l’oreille interne</h3><p>L’atlas du genou du SPL (knee-2016-09 ; IRM d’un genou gauche, 48 structures) et l’atlas de l’oreille interne du SPL (inner-ear-2018-02 ; TDM haute résolution à capteur plan de S. Bartling, M. Jakab et R. Kikinis, DKFZ et SPL, 15 structures), issus de l’Open Anatomy Project, sous la même licence 3D Slicer et la même mention du Brigham and Women’s Hospital que l’atlas du cerveau. Ce sont des versions modifiées : rééchantillonnées en voxels isotropes, recadrées, réorientées, intensités recodées, étiquettes renumérotées.</p>
  <Link href="https://www.openanatomy.org/atlas-pages/">Atlas Open Anatomy</Link>
  <h3>IRM abdominale</h3><p>Le cas amos_0590 du jeu de données AMOS (Ji et al., NeurIPS 2022) : une IRM abdominale avec injection, dont 13 organes ont été annotés par des radiologues, sous licence CC Attribution-ShareAlike 4.0. Les images, étiquettes et le modèle 3D adaptés sont partagés sous la même licence.</p>
  <Link href="https://zenodo.org/records/7262581">Jeu de données AMOS</Link>
  <h3>Reconstructions 3D</h3><p>Les modèles 3D TDM et IRM sont des surfaces reconstruites ici à partir du volume d’étiquettes de chaque étude (marching cubes après un léger lissage, puis simplification). Ils héritent de la source, de la licence et de la précision des étiquettes de leur étude, et montrent l’anatomie d’une seule personne, pas le corps de référence.</p>
  <h3>Traduction et Wikipédia</h3><p>Les noms des structures ont été traduits en français pour cet atlas ; un nom sans traduction reste en anglais. Les résumés viennent de Wikipédia en français (CC BY-SA 4.0) quand un article existe, sinon de Wikipédia en anglais ; les données d’infobox viennent de Wikipédia en anglais via Wikidata (CC0). Chaque résumé renvoie à son article.</p>
 </div></>;
}
