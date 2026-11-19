"""Set the App Store name and subtitle (all editable app-info localizations) via the App Store Connect API."""
import json, os, sys, time, urllib.request, urllib.error
import jwt
KEY_ID, ISSUER, APP = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER_ID'], os.environ['ASC_APP_ID']
PRIV = os.environ['ASC_KEY_P8']
NAME, SUB = os.environ['STORE_NAME'], os.environ['STORE_SUBTITLE']
def api(m, p, body=None):
    tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
    r = urllib.request.Request('https://api.appstoreconnect.apple.com' + p, method=m, data=json.dumps(body).encode() if body else None,
        headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r) as f: return json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e:
        print(f'{m} {p} -> {e.code}: {e.read().decode()[:800]}'); return None
infos = api('GET', f'/v1/apps/{APP}/appInfos')['data']
ok = False
for inf in infos:
    st = inf['attributes'].get('appStoreState') or inf['attributes'].get('state')
    print('appInfo', inf['id'], st)
    locs = api('GET', f"/v1/appInfos/{inf['id']}/appInfoLocalizations") or {'data': []}
    for l in locs['data']:
        print('  locale', l['attributes']['locale'], 'name:', l['attributes'].get('name'), '| subtitle:', l['attributes'].get('subtitle'))
        res = api('PATCH', f"/v1/appInfoLocalizations/{l['id']}", {'data': {'type': 'appInfoLocalizations', 'id': l['id'], 'attributes': {'name': NAME, 'subtitle': SUB}}})
        if res:
            a = res['data']['attributes']; print('  -> now', a.get('name'), '|', a.get('subtitle')); ok = True
sys.exit(0 if ok else 1)
