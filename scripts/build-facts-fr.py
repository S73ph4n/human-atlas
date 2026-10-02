"""Build the French Wikipedia summaries shown beside a selected structure when the viewer is in French.

Usage: python scripts/build-facts-fr.py [dataset ...]
  dataset: reference, reference-female, s0476, s0777, spl-ear, spl-brain, amos-0590, spl-knee (default: all)

Reads public/facts/<dataset>.json (built by build-facts.py) and writes public/facts/<dataset>.fr.json. Each English
article there is followed to its French counterpart through Wikipedia's language links, and the French article's
introduction becomes the summary. Articles without a French counterpart are left out; the viewer then shows the
English summary. Infobox facts are not taken from French Wikipedia, whose anatomy infoboxes use other fields: the
viewer keeps the English ones and translates their labels.

French Wikipedia text is CC BY-SA 4.0; each entry keeps the title it came from and the viewer links back to it.
Responses share build-facts.py's cache under work/facts-cache.
"""
import importlib.util, json, os, sys, time, urllib.parse

ROOT = os.path.join(os.path.dirname(__file__), '..')
spec = importlib.util.spec_from_file_location('build_facts', os.path.join(os.path.dirname(__file__), 'build-facts.py'))
facts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(facts)
EN_API = 'https://en.wikipedia.org/w/api.php'
FR_API = 'https://fr.wikipedia.org/w/api.php'


def query(api, params, key):
    """One cached MediaWiki API query."""
    path = facts.cache_path('wpfr', key)
    if os.path.exists(path):
        return json.load(open(path))
    data = facts.fetch_json(f'{api}?{urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": "2", **params})}')
    json.dump(data, open(path, 'w'))
    time.sleep(0.2)
    return data


def resolved_titles(result, chunk):
    """Requested title -> page as returned, through the API's normalisations and redirects."""
    aliases = {e['from']: e['to'] for e in result.get('normalized', []) + result.get('redirects', [])}
    pages = {p['title']: p for p in result.get('pages', []) if not p.get('missing')}
    out = {}
    for title in chunk:
        target = title
        for _ in range(3):
            target = aliases.get(target, target)
        if target in pages:
            out[title] = pages[target]
    return out


def french_titles(titles):
    """English title -> French title, for articles that have one."""
    found = {}
    for chunk in facts.chunked(sorted(titles), 50):
        data = query(EN_API, {'prop': 'langlinks', 'lllang': 'fr', 'lllimit': 'max', 'redirects': '1', 'titles': '|'.join(chunk)},
                     facts.chunk_key('langlinks', chunk))
        for title, page in resolved_titles(data.get('query', {}), chunk).items():
            links = page.get('langlinks') or []
            if links:
                found[title] = links[0]['title']
    return found


def french_summaries(titles):
    """French title -> (canonical title, summary). The extracts API serves at most 20 introductions per query."""
    found = {}
    for chunk in facts.chunked(sorted(titles), 20):
        data = query(FR_API, {'prop': 'extracts', 'exintro': '1', 'explaintext': '1', 'exlimit': 'max', 'redirects': '1', 'titles': '|'.join(chunk)},
                     facts.chunk_key('extracts', chunk))
        for title, page in resolved_titles(data.get('query', {}), chunk).items():
            summary = facts.trim_summary(page.get('extract', ''))
            if summary:
                found[title] = (page['title'], summary)
    return found


def build(dataset):
    source = json.load(open(os.path.join(ROOT, 'public', 'facts', f'{dataset}.json')))
    english = source['articles'].keys()
    to_french = french_titles(english)
    summaries = french_summaries(set(to_french.values()))
    articles = {}
    for title in sorted(english):
        french = to_french.get(title)
        if french in summaries:
            canonical, summary = summaries[french]
            articles[title] = {'title': canonical, 'summary': summary}
    out = {'dataset': dataset, 'source': 'Wikipédia en français (CC BY-SA 4.0)', 'built': time.strftime('%Y-%m-%d'), 'articles': articles}
    path = os.path.join(ROOT, 'public', 'facts', f'{dataset}.fr.json')
    with open(path, 'w') as handle:
        json.dump(out, handle, separators=(',', ':'), ensure_ascii=False)
    print(f'{dataset}: {len(articles)}/{len(english)} articles in French, {os.path.getsize(path) / 1024:.0f} kB')


if __name__ == '__main__':
    wanted = sys.argv[1:] or facts.DATASETS
    for name in wanted:
        if name not in facts.DATASETS:
            raise SystemExit(f'unknown dataset {name}')
        build(name)
