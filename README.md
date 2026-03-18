# VMONSTER AI — Image to Video MVP

Kling 2.1 Pro API(FAL.ai)를 래핑한 B2B 데모용 이미지-to-비디오 웹 서비스.

## 아키텍처

```
[브라우저 UI] → [Next.js API Routes] → [FAL.ai Kling API]
     ↑                                        ↓
  이미지 업로드                          비동기 영상 생성
  + 프롬프트 입력                        (큐 → 폴링)
     ↑                                        ↓
  결과 영상 재생 ←────────────────── 영상 URL 반환
```

## 빠른 시작 (5분)

### 1. FAL.ai API 키 발급

1. [fal.ai](https://fal.ai) 가입
2. Dashboard → API Keys → Create Key
3. `.env.local` 파일 생성:

```bash
cp .env.example .env.local
# FAL_KEY=fk-... 형태로 키 입력
```

### 2. 설치 & 실행

```bash
npm install
npm run dev
```

→ http://localhost:3000 에서 확인

### 3. 배포 (Vercel 원클릭)

```bash
npx vercel
# 환경변수에 FAL_KEY 추가
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/upload` | 이미지를 FAL 스토리지에 업로드 |
| POST | `/api/generate` | Kling I2V 생성 요청 (비동기) |
| GET | `/api/status?request_id=xxx` | 생성 상태 폴링 |

## 비용

| 모델 | 5초 | 10초 |
|------|-----|------|
| Kling 2.1 Standard | $0.28 | $0.56 |
| Kling 2.1 Pro | $0.35 | $0.70 |
| Kling 2.6 Pro | ~$0.50 | ~$1.00 |

데모 30건 기준 약 $10~$20.

## 모델 변경

`app/api/generate/route.js`에서 모델 ID 변경:

```js
// Kling 2.1 Pro (기본값)
"fal-ai/kling-video/v2.1/pro/image-to-video"

// Kling 2.6 Pro (최신, 더 높은 퀄리티)
"fal-ai/kling-video/v2.6/pro/image-to-video"

// Kling 2.1 Master (최고 퀄리티, 비용 높음)
"fal-ai/kling-video/v2.1/master/image-to-video"

// Kling V3 Pro (최신)
"fal-ai/kling-video/v3/pro/image-to-video"
```

## 커스터마이징 포인트

- **브랜딩**: `app/page.js` 헤더 영역의 로고/색상
- **프롬프트 프리셋**: B2B 고객별 프리셋 추가 가능
- **후처리 연동**: vmonster 립싱크 파이프라인 연결 지점 → 영상 생성 후 lip-sync API 호출
