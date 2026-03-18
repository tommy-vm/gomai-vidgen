# GOM AI — Image to Video MVP

곰앤컴퍼니 내부 MVP 프로젝트. FAL.ai의 Kling 2.1 Pro 모델을 사용해 이미지를 영상으로 변환하는 웹 서비스입니다.

---

## 개요

이미지를 업로드하고 프롬프트를 입력하면 AI가 영상을 생성합니다. 생성은 비동기로 처리되며 완료되면 자동으로 재생됩니다.

```
브라우저 (이미지 + 프롬프트 입력)
    ↓
Next.js API Routes
    ↓
FAL.ai Kling API (비동기 큐 → 폴링)
    ↓
생성된 영상 URL 반환 → 브라우저 재생
```

**Tech Stack:** Next.js 14 · Tailwind CSS · @fal-ai/client

---

## 시작하기 전에

- Node.js 18 이상
- [fal.ai](https://fal.ai) 계정 및 API 키

---

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/tommy-vm/gomai-vidgen.git
cd gomai-vidgen
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열고 FAL.ai API 키를 입력합니다:

```
FAL_KEY=fk-xxxxxxxxxxxxxxxxxxxxxxxx
```

> API 키는 [fal.ai Dashboard → API Keys](https://fal.ai/dashboard/keys) 에서 발급받을 수 있습니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

---

## 프로덕션 배포

### Vercel (권장)

```bash
npm install -g vercel
vercel
```

배포 후 Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에서 `FAL_KEY` 추가

### 자체 서버 (Node.js)

```bash
npm run build
npm start
```

기본 포트는 3000. 포트를 변경하려면:

```bash
PORT=8080 npm start
```

### 자체 서버 (PM2)

```bash
npm install -g pm2
npm run build
pm2 start "npm start" --name gomai-vidgen
pm2 save
```

---

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `FAL_KEY` | 필수 | FAL.ai API 키 |
| `MAX_DURATION` | 선택 | 영상 최대 길이(초), 기본값 10 |

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/upload` | 이미지를 FAL 스토리지에 업로드 |
| POST | `/api/generate` | 영상 생성 요청 (비동기) |
| GET | `/api/status?request_id=xxx` | 생성 상태 폴링 |

---

## 모델 변경

`app/api/generate/route.js` 에서 모델 ID를 변경할 수 있습니다:

```js
// Kling 2.1 Pro (기본값)
"fal-ai/kling-video/v2.1/pro/image-to-video"

// Kling 2.6 Pro (최신)
"fal-ai/kling-video/v2.6/pro/image-to-video"

// Kling V3 Pro
"fal-ai/kling-video/v3/pro/image-to-video"
```

---

## 비용 참고

| 모델 | 5초 영상 | 10초 영상 |
|------|---------|---------|
| Kling 2.1 Standard | $0.28 | $0.56 |
| Kling 2.1 Pro | $0.35 | $0.70 |
| Kling 2.6 Pro | ~$0.50 | ~$1.00 |
