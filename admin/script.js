const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
]);

const form = document.querySelector("#upload-form");
const fileInput = document.querySelector("#media-file");
const fileDrop = document.querySelector("[data-file-drop]");
const fileName = document.querySelector("[data-file-name]");
const altInput = form.elements.alt;
const submitButton = document.querySelector("[data-submit]");
const formStatus = document.querySelector("[data-form-status]");
const progressPanel = document.querySelector("[data-progress-panel]");
const progressBar = document.querySelector("[data-progress]");
const progressLabel = document.querySelector("[data-progress-label]");
const progressPercent = document.querySelector("[data-progress-percent]");
const identityLabel = document.querySelector("[data-identity]");
const mediaList = document.querySelector("[data-media-list]");
const libraryStatus = document.querySelector("[data-library-status]");
const refreshButton = document.querySelector("[data-refresh]");
const itemTemplate = document.querySelector("#media-item-template");

let uploadInProgress = false;

function setStatus(element, message, { error = false } = {}) {
  element.textContent = message;
  if (element === formStatus) element.dataset.error = error ? "true" : "false";
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === "string") headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || `请求失败（${response.status}）`);
  }

  return payload;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatDuration(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function makeSlug(filename) {
  const normalized = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  if (normalized) return normalized;
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = [...crypto.getRandomValues(new Uint8Array(3))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `media-${timestamp}-${random}`;
}

function canvasToWebp(canvas, quality = 0.86) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("浏览器无法生成 WebP 公开版。"))),
      "image/webp",
      quality,
    );
  });
}

async function sanitizeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maximumEdge = 2560;
    const scale = Math.min(1, maximumEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToWebp(canvas, 0.88);
    const publicName = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.public.webp`;
    return new File([blob], publicName, { type: "image/webp", lastModified: Date.now() });
  } catch {
    throw new Error("无法生成去除 EXIF/GPS 的图片公开版。请先在本地导出无定位信息的 JPEG、PNG 或 WebP 后重试。");
  } finally {
    bitmap?.close();
  }
}

function waitForMediaEvent(element, successEvent, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("读取视频首帧超时。"));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener(successEvent, onSuccess);
      element.removeEventListener("error", onError);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("浏览器无法读取这个视频。"));
    };
    element.addEventListener(successEvent, onSuccess, { once: true });
    element.addEventListener("error", onError, { once: true });
  });
}

async function createVideoPoster(file) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;

  try {
    video.src = objectUrl;
    await waitForMediaEvent(video, "loadeddata");
    if (Number.isFinite(video.duration) && video.duration > 0.25) {
      video.currentTime = Math.min(1, video.duration / 3);
      await waitForMediaEvent(video, "seeked");
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("视频没有可读取的画面。");

    const maximumEdge = 1280;
    const scale = Math.min(1, maximumEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      blob: await canvasToWebp(canvas, 0.84),
      durationSeconds: Math.round(video.duration * 1000) / 1000,
    };
  } catch (error) {
    throw new Error(`无法为视频生成公开封面：${error.message}`);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function updateFileState() {
  const file = fileInput.files?.[0];
  fileDrop.dataset.active = file ? "true" : "false";
  fileName.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "选择本地照片或视频";
  altInput.required = Boolean(file?.type.startsWith("image/"));

  if (file && !form.elements.slug.value) {
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    form.elements.slug.value = makeSlug(file.name) || `media-${timestamp}`;
  }
}

function setProgress(completedBytes, totalBytes, label) {
  const percent = totalBytes > 0 ? Math.min(100, Math.round((completedBytes / totalBytes) * 100)) : 0;
  progressPanel.hidden = false;
  progressBar.value = percent;
  progressBar.textContent = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressLabel.textContent = label;
}

function uploadPayload(file, durationSeconds = null) {
  const values = new FormData(form);
  return {
    category: values.get("category"),
    slug: values.get("slug"),
    title: values.get("title"),
    description: values.get("description"),
    alt: values.get("alt"),
    country: values.get("country"),
    city: values.get("city"),
    capturedOn: values.get("capturedOn"),
    mimeType: file.type,
    fileSize: file.size,
    durationSeconds,
  };
}

async function abortQuietly(sessionId) {
  if (!sessionId) return;
  try {
    await apiRequest(`/api/admin/uploads/${encodeURIComponent(sessionId)}/abort`, {
      method: "POST",
      body: "{}",
    });
  } catch {
    // R2 lifecycle cleanup remains the fallback for abandoned multipart sessions.
  }
}

async function uploadFile(file, metadata, posterBlob = null) {
  const created = await apiRequest("/api/admin/uploads", {
    method: "POST",
    body: JSON.stringify(metadata),
  });
  const uploadedParts = [];

  let completed = null;
  try {
    for (let partNumber = 1; partNumber <= created.totalParts; partNumber += 1) {
      const start = (partNumber - 1) * created.partSize;
      const end = Math.min(start + created.partSize, file.size);
      const chunk = file.slice(start, end, file.type);
      setProgress(start, file.size, `上传分片 ${partNumber} / ${created.totalParts}`);

      const part = await apiRequest(
        `/api/admin/uploads/${encodeURIComponent(created.sessionId)}/parts/${partNumber}`,
        { method: "PUT", body: chunk, headers: { "Content-Type": file.type } },
      );
      uploadedParts.push(part);
      setProgress(end, file.size, `已完成分片 ${partNumber} / ${created.totalParts}`);
    }

    setProgress(file.size, file.size, "正在确认文件并保存草稿");
    completed = await apiRequest(`/api/admin/uploads/${encodeURIComponent(created.sessionId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: uploadedParts }),
    });
    if (posterBlob) {
      setProgress(file.size, file.size, "正在保存视频封面");
      await apiRequest(`/api/admin/media/${encodeURIComponent(completed.mediaId)}/poster`, {
        method: "PUT",
        body: posterBlob,
        headers: { "Content-Type": "image/webp" },
      });
    }
    return completed;
  } catch (error) {
    if (completed) {
      error.mediaSavedWithoutPoster = Boolean(posterBlob);
    } else {
      await abortQuietly(created.sessionId);
    }
    throw error;
  }
}

function renderMediaItem(item) {
  const fragment = itemTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".media-row");
  const kind = fragment.querySelector("[data-kind]");
  const title = fragment.querySelector("[data-title]");
  const state = fragment.querySelector("[data-state]");
  const path = fragment.querySelector("[data-path]");
  const meta = fragment.querySelector("[data-meta]");
  const view = fragment.querySelector("[data-view]");
  const toggle = fragment.querySelector("[data-toggle]");
  const isPublic = item.status === "published" && item.uploadState === "complete";

  kind.textContent = item.mediaType === "image" ? "IMG" : "VID";
  title.textContent = item.title;
  state.textContent = item.uploadState === "uploading" ? "上传未完成" : isPublic ? "已公开" : "草稿";
  state.dataset.public = isPublic ? "true" : "false";
  path.textContent = `/stories/${item.slug}`;

  const details = [
    item.category === "travel" ? "旅行影像" : "学习视频",
    formatBytes(item.fileSize),
    formatDuration(item.durationSeconds),
    item.city,
    item.country,
    item.capturedOn,
  ].filter(Boolean);
  meta.textContent = details.join(" · ");

  if (item.storyUrl) {
    view.hidden = false;
    view.href = item.storyUrl;
    view.target = "_blank";
    view.rel = "noopener";
  }

  toggle.textContent = isPublic ? "转为草稿" : "公开";
  toggle.dataset.draftAction = isPublic ? "true" : "false";
  toggle.disabled = item.uploadState !== "complete";
  toggle.addEventListener("click", async () => {
    const nextStatus = isPublic ? "draft" : "published";
    toggle.disabled = true;
    libraryStatus.textContent = nextStatus === "published" ? `正在公开“${item.title}”…` : `正在把“${item.title}”转为草稿…`;
    try {
      await apiRequest(`/api/admin/media/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadLibrary();
    } catch (error) {
      libraryStatus.textContent = error.message;
      toggle.disabled = false;
    }
  });

  if (item.mediaType === "video" && item.uploadState === "complete" && !item.thumbnailReady) {
    const posterButton = document.createElement("button");
    posterButton.type = "button";
    posterButton.className = "quiet-action";
    posterButton.textContent = "补封面";
    posterButton.addEventListener("click", () => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "video/mp4,video/webm";
      picker.addEventListener("change", async () => {
        const localVideo = picker.files?.[0];
        if (!localVideo || !localVideo.type.startsWith("video/")) return;
        posterButton.disabled = true;
        libraryStatus.textContent = `正在为“${item.title}”重新生成封面…`;
        try {
          const poster = await createVideoPoster(localVideo);
          await apiRequest(`/api/admin/media/${encodeURIComponent(item.id)}/poster`, {
            method: "PUT",
            body: poster.blob,
            headers: { "Content-Type": "image/webp" },
          });
          await loadLibrary();
        } catch (error) {
          libraryStatus.textContent = error.message;
          posterButton.disabled = false;
        }
      }, { once: true });
      picker.click();
    });
    fragment.querySelector(".media-actions").prepend(posterButton);
  }

  article.dataset.mediaId = item.id;
  return fragment;
}

async function loadLibrary() {
  refreshButton.disabled = true;
  libraryStatus.textContent = "正在读取媒体库…";

  try {
    const payload = await apiRequest("/api/admin/media");
    identityLabel.textContent = payload.identity.email;
    mediaList.replaceChildren();

    if (payload.items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-library";
      empty.textContent = "还没有媒体记录。选择一个本地文件，先保存第一条草稿。";
      mediaList.append(empty);
      libraryStatus.textContent = "媒体库为空";
    } else {
      const fragment = document.createDocumentFragment();
      payload.items.forEach((item) => fragment.append(renderMediaItem(item)));
      mediaList.append(fragment);
      libraryStatus.textContent = `共 ${payload.items.length} 条记录`;
    }
  } catch (error) {
    libraryStatus.textContent = error.message;
    identityLabel.textContent = "身份验证失败";
  } finally {
    refreshButton.disabled = false;
  }
}

fileInput.addEventListener("change", updateFileState);
fileInput.addEventListener("dragenter", () => {
  fileDrop.dataset.active = "true";
});
fileInput.addEventListener("dragleave", updateFileState);
refreshButton.addEventListener("click", loadLibrary);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];

  if (!file) {
    fileInput.setCustomValidity("请选择一个本地照片或视频文件。");
  } else if (!allowedTypes.has(file.type)) {
    fileInput.setCustomValidity("只支持 JPEG、PNG、WebP、AVIF、MP4 和 WebM 文件。");
  } else {
    fileInput.setCustomValidity("");
  }

  if (file && form.elements.category.value === "learning" && !file.type.startsWith("video/")) {
    fileInput.setCustomValidity("学习视频分类只接受 MP4 或 WebM 视频。");
  }

  altInput.required = Boolean(file?.type.startsWith("image/"));
  if (!form.reportValidity() || !file) return;

  uploadInProgress = true;
  submitButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  setStatus(formStatus, "正在创建草稿上传任务…");
  setProgress(0, file.size, "正在创建上传任务");

  try {
    let publicFile = file;
    let posterBlob = null;
    let durationSeconds = null;
    if (file.type.startsWith("image/")) {
      setStatus(formStatus, "正在生成去除 EXIF/GPS 的 WebP 公开版…");
      publicFile = await sanitizeImage(file);
    } else {
      setStatus(formStatus, "正在从本地视频生成 WebP 封面…");
      const poster = await createVideoPoster(file);
      posterBlob = poster.blob;
      durationSeconds = poster.durationSeconds;
    }
    setStatus(formStatus, "正在创建草稿上传任务…");
    setProgress(0, publicFile.size, "正在创建上传任务");
    await uploadFile(publicFile, uploadPayload(publicFile, durationSeconds), posterBlob);
    setProgress(publicFile.size, publicFile.size, "草稿保存完成");
    setStatus(formStatus, "上传完成。内容仍是草稿，可在下方确认后公开。");
    form.reset();
    updateFileState();
    await loadLibrary();
  } catch (error) {
    setStatus(
      formStatus,
      error.mediaSavedWithoutPoster
        ? `视频已保存为不可公开的草稿，但封面上传失败：${error.message}。请在下方点击“补封面”。`
        : error.message,
      { error: true },
    );
    progressLabel.textContent = "上传未完成";
    if (error.mediaSavedWithoutPoster) await loadLibrary();
  } finally {
    uploadInProgress = false;
    submitButton.disabled = false;
    form.removeAttribute("aria-busy");
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!uploadInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});

loadLibrary();
