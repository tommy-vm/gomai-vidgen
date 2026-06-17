"use client";

import { useState, useRef, useEffect, useMemo } from "react";

// 사용자 기능 목록. 항상 노출, 파일 타입(kind)이 accepts 에 없으면 비활성화.
const FEATURES = [
  {
    id: "bg-remove",
    label: "배경 제거 / 컷아웃",
    desc: "자동 전체 제거, 또는 대상을 지정해 컷아웃",
    accepts: ["image", "video"],
  },
  {
    id: "bg-replace",
    label: "배경 생성",
    desc: "프롬프트로 새 배경을 합성",
    accepts: ["image"],
  },
  {
    id: "denoise",
    label: "오디오 Denoise",
    desc: "배경 소음을 제거하고 음성만 추출",
    accepts: ["audio", "video"],
  },
  {
    id: "smart-cut",
    label: "스마트 컷",
    desc: "무음 기반 또는 내용(대사) 기반으로 컷",
    accepts: ["audio", "video"],
  },
];

const KIND_LABEL = { image: "이미지", video: "영상", audio: "오디오" };
const MAX_SIZE = 100 * 1024 * 1024;
const CHECKER =
  "repeating-conic-gradient(#2a2a3a 0% 25%, #1a1a28 0% 50%) 50% / 20px 20px";

// 곰 개발자 연동 가이드 — 기능별 FAL 모델 / 입력 / 출력 / 비고
const GUIDE = [
  {
    title: "배경 제거 / 컷아웃",
    items: [
      {
        mode: "자동 · 이미지",
        model: "fal-ai/birefnet/v2",
        input: "image_url",
        output: "image.url — PNG(투명)",
      },
      {
        mode: "자동 · 영상",
        model: "veed/video-background-removal",
        input: "video_url, output_codec:'vp9', refine_foreground_edges:true, subject_is_person:true",
        output: "video[0].url — webm(알파)",
      },
      {
        mode: "대상 지정 · 이미지",
        model: "fal-ai/sam-3/image",
        input:
          "image_url, apply_mask:true, detection_threshold:0.3, + prompt(영문 개념어) 또는 point_prompts:[{x,y,label}] / box_prompts:[{x_min,y_min,x_max,y_max}]",
        output: "image.url — PNG(투명)",
      },
    ],
    note: "영상 대상 지정은 SAM3 video가 mp4(검정 배경)·검출 불안정으로 미채택. 영상은 자동(veed)만 사용.",
  },
  {
    title: "배경 생성",
    items: [
      {
        mode: "이미지",
        model: "fal-ai/bria/background/replace",
        input: "image_url, prompt(새 배경 설명, 영문 권장)",
        output: "images[0].url",
      },
    ],
  },
  {
    title: "오디오 Denoise",
    items: [
      {
        mode: "영상 / 오디오",
        model: "fal-ai/elevenlabs/audio-isolation",
        input: "audio_url 또는 video_url",
        output: "audio.url — 음성만 분리",
      },
    ],
  },
  {
    title: "스마트 컷",
    items: [
      {
        mode: "무음 기반",
        model: "fal-ai/whisper (chunk_level:'word')",
        input: "audio_url",
        output:
          "chunks[].timestamp → 단어 간격 ≥ 임계값(기본 0.6s, padding 0.1s)을 무음으로 컷",
      },
      {
        mode: "내용 기반",
        model: "fal-ai/whisper (chunk_level:'segment') + LLM",
        input: "자막 세그먼트 + 자연어 지시문 → LLM이 지울 세그먼트 인덱스 반환",
        output: "선택 구간 → 컷 리스트",
      },
    ],
    note:
      "최종 출력은 컷 리스트 JSON: { unit:'seconds', keep:[[s,e],...], remove:[[s,e],...] }. 곰믹스가 이 좌표를 타임라인에 적용(영상 렌더링은 곰 측).",
  },
];

function detectKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function fmtTime(s) {
  if (!isFinite(s)) return "0:00.0";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].filter(Boolean).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    if (out.length && a <= out[out.length - 1][1]) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

// remove 구간 → {total, remove, keep, removed, final}
function cutsFromRemove(removeRanges, total) {
  const remove = mergeRanges(removeRanges).map(([a, b]) => [
    Math.max(0, a),
    Math.min(total, b),
  ]);
  const keep = [];
  let cursor = 0;
  for (const [a, b] of remove) {
    if (a > cursor) keep.push([cursor, a]);
    cursor = b;
  }
  if (cursor < total) keep.push([cursor, total]);
  const removed = remove.reduce((s, [a, b]) => s + (b - a), 0);
  return { total, remove, keep, removed, final: total - removed };
}

// 무음 기반: 단어 청크 사이 간격으로 무음 구간 계산
function silenceCuts(chunks, minSilence, padding) {
  if (!chunks?.length) return null;
  const total = chunks[chunks.length - 1].timestamp[1];
  const remove = [];
  if (chunks[0].timestamp[0] > minSilence) {
    remove.push([0, Math.max(0, chunks[0].timestamp[0] - padding)]);
  }
  for (let i = 0; i < chunks.length - 1; i++) {
    const end = chunks[i].timestamp[1];
    const next = chunks[i + 1].timestamp[0];
    if (next - end >= minSilence) {
      const a = end + padding;
      const b = next - padding;
      if (b > a) remove.push([a, b]);
    }
  }
  return cutsFromRemove(remove, total);
}

export default function AiEditPanel() {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [kind, setKind] = useState(null);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|uploading|processing|polling|completed|error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // 가이드 상태
  const [cutoutMode, setCutoutMode] = useState("auto"); // auto | target
  const [cutoutText, setCutoutText] = useState("");
  const [points, setPoints] = useState([]); // {x,y,label} 자연좌표
  const [pointLabel, setPointLabel] = useState(1); // 1=남길곳, 0=뺄곳
  const [imgDims, setImgDims] = useState(null);
  const [bgPrompt, setBgPrompt] = useState("");
  const [cutMode, setCutMode] = useState("silence"); // silence | content
  const [cutInstruction, setCutInstruction] = useState("");

  // 결과 보조 상태
  const [minSilence, setMinSilence] = useState(0.6);
  const [padding, setPadding] = useState(0.1);
  const [runMode, setRunMode] = useState("silence"); // 완료된 smart-cut 의 모드
  const [aiRemove, setAiRemove] = useState(null); // 내용컷: 지울 세그먼트 인덱스
  const [aiLoading, setAiLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const inputRef = useRef(null);
  const pollingRef = useRef(null);
  const runCfgRef = useRef({});

  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const isBusy = ["uploading", "processing", "polling"].includes(status);
  const feature = FEATURES.find((f) => f.id === selected) || null;

  const resetResult = () => {
    setResult(null);
    setStatus("idle");
    setErrorMsg("");
    setAiRemove(null);
  };

  const resetGuidance = () => {
    setCutoutMode("auto");
    setCutoutText("");
    setPoints([]);
    setBgPrompt("");
    setCutMode("silence");
    setCutInstruction("");
  };

  const acceptFile = (f) => {
    if (!f) return;
    const k = detectKind(f);
    if (!k) return setErrorMsg("이미지 / 영상 / 오디오 파일만 업로드할 수 있습니다.");
    if (f.size > MAX_SIZE) return setErrorMsg("파일 크기는 100MB 이하여야 합니다.");
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setKind(k);
    setImgDims(null);
    setSelected((prev) => {
      const feat = FEATURES.find((x) => x.id === prev);
      return feat && feat.accepts.includes(k) ? prev : null;
    });
    resetGuidance();
    resetResult();
  };

  const handleSelect = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    acceptFile(f);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const onImgClick = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * el.naturalWidth);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * el.naturalHeight);
    setPoints((p) => [...p, { x, y, label: pointLabel }]);
  };

  const selectCutsAI = async (chunks, instruction) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/tools/select-cuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: chunks.map((c) => ({ text: c.text })),
          instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiRemove(data.remove || []);
    } catch (err) {
      setErrorMsg(err.message || "AI 구간 선택 실패");
      setAiRemove([]);
    } finally {
      setAiLoading(false);
    }
  };

  const poll = (request_id, model, toolKey) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/tools/result?request_id=${request_id}&model=${encodeURIComponent(
            model
          )}&tool=${toolKey}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.status === "completed") {
          clearInterval(pollingRef.current);
          setResult(data.result);
          setStatus("completed");
          const cfg = runCfgRef.current;
          if (data.result?.kind === "transcript" && cfg.cutMode === "content") {
            selectCutsAI(data.result.chunks, cfg.instruction);
          }
        }
      } catch (err) {
        clearInterval(pollingRef.current);
        setErrorMsg(err.message || "처리 중 오류가 발생했습니다.");
        setStatus("error");
      }
    }, 2000);
  };

  const handleRun = async () => {
    if (!file || !feature) return;
    let toolKey;
    let prompt = "";
    let options;

    if (feature.id === "bg-remove") {
      // 영상은 자동(전체) 전용, 타깃 컷아웃은 이미지에서만
      if (kind === "video" || cutoutMode === "auto") {
        toolKey = kind === "video" ? "remove-bg-video" : "remove-bg-image";
      } else {
        toolKey = "cutout-image";
        prompt = cutoutText.trim();
        if (points.length) options = { points };
        if (!prompt && !options?.points?.length) {
          return setErrorMsg("남길 대상을 텍스트로 입력하거나 이미지를 클릭해 지정하세요.");
        }
      }
    } else if (feature.id === "bg-replace") {
      toolKey = "replace-bg";
      prompt = bgPrompt.trim();
      if (!prompt) return setErrorMsg("배경 생성에는 프롬프트가 필요합니다.");
    } else if (feature.id === "denoise") {
      toolKey = "denoise";
    } else if (feature.id === "smart-cut") {
      toolKey = "smart-cut";
      options = { chunkLevel: cutMode === "content" ? "segment" : "word" };
      if (cutMode === "content" && !cutInstruction.trim()) {
        return setErrorMsg("내용 기반 컷은 지시문이 필요합니다 (예: 인사말 부분 빼줘).");
      }
    }

    runCfgRef.current = { cutMode, instruction: cutInstruction.trim() };
    setRunMode(cutMode);
    setErrorMsg("");
    setResult(null);
    setAiRemove(null);

    try {
      setStatus("uploading");
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error);

      setStatus("processing");
      const procRes = await fetch("/api/tools/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: toolKey,
          file_url: upData.url,
          file_kind: kind,
          prompt,
          options,
        }),
      });
      const procData = await procRes.json();
      if (!procRes.ok) throw new Error(procData.error);

      setStatus("polling");
      poll(procData.request_id, procData.model, toolKey);
    } catch (err) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setStatus("error");
    }
  };

  // 결과 컷 계산 (smart-cut)
  const cuts = useMemo(() => {
    if (result?.kind !== "transcript") return null;
    if (runMode === "content") {
      if (!aiRemove) return null;
      const total = result.chunks[result.chunks.length - 1].timestamp[1];
      const ranges = aiRemove
        .map((i) => result.chunks[i]?.timestamp)
        .filter(Boolean);
      return cutsFromRemove(ranges, total);
    }
    return silenceCuts(result.chunks, minSilence, padding);
  }, [result, runMode, aiRemove, minSilence, padding]);

  const downloadEDL = () => {
    if (!cuts) return;
    const payload = {
      source: file?.name,
      unit: "seconds",
      mode: runMode,
      original_duration: cuts.total,
      final_duration: cuts.final,
      keep: cuts.keep,
      remove: cuts.remove,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name || "smart-cut"}.cuts.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statusLabel = {
    uploading: "업로드 중…",
    processing: "요청 제출 중…",
    polling: "처리 중…",
  }[status];

  const showCutoutCanvas =
    feature?.id === "bg-remove" && cutoutMode === "target" && kind === "image";

  return (
    <main className="px-6 py-6" style={{ height: "calc(100vh - 57px)", overflowY: "auto" }}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-1">AI Edit</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            파일을 올리면 포맷에 맞는 기능이 활성화됩니다
          </p>
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: showGuide ? "var(--accent)" : "var(--bg-hover)",
              color: showGuide ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            📖 곰 연동 개발 가이드 {showGuide ? "닫기" : "열기"}
          </button>
        </div>

        {/* 개발자 연동 가이드 */}
        {showGuide && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-1">곰 연동 개발 가이드</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              모든 호출은 FAL Queue 비동기 패턴 권장: <code>submit → status(polling) → result</code>. 입력 파일은 먼저 FAL 스토리지(또는 공개 URL)로 올린 뒤 URL을 전달합니다.
            </p>
            <div className="space-y-4">
              {GUIDE.map((g) => (
                <div key={g.title} className="rounded-xl p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                  <div className="text-sm font-medium mb-2">{g.title}</div>
                  <div className="space-y-3">
                    {g.items.map((it, i) => (
                      <div key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        <div className="mb-1">
                          <span className="px-1.5 py-0.5 rounded mr-2" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                            {it.mode}
                          </span>
                          <code style={{ color: "var(--accent)" }}>{it.model}</code>
                        </div>
                        <div><span style={{ color: "var(--text-primary)" }}>입력</span> · {it.input}</div>
                        <div><span style={{ color: "var(--text-primary)" }}>출력</span> · {it.output}</div>
                      </div>
                    ))}
                  </div>
                  {g.note && (
                    <p className="text-[11px] mt-3 pt-3" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}>
                      ⚠ {g.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 1. 업로드 */}
        <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">1. 파일 업로드</h2>
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center text-center p-8"
            style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}
          >
            {!file ? (
              <>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  이미지 · 영상 · 오디오 파일을 드래그하거나 클릭
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>최대 100MB</p>
              </>
            ) : (
              <div className="w-full">
                <p className="text-sm mb-3" style={{ color: "var(--text-primary)" }}>
                  {file.name}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    ({KIND_LABEL[kind]} · {(file.size / 1024 / 1024).toFixed(1)}MB)
                  </span>
                </p>
                {kind === "image" && <img src={fileUrl} alt="" className="max-h-56 mx-auto rounded-lg" />}
                {kind === "video" && <video src={fileUrl} controls className="max-h-56 mx-auto rounded-lg" />}
                {kind === "audio" && <audio src={fileUrl} controls className="w-full mt-2" />}
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*,video/*,audio/*" onChange={handleSelect} className="hidden" />
          </div>
        </section>

        {/* 2. 기능 선택 */}
        <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">2. 기능 선택</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map((feat) => {
              const enabled = !!file && feat.accepts.includes(kind);
              const active = selected === feat.id;
              return (
                <button
                  key={feat.id}
                  disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    setSelected(feat.id);
                    resetResult();
                  }}
                  className="text-left rounded-xl p-4 transition-all"
                  style={{
                    background: active ? "var(--accent-glow)" : "var(--bg-hover)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    opacity: enabled ? 1 : 0.4,
                    cursor: enabled ? "pointer" : "not-allowed",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{feat.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                      {feat.accepts.map((k) => KIND_LABEL[k]).join("·")}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{feat.desc}</div>
                </button>
              );
            })}
          </div>
          {!file && (
            <p className="text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
              먼저 파일을 업로드하면 사용 가능한 기능이 활성화됩니다.
            </p>
          )}
        </section>

        {/* 3. 가이드 / 옵션 */}
        {feature && file && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3">3. 가이드</h2>

            {/* 배경 제거 / 컷아웃 */}
            {feature.id === "bg-remove" && (
              <div className="space-y-4">
                {kind === "video" ? (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    영상은 전체 배경 제거(투명 webm)만 지원합니다. 대상 지정 컷아웃은 이미지에서 사용하세요.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {[
                      ["auto", "자동 (전체 배경)"],
                      ["target", "대상 지정"],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setCutoutMode(v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: cutoutMode === v ? "var(--accent)" : "var(--bg-hover)",
                          color: cutoutMode === v ? "#fff" : "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {kind === "image" && cutoutMode === "target" && (
                  <>
                    <input
                      value={cutoutText}
                      onChange={(e) => setCutoutText(e.target.value)}
                      placeholder={
                        kind === "video"
                          ? "남길 대상 — 영문 개념어 필수 (예: person, dog, car)"
                          : "남길 대상 텍스트 (영문, 예: person) — 또는 아래 이미지 클릭"
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />

                    {showCutoutCanvas && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>클릭 지정:</span>
                          {[
                            [1, "남길 곳"],
                            [0, "뺄 곳"],
                          ].map(([v, label]) => (
                            <button
                              key={v}
                              onClick={() => setPointLabel(v)}
                              className="px-2 py-1 rounded text-[11px]"
                              style={{
                                background: pointLabel === v ? "var(--accent)" : "var(--bg-hover)",
                                color: pointLabel === v ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            onClick={() => setPoints([])}
                            className="px-2 py-1 rounded text-[11px] ml-auto"
                            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                          >
                            지우기 ({points.length})
                          </button>
                        </div>
                        <div className="relative inline-block w-full">
                          <img
                            src={fileUrl}
                            alt=""
                            onLoad={(e) => setImgDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                            onClick={onImgClick}
                            className="w-full rounded-lg cursor-crosshair select-none"
                            style={{ display: "block" }}
                          />
                          {imgDims &&
                            points.map((pt, i) => (
                              <span
                                key={i}
                                className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white"
                                style={{
                                  left: `${(pt.x / imgDims.w) * 100}%`,
                                  top: `${(pt.y / imgDims.h) * 100}%`,
                                  background: pt.label === 1 ? "#22c55e" : "#ef4444",
                                }}
                              />
                            ))}
                        </div>
                        <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                          녹색=남길 곳, 빨강=뺄 곳. 텍스트와 클릭은 함께 쓸 수 있습니다.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 배경 생성 */}
            {feature.id === "bg-replace" && (
              <input
                value={bgPrompt}
                onChange={(e) => setBgPrompt(e.target.value)}
                placeholder="새 배경 설명 (예: a sunny beach at golden hour)"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
            )}

            {/* Denoise */}
            {feature.id === "denoise" && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                추가 설정 없이 배경 소음을 제거하고 음성만 추출합니다.
              </p>
            )}

            {/* 스마트 컷 */}
            {feature.id === "smart-cut" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {[
                    ["silence", "무음 기반"],
                    ["content", "내용 기반"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setCutMode(v)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: cutMode === v ? "var(--accent)" : "var(--bg-hover)",
                        color: cutMode === v ? "#fff" : "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {cutMode === "content" ? (
                  <input
                    value={cutInstruction}
                    onChange={(e) => setCutInstruction(e.target.value)}
                    placeholder="지울 내용을 자연어로 (예: 인사말과 가격 얘기 부분 빼줘)"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    대사 사이 무음 구간을 자동 탐지합니다. 임계값은 결과에서 조절할 수 있습니다.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={isBusy}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              {isBusy ? statusLabel : "실행"}
            </button>
            {errorMsg && <p className="text-xs mt-3" style={{ color: "#f87171" }}>{errorMsg}</p>}
          </section>
        )}

        {/* 4. 결과 */}
        {result && (
          <section className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3">4. 결과</h2>

            {result.kind === "image" && (
              <div>
                <div className="rounded-lg overflow-hidden" style={{ background: result.transparent ? CHECKER : "var(--bg-primary)" }}>
                  <img src={result.url} alt="" className="max-h-96 mx-auto" />
                </div>
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>다운로드</a>
              </div>
            )}

            {result.kind === "video" && (
              <div>
                <div className="rounded-lg overflow-hidden" style={{ background: result.transparent ? CHECKER : "#000" }}>
                  <video src={result.url} controls className="max-h-96 mx-auto" />
                </div>
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                  다운로드 ({result.transparent ? "webm" : "mp4"})
                </a>
                {!result.transparent && (
                  <p className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
                    대상만 남기고 배경은 검정으로 채워집니다(mp4는 투명 미지원). 전체가 검정이면 대상이 검출되지 않은 것이니, 영문 개념어(person, dog, car…)로 다시 시도하세요. 투명 배경이 필요하면 “자동(전체 배경)”을 쓰세요.
                  </p>
                )}
              </div>
            )}

            {result.kind === "audio" && (
              <div>
                <audio src={result.url} controls className="w-full" />
                <a href={result.url} download className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>다운로드</a>
              </div>
            )}

            {result.kind === "transcript" && (
              <div className="space-y-4">
                {runMode === "silence" && cuts && (
                  <div className="grid grid-cols-2 gap-4">
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      최소 무음 길이: {minSilence.toFixed(1)}s
                      <input type="range" min="0.2" max="2" step="0.1" value={minSilence} onChange={(e) => setMinSilence(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      여유(padding): {padding.toFixed(2)}s
                      <input type="range" min="0" max="0.5" step="0.05" value={padding} onChange={(e) => setPadding(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                  </div>
                )}

                {runMode === "content" && (
                  <div className="flex gap-2 items-center">
                    <input
                      value={cutInstruction}
                      onChange={(e) => setCutInstruction(e.target.value)}
                      placeholder="지울 내용 (예: 가격 얘기 부분 빼줘)"
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={() => selectCutsAI(result.chunks, cutInstruction.trim())}
                      disabled={aiLoading || !cutInstruction.trim()}
                      className="text-xs px-3 py-2 rounded-lg text-white disabled:opacity-40 shrink-0"
                      style={{ background: "var(--accent)" }}
                    >
                      {aiLoading ? "분석 중…" : "다시 적용"}
                    </button>
                  </div>
                )}

                {runMode === "content" && aiRemove === null ? (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {aiLoading ? "AI가 지울 구간을 고르는 중…" : "지시문을 입력하고 적용하세요."}
                  </p>
                ) : (
                  cuts && (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          ["원본", fmtTime(cuts.total)],
                          ["제거", `−${fmtTime(cuts.removed)}`],
                          ["결과", fmtTime(cuts.final)],
                        ].map(([label, val]) => (
                          <div key={label} className="rounded-lg py-3" style={{ background: "var(--bg-hover)" }}>
                            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</div>
                            <div className="text-sm font-semibold mt-1">{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* 내용 기반: 자막 + 제거 표시 */}
                      {runMode === "content" && (
                        <div className="max-h-56 overflow-auto rounded-lg p-2 space-y-1" style={{ background: "var(--bg-primary)" }}>
                          {result.chunks.map((c, i) => {
                            const removed = aiRemove?.includes(i);
                            return (
                              <div
                                key={i}
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                  color: removed ? "#f87171" : "var(--text-primary)",
                                  textDecoration: removed ? "line-through" : "none",
                                  background: removed ? "rgba(248,113,113,0.08)" : "transparent",
                                }}
                              >
                                <span style={{ color: "var(--text-secondary)" }}>
                                  [{fmtTime(c.timestamp[0])}]{" "}
                                </span>
                                {c.text}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        잘라낼 구간 {cuts.remove.length}개
                      </div>
                      <div className="max-h-40 overflow-auto rounded-lg" style={{ background: "var(--bg-primary)" }}>
                        {cuts.remove.length === 0 ? (
                          <p className="text-xs p-3" style={{ color: "var(--text-secondary)" }}>잘라낼 구간이 없습니다.</p>
                        ) : (
                          cuts.remove.map(([a, b], i) => (
                            <div key={i} className="flex justify-between px-3 py-1.5 text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                              <span>{fmtTime(a)} → {fmtTime(b)}</span>
                              <span style={{ color: "var(--text-secondary)" }}>{(b - a).toFixed(1)}s</span>
                            </div>
                          ))
                        )}
                      </div>

                      <button onClick={downloadEDL} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                        컷 리스트 JSON 다운로드
                      </button>
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        곰믹스는 이 keep/remove 좌표(초)를 타임라인에 적용해 컷을 수행합니다.
                      </p>
                    </>
                  )
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
