# 이미지 편집 (AI Image Edit) API 명세

서버 주소: `https://{서버주소}` (배포 후 확정)

인증: `Authorization` 헤더에 사전 공유된 API 토큰 사용

---

## 1. 파일 업로드

```
//=================================================================================//
POST https://{서버주소}/api/image
Authorization: {API_TOKEN}
Content-Type: multipart/form-data; boundary="cb82c5c2-9955-4ed2-85cd-402fa63669a6"

--cb82c5c2-9955-4ed2-85cd-402fa63669a6
Content-Type: application/octet-stream
Content-Disposition: form-data; name=file; filename=sample.png; filename*=utf-8''sample.png

sample.png 첨부
//=================================================================================//

=> Response (성공)
{"uid":"4ad13940-2f8b-11ef-a525-33a8a9e36d10","filename":"sample.png","size":2440902}

=> Response (실패)
{"error":"file 필드가 필요합니다."}
```

- 업로드된 이미지는 서버에서 1시간 보관 후 자동 삭제
- 지원 포맷: JPG, PNG, WebP
- form-data 필드명: `file`

---

## 2. 편집 요청

```
//=================================================================================//
POST https://{서버주소}/api/image/task
Authorization: {API_TOKEN}
Content-Type: application/json

{
  "uid": "4ad13940-2f8b-11ef-a525-33a8a9e36d10",
  "prompt": "Change the background to a beach scene",
  "model": "gpt-image-1.5",
  "quality": "high",
  "input_fidelity": "high"
}
//=================================================================================//

=> Response (성공)
{"tid":"2459dc00-318b-11f1-b099-f7f8d6aff3a6","uid":"4ad13940-2f8b-11ef-a525-33a8a9e36d10"}

=> Response (실패)
{"error":"uid에 해당하는 이미지가 없습니다."}
```

### 옵션값 정리

| 파라미터 | 필수 | 타입 | 값 | 설명 |
|---|---|---|---|---|
| `uid` | O | string | 업로드 응답의 uid | 원본 이미지 식별자 |
| `prompt` | O | string | 자유 텍스트 | 편집 지시 (영문 권장) |
| `model` | X | string | `gpt-image-1.5` (기본값), `gpt-image-1` | AI 모델 선택 |
| `quality` | X | string | `high` (기본값), `medium`, `low` | 출력 품질 |
| `input_fidelity` | X | string | `high` (기본값), `low` | 원본 유지 정도. high=원본 최대 보존, low=자유도 높은 편집 |

---

## 3. 진행 조회

```
//=================================================================================//
GET https://{서버주소}/api/image/task/{tid}
Authorization: {API_TOKEN}
//=================================================================================//

=> Response (대기중)
{"state":"queued","progress":0,"url":""}

=> Response (진행중)
{"state":"processing","progress":50,"url":""}

=> Response (완료)
{"state":"completed","progress":100,"url":"https://{서버주소}/api/image/task/{tid}/result"}

=> Response (실패)
{"state":"failed","progress":0,"url":"","error":"에러 메시지"}
```

### state 값

| state | 설명 |
|---|---|
| `queued` | 작업 대기중 |
| `processing` | AI 편집 처리중 |
| `completed` | 완료 — `url` 필드에서 결과 이미지 다운로드 |
| `failed` | 실패 — `error` 필드에 사유 |

---

## 4. 결과 이미지 다운로드

```
//=================================================================================//
GET https://{서버주소}/api/image/task/{tid}/result
Authorization: {API_TOKEN}
//=================================================================================//

=> Response
Content-Type: image/png
Content-Disposition: attachment; filename="edited_{tid}.png"

(PNG 바이너리 데이터)
```

- 결과 이미지는 1시간 보관 후 자동 삭제

---

## 참고사항

- 출력 이미지는 PNG 포맷
- 입력 이미지의 비율(aspect ratio)이 그대로 유지됨
- 워터마크 없음, 상업적 이용 가능
- 편집 소요시간: 보통 5~15초
- 인물 사진의 경우 OpenAI 안전 필터에 의해 일부 편집이 거부될 수 있음

---

## 인증 에러

모든 엔드포인트에서 토큰이 유효하지 않을 경우:

```
=> Response (401)
{"error":"Unauthorized"}
```
