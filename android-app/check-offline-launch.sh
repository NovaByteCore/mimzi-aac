#!/usr/bin/env bash
set -euo pipefail

package=io.github.novabytecore.mimzi
adb install Mimzi.apk
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = 1

check_board() {
  adb shell am start -W -n "$package/.MainActivity"
  for attempt in {1..12}; do
    if adb shell uiautomator dump /sdcard/mimzi-window.xml >/dev/null 2>&1; then
      if adb shell cat /sdcard/mimzi-window.xml | grep -qi 'all done'; then
        return
      fi
    fi
    sleep 2
  done
  adb logcat -d -t 150
  echo 'The offline AAC board did not open.' >&2
  return 1
}

check_board
adb shell am force-stop "$package"
check_board
