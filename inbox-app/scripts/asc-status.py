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
b = get(f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=10&include=buildBetaDetail,preReleaseVersion&fields[builds]=version,processingState,uploadedDate,expired,usesNonExemptEncryption,minOsVersion')
inc = {(i['type'], i['id']): i for i in b.get('included', [])}
for d in b.get('data', []):
    a = d['attributes']; bd = d['relationships'].get('buildBetaDetail', {}).get('data')
    det = inc.get(('buildBetaDetails', bd['id']), {}).get('attributes', {}) if bd else {}
    print(f"build {a['version']}: processing={a['processingState']} uploaded={a['uploadedDate']} expired={a['expired']} encryption={a.get('usesNonExemptEncryption')} internal={det.get('internalBuildState')} external={det.get('externalBuildState')}")
    g = get(f"/v1/builds/{d['id']}/betaGroups")
    print('   groups:', [x['attributes']['name'] for x in g.get('data', [])] or g)
if 'error' in b: print(b)
gs = get(f'/v1/apps/{APP}/betaGroups')
for g in gs.get('data', []):
    at = g['attributes']; t = get(f"/v1/betaGroups/{g['id']}/betaTesters?limit=20")
    print(f"group {at['name']}: internal={at.get('isInternalGroup')} autoDistribute={at.get('hasAccessToAllBuilds')} testers={[x['attributes'].get('email') for x in t.get('data', [])]}")
