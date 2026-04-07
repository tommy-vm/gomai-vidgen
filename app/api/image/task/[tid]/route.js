// app/api/image/task/[tid]/route.js
// Step 3: 작업 상태 조회 + 결과 다운로드

export async function GET(request, { params }) {
  const { tid } = await params;

  const auth = request.headers.get("authorization");
  const validToken = process.env.API_TOKEN;
  if (validToken && auth !== validToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = globalThis.__taskStore?.get(tid);
  if (!task) {
    return Response.json({ error: "tid에 해당하는 작업이 없습니다." }, { status: 404 });
  }

  // 결과 이미지 다운로드 요청
  const url = new URL(request.url);
  if (url.pathname.endsWith("/result")) {
    if (task.state !== "completed" || !task.resultBuffer) {
      return Response.json({ error: "아직 결과가 준비되지 않았습니다." }, { status: 400 });
    }
    return new Response(task.resultBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="edited_${tid}.png"`,
      },
    });
  }

  const baseUrl = `${url.protocol}//${url.host}`;

  return Response.json({
    state: task.state,
    progress: task.progress,
    url: task.state === "completed"
      ? `${baseUrl}/api/image/task/${tid}/result`
      : "",
    ...(task.error ? { error: task.error } : {}),
  });
}
