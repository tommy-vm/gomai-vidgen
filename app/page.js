"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const DURATION_OPTIONS = [
  { value: "5", label: "5초", cost: "~$0.35" },
  { value: "10", label: "10초", cost: "~$0.70" },
];

const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
];

const MODEL_OPTIONS = [
  {
    value: "fal-ai/kling-video/v2.1/pro/image-to-video",
    label: "Kling 2.1 Pro",
    desc: "안정적 · 5초 $0.35",
  },
  {
    value: "fal-ai/kling-video/v2.6/pro/image-to-video",
    label: "Kling 2.6 Pro",
    desc: "최신 · 향상된 퀄리티",
  },
  {
    value: "fal-ai/kling-video/v3/pro/image-to-video",
    label: "Kling V3 Pro",
    desc: "최상위 퀄리티",
  },
];

const PROMPT_PRESETS = [
  {
    label: "아바타 움직임",
    icon: "🙂",
    prompt:
      "The person slowly turns their head, smiles warmly at the camera, and blinks naturally. Soft studio lighting, smooth motion.",
  },
  {
    label: "제품 360° 회전",
    icon: "📦",
    prompt:
      "The product slowly rotates 360 degrees on a clean white turntable. Smooth continuous rotation, studio lighting, no background distractions.",
  },
  {
    label: "제품 줌인",
    icon: "🔍",
    prompt:
      "Camera smoothly zooms into the product, revealing fine details and textures. Cinematic shallow depth of field, soft lighting.",
  },
  {
    label: "배경 애니메이션",
    icon: "🌊",
    prompt:
      "The background gently animates with subtle motion — leaves swaying, light shifting, or clouds drifting — while the subject remains still.",
  },
  {
    label: "립싱크 준비",
    icon: "🎤",
    prompt:
      "The person opens their mouth slightly and begins speaking naturally, with subtle head movements and natural facial expressions. Front-facing, well-lit.",
  },
  {
    label: "패션 포즈",
    icon: "👗",
    prompt:
      "The model strikes a confident pose, fabric flows naturally with gentle movement. Fashion editorial lighting, cinematic slow motion feel.",
  },
];

const HISTORY_KEY = "gom_ai_generation_history";

export default function Home() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("5");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [status, setStatus] = useState("idle"); // idle | uploading | generating | polling | completed | error
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  // 이력 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  // 클린업
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("이미지 크기는 10MB 이하여야 합니다.");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setVideoUrl(null);
    setErrorMsg("");
    setStatus("idle");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg("이미지 크기는 10MB 이하여야 합니다.");
        return;
      }
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setVideoUrl(null);
      setErrorMsg("");
      setStatus("idle");
    }
  };

  const saveToHistory = useCallback((entry) => {
    setHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const pollStatus = useCallback((requestId, modelId, meta) => {
    let elapsed = 0;
    pollingRef.current = setInterval(async () => {
      elapsed += 3;
      setProgress(Math.min(95, Math.floor((elapsed / 180) * 100)));

      try {
        const res = await fetch(
          `/api/status?request_id=${requestId}&model=${encodeURIComponent(modelId)}`
        );
        const data = await res.json();

        if (data.status === "completed" && data.video_url) {
          clearInterval(pollingRef.current);
          setVideoUrl(data.video_url);
          setStatus("completed");
          setProgress(100);
          saveToHistory({
            id: Date.now(),
            prompt: meta.prompt,
            model: meta.modelLabel,
            duration: meta.duration,
            video_url: data.video_url,
            created_at: new Date().toISOString(),
          });
        } else if (data.error) {
          clearInterval(pollingRef.current);
          setErrorMsg(data.error);
          setStatus("error");
        }
      } catch (err) {
        // 네트워크 에러 시 폴링 계속
      }

      // 5분 초과 시 타임아웃
      if (elapsed > 300) {
        clearInterval(pollingRef.current);
        setErrorMsg("생성 시간이 초과되었습니다. 다시 시도해주세요.");
        setStatus("error");
      }
    }, 3000);
  }, [saveToHistory]);

  const handleGenerate = async () => {
    if (!image || !prompt.trim()) {
      setErrorMsg("이미지와 프롬프트를 모두 입력해주세요.");
      return;
    }

    setErrorMsg("");
    setVideoUrl(null);
    setProgress(0);

    try {
      // 1. 이미지 업로드
      setStatus("uploading");
      const formData = new FormData();
      formData.append("file", image);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error);

      // 2. 영상 생성 요청
      setStatus("generating");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: uploadData.url,
          prompt,
          duration,
          aspect_ratio: aspectRatio,
          model,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);

      // 3. 폴링 시작
      setStatus("polling");
      const modelLabel = MODEL_OPTIONS.find((m) => m.value === model)?.label || model;
      pollStatus(genData.request_id, model, { prompt, modelLabel, duration });
    } catch (err) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setImage(null);
    setImagePreview(null);
    setPrompt("");
    setVideoUrl(null);
    setStatus("idle");
    setProgress(0);
    setErrorMsg("");
  };

  const isProcessing = ["uploading", "generating", "polling"].includes(status);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "var(--accent)" }}
          >
            G
          </div>
          <span className="text-lg font-semibold tracking-tight">
            GOM AI
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "var(--accent-glow)",
              color: "var(--accent)",
            }}
          >
            AI Video
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: showHistory ? "var(--accent)" : "var(--bg-hover)",
              color: showHistory ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            이력 {history.length > 0 && `(${history.length})`}
          </button>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {MODEL_OPTIONS.find((m) => m.value === model)?.label || "Kling"}
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Image → Video
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            이미지를 업로드하고 프롬프트를 입력하면 AI가 영상을 생성합니다
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Input */}
          <div className="space-y-5">
            {/* Image Upload */}
            <div
              className="rounded-xl border-2 border-dashed p-1 transition-all cursor-pointer"
              style={{
                borderColor: imagePreview ? "var(--accent)" : "var(--border)",
                background: imagePreview ? "transparent" : "var(--bg-card)",
              }}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full rounded-lg object-cover"
                  style={{ maxHeight: 320 }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <p
                    className="mt-4 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    클릭 또는 드래그하여 이미지 업로드
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-secondary)", opacity: 0.6 }}
                  >
                    JPG, PNG, WebP · 최대 10MB
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>

            {/* Prompt */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                모션 프롬프트
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
                placeholder="예: The person slowly turns their head and smiles warmly at the camera, soft natural lighting"
                rows={3}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none transition-all focus:ring-2"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--accent)",
                }}
              />
              {/* Prompt Presets */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => !isProcessing && setPrompt(preset.prompt)}
                    className="px-2.5 py-1 rounded-md text-xs transition-all hover:scale-105"
                    style={{
                      background: "var(--bg-hover)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                    }}
                    title={preset.prompt}
                  >
                    {preset.icon} {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Select */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                모델
              </label>
              <select
                value={model}
                onChange={(e) => !isProcessing && setModel(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all appearance-none cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Options Row */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  길이
                </label>
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isProcessing && setDuration(opt.value)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background:
                          duration === opt.value
                            ? "var(--accent)"
                            : "var(--bg-card)",
                        color:
                          duration === opt.value
                            ? "#fff"
                            : "var(--text-secondary)",
                        border: `1px solid ${
                          duration === opt.value
                            ? "var(--accent)"
                            : "var(--border)"
                        }`,
                      }}
                    >
                      {opt.label}{" "}
                      <span className="opacity-60 text-xs">{opt.cost}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  비율
                </label>
                <div className="flex gap-2">
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        !isProcessing && setAspectRatio(opt.value)
                      }
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background:
                          aspectRatio === opt.value
                            ? "var(--accent)"
                            : "var(--bg-card)",
                        color:
                          aspectRatio === opt.value
                            ? "#fff"
                            : "var(--text-secondary)",
                        border: `1px solid ${
                          aspectRatio === opt.value
                            ? "var(--accent)"
                            : "var(--border)"
                        }`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!image || !prompt.trim() || isProcessing}
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background:
                  !image || !prompt.trim() || isProcessing
                    ? "var(--bg-hover)"
                    : "var(--accent)",
                color: "#fff",
              }}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray="60"
                      strokeLinecap="round"
                    />
                  </svg>
                  {status === "uploading"
                    ? "이미지 업로드 중..."
                    : status === "generating"
                    ? "생성 요청 중..."
                    : `영상 생성 중... ${progress}%`}
                </span>
              ) : (
                "영상 생성하기"
              )}
            </button>

            {/* Error */}
            {errorMsg && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* Right: Output */}
          <div>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                minHeight: 400,
              }}
            >
              {videoUrl ? (
                <div className="relative">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full"
                    style={{ maxHeight: 480 }}
                  />
                  <div className="p-4 flex gap-2">
                    <a
                      href={videoUrl}
                      download="gom_ai_output.mp4"
                      target="_blank"
                      rel="noopener"
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-center transition-all"
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                      }}
                    >
                      다운로드
                    </a>
                    <button
                      onClick={handleReset}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: "var(--bg-hover)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      새로 만들기
                    </button>
                  </div>
                </div>
              ) : isProcessing ? (
                <div className="flex flex-col items-center justify-center h-full py-20">
                  <div
                    className="w-20 h-20 rounded-2xl animate-pulse-glow shimmer-loading flex items-center justify-center mb-6"
                    style={{ background: "var(--bg-hover)" }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      style={{ color: "var(--accent)" }}
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium mb-1">AI 영상 생성 중</p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    보통 1~3분 소요됩니다
                  </p>
                  {/* Progress Bar */}
                  <div
                    className="w-48 h-1 rounded-full mt-4 overflow-hidden"
                    style={{ background: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${progress}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full py-20"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="mb-4 opacity-30"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                  <p className="text-sm opacity-50">
                    생성된 영상이 여기에 표시됩니다
                  </p>
                </div>
              )}
            </div>

            {/* Cost Info */}
            <div
              className="mt-4 rounded-lg px-4 py-3 text-xs"
              style={{
                background: "var(--bg-card)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="font-medium" style={{ color: "var(--accent)" }}>
                비용 안내
              </span>{" "}
              · Kling 2.1 Pro I2V 기준 5초 ~$0.35 / 10초 ~$0.70 · 워터마크 없음
              · 상업적 이용 가능
            </div>
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">생성 이력</h2>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    setHistory([]);
                    try {
                      localStorage.removeItem(HISTORY_KEY);
                    } catch {}
                  }}
                  className="text-xs px-3 py-1 rounded-lg transition-all"
                  style={{
                    color: "#f87171",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                >
                  전체 삭제
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p
                className="text-sm py-8 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                아직 생성 이력이 없습니다
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <video
                      src={item.video_url}
                      className="w-full"
                      style={{ maxHeight: 180 }}
                      muted
                      loop
                      onMouseEnter={(e) => e.target.play()}
                      onMouseLeave={(e) => {
                        e.target.pause();
                        e.target.currentTime = 0;
                      }}
                    />
                    <div className="p-3">
                      <p
                        className="text-xs truncate mb-1"
                        title={item.prompt}
                      >
                        {item.prompt}
                      </p>
                      <div
                        className="flex items-center justify-between text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span>
                          {item.model} · {item.duration}초
                        </span>
                        <span>
                          {new Date(item.created_at).toLocaleDateString("ko")}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <a
                          href={item.video_url}
                          download
                          target="_blank"
                          rel="noopener"
                          className="flex-1 py-1 rounded text-xs text-center"
                          style={{
                            background: "var(--accent)",
                            color: "#fff",
                          }}
                        >
                          다운로드
                        </a>
                        <button
                          onClick={() => {
                            setVideoUrl(item.video_url);
                            setPrompt(item.prompt);
                            setShowHistory(false);
                          }}
                          className="flex-1 py-1 rounded text-xs"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          재사용
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
