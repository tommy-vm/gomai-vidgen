# GOM AI - 로컬 테스트 가이드

## 사전 준비

- **Node.js** 18 이상 설치 필요 (https://nodejs.org)
- **OpenAI API Key** 필요 (이미지 편집 기능용)
  - 발급: https://platform.openai.com/api-keys

---

## 1. 프로젝트 클론

```bash
git clone git@github.com:tommy-vm/gomai-vidgen.git
cd gomai-vidgen
```

---

## 2. 의존성 설치

```bash
npm install
```

---

## 3. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다.

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 API 키를 입력합니다:

```
# AI Image 편집용 (필수)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx

# AI Video 생성용 (선택)
FAL_KEY=your_fal_api_key_here
```

> **이미지 편집 기능만 테스트할 경우 `OPENAI_API_KEY`만 있으면 됩니다.**

---

## 4. 서버 실행

```bash
npm run dev
```

기본 포트는 3000입니다. 포트 충돌 시:

```bash
npx next dev -p 3300
```

---

## 5. 테스트

브라우저에서 접속:

```
http://localhost:3000
```

### 이미지 편집 테스트 순서

1. 화면 좌측 영역 클릭하여 이미지 업로드 (JPG, PNG, WebP)
2. 프롬프트 입력 (영문 권장)
   - 예: `Change the background to a beach scene`
   - 예: `Make the person wear a red jacket`
3. 모델/품질/원본유지 옵션 선택 (기본값 권장)
4. **이미지 편집하기** 버튼 클릭
5. 우측 영역에 결과 이미지 표시 (5~15초 소요)
6. **다운로드** / **추가 편집** 가능

### 옵션 설명

| 옵션 | 값 | 설명 |
|---|---|---|
| 모델 | GPT Image 1.5 (기본) / GPT Image 1 | 1.5가 더 정확한 편집 |
| 품질 | high (기본) / medium / low | 출력 이미지 품질 |
| 원본 유지 | high (기본) / low | high=원본 최대 보존, low=자유도 높은 편집 |

---

## 참고사항

- 출력 이미지는 입력 이미지의 비율(aspect ratio)을 그대로 유지합니다
- 워터마크 없음, 상업적 이용 가능
- OpenAI API 호출당 비용이 발생합니다 (품질/모델에 따라 상이)
- 인물 사진의 경우 안전 필터에 의해 일부 편집이 거부될 수 있습니다
