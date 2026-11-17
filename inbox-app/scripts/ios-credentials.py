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

NSE = BUNDLE + '.NotificationService'   # notification extension (profile photos in notifications)
TARGETS = {'Inbox': ('profile.mobileprovision', BUNDLE), 'NotificationService': ('nse.mobileprovision', NSE)}

def write_credentials_json(pw):
    cert = {'path': f'{OUT}/dist.p12', 'password': pw}
    json.dump({'ios': {t: {'provisioningProfilePath': f'{OUT}/{f}', 'distributionCertificate': cert} for t, (f, _) in TARGETS.items()}},
              open('credentials.json', 'w'), indent=2)

def bundle_id(identifier, name):
    found = [b for b in api('GET', f'/v1/bundleIds?filter[identifier]={identifier}&limit=20')['data'] if b['attributes']['identifier'] == identifier]
    if found: print(f'App ID {identifier} exists ✓'); return found[0]['id']
    bid = api('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': identifier, 'name': name, 'platform': 'IOS'}}})['data']['id']
    print(f'Registered App ID {identifier} ✓'); return bid

def capability(bid, kind):
    api('POST', '/v1/bundleIdCapabilities', {'data': {'type': 'bundleIdCapabilities', 'attributes': {'capabilityType': kind},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}}}})
    print(f'Capability {kind} on ✓')

def save(pw):
    open(f'{OUT}/version', 'w').write(VERSION)
    with tarfile.open('/tmp/ios.tar', 'w') as t:
        for f in ['dist.p12', 'p12pass', 'version'] + [f for f, _ in TARGETS.values()]: t.add(f'{OUT}/{f}', arcname=f)
    run('openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', '/tmp/ios.tar', '-out', ENC, '-pass', 'env:CRED_PASS', env={**os.environ, 'CRED_PASS': PASS})
    write_credentials_json(pw)
    print('NEW_CREDENTIALS=1')

# Communication Notifications (photos in notifications) can't be switched on through Apple's API — it's a tick box on
# developer.apple.com → Identifiers → Inbox. If it's on, profiles include it and the app gets the entitlement.
def has_comm():
    bid = [b for b in api('GET', f'/v1/bundleIds?filter[identifier]={BUNDLE}&limit=20')['data'] if b['attributes']['identifier'] == BUNDLE]
    if not bid: return False
    caps = api('GET', f"/v1/bundleIds/{bid[0]['id']}/bundleIdCapabilities?limit=200").get('data', [])
    kinds = [c['attributes'].get('capabilityType') or '' for c in caps]
    print('Capabilities on Inbox App ID:', ', '.join(kinds) or 'none')
    return any('COMMUNICATION' in k for k in kinds)
COMM = has_comm()
print(f"INBOX_COMM={'1' if COMM else '0'}")
print('Communication Notifications:', 'on ✓' if COMM else 'off (tick it on developer.apple.com → Identifiers → Inbox to get photos in notifications)')
VERSION = 'v3-comm' if COMM else 'v3'  # changes when targets/capabilities change → new profiles, same certificate

cert_id = pw = None
if os.path.exists(ENC):
    run('openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', ENC, '-out', '/tmp/ios.tar', '-pass', 'env:CRED_PASS', env={**os.environ, 'CRED_PASS': PASS})
    with tarfile.open('/tmp/ios.tar') as t: t.extractall(OUT)
    pw = open(f'{OUT}/p12pass').read().strip()
    have = open(f'{OUT}/version').read().strip() if os.path.exists(f'{OUT}/version') else 'v1'
    if have == VERSION and all(os.path.exists(f'{OUT}/{f}') for f, _ in TARGETS.values()):
        write_credentials_json(pw); print('Reusing saved signing certificate and profiles ✓'); sys.exit(0)
    # Older set: keep the certificate, make new profiles for every target
    der = None
    for extra in (['-legacy'], []):
        r = subprocess.run(['openssl', 'pkcs12', '-in', f'{OUT}/dist.p12', '-nokeys', '-clcerts', '-passin', f'pass:{pw}', *extra], capture_output=True)
        if r.returncode == 0 and b'BEGIN CERTIFICATE' in r.stdout:
            der = subprocess.run(['openssl', 'x509', '-outform', 'DER'], input=r.stdout, capture_output=True, check=True).stdout; break
    certs = api('GET', '/v1/certificates?limit=200')['data']
    for c in certs:
        if der and base64.b64decode(c['attributes'].get('certificateContent') or '') == der: cert_id = c['id']
    if cert_id: print('Found saved certificate at Apple ✓')
    else: print('Saved certificate not found at Apple — making a new one')

# 1. App IDs + capabilities
main_id = bundle_id(BUNDLE, 'Inbox')
nse_id = bundle_id(NSE, 'Inbox Notifications')
capability(main_id, 'PUSH_NOTIFICATIONS')

# 2. Distribution certificate (only when there's no usable saved one)
if not cert_id:
    run('openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', '/tmp/dist.key', '-out', '/tmp/dist.csr', '-subj', '/CN=Inbox Distribution/O=Vijayakannan Krishnan/C=US')
    cert = api('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': open('/tmp/dist.csr').read()}}})['data']
    cert_id = cert['id']
    open('/tmp/dist.cer', 'wb').write(base64.b64decode(cert['attributes']['certificateContent']))
    run('openssl', 'x509', '-inform', 'DER', '-in', '/tmp/dist.cer', '-out', '/tmp/dist.pem')
    pw = secrets.token_hex(16)
    run('openssl', 'pkcs12', '-export', '-legacy', '-inkey', '/tmp/dist.key', '-in', '/tmp/dist.pem', '-out', f'{OUT}/dist.p12', '-passout', f'pass:{pw}', '-name', 'Inbox Distribution')
    open(f'{OUT}/p12pass', 'w').write(pw)
    print('Created distribution certificate ✓')

# 3. App Store provisioning profiles (one per target; made after the capabilities so they include them)
for target, (fname, ident) in TARGETS.items():
    bid = main_id if ident == BUNDLE else nse_id
    prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': f'{target} App Store {int(time.time())}', 'profileType': 'IOS_APP_STORE'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}})['data']
    open(f'{OUT}/{fname}', 'wb').write(base64.b64decode(prof['attributes']['profileContent']))
    print(f'Created provisioning profile for {target} ✓')

# 4. Save encrypted for next builds
save(pw)
