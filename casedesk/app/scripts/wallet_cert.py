#!/usr/bin/env python3
"""Immigration Wallet: get the Apple Wallet Pass Type ID certificate without a Mac (v2.5).

The CaseDesk server makes its own private key + CSR on first start (casedesk/server/src/wallet.mjs) and
offers the CSR — public data — at https://casedeskapp.duckdns.org/api/wallet/csr until a certificate is in
place. This script (run by .github/workflows/casedesk-wallet-cert.yml):
  1. fetches that CSR,
  2. finds the Pass Type ID pass.com.vijaykannan.casedesk (registered by the owner; created only if missing),
  3. reuses an active PASS_TYPE_ID certificate made from the same CSR key, or asks Apple for a new one
     (POST /v1/certificates, certificateType PASS_TYPE_ID, relationship passTypeId),
  4. writes the public certificate to casedesk/server/wallet/pass.cer (+ Apple's WWDR G4 intermediate).
The workflow commits those two public files; the server picks them up on its next auto-update. The private
key never leaves the server.

If Apple refuses (some accounts get 403 FORBIDDEN for PASS_TYPE_ID since early 2026), it saves the CSR as a
workflow artifact and prints the 3 portal steps for the owner (WALLET.md). Exit codes: 0 done, 2 manual step needed.
Tests: python3 -m unittest scripts/test_wallet_cert.py"""
import base64, json, os, sys, time, urllib.error, urllib.request

PASS_TYPE_ID = os.environ.get('PASS_TYPE_ID', 'pass.com.vijaykannan.casedesk')
CSR_URL = os.environ.get('CSR_URL', 'https://casedeskapp.duckdns.org/api/wallet/csr')
OUT_DIR = os.environ.get('WALLET_OUT', '../server/wallet')
WWDR_URL = 'https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer'


class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(f'{code}: {msg}')
        self.code = code


def make_api():
    import jwt  # pyjwt
    key_id, issuer = os.environ['EXPO_ASC_KEY_ID'], os.environ['EXPO_ASC_ISSUER_ID']
    priv = open(os.environ['EXPO_ASC_API_KEY_PATH']).read()

    def api(method, path, body=None):
        for n in range(4):
            tok = jwt.encode({'iss': issuer, 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, priv, algorithm='ES256', headers={'kid': key_id, 'typ': 'JWT'})
            req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method, data=json.dumps(body).encode() if body else None,
                                         headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req) as r: return json.loads(r.read() or b'{}')
            except urllib.error.HTTPError as e:
                msg = e.read().decode()
                if e.code >= 500 and n < 3: time.sleep(10 * (n + 1)); continue
                raise ApiError(e.code, msg[:600])
    return api


def csr_public_der(csr_pem):
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    csr = x509.load_pem_x509_csr(csr_pem.encode())
    return csr.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def cert_public_der(cert_der):
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    c = x509.load_der_x509_certificate(cert_der)
    return c.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def find_or_create_pass_type(api, identifier):
    res = api('GET', f'/v1/passTypeIds?filter[identifier]={identifier}&limit=20')
    found = [p for p in res.get('data', []) if p.get('attributes', {}).get('identifier') == identifier]
    if found:
        return found[0]['id'], False
    made = api('POST', '/v1/passTypeIds', {'data': {'type': 'passTypeIds', 'attributes': {'identifier': identifier, 'name': 'Immigration Wallet status card'}}})
    return made['data']['id'], True


def get_certificate(api, csr_pem, identifier=PASS_TYPE_ID):
    """→ ('reused' | 'created', der, pass_type_created). Raises ApiError when Apple refuses."""
    want = csr_public_der(csr_pem)
    pid, created = find_or_create_pass_type(api, identifier)
    try:
        existing = api('GET', f'/v1/passTypeIds/{pid}/certificates?limit=50').get('data', [])
    except ApiError:
        existing = []
    for c in existing:
        at = c.get('attributes', {})
        content = at.get('certificateContent')
        if not content or at.get('certificateType') not in (None, 'PASS_TYPE_ID', 'PASS_TYPE_ID_WITH_NFC'):
            continue
        der = base64.b64decode(content)
        if cert_public_der(der) == want and (at.get('expirationDate') or '9') > time.strftime('%Y-%m-%d'):
            return 'reused', der, created
    res = api('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': 'PASS_TYPE_ID', 'csrContent': csr_pem},
                                                    'relationships': {'passTypeId': {'data': {'type': 'passTypeIds', 'id': pid}}}}})
    der = base64.b64decode(res['data']['attributes']['certificateContent'])
    if cert_public_der(der) != want:
        raise ApiError(0, 'Apple returned a certificate for another key')
    return 'created', der, created


MANUAL = """::warning::Apple didn't let the API make the Wallet certificate ({why}). One-time owner step on the iPhone (WALLET.md):
  1. Safari: open {csr_url} → it downloads ImmigrationWallet-pass.certSigningRequest to Files (it's also attached to this run as an artifact).
  2. developer.apple.com/account → Certificates → + → Pass Type ID Certificate → Continue → pick {pid} → upload that file → Continue → Download.
  3. github.com → casedesk/server/wallet → Add file → Upload files → the downloaded pass.cer → Commit to main.
The server turns Wallet cards on within a few minutes (https://casedeskapp.duckdns.org/api/wallet/status → enabled: true)."""


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'casedesk-wallet-cert'})) as r:
        return r.read()


def ensure_wwdr(out_dir, fetch_fn=fetch):
    from cryptography import x509
    path = os.path.join(out_dir, 'AppleWWDRCAG4.cer')
    if os.path.exists(path):
        return False
    der = fetch_fn(WWDR_URL)
    c = x509.load_der_x509_certificate(der)
    if 'Apple Worldwide Developer Relations' not in c.subject.rfc4514_string() or 'Apple Root CA' not in c.issuer.rfc4514_string():
        raise SystemExit('Unexpected WWDR certificate')
    open(path, 'wb').write(der)
    return True


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(os.path.join(OUT_DIR, 'pass.cer')) and os.environ.get('FORCE') != '1':
        print('casedesk/server/wallet/pass.cer is already there ✓ (set FORCE=1 to replace it)')
        print('WWDR ' + ('downloaded ✓' if ensure_wwdr(OUT_DIR) else 'already there ✓'))
        return 0
    try:
        csr_pem = fetch(CSR_URL).decode()
    except Exception as e:
        print(f'::error::Couldn’t fetch the CSR from {CSR_URL} ({e}). Is the server updated to v2.5 and running?', file=sys.stderr)
        return 1
    if 'BEGIN CERTIFICATE REQUEST' not in csr_pem:
        print(f'::error::{CSR_URL} did not return a CSR (signing may already be set up).', file=sys.stderr)
        return 1
    open('wallet-pass.certSigningRequest', 'w').write(csr_pem)  # artifact for the manual route
    print('WWDR ' + ('downloaded ✓' if ensure_wwdr(OUT_DIR) else 'already there ✓'))
    try:
        how, der, created = get_certificate(make_api(), csr_pem)
    except ApiError as e:
        print(MANUAL.format(why=f'HTTP {e}'[:300], csr_url=CSR_URL, pid=PASS_TYPE_ID))
        return 2
    open(os.path.join(OUT_DIR, 'pass.cer'), 'wb').write(der)
    print(('Pass Type ID registered ✓\n' if created else '') + f'Pass Type ID certificate {how} ✓ → casedesk/server/wallet/pass.cer')
    print('NEW_WALLET_CERT=1')
    return 0


if __name__ == '__main__':
    sys.exit(main())
