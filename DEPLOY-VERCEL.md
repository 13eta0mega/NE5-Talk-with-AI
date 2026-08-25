# 스마트폰 테스트 배포

이 저장소는 Vite PWA와 Vercel Functions를 함께 배포하도록 설정되어 있습니다.

## 배포

1. [Vercel New Project](https://vercel.com/new)에서 이 GitHub 저장소를 Import합니다.
2. Environment Variables에 `GEMINI_API_KEY`를 추가하고 Sensitive로 표시합니다.
3. Production, Preview, Development 환경을 선택합니다.
4. Deploy를 누릅니다.
5. 배포 주소의 `/api/mobile-status`가 `{"hasApiKey":true}`를 반환하는지 확인합니다.

환경 변수는 새 배포부터 적용되므로 키를 나중에 추가했다면 Redeploy가 필요합니다.

## 스마트폰

- Android Chrome: 배포된 HTTPS 주소 열기 → 메뉴 → 앱 설치
- iPhone Safari: 배포된 HTTPS 주소 열기 → 공유 → 홈 화면에 추가

첫 대화 시작 때 마이크 권한을 허용하세요. 장기 API 키와 캐릭터 persona는 휴대폰으로 전달되지 않고, 서버에서 제한형 Live 토큰만 발급합니다.

## 보안

채팅이나 공개 저장소에 노출된 키는 사용하지 말고 새 키를 발급해 Vercel에만 저장하세요. 실제 키를 `.env` 또는 `VITE_*` 변수로 커밋하면 안 됩니다.
