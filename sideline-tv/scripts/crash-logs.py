#!/usr/bin/env python3
"""Prints the newest TestFlight crash reports for Sideline TV (sent with 'Share' after a crash)."""
import json, os, sys, time, urllib.request, urllib.error
import jwt
APP = os.environ['ASC_APP_ID']
PRIV = open(os.environ['EXPO_ASC_API_KEY_PATH']).read()
def api(path):
    tok = jwt.encode({'iss': os.environ['EXPO_ASC_ISSUER_ID'], 'iat': int(time.time()), 'exp': int(time.time()) + 900, 'aud': 'appstoreconnect-v1'}, PRIV, algorithm='ES256', headers={'kid': os.environ['EXPO_ASC_KEY_ID'], 'typ': 'JWT'})
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e: print(path, e.code, e.read().decode()[:400]); return {}
subs = api(f'/v1/apps/{APP}/betaFeedbackCrashSubmissions?limit=5&sort=-createdDate').get('data', [])
print(f'{len(subs)} crash report(s)')
for s in subs[:3]:
    a = s['attributes']; print('=====', a.get('createdDate'), a.get('deviceModel'), a.get('osVersion'), a.get('comment') or '')
    log = api(f"/v1/betaFeedbackCrashSubmissions/{s['id']}/crashLog").get('data', {}).get('attributes', {}).get('logText') or ''
    lines = log.splitlines()
    # exception info + crashed thread
    keep, on = [], False
    for ln in lines:
        if any(k in ln for k in ('Exception Type', 'Exception Reason', 'Exception Codes', 'Termination Reason', 'Last Exception Backtrace', 'Application Specific')): keep.append(ln); on = 'Backtrace' in ln
        elif 'Crashed:' in ln: on = True; keep.append(ln)
        elif on:
            if not ln.strip(): on = False
            else: keep.append(ln)
    print('\n'.join(keep[:80]) or log[:4000])
