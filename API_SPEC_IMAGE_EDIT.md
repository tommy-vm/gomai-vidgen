# 이미지 편집 (AI Image Edit) API 명세

---

## 1. 파일 업로드

```
//=================================================================================//
POST https://xxx.xxx.xxx/api/image
User-Agent: NEW_GOMPIC
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9(TokenKey)
Content-Type: multipart/form-data; boundary="cb82c5c2-9955-4ed2-85cd-402fa63669a6"
Content-Length: 2441125

--cb82c5c2-9955-4ed2-85cd-402fa63669a6
Content-Type: application/octet-stream
Content-Disposition: form-data; name=file; filename=sample.png; filename*=utf-8''sample.png

sample.png 첨부
//=================================================================================//

=> Response
{"uid":"4ad13940-2f8b-11ef-a525-33a8a9e36d10","filename":"sample.png","size":2440902}
```

---

## 2. 편집 요청

```
//=================================================================================//
POST https://xxx.xxx.xxx/api/image/task
User-Agent: NEW_GOMPIC
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9(TokenKey)
Content-Type: application/json
Content-Length: 325

{
  "uid": "4ad13940-2f8b-11ef-a525-33a8a9e36d10",
  "prompt": "Change the background to a beach scene",
  "model": "gpt-image-1.5",
  "quality": "high",
  "input_fidelity": "high"
}
//=================================================================================//

=> Response
{"tid":"2459dc00-318b-11f1-b099-f7f8d6aff3a6","uid":"4ad13940-2f8b-11ef-a525-33a8a9e36d10"}
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

## 3. 진행 및 다운로드

```
//=================================================================================//
GET https://xxx.xxx.xxx/api/image/task/2459dc00-318b-11f1-b099-f7f8d6aff3a6
User-Agent: NEW_GOMPIC
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9(TokenKey)
Content-Type: application/x-www-form-urlencoded
Content-Length: 0
//=================================================================================//

=> Response (진행중)
{"state":"processing","progress":50,"url":""}

=> Response (완료)
{"state":"completed","progress":100,"url":"https://xxx.xxx.xxx/api/image/task/result/2459dc00-318b-11f1-b099-f7f8d6aff3a6/"}
```

---

## 참고사항

- 출력 이미지는 PNG 포맷
- 입력 이미지의 비율(aspect ratio)이 그대로 유지됨
- 워터마크 없음, 상업적 이용 가능
- 편집 소요시간: 보통 5~15초
- 지원 입력 포맷: JPG, PNG, WebP
