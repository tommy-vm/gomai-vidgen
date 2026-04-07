// app/api/image/route.js
// Step 1: 파일 업로드 → uid 반환
import { randomUUID } from "crypto";

// 인메모리 이미지 저장소 (공유)
if (!globalThis.__imageStore) globalThis.__imageStore = new Map();

export async function POST(request) {
  try {
    // 토큰 검증
    const auth = request.headers.get("authorization");
    const validToken = process.env.API_TOKEN;
    if (validToken && auth !== validToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uid = randomUUID();

    globalThis.__imageStore.set(uid, {
      buffer,
      filename: file.name,
      size: buffer.length,
      mime: file.type,
      createdAt: Date.now(),
    });

    // 1시간 후 자동 삭제
    setTimeout(() => globalThis.__imageStore.delete(uid), 3600000);

    return Response.json({
      uid,
      filename: file.name,
      size: buffer.length,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return Response.json({ error: error.message || "업로드 실패" }, { status: 500 });
  }
}
