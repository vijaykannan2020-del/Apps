"""Choose or make CaseDesk's App Store provisioning profile, checking the iCloud container first.

Apple's API can't assign an iCloud container to an App ID (the owner does that on developer.apple.com,
ICLOUD.md). This module makes sure a run without the container stops cleanly and leaves no stray
profiles: it (1) stops early if the iCloud capability lists other containers but not ours, (2) reuses
an active App Store profile that already has the container, (3) otherwise creates one and, if Apple
made it without the container, deletes it again and stops. Tested in scripts/test_ios_profile.py."""
import base64, json


class ContainerMissing(Exception):
    pass


def pick_or_make_profile(api, bid, cert_id, container, stamp):
    """api(method, path, body=None, ...) -> dict (the App Store Connect helper). Returns (content, message)."""
    want = container.encode()
    # 1. What Apple says about the iCloud capability (it doesn't always list containers).
    try:  # this relationship endpoint takes no query parameters
        caps = api('GET', f'/v1/bundleIds/{bid}/bundleIdCapabilities', tries=2)
    except SystemExit:
        caps = {}
    icloud = [c for c in caps.get('data', []) if c.get('attributes', {}).get('capabilityType') == 'ICLOUD']
    listed = json.dumps(icloud)
    import re, sys
    print('iCloud capability as Apple lists it: ' + listed[:1500], file=sys.stderr)
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
        if at.get('profileType') == 'IOS_APP_STORE' and at.get('profileState') == 'ACTIVE' and want in raw and (not certs or cert_id in certs):
            return raw, f"Reusing App Store profile {at.get('name')} (has the iCloud container) ✓"
    # 3. Make one; delete it again if the container isn't in it.
    prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': f'CaseDesk App Store {stamp}', 'profileType': 'IOS_APP_STORE'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}})['data']
    content = base64.b64decode(prof['attributes']['profileContent'])
    if want not in content:
        import re, sys
        ents = re.findall(rb'iCloud\.[A-Za-z0-9.\-*]+', content)
        print('stopped at step 3: new profile iCloud ids = ' + repr(sorted(set(ents)))[:800], file=sys.stderr)
        api('DELETE', f"/v1/profiles/{prof['id']}", tries=2)
        raise ContainerMissing()
    return content, 'Created provisioning profile (with iCloud container) ✓'
