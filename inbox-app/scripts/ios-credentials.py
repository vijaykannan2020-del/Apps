#!/usr/bin/env python3
"""Creates (once) and reuses the App Store signing certificate + provisioning profile using the
App Store Connect API key, so iPhone builds can run on GitHub without a Mac.
The result is stored encrypted in credentials/ios.enc (password = hash of the private API key)."""
import base64, hashlib, json, os, secrets, subprocess, sys, tarfile, time, urllib.request, urllib.error
import jwt  # pyjwt

BUNDLE = 'com.vijaykannan.myinbox'
KEY_ID, ISSUER, KEY_PATH = os.environ['EXPO_ASC_KEY_ID'], os.environ['EXPO_ASC_ISSUER_ID'], os.environ['EXPO_ASC_API_KEY_PATH']
PRIV = open(KEY_PATH).read()
PASS = hashlib.sha256(('inbox-cred:' + ''.join(PRIV.split())).encode()).hexdigest()
OUT = 'credentials'; ENC = os.path.join(OUT, 'ios.enc')
os.makedirs(OUT, exist_ok=True)

def run(*a, **k): return subprocess.run(a, check=True, **k)

def api(method, path, body=None):
    tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        msg = e.read().decode(); print(f'Apple API {method} {path} -> {e.code}: {msg}', file=sys.stderr)
        if e.code == 409 and 'capabil' in path.lower(): return {}
        raise SystemExit(1)

def write_credentials_json(pw):
    json.dump({'ios': {'provisioningProfilePath': f'{OUT}/profile.mobileprovision',
                       'distributionCertificate': {'path': f'{OUT}/dist.p12', 'password': pw}}}, open('credentials.json', 'w'), indent=2)

if os.path.exists(ENC):
    run('openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', ENC, '-out', '/tmp/ios.tar', '-pass', 'env:CRED_PASS', env={**os.environ, 'CRED_PASS': PASS})
    with tarfile.open('/tmp/ios.tar') as t: t.extractall(OUT)
    write_credentials_json(open(f'{OUT}/p12pass').read().strip())
    print('Reusing saved signing certificate ✓'); sys.exit(0)

# 1. App ID (bundle identifier) + push capability for later
found = api('GET', f'/v1/bundleIds?filter[identifier]={BUNDLE}&limit=5')['data']
found = [b for b in found if b['attributes']['identifier'] == BUNDLE]
if found: bid = found[0]['id']; print('App ID exists ✓')
else:
    bid = api('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': BUNDLE, 'name': 'Inbox', 'platform': 'IOS'}}})['data']['id']; print('Registered App ID ✓')
api('POST', '/v1/bundleIdCapabilities', {'data': {'type': 'bundleIdCapabilities', 'attributes': {'capabilityType': 'PUSH_NOTIFICATIONS'},
    'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}}}})

# 2. Distribution certificate
run('openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/dist.key', '-out', '/tmp/dist.csr', '-subj', '/CN=Inbox Distribution/O=Vijayakannan Krishnan/C=US')
csr = open('/tmp/dist.csr').read()
cert = api('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr}}})['data']
open('/tmp/dist.cer', 'wb').write(base64.b64decode(cert['attributes']['certificateContent']))
run('openssl', 'x509', '-inform', 'DER', '-in', '/tmp/dist.cer', '-out', '/tmp/dist.pem')
pw = secrets.token_hex(16)
run('openssl', 'pkcs12', '-export', '-legacy', '-inkey', '/tmp/dist.key', '-in', '/tmp/dist.pem', '-out', f'{OUT}/dist.p12', '-passout', f'pass:{pw}', '-name', 'Inbox Distribution')
print('Created distribution certificate ✓')

# 3. App Store provisioning profile
prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': f'Inbox App Store {int(time.time())}', 'profileType': 'IOS_APP_STORE'},
    'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]}}}})['data']
open(f'{OUT}/profile.mobileprovision', 'wb').write(base64.b64decode(prof['attributes']['profileContent']))
open(f'{OUT}/p12pass', 'w').write(pw)
print('Created provisioning profile ✓')

# 4. Save encrypted for next builds
with tarfile.open('/tmp/ios.tar', 'w') as t:
    for f in ('dist.p12', 'profile.mobileprovision', 'p12pass'): t.add(f'{OUT}/{f}', arcname=f)
run('openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', '/tmp/ios.tar', '-out', ENC, '-pass', 'env:CRED_PASS', env={**os.environ, 'CRED_PASS': PASS})
write_credentials_json(pw)
print('NEW_CREDENTIALS=1')
