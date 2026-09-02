# Greus Cat · Gemini Live DeskPet

`NE5-Talk-with-AI`의 Gemini Live 대화 기능과 `NE5-Deskpet_V01`에서 완성한 그루스 고양이 SVG 캐릭터를 결합한 React + TypeScript PWA입니다.

## 캐릭터 기능

- 기존 14개 캐릭터를 그루스 고양이 단일 semantic SVG 리그로 완전 교체
- 초록냥, 치즈냥, 삼색냥, 검은냥, 커스텀냥 5개 털색
- 26개 감정과 부드러운 any-to-any 얼굴 전환
- 냥냥 펀치, 잠자기, 기지개, 세수하기, 하품, 꾹꾹이, 나비 사냥 7개 동작
- 호흡, 눈 깜빡임, 꼬리 흔들기, 머리 쓰다듬기
- 마이크 입력 레벨에 반응하는 1~3초 간격 귀 쫑긋과 Gemini 음성 출력 립싱크

## Gemini Live 기능

- 16 kHz PCM 마이크 입력과 24 kHz PCM 출력
- 입력/출력 자막, 마이크·스피커 선택, 30개 음성 선택
- 26개 감정을 직접 선택하는 `set_pet_expression` 도구
- 세션 복원, context window compression, GoAway 재연결
- TTS 재생 중 마이크 hard gate
- Vercel Functions에서 제한형 Live 토큰 발급

## 로컬 실행

Node.js 24를 권장합니다.

```powershell
npm install
npm run dev
```

API 키 없이도 `데모 보기`, 5개 털색, 26개 감정, 7개 동작을 모두 확인할 수 있습니다.

## 검증

```powershell
npm run typecheck
npm test
npm run build
```

## Vercel 배포

이 앱은 `/api/live-token` 서버리스 함수가 필요하므로 GitHub Pages 대신 Vercel 배포를 권장합니다.

1. Vercel에서 이 저장소를 Import합니다.
2. `GEMINI_API_KEY`를 Sensitive 환경 변수로 등록합니다.
3. 배포 후 `/api/mobile-status`가 `{ "hasApiKey": true }`를 반환하는지 확인합니다.

장기 API 키와 캐릭터 페르소나는 브라우저 번들에 포함되지 않습니다. 자세한 절차는 [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)를 참고하세요.
