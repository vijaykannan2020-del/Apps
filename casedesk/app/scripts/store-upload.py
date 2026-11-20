"""Set the App Store version texts and upload screenshots through the App Store Connect API.

Reads casedesk/app/store/listing.json (description, keywords, promotional text, What's New, support and
marketing URLs) and PNGs from casedesk/app/store/screenshots/<device>/NN-name.png, where <device> is
iphone-6.9 (or iphone-6.7) and ipad-13. Same secrets as scripts/store-name.py.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, ASC_APP_ID, VERSION (default 1.0), LOCALE (default en-US),
DO_TEXT (1/0), DO_SHOTS (1/0), REPLACE (1 = delete screenshots already in a set first), DRY_RUN (1 = read only).
"""
import hashlib, json, os, sys, time, urllib.request, urllib.error
import jwt

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, '..', 'store')
KEY_ID, ISSUER, APP = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER_ID'], os.environ['ASC_APP_ID']
PRIV = os.environ['ASC_KEY_P8']
VERSION = os.environ.get('VERSION', '1.0')
LOCALE = os.environ.get('LOCALE', 'en-US')
flag = lambda k, d='1': os.environ.get(k, d) in ('1', 'true', 'yes')
DO_TEXT, DO_SHOTS, REPLACE, DRY = flag('DO_TEXT'), flag('DO_SHOTS'), flag('REPLACE', '0'), flag('DRY_RUN', '0')
# Folder -> App Store Connect display type. 6.9" (1320x2868) and 6.7" (1290x2796) both go in APP_IPHONE_67;
# 13" iPad (2064x2752) goes in APP_IPAD_PRO_3GEN_129. Smaller sizes are scaled down by Apple.
DISPLAY = {'iphone-6.9': 'APP_IPHONE_67', 'iphone-6.7': 'APP_IPHONE_67', 'ipad-13': 'APP_IPAD_PRO_3GEN_129'}
LIMITS = {'description': 4000, 'keywords': 100, 'promotionalText': 170, 'whatsNew': 4000}


def token():
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'}, PRIV,
                      algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})


def api(m, p, body=None, ok_fail=False):
    if DRY and m != 'GET':
        print(f'[dry run] {m} {p}'); return {'data': {'id': 'dry', 'attributes': {}}}
    url = p if p.startswith('https://') else 'https://api.appstoreconnect.apple.com' + p
    r = urllib.request.Request(url, method=m, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r) as f:
            return json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:800]
        print(f'{m} {p} -> {e.code}: {msg}')
        if ok_fail: return None
        sys.exit(1)


def find_version():
    vs = api('GET', f'/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=20')['data']
    for v in vs:
        a = v['attributes']; print('version', a['versionString'], a.get('appStoreState') or a.get('appVersionState'))
    editable = [v for v in vs if v['attributes']['versionString'] == VERSION]
    if not editable:
        print(f'No App Store version {VERSION}. Create it in App Store Connect (+ Version or Platform) first.'); sys.exit(1)
    return editable[0]


def find_localization(vid):
    locs = api('GET', f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations')['data']
    for l in locs:
        if l['attributes']['locale'] == LOCALE: return l
    if DRY: print(f'[dry run] would create localization {LOCALE}'); return {'id': 'dry', 'attributes': {}}
    return api('POST', '/v1/appStoreVersionLocalizations', {'data': {'type': 'appStoreVersionLocalizations',
               'attributes': {'locale': LOCALE}, 'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})['data']


def set_texts(loc):
    d = json.load(open(os.path.join(STORE, 'listing.json'), encoding='utf-8'))
    desc = d['description'] if isinstance(d['description'], str) else '\n'.join(d['description'])
    attrs = {'description': desc, 'keywords': d['keywords'], 'promotionalText': d['promotionalText'],
             'supportUrl': d['supportUrl'], 'marketingUrl': d.get('marketingUrl') or None}
    for k, lim in LIMITS.items():
        if k in attrs and attrs[k] and len(attrs[k]) > lim: print(f'{k} is {len(attrs[k])} characters, limit {lim}'); sys.exit(1)
    if ' ' in d['keywords']: print('keywords: no spaces, please'); sys.exit(1)
    res = api('PATCH', f"/v1/appStoreVersionLocalizations/{loc['id']}",
              {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id'], 'attributes': attrs}})
    print('texts set:', ', '.join(attrs))
    # Apple does not allow What's New on an app's first version; try it separately so that is not fatal.
    if d.get('whatsNew'):
        r = api('PATCH', f"/v1/appStoreVersionLocalizations/{loc['id']}",
                {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id'], 'attributes': {'whatsNew': d['whatsNew']}}}, ok_fail=True)
        print("What's New set" if r else "What's New skipped (normal for the first version)")
    return res


def shot_set(loc_id, display):
    sets = api('GET', f'/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets')['data']
    for s in sets:
        if s['attributes']['screenshotDisplayType'] == display: return s
    return api('POST', '/v1/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': display},
               'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': loc_id}}}}})['data']


def upload(set_id, path):
    data = open(path, 'rb').read(); name = os.path.basename(path)
    sc = api('POST', '/v1/appScreenshots', {'data': {'type': 'appScreenshots', 'attributes': {'fileName': name, 'fileSize': len(data)},
             'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})['data']
    if DRY: return
    for op in sc['attributes']['uploadOperations']:
        chunk = data[op['offset']:op['offset'] + op['length']]
        h = {x['name']: x['value'] for x in op.get('requestHeaders', [])}
        req = urllib.request.Request(op['url'], method=op['method'], data=chunk, headers=h)
        with urllib.request.urlopen(req) as f: f.read()
    api('PATCH', f"/v1/appScreenshots/{sc['id']}", {'data': {'type': 'appScreenshots', 'id': sc['id'],
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    print('  uploaded', name)


def upload_shots(loc):
    root = os.path.join(STORE, 'screenshots')
    if not os.path.isdir(root): print('No folder', root); return
    done = set()
    for folder in sorted(os.listdir(root)):  # iphone-6.7 sorts before iphone-6.9: prefer 6.9 when both are there
        if folder not in DISPLAY: continue
        if folder == 'iphone-6.7' and os.path.isdir(os.path.join(root, 'iphone-6.9')): continue
        display = DISPLAY[folder]
        if display in done: continue
        files = sorted(f for f in os.listdir(os.path.join(root, folder)) if f.lower().endswith('.png'))[:10]
        if not files: continue
        s = shot_set(loc['id'], display); print(folder, '->', display, len(files), 'files')
        if REPLACE and not DRY:
            for old in api('GET', f"/v1/appScreenshotSets/{s['id']}/appScreenshots")['data']:
                api('DELETE', f"/v1/appScreenshots/{old['id']}", ok_fail=True); print('  removed', old['attributes'].get('fileName'))
        for f in files: upload(s['id'], os.path.join(root, folder, f))
        done.add(display)
    print('Apple processes screenshots for a few minutes; refresh the version page to see them.')


v = find_version(); print('using version', v['id'])
loc = find_localization(v['id'])
if DO_TEXT: set_texts(loc)
if DO_SHOTS: upload_shots(loc)
print('done')
