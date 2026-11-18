#!/usr/bin/env bash
# Installs the APK on the running emulator, opens main screens via deep links and saves screenshots.
set -x
mkdir -p shots
APK=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
adb install -r "$APK"
PKG=com.vijaykannan.casedesk
adb shell settings put system font_scale 1.0
adb shell settings put global hide_error_dialogs 1 || true
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher >/dev/null 2>&1 || true
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
adb shell cmd uimode night yes
open() { adb shell am start -W -a android.intent.action.VIEW -d "casedesk://$1" $PKG >/dev/null; sleep "${2:-6}"; }
shot() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1; sleep 1; adb exec-out screencap -p > "shots/$1.png"; }
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1; sleep 20
shot 00-launch
open "demo" 12
shot 01-overview
open "status"; shot 02-documents
open "cases"; shot 03-case-status
open "tools"; shot 04-tools
open "profile"; shot 05-profile
open "status/person?id=me"; shot 06-person-me
open "status/person?id=demo-s"; shot 07-person-spouse
open "status/flow"; shot 08-upload-flow
adb shell cmd uimode night no; sleep 3
open "status"; shot 09-documents-light
open "" 4; shot 10-overview-light
adb logcat -d -s ReactNativeJS:V | tail -60 > shots/js-log.txt || true
ls -la shots
