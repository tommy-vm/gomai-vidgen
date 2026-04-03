"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const MODE_OPTIONS = [
  { value: "video", label: "AI Video" },
  { value: "edit", label: "AI Image" },
];

const DURATION_OPTIONS = [
  { value: "5", label: "5초" },
  { value: "10", label: "10초" },
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

const EDIT_MODEL_OPTIONS = [
  {
    value: "gpt-image-1.5",
    label: "GPT Image 1.5",
    desc: "고품질 편집",
  },
  {
    value: "gpt-image-1",
    label: "GPT Image 1",
    desc: "기본 편집",
  },
];

const EDIT_QUALITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const EDIT_FIDELITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

const EDIT_PROMPT_PRESETS = [];

const PROMPT_PRESETS = [];

const HISTORY_KEY = "gom_ai_generation_history";
const EDIT_HISTORY_KEY = "gom_ai_edit_history";

export default function Home() {
  const [mode, setMode] = useState("video"); // video | edit
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("5");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [editModel, setEditModel] = useState(EDIT_MODEL_OPTIONS[0].value);
  const [editQuality, setEditQuality] = useState("high");
  const [editFidelity, setEditFidelity] = useState("high");
  const [status, setStatus] = useState("idle"); // idle | uploading | generating | polling | completed | error
  const [videoUrl, setVideoUrl] = useState(null);
  const [editedImageUrl, setEditedImageUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  // 이력 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
      const editSaved = localStorage.getItem(EDIT_HISTORY_KEY);
      if (editSaved) setEditHistory(JSON.parse(editSaved));
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
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("이미지 크기는 10MB 이하여야 합니다.");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setVideoUrl(null);
    setEditedImageUrl(null);
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
      setEditedImageUrl(null);
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

  const saveToEditHistory = useCallback((entry) => {
    setEditHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem(EDIT_HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleEditImage = async () => {
    if (!image || !prompt.trim()) {
      setErrorMsg("이미지와 프롬프트를 모두 입력해주세요.");
      return;
    }

    setErrorMsg("");
    setEditedImageUrl(null);
    setProgress(0);

    try {
      // 1. 이미지 base64 변환
      setStatus("uploading");
      const base64 = await fileToBase64(image);

      // 2. 이미지 편집 요청 (Google Gemini)
      setStatus("generating");
      const editRes = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: base64,
          image_mime: image.type,
          prompt,
          model: editModel,
          quality: editQuality,
          input_fidelity: editFidelity,
        }),
      });
      const editData = await editRes.json();
      if (!editRes.ok) throw new Error(editData.error);

      const dataUrl = `data:${editData.mime_type};base64,${editData.image_base64}`;
      setEditedImageUrl(dataUrl);
      setStatus("completed");
      setProgress(100);

      const modelLabel =
        EDIT_MODEL_OPTIONS.find((m) => m.value === editModel)?.label || editModel;
      saveToEditHistory({
        id: Date.now(),
        prompt,
        model: modelLabel,
        image_url: dataUrl,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMsg(err.message || "오류가 발생했습니다.");
      setStatus("error");
    }
  };

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
    setEditedImageUrl(null);
    setStatus("idle");
    setProgress(0);
    setErrorMsg("");
  };

  const handleUseAsInput = () => {
    if (!editedImageUrl) return;
    // data URL → File 변환
    const [header, base64] = editedImageUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const file = new File([arr], "edited.png", { type: mime });

    setImage(file);
    setImagePreview(editedImageUrl);
    setEditedImageUrl(null);
    setPrompt("");
    setStatus("idle");
    setProgress(0);
    setErrorMsg("");
  };

  const handleModeSwitch = (newMode) => {
    if (isProcessing) return;
    handleReset();
    setMode(newMode);
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
          <div className="flex ml-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleModeSwitch(opt.value)}
                className="px-3 py-1 text-xs font-medium transition-all"
                style={{
                  background: mode === opt.value ? "var(--accent)" : "transparent",
                  color: mode === opt.value ? "#fff" : "var(--text-secondary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            이력 {mode === "video"
              ? history.length > 0 && `(${history.length})`
              : editHistory.length > 0 && `(${editHistory.length})`}
          </button>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {mode === "video"
              ? MODEL_OPTIONS.find((m) => m.value === model)?.label || "Kling"
              : EDIT_MODEL_OPTIONS.find((m) => m.value === editModel)?.label || "Kontext"}
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-4" style={{ height: "calc(100vh - 57px)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            {mode === "video" ? "Image → Video" : "Image → Edit"}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {mode === "video"
              ? "이미지를 업로드하고 프롬프트를 입력하면 AI가 영상을 생성합니다"
              : "이미지를 업로드하고 편집 지시를 입력하면 AI가 이미지를 편집합니다"}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Left: Input */}
          <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{ paddingRight: 4 }}>
            {/* Image Upload */}
            <div
              className="rounded-xl border-2 border-dashed p-1 transition-all cursor-pointer flex-1 min-h-0 flex items-center justify-center"
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
                  className="w-full h-full rounded-lg"
                  style={{ objectFit: "contain" }}
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
                {mode === "video" ? "모션 프롬프트" : "편집 프롬프트"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
                placeholder={mode === "video"
                  ? "예: The person slowly turns their head and smiles warmly at the camera, soft natural lighting"
                  : "예: Change the outfit to a red dress, keep everything else the same"}
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
                {(mode === "video" ? PROMPT_PRESETS : EDIT_PROMPT_PRESETS).map((preset) => (
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
                value={mode === "video" ? model : editModel}
                onChange={(e) => {
                  if (isProcessing) return;
                  mode === "video" ? setModel(e.target.value) : setEditModel(e.target.value);
                }}
                disabled={isProcessing}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all appearance-none cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {(mode === "video" ? MODEL_OPTIONS : EDIT_MODEL_OPTIONS).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Options Row — Edit mode */}
            {mode === "edit" && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  품질
                </label>
                <div className="flex gap-2">
                  {EDIT_QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isProcessing && setEditQuality(opt.value)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background:
                          editQuality === opt.value
                            ? "var(--accent)"
                            : "var(--bg-card)",
                        color:
                          editQuality === opt.value
                            ? "#fff"
                            : "var(--text-secondary)",
                        border: `1px solid ${
                          editQuality === opt.value
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
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  원본 유지
                </label>
                <div className="flex gap-2">
                  {EDIT_FIDELITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isProcessing && setEditFidelity(opt.value)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background:
                          editFidelity === opt.value
                            ? "var(--accent)"
                            : "var(--bg-card)",
                        color:
                          editFidelity === opt.value
                            ? "#fff"
                            : "var(--text-secondary)",
                        border: `1px solid ${
                          editFidelity === opt.value
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
            )}

            {/* Options Row — Video mode only */}
            {mode === "video" && (
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
                      {opt.label}
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
            )}

            {/* Generate Button */}
            <button
              onClick={mode === "video" ? handleGenerate : handleEditImage}
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
                    ? (mode === "video" ? "생성 요청 중..." : "이미지 편집 중...")
                    : mode === "video" ? `영상 생성 중... ${progress}%` : "이미지 편집 중..."}
                </span>
              ) : (
                mode === "video" ? "영상 생성하기" : "이미지 편집하기"
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
          <div className="flex flex-col gap-3 min-h-0">
            <div
              className="rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Video Output */}
              {mode === "video" && videoUrl ? (
                <div className="flex flex-col flex-1 min-h-0">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full flex-1 min-h-0"
                    style={{ objectFit: "contain" }}
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
              ) : mode === "edit" && editedImageUrl ? (
                <div className="flex flex-col flex-1 min-h-0">
                  <img
                    src={editedImageUrl}
                    alt="Edited"
                    className="w-full flex-1 min-h-0"
                    style={{ objectFit: "contain" }}
                  />
                  <div className="p-4 flex gap-2">
                    <a
                      href={editedImageUrl}
                      download="gom_ai_edited.png"
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
                      onClick={handleUseAsInput}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: "var(--accent-glow)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent)",
                      }}
                    >
                      추가 편집
                    </button>
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
                <div className="flex flex-col items-center justify-center flex-1">
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
                      {mode === "video" ? (
                        <polygon points="5 3 19 12 5 21 5 3" />
                      ) : (
                        <>
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M12 8v8M8 12h8" />
                        </>
                      )}
                    </svg>
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {mode === "video" ? "AI 영상 생성 중" : "AI 이미지 편집 중"}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {mode === "video" ? "보통 1~3분 소요됩니다" : "보통 5~15초 소요됩니다"}
                  </p>
                  {/* Progress Bar — Video mode only */}
                  {mode === "video" && (
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
                  )}
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center flex-1"
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
                    {mode === "video" ? (
                      <>
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <polygon points="10 8 16 12 10 16 10 8" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </>
                    )}
                  </svg>
                  <p className="text-sm opacity-50">
                    {mode === "video"
                      ? "생성된 영상이 여기에 표시됩니다"
                      : "편집된 이미지가 여기에 표시됩니다"}
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
              {mode === "video"
                ? "· Kling I2V · 워터마크 없음 · 상업적 이용 가능"
                : "· GPT Image · 워터마크 없음 · 상업적 이용 가능"}
            </div>
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {mode === "video" ? "생성 이력" : "편집 이력"}
              </h2>
              {(mode === "video" ? history : editHistory).length > 0 && (
                <button
                  onClick={() => {
                    if (mode === "video") {
                      setHistory([]);
                      try { localStorage.removeItem(HISTORY_KEY); } catch {}
                    } else {
                      setEditHistory([]);
                      try { localStorage.removeItem(EDIT_HISTORY_KEY); } catch {}
                    }
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
            {(mode === "video" ? history : editHistory).length === 0 ? (
              <p
                className="text-sm py-8 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                아직 {mode === "video" ? "생성" : "편집"} 이력이 없습니다
              </p>
            ) : mode === "video" ? (
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
                      style={{ maxHeight: 200 }}
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
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {editHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl overflow-hidden transition-all hover:scale-[1.02]"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <img
                      src={item.image_url}
                      alt="Edited"
                      className="w-full"
                      style={{ maxHeight: 180, objectFit: "cover" }}
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
                        <span>{item.model}</span>
                        <span>
                          {new Date(item.created_at).toLocaleDateString("ko")}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <a
                          href={item.image_url}
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
                            setEditedImageUrl(item.image_url);
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
