"""python3 -m unittest scripts/test_ios_profile.py — the iCloud container check makes no stray profiles."""
import base64, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ios_profile import pick_or_make_profile, ContainerMissing, EntitlementMissing, ensure_capability, credentials_doc

C = 'iCloud.com.vijaykannan.casedesk'
b64 = lambda s: base64.b64encode(s.encode()).decode()


class FakeApi:
    def __init__(self, caps=None, profiles=None, new_profile_has_container=True, new_profile_extra=''):
        self.extra = new_profile_extra
        self.calls = []
        self.caps = caps or []
        self.profiles = profiles or []
        self.new_has = new_profile_has_container

    def __call__(self, method, path, body=None, ok409=False, tries=5):
        self.calls.append((method, path.split('?')[0]))
        if method == 'GET' and 'bundleIdCapabilities' in path and method == 'GET':
            return {'data': self.caps}
        if method == 'GET' and '/profiles' in path:
            return {'data': self.profiles}
        if method == 'POST' and path == '/v1/profiles':
            body_txt = f'<plist>{C if self.new_has else "no container"} {self.extra}</plist>'
            return {'data': {'id': 'P-NEW', 'attributes': {'profileContent': b64(body_txt)}}}
        if method == 'DELETE':
            return {}
        if method == 'POST' and path == '/v1/bundleIdCapabilities':
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

    def test_skips_profile_without_sign_in_with_apple(self):
        ent = b'com.apple.developer.applesignin'
        old = {'id': 'P-OLD', 'attributes': {'name': 'v2', 'profileType': 'IOS_APP_STORE', 'profileState': 'ACTIVE', 'profileContent': b64(f'<plist>{C}</plist>')}}
        api = FakeApi(profiles=[old])
        content, msg = pick_or_make_profile(api, 'B1', 'CERT', C, 1, require=[ent])
        self.assertIn(('POST', '/v1/profiles'), api.calls, 'v2 profile without the entitlement is not reused')
        withit = {'id': 'P-V3', 'attributes': {'name': 'v3', 'profileType': 'IOS_APP_STORE', 'profileState': 'ACTIVE', 'profileContent': b64(f'<plist>{C} com.apple.developer.applesignin</plist>')}}
        api2 = FakeApi(profiles=[old, withit])
        content, msg = pick_or_make_profile(api2, 'B1', 'CERT', C, 1, require=[ent])
        self.assertIn('Reusing', msg)
        self.assertNotIn(('POST', '/v1/profiles'), api2.calls)


G = 'group.com.vijaykannan.casedesk'


class TestWidgets(unittest.TestCase):
    """v2.5: App Group must be in both profiles; the widget profile has no iCloud container."""
    def test_main_profile_without_group_is_deleted(self):
        api = FakeApi(caps=[{'attributes': {'capabilityType': 'ICLOUD'}}])
        with self.assertRaises(EntitlementMissing) as e:
            pick_or_make_profile(api, 'B1', 'CERT', C, 1, must=[G.encode()])
        self.assertEqual(e.exception.missing, [G])
        self.assertIn(('DELETE', '/v1/profiles/P-NEW'), api.calls, 'stray profile removed')

    def test_main_profile_with_group_is_kept(self):
        api = FakeApi(new_profile_extra=G)
        content, _ = pick_or_make_profile(api, 'B1', 'CERT', C, 1, must=[G.encode()])
        self.assertIn(G.encode(), content)

    def test_old_profile_without_group_is_not_reused(self):
        old = {'id': 'P-V3', 'attributes': {'name': 'v3', 'profileType': 'IOS_APP_STORE', 'profileState': 'ACTIVE', 'profileContent': b64(f'<plist>{C}</plist>')}}
        api = FakeApi(profiles=[old], new_profile_extra=G)
        pick_or_make_profile(api, 'B1', 'CERT', C, 1, must=[G.encode()])
        self.assertIn(('POST', '/v1/profiles'), api.calls)

    def test_widget_profile_needs_no_container_and_skips_icloud_lookup(self):
        api = FakeApi(new_profile_has_container=False, new_profile_extra=G)
        content, msg = pick_or_make_profile(api, 'W1', 'CERT', None, 1, must=[G.encode()], name='CaseDesk Widget App Store')
        self.assertIn(G.encode(), content)
        self.assertNotIn(('GET', '/v1/bundleIds/W1/bundleIdCapabilities'), api.calls)
        self.assertNotIn('DELETE', [m for m, _ in api.calls])
        api2 = FakeApi(new_profile_has_container=False)
        with self.assertRaises(EntitlementMissing):
            pick_or_make_profile(api2, 'W1', 'CERT', None, 1, must=[G.encode()])
        self.assertIn(('DELETE', '/v1/profiles/P-NEW'), api2.calls)

    def test_capability_turned_on_only_when_off_and_never_when_unknown(self):
        api = FakeApi()
        self.assertIn('already on', ensure_capability(api, 'B1', [{'attributes': {'capabilityType': 'APP_GROUPS'}}], 'APP_GROUPS', 'app'))
        self.assertEqual(api.calls, [])
        self.assertIn('leaving', ensure_capability(api, 'B1', None, 'APP_GROUPS', 'app'))
        self.assertEqual(api.calls, [], 'lookup failed → no POST')
        self.assertIn('turned on', ensure_capability(api, 'B1', [{'attributes': {'capabilityType': 'ICLOUD'}}], 'APP_GROUPS', 'app'))
        self.assertEqual(api.calls, [('POST', '/v1/bundleIdCapabilities')])

    def test_credentials_json_lists_both_targets(self):
        single = credentials_doc('pw', 'credentials')
        self.assertEqual(single['ios']['provisioningProfilePath'], 'credentials/profile.mobileprovision')
        multi = credentials_doc('pw', 'credentials', 'ImmigrationWallet', 'widget')
        self.assertEqual(set(multi['ios']), {'ImmigrationWallet', 'widget'})
        self.assertEqual(multi['ios']['widget']['provisioningProfilePath'], 'credentials/widget.mobileprovision')
        self.assertEqual(multi['ios']['widget']['distributionCertificate'], {'path': 'credentials/dist.p12', 'password': 'pw'})

    def test_script_target_names_match_prebuild(self):
        import json
        app = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'app.json')))['expo']
        self.assertEqual(''.join(ch for ch in app['name'] if ch.isalnum()), 'ImmigrationWallet')
        src = open(os.path.join(os.path.dirname(__file__), 'ios-credentials.py')).read()
        self.assertIn("VERSION = 'v4-widgets'", src)
        self.assertIn("WIDGET_TARGET = 'widget'", src)


if __name__ == '__main__':
    unittest.main()
