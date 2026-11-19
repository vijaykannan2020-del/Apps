"""python3 -m unittest scripts/test_wallet_cert.py — Wallet Pass Type ID certificate via the ASC API (v2.5)."""
import base64, datetime, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import wallet_cert as W

PT = 'pass.com.vijaykannan.casedesk'


def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def csr_for(k):
    return x509.CertificateSigningRequestBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Immigration Wallet Pass Type ID')])).sign(k, hashes.SHA256()).public_bytes(serialization.Encoding.PEM).decode()


def cert_for(pub, issuer_key, subject='Pass Type ID: ' + PT, issuer='Test CA'):
    now = datetime.datetime.now(datetime.timezone.utc)
    return (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject)]))
            .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer)])).public_key(pub).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=365)).sign(issuer_key, hashes.SHA256())
            .public_bytes(serialization.Encoding.DER))


CA = key()


class FakeApi:
    def __init__(self, has_pass_type=True, existing=(), refuse=None, wrong_key=False):
        self.calls, self.has, self.existing, self.refuse, self.wrong = [], has_pass_type, list(existing), refuse, wrong_key

    def __call__(self, method, path, body=None):
        self.calls.append((method, path.split('?')[0], body))
        if method == 'GET' and path.startswith('/v1/passTypeIds?'):
            return {'data': [{'id': 'PT1', 'attributes': {'identifier': PT}}] if self.has else [{'id': 'X', 'attributes': {'identifier': 'pass.other'}}]}
        if method == 'POST' and path == '/v1/passTypeIds':
            return {'data': {'id': 'PT-NEW'}}
        if method == 'GET' and path.startswith('/v1/passTypeIds/'):
            return {'data': self.existing}
        if method == 'POST' and path == '/v1/certificates':
            if self.refuse: raise W.ApiError(self.refuse, 'FORBIDDEN_ERROR')
            from cryptography.hazmat.primitives.serialization import load_pem_public_key  # noqa
            csr = x509.load_pem_x509_csr(body['data']['attributes']['csrContent'].encode())
            pub = key().public_key() if self.wrong else csr.public_key()
            return {'data': {'id': 'C1', 'attributes': {'certificateContent': base64.b64encode(cert_for(pub, CA)).decode()}}}
        raise AssertionError(f'unexpected {method} {path}')


class Test(unittest.TestCase):
    def setUp(self):
        self.k = key(); self.csr = csr_for(self.k)

    def test_creates_certificate_for_existing_pass_type(self):
        api = FakeApi()
        how, der, created = W.get_certificate(api, self.csr)
        self.assertEqual((how, created), ('created', False))
        self.assertEqual(W.cert_public_der(der), W.csr_public_der(self.csr))
        post = [c for c in api.calls if c[0] == 'POST' and c[1] == '/v1/certificates'][0][2]['data']
        self.assertEqual(post['attributes']['certificateType'], 'PASS_TYPE_ID')
        self.assertEqual(post['relationships']['passTypeId']['data'], {'type': 'passTypeIds', 'id': 'PT1'})
        self.assertNotIn(('POST', '/v1/passTypeIds'), [(m, p) for m, p, _ in api.calls], 'owner-registered id is reused, not recreated')

    def test_registers_pass_type_only_when_missing(self):
        api = FakeApi(has_pass_type=False)
        _, _, created = W.get_certificate(api, self.csr)
        self.assertTrue(created)

    def test_reuses_active_certificate_from_the_same_key(self):
        same = {'id': 'C0', 'attributes': {'certificateType': 'PASS_TYPE_ID', 'expirationDate': '2099-01-01', 'certificateContent': base64.b64encode(cert_for(self.k.public_key(), CA)).decode()}}
        other = {'id': 'C9', 'attributes': {'certificateType': 'PASS_TYPE_ID', 'expirationDate': '2099-01-01', 'certificateContent': base64.b64encode(cert_for(key().public_key(), CA)).decode()}}
        api = FakeApi(existing=[other, same])
        how, der, _ = W.get_certificate(api, self.csr)
        self.assertEqual(how, 'reused')
        self.assertNotIn('/v1/certificates', [p for m, p, _ in api.calls if m == 'POST'])

    def test_refused_by_apple_raises_for_the_manual_route(self):
        with self.assertRaises(W.ApiError) as e:
            W.get_certificate(FakeApi(refuse=403), self.csr)
        self.assertEqual(e.exception.code, 403)
        self.assertIn('Pass Type ID Certificate', W.MANUAL)

    def test_certificate_for_another_key_is_rejected(self):
        with self.assertRaises(W.ApiError):
            W.get_certificate(FakeApi(wrong_key=True), self.csr)

    def test_wwdr_download_is_checked(self):
        d = tempfile.mkdtemp()
        root = key()
        good = cert_for(root.public_key(), root, subject='Apple Worldwide Developer Relations Certification Authority', issuer='Apple Root CA')
        self.assertTrue(W.ensure_wwdr(d, lambda u: good))
        self.assertFalse(W.ensure_wwdr(d, lambda u: (_ for _ in ()).throw(AssertionError('not again'))))
        with self.assertRaises(SystemExit):
            W.ensure_wwdr(tempfile.mkdtemp(), lambda u: cert_for(root.public_key(), root, subject='Evil CA', issuer='Evil'))


if __name__ == '__main__':
    unittest.main()
