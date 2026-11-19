"""Print the latest TestFlight builds: number, upload time, processing state, expiry, compliance and beta state."""
import json, os, time, urllib.request, urllib.error
import jwt
KEY_ID, ISSUER, APP = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER_ID'], os.environ['ASC_APP_ID']
PRIV = os.environ['ASC_KEY_P8']
def api(p):
    tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
    r = urllib.request.Request('https://api.appstoreconnect.apple.com' + p, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(r) as f: return json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e:
        print(f'GET {p} -> {e.code}: {e.read().decode()[:600]}'); return {'data': []}
b = api(f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=6&include=buildBetaDetail')
det = {i['id']: i['attributes'] for i in b.get('included', []) if i['type'] == 'buildBetaDetails'}
for x in b['data']:
    a = x['attributes']; bd = det.get((x['relationships'].get('buildBetaDetail', {}).get('data') or {}).get('id'), {})
    print(f"build {a.get('version')} uploaded {a.get('uploadedDate')} state={a.get('processingState')} expired={a.get('expired')} "
          f"encryption={a.get('usesNonExemptEncryption')} internal={bd.get('internalBuildState')} external={bd.get('externalBuildState')}")
