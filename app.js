// Default reassurance messages
const DEFAULT_MESSAGES = [
"Kaikki hyvin!! Sun ei tarvii tehä nyt yhtään mitään!",
"NOA nukkuu omassa sängyssä eikä tarvitse tulla herätetyksi!",
"NYT ON YÖ! Silloin nukutaan!",
"Mitään ei ole unohtunut!",
"MENE TAKASIN NUKKUMAAN LOL!",

];

let messages = [...DEFAULT_MESSAGES];
let currentMessageIndex = 0;

// Audio variables
let audioCtx = null;
let noiseNode = null;
let filterNode = null;
let gainNode = null;
let isAudioPlaying = false;

// Screen Wake Lock variable
let wakeLock = null;

// PWA Install prompt reference
let deferredPrompt = null;

// DOM Elements
const mainMessageEl = document.getElementById("mainMessage");
const subMessageEl = document.getElementById("subMessage");
const contentAreaEl = document.getElementById("contentArea");
const soundBtn = document.getElementById("soundBtn");
const soundOffIcon = document.querySelector(".sound-off-icon");
const soundOnIcon = document.querySelector(".sound-on-icon");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const messagesInput = document.getElementById("messagesInput");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const breathingCircle = document.getElementById("breathingCircle");
const ambientGlow = document.getElementById("ambientGlow");
const batteryWarningModal = document.getElementById("batteryWarningModal");
const batteryWarningOkBtn = document.getElementById("batteryWarningOkBtn");
const installSection = document.getElementById("installSection");
const installBtn = document.getElementById("installBtn");
const iosInstallSection = document.getElementById("iosInstallSection");
const clockEl = document.getElementById("clock");

// Initialize application
function init() {
  // Load messages from localStorage if available
  const storedMessages = localStorage.getItem("night_calm_messages");
  if (storedMessages) {
    try {
      messages = JSON.parse(storedMessages);
      if (!Array.isArray(messages) || messages.length === 0) {
        messages = [...DEFAULT_MESSAGES];
      }
    } catch (e) {
      messages = [...DEFAULT_MESSAGES];
    }
  }

  // Display initial message
  displayMessage(0);

  // Setup Event Listeners
  contentAreaEl.addEventListener("click", nextMessage);
  soundBtn.addEventListener("click", toggleAudio);
  settingsBtn.addEventListener("click", openSettings);
  closeModalBtn.addEventListener("click", closeSettings);
  saveBtn.addEventListener("click", saveSettings);
  resetBtn.addEventListener("click", resetToDefaults);
  batteryWarningOkBtn.addEventListener("click", () => {
    batteryWarningModal.classList.remove("open");
  });

  // Register Service Worker for PWA offline support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => {
        console.log("Service Worker registered", reg);
        
        // Listen for updates and auto-reload to load fresh code
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              console.log("New version detected, auto-reloading...");
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => console.warn("Service Worker registration failed", err));
  }

  // Setup battery monitoring
  initBatteryMonitoring();

  // Prevent double-tap zoom programmatically on iOS Safari
  let lastTouchTime = 0;
  document.addEventListener("touchstart", (e) => {
    const now = new Date().getTime();
    if (now - lastTouchTime <= 300) {
      e.preventDefault();
    }
    lastTouchTime = now;
  }, { passive: false });

  // Prevent pinch-to-zoom programmatically
  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  });

  // Initialize the clock and set up interval
  updateClock();
  setInterval(updateClock, 1000);

  // Setup PWA install promotion button trigger
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Show the install section inside the settings panel
    if (installSection) {
      installSection.style.display = "block";
    }
  });

  // Handle install button click
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again
      deferredPrompt = null;
      // Hide the install section
      if (installSection) {
        installSection.style.display = "none";
      }
    });
  }

  // Handle detection and display of iOS PWA installation instructions
  detectIosInstallPromotion();

  // Close modal when clicking outside of it
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });

  // Attempt to acquire wake lock on user interaction
  document.addEventListener("click", requestWakeLock);
  
  // Re-acquire wake lock when app gains focus again
  document.addEventListener("visibilitychange", async () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
      await requestWakeLock();
    }
  });
}

// Display message with smooth fade transition
function displayMessage(index) {
  mainMessageEl.classList.remove("visible");
  
  setTimeout(() => {
    mainMessageEl.textContent = messages[index];
    mainMessageEl.classList.add("visible");
    
    // Set breathing circle color or glow based on the message progression
    // To give a subtle variation
    const intensity = 0.08 + (index * 0.015);
    breathingCircle.style.boxShadow = `0 0 80px rgba(255, 167, 38, ${intensity})`;
    ambientGlow.style.background = `radial-gradient(circle at 50% 50%, rgba(255, 167, 38, ${intensity * 0.6}) 0%, rgba(0, 0, 0, 0) 70%)`;

    // Visual cue for the subtitle
    if (index === 0) {
      subMessageEl.textContent = "Napauta ruutua nähdäksesi lisää.";
      subMessageEl.style.opacity = "0.3";
    } else if (index === messages.length - 1) {
      subMessageEl.textContent = "Voit sulkea silmäsi nyt.";
      subMessageEl.style.opacity = "0.4";
    } else {
      subMessageEl.textContent = `Napauta uudestaan (${index + 1}/${messages.length})`;
      subMessageEl.style.opacity = "0.2";
    }
  }, 300);
}

// Transition to the next message and request fullscreen on mobile
function nextMessage() {
  // Request native browser fullscreen on user interaction
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      // Browser didn't allow fullscreen, which is common if it is desktop or blocked, ignore.
    });
  }

  currentMessageIndex = (currentMessageIndex + 1) % messages.length;
  displayMessage(currentMessageIndex);
}

// Request Screen Wake Lock (keep screen from dimming/sleeping)
async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (err) {
      console.warn(`Wake Lock request failed: ${err.message}`);
    }
  }
}

// Audio Synthesis: Brown Noise Generator (soothing deep low frequency rumble)
function createBrownNoise() {
  const bufferSize = 10 * audioCtx.sampleRate; // 10 seconds of noise
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    // Brown noise formula (integrator filter)
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5; // Compensate for volume loss
  }
  
  const bufferSource = audioCtx.createBufferSource();
  bufferSource.buffer = noiseBuffer;
  bufferSource.loop = true;
  
  return bufferSource;
}

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create noise source
  noiseNode = createBrownNoise();
  
  // Create a lowpass filter to muffle high frequencies and make it a deep, soothing rumble
  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(140, audioCtx.currentTime); // very low cutoff for deep hum
  filterNode.Q.setValueAtTime(1, audioCtx.currentTime);

  // Create gain node for smooth volume control
  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime); // start silent

  // Connect graph
  noiseNode.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);
}

function toggleAudio() {
  if (!audioCtx) {
    initAudio();
  }

  if (isAudioPlaying) {
    // Fade out volume slowly before stopping
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    
    setTimeout(() => {
      if (isAudioPlaying === false) { // double check state
        noiseNode.stop();
        noiseNode = null;
        isAudioPlaying = false;
        updateAudioUI(false);
      }
    }, 850);
    
    isAudioPlaying = false;
  } else {
    // Start audio context if suspended (browser security)
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    
    // If noise node was destroyed on stop, recreate it
    if (!noiseNode) {
      noiseNode = createBrownNoise();
      noiseNode.connect(filterNode);
    }
    
    noiseNode.start(0);
    
    // Fade in volume slowly
    gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 1.5); // Warm, gentle hum level
    
    isAudioPlaying = true;
    updateAudioUI(true);
  }
}

function updateAudioUI(isPlaying) {
  if (isPlaying) {
    soundOffIcon.classList.add("hidden");
    soundOnIcon.classList.remove("hidden");
    soundBtn.classList.add("active");
  } else {
    soundOffIcon.classList.remove("hidden");
    soundOnIcon.classList.add("hidden");
    soundBtn.classList.remove("active");
  }
}

// Settings Modal Controls
function openSettings() {
  messagesInput.value = messages.join("\n");
  settingsModal.classList.add("open");
}

function closeSettings() {
  settingsModal.classList.remove("open");
}

function saveSettings() {
  const text = messagesInput.value;
  // Split by newlines, trim, and filter out empty lines
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length > 0) {
    messages = lines;
    localStorage.setItem("night_calm_messages", JSON.stringify(messages));
    currentMessageIndex = 0;
    displayMessage(0);
    closeSettings();
  } else {
    alert("Syötä vähintään yksi viesti.");
  }
}

function resetToDefaults() {
  if (confirm("Haluatko palauttaa oletusviestit?")) {
    messages = [...DEFAULT_MESSAGES];
    localStorage.setItem("night_calm_messages", JSON.stringify(messages));
    messagesInput.value = messages.join("\n");
    currentMessageIndex = 0;
    displayMessage(0);
    closeSettings();
  }
}

// Battery Status and Release Wake Lock
let isLowBatteryWarningActive = false;

function initBatteryMonitoring() {
  if ("getBattery" in navigator) {
    navigator.getBattery().then((battery) => {
      // Check initial state
      checkBatteryStatus(battery);
      
      // Listen for changes
      battery.addEventListener("levelchange", () => checkBatteryStatus(battery));
      battery.addEventListener("chargingchange", () => checkBatteryStatus(battery));
    });
  }
}

async function checkBatteryStatus(battery) {
  const isLow = battery.level < 0.15;
  const isCharging = battery.charging;
  
  if (isLow && !isCharging) {
    if (!isLowBatteryWarningActive) {
      isLowBatteryWarningActive = true;
      
      // 1. Release wake lock to let phone sleep
      await releaseWakeLock();
      
      // 2. Stop audio immediately to save battery
      stopAudioImmediately();
      
      // 3. Show peaceful warning modal
      batteryWarningModal.classList.add("open");
    }
  } else {
    // Battery is charging or level is high enough
    if (isLowBatteryWarningActive) {
      isLowBatteryWarningActive = false;
      batteryWarningModal.classList.remove("open");
      
      // Re-acquire wake lock if screen is clicked or visible
      if (document.visibilityState === "visible") {
        await requestWakeLock();
      }
    }
  }
}

function stopAudioImmediately() {
  if (audioCtx && isAudioPlaying) {
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
    noiseNode.stop();
    noiseNode = null;
    isAudioPlaying = false;
    updateAudioUI(false);
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      console.warn(`Wake lock release failed: ${err.message}`);
    }
  }
}

// Update digital clock display
function updateClock() {
  if (!clockEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  clockEl.textContent = `${hours}:${minutes}`;
}

// Detect iOS devices in standard browser (non-standalone mode)
function detectIosInstallPromotion() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  
  if (isIos && !isStandalone) {
    if (iosInstallSection) {
      iosInstallSection.style.display = "block";
    }
  }
}

// Run initializer
document.addEventListener("DOMContentLoaded", init);
