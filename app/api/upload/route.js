// app/api/upload/route.js
// 이미지를 FAL.ai 스토리지에 업로드
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

    // File을 Buffer로 변환
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // FAL.ai 스토리지에 업로드
    const url = await fal.storage.upload(
      new Blob([buffer], { type: file.type }),
      file.name
    );

    return Response.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: error.message || "업로드 실패" },
      { status: 500 }
    );
  }
}
