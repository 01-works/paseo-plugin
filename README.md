# Paseo 플러그인

Paseo용 플러그인을 모은 저장소입니다. 각 플러그인은 독립된 폴더에 manifest·소스·의존성·빌드를 갖습니다.

| 플러그인 | 기능 | 검증 환경 |
|---|---|---|
| [mac-monitor](mac-monitor/README.md) | 저부하 macOS 시스템 모니터. CPU·메모리·압력·스왑·SSD 용량, 상위 앱 10개와 프로세스 종료 | Paseo 0.10.2, arm64 macOS 26.5.1 |

## 설치

사용할 Mac의 Paseo 데몬에서 플러그인 사용을 활성화한 뒤 설치합니다.

```sh
paseo plugin install github:01-works/paseo-plugin:mac-monitor
```

업데이트는 `paseo plugin update mac-monitor`, 제거는 `paseo plugin remove mac-monitor`를 사용합니다.
측정 기준·자체 부하·알려진 한계는 [플러그인 README](mac-monitor/README.md),
직접 수행한 검증과 남은 확인 항목은 [검증 기록](mac-monitor/docs/VALIDATION.md)에 있습니다.

## 개발

Node 24를 사용해 해당 플러그인 폴더에서 검증합니다.

```sh
cd mac-monitor
npm ci
npm run typecheck
npm test
npm run build
```

GitHub Actions는 arm64·Intel macOS에서 타입 검사·단위 테스트·커밋된 헬퍼 실행·universal 빌드·서명·JSON을 확인합니다.
로컬 Activity Monitor 대조 결과와 남은 compact·다른 Mac 설치 검증은 [검증 기록](mac-monitor/docs/VALIDATION.md)에 공개합니다.
