"""Choose or make CaseDesk's App Store provisioning profile, checking the iCloud container first.

Apple's API can't assign an iCloud container to an App ID (the owner does that on developer.apple.com,
ICLOUD.md). This module makes sure a run without the container stops cleanly and leaves no stray
profiles: it (1) stops early if the iCloud capability lists other containers but not ours, (2) reuses
an active App Store profile that already has the container, (3) otherwise creates one and, if Apple
made it without the container, deletes it again and stops. Tested in scripts/test_ios_profile.py."""
import base64, json


class ContainerMissing(Exception):
    pass


class EntitlementMissing(Exception):
    """A new profile came back without an identifier that must be in it (e.g. the App Group, v2.5)."""
    def __init__(self, missing):
        super().__init__(', '.join(missing))
        self.missing = missing


def pick_or_make_profile(api, bid, cert_id, container, stamp, require=(), must=(), name='CaseDesk App Store'):
    """api(method, path, body=None, ...) -> dict (the App Store Connect helper). Returns (content, message).
    container: the iCloud container that must be in the profile, or None (the widget extension has none).
    require: extra entitlement keys (bytes) a reused profile must carry, e.g. b'com.apple.developer.applesignin'.
    must: identifiers (bytes) that must be in the profile, e.g. b'group.com.vijaykannan.casedesk' — the owner
    assigns App Groups on developer.apple.com, so a new profile without one is deleted again (EntitlementMissing)."""
    want = container.encode() if container else b''
    # 1. What Apple says about the iCloud capability (it doesn't always list containers).
    caps = {}
    if container:
        try:  # this relationship endpoint takes no query parameters
            caps = api('GET', f'/v1/bundleIds/{bid}/bundleIdCapabilities', tries=2)
        except SystemExit:
            caps = {}
    icloud = [c for c in caps.get('data', []) if c.get('attributes', {}).get('capabilityType') == 'ICLOUD']
    listed = json.dumps(icloud)
    import re, sys
    if container: print('iCloud capability as Apple lists it: ' + listed[:1500], file=sys.stderr)
    if icloud and 'iCloud.' in listed and container not in listed:
        print('stopped at step 1: other containers listed', file=sys.stderr)
        raise ContainerMissing()
    # 2. Reuse an active App Store profile with the container and our certificate.
    try:
        profs = api('GET', f'/v1/bundleIds/{bid}/profiles', tries=2)
    except SystemExit:
        profs = {}
    for pr in profs.get('data', []):
        at = pr.get('attributes', {})
        certs = [c['id'] for c in (pr.get('relationships', {}).get('certificates', {}).get('data') or [])]
        raw = base64.b64decode(at.get('profileContent') or '')
        if at.get('profileType') == 'IOS_APP_STORE' and at.get('profileState') == 'ACTIVE' and want in raw and all(r in raw for r in require) and all(m in raw for m in must) and (not certs or cert_id in certs):
            return raw, f"Reusing App Store profile {at.get('name')}" + (' (has the iCloud container)' if container else '') + ' ✓'
    # 3. Make one; delete it again if the container isn't in it.
    prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': f'{name} {stamp}', 'profileType': 'IOS_APP_STORE'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}})['data']
    content = base64.b64decode(prof['attributes']['profileContent'])
    if want not in content:
        import re, sys
        ents = re.findall(rb'iCloud\.[A-Za-z0-9.\-*]+', content)
        print('stopped at step 3: new profile iCloud ids = ' + repr(sorted(set(ents)))[:800], file=sys.stderr)
        api('DELETE', f"/v1/profiles/{prof['id']}", tries=2)
        raise ContainerMissing()
    lacking = [m.decode() for m in must if m not in content]
    if lacking:
        import sys
        print('stopped at step 3: new profile lacks ' + ', '.join(lacking), file=sys.stderr)
        api('DELETE', f"/v1/profiles/{prof['id']}", tries=2)
        raise EntitlementMissing(lacking)
    missing = [r.decode() for r in require if r not in content]
    if missing:
        import sys
        print('warning: new profile lacks ' + ', '.join(missing) + ' (capability may still be propagating)', file=sys.stderr)
    return content, 'Created provisioning profile' + (' (with iCloud container)' if container else '') + ' ✓'


def ensure_capability(api, bid, caps, cap, label):
    """Turn a capability on only when Apple lists it as off. caps=None (lookup failed) → leave it alone:
    re-posting App Groups / iCloud can reset what the owner assigned on developer.apple.com."""
    if caps is None:
        return f'Couldn’t read capabilities for {label}; leaving {cap} as it is'
    if any(c.get('attributes', {}).get('capabilityType') == cap for c in caps):
        return f'{cap} already on for {label} ✓'
    api('POST', '/v1/bundleIdCapabilities', {'data': {'type': 'bundleIdCapabilities', 'attributes': {'capabilityType': cap},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}}}}, ok409=True)
    return f'{cap} turned on for {label} ✓'


def credentials_doc(pw, out, main_target=None, widget_target=None):
    """EAS local credentials.json. With an app extension, one entry per Xcode target, keyed by target name
    (docs.expo.dev/app-signing/local-credentials, multi-target); both use the same distribution certificate."""
    cert = {'path': f'{out}/dist.p12', 'password': pw}
    if not widget_target:
        return {'ios': {'provisioningProfilePath': f'{out}/profile.mobileprovision', 'distributionCertificate': cert}}
    return {'ios': {main_target: {'provisioningProfilePath': f'{out}/profile.mobileprovision', 'distributionCertificate': cert},
                    widget_target: {'provisioningProfilePath': f'{out}/widget.mobileprovision', 'distributionCertificate': dict(cert)}}}
