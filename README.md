# DeskPet PC + Mobile prototype

Electron + React + TypeScript로 만든 Gemini Live 데스크 펫입니다. 같은 코드에서 Windows PC 앱과 Android/iPhone 설치형 PWA를 제공합니다.

## 포함된 기능

- 업로드된 10종 레퍼런스를 개성화한 캐릭터와 신규 로봇 3종·지라이 1종, 총 14종 semantic SVG asset
- 같은 리그 파라미터를 공유하는 16종 감정
- 감정 간 연속 보간, procedural blink/breathing, 듣기/생각/말하기 overlay
- 24 kHz PCM 출력 에너지 기반 립싱크
- 마이크 16 kHz PCM16 변환과 20 ms chunk
- TTS 재생 중 microphone hard gate, playback drain + 160 ms 이후 입력 복구
- 마이크/스피커 선택 및 입력 레벨
- Gemini Live input/output transcription과 감정 function call
- context window compression, 호환 모델·음성별 session resumption handle, GoAway/재접속
- stale WebSocket 이벤트 차단, 재연결 후 마이크·표정 상태 자동 복구
- 선택 음성과 Live 모델은 전역 설정으로 보존되며 어떤 캐릭터에서도 동일하게 적용
- 스트리밍 자막 chunk 누적과 최대 4줄 가독성 레이아웃
- Google의 30개 사전 제작 음성 전체 선택
- 저장한 키의 계정에서 사용 가능한 Live 모델 동적 조회/선택
- Gemini API 키를 Windows 보안 저장소로 암호화하여 재실행 후에도 유지
- 선택 캐릭터·Live 모델·음성·마이크·스피커·자막 설정 자동 저장/재실행 복원
- Electron main에서 constrained ephemeral token 발급
- 스마트폰용 반응형 PWA, 홈 화면 설치 manifest, offline app-shell
- 모바일 서버리스 token broker: API 키·persona를 휴대폰 번들에 포함하지 않음
- 모바일 캐릭터·모델·음성·장치 설정과 캐릭터별 세션 재개 상태 자동 보존

## 실행

Node.js 22 이상과 pnpm이 필요합니다.

```powershell
pnpm install
pnpm generate:characters
pnpm dev
```

API 키가 없어도 `데모 보기`와 14종/16감정 UI는 동작합니다.

의존성과 빌드가 이미 준비된 현재 작업공간에서는 상위 `outputs` 폴더의
`Start-DeskPet.cmd`를 더블클릭하면 됩니다. 프로젝트를 다른 위치로 옮겼다면
`pnpm install`, `pnpm build` 후 이 폴더의 `Start-DeskPet.cmd`를 실행합니다.

실제 Gemini Live 연결은 앱의 `설정 → Gemini API 키`에서 새로 발급한 키를 입력하고
`안전하게 저장`을 누릅니다. 키는 Electron main process가 Windows 보안 저장소로
암호화하며 앱을 다시 실행해도 유지됩니다. 저장 후 `Gemini Live 모델`에서 이 키로
실제로 조회되는 모델을 선택할 수 있습니다.

환경 변수를 선호한다면 아래처럼 설정할 수도 있으며, 환경 변수가 암호화 저장값보다 우선합니다.

```powershell
$env:GEMINI_API_KEY = "새로 발급한 키"
pnpm dev
```

## 보안 경계

- 렌더러는 장기 API 키와 persona 원문을 받지 않습니다.
- main process가 Gemini에 persona/system instruction을 포함한 제한형 ephemeral token을 요청합니다.
- renderer는 짧은 수명의 token으로 Live WebSocket에 직접 연결합니다.
- 암호화된 키만 Electron userData에 저장되며 평문 키는 renderer로 반환하지 않습니다.
- resume handle은 main process의 앱 데이터에 저장되고 일반 로그에 기록하지 않습니다.
- desktop binary만으로 persona 원문을 완전히 은닉할 수는 없습니다. 배포판에서는 token broker와 persona vault를 별도 backend로 옮겨야 합니다.
- 모바일판은 `api/live-token.ts`에서 제한형 토큰을 발급하므로 장기 키와 persona가 브라우저로 전달되지 않습니다.
- transcript 영구 저장은 구현하지 않았으며 기본적으로 저장하지 않습니다.

## 스마트폰 실행

스마트폰 마이크 권한을 위해 HTTPS 배포가 필요합니다. [MOBILE-SETUP.md](MOBILE-SETUP.md)에 Vercel 환경 변수, 홈 화면 설치, 테스트 순서를 정리했습니다.

## 검증

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Google Live API는 preview 필드를 포함하므로 SDK 버전 변경은 `GeminiLiveAdapter`와 Electron token broker에서만 흡수하도록 분리했습니다.
