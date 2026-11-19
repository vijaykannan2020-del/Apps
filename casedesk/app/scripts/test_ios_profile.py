"""python3 -m unittest scripts/test_ios_profile.py — the iCloud container check makes no stray profiles."""
import base64, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ios_profile import pick_or_make_profile, ContainerMissing

C = 'iCloud.com.vijaykannan.casedesk'
b64 = lambda s: base64.b64encode(s.encode()).decode()


class FakeApi:
    def __init__(self, caps=None, profiles=None, new_profile_has_container=True):
        self.calls = []
        self.caps = caps or []
        self.profiles = profiles or []
        self.new_has = new_profile_has_container

    def __call__(self, method, path, body=None, ok409=False, tries=5):
        self.calls.append((method, path.split('?')[0]))
        if method == 'GET' and path.endswith('/bundleIdCapabilities?limit=50') or 'bundleIdCapabilities' in path and method == 'GET':
            return {'data': self.caps}
        if method == 'GET' and '/profiles' in path:
            return {'data': self.profiles}
        if method == 'POST' and path == '/v1/profiles':
            body_txt = f'<plist>{C if self.new_has else "no container"}</plist>'
            return {'data': {'id': 'P-NEW', 'attributes': {'profileContent': b64(body_txt)}}}
        if method == 'DELETE':
            return {}
        raise AssertionError(f'unexpected {method} {path}')


class Test(unittest.TestCase):
    def test_creates_when_container_assigned(self):
        api = FakeApi(caps=[{'attributes': {'capabilityType': 'ICLOUD'}}])
        content, msg = pick_or_make_profile(api, 'B1', 'CERT', C, 1)
        self.assertIn(C.encode(), content)
        self.assertIn(('POST', '/v1/profiles'), api.calls)
        self.assertNotIn('DELETE', [m for m, _ in api.calls])

    def test_stops_early_when_capability_lists_other_containers(self):
        api = FakeApi(caps=[{'attributes': {'capabilityType': 'ICLOUD', 'settings': [{'key': 'ICLOUD_CONTAINERS', 'options': [{'key': 'iCloud.com.other.app'}]}]}}])
        with self.assertRaises(ContainerMissing):
            pick_or_make_profile(api, 'B1', 'CERT', C, 1)
        self.assertNotIn(('POST', '/v1/profiles'), api.calls, 'no profile made')

    def test_deletes_new_profile_without_container(self):
        api = FakeApi(new_profile_has_container=False)
        with self.assertRaises(ContainerMissing):
            pick_or_make_profile(api, 'B1', 'CERT', C, 1)
        self.assertIn(('DELETE', '/v1/profiles/P-NEW'), api.calls, 'stray profile removed')

    def test_reuses_existing_profile_with_container(self):
        prof = {'id': 'P-OLD', 'attributes': {'name': 'CaseDesk App Store 1', 'profileType': 'IOS_APP_STORE', 'profileState': 'ACTIVE', 'profileContent': b64(f'<plist>{C}</plist>')},
                'relationships': {'certificates': {'data': [{'id': 'CERT'}]}}}
        stale = {'id': 'P-V1', 'attributes': {'name': 'old v1', 'profileType': 'IOS_APP_STORE', 'profileState': 'ACTIVE', 'profileContent': b64('<plist>no icloud</plist>')}}
        api = FakeApi(profiles=[stale, prof])
        content, msg = pick_or_make_profile(api, 'B1', 'CERT', C, 1)
        self.assertIn('Reusing', msg)
        self.assertNotIn(('POST', '/v1/profiles'), api.calls)


if __name__ == '__main__':
    unittest.main()
