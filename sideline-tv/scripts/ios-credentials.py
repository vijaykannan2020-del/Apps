#!/usr/bin/env python3
"""Sideline TV iPhone signing on GitHub (no Mac), same method as Immigration Wallet.
Reuses Inbox's App Store distribution certificate, registers the App ID com.vijaykannan.sidelinetv,
makes an App Store provisioning profile, and saves it encrypted in credentials/ios.enc."""
import base64, hashlib, json, os, subprocess, sys, tarfile, time, urllib.request, urllib.error
import jwt  # pyjwt

BUNDLE = 'com.vijaykannan.sidelinetv'
VERSION = 'v1'
KEY_ID, ISSUER, KEY_PATH = os.environ['EXPO_ASC_KEY_ID'], os.environ['EXPO_ASC_ISSUER_ID'], os.environ['EXPO_ASC_API_KEY_PATH']
PRIV = open(KEY_PATH).read()
KEYSTR = ''.join(PRIV.split())
PASS = hashlib.sha256(('sidelinetv-cred:' + KEYSTR).encode()).hexdigest()
INBOX_PASS = hashlib.sha256(('inbox-cred:' + KEYSTR).encode()).hexdigest()
INBOX_ENC = os.environ.get('INBOX_CRED', '../inbox-app/credentials/ios.enc')
OUT = 'credentials'; ENC = os.path.join(OUT, 'ios.enc')
os.makedirs(OUT, exist_ok=True)

def run(*a, **k): return subprocess.run(a, check=True, **k)

def api(method, path, body=None, tries=5):
    for n in range(tries):
        tok = jwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
        req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method, data=json.dumps(body).encode() if body else None,
                                     headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req) as r: return json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code >= 500 and n < tries - 1: print(f'Apple busy ({e.code}), retrying…'); time.sleep(10 * (n + 1)); continue
            print(f'Apple API {method} {path} -> {e.code}: {msg}', file=sys.stderr); raise SystemExit(1)

def write_credentials_json(pw):
    json.dump({'ios': {'provisioningProfilePath': f'{OUT}/profile.mobileprovision', 'distributionCertificate': {'path': f'{OUT}/dist.p12', 'password': pw}}},
              open('credentials.json', 'w'), indent=2)

def decrypt(src, pw, dest):
    run('openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', src, '-out', '/tmp/c.tar', '-pass', 'env:P', env={**os.environ, 'P': pw})
    os.makedirs(dest, exist_ok=True)
    with tarfile.open('/tmp/c.tar') as t: t.extractall(dest)

# 0. Saved and current? reuse
if os.path.exists(ENC):
    decrypt(ENC, PASS, OUT)
    if open(f'{OUT}/version').read().strip() == VERSION and os.path.exists(f'{OUT}/profile.mobileprovision'):
        write_credentials_json(open(f'{OUT}/p12pass').read().strip()); print('Reusing saved Sideline TV signing ✓'); sys.exit(0)

# 1. Certificate: Inbox's distribution certificate
if not os.path.exists(f'{OUT}/dist.p12'):
    decrypt(INBOX_ENC, INBOX_PASS, '/tmp/inboxcred')
    run('cp', '/tmp/inboxcred/dist.p12', f'{OUT}/dist.p12'); run('cp', '/tmp/inboxcred/p12pass', f'{OUT}/p12pass')
pw = open(f'{OUT}/p12pass').read().strip()
der = None
for extra in (['-legacy'], []):
    r = subprocess.run(['openssl', 'pkcs12', '-in', f'{OUT}/dist.p12', '-nokeys', '-clcerts', '-passin', f'pass:{pw}', *extra], capture_output=True)
    if r.returncode == 0 and b'BEGIN CERTIFICATE' in r.stdout:
        der = subprocess.run(['openssl', 'x509', '-outform', 'DER'], input=r.stdout, capture_output=True, check=True).stdout; break
serial = subprocess.run(['openssl', 'x509', '-inform', 'DER', '-noout', '-serial'], input=der, capture_output=True, check=True).stdout.decode().strip().split('=')[1].upper().lstrip('0')
def same(c): return (c.get('attributes', {}).get('serialNumber') or '').upper().lstrip('0') == serial or base64.b64decode(c.get('attributes', {}).get('certificateContent') or '') == der
cert_id = None
for path in ['/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=50', '/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=50', '/v1/certificates?limit=200']:
    try: pool = api('GET', path, tries=2).get('data', [])
    except SystemExit: continue
    cert_id = next((c['id'] for c in pool if same(c)), None)
    if cert_id: break
if not cert_id: print('Inbox certificate not found at Apple', file=sys.stderr); sys.exit(1)
print('Using Inbox distribution certificate ✓')

# 2. App ID
found = [b for b in api('GET', f'/v1/bundleIds?filter[identifier]={BUNDLE}&limit=20')['data'] if b['attributes']['identifier'] == BUNDLE]
bid = found[0]['id'] if found else api('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': BUNDLE, 'name': 'Sideline TV', 'platform': 'IOS'}}})['data']['id']
print(f'App ID {BUNDLE} ' + ('✓' if found else 'registered ✓'))

# 3. App Store provisioning profile
prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': f'Sideline TV App Store {int(time.time())}', 'profileType': 'IOS_APP_STORE'},
    'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}})['data']
open(f'{OUT}/profile.mobileprovision', 'wb').write(base64.b64decode(prof['attributes']['profileContent']))
print('Created provisioning profile ✓')

# 4. Save encrypted
open(f'{OUT}/version', 'w').write(VERSION)
with tarfile.open('/tmp/c.tar', 'w') as t:
    for f in ['dist.p12', 'p12pass', 'version', 'profile.mobileprovision']: t.add(f'{OUT}/{f}', arcname=f)
run('openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', '/tmp/c.tar', '-out', ENC, '-pass', 'env:P', env={**os.environ, 'P': PASS})
write_credentials_json(pw)
print('NEW_CREDENTIALS=1')
