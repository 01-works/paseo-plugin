#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! xcrun --find clang >/dev/null 2>&1; then
  if [ -x bin/macmon-helper ]; then
    echo 'CLT 없음: 커밋된 universal 헬퍼를 유지합니다.'
    exit 0
  fi
  echo 'CLT와 prebuilt 헬퍼가 모두 없습니다.' >&2
  exit 1
fi
mkdir -p bin
clang -std=c11 -Wall -Wextra -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 -o bin/macmon-helper.tmp native/macmon-helper.c
codesign -s - -f bin/macmon-helper.tmp
mv bin/macmon-helper.tmp bin/macmon-helper
