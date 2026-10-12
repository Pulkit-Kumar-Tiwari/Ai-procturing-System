const user = JSON.parse(
  sessionStorage.getItem("candidate") ||
    '{"name":"Demo Candidate","exam":"EX-2026"}',
);
const examDetails = examCatalog.find(user.exam) || examCatalog.find("EX-2026");
user.sessionId =
  user.sessionId ||
  (crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
sessionStorage.setItem("candidate", JSON.stringify(user));
$("#who").textContent = user.name;
$("#examId").textContent = user.exam;
$("#examTitle").textContent = examDetails.name;
$("#secureHdr").className = window.isSecureContext ? "badge ok" : "badge bad";
$("#secureHdr").textContent = window.isSecureContext
  ? "🔒 Secure connection"
  : "Camera requires HTTPS or localhost";
/* ---------- On-device readiness and face detection ---------- */
const checks = [
  ["Device", "Camera"],
  ["Device", "Browser"],
  ["Device", "Internet connection"],
  ["AI checks", "Face detected"],
  ["AI checks", "Single person detected"],
  ["AI checks", "Lighting"],
];
const LABEL = {
  idle: ["off", "Not run"],
  checking: ["off", "Checking…"],
  passed: ["ok", "✓ Passed"],
  warning: ["warn", "▲ Warning"],
  failed: ["bad", "✕ Failed"],
};
const HINT = {
  Camera:
    "Allow camera access in your browser settings, then run the check again.",
  "Face detected": "Sit facing the camera so your face is fully visible.",
  "Single person detected": "Make sure only you are in the camera view.",
  Lighting: "Try facing a light source. Lighting checks are approximate.",
  "Internet connection": "Reconnect to the internet.",
};
let states = checks.map(() => "idle"),
  mediaOK = { cam: false, ai: false },
  cameraStream = null,
  faceDetector = null,
  scanTimer = null,
  faceCount = null,
  lightLevel = null,
  connectionState = "Checking",
  connectionProbe = null,
  sessionStatus = "Readiness",
  connectivityTimer,
  sessionHeartbeatTimer,
  readinessComplete = false,
  readinessRunning = false,
  shareVideoConsent = false,
  candidateWatchPeer = null,
  candidateWatchId = null;
let anomalySince = 0,
  lastAlertAt = 0;
function renderCameraRequest(session) {
  const request = session?.cameraRequest,
    panel = $("#cameraRequestPanel");
  if (!request || request.state !== "Pending" || sessionStatus !== "In exam") {
    panel.hidden = true;
    return;
  }
  $("#cameraRequestMessage").textContent =
    `Your examiner requested live camera access${request.requestedAt ? ` at ${request.requestedAt}` : ""}. Allowing is optional.`;
  panel.hidden = false;
}
function renderChecks() {
  let h = "",
    g = "";
  checks.forEach(([grp, n], i) => {
    if (grp !== g) {
      if (g) h += "</ul>";
      h += `<h2 class="font-bold mt-4 mb-1">${grp}</h2><ul>`;
      g = grp;
    }
    const s = states[i],
      l = LABEL[s];
    h += `<li class="py-2 border-b" style="border-color:var(--line)"><div class="flex justify-between items-center gap-3"><span>${n}</span>${s === "checking" ? '<span class="spin" aria-hidden="true"></span>' : ""}${badge(l[0], l[1])}</div>${s === "failed" || s === "warning" ? `<p class="text-sm mut mt-1">${HINT[n] || "Fix this and run the check again."}</p>` : ""}</li>`;
  });
  $("#checkList").innerHTML = h + "</ul>";
}
function setCheck(name, state) {
  const i = checks.findIndex(([, label]) => label === name);
  if (i === -1 || states[i] === state) return false;
  states[i] = state;
  return true;
}
function setScannerLabel(text) {
  if ($("#readyScanLabel").textContent !== text)
    $("#readyScanLabel").textContent = text;
  if ($("#examScanLabel").textContent !== text)
    $("#examScanLabel").textContent = text;
}
function waitForIceGatheringComplete(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = setTimeout(finish, 5000);
    peer.addEventListener("icegatheringstatechange", check);
  });
}
function closeCandidateWatch() {
  if (candidateWatchPeer) {
    candidateWatchPeer.close();
    candidateWatchPeer = null;
  }
  candidateWatchId = null;
}
function renderVideoShareStatus(message) {
  if (!$("#videoShareStatus")) return;
  $("#videoShareTitle").textContent = shareVideoConsent
    ? "Live video sharing is allowed"
    : "Live video sharing is off";
  $("#videoShareMessage").textContent = message;
  const button = $("#stopVideoShare");
  button.hidden = !shareVideoConsent;
}
async function handleCandidateVideoWatch(videoWatch) {
  if (!videoWatch?.id) return;
  if (videoWatch.state === "Stopped" || !shareVideoConsent) {
    if (candidateWatchId === videoWatch.id) closeCandidateWatch();
    if (sessionStatus === "In exam")
      renderVideoShareStatus(
        shareVideoConsent
          ? "The examiner is not watching now."
          : "The examiner can see your camera status, but not your video.",
      );
    return;
  }
  if (
    videoWatch.state !== "Requested" ||
    sessionStatus !== "In exam" ||
    !cameraStream ||
    candidateWatchId === videoWatch.id
  )
    return;
  candidateWatchId = videoWatch.id;
  try {
    const peer = new RTCPeerConnection({ iceServers: [] });
    candidateWatchPeer = peer;
    cameraStream
      .getVideoTracks()
      .forEach((track) => peer.addTrack(track, cameraStream));
    await peer.setRemoteDescription(videoWatch.offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGatheringComplete(peer);
    if (candidateWatchPeer !== peer || !shareVideoConsent) return;
    const result = liveSessions.update(user.sessionId, {
      videoWatch: {
        ...videoWatch,
        state: "Answer",
        answer: peer.localDescription.toJSON(),
      },
    });
    if (!result)
      throw new Error(
        "The video connection could not be shared in this browser.",
      );
    renderVideoShareStatus(
      "Your live video is available to the examiner tab in this browser. Select Stop sharing at any time.",
    );
    peer.addEventListener("connectionstatechange", () => {
      if (candidateWatchPeer !== peer) return;
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        closeCandidateWatch();
        renderVideoShareStatus(
          "The live video connection ended. Your camera check is still running.",
        );
      }
    });
  } catch (error) {
    closeCandidateWatch();
    renderVideoShareStatus(
      "The live video connection could not start. The examiner can still see your exam status.",
    );
    toast(`Live video could not be shared: ${error.message}`, "bad");
  }
}
function syncLiveSession() {
  return liveSessions.update(user.sessionId, {
    name: user.name,
    exam: user.exam,
    status: sessionStatus,
    camera: mediaOK.cam,
    ai: mediaOK.ai,
    connection: connectionState,
    faceCount,
    question: cur + 1,
    total: questions.length,
    answered: Object.keys(answers).length,
    videoShareConsent: shareVideoConsent,
    events: liveSessions.read()[user.sessionId]?.events || [],
  });
}
function addLiveEvent(label, severity) {
  const events = liveSessions.read()[user.sessionId]?.events || [];
  events.unshift({
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: now(),
    label,
    severity,
    reviewStatus: "Open",
    note: "",
  });
  liveSessions.update(user.sessionId, {
    name: user.name,
    exam: user.exam,
    status: sessionStatus,
    camera: mediaOK.cam,
    ai: mediaOK.ai,
    connection: connectionState,
    faceCount,
    question: cur + 1,
    total: questions.length,
    answered: Object.keys(answers).length,
    videoShareConsent: shareVideoConsent,
    events: events.slice(0, 50),
  });
}
function renderHelpState() {
  const help = liveSessions.read()[user.sessionId]?.helpRequest,
    button = $("#requestHelp"),
    status = $("#helpStatus");
  if (!button || !status) return;
  if (help?.status === "Open") {
    button.disabled = true;
    button.textContent = "Message sent";
    status.textContent = `Your message was sent${help.at ? ` at ${help.at}` : ""}.`;
  } else if (help?.status === "Answered") {
    button.disabled = false;
    button.textContent = "Send message";
    status.textContent = help.response || "The examiner has seen your message.";
  } else {
    button.disabled = false;
    button.textContent = "Send message";
    status.textContent = "";
  }
}
async function probeInternet() {
  if (connectionProbe) return connectionProbe;
  const previous = connectionState;
  connectionState = "Checking";
  setCheck("Internet connection", "checking");
  $("#checkSummary").textContent = $("#stageCheck").hidden
    ? $("#checkSummary").textContent
    : "Checking internet connection…";
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 5000);
  connectionProbe = fetch(
    `https://connectivitycheck.gstatic.com/generate_204?${Date.now()}`,
    { mode: "no-cors", cache: "no-store", signal: controller.signal },
  )
    .then(() => true)
    .catch(() => false)
    .then((connected) => {
      connectionProbe = null;
      connectionState = connected ? "Connected" : "No internet";
      setCheck("Internet connection", connected ? "passed" : "failed");
      $("#net").hidden = connected;
      if (!$("#stageExam").hidden)
        $("#stNet").innerHTML = connected
          ? badge("ok", "● Connected")
          : badge("bad", "✕ No internet");
      if (!$("#stageCheck").hidden) {
        renderChecks();
        if (!readinessRunning && readinessComplete) {
          $("#goExam").disabled = !connected;
          $("#checkSummary").textContent = connected
            ? "Readiness checks complete. You can continue to the exam."
            : "Internet unavailable. Reconnect before continuing.";
        } else if (!readinessRunning)
          $("#checkSummary").textContent = connected
            ? "Internet connection is available. Consent to camera analysis, then run the check."
            : "Internet unavailable. The check will retry automatically.";
      }
      if (previous !== "Checking" && previous !== connectionState) {
        const label = connected
          ? "Internet connection restored"
          : "Internet connection lost";
        if (!$("#stageExam").hidden)
          addEvent(label, connected ? "LOW" : "HIGH");
        else addLiveEvent(label, connected ? "LOW" : "HIGH");
        if (connected) toast("Internet connection restored.", "ok");
        else
          toast(
            "Internet connection unavailable. Your answers remain in this browser tab; online checks may be unavailable.",
            "bad",
          );
      }
      syncLiveSession();
      return connected;
    })
    .finally(() => clearTimeout(timeout));
  return connectionProbe;
}
probeInternet();
connectivityTimer = setInterval(() => {
  if (sessionStatus !== "Completed") void probeInternet();
}, 10000);
sessionHeartbeatTimer = setInterval(() => {
  if (sessionStatus !== "Completed") syncLiveSession();
}, 5000);
addEventListener("online", () => {
  void probeInternet();
});
addEventListener("offline", () => {
  void probeInternet();
});
async function openCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error(
      "Camera access requires HTTPS or localhost and a supported browser.",
    );
  if (cameraStream) {
    const video = $("#readyVideo");
    video.srcObject = cameraStream;
    video.hidden = false;
    $(".camfb", $("#readyCam")).hidden = true;
    await video.play();
    return;
  }
  cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user" },
  });
  cameraStream
    .getVideoTracks()[0]
    ?.addEventListener("ended", handleCameraEnded);
  const video = $("#readyVideo");
  video.srcObject = cameraStream;
  video.hidden = false;
  $(".camfb", $("#readyCam")).hidden = true;
  await video.play();
}
function handleCameraEnded() {
  if (
    ["Completed", "Disqualified", "Left", "Disconnected"].includes(
      sessionStatus,
    )
  )
    return;
  cameraStream = null;
  mediaOK.cam = false;
  $("#stCam").innerHTML = badge("bad", "✕ Off");
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = null;
  $("#stAI").className = "badge bad";
  $("#stAI").textContent = "Camera disconnected";
  setScannerLabel("CAMERA CONNECTION LOST");
  setCheck("Camera", "failed");
  if (!$("#stageCheck").hidden) {
    $("#goExam").disabled = true;
    renderChecks();
    addLiveEvent("Camera connection lost", "HIGH");
  } else addEvent("Camera connection lost", "HIGH");
  syncLiveSession();
  [$("#readyVideo"), $("#examVideo")].forEach((video) => {
    video.pause();
    video.srcObject = null;
  });
  $(".camfb", $("#readyCam")).hidden = false;
  $(".camfb", $("#cam")).hidden = false;
}
async function loadFaceDetector() {
  const vision = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs"
  );
  const files = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
  );
  faceDetector = await vision.FaceDetector.createFromOptions(files, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.6,
  });
}
function drawDetections(video, canvas, detections) {
  if (!video.videoWidth || !video.videoHeight) return;
  if (
    canvas.width !== video.videoWidth ||
    canvas.height !== video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = detections.length === 1 ? "#86efac" : "#fbbf24";
  ctx.lineWidth = Math.max(3, canvas.width / 240);
  detections.forEach(({ boundingBox }) => {
    if (!boundingBox) return;
    ctx.strokeRect(
      boundingBox.originX,
      boundingBox.originY,
      boundingBox.width,
      boundingBox.height,
    );
  });
}
function measureLighting(video) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = 32;
  canvas.height = 18;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4)
    total +=
      (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) /
      255;
  return total / (pixels.length / 4);
}
function updateDetection() {
  const video = $("#readyVideo");
  if (!faceDetector || video.readyState < 2) return;
  const detections = faceDetector.detectForVideo(
    video,
    performance.now(),
  ).detections;
  faceCount = detections.length;
  lightLevel = measureLighting(video);
  drawDetections(video, $("#readyOverlay"), detections);
  drawDetections(video, $("#examOverlay"), detections);
  $("#faceCount").textContent = String(faceCount);
  $("#stAI").className = "badge ok";
  $("#stAI").textContent = "● Scanning on device";
  const label =
    faceCount === 1
      ? "FACE IN VIEW · ON-DEVICE SCAN"
      : faceCount === 0
        ? "NO FACE IN VIEW · CHECK CAMERA"
        : "MULTIPLE FACES IN VIEW · CHECK CAMERA";
  setScannerLabel(label);
  const faceChanged = setCheck(
    "Face detected",
    faceCount > 0 ? "passed" : "warning",
  );
  const personChanged = setCheck(
    "Single person detected",
    faceCount === 1 ? "passed" : "warning",
  );
  const lightingChanged = setCheck(
    "Lighting",
    lightLevel >= 0.12 ? "passed" : "warning",
  );
  if (!$("#stageCheck").hidden) {
    if (faceChanged || personChanged || lightingChanged) renderChecks();
  } else {
    const issue =
      faceCount === 0
        ? "No face visible"
        : faceCount > 1
          ? "Multiple faces visible"
          : "";
    if (!issue) {
      anomalySince = 0;
    } else if (!anomalySince) {
      anomalySince = Date.now();
    } else if (
      Date.now() - anomalySince >= 4000 &&
      Date.now() - lastAlertAt >= 30000
    ) {
      lastAlertAt = Date.now();
      addEvent(issue, faceCount > 1 ? "MEDIUM" : "LOW");
    }
  }
}
function startScanning() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(() => {
    try {
      updateDetection();
    } catch (error) {
      clearInterval(scanTimer);
      scanTimer = null;
      mediaOK.ai = false;
      if (faceDetector) faceDetector.close();
      faceDetector = null;
      $("#stAI").className = "badge bad";
      $("#stAI").textContent = "Scanner error";
      setScannerLabel("AI SCAN ERROR");
      toast(`On-device scan stopped: ${error.message}`, "bad");
    }
  }, 500);
}
function stopMonitoring() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = null;
  if (faceDetector) {
    faceDetector.close();
    faceDetector = null;
  }
  const videoWatch = liveSessions.read()[user.sessionId]?.videoWatch;
  if (videoWatch?.id && videoWatch.state !== "Stopped")
    liveSessions.update(user.sessionId, {
      videoShareConsent: false,
      videoWatch: { ...videoWatch, state: "Stopped", answer: null },
    });
  closeCandidateWatch();
  shareVideoConsent = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  [$("#readyVideo"), $("#examVideo")].forEach((video) => {
    video.pause();
    video.srcObject = null;
  });
}
function updateReadinessButton() {
  $("#runCheck").disabled =
    !$("#monitorConsent").checked ||
    !$("#rulesAcknowledged").checked ||
    readinessRunning;
}
$("#monitorConsent").onchange = updateReadinessButton;
$("#rulesAcknowledged").onchange = updateReadinessButton;
$("#videoShareConsent").onchange = (e) => {
  shareVideoConsent = e.target.checked;
  syncLiveSession();
  renderVideoShareStatus(
    shareVideoConsent
      ? "The examiner may request to watch while you are in the exam. You can stop sharing at any time."
      : "The examiner can see your camera status, but not your video.",
  );
};
$("#stopVideoShare").onclick = () => {
  shareVideoConsent = false;
  const session = liveSessions.read()[user.sessionId],
    videoWatch = session?.videoWatch,
    cameraRequest = session?.cameraRequest,
    update = { videoShareConsent: false };
  closeCandidateWatch();
  if (videoWatch?.id)
    update.videoWatch = { ...videoWatch, state: "Stopped", answer: null };
  if (cameraRequest?.state === "Accepted")
    update.cameraRequest = {
      ...cameraRequest,
      state: "Stopped",
      stoppedAt: now(),
    };
  if (!liveSessions.update(user.sessionId, update)) {
    toast(
      "Your stop-sharing request could not be shared with the examiner.",
      "bad",
    );
    return;
  }
  $("#videoShareConsent").checked = false;
  renderVideoShareStatus(
    "You stopped video sharing. The examiner can still see your exam status.",
  );
  toast("Live video sharing stopped.", "ok");
};
renderVideoShareStatus(
  "The examiner can see your camera status, but not your video.",
);
liveSessions.subscribe((sessions) => {
  void handleCandidateVideoWatch(sessions[user.sessionId]?.videoWatch);
});
async function runCheck() {
  $("#runCheck").disabled = true;
  $("#goExam").disabled = true;
  states = states.map(() => "checking");
  renderChecks();
  readinessRunning = true;
  $("#checkSummary").textContent = "Requesting camera access…";
  setScannerLabel("REQUESTING CAMERA");
  sessionStatus = "Readiness";
  syncLiveSession();
  try {
    await probeInternet();
    if (connectionState !== "Connected")
      throw new Error(
        "No internet connection. Reconnect, then run the checks again.",
      );
    await openCamera();
    mediaOK.cam = true;
    $("#stCam").innerHTML = badge("ok", "● On");
    $("#checkSummary").textContent =
      "Loading face-detection model for this device…";
    setScannerLabel("LOADING ON-DEVICE MODEL");
    if (!faceDetector) await loadFaceDetector();
    mediaOK.ai = true;
    faceCount = null;
    startScanning();
    syncLiveSession();
    $("#checkSummary").textContent = "Running the live camera and face checks…";
    setScannerLabel("SCANNER STARTING");
    const deadline = Date.now() + 10000;
    while (faceCount === null && Date.now() < deadline) await wait(200);
    if (faceCount === null)
      throw new Error("Camera frames were unavailable for the face scan.");
    states[0] = "passed";
    states[1] = navigator.mediaDevices ? "passed" : "warning";
    states[2] = connectionState === "Connected" ? "passed" : "failed";
    setCheck("Face detected", faceCount > 0 ? "passed" : "warning");
    setCheck("Single person detected", faceCount === 1 ? "passed" : "warning");
    setCheck("Lighting", lightLevel >= 0.12 ? "passed" : "warning");
    renderChecks();
    const warnings = states.filter((state) => state === "warning").length;
    readinessComplete = true;
    $("#checkSummary").textContent =
      connectionState === "Connected"
        ? warnings
          ? `Checks complete. ${warnings} item(s) need attention; you can continue.`
          : "All checks passed. You are ready to begin."
        : "Internet unavailable. Reconnect before continuing.";
    $("#goExam").disabled = connectionState !== "Connected";
    $("#runCheck").textContent = "Run checks again";
    setScannerLabel("ON-DEVICE FACE CHECK ACTIVE");
  } catch (error) {
    mediaOK.ai = !!faceDetector;
    states = checks.map(() => "idle");
    setCheck(
      "Camera",
      mediaOK.cam
        ? "passed"
        : error.message.startsWith("No internet connection")
          ? "idle"
          : "failed",
    );
    setCheck(
      "Browser",
      window.isSecureContext && !!navigator.mediaDevices ? "passed" : "failed",
    );
    setCheck(
      "Internet connection",
      connectionState === "Connected" ? "passed" : "failed",
    );
    if (mediaOK.cam && connectionState === "Connected") {
      setCheck("Face detected", "failed");
      setCheck("Single person detected", "failed");
      setCheck("Lighting", "warning");
    }
    renderChecks();
    readinessComplete = false;
    $("#checkSummary").textContent =
      error.name === "NotAllowedError"
        ? "Camera access was denied. Allow camera access in your browser settings, then try again."
        : error.message || "The live check could not start.";
    setScannerLabel(
      mediaOK.cam ? "AI MODEL UNAVAILABLE" : "CAMERA UNAVAILABLE",
    );
    syncLiveSession();
    if (!mediaOK.cam && cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
  }
  readinessRunning = false;
  updateReadinessButton();
}
renderChecks();
$("#runCheck").onclick = runCheck;
/* ---------- Exam ---------- */
const progressKey = `exam-progress:${user.exam}:${user.name}`;
let cur = 0,
  secs = examDetails.durationSeconds,
  log = [],
  answers = {},
  marked = new Set(),
  timerId,
  storageWarningShown = false,
  appliedTimeGrant =
    Number(liveSessions.read()[user.sessionId]?.timeGrantedSeconds) || 0;
syncLiveSession();
try {
  const saved = JSON.parse(sessionStorage.getItem(progressKey) || "null");
  if (saved && typeof saved === "object") {
    if (
      saved.answers &&
      typeof saved.answers === "object" &&
      !Array.isArray(saved.answers)
    )
      Object.entries(saved.answers).forEach(([i, v]) => {
        const n = Number(i);
        if (
          Number.isInteger(n) &&
          n >= 0 &&
          n < questions.length &&
          Number.isInteger(v) &&
          v >= 0 &&
          v < questions[n].o.length
        )
          answers[n] = v;
      });
    if (Array.isArray(saved.marked))
      marked = new Set(
        saved.marked.filter(
          (i) => Number.isInteger(i) && i >= 0 && i < questions.length,
        ),
      );
    if (
      Number.isInteger(saved.secs) &&
      saved.secs > 0 &&
      saved.secs <= examDetails.durationSeconds
    )
      secs = saved.secs;
    if (Array.isArray(saved.log))
      log = saved.log
        .filter(
          (e) =>
            Array.isArray(e) &&
            e.length === 3 &&
            e.every((x) => typeof x === "string"),
        )
        .slice(0, 100);
  }
} catch {
  toast(
    "Saved progress could not be restored. A fresh attempt is ready.",
    "warn",
  );
}
syncLiveSession();
function saveProgress() {
  try {
    sessionStorage.setItem(
      progressKey,
      JSON.stringify({ answers, marked: [...marked], secs, log }),
    );
  } catch {
    if (!storageWarningShown) {
      storageWarningShown = true;
      toast(
        "Progress cannot be saved in this browser. Keep this exam open.",
        "warn",
      );
    }
  }
}
function setStatus() {
  $("#stCam").innerHTML = mediaOK.cam
    ? badge("ok", "● On")
    : badge("bad", "✕ Off");
  $("#stNet").innerHTML =
    connectionState === "Connected"
      ? badge("ok", "● Connected")
      : badge("bad", "✕ No internet");
}
function addEvent(label, sev) {
  log.unshift([now(), label, sev]);
  $("#evList").innerHTML = timelineHTML(log.slice(0, 3));
  saveProgress();
  addLiveEvent(label, sev);
  toast(
    "Potential signal shared with the examiner dashboard in this browser. It is not sent to a remote server.",
    sev === "HIGH" ? "bad" : "warn",
  );
}
$("#requestHelp").onclick = () => {
  const message = $("#helpText").value.trim();
  if (!message) {
    $("#helpText").focus();
    toast("Write a message first.", "warn");
    return;
  }
  const result = liveSessions.update(user.sessionId, {
    helpRequest: {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      message,
      at: now(),
      status: "Open",
    },
  });
  if (!result) {
    toast(
      "Your message could not be sent. Check that both pages are open in this browser.",
      "bad",
    );
    return;
  }
  $("#helpText").value = "";
  renderHelpState();
  toast("Message sent to the examiner tab.", "ok");
};
liveSessions.subscribe(renderHelpState);
$("#allowCameraRequest").onclick = () => {
  const session = liveSessions.read()[user.sessionId],
    request = session?.cameraRequest;
  if (!request || request.state !== "Pending") {
    renderCameraRequest(session);
    toast("This camera request is no longer active.", "warn");
    return;
  }
  if (!cameraStream) {
    toast(
      "Your camera is not active. Restart the camera check before sharing video.",
      "warn",
    );
    return;
  }
  shareVideoConsent = true;
  $("#videoShareConsent").checked = true;
  const result = liveSessions.update(user.sessionId, {
    videoShareConsent: true,
    cameraRequest: { ...request, state: "Accepted", respondedAt: now() },
  });
  if (!result) {
    shareVideoConsent = false;
    $("#videoShareConsent").checked = false;
    toast("Your response could not be shared.", "bad");
    return;
  }
  renderCameraRequest(result);
  renderVideoShareStatus(
    "You allowed the examiner to watch your live video. You can stop sharing at any time.",
  );
  toast("Live video sharing allowed.", "ok");
};
$("#declineCameraRequest").onclick = () => {
  const session = liveSessions.read()[user.sessionId],
    request = session?.cameraRequest;
  if (!request || request.state !== "Pending") {
    renderCameraRequest(session);
    return;
  }
  const result = liveSessions.update(user.sessionId, {
    cameraRequest: { ...request, state: "Declined", respondedAt: now() },
  });
  if (!result) {
    toast("Your response could not be shared.", "bad");
    return;
  }
  renderCameraRequest(result);
  toast("Camera request declined.", "warn");
};
liveSessions.subscribe((sessions) => {
  const session = sessions[user.sessionId];
  renderCameraRequest(session);
  if (
    session?.status === "Disqualified" &&
    sessionStatus !== "Disqualified" &&
    sessionStatus !== "Completed"
  ) {
    finish("Disqualified");
    return;
  }
  const granted = Number.isInteger(session?.timeGrantedSeconds)
    ? session.timeGrantedSeconds
    : 0;
  if (granted > appliedTimeGrant && sessionStatus === "In exam") {
    const added = granted - appliedTimeGrant;
    appliedTimeGrant = granted;
    secs += added;
    $("#timer").textContent =
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    saveProgress();
    toast(`Your examiner added ${added} seconds to your exam.`, "ok");
  }
});
function showQ() {
  const q = questions[cur];
  $("#qCount").textContent = `Question ${cur + 1} of ${questions.length}`;
  syncLiveSession();
  $("#qBox").innerHTML =
    `<fieldset class="fade"><legend class="text-xl font-bold">${q.q}</legend>${q.o.map((o, i) => `<label class="flex items-center gap-3 card mt-3 cursor-pointer min-h-[44px]"><input type="radio" name="q" value="${i}" class="w-5 h-5" ${answers[cur] === i ? "checked" : ""}> ${o}</label>`).join("")}</fieldset>`;
  $$("input[name=q]").forEach(
    (r) =>
      (r.onchange = () => {
        answers[cur] = +r.value;
        drawNav();
        saveProgress();
        syncLiveSession();
      }),
  );
  $("#prev").disabled = cur === 0;
  $("#next").disabled = cur === questions.length - 1;
  $("#mark").setAttribute("aria-pressed", marked.has(cur));
  drawNav();
}
function drawNav() {
  $("#nav").innerHTML = questions
    .map((_, i) => {
      const a = i in answers,
        m = marked.has(i);
      return `<button class="qn ${a ? "ans" : ""} ${m ? "mark" : ""} ${i === cur ? "cur" : ""}" data-i="${i}" aria-label="Question ${i + 1}, ${a ? "answered" : "unanswered"}${m ? ", marked for review" : ""}${i === cur ? ", current" : ""}" ${i === cur ? 'aria-current="step"' : ""}>${i + 1}</button>`;
    })
    .join("");
  $$(".qn").forEach(
    (b) =>
      (b.onclick = () => {
        cur = +b.dataset.i;
        showQ();
      }),
  );
}
function tick() {
  secs--;
  const m = Math.floor(secs / 60),
    s = secs % 60;
  $("#timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
  saveProgress();
  if (secs <= 300) $("#timer").classList.add("timer-warn");
  if (secs === 300) toast("5 minutes remaining.", "warn");
  if (secs === 60) toast("1 minute remaining.", "bad");
  if (secs <= 0) finish();
}
$("#goExam").onclick = () => {
  sessionStatus = "In exam";
  $("#stageCheck").hidden = true;
  $("#stageExam").hidden = false;
  $("#beaconHdr").hidden = false;
  renderVideoShareStatus(
    shareVideoConsent
      ? "The examiner may watch your live video in this browser. You can stop sharing at any time."
      : "The examiner can see your camera status, but not your video.",
  );
  const examVideo = $("#examVideo");
  examVideo.srcObject = cameraStream;
  examVideo.hidden = false;
  $(".camfb", $("#cam")).hidden = !cameraStream;
  if (cameraStream)
    examVideo
      .play()
      .catch((error) =>
        toast(`Live camera preview could not start: ${error.message}`, "bad"),
      );
  setStatus();
  showQ();
  syncLiveSession();
  $("#timer").textContent =
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  saveProgress();
  timerId = setInterval(tick, 1000);
};
$("#prev").onclick = () => {
  cur--;
  showQ();
};
$("#next").onclick = () => {
  cur++;
  showQ();
};
$("#mark").onclick = () => {
  marked.has(cur) ? marked.delete(cur) : marked.add(cur);
  showQ();
  saveProgress();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !$("#stageExam").hidden)
    addEvent("Browser focus changed", "MEDIUM");
});
addEventListener("pagehide", () => {
  if (sessionStatus !== "Completed" && sessionStatus !== "Disqualified") {
    sessionStatus = "Left";
    const session = liveSessions.read()[user.sessionId],
      videoWatch = session?.videoWatch;
    if (videoWatch?.id)
      liveSessions.update(user.sessionId, {
        videoShareConsent: false,
        videoWatch: { ...videoWatch, state: "Stopped", answer: null },
      });
    syncLiveSession();
  }
  closeCandidateWatch();
  clearInterval(connectivityTimer);
  clearInterval(sessionHeartbeatTimer);
  stopMonitoring();
});
/* ---------- Submit ---------- */
const dlg = $("#dlg");
$("#submit").onclick = () => {
  const un = questions.length - Object.keys(answers).length;
  $("#dlgT").textContent = "Finish this demo?";
  $("#dlgP").textContent = un
    ? `You have ${un} unanswered question(s). Finish this demo now? Your answers are not sent to an institution or saved on a server.`
    : "Finish this demo now? Your answers are not sent to an institution or saved on a server.";
  $("#dlgErr").textContent = "";
  dlg.showModal();
};
$("#dlgNo").onclick = () => dlg.close();
$("#dlgYes").onclick = () => {
  dlg.close();
  finish();
};
function finish(result = "Completed") {
  clearInterval(timerId);
  sessionStatus = result;
  clearInterval(connectivityTimer);
  clearInterval(sessionHeartbeatTimer);
  stopMonitoring();
  mediaOK.cam = false;
  mediaOK.ai = false;
  syncLiveSession();
  sessionStorage.removeItem(progressKey);
  const n = Object.keys(answers).length,
    high = log.filter((l) => l[2] === "HIGH").length;
  $("#stageExam").hidden = true;
  $("#stageDone").hidden = false;
  $("#beaconHdr").hidden = true;
  $("#dTime").textContent = now();
  $("#dAns").textContent = `${n} of ${questions.length}`;
  $("#dUn").textContent = questions.length - n;
  $("#doneStatus").textContent =
    result === "Disqualified"
      ? "Disqualified by examiner"
      : "Finished in this browser";
  $("#h-done").textContent =
    result === "Disqualified" ? "Exam session ended" : "Demo exam complete";
  $("#dMsg").textContent =
    result === "Disqualified"
      ? "Your examiner ended this exam session. Your answers were not sent to an institution or saved on a server."
      : `Your answers were not sent to an institution or saved on a server.${high ? ` ${high} alert(s) were shared with the examiner tab in this browser.` : ""}`;
  $("#dLog").innerHTML = log.length
    ? timelineHTML(log)
    : '<p class="mut">No alerts were recorded during this exam.</p>';
  $("#h-done").focus();
}
