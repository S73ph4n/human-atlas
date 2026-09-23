"""Build the anatomy facts shown beside a selected structure, from Wikidata and Wikipedia.

Usage: python scripts/build-facts.py [dataset ...] [--cache DIR] [--report]
  dataset: reference, reference-female, s0476, s0777, spl-ear, spl-brain, amos-0590, spl-knee (default: all)

Output: public/facts/<dataset>.json, one entry per structure of that dataset, keyed by the conceptId the
viewer already uses (FMA59763 for the male body, UBERON:0002097 for the female one, s0476:aorta for a study).

Each structure resolves to a Wikidata item and, through it, to an English Wikipedia article:
  * the male body and the female body carry FMA and UBERON identifiers, which Wikidata indexes (P1402, P1554);
  * study labels carry only a name, so they match a Wikidata label or alias of an item that has such an identifier.
A structure whose own item has no article borrows the article of the nearest parent (subclass of, part of) that
has one, which is how "right deep cervical artery" reaches "Deep cervical artery"; the entry records that as
`via` so the viewer can say the article describes the general structure. Facts come from the article's anatomy
infobox (artery, vein, nerve, origin, insertion, action, …), the summary from its first paragraphs.

Wikidata is CC0. Wikipedia text is CC BY-SA 4.0 and each entry keeps the article title it came from; the viewer
links back to it. Responses are cached under work/facts-cache so a re-run costs nothing.
"""
import argparse, hashlib, http.client, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..')
CACHE = os.path.join(ROOT, 'work', 'facts-cache')
UA = 'human-atlas-facts/1.0 (https://github.com/S73ph4n/human-atlas)'
SPARQL = 'https://query.wikidata.org/sparql'
WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'
# Infobox fields worth showing, in the order the viewer lists them.
FIELDS = [
    ('latin', 'Latin'), ('greek', 'Greek'), ('system', 'System'), ('part_of', 'Part of'), ('origin', 'Origin'),
    ('insertion', 'Insertion'), ('action', 'Action'), ('antagonist', 'Antagonist'), ('artery', 'Artery'),
    ('vein', 'Vein'), ('nerve', 'Nerve'), ('lymph', 'Lymph'), ('supplies', 'Supplies'), ('drains_from', 'Drains from'),
    ('drains_to', 'Drains to'), ('branches', 'Branches'), ('source', 'Branch of'), ('precursor', 'Precursor'),
]
FIELD_ALIASES = {'actions': 'action', 'origins': 'origin', 'insertions': 'insertion', 'branchfrom': 'source',
                 'branchto': 'branches', 'innervation': 'nerve', 'blood': 'artery', 'venousdrainage': 'vein',
                 'lymphatics': 'lymph', 'partof': 'part_of', 'drainsfrom': 'drains_from', 'drainsto': 'drains_to'}
SUMMARY_CHARS = 420
VALUE_CHARS = 180
# Study label names that no Wikidata label or alias matches, or that match the wrong item.
SYNONYMS = {
    'erector spinae': 'erector spinae muscles', 'brachiocephalic trunk': 'brachiocephalic artery',
    'costal cartilages': 'costal cartilage', 'portal and splenic veins': 'hepatic portal vein',
    'tympanic membrane': 'eardrum', 'labyrinth': 'bony labyrinth', 'fenestra rotunda': 'round window',
    'fenestra ovalis': 'oval window', 'incus bone': 'incus', 'stapes bone': 'stapes', 'malleus bone': 'malleus',
    'infrapatellar fat body': 'infrapatellar fat pad', 'medial head gastrocnemius muscle': 'gastrocnemius muscle',
    'lateral head gastrocnemius muscle': 'gastrocnemius muscle', 'peroneus longus muscle': 'fibularis longus',
    'tibial collateral ligament': 'medial collateral ligament', 'patellar ligament': 'patellar tendon',
    'fibular collateral ligament': 'lateral collateral ligament of the knee',
    'anterior cruciate ligament of knee': 'anterior cruciate ligament',
    'posterior cruciate ligament of knee': 'posterior cruciate ligament',
    'aqueduct': 'cerebral aqueduct', 'white matter of cerebral hemisphere': 'cerebral white matter',
    'white matter of hemisphere of cerebellum': 'cerebellum', 'globus pallidus pars externa': 'globus pallidus',
    'globus pallidus pars interna': 'globus pallidus', 'temporal horn of lateral ventricle': 'lateral ventricle',
    'occipital horn of lateral ventricle': 'lateral ventricle', 'frontal horn of lateral ventricle': 'lateral ventricle',
    'body of lateral ventricle': 'lateral ventricle', 'atrium of lateral ventricle': 'lateral ventricle',
    'iliopsoas': 'iliopsoas muscle', 'autochthon': 'erector spinae muscles', 'spinal canal': 'spinal cavity',
    'skull': 'human skull', 'gluteus maximus': 'gluteus maximus muscle', 'gluteus medius': 'gluteus medius muscle',
    'gluteus minimus': 'gluteus minimus muscle', 'heart myocardium': 'cardiac muscle', 'atrial appendage': 'atrial appendage',
    'superior vena cava': 'superior vena cava', 'inferior vena cava': 'inferior vena cava',
    'thyroid gland': 'thyroid', 'urinary bladder': 'urinary bladder', 'spinal cord': 'spinal cord',
    'sternocleidomastoid': 'sternocleidomastoid muscle', 'thyroid cartilage': 'thyroid cartilage',
    'larynx air': 'larynx', 'larynx glottis': 'glottis', 'larynx supraglottic': 'larynx',
    'nasopharynx': 'nasopharynx', 'oropharynx': 'oropharynx', 'hypopharynx': 'hypopharynx',
    'subcutaneous fat': 'subcutaneous tissue', 'torso fat': 'adipose tissue', 'skeletal muscle': 'skeletal muscle',
    'peroneus nerve': 'common fibular nerve', 'tibialis nerve': 'tibial nerve',
    'muscular branches tibialis nerve': 'tibial nerve', 'medial sural cutaneous nerve': 'sural nerve',
    'superior medial genicular artery': 'popliteal artery', 'inferior medial genicular artery': 'popliteal artery',
    'superior lateral genicular artery': 'popliteal artery', 'inferior lateral genicular artery': 'popliteal artery',
    'femoral cartilage': 'articular cartilage', 'lateral tibial cartilage': 'articular cartilage',
    'medial tibial cartilage': 'articular cartilage', 'patellar cartilage': 'articular cartilage',
    'lateral meniscus': 'lateral meniscus', 'medial meniscus': 'medial meniscus', 'iliotibial tract': 'iliotibial tract',
    'pellucid septum': 'septum pellucidum', 'part of midbrain': 'midbrain', 'laryngeal airway': 'larynx',
    'white matter of cerebral hemisphere': 'white matter', 'prevertebral muscles': 'longus colli muscle',
}
# Families whose members share one article: a name matching the pattern resolves to that structure instead.
FAMILIES = [
    (r'^cerebellar lobule\b|^cerebellar vermis\b', ['cerebellum']),
    (r'^c1 vertebra$', ['atlas', 'atlas (anatomy)']), (r'^c2 vertebra$', ['axis', 'axis (anatomy)']),
    (r'^c\d+ vertebra$', ['cervical vertebra', 'cervical vertebrae']),
    (r'^t\d+ vertebra$', ['thoracic vertebra', 'thoracic vertebrae']),
    (r'^l\d+ vertebra$', ['lumbar vertebra', 'lumbar vertebrae']),
    (r'^s\d+ vertebra$', ['sacral vertebra', 'sacrum']),
    (r'^rib \d+$|^rib cartilage', ['rib']), (r'\bintervertebral disc\b', ['intervertebral disc']),
]
# Names that must not be matched by label: too generic, or a non-anatomical homonym.
BLOCKED = {'body', 'head', 'other', 'background', 'trunk', 'face', 'skin'}


def cache_path(kind, key):
    os.makedirs(CACHE, exist_ok=True)
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', key)[:100]
    return os.path.join(CACHE, f'{kind}-{hashlib.md5(key.encode()).hexdigest()[:8]}-{safe}.json')


def chunk_key(kind, chunk):
    """A cache key that depends on every value in the chunk, so a re-run with different names cannot reuse it."""
    return f'{kind}-{len(chunk)}-{chunk[0]}-{hashlib.md5("|".join(chunk).encode()).hexdigest()[:10]}'


def fetch_json(url, data=None, headers=None, tries=8):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': 'application/json', **(headers or {})})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read().decode())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, http.client.IncompleteRead) as error:
            if attempt == tries - 1:
                raise
            print(f'  retrying after {error}', file=sys.stderr)
            time.sleep(min(10 * (attempt + 1), 60))  # the endpoint answers 429 and 502 under load


def sparql(query, key, tries=8):
    """Run a SPARQL query, cached. Returns a list of dicts of plain values."""
    path = cache_path('sparql', key)
    if os.path.exists(path):
        return json.load(open(path))
    body = urllib.parse.urlencode({'query': query, 'format': 'json'}).encode()
    result = fetch_json(SPARQL, data=body, headers={'Content-Type': 'application/x-www-form-urlencoded'}, tries=tries)
    rows = [{k: v['value'] for k, v in row.items()} for row in result['results']['bindings']]
    json.dump(rows, open(path, 'w'))
    time.sleep(1)  # the public endpoint answers 429 to bursts
    return rows


def qid(uri):
    return uri.rsplit('/', 1)[1]


def chunked(items, size):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def normalize(name):
    """A study label name reduced to what a Wikidata label would look like."""
    name = name.lower().strip()
    name = re.sub(r'\s*\((left|right)\)$', '', name)
    name = re.sub(r'^(left|right)\s+', '', name)
    name = re.sub(r'\s+(left|right)\b', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name


def candidate_names(name):
    """Names to look for, best first: the label itself, then the same without its side, then the usual
    suffix variants (masseter → masseter muscle, gracilis tendon → gracilis muscle, hyoid → hyoid bone)."""
    out = []
    for base in (name.lower().strip(), normalize(name)):
        forms = [base]
        if '(' in base:
            forms.append(re.sub(r'\s*\([^)]*\)', '', base).strip())
        for form in list(forms):
            if form.endswith(' tendon'):
                forms.append(form[:-len(' tendon')] + ' muscle')
            for suffix in (' muscle', ' bone', ' nerve', ' artery', ' vein'):
                if form.endswith(suffix):
                    forms.append(form[:-len(suffix)])
                elif suffix in (' muscle', ' bone') and len(form.split()) <= 3 and not form.endswith(('vertebra', 'appendage', 'hemisphere', 'cavity', 'gland', 'lobe')):
                    forms.append(form + suffix)
        # A family member (T8 vertebra, cerebellar lobule V) is better served by its family's article than by its
        # own identifier-only item, so the family name is tried first.
        families = [t for form in forms for pattern, targets in FAMILIES if re.search(pattern, form) for t in targets]
        for form in families + forms:
            for candidate in (SYNONYMS.get(form, form), form):
                if candidate and candidate not in out and candidate not in BLOCKED:
                    out.append(candidate)
    return out


# ---------------------------------------------------------------- structures

def load_structures(dataset):
    """[(conceptId, name)] for one dataset, in the viewer's own identifier space."""
    if dataset in ('reference', 'reference-female'):
        atlas = json.load(open(os.path.join(ROOT, 'public', 'models', f'atlas{"-female" if "female" in dataset else ""}.json')))
        seen, out = set(), []
        for concept in atlas['concepts']:
            if concept['id'] not in seen:
                seen.add(concept['id'])
                out.append((concept['id'], concept['name']))
        for part in atlas['parts']:  # parts whose concept is missing or unnamed
            if part['conceptId'] not in seen:
                seen.add(part['conceptId'])
                out.append((part['conceptId'], part['name']))
        return out
    manifest = json.load(open(study_manifest(dataset)))
    return [(f'{dataset}:{label["key"]}', label['name']) for label in manifest['labels']]


def study_manifest(dataset):
    for folder in ('ct', 'mri'):
        path = os.path.join(ROOT, 'public', folder, dataset, 'ct.json')
        if os.path.exists(path):
            return path
        path = os.path.join(ROOT, 'public', folder, dataset, 'study.json')
        if os.path.exists(path):
            return path
    raise SystemExit(f'no manifest for {dataset}')


# ---------------------------------------------------------------- Wikidata

def sparql_chunks(kind, values, size, build_query, tries=3):
    """Run one query per chunk of `values`, cached. The public endpoint times out on chunks it finds heavy, so a
    chunk that keeps failing is halved and retried; a single value that still fails is reported and skipped."""
    rows, queue = [], list(chunked(sorted(values), size))
    while queue:
        chunk = queue.pop(0)
        try:
            rows += sparql(build_query(chunk), chunk_key(kind, chunk), tries=tries)
        except Exception as error:
            if len(chunk) == 1:
                print(f'  giving up on {kind} {chunk[0]} after {error}', file=sys.stderr)
                continue
            print(f'  splitting {kind} chunk of {len(chunk)} after {error}', file=sys.stderr)
            queue[:0] = [chunk[:len(chunk) // 2], chunk[len(chunk) // 2:]]
    return rows


def items_by_identifier(concept_ids):
    """conceptId -> QID, for the reference bodies (FMA59763, UBERON:0002097)."""
    fma = sorted({c.replace('FMA', '').lstrip(':') for c in concept_ids if c.startswith('FMA')})
    uberon = sorted({c.split(':')[1] for c in concept_ids if c.startswith('UBERON:')})
    found = {}
    for prop, values, prefix in (('P1402', fma, 'FMA'), ('P1554', uberon, 'UBERON:')):
        query = lambda chunk: 'SELECT ?item ?id WHERE { VALUES ?id { %s } ?item wdt:%s ?id . }' % (
            ' '.join(f'"{v}"' for v in chunk), prop)
        for row in sparql_chunks(f'ids-{prop}', values, 400, query):
            found.setdefault(prefix + row['id'], qid(row['item']))
    return found


def index_shard(prefix, depth=0):
    """Labels and aliases beginning with `prefix`. The endpoint truncates large answers, so a shard that fails
    is split into finer prefixes until it goes through."""
    condition = (f'FILTER(STRSTARTS(LCASE(STR(?name)), "{prefix}"))' if prefix
                 else 'FILTER(!REGEX(SUBSTR(LCASE(STR(?name)), 1, 1), "^[a-z]$"))')
    query = f'''SELECT ?item ?name WHERE {{
  {{ ?item wdt:P1402 [] }} UNION {{ ?item wdt:P1554 [] }}
  {{ ?item rdfs:label ?name }} UNION {{ ?item skos:altLabel ?name }}
  FILTER(lang(?name) = "en") {condition}
}}'''
    try:
        return sparql(query, f'index-{prefix or "other"}', tries=2)  # a shard that is too heavy fails fast and is split
    except Exception as error:
        if depth >= 3:
            raise
        print(f'  splitting index shard "{prefix}" after {error}', file=sys.stderr)
        return [row for letter in 'abcdefghijklmnopqrstuvwxyz -' for row in index_shard(prefix + letter, depth + 1)]


def name_index():
    """lowercased label or alias -> [QID] for every Wikidata item that carries an FMA or UBERON identifier.
    Fetched once and cached, so the thousands of lookups below cost nothing and ignore case."""
    index = {}
    for prefix in [''] + [chr(c) for c in range(ord('a'), ord('z') + 1)]:
        for row in index_shard(prefix):
            index.setdefault(row['name'].lower(), []).append(qid(row['item']))
    return index


def items_by_name(names, index):
    """name -> [QID] from the cached index."""
    return {name: index[name] for name in names if name in index}


def items_by_name_anywhere(names):
    """Same, but asking Wikidata for anything it classifies as an anatomical structure. Used only for the names
    the index misses, because this query cannot be cached wholesale. Both spellings are sent: Wikidata labels
    are capitalized ("Lateral meniscus") while study labels are not."""
    spellings = {form for name in names for form in (name, name[:1].upper() + name[1:])}
    query = lambda chunk: '''SELECT ?item ?name WHERE {
  VALUES ?name { %s }
  { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
  ?item wdt:P31/wdt:P279* wd:Q4936952 .
}''' % ' '.join('"%s"@en' % n.replace('"', '\\"') for n in chunk)
    found = {}
    for row in sparql_chunks('anatomical', spellings, 120, query):
        found.setdefault(str(row['name']).lower(), []).append(qid(row['item']))
    return found


def articles_for(qids):
    """QID -> English Wikipedia title, for items that have one."""
    query = lambda chunk: '''SELECT ?item ?title WHERE {
  VALUES ?item { %s }
  ?wiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
}''' % ' '.join(f'wd:{q}' for q in chunk)
    found = {}
    for row in sparql_chunks('wiki', qids, 400, query):
        found.setdefault(qid(row['item']), row['title'])
    return found


def parents_of(qids):
    """QID -> [parent QID], following subclass of and part of."""
    query = lambda chunk: 'SELECT ?item ?parent WHERE { VALUES ?item { %s } ?item (wdt:P279|wdt:P361) ?parent . }' % (
        ' '.join(f'wd:{q}' for q in chunk))
    found = {}
    for row in sparql_chunks('parents', qids, 400, query):
        found.setdefault(qid(row['item']), []).append(qid(row['parent']))
    return found


def resolve_articles(items):
    """conceptId -> (QID, article title, hops away). Walks up to parents when an item has no article."""
    direct = articles_for(set(items.values()))
    resolved, frontier = {}, {}
    for concept, item in items.items():
        if item in direct:
            resolved[concept] = (item, direct[item], 0)
        else:
            frontier[concept] = [item]
    seen = {concept: {items[concept]} for concept in frontier}
    for hop in range(1, 4):
        if not frontier:
            break
        parents = parents_of({q for chain in frontier.values() for q in chain})
        step = {concept: [p for q in chain for p in parents.get(q, []) if p not in seen[concept]] for concept, chain in frontier.items()}
        titles = articles_for({q for chain in step.values() for q in chain})
        frontier = {}
        for concept, chain in step.items():
            hit = next((q for q in chain if q in titles), None)
            if hit:
                resolved[concept] = (items[concept], titles[hit], hop)
            elif chain:
                seen[concept].update(chain)
                frontier[concept] = chain
    return resolved


# ---------------------------------------------------------------- Wikipedia

def strip_markup(value):
    value = re.sub(r'<ref[^>]*?/>|<ref.*?</ref>', '', value, flags=re.S | re.I)
    value = re.sub(r'<!--.*?-->', '', value, flags=re.S)
    value = re.sub(r'<br\s*/?>|\n\*|\n', ', ', value, flags=re.I)
    value = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]', r'\1', value)
    for _ in range(3):  # templates: keep the last argument of link templates, drop the rest
        value = re.sub(r'\{\{\s*(?:lang|nowrap|linktext|ill)\s*\|(?:[^{}|]*\|)*([^{}|]*)\}\}', r'\1', value, flags=re.I)
        value = re.sub(r'\{\{[^{}]*\}\}', '', value)
    value = re.sub(r"'''?|</?[a-z][^>]*>|[{}]+", '', value)
    value = re.sub(r'\s*,\s*(?=,)|^\s*,\s*|\s*,\s*$', '', value)
    value = re.sub(r'\s+', ' ', value).strip(' ,;')
    return value[:VALUE_CHARS].rstrip(' ,;') if len(value) > VALUE_CHARS else value


def parse_infobox(wikitext):
    """Anatomy infobox fields of an article, cleaned of wiki markup."""
    match = re.search(r'\{\{\s*Infobox[ _](anatomy|muscle|bone|brain|nerve|artery|vein|lymph|embryology)\b', wikitext, re.I)
    if not match:
        return {}
    depth, index, start = 0, match.start(), match.start()
    while index < len(wikitext):
        if wikitext.startswith('{{', index):
            depth, index = depth + 1, index + 2
        elif wikitext.startswith('}}', index):
            depth, index = depth - 1, index + 2
            if depth == 0:
                break
        else:
            index += 1
    body = wikitext[start:index]
    facts, body = {}, body[:-2] if body.endswith('}}') else body  # drop the infobox's own closing braces
    for line in re.split(r'\n(?=\s*\|)', body):
        parts = line.lstrip().lstrip('|').split('=', 1)
        if len(parts) != 2:
            continue
        key = re.sub(r'[^a-z_]', '', parts[0].strip().lower().replace(' ', '_'))
        key = FIELD_ALIASES.get(key, key)
        if key in dict(FIELDS):
            value = strip_markup(parts[1])
            if value and value.lower() not in ('none', 'n/a', 'na', 'nil'):
                facts.setdefault(key, value)
    return facts


def trim_summary(text):
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= SUMMARY_CHARS:
        return text
    cut = text[:SUMMARY_CHARS]
    stop = max(cut.rfind('. '), cut.rfind('.\n'))
    return (cut[:stop + 1] if stop > SUMMARY_CHARS // 2 else cut.rstrip() + '…').strip()


def wikipedia_pages(titles):
    """title -> {summary, facts, canonical title}. Extracts and wikitext come in one query per batch."""
    pages = {}
    for index, chunk in enumerate(chunked(sorted(titles), 20)):
        path = cache_path('wp', chunk_key('', chunk))
        if os.path.exists(path):
            data = json.load(open(path))
        else:
            query = urllib.parse.urlencode({
                'action': 'query', 'format': 'json', 'formatversion': '2', 'redirects': '1',
                'prop': 'extracts|revisions', 'exintro': '1', 'explaintext': '1', 'rvprop': 'content',
                'rvslots': 'main', 'titles': '|'.join(chunk)})
            data = fetch_json(f'{WIKIPEDIA}?{query}')
            json.dump(data, open(path, 'w'))
            time.sleep(0.2)
        result = data.get('query', {})
        aliases = {entry['from']: entry['to'] for entry in result.get('redirects', []) + result.get('normalized', [])}
        by_title = {}
        for page in result.get('pages', []):
            if page.get('missing'):
                continue
            wikitext = page.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('content', '')
            by_title[page['title']] = {'title': page['title'], 'summary': trim_summary(page.get('extract', '')),
                                       'facts': parse_infobox(wikitext)}
        for title in chunk:
            target = title
            for _ in range(3):
                target = aliases.get(target, target)
            if target in by_title:
                pages[title] = by_title[target]
    return pages


# ---------------------------------------------------------------- build

def build(dataset, report):
    structures = load_structures(dataset)
    names = {concept: candidate_names(name) for concept, name in structures}
    items = {}
    if dataset.startswith('reference'):
        by_id = items_by_identifier([c for c, _ in structures])
        items.update({c: by_id[c] for c, _ in structures if c in by_id})
    index = None
    for anatomical in (False, True):  # identifier-bearing items first, then any anatomical structure
        unmatched = [c for c, _ in structures if c not in items]
        if not unmatched:
            break
        wanted = {n for c in unmatched for n in names[c]}
        if anatomical:
            by_name = items_by_name_anywhere(wanted)
        else:
            index = index or name_index()
            by_name = items_by_name(wanted, index)
        contested = {q for c in unmatched for n in names[c] for q in by_name.get(n, []) if len(by_name[n]) > 1}
        with_article = articles_for(contested) if contested else {}  # a name with several items: prefer one that has an article
        for concept in unmatched:
            for name in names[concept]:
                candidates = sorted(by_name.get(name, []))
                if candidates:
                    items[concept] = next((q for q in candidates if q in with_article), candidates[0])
                    break
    resolved = resolve_articles(items)
    pages = wikipedia_pages({title for _, title, _ in resolved.values()})

    articles, entries = {}, {}
    for concept, (item, title, hops) in sorted(resolved.items()):
        page = pages.get(title)
        if not page or (not page['summary'] and not page['facts']):
            continue
        key = page['title']
        articles.setdefault(key, {'summary': page['summary'], 'facts': page['facts']})
        entry = {'article': key, 'item': item}
        if hops:
            entry['via'] = hops
        entries[concept] = entry
    out = {
        'dataset': dataset,
        'source': 'English Wikipedia (CC BY-SA 4.0) and Wikidata (CC0)',
        'built': time.strftime('%Y-%m-%d'),
        'fields': [[key, label] for key, label in FIELDS],
        'articles': dict(sorted(articles.items())),
        'structures': entries,
    }
    folder = os.path.join(ROOT, 'public', 'facts')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{dataset}.json')
    with open(path, 'w') as handle:
        json.dump(out, handle, separators=(',', ':'), ensure_ascii=False)
    facts = sum(1 for a in articles.values() if a['facts'])
    print(f'{dataset}: {len(entries)}/{len(structures)} structures, {len(articles)} articles '
          f'({facts} with infobox facts), {os.path.getsize(path) / 1024:.0f} kB')
    if report:
        missing = [(c, n) for c, n in structures if c not in entries]
        for concept, name in missing:
            print(f'  unmatched  {concept}  {name}')
    return out


DATASETS = ['reference', 'reference-female', 's0476', 's0777', 'spl-ear', 'spl-brain', 'amos-0590', 'spl-knee']

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('datasets', nargs='*', default=[], choices=DATASETS + [])
    parser.add_argument('--cache', default=CACHE)
    parser.add_argument('--report', action='store_true', help='list the structures that stayed unmatched')
    args = parser.parse_args()
    CACHE = args.cache
    for name in args.datasets or DATASETS:
        build(name, args.report)
