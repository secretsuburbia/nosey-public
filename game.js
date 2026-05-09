const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreText = document.getElementById("score");
const leaderboardList = document.getElementById("leaderboardList");
const statusText = document.getElementById("status");
const pickButton = document.getElementById("pickButton");
const backgroundMusic = document.getElementById("backgroundMusic");
const recordVoice = document.getElementById("recordVoice");
const musicToggle = document.getElementById("musicToggle");
const startBanner = document.getElementById("startBanner");
const ewReaction = document.getElementById("ewReaction");
const splashScreen = document.getElementById("splashScreen");
const startGameButton = document.getElementById("startGameButton");

const player = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  hitRadius: 12,
  speed: 300
};

const watcherStyles = [
  { skin: "#f0c35c", shirt: "#51706f", pants: "#293744", hair: "#30221c", head: "round", accessory: "hair" },
  { skin: "#c98f62", shirt: "#8f5fa8", pants: "#202d3f", hair: "#171717", head: "oval", accessory: "flatTop" },
  { skin: "#f1b788", shirt: "#c85848", pants: "#2f3b4c", hair: "#5a2d16", head: "square", accessory: "cap" },
  { skin: "#8f674f", shirt: "#4b8a68", pants: "#252d32", hair: "#111111", head: "long", accessory: "curls" },
  { skin: "#e0a35f", shirt: "#d1a340", pants: "#25344f", hair: "#70451f", head: "diamond", accessory: "beanie" }
];
const loseSoundSources = [
  "assets/lose-1.m4a",
  "assets/lose-3.m4a",
  "assets/lose-4.m4a",
  "assets/lose-5.m4a"
];
const loseSounds = [
  new Audio(loseSoundSources[0]),
  new Audio(loseSoundSources[1]),
  new Audio(loseSoundSources[2]),
  new Audio(loseSoundSources[3])
];

const watchers = [];
let width = 0;
let height = 0;
let score = 0;
let highScores = loadHighScores();
let highScore = highScores[0] || 0;
let isPicking = false;
let isGameOver = false;
let lastTime = performance.now();
let nextAttentionShift = 0;
let difficulty = 1;
let pickStartedAt = 0;
let audioContext;
let loseSoundBufferPromise;
let loseSoundBuffers = [];
let slimeTimer;
let isSpaceDown = false;
let hasStartedMusic = false;
let hasUnlockedMobileAudio = false;
let hasDismissedSplash = false;
let isMusicEnabled = localStorage.getItem("noseyPublicMusic") !== "off";
let startBannerUntil = performance.now() + 3600;
let reactionTextUntil = 0;
let startBannerTimer;
let ewReactionTimer;
let pickPointerId = null;
const touchQuery = window.matchMedia("(pointer: coarse)");

function resize() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  placeWatchers();
  clampPlayer();
}

function setup() {
  updateMusicToggle();
  renderLeaderboard();
  showStartBanner();

  for (let i = 0; i < 5; i += 1) {
    watchers.push({
      x: 0,
      y: 0,
      angle: 0,
      beamWidth: 6,
      pulseOffset: Math.random() * Math.PI * 2,
      style: watcherStyles[i % watcherStyles.length]
    });
  }

  player.x = width / 2;
  player.y = height / 2;
  player.targetX = player.x;
  player.targetY = player.y;
  placeWatchers();
  shiftAttention();
}

function placeWatchers() {
  if (!watchers.length || !width || !height) return;

  const bottom = Math.max(128, height - 64);
  const positions = [
    [58, 142],
    [width * 0.32, 104],
    [width * 0.68, 104],
    [width - 58, 142],
    [58, height * 0.6],
    [width - 58, bottom]
  ];

  watchers.forEach((watcher, index) => {
    const [x, y] = positions[index % positions.length];
    watcher.x = x;
    watcher.y = y;
  });
}

function randomPlayPoint() {
  return {
    x: 74 + Math.random() * Math.max(20, width - 148),
    y: 112 + Math.random() * Math.max(20, height - 224)
  };
}

function shiftAttention() {
  difficulty += 0.02;
  nextAttentionShift = performance.now() + (1300 + Math.random() * 1500) / Math.sqrt(difficulty);

  watchers.forEach((watcher) => {
    const aimAtPlayer = Math.random() < 0.12;
    const target = aimAtPlayer ? playerFacePoint() : randomPlayPoint();
    const gaze = watcherGazePoint(watcher);
    watcher.angle = Math.atan2(target.y - gaze.y, target.x - gaze.x);
  });
}

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function moveTarget(event) {
  if (event) event.preventDefault();
  dismissSplash();
  unlockMobileAudio();
  startBackgroundMusic();

  if (isGameOver) {
    restart();
    return;
  }

  const point = pointerToCanvas(event);
  player.targetX = Math.min(Math.max(point.x, 26), width - 26);
  player.targetY = Math.min(Math.max(point.y, 100), height - 32);
}

function startPicking(event) {
  if (event) event.preventDefault();
  if (event && event.pointerId !== undefined) {
    pickPointerId = event.pointerId;
    pickButton.setPointerCapture?.(event.pointerId);
  }
  dismissSplash();
  unlockMobileAudio();
  startBackgroundMusic();

  if (isGameOver) {
    restart();
    return;
  }

  if (isPicking) return;

  isPicking = true;
  pickStartedAt = performance.now();
  pickButton.classList.add("is-picking");
  pickButton.textContent = "Stop";
  statusText.textContent = "Risky business.";
  startSlimeSounds();
}

function dismissSplash() {
  if (hasDismissedSplash || !splashScreen) return;

  hasDismissedSplash = true;
  splashScreen.classList.add("is-hidden");
}

function stopPicking(event) {
  if (event && pickPointerId !== null && event.pointerId !== pickPointerId) return;

  if (event && event.pointerId !== undefined) {
    pickButton.releasePointerCapture?.(event.pointerId);
  }

  pickPointerId = null;

  if (!isPicking && !slimeTimer) return;

  isPicking = false;
  pickButton.classList.remove("is-picking");
  pickButton.textContent = "Hold";
  if (!isGameOver) statusText.textContent = "Stay casual.";
  stopSlimeSounds();
}

function restart() {
  score = 0;
  difficulty = 1;
  isGameOver = false;
  showStartBanner();
  reactionTextUntil = 0;
  stopPicking();
  player.x = width / 2;
  player.y = height / 2;
  player.targetX = player.x;
  player.targetY = player.y;
  statusText.textContent = "Stay casual.";
  shiftAttention();
}

function clampPlayer() {
  player.x = Math.min(Math.max(player.x, 26), width - 26);
  player.y = Math.min(Math.max(player.y, 100), height - 32);
  player.targetX = Math.min(Math.max(player.targetX, 26), width - 26);
  player.targetY = Math.min(Math.max(player.targetY, 100), height - 32);
}

function update(delta) {
  const now = performance.now();
  if (now >= nextAttentionShift && !isGameOver) shiftAttention();

  if (!isGameOver) {
    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 1) {
      const step = Math.min(distance, player.speed * delta);
      player.x += (dx / distance) * step;
      player.y += (dy / distance) * step;
    }

    if (isPicking) {
      score += delta;
      if (beamHitsPlayer()) gameOver();
    }
  }

  scoreText.textContent = score.toFixed(1);
}

function gameOver() {
  const beatHighScore = score > highScore;

  isGameOver = true;
  isPicking = false;
  stopSlimeSounds();
  addHighScore(score);
  pickButton.classList.remove("is-picking");
  pickButton.textContent = "Retry";
  statusText.textContent = `Caught! Best: ${highScore.toFixed(1)}`;
  reactionTextUntil = performance.now() + 1400;
  showEwReaction();
  playCrowdEw();
  if (beatHighScore) {
    sayNewWorldRecord();
  }
}

function loadHighScores() {
  const savedScores = JSON.parse(localStorage.getItem("noseyPublicHighScores") || "[]");
  const oldHighScore = Number(localStorage.getItem("noseyPublicHighScore") || 0);
  const scores = Array.isArray(savedScores) ? savedScores : [];

  if (oldHighScore > 0 && !scores.includes(oldHighScore)) {
    scores.push(oldHighScore);
  }

  return normalizeHighScores(scores);
}

function addHighScore(newScore) {
  highScores = normalizeHighScores([...highScores, newScore]);
  highScore = highScores[0] || 0;
  localStorage.setItem("noseyPublicHighScores", JSON.stringify(highScores));
  localStorage.setItem("noseyPublicHighScore", String(highScore));
  renderLeaderboard();
}

function normalizeHighScores(scores) {
  return scores
    .map(Number)
    .filter((savedScore) => Number.isFinite(savedScore) && savedScore > 0)
    .sort((a, b) => b - a)
    .slice(0, 5);
}

function renderLeaderboard() {
  if (!leaderboardList) return;

  leaderboardList.replaceChildren();

  for (let i = 0; i < 5; i += 1) {
    const item = document.createElement("li");
    item.textContent = highScores[i] ? highScores[i].toFixed(1) : "--";
    leaderboardList.appendChild(item);
  }
}

function showStartBanner() {
  startBannerUntil = performance.now() + 3600;
  if (!startBanner) return;

  window.clearTimeout(startBannerTimer);
  startBanner.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:26%",
    "transform:translateX(-50%) scale(1)",
    "width:min(92vw, 720px)",
    "text-align:center",
    "color:#f7fbfa",
    "font:1000 clamp(38px, 8vw, 76px) system-ui, sans-serif",
    "text-shadow:0 4px 0 rgba(17,24,25,.95), 0 0 28px rgba(255,79,88,.5)",
    "opacity:1",
    "pointer-events:none",
    "z-index:20",
    "transition:opacity 180ms ease, transform 180ms ease"
  ].join(";");
  startBanner.classList.add("is-visible");
  startBannerTimer = window.setTimeout(() => {
    startBanner.style.opacity = "0";
    startBanner.style.transform = "translateX(-50%) scale(0.96)";
    startBanner.classList.remove("is-visible");
    if (!isPicking && !isGameOver) {
      statusText.textContent = "Stay casual.";
    }
  }, 2600);
}

function showEwReaction() {
  if (!ewReaction) return;

  window.clearTimeout(ewReactionTimer);
  ewReaction.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:22%",
    "transform:translateX(-50%) scale(1)",
    "width:min(92vw, 720px)",
    "text-align:center",
    "color:#91d94f",
    "font:1000 clamp(52px, 10vw, 96px) system-ui, sans-serif",
    "text-shadow:0 4px 0 rgba(17,24,25,.95), 0 0 28px rgba(145,217,79,.6)",
    "opacity:1",
    "pointer-events:none",
    "z-index:20",
    "transition:opacity 180ms ease, transform 180ms ease"
  ].join(";");
  ewReaction.classList.add("is-visible");
  ewReactionTimer = window.setTimeout(() => {
    ewReaction.style.opacity = "0";
    ewReaction.style.transform = "translateX(-50%) scale(0.96)";
    ewReaction.classList.remove("is-visible");
  }, 1250);
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function startBackgroundMusic() {
  if (!isMusicEnabled || hasStartedMusic || !backgroundMusic) return;

  hasStartedMusic = true;
  backgroundMusic.volume = 0.45;
  backgroundMusic.play().catch(() => {
    hasStartedMusic = false;
  });
}

function unlockMobileAudio() {
  if (hasUnlockedMobileAudio) return;

  hasUnlockedMobileAudio = true;
  ensureAudio();
  primeAudioContext();
  loadLoseSoundBuffers();

  [recordVoice, ...loseSounds].filter(Boolean).forEach((sound) => {
    const originalVolume = sound.volume;

    sound.muted = true;
    sound.volume = 0;
    sound.play()
      .then(() => {
        sound.pause();
        sound.currentTime = 0;
        sound.muted = false;
        sound.volume = originalVolume || 1;
      })
      .catch(() => {
        sound.muted = false;
        sound.volume = originalVolume || 1;
      });
  });
}

function primeAudioContext() {
  if (!audioContext) return;

  const start = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.00001, start + 0.04);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.05);
}

function loadLoseSoundBuffers() {
  ensureAudio();

  if (loseSoundBufferPromise) return loseSoundBufferPromise;

  loseSoundBufferPromise = Promise.all(
    loseSoundSources.map(async (source) => {
      const response = await fetch(source);
      const arrayBuffer = await response.arrayBuffer();
      return decodeAudio(arrayBuffer);
    })
  )
    .then((buffers) => {
      loseSoundBuffers = buffers.filter(Boolean);
      return loseSoundBuffers;
    })
    .catch(() => {
      loseSoundBuffers = [];
      return loseSoundBuffers;
    });

  return loseSoundBufferPromise;
}

function decodeAudio(arrayBuffer) {
  return new Promise((resolve, reject) => {
    audioContext.decodeAudioData(arrayBuffer, resolve, reject);
  });
}

function toggleMusic(event) {
  event.preventDefault();
  event.stopPropagation();

  isMusicEnabled = !isMusicEnabled;
  localStorage.setItem("noseyPublicMusic", isMusicEnabled ? "on" : "off");

  if (!isMusicEnabled && backgroundMusic) {
    backgroundMusic.pause();
  } else {
    hasStartedMusic = false;
    startBackgroundMusic();
  }

  updateMusicToggle();
}

function updateMusicToggle() {
  if (!musicToggle) return;

  musicToggle.textContent = isMusicEnabled ? "Music On" : "Music Off";
  musicToggle.setAttribute("aria-pressed", String(isMusicEnabled));
  musicToggle.classList.toggle("is-off", !isMusicEnabled);
}

function startSlimeSounds() {
  ensureAudio();
  playSlimeSound();
  slimeTimer = window.setInterval(playSlimeSound, 260);
}

function stopSlimeSounds() {
  if (slimeTimer) {
    window.clearInterval(slimeTimer);
    slimeTimer = undefined;
  }
}

function playSlimeSound() {
  if (!audioContext) return;

  const start = audioContext.currentTime;
  const duration = 0.16 + Math.random() * 0.09;
  const oscillator = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(130 + Math.random() * 80, start);
  oscillator.frequency.exponentialRampToValueAtTime(55 + Math.random() * 35, start + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(260 + Math.random() * 140, start);
  filter.Q.setValueAtTime(7, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.1, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playCrowdEw() {
  ensureAudio();

  if (loseSoundBuffers.length) {
    const buffer = loseSoundBuffers[Math.floor(Math.random() * loseSoundBuffers.length)];
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();

    source.buffer = buffer;
    gain.gain.setValueAtTime(1, audioContext.currentTime);
    source.connect(gain);
    gain.connect(audioContext.destination);
    source.start();
    return;
  }

  const source = loseSoundSources[Math.floor(Math.random() * loseSoundSources.length)];
  if (!source) return;

  loadLoseSoundBuffers().then((buffers) => {
    if (!buffers.length) return;

    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    const bufferSource = audioContext.createBufferSource();
    const gain = audioContext.createGain();

    bufferSource.buffer = buffer;
    gain.gain.setValueAtTime(1, audioContext.currentTime);
    bufferSource.connect(gain);
    gain.connect(audioContext.destination);
    bufferSource.start();
  });

  loseSounds.forEach((loseSound) => {
    loseSound.pause();
    loseSound.currentTime = 0;
  });

  const sound = new Audio(source);
  sound.volume = 1;
  sound.playsInline = true;
  sound.play().catch(() => {});
}

function sayNewWorldRecord() {
  if (!recordVoice) return;

  recordVoice.pause();
  recordVoice.currentTime = 0;
  recordVoice.volume = 1;
  recordVoice.play().catch(() => {});
}

function beamHitsPlayer() {
  if (performance.now() - pickStartedAt < 600) return false;

  return watchers.some((watcher) => {
    const gaze = watcherGazePoint(watcher);
    const face = playerFacePoint();
    const vx = Math.cos(watcher.angle);
    const vy = Math.sin(watcher.angle);
    const px = face.x - gaze.x;
    const py = face.y - gaze.y;
    const projection = px * vx + py * vy;

    if (projection <= 0) return false;

    const closestX = gaze.x + vx * projection;
    const closestY = gaze.y + vy * projection;
    return Math.hypot(face.x - closestX, face.y - closestY) < player.hitRadius + watcher.beamWidth * 0.35;
  });
}

function watcherGazePoint(watcher) {
  return { x: watcher.x, y: watcher.y - 44 };
}

function playerFacePoint() {
  return { x: player.x + 8, y: player.y - 46 };
}

function draw() {
  drawGround();
  watchers.forEach(drawBeam);
  drawPlayer();
  watchers.forEach(drawWatcher);
  drawInstructions();
}

function drawGround() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#172321";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(247,251,250,0.08)";
  ctx.lineWidth = 1;
  for (let x = -40; x < width + 80; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 180, height);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(246, 202, 116, 0.12)";
  ctx.fillRect(0, height * 0.62, width, 68);
}

function drawBeam(watcher) {
  const gaze = watcherGazePoint(watcher);
  const beamLength = Math.max(width, height) * 1.35;
  const endX = gaze.x + Math.cos(watcher.angle) * beamLength;
  const endY = gaze.y + Math.sin(watcher.angle) * beamLength;
  const pulse = 0.36 + Math.sin(performance.now() / 180 + watcher.pulseOffset) * 0.12;

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = "#ff4f58";
  ctx.lineWidth = watcher.beamWidth;
  ctx.shadowColor = "#ff4f58";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(gaze.x, gaze.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawWatcher(watcher) {
  const style = watcher.style;

  ctx.save();
  ctx.translate(watcher.x, watcher.y);

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 17, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  drawLimb(-7, -4, -12, 17, style.pants, 6);
  drawLimb(7, -4, 12, 17, style.pants, 6);
  drawShoe(-13, 18, -1);
  drawShoe(13, 18, 1);

  drawLimb(-13, -27, -24, -10, style.skin, 6);
  drawLimb(13, -27, 24, -12, style.skin, 6);

  ctx.fillStyle = style.shirt;
  roundRect(-17, -38, 34, 36, 9);
  ctx.fill();
  ctx.fillStyle = shadeColor(style.shirt, -24);
  roundRect(-13, -34, 26, 30, 8);
  ctx.fill();

  ctx.fillStyle = style.skin;
  roundRect(-6, -44, 12, 10, 4);
  ctx.fill();

  drawWatcherHead(style);

  ctx.fillStyle = "#1a2222";
  ctx.beginPath();
  ctx.arc(-5, -50, 2.1, 0, Math.PI * 2);
  ctx.arc(5, -50, 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111819";
  ctx.beginPath();
  ctx.arc(Math.cos(watcher.angle) * 8, -48 + Math.sin(watcher.angle) * 8, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShoe(x, y, direction) {
  ctx.fillStyle = "#1f2b3a";
  ctx.beginPath();
  ctx.ellipse(x + direction * 3, y, 8, 3.5, direction * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawWatcherHead(style) {
  ctx.save();
  ctx.fillStyle = style.skin;
  ctx.strokeStyle = "#f7fbfa";
  ctx.lineWidth = 2;

  if (style.head === "oval") {
    ctx.beginPath();
    ctx.ellipse(0, -48, 12, 17, 0, 0, Math.PI * 2);
  } else if (style.head === "square") {
    roundRect(-13, -62, 26, 27, 7);
  } else if (style.head === "long") {
    roundRect(-11, -66, 22, 34, 10);
  } else if (style.head === "diamond") {
    ctx.beginPath();
    ctx.moveTo(0, -66);
    ctx.lineTo(15, -50);
    ctx.lineTo(0, -33);
    ctx.lineTo(-15, -50);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.arc(0, -48, 14, 0, Math.PI * 2);
  }

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = style.hair;
  if (style.accessory === "hair") {
    ctx.beginPath();
    ctx.arc(0, -58, 13, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (style.accessory === "flatTop") {
    roundRect(-12, -66, 24, 9, 3);
    ctx.fill();
  } else if (style.accessory === "cap") {
    roundRect(-15, -67, 30, 8, 4);
    ctx.fill();
    ctx.fillRect(8, -62, 12, 4);
  } else if (style.accessory === "curls") {
    for (let x = -10; x <= 10; x += 5) {
      ctx.beginPath();
      ctx.arc(x, -62, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style.accessory === "beanie") {
    ctx.beginPath();
    ctx.arc(0, -60, 13, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-13, -60, 26, 5);
  }

  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  const sway = Math.sin(performance.now() / 140) * (isPicking ? 1.6 : 1);

  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  drawLimb(-8, -6, -15 - sway, 18, "#27323a", 7);
  drawLimb(8, -6, 16 + sway, 18, "#27323a", 7);
  drawShoe(-16 - sway, 19, -1);
  drawShoe(16 + sway, 19, 1);

  ctx.fillStyle = isPicking ? "#d8444d" : "#27b3a5";
  roundRect(-18, -38, 36, 38, 10);
  ctx.fill();
  ctx.strokeStyle = "#f7fbfa";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(247, 251, 250, 0.14)";
  roundRect(-10, -33, 20, 28, 7);
  ctx.fill();

  if (isPicking) {
    const poke = Math.sin(performance.now() / 85) * 1.8;
    drawLimb(-15, -27, -27, -14, "#f1b788", 6);
    drawLimb(13, -28, 8, -42, "#f1b788", 7);
    drawLimb(8, -42, 14 + poke, -49, "#f1b788", 5);
    ctx.fillStyle = "#f1b788";
    drawPickingHand(14 + poke, -49);
  } else {
    drawLimb(-14, -28, -26, -12, "#f1b788", 6);
    drawLimb(14, -28, 27, -13, "#f1b788", 6);
  }

  ctx.fillStyle = isPicking ? "#db3c45" : "#27b3a5";
  ctx.strokeStyle = "#f7fbfa";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -50, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f1b788";
  ctx.beginPath();
  ctx.arc(0, -50, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#263033";
  ctx.beginPath();
  ctx.arc(-5, -54, 2.1, 0, Math.PI * 2);
  ctx.arc(5, -54, 2.1, 0, Math.PI * 2);
  ctx.fill();

  if (isPicking) {
    ctx.strokeStyle = "#263033";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -59);
    ctx.lineTo(-1, -57);
    ctx.moveTo(4, -58);
    ctx.lineTo(9, -60);
    ctx.stroke();
  }

  ctx.fillStyle = "#f6a3b2";
  ctx.beginPath();
  ctx.arc(10, -48, 4.8, 0, Math.PI * 2);
  ctx.fill();

  if (isPicking) {
    ctx.fillStyle = "#263033";
    ctx.beginPath();
    ctx.arc(10, -48, 2.6, 0, Math.PI * 2);
    ctx.fill();
    drawNosePickingMess();
  }

  ctx.restore();
}

function drawPickingHand(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#f1b788";
  ctx.beginPath();
  ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f1b788";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(6, -4);
  ctx.moveTo(1, 1);
  ctx.lineTo(6, 2);
  ctx.moveTo(-1, 2);
  ctx.lineTo(3, 6);
  ctx.stroke();
  ctx.restore();
}

function drawNosePickingMess() {
  const wiggle = Math.sin(performance.now() / 95);
  const drip = (performance.now() / 12) % 14;

  ctx.save();
  ctx.strokeStyle = "#91d94f";
  ctx.fillStyle = "#91d94f";
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(13, -46);
  ctx.quadraticCurveTo(18 + wiggle * 2, -39, 15 + wiggle, -31);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(15 + wiggle, -31 + drip * 0.25, 3.2, 0, Math.PI * 2);
  ctx.arc(19 - wiggle, -38, 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(145, 217, 79, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(11, -48);
  ctx.lineTo(16, -47);
  ctx.lineTo(19, -42);
  ctx.stroke();
  ctx.restore();
}

function drawLimb(x1, y1, x2, y2, color, widthPx) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shadeColor(color, amount) {
  const value = color.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16);
    return Math.max(0, Math.min(255, channel + amount)).toString(16).padStart(2, "0");
  });

  return `#${channels.join("")}`;
}

function drawInstructions() {
  ctx.save();
  ctx.fillStyle = "rgba(247,251,250,0.7)";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  const isTouchLayout = touchQuery.matches || width < 720 || (width <= 900 && height > width);
  const text = isTouchLayout
    ? "Drag to move. Hold the green button to score."
    : "Click or drag to move. Hold Space or the button to score. Release before attention hits.";
  const textX = isTouchLayout ? Math.max(120, (width - 118) / 2) : width / 2;
  const maxWidth = isTouchLayout ? Math.max(180, width - 144) : width - 40;
  ctx.fillText(text, textX, height - 22, maxWidth);
  ctx.restore();
}

function loop(now) {
  const delta = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
window.visualViewport?.addEventListener("scroll", resize);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  moveTarget(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.buttons === 1 || event.pointerType === "touch") moveTarget(event);
});
pickButton.addEventListener("pointerdown", startPicking);
pickButton.addEventListener("pointerup", stopPicking);
pickButton.addEventListener("pointercancel", stopPicking);
musicToggle.addEventListener("pointerdown", toggleMusic);
startGameButton?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dismissSplash();
  unlockMobileAudio();
  startBackgroundMusic();
});
window.addEventListener("blur", () => stopPicking());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPicking();
});
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.code !== "Enter") return;

  event.preventDefault();
  if (event.code === "Enter") {
    dismissSplash();
    unlockMobileAudio();
    startBackgroundMusic();
    return;
  }

  if (isSpaceDown) return;

  isSpaceDown = true;
  startPicking();
});
window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;

  event.preventDefault();
  isSpaceDown = false;
  stopPicking();
});

resize();
setup();
requestAnimationFrame(loop);
