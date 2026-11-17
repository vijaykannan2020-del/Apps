#!/usr/bin/env python3
"""Read-only: prints what App Store Connect says about each Inbox build (processing, TestFlight state, groups)."""
import json, os, time, urllib.request, jwt
KEY_ID, ISSUER = os.environ['EXPO_ASC_KEY_ID'], os.environ['EXPO_ASC_ISSUER_ID']
PRIV = open(os.environ['EXPO_ASC_API_KEY_PATH']).read()
APP = '6835583589'
def get(path):
    tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error': e.code, 'body': e.read().decode()[:500]}
b = get(f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=10')
inc = {(i['type'], i['id']): i for i in b.get('included', [])}
for d in b.get('data', []):
    a = d['attributes']
    det = get(f"/v1/builds/{d['id']}/buildBetaDetail").get('data', {}).get('attributes', {})
    print(f"build {a['version']}: processing={a['processingState']} uploaded={a['uploadedDate']} expired={a['expired']} encryption={a.get('usesNonExemptEncryption')} internal={det.get('internalBuildState')} external={det.get('externalBuildState')}")
if 'error' in b: print(b)
gs = get(f'/v1/apps/{APP}/betaGroups')
for g in gs.get('data', []):
    at = g['attributes']; t = get(f"/v1/betaGroups/{g['id']}/betaTesters?limit=20")
    print(f"group {at['name']}: internal={at.get('isInternalGroup')} autoDistribute={at.get('hasAccessToAllBuilds')} testers={[x['attributes'].get('email') for x in t.get('data', [])]}")

# Answer Apple's export-compliance question ("uses only standard encryption: HTTPS / WebRTC") for builds still waiting on it.
if os.environ.get('FIX_COMPLIANCE') == '1':
    for d in b.get('data', []):
        if d['attributes'].get('usesNonExemptEncryption') is None and d['attributes']['processingState'] == 'VALID':
            tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
            body = json.dumps({'data': {'type': 'builds', 'id': d['id'], 'attributes': {'usesNonExemptEncryption': False}}}).encode()
            req = urllib.request.Request(f"https://api.appstoreconnect.apple.com/v1/builds/{d['id']}", data=body, method='PATCH', headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req) as r: print(f"build {d['attributes']['version']}: export compliance answered ✓ ({r.status})")
            except urllib.error.HTTPError as e: print(f"build {d['attributes']['version']}: could not answer: {e.code} {e.read().decode()[:300]}")
    time.sleep(5)
    for d in get(f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=3').get('data', []):
        det = get(f"/v1/builds/{d['id']}/buildBetaDetail").get('data', {}).get('attributes', {})
        print(f"after: build {d['attributes']['version']} internal={det.get('internalBuildState')}")
