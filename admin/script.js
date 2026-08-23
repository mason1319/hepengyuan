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
const deleteDialog = document.querySelector("[data-delete-dialog]");
const deleteDialogTitle = document.querySelector("[data-delete-dialog-title]");
const deleteDialogCopy = document.querySelector("[data-delete-dialog-copy]");
const deleteDialogBusy = document.querySelector("[data-delete-dialog-busy]");
const deleteDialogError = document.querySelector("[data-delete-dialog-error]");
const deleteCancelButton = document.querySelector("[data-delete-cancel]");
const deleteConfirmButton = document.querySelector("[data-delete-confirm]");

let uploadInProgress = false;
let deletionInProgress = false;
let pendingDeletion = null;
let libraryRequestGeneration = 0;
let libraryRequestController = null;
const DELETE_TIMEOUT_MS = 20_000;
const LIBRARY_TIMEOUT_MS = 15_000;

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
    const error = new Error(payload?.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
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

function appendEmptyLibrary() {
  if (mediaList.querySelector(".empty-library")) return;
  const empty = document.createElement("p");
  empty.className = "empty-library";
  empty.textContent = "还没有媒体记录。选择一个本地文件，先保存第一条草稿。";
  mediaList.append(empty);
}

function populateDeleteDialog(item) {
  const typeLabel = item.mediaType === "video" ? "视频" : "图片";
  deleteDialogTitle.textContent = item.deletionPending ? `重试永久删除这条${typeLabel}？` : `永久删除这条${typeLabel}？`;
  if (item.deletionPending) {
    deleteDialogCopy.textContent = `“${item.title}”上次未清理完成，已从公开页面撤回。再次确认会继续删除剩余文件和记录。`;
  } else if (item.status === "published") {
    deleteDialogCopy.textContent = `“${item.title}”目前正在公开。确认后会先立即下线，再永久清理文件和记录。`;
  } else {
    deleteDialogCopy.textContent = `“${item.title}”目前是草稿。确认后会永久清理文件和记录。`;
  }
  deleteConfirmButton.textContent = item.deletionPending ? "重试永久删除" : "永久删除";
}

function openDeleteDialog(item, article, trigger) {
  pendingDeletion = { item, article, trigger };
  populateDeleteDialog(item);
  deleteDialog.returnValue = "";
  deleteDialogBusy.hidden = true;
  deleteDialogBusy.textContent = "";
  deleteDialogError.hidden = true;
  deleteDialogError.textContent = "";
  deleteCancelButton.disabled = false;
  deleteConfirmButton.disabled = false;
  deleteDialog.showModal();
  window.requestAnimationFrame(() => {
    deleteDialog.scrollTop = 0;
    deleteDialogTitle.focus({ preventScroll: true });
  });
}

function setDeleteDialogBusy(busy) {
  deletionInProgress = busy;
  if (busy) {
    deleteDialog.setAttribute("aria-busy", "true");
  } else {
    deleteDialog.removeAttribute("aria-busy");
  }
  deleteCancelButton.disabled = busy;
  deleteConfirmButton.disabled = busy;
  deleteConfirmButton.textContent = busy ? "正在永久删除…" : pendingDeletion?.item.deletionPending ? "重试永久删除" : "永久删除";
  deleteDialogBusy.hidden = !busy;
  deleteDialogBusy.tabIndex = busy ? 0 : -1;
  deleteDialogBusy.textContent = busy ? "正在永久删除并核对存储状态，请保持此窗口打开。最长等待约 35 秒。" : "";
  if (busy) window.requestAnimationFrame(() => deleteDialogBusy.focus());
}

function invalidateLibraryRequests() {
  libraryRequestGeneration += 1;
  libraryRequestController?.abort();
  libraryRequestController = null;
  refreshButton.disabled = false;
}

function finishDeletion(context) {
  invalidateLibraryRequests();
  const rows = [...mediaList.querySelectorAll(".media-row")];
  const current = rows.find((row) => row.dataset.mediaId === context.item.id);
  const currentIndex = current ? rows.indexOf(current) : -1;
  const focusTarget = current
    ? rows[currentIndex + 1]?.querySelector("[data-delete]") || rows[currentIndex - 1]?.querySelector("[data-delete]")
    : rows[0]?.querySelector("[data-delete]");

  setDeleteDialogBusy(false);
  deleteDialog.close("deleted");
  current?.remove();

  const remaining = mediaList.querySelectorAll(".media-row").length;
  if (remaining === 0) appendEmptyLibrary();
  libraryStatus.textContent = `已永久删除“${context.item.title}” · 剩余 ${remaining} 条记录`;
  window.requestAnimationFrame(() => (focusTarget || refreshButton).focus());
}

async function requestPermanentDeletion(mediaId) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS);
  try {
    return await apiRequest(`/api/admin/media/${encodeURIComponent(mediaId)}`, {
      method: "DELETE",
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("删除请求超时，正在核对服务器状态。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function confirmPendingDeletion() {
  if (!pendingDeletion || deletionInProgress) return;
  const context = pendingDeletion;
  setDeleteDialogBusy(true);
  deleteDialogError.hidden = true;
  context.article?.setAttribute("aria-busy", "true");
  libraryStatus.textContent = `正在永久删除“${context.item.title}”…`;

  try {
    await requestPermanentDeletion(context.item.id);
    finishDeletion(context);
  } catch (error) {
    const refreshed = await loadLibrary();
    if (refreshed && !refreshed.items.some((item) => item.id === context.item.id)) {
      finishDeletion(context);
      return;
    }

    const refreshedItem = refreshed?.items.find((item) => item.id === context.item.id);
    const refreshedArticle = [...mediaList.querySelectorAll(".media-row")].find(
      (row) => row.dataset.mediaId === context.item.id,
    );
    if (refreshedItem) context.item = refreshedItem;
    if (refreshedArticle) {
      context.article = refreshedArticle;
      context.trigger = refreshedArticle.querySelector("[data-delete]");
    }
    pendingDeletion = context;
    populateDeleteDialog(context.item);
    setDeleteDialogBusy(false);
    context.article?.removeAttribute("aria-busy");

    const retryHint = refreshedItem?.deletionPending
      ? "内容已经撤回，不会继续公开；可以再次点击“重试永久删除”。"
      : "未能确认删除状态，请检查网络后重试。";
    deleteDialogError.textContent = `${error.message} ${retryHint}`;
    deleteDialogError.hidden = false;
    libraryStatus.textContent = `“${context.item.title}”删除未完成`;
    deleteConfirmButton.focus();
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
  const deleteButton = fragment.querySelector("[data-delete]");
  const isDeletionPending = Boolean(item.deletionPending);
  const isPublic = !isDeletionPending && item.status === "published" && item.uploadState === "complete";
  let rowMutationInProgress = false;
  let rowButtonState = [];

  function setRowMutationBusy(busy) {
    rowMutationInProgress = busy;
    article.toggleAttribute("aria-busy", busy);
    if (busy) {
      rowButtonState = [...article.querySelectorAll("button")].map((button) => [button, button.disabled]);
      rowButtonState.forEach(([button]) => {
        button.disabled = true;
      });
      return;
    }
    rowButtonState.forEach(([button, wasDisabled]) => {
      if (button.isConnected) button.disabled = wasDisabled;
    });
    rowButtonState = [];
  }

  kind.textContent = item.mediaType === "image" ? "IMG" : "VID";
  title.textContent = item.title;
  state.textContent = isDeletionPending ? "删除待重试" : item.uploadState === "uploading" ? "上传未完成" : isPublic ? "已公开" : "草稿";
  state.dataset.public = isPublic ? "true" : "false";
  state.dataset.deleting = isDeletionPending ? "true" : "false";
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
  toggle.disabled = isDeletionPending || item.uploadState !== "complete";
  toggle.addEventListener("click", async () => {
    if (rowMutationInProgress) return;
    const nextStatus = isPublic ? "draft" : "published";
    setRowMutationBusy(true);
    libraryStatus.textContent = nextStatus === "published" ? `正在公开“${item.title}”…` : `正在把“${item.title}”转为草稿…`;
    try {
      await apiRequest(`/api/admin/media/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadLibrary();
    } catch (error) {
      if (article.isConnected) {
        libraryStatus.textContent = error.message;
        setRowMutationBusy(false);
      }
    }
  });

  deleteButton.textContent = isDeletionPending ? "重试删除" : "删除";
  deleteButton.setAttribute("aria-label", `${isDeletionPending ? "重试永久删除" : "永久删除"}“${item.title}”`);
  deleteButton.addEventListener("click", () => {
    if (!rowMutationInProgress) openDeleteDialog(item, article, deleteButton);
  });

  if (!isDeletionPending && item.mediaType === "video" && item.uploadState === "complete" && !item.thumbnailReady) {
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
        if (!localVideo || !localVideo.type.startsWith("video/") || rowMutationInProgress || !article.isConnected) return;
        setRowMutationBusy(true);
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
          if (article.isConnected) {
            libraryStatus.textContent = error.message;
            setRowMutationBusy(false);
          }
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
  const generation = libraryRequestGeneration + 1;
  libraryRequestGeneration = generation;
  libraryRequestController?.abort();
  const controller = new AbortController();
  libraryRequestController = controller;
  const timeout = window.setTimeout(() => controller.abort(), LIBRARY_TIMEOUT_MS);
  refreshButton.disabled = true;
  libraryStatus.textContent = "正在读取媒体库…";

  try {
    const payload = await apiRequest("/api/admin/media", { signal: controller.signal });
    if (generation !== libraryRequestGeneration) return null;
    identityLabel.textContent = payload.identity.email;
    mediaList.replaceChildren();

    if (payload.items.length === 0) {
      appendEmptyLibrary();
      libraryStatus.textContent = "媒体库为空";
    } else {
      const fragment = document.createDocumentFragment();
      payload.items.forEach((item) => fragment.append(renderMediaItem(item)));
      mediaList.append(fragment);
      libraryStatus.textContent = `共 ${payload.items.length} 条记录`;
    }
    return payload;
  } catch (error) {
    if (generation !== libraryRequestGeneration) return null;
    libraryStatus.textContent = error.name === "AbortError" ? "读取媒体库超时，请点击“刷新列表”重试。" : error.message;
    if (error.status === 401 || error.status === 403) identityLabel.textContent = "身份验证失败";
    return null;
  } finally {
    window.clearTimeout(timeout);
    if (generation === libraryRequestGeneration) {
      libraryRequestController = null;
      refreshButton.disabled = false;
    }
  }
}

fileInput.addEventListener("change", updateFileState);
fileInput.addEventListener("dragenter", () => {
  fileDrop.dataset.active = "true";
});
fileInput.addEventListener("dragleave", updateFileState);
refreshButton.addEventListener("click", loadLibrary);
deleteConfirmButton.addEventListener("click", confirmPendingDeletion);
deleteDialog.addEventListener("cancel", (event) => {
  if (deletionInProgress) event.preventDefault();
});
deleteDialog.addEventListener("close", () => {
  if (deletionInProgress) return;
  const context = pendingDeletion;
  const deleted = deleteDialog.returnValue === "deleted";
  pendingDeletion = null;
  deleteDialogBusy.hidden = true;
  deleteDialogBusy.textContent = "";
  deleteDialogError.hidden = true;
  deleteDialogError.textContent = "";
  if (!deleted) {
    const fallback = context?.trigger?.isConnected
      ? context.trigger
      : [...mediaList.querySelectorAll(".media-row")]
          .find((row) => row.dataset.mediaId === context?.item.id)
          ?.querySelector("[data-delete]");
    window.requestAnimationFrame(() => (fallback || refreshButton).focus());
  }
});

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
  if (!uploadInProgress && !deletionInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});

loadLibrary();
