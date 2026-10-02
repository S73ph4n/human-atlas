/** Interface language. English strings are their own keys: t('Find a structure') looks the text up in the French table
 *  and falls back to the English when an entry is missing, so an untranslated string shows in English rather than as a
 *  key. {name} placeholders are filled from vars. Structure names come from a separate table (public/i18n/names.fr.json),
 *  loaded the first time French is chosen; scripts/validate-i18n.mjs checks both tables against the app and the data. */
export type Locale='en'|'fr';
export const LOCALES:{id:Locale;name:string}[]=[{id:'en',name:'English'},{id:'fr',name:'Français'}];
export function detectLocale():Locale{try{return navigator.language.toLowerCase().startsWith('fr')?'fr':'en';}catch{return 'en';}}

export interface T {
 (text:string,vars?:Record<string,string|number>):string;
 locale:Locale;
 /** Singular or plural by count: French takes the singular for 0 and 1, English only for 1. {n} is the formatted count. */
 n(count:number,one:string,other:string,vars?:Record<string,string|number>):string;
 /** A number in the reader's notation (2 234 and 1,5 in French). */
 num(value:number,digits?:number):string;
}
export function translator(locale:Locale):T{
 const table=locale==='fr'?FR:null,format=locale==='fr'?'fr-FR':'en-US';
 const num=(value:number,digits=0)=>value.toLocaleString(format,{minimumFractionDigits:digits,maximumFractionDigits:digits});
 const t=((text:string,vars?:Record<string,string|number>)=>{const out=table?.[text]??text;return vars?out.replace(/\{(\w+)\}/g,(m,k:string)=>k in vars?String(vars[k]):m):out;}) as T;
 t.locale=locale;t.num=num;
 t.n=(count,one,other,vars)=>t((locale==='fr'?count<2:count===1)?one:other,{n:num(count),...vars});
 return t;
}

/** Structure names: English name (any case) → French. A name the table lacks stays in English. */
let namesFr:Promise<Map<string,string>>|null=null;
export function loadNames(locale:Locale):Promise<Map<string,string>|null>{
 if(locale==='en')return Promise.resolve(null);
 namesFr??=fetch('/i18n/names.fr.json').then(r=>r.ok?r.json():{}).catch(()=>({})).then((json:Record<string,string>)=>new Map(Object.entries(json)));
 return namesFr;
}
/** Keeps the source's capitalisation: "Left femur" → "Fémur gauche", "left femur" → "fémur gauche". */
export function nameTranslator(table:Map<string,string>|null){
 return (name:string)=>{const fr=table?.get(name.toLowerCase().trim());if(!fr)return name;return /^\p{Lu}/u.test(name)?fr[0].toUpperCase()+fr.slice(1):fr;};
}

export const FR:Record<string,string>={
 // Header and panels
 'INTERACTIVE ANATOMY':'ANATOMIE INTERACTIVE',
 'CT':'TDM','MRI':'IRM',
 '{n} label':'{n} étiquette','{n} labels':'{n} étiquettes',
 '{n} surface':'{n} surface','{n} surfaces':'{n} surfaces',
 'from CT labels':'d’après les étiquettes TDM','from MRI labels':'d’après les étiquettes IRM',
 '{n} modeled piece':'{n} pièce modélisée','{n} modeled pieces':'{n} pièces modélisées',
 'Explorer panels':'Panneaux de l’explorateur','View':'Vue','3D anatomy':'Anatomie 3D',
 'The reference bodies have no CT or MRI images':'Les corps de référence n’ont pas d’images TDM ni IRM',
 'CT slices':'Coupes TDM','MRI slices':'Coupes IRM','Quiz':'Quiz',
 'Name the structure the arrow points to':'Nommez la structure désignée par la flèche',
 'Search anatomy':'Rechercher dans l’anatomie','Find a structure':'Trouver une structure',
 'Settings':'Réglages','About this atlas':'À propos de cet atlas',
 'Anatomical layers':'Couches anatomiques','Labels':'Étiquettes','Systems':'Systèmes','Close systems':'Fermer les systèmes','Study':'Étude',
 'Show 3D anatomy':'Afficher l’anatomie 3D','Show 3D anatomy around the slice':'Afficher l’anatomie 3D autour de la coupe',
 'Show label overlay':'Afficher les étiquettes','Opacity':'Opacité','Label opacity':'Opacité des étiquettes',
 'All':'Tout','None':'Aucun','Skeleton':'Squelette','Organs':'Organes',
 'Show only {name}':'Afficher uniquement : {name}','Show {name}':'Afficher : {name}',
 'Hidden structures':'Structures masquées','Show all':'Tout afficher','Hide all':'Tout masquer',
 '{n} label shown':'{n} étiquette affichée','{n} labels shown':'{n} étiquettes affichées',
 '{n} piece visible':'{n} pièce visible','{n} pieces visible':'{n} pièces visibles',
 // Search
 'Find a labelled structure':'Trouver une structure étiquetée','Close search':'Fermer la recherche',
 'Thalamus, hippocampus, cerebellum…':'Thalamus, hippocampe, cervelet…','Liver, L3 vertebra, aorta…':'Foie, vertèbre L3, aorte…',
 'Search labelled structures':'Rechercher les structures étiquetées','No labelled structures match.':'Aucune structure étiquetée ne correspond.',
 'model':'modèle','Choosing a structure moves the slice to its centre.':'Choisir une structure place la coupe en son centre.',
 'Find anatomy':'Rechercher dans l’anatomie','Heart, femur, cranial nerve…':'Cœur, fémur, nerf crânien…',
 'Search named anatomical structures':'Rechercher les structures anatomiques nommées','No structures match your search.':'Aucune structure ne correspond à votre recherche.',
 '{n} piece':'{n} pièce','{n} pieces':'{n} pièces',
 'Showing up to 80 matches. Refine your search to find smaller structures.':'Jusqu’à 80 résultats affichés. Précisez votre recherche pour trouver des structures plus petites.',
 'Start with a major organ, or search every named structure.':'Commencez par un organe majeur, ou cherchez parmi toutes les structures nommées.',
 // Settings
 'Close settings':'Fermer les réglages','Language':'Langue',
 'Slice planes':'Plans de coupe','Questions are cut on these planes only.':'Les questions portent uniquement sur ces plans.',
 'Ask {plane} questions':'Poser des questions en coupe {plane}','Structure types':'Types de structures',
 'The structure asked about and the three wrong answers both come from the types left on.':'La structure demandée et les trois mauvaises réponses proviennent des types activés.',
 'Quiz {name}':'Interroger : {name}',
 'Open a CT or MRI study to choose which of its structure types are quizzed. Every study keeps its own list of types; what you turn off here stays off wherever it appears.':'Ouvrez une étude TDM ou IRM pour choisir les types de structures interrogés. Chaque étude a sa propre liste de types ; ce que vous désactivez ici le reste partout où il apparaît.',
 'Label quality':'Qualité des étiquettes',
 'Some labels — most of the head and neck ones — were generated by the TotalSegmentator model and never checked by an expert.':'Certaines étiquettes — la plupart de celles de la tête et du cou — ont été générées par le modèle TotalSegmentator sans vérification par un expert.',
 'Ask about generated labels':'Interroger sur les étiquettes générées','Ask about model-generated labels':'Interroger sur les étiquettes générées par le modèle',
 '{n} of {total} structures can be asked':'{n} structures sur {total} peuvent être demandées','Settings apply to every study':'Les réglages s’appliquent à toutes les études',
 'Reset':'Réinitialiser',
 // Camera
 'Camera controls':'Contrôles de la caméra','Three-quarter view':'Vue de trois quarts','Front view':'Vue de face','Side view':'Vue de profil','Back view':'Vue de dos',
 '¾':'¾','F':'F','S':'P','B':'D',
 'Pause rotation':'Mettre la rotation en pause','Rotate body':'Faire tourner le corps','Auto rotate':'Rotation automatique',
 'X-ray view':'Vue radiographique','X-ray: see the selected structures through the body (X)':'Radio : voir les structures sélectionnées à travers le corps (X)',
 'Reset view and layers':'Réinitialiser la vue et les couches',
 'Hide panel':'Masquer le panneau','Hide controls':'Masquer les commandes','Show controls':'Afficher les commandes','Controls':'Commandes',
 'Hide camera controls':'Masquer les contrôles de la caméra','Show camera controls':'Afficher les contrôles de la caméra','Collapse the quiz':'Réduire le quiz','Expand the quiz':'Déplier le quiz',
 'Radiograph view':'Radiographie reconstruite','Radiograph: the CT projected through the body, as an X-ray beam would see it':'Radiographie : la TDM projetée à travers le corps, comme la verrait un faisceau de rayons X',
 'RADIOGRAPH PROJECTED FROM THE CT':'RADIOGRAPHIE PROJETÉE DEPUIS LA TDM',
 // Quiz
 'Radioanatomy quiz':'Quiz de radioanatomie','QUESTION {n} · {plane}':'QUESTION {n} · {plane}','{right}/{asked} correct':'{right}/{asked} correctes',
 'Nothing left to ask about.':'Plus rien à demander.','Preparing a question…':'Préparation d’une question…',
 'Which structure does the arrow point to?':'Quelle structure la flèche désigne-t-elle ?','Correct.':'Exact.',
 'Not quite — it is the {name}.':'Pas tout à fait — il s’agit de : {name}.',
 'No slice plane is selected.':'Aucun plan de coupe n’est sélectionné.',
 'Fewer than two structures of the selected types are labelled in {study}.':'Moins de deux structures des types sélectionnés sont étiquetées dans l’étude {study}.',
 'Answers':'Réponses','Show it labelled, with details':'Voir avec les étiquettes et les détails','Next question':'Question suivante',
 'Change the quiz settings':'Modifier les réglages du quiz','Skip this one':'Passer',
 'This label was generated by the TotalSegmentator model and has not been checked by an expert.':'Cette étiquette a été générée par le modèle TotalSegmentator et n’a pas été vérifiée par un expert.',
 // Caption
 '{modality} · {plane} · SLICE {n} / {total}':'{modality} · {plane} · COUPE {n} / {total}','{window} WINDOW':'FENÊTRE {window}',
 'SELECTED STRUCTURE':'STRUCTURE SÉLECTIONNÉE','{plane} SLICE · {position}':'COUPE {plane} · {position}',
 'ANATOMICAL INVENTORY':'INVENTAIRE ANATOMIQUE','SEPARATED STRUCTURES':'STRUCTURES SÉPARÉES',
 'RECONSTRUCTED FROM CT LABELS':'RECONSTRUIT D’APRÈS LES ÉTIQUETTES TDM','RECONSTRUCTED FROM MRI LABELS':'RECONSTRUIT D’APRÈS LES ÉTIQUETTES IRM',
 'ADULT HUMAN · FEMALE':'HUMAIN ADULTE · FEMME','ADULT HUMAN · MALE':'HUMAIN ADULTE · HOMME',
 'Midline':'Ligne médiane','{cm} cm':'{cm} cm','{cm} cm ant.':'{cm} cm ant.','{cm} cm post.':'{cm} cm post.','{cm} cm left':'{cm} cm à gauche','{cm} cm right':'{cm} cm à droite',
 // Dock
 'Open system layers':'Ouvrir les couches','CT plane':'Plan de coupe','Slice layout':'Disposition des coupes',
 'Show all three planes':'Afficher les trois plans','Show axial, coronal and sagittal together':'Afficher les coupes axiale, coronale et sagittale ensemble',
 'Show reticle':'Afficher le réticule','Reticle: where the three slice planes cross, shared with the 2D view; tap a slice to move it':'Réticule : là où les trois plans de coupe se croisent, partagé avec la vue 2D ; touchez une coupe pour le déplacer','Reticle: drag it or tap to move the point where the planes cross':'Réticule : faites-le glisser ou touchez l’image pour déplacer le point où les plans se croisent',
 '{plane} slice':'Coupe {plane}','MRI sequence':'Séquence IRM','{name}-weighted':'Pondération {name}','CT window':'Fenêtre TDM',
 'Window {width} / level {level} HU':'Fenêtre {width} / niveau {level} UH','Slice plane':'Plan de coupe','{plane} slice position':'Position de la coupe {plane}',
 '[ ] to step':'[ ] pour avancer','Explode anatomy':'Éclater l’anatomie','Assembled':'Assemblé','Every piece':'Toutes les pièces',
 'Stop slicing':'Arrêter la coupe','Slice anatomy':'Couper l’anatomie','Slice along CT planes ([ and ] step 1 mm)':'Couper selon les plans TDM ([ et ] avancent de 1 mm)',
 'Slice':'Coupe','Assemble and reset':'Assembler et réinitialiser',
 'Inferior':'Inférieur','Superior':'Supérieur','Posterior':'Postérieur','Anterior':'Antérieur','Right':'Droite','Left':'Gauche','Feet':'Pieds','Head':'Tête',
 // Footer and status
 'Drag to move the reticle':'Glisser pour déplacer le réticule','Scroll or [ ] to change slice':'Molette ou [ ] pour changer de coupe',
 'Ctrl + scroll or pinch to zoom':'Ctrl + molette ou pincer pour zoomer','Tap to inspect':'Toucher pour examiner',
 'Drag to pan':'Glisser pour déplacer','Drag to orbit':'Glisser pour tourner','Pinch to zoom':'Pincer pour zoomer','Source & credits':'Sources et crédits',
 'Loading the {modality} study':'Chargement de l’étude {modality}','{p}% · {study} images and labels':'{p} % · {study} : images et étiquettes',
 'Preparing the anatomy':'Préparation de l’anatomie','{p}% · Loading {n} pieces':'{p} % · Chargement de {n} pièces','Reload viewer':'Recharger la visionneuse',
 'The anatomy catalogue could not be loaded.':'Le catalogue anatomique n’a pas pu être chargé.','The study could not be loaded.':'L’étude n’a pas pu être chargée.',
 'This browser could not start the 3D viewer. Please try a browser with WebGL enabled.':'Ce navigateur n’a pas pu démarrer la visionneuse 3D. Essayez un navigateur avec WebGL activé.',
 'Could not load the anatomy.':'L’anatomie n’a pas pu être chargée.','The 3D session was paused by your device. Reload to continue.':'La session 3D a été suspendue par votre appareil. Rechargez pour continuer.',
 'Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.':'Anatomie humaine interactive. Glissez pour tourner, pincez ou utilisez la molette pour zoomer, et touchez une structure pour l’examiner.',
 'CT slice. Scroll to move through slices, Ctrl or ⌘ and scroll to zoom, drag to pan when zoomed, and tap a labelled structure to inspect it.':'Coupe d’imagerie. Molette pour parcourir les coupes, Ctrl ou ⌘ et molette pour zoomer, glisser pour déplacer après un zoom, et toucher une structure étiquetée pour l’examiner.',
 // Details
 'ANATOMY':'ANATOMIE','Close':'Fermer',
 'System overview · structure identified from source anatomy':'Vue d’ensemble du système · structure identifiée dans l’anatomie source',
 'Atlas reference':'Référence de l’atlas','Selected pieces':'Pièces sélectionnées','Included structures':'Structures incluses',
 'And {n} more modeled pieces.':'Et {n} autres pièces modélisées.',
 'Reconstructed from a label generated by the TotalSegmentator model; not checked by an expert.':'Reconstruit d’après une étiquette générée par le modèle TotalSegmentator ; non vérifié par un expert.',
 'Show in {modality} slices':'Voir dans les coupes {modality}','View anatomical source':'Voir la source anatomique',
 'Show surrounding anatomy':'Afficher l’anatomie environnante','Isolate structure':'Isoler la structure',
 'Hide this structure to see what lies beneath (H)':'Masquer cette structure pour voir ce qu’il y a dessous (H)','Hide structure':'Masquer la structure','Clear selection':'Effacer la sélection',
 'System overview · {source}':'Vue d’ensemble du système · {source}','label predicted by the TotalSegmentator model':'étiquette prédite par le modèle TotalSegmentator',
 'label from the {credit} data':'étiquette issue des données {credit}','Atlas value':'Valeur de l’atlas','Label':'Étiquette','Volume':'Volume','{v} mL':'{v} mL',
 'This label was generated automatically by the TotalSegmentator model and has not been checked by an expert.':'Cette étiquette a été générée automatiquement par le modèle TotalSegmentator et n’a pas été vérifiée par un expert.',
 'Show in 3D':'Voir en 3D','Go to centre':'Aller au centre',
 'From the article on the general structure.':'D’après l’article sur la structure générale.','Wikipedia · {article}':'Wikipédia · {article}',
 // Facts fields
 'Latin':'Latin','Greek':'Grec','System':'Système','Part of':'Fait partie de','Origin':'Origine','Insertion':'Terminaison','Action':'Action','Antagonist':'Antagoniste',
 'Artery':'Artère','Vein':'Veine','Nerve':'Nerf','Lymph':'Lymphe','Supplies':'Vascularise','Drains from':'Draine','Drains to':'Se draine dans','Branches':'Branches','Branch of':'Branche de','Precursor':'Précurseur',
 // Slice planes
 'Axial':'Axiale','Coronal':'Coronale','Sagittal':'Sagittale',
 // Models and studies
 'Reference body · male (BodyParts3D)':'Corps de référence · homme (BodyParts3D)','Reference body · female (HRA)':'Corps de référence · femme (HRA)',
 'CT · Chest – pelvis':'TDM · Thorax – pelvis','CT · Head & neck':'TDM · Tête et cou','CT · Inner ear atlas':'TDM · Atlas de l’oreille interne',
 'MRI · Brain atlas':'IRM · Atlas du cerveau','MRI · Abdomen (AMOS)':'IRM · Abdomen (AMOS)','MRI · Knee atlas':'IRM · Atlas du genou',
 'Chest – pelvis':'Thorax – pelvis','Head & neck':'Tête et cou','Inner ear atlas':'Atlas de l’oreille interne','Brain atlas':'Atlas du cerveau','Abdomen':'Abdomen','Knee atlas':'Atlas du genou',
 'Labels come from the TotalSegmentator dataset and can be imprecise at boundaries.':'Les étiquettes proviennent du jeu de données TotalSegmentator et peuvent être imprécises aux limites.',
 'Label from the SPL Inner Ear Atlas, segmented by experts on a high-resolution CT of one ear.':'Étiquette de l’atlas de l’oreille interne du SPL, segmentée par des experts sur une TDM haute résolution d’une oreille.',
 'Label from the SPL/PNL/NAC Brain Atlas, segmented and refined by experts on one healthy volunteer.':'Étiquette de l’atlas du cerveau SPL/PNL/NAC, segmentée et affinée par des experts chez un volontaire sain.',
 'Label from the AMOS dataset, annotated by radiologists on a clinical MRI.':'Étiquette du jeu de données AMOS, annotée par des radiologues sur une IRM clinique.',
 'Label from the SPL Knee Atlas, segmented by experts on the MRI of one left knee.':'Étiquette de l’atlas du genou du SPL, segmentée par des experts sur l’IRM d’un genou gauche.',
 'Soft tissue':'Tissus mous','Lung':'Poumon','Bone':'Os','Brain':'Cerveau','Temporal bone':'Os temporal',
 // Body systems
 'Muscles':'Muscles','Heart':'Cœur','Sensory organs':'Organes des sens','Arteries':'Artères','Veins':'Veines','Nervous system':'Système nerveux',
 'Respiratory':'Respiratoire','Digestive':'Digestif','Urinary':'Urinaire','Lymphatic':'Lymphatique','Endocrine':'Endocrinien','Reproductive':'Reproducteur',
 'Body surface':'Surface du corps','Connective tissue':'Tissu conjonctif','Pregnancy reference':'Référence de grossesse',
 'Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.':'Les os forment la charpente du corps, protègent les organes et offrent des points d’attache aux muscles. Leur tissu interne stocke aussi des minéraux et produit les cellules sanguines.',
 'Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.':'Les muscles squelettiques produisent le mouvement en tirant sur leurs attaches. Avec les tendons, ils mobilisent les articulations, stabilisent la posture et produisent de la chaleur.',
 'The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.':'Le cœur est une pompe musculaire à quatre cavités. Ses valves dirigent le sang vers l’avant dans les circulations pulmonaire et systémique.',
 'These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.':'Ces structures participent aux sens spéciaux, dont la vue, l’audition et l’équilibre. Leurs tissus spécialisés détectent les stimulus et transmettent l’information avec le système nerveux.',
 'The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.':'Le cœur propulse le sang dans la circulation. Les artères emmènent le sang loin du cœur pour irriguer les tissus ou, dans la circulation pulmonaire, les poumons.',
 'Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.':'Les veines ramènent le sang vers le cœur. Des réseaux superficiels et profonds collectent le sang des tissus ; les veines pulmonaires rapportent le sang oxygéné des poumons.',
 'The brain, spinal cord, and peripheral nerves carry and process signals. They support sensation, movement, coordination, and automatic regulation of body functions.':'L’encéphale, la moelle spinale et les nerfs périphériques transmettent et traitent les signaux. Ils assurent la sensibilité, le mouvement, la coordination et la régulation automatique des fonctions du corps.',
 'The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.':'Les voies aériennes conduisent l’air jusqu’aux poumons, où l’oxygène et le dioxyde de carbone passent entre l’air et le sang. La respiration repose sur les variations de pression produites par les muscles respiratoires.',
 'The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.':'Le tube digestif décompose les aliments, absorbe les nutriments et l’eau, et fait progresser les déchets. Les organes annexes apportent la bile et les enzymes digestives.',
 'The kidneys filter blood and regulate fluid, electrolyte, and acid–base balance. Urine travels through the ureters to the bladder and exits through the urethra.':'Les reins filtrent le sang et régulent les équilibres hydrique, électrolytique et acido-basique. L’urine descend par les uretères jusqu’à la vessie et sort par l’urètre.',
 'Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.':'Les vaisseaux lymphatiques ramènent l’excès de liquide tissulaire dans la circulation. Les nœuds lymphatiques et les autres organes lymphoïdes assurent la surveillance et les réponses immunitaires.',
 'Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.':'Les organes endocriniens libèrent des hormones dans le sang pour coordonner le métabolisme, la croissance, la réponse au stress et la reproduction.',
 'Reproductive structures produce and transport gametes and produce sex hormones. The male reference shows the testes, ducts, prostate, and penis; the female reference shows the ovaries, uterine tubes, uterus, and vagina.':'Les structures reproductrices produisent et transportent les gamètes et sécrètent les hormones sexuelles. La référence masculine montre les testicules, les conduits, la prostate et le pénis ; la référence féminine montre les ovaires, les trompes utérines, l’utérus et le vagin.',
 'The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.':'La surface du corps sert de repère anatomique externe. Le système tégumentaire forme une barrière protectrice et participe à la sensibilité et à la régulation de la température.',
 'Cartilage, ligaments, and other connective tissues support, connect, and separate structures. Their roles include stabilizing joints and distributing mechanical loads.':'Le cartilage, les ligaments et les autres tissus conjonctifs soutiennent, relient et séparent les structures. Ils stabilisent notamment les articulations et répartissent les contraintes mécaniques.',
 'The placenta and umbilical cord support exchange between maternal and fetal circulations during pregnancy. These reference structures are shown separately from the default adult anatomy.':'Le placenta et le cordon ombilical assurent les échanges entre les circulations maternelle et fœtale pendant la grossesse. Ces structures de référence sont présentées à part de l’anatomie adulte par défaut.',
 // Short explanations
 'A muscular pump in the chest. Its right side sends blood to the lungs; its left side sends blood through the systemic circulation.':'Une pompe musculaire située dans le thorax. Sa partie droite envoie le sang vers les poumons ; sa partie gauche l’envoie dans la circulation systémique.',
 'A large organ beneath the right side of the diaphragm. It processes absorbed nutrients, produces bile, and synthesizes many proteins carried in the blood.':'Un organe volumineux situé sous la partie droite du diaphragme. Il traite les nutriments absorbés, produit la bile et synthétise de nombreuses protéines du sang.',
 'The central organ of the nervous system. Its interconnected regions support perception, movement, memory, language, and the regulation of bodily functions.':'L’organe central du système nerveux. Ses régions interconnectées assurent la perception, le mouvement, la mémoire, le langage et la régulation des fonctions du corps.',
 'A muscular chamber between the esophagus and small intestine. It stores and mixes food with acid and enzymes before releasing it into the duodenum.':'Une poche musculaire entre l’œsophage et l’intestin grêle. Il stocke les aliments et les mélange à l’acide et aux enzymes avant de les libérer dans le duodénum.',
 'A lymphoid organ in the upper left abdomen. It filters blood, removes aging blood cells, and participates in immune responses.':'Un organe lymphoïde de la partie supérieure gauche de l’abdomen. Elle filtre le sang, élimine les cellules sanguines vieillissantes et participe aux réponses immunitaires.',
 'An abdominal organ with digestive and endocrine roles. It supplies enzymes to the small intestine and releases hormones including insulin and glucagon.':'Un organe abdominal aux fonctions digestive et endocrine. Il fournit des enzymes à l’intestin grêle et libère des hormones, dont l’insuline et le glucagon.',
 'A muscular reservoir in the pelvis that stores urine arriving from the kidneys through the ureters.':'Un réservoir musculaire du pelvis qui stocke l’urine venue des reins par les uretères.',
 'The main airway connecting the larynx to the bronchi. Its cartilage supports keep the airway open during breathing.':'La principale voie aérienne reliant le larynx aux bronches. Ses anneaux cartilagineux la maintiennent ouverte pendant la respiration.',
 'A broad muscle separating the chest and abdomen. When it contracts, it increases chest volume and helps draw air into the lungs.':'Un large muscle qui sépare le thorax de l’abdomen. En se contractant, il augmente le volume du thorax et aide à faire entrer l’air dans les poumons.',
};
