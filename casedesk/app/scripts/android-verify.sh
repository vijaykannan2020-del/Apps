#!/usr/bin/env bash
# Installs the release APK on the running emulator, opens the main screens (example family) and saves a
# screenshot of each, plus the JS log and any crash. Used by the CaseDesk Android build workflow.
set -x
APK="${1:?apk path}"
PKG=com.vijaykannan.casedesk
mkdir -p shots
adb install -r "$APK" || exit 1
adb shell settings put global hide_error_dialogs 1 || true
adb logcat -c || true
open() { adb shell am start -W -a android.intent.action.VIEW -d "casedesk://$1" $PKG >/dev/null; sleep "${2:-6}"; }
shot() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1; sleep 1; adb exec-out screencap -p > "shots/$1.png"; }
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1; sleep 25
shot 00-launch
open "demo" 14; shot 01-home
open "family"; shot 02-family
open "cases"; shot 03-cases
open "tools"; shot 04-tools
open "updates"; shot 05-news
open "forum"; shot 06-community
open "settings"; shot 07-settings
open "settings-page/notifications"; shot 08-notifications
open "settings-page/backup"; shot 09-backup
open "settings-page/widgets"; shot 10-widgets
open "settings-page/privacy"; shot 11-privacy
adb shell cmd uimode night yes; sleep 3
open "" 5; shot 12-home-dark
adb logcat -d -s ReactNativeJS:V | tail -120 > shots/js-log.txt || true
adb logcat -d -b crash > shots/crash-log.txt || true
if adb shell pidof $PKG >/dev/null; then echo "App still running ✓"; else echo "::error::App is not running at the end (crash?)"; exit 1; fi
if grep -q "FATAL EXCEPTION" shots/crash-log.txt; then echo "::error::Crash found"; head -40 shots/crash-log.txt; exit 1; fi
ls -la shots
