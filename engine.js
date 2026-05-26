'use strict';

// ── Global Debug Reporter ────────────────────────────────────
window.onerror = function (msg, url, line) {
  const errDiv = document.createElement('div');
  errDiv.style = "position:fixed; top:0; left:0; width:100%; background:red; color:white; z-index:9999; padding:10px; font-family:monospace; font-size:12px;";
  errDiv.textContent = `❌ Script Error: ${msg} at line ${line}`;
  document.body.appendChild(errDiv);
};


const SETTINGS_VERSION = 2;

const defaultState = {
  img1: null,      // ImageBitmap – portrait / base layer
  img2: null,      // ImageBitmap – texture / overlay layer
  blendMode: 'screen',
  opacity: 0.65,
  contrast: 1.10,
  brightness: 1.00,
  sepia: 0.30,
  grain: 0.20,
  leak: 0.15,
  useMask: false,
  highRes: false,
  overlayX: 0,
  overlayY: 0,
  overlayScale: 1,
  halation: 0.10,
  sharpness: 0.0,
  aiMask: null,      // { data: Float32Array, width, height } from MediaPipe
};

let state = { ...defaultState };

// Live-update: track whether an image has been generated and debounce re-renders
let _hasGenerated = false;
let _liveTimer = null;

/**
 * Re-render the result with current slider/control values.
 * Debounced to avoid flooding the Web Worker while dragging.
 */
function liveUpdate(delay = 220) {
  if (!_hasGenerated || !state.img1 || !state.img2) return;
  clearTimeout(_liveTimer);
  _liveTimer = setTimeout(async () => {
    try {
      const resultUrl = await processImages();
      DOM.resultImg.src = resultUrl;
      window._lastResultUrl = resultUrl;
    } catch (err) {
      console.warn('Live update failed:', err);
    }
  }, delay);
}

try {
  const saved = localStorage.getItem('darkroomState');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed._version === SETTINGS_VERSION) {
      state = { ...state, ...parsed, img1: null, img2: null, overlayX: 0, overlayY: 0, overlayScale: 1 };
    }
    // Version mismatch: discard stale settings and keep defaults
  }
} catch (e) { }

function saveState() {
  const toSave = { ...state, _version: SETTINGS_VERSION };
  delete toSave.img1;
  delete toSave.img2;
  delete toSave.aiMask;
  localStorage.setItem('darkroomState', JSON.stringify(toSave));
}

const PRESETS = {
  classic: { blendMode: 'screen',      opacity: 0.65, contrast: 1.10, brightness: 1.00, sepia: 0.30, grain: 0.20, leak: 0.15, halation: 0.10, sharpness: 0.00 },
  forest:  { blendMode: 'overlay',     opacity: 0.72, contrast: 1.20, brightness: 0.95, sepia: 0.05, grain: 0.15, leak: 0.08, halation: 0.06, sharpness: 0.15 },
  ghost:   { blendMode: 'lighten',     opacity: 0.55, contrast: 0.95, brightness: 1.10, sepia: 0.00, grain: 0.10, leak: 0.25, halation: 0.20, sharpness: 0.00 },
  noir:    { blendMode: 'multiply',    opacity: 0.80, contrast: 1.35, brightness: 0.85, sepia: 0.60, grain: 0.35, leak: 0.05, halation: 0.04, sharpness: 0.25 },
  golden:  { blendMode: 'soft-light',  opacity: 0.70, contrast: 1.15, brightness: 1.05, sepia: 0.50, grain: 0.12, leak: 0.20, halation: 0.15, sharpness: 0.10 },
  cosmic:  { blendMode: 'color-dodge', opacity: 0.40, contrast: 1.20, brightness: 0.88, sepia: 0.00, grain: 0.08, leak: 0.32, halation: 0.30, sharpness: 0.05 },
  dusk:    { blendMode: 'difference',  opacity: 0.55, contrast: 1.05, brightness: 1.00, sepia: 0.15, grain: 0.18, leak: 0.20, halation: 0.14, sharpness: 0.00 },
};


const DOM = {
  // Upload zones
  zone1: document.getElementById('zone1'),
  zone2: document.getElementById('zone2'),
  file1: document.getElementById('file1'),
  file2: document.getElementById('file2'),
  prev1: document.getElementById('prev1'),
  prev2: document.getElementById('prev2'),
  ph1: document.getElementById('ph1'),
  ph2: document.getElementById('ph2'),

  // Actions
  generateBtn: document.getElementById('generateBtn'),
  maskToggle: document.getElementById('maskToggle'),
  highResToggle: document.getElementById('highResToggle'),
  aiMaskBadge: document.getElementById('aiMaskBadge'),

  // Status
  processing: document.getElementById('processing'),
  errorMsg: document.getElementById('errorMsg'),

  // Output
  outputSec: document.getElementById('outputSection'),
  resultImg: document.getElementById('resultImg'),
  beforeImg: document.getElementById('beforeImg'),
  compareWrap: document.getElementById('compareWrap'),
  beforeWrap: document.getElementById('beforeWrap'),
  handle: document.getElementById('handle'),

  // Sliders (input elements)
  sOpacity: document.getElementById('sOpacity'),
  sContrast: document.getElementById('sContrast'),
  sBrightness: document.getElementById('sBrightness'),
  sSepia: document.getElementById('sSepia'),
  sGrain: document.getElementById('sGrain'),
  sLeak: document.getElementById('sLeak'),

  // Slider value labels
  vOpacity: document.getElementById('vOpacity'),
  vContrast: document.getElementById('vContrast'),
  vBrightness: document.getElementById('vBrightness'),
  vSepia: document.getElementById('vSepia'),
  vGrain: document.getElementById('vGrain'),
  vLeak: document.getElementById('vLeak'),

  // QR Modal elements (Shared)
  qrModal: document.getElementById('qrModal'),
  qrClose: document.getElementById('qrClose'),
  qrTitle: document.getElementById('qrTitle'),
  qrHint: document.getElementById('qrHint'),
  qrNote: document.getElementById('qrNote'),
  qrContainer: document.getElementById('qrContainer'),
  sendPhoneBtn: document.getElementById('sendPhoneBtn'),
  apiKeyForm: document.getElementById('apiKeyForm'),
  imgbbKeyInput: document.getElementById('imgbbKeyInput'),
  apiKeySaveBtn: document.getElementById('apiKeySaveBtn'),

  // Slot type warnings
  warn1: document.getElementById('warn1'),
  warn2: document.getElementById('warn2'),

  // New effect sliders
  sHalation:  document.getElementById('sHalation'),
  vHalation:  document.getElementById('vHalation'),
  sSharpness: document.getElementById('sSharpness'),
  vSharpness: document.getElementById('vSharpness'),

  // Receive Modal elements
  receivePhoneBtn: document.getElementById('receivePhoneBtn'),
  receiveModal: document.getElementById('receiveModal'),
  receiveClose: document.getElementById('receiveClose'),
  receiveQrContainer: document.getElementById('receiveQrContainer'),
  ablyKeyForm: document.getElementById('ablyKeyForm'),
  ablyKeyInput: document.getElementById('ablyKeyInput'),
  ablyKeySaveBtn: document.getElementById('ablyKeySaveBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
};


/** Clamp a value to [lo, hi] (default 0–255 for pixel math). */
function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Fast, MediaPipe-free portrait detector.
 * Downsamples the bitmap to 80×80 and counts pixels that fall within
 * the skin-tone hue/saturation range. Returns a ratio 0–1.
 */
function getSkinRatio(bmp) {
  const S = 80;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  cvs.getContext('2d').drawImage(bmp, 0, 0, S, S);
  const d = cvs.getContext('2d').getImageData(0, 0, S, S).data;
  let skin = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const diff = r - Math.min(g, b);
    // Must be warm-toned (r dominant) but NOT too saturated (rules out sunsets/fire)
    // and blue channel must stay above 30% of red (rules out deep orange glow)
    if (r > 60 && g > 30 && b > 20 &&
      r > g && r > b &&
      diff > 10 && diff < 95 &&          // moderate warmth only
      Math.abs(r - g) < 60 &&            // not too orange
      b > r * 0.30 &&                    // excludes sunset/fire oranges
      r < 250) skin++;
  }
  return skin / (S * S);
}

/** Linear interpolation between a and b by factor t ∈ [0,1]. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ── Main-thread mask smoothing helpers ───────────────────────
// Used to feather the raw MediaPipe mask before storing it.

function _blurMaskH(src, w, h, r) {
  const dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = 0; x <= r && x < w; x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / (Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1);
      if (x - r >= 0)      sum -= src[row + x - r];
      if (x + r + 1 < w)   sum += src[row + x + r + 1];
    }
  }
  return dst;
}

function _blurMaskV(src, w, h, r) {
  const dst = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= r && y < h; y++) sum += src[y * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / (Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1);
      if (y - r >= 0)      sum -= src[(y - r) * w + x];
      if (y + r + 1 < h)   sum += src[(y + r + 1) * w + x];
    }
  }
  return dst;
}

// 3 separable H+V passes approximate a Gaussian blur
function smoothMaskGaussian(mask, w, h, r) {
  let m = _blurMaskH(mask, w, h, r); m = _blurMaskV(m, w, h, r);
  m = _blurMaskH(m, w, h, r);        m = _blurMaskV(m, w, h, r);
  m = _blurMaskH(m, w, h, r);        m = _blurMaskV(m, w, h, r);
  return m;
}


async function handleUpload(file, slot, bypass = false) {

  if (DOM.errorMsg) DOM.errorMsg.classList.remove('visible', 'is-error', 'is-success');

  try {
    const bmp = await createImageBitmap(file);

    if (slot === 1) {
      state.img1 = bmp;
      state.aiMask = null;
      if (DOM.prev1.src.startsWith('blob:')) URL.revokeObjectURL(DOM.prev1.src);
      DOM.prev1.src = URL.createObjectURL(file);
      DOM.prev1.style.display = 'block';
      DOM.ph1.style.display = 'none';
      DOM.zone1.classList.add('has-image');
      if (!bypass) {
        queueSeg(() => runAISegmentation(bmp));
      }
    } else {
      state.img2 = bmp;
      if (DOM.prev2.src.startsWith('blob:')) URL.revokeObjectURL(DOM.prev2.src);
      DOM.prev2.src = URL.createObjectURL(file);
      DOM.prev2.style.display = 'block';
      DOM.ph2.style.display = 'none';
      DOM.zone2.classList.add('has-image');
      clearSlotWarning(2);

      if (!bypass) {
        queueSeg(async () => {
          const isPortrait = await checkOverlayIsPortrait(bmp);
          if (isPortrait) {
            showSlotWarning(2, '⚠ TIP: Layer II works best with nature or texture backgrounds.');
          }
        });
      }
    }

    if (state.img1 && state.img2) {
      DOM.generateBtn.disabled = false;
    }
  } catch (err) {
    console.error('[Upload] Failed:', err);
    if (DOM.errorMsg) {
      DOM.errorMsg.textContent = '⚠ Could not load image — try a different file.';
      DOM.errorMsg.classList.add('visible', 'is-error');
      setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-error'), 5000);
    }
  }
}

/* ============================================================
   AI SUBJECT SEGMENTATION  (MediaPipe SelfieSegmentation)
   Runs automatically after the portrait is uploaded.
   Result stored in state.aiMask and used by the worker when
   the Subject Masking toggle is ON.
   ============================================================ */

let _segmentor = null;

// Serialise all MediaPipe calls — it shares internal state and breaks if called in parallel
let _segQueue = Promise.resolve();
function queueSeg(task) {
  return (_segQueue = _segQueue.then(task, task));
}

const _warnEls = [null, DOM.warn1, DOM.warn2];

function showSlotWarning(slot, msg) {
  const el = _warnEls[slot];
  if (!el) return;
  el.innerHTML = `<span>${msg}</span><button class="warn-dismiss" aria-label="Dismiss warning">✕</button>`;
  el.querySelector('.warn-dismiss').addEventListener('click', () => clearSlotWarning(slot));
  el.classList.add('visible');
}

function clearSlotWarning(slot) {
  const el = _warnEls[slot];
  if (!el) return;
  el.innerHTML = '';
  el.classList.remove('visible');
}

async function getSegmentor() {
  if (_segmentor) return _segmentor;
  return new Promise((resolve, reject) => {
    if (typeof SelfieSegmentation === 'undefined') {
      reject(new Error('MediaPipe not loaded'));
      return;
    }
    const seg = new SelfieSegmentation({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    seg.setOptions({ modelSelection: 1 }); // 1 = landscape/general (better quality)
    seg.onResults(() => { }); // will be overridden per-call
    seg.initialize().then(() => { _segmentor = seg; resolve(seg); }).catch(reject);
  });
}

async function runAISegmentation(bmp) {
  if (DOM.aiMaskBadge) {
    DOM.aiMaskBadge.textContent = '⟳ AI Analysing...';
    DOM.aiMaskBadge.className = 'ai-badge loading';
  }
  try {
    const seg = await getSegmentor();

    // Downsample to 640px max — MediaPipe runs at ~256px internally so
    // feeding a 4K image wastes memory without improving mask quality.
    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const tmpCvs = document.createElement('canvas');
    tmpCvs.width  = Math.round(bmp.width  * scale);
    tmpCvs.height = Math.round(bmp.height * scale);
    tmpCvs.getContext('2d').drawImage(bmp, 0, 0, tmpCvs.width, tmpCvs.height);

    await new Promise((resolve, reject) => {
      seg.onResults((results) => {
        try {
          const maskCvs = results.segmentationMask;
          const mw = maskCvs.width, mh = maskCvs.height;
          const ctx = maskCvs.getContext('2d');
          const raw = ctx.getImageData(0, 0, mw, mh).data;
          // Red channel = person confidence (0–255)
          const mask = new Float32Array(mw * mh);
          let personSum = 0;
          for (let i = 0; i < mw * mh; i++) {
            mask[i] = raw[i * 4] / 255;
            personSum += mask[i];
          }

          // Post-process: Gaussian feather (radius 3) then smoothstep to push
          // values toward 0/1, giving clean edges with natural feathering.
          const feathered = smoothMaskGaussian(mask, mw, mh, 3);
          for (let i = 0; i < feathered.length; i++) {
            const v = feathered[i];
            feathered[i] = v * v * (3 - 2 * v); // smoothstep
          }
          state.aiMask = { data: feathered, width: mw, height: mh };

          // Warn if Layer I doesn't look like a portrait
          const personRatio = personSum / (mw * mh);
          if (personRatio < 0.08) {
            showSlotWarning(1, '⚠ No subject detected — Layer I should be a portrait or person photo, not a background/texture.');
          } else {
            clearSlotWarning(1);
          }

          if (DOM.aiMaskBadge) {
            DOM.aiMaskBadge.textContent = '✦ AI Mask Ready';
            DOM.aiMaskBadge.className = 'ai-badge ready';
          }
          resolve();
        } catch (err) { reject(err); }
      });
      seg.send({ image: tmpCvs }).catch(reject);
    });
  } catch (err) {
    console.warn('AI segmentation unavailable:', err);
    if (DOM.aiMaskBadge) {
      DOM.aiMaskBadge.textContent = '◈ Luminance Mask';
      DOM.aiMaskBadge.className = 'ai-badge fallback';
    }
    // Fallback: use skin-tone heuristic when MediaPipe is unavailable
    const ratio = getSkinRatio(bmp);
    if (ratio < 0.06) {
      showSlotWarning(1, '⚠ No subject detected — Layer I should be a portrait or person photo, not a background/texture.');
    } else {
      clearSlotWarning(1);
    }
  }
}

/**
 * Run MediaPipe on the Layer II image and return true if it looks like a portrait.
 * Queued so it never runs in parallel with the slot-1 segmentation.
 */
async function checkOverlayIsPortrait(bmp) {
  try {
    const seg = await getSegmentor();
    const maxSide = 320;
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const tmpCvs = document.createElement('canvas');
    tmpCvs.width = Math.round(bmp.width * scale);
    tmpCvs.height = Math.round(bmp.height * scale);
    tmpCvs.getContext('2d').drawImage(bmp, 0, 0, tmpCvs.width, tmpCvs.height);

    const personRatio = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(0), 2000); // Fail-safe timeout
      seg.onResults((results) => {
        clearTimeout(timeout);
        try {
          const maskCvs = results.segmentationMask;
          const ctx = maskCvs.getContext('2d');
          const raw = ctx.getImageData(0, 0, maskCvs.width, maskCvs.height).data;
          let sum = 0;
          const n = maskCvs.width * maskCvs.height;
          for (let i = 0; i < n; i++) sum += raw[i * 4] / 255;
          resolve(sum / n);
        } catch { resolve(0); }
      });
      seg.send({ image: tmpCvs }).catch(() => { clearTimeout(timeout); resolve(0); });
    });

    if (personRatio > 0.40) return true;

    return getSkinRatio(bmp) > 0.35;
  } catch (err) {
    console.warn('Overlay type check unavailable:', err);
    return getSkinRatio(bmp) > 0.40;
  }
}

function bindUploadZone(zone, fileInput, slot) {
  // Click to open file picker — ignore clicks on the camera button (it handles itself)
  zone.addEventListener('click', (e) => {
    if (e.target.closest('.cam-trigger')) return;
    fileInput.click();
  });

  // File picker selection
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleUpload(e.target.files[0], slot);
  });

  // Drag-and-drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleUpload(file, slot);
  });
}

bindUploadZone(DOM.zone1, DOM.file1, 1);
bindUploadZone(DOM.zone2, DOM.file2, 2);


/**
 * Bind a range slider to a state key.
 * @param {HTMLInputElement} slider   - The <input type="range"> element
 * @param {HTMLElement}      valueEl  - The label showing the current value
 * @param {string}           stateKey - Key on the `state` object to update
 * @param {string}           suffix   - Unit suffix shown in the label (e.g. '%')
 * @param {number}           scale    - Divide slider value by this to get state value (100 for percentages)
 */
function sliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty('--fill', pct.toFixed(1) + '%');
}

function bindSlider(slider, valueEl, stateKey, suffix = '%', scale = 1) {
  slider.addEventListener('input', () => {
    const raw = parseFloat(slider.value);
    state[stateKey] = raw / scale;
    valueEl.textContent = raw + suffix;
    sliderFill(slider);
    saveState();
    liveUpdate(180);
  });
  sliderFill(slider);
}

bindSlider(DOM.sOpacity, DOM.vOpacity, 'opacity', '%', 100);
bindSlider(DOM.sContrast, DOM.vContrast, 'contrast', '%', 100);
bindSlider(DOM.sBrightness, DOM.vBrightness, 'brightness', '%', 100);
bindSlider(DOM.sSepia, DOM.vSepia, 'sepia', '%', 100);
bindSlider(DOM.sGrain, DOM.vGrain, 'grain', '%', 100);
bindSlider(DOM.sLeak,     DOM.vLeak,     'leak',     '%', 100);
bindSlider(DOM.sHalation, DOM.vHalation, 'halation', '%', 100);
bindSlider(DOM.sSharpness,DOM.vSharpness,'sharpness','%', 100);

// Blend mode selector buttons
document.querySelectorAll('.blend-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.blend-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.blendMode = btn.dataset.mode;
    saveState();
    liveUpdate(50);  // near-instant for button clicks
  });
});

// Preset buttons — apply a full parameter bundle at once
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const p = PRESETS[btn.dataset.preset];
    if (!p) return;

    // Push preset values into state
    Object.assign(state, {
      blendMode: p.blendMode,
      opacity: p.opacity,
      contrast: p.contrast,
      brightness: p.brightness,
      sepia: p.sepia,
      grain: p.grain,
      leak: p.leak,
      halation:  p.halation  ?? state.halation,
      sharpness: p.sharpness ?? state.sharpness,
    });

    // Sync slider positions and labels
    DOM.sOpacity.value    = Math.round(p.opacity    * 100); DOM.vOpacity.textContent    = DOM.sOpacity.value    + '%';
    DOM.sContrast.value   = Math.round(p.contrast   * 100); DOM.vContrast.textContent   = DOM.sContrast.value   + '%';
    DOM.sBrightness.value = Math.round(p.brightness * 100); DOM.vBrightness.textContent = DOM.sBrightness.value + '%';
    DOM.sSepia.value      = Math.round(p.sepia      * 100); DOM.vSepia.textContent      = DOM.sSepia.value      + '%';
    DOM.sGrain.value      = Math.round(p.grain      * 100); DOM.vGrain.textContent      = DOM.sGrain.value      + '%';
    DOM.sLeak.value       = Math.round(p.leak       * 100); DOM.vLeak.textContent       = DOM.sLeak.value       + '%';
    if (p.halation  !== undefined) { DOM.sHalation.value  = Math.round(p.halation  * 100); DOM.vHalation.textContent  = DOM.sHalation.value  + '%'; }
    if (p.sharpness !== undefined) { DOM.sSharpness.value = Math.round(p.sharpness * 100); DOM.vSharpness.textContent = DOM.sSharpness.value + '%'; }
    [DOM.sOpacity, DOM.sContrast, DOM.sBrightness, DOM.sSepia, DOM.sGrain, DOM.sLeak, DOM.sHalation, DOM.sSharpness].forEach(sliderFill);

    // Highlight the matching blend button
    document.querySelectorAll('.blend-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === p.blendMode);
    });
    saveState();
    liveUpdate(50);  // live re-render on preset change
  });
});

// High-Res export toggle
DOM.highResToggle.addEventListener('click', () => {
  state.highRes = !state.highRes;
  DOM.highResToggle.classList.toggle('on', state.highRes);
  DOM.highResToggle.setAttribute('aria-checked', String(state.highRes));
  saveState();
  liveUpdate(50);
});

// Subject masking toggle
DOM.maskToggle.addEventListener('click', () => {
  state.useMask = !state.useMask;
  DOM.maskToggle.classList.toggle('on', state.useMask);
  DOM.maskToggle.setAttribute('aria-checked', String(state.useMask));
  saveState();
  liveUpdate(50);
});




/* ============================================================
   INLINE WORKER SOURCE
   We embed the worker code as a Blob URL so the app works when
   opened as a local file:// URL (Chrome blocks file:// Workers).
   ============================================================ */
const WORKER_SOURCE = `
'use strict';

function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const blendFn = {
  'screen':      (a, b) => 1 - (1 - a) * (1 - b),
  'multiply':    (a, b) => a * b,
  'overlay':     (a, b) => a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
  'hard-light':  (a, b) => b < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
  'soft-light':  (a, b) => {
    if (b <= 0.5) return a - (1 - 2 * b) * a * (1 - a);
    const d = a <= 0.25 ? ((16 * a - 12) * a + 4) * a : Math.sqrt(a);
    return a + (2 * b - 1) * (d - a);
  },
  'lighten':     (a, b) => Math.max(a, b),
  'color-dodge': (a, b) => b >= 1 ? 1 : Math.min(1, a / (1 - b)),
  'color-burn':  (a, b) => b <= 0 ? 0 : Math.max(0, 1 - (1 - a) / b),
  'difference':  (a, b) => Math.abs(a - b),
  'exclusion':   (a, b) => a + b - 2 * a * b,
  'pin-light':   (a, b) => b < 0.5 ? Math.min(a, 2 * b) : Math.max(a, 2 * b - 1),
};

// Centered separable box blur (O(n) per pass) — used by buildLuminanceMask,
// addHalation, and addSharpen.
function boxBlurArr(src, w, h, radius) {
  const n = w * h;
  const tmp = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = 0; x <= radius && x < w; x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (Math.min(x + radius, w - 1) - Math.max(x - radius, 0) + 1);
      if (x - radius >= 0)    sum -= src[row + x - radius];
      if (x + radius + 1 < w) sum += src[row + x + radius + 1];
    }
  }
  const out = new Float32Array(n);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= radius && y < h; y++) sum += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (Math.min(y + radius, h - 1) - Math.max(y - radius, 0) + 1);
      if (y - radius >= 0)    sum -= tmp[(y - radius) * w + x];
      if (y + radius + 1 < h) sum += tmp[(y + radius + 1) * w + x];
    }
  }
  return out;
}

function buildLuminanceMask(pixelData, w, h) {
  const n = w * h;
  const luma = new Float32Array(n);
  let lumaSum = 0;
  for (let i = 0; i < n; i++) {
    const r = pixelData[i * 4]     / 255;
    const g = pixelData[i * 4 + 1] / 255;
    const b = pixelData[i * 4 + 2] / 255;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma[i];
  }
  // Adaptive threshold: anchored to image brightness so darker portraits
  // aren't over-masked. Softer sigmoid (k=10 vs original k=18).
  const meanLuma = lumaSum / n;
  const threshold = Math.max(0.48, Math.min(0.78, meanLuma * 0.9 + 0.15));
  const k = 10;

  const raw = new Float32Array(n);
  const cx = w * 0.5, cy = h * 0.5;
  const invMaxDistSq = 1 / (cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const sigmoid = 1 / (1 + Math.exp(k * (luma[i] - threshold)));
      // Center prior: down-weight mask confidence toward frame edges
      // (subjects are almost always near center; avoids false positives)
      const dx = x - cx;
      const centerWeight = 1 - 0.2 * (dx * dx + dy * dy) * invMaxDistSq;
      raw[i] = sigmoid * centerWeight;
    }
  }

  // 3 passes = Gaussian approximation (delegate to top-level for reuse)
  let mask = boxBlurArr(raw, w, h, 8);
  mask     = boxBlurArr(mask, w, h, 8);
  mask     = boxBlurArr(mask, w, h, 6);

  // Normalize to full [0, 1] range so feathering is consistent
  let mn = 1, mx = 0;
  for (let i = 0; i < n; i++) { mn = Math.min(mn, mask[i]); mx = Math.max(mx, mask[i]); }
  if (mx > mn + 0.01) {
    const range = mx - mn;
    for (let i = 0; i < n; i++) mask[i] = Math.max(0, Math.min(1, (mask[i] - mn) / range));
  }

  return mask;
}

function applySepiaPixel(r, g, b, amount) {
  const nr = Math.max(0, Math.min(255, r * (1 - 0.607 * amount) + g * 0.769 * amount + b * 0.189 * amount));
  const ng = Math.max(0, Math.min(255, r * 0.349 * amount       + g * (1 - 0.314 * amount) + b * 0.168 * amount));
  const nb = Math.max(0, Math.min(255, r * 0.272 * amount       + g * 0.534 * amount       + b * (1 - 0.869 * amount)));
  return [nr, ng, nb];
}

function addGrain(imageData, intensity) {
  if (intensity < 0.01) return;
  const d = imageData.data;
  const amp = intensity * 54;
  for (let i = 0; i < d.length; i += 4) {
    const u = Math.random(), v = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(Math.max(u, 1e-9))) * Math.cos(2 * Math.PI * v);
    // Luminance-aware: grain peaks at midtones (4L(1-L)), minimal at pure black/white —
    // matches real film emulsion where silver halide density is highest at mid-exposure.
    const luma = (d[i] * 0.2126 + d[i+1] * 0.7152 + d[i+2] * 0.0722) / 255;
    const curve = 0.15 + 0.85 * (4 * luma * (1 - luma));
    const n = gauss * amp * curve;
    // Slight per-channel imbalance simulates separate R/G/B emulsion grain layers
    d[i]     = clamp(d[i]     + n * 1.00);
    d[i + 1] = clamp(d[i + 1] + n * 0.93);
    d[i + 2] = clamp(d[i + 2] + n * 0.85);
  }
}

function addLightLeak(ctx, w, h, intensity) {
  if (intensity < 0.01) return;
  ctx.globalCompositeOperation = 'screen';

  // Primary warm leak — upper-right corner (orange/amber, hottest at centre)
  const g1 = ctx.createRadialGradient(w * 0.88, h * 0.05, 0, w * 0.88, h * 0.05, w * 0.72);
  g1.addColorStop(0,    'rgba(255, 122, 20, ' + (intensity * 0.62) + ')');
  g1.addColorStop(0.28, 'rgba(210, 55, 15, '  + (intensity * 0.26) + ')');
  g1.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  // Secondary cool counter-leak — lower-left (blue/indigo, film-canister bleed)
  if (intensity > 0.07) {
    const amt2 = (intensity - 0.07) * 0.65;
    const g2 = ctx.createRadialGradient(w * 0.06, h * 0.90, 0, w * 0.06, h * 0.90, w * 0.52);
    g2.addColorStop(0,    'rgba(22, 65, 210, '  + (amt2 * 0.42) + ')');
    g2.addColorStop(0.45, 'rgba(10, 32, 110, '  + (amt2 * 0.15) + ')');
    g2.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }

  // Thin horizontal edge-fog streak (only at higher intensities, near film sprocket)
  if (intensity > 0.38) {
    const streakAmt = (intensity - 0.38) * 0.45;
    const g3 = ctx.createLinearGradient(0, h * 0.06, 0, h * 0.15);
    g3.addColorStop(0,   'rgba(0,0,0,0)');
    g3.addColorStop(0.5, 'rgba(255, 185, 65, ' + streakAmt + ')');
    g3.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalCompositeOperation = 'source-over';
}

function addVignette(ctx, w, h) {
  // Elliptical vignette: slightly wider horizontally (natural lens characteristic).
  // Deep vignette carries a faint cool/blue tint — film cameras absorb differently at edges.
  ctx.globalCompositeOperation = 'source-over';
  const cx = w / 2, cy = h / 2;
  const innerR = Math.min(w, h) * 0.36;
  const outerR = Math.max(w, h) * 0.78;
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.62, 'rgba(0,0,0,0.16)');
  grad.addColorStop(1,    'rgba(2,6,20,0.60)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// Halation: warm glow around bright highlights — real darkroom phenomenon where
// light bleeds through the film base and scatters back from the anti-halation layer.
function addHalation(ctx, w, h, intensity) {
  if (intensity < 0.005) return;
  const srcData = ctx.getImageData(0, 0, w, h);
  const sd = srcData.data;
  const n  = w * h;

  // Extract warm highlight channel (activates above ~70% luminance)
  const glowR = new Float32Array(n);
  const glowG = new Float32Array(n);
  const glowB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = sd[i*4] / 255, g = sd[i*4+1] / 255, b = sd[i*4+2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const t = Math.max(0, (luma - 0.70) / 0.30);
    const tSq = t * t; // sharper activation at the brightest areas only
    glowR[i] = r * tSq;
    glowG[i] = g * tSq * 0.28; // warm tint: heavily cut green
    glowB[i] = b * tSq * 0.08; // warm tint: nearly eliminate blue
  }

  // Two-pass blur — soft glow radius is ~2.5% of the longer side
  const blurR = Math.max(2, Math.round(Math.max(w, h) * 0.025));
  const bR = boxBlurArr(boxBlurArr(glowR, w, h, blurR), w, h, blurR);
  const bG = boxBlurArr(boxBlurArr(glowG, w, h, blurR), w, h, blurR);
  const bB = boxBlurArr(boxBlurArr(glowB, w, h, blurR), w, h, blurR);

  // Screen-blend the warm halation glow back over the image
  const out = ctx.getImageData(0, 0, w, h);
  const od  = out.data;
  const scale = intensity * 3.8;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const hr = Math.min(1, bR[i] * scale);
    const hg = Math.min(1, bG[i] * scale);
    const hb = Math.min(1, bB[i] * scale);
    od[idx]   = Math.round(255 * (1 - (1 - od[idx]  /255) * (1 - hr)));
    od[idx+1] = Math.round(255 * (1 - (1 - od[idx+1]/255) * (1 - hg)));
    od[idx+2] = Math.round(255 * (1 - (1 - od[idx+2]/255) * (1 - hb)));
  }
  ctx.putImageData(out, 0, 0);
}

// Chromatic aberration: lateral colour fringe along contrast edges — simulates
// how a real lens separates wavelengths, most visible at frame edges.
function addChromaticAberration(ctx, w, h, intensity) {
  if (intensity < 0.003) return;
  const shift = Math.max(1, Math.round(intensity * w * 0.014));
  const src = ctx.getImageData(0, 0, w, h);
  const dst = new ImageData(w, h);
  const sd = src.data, dd = dst.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i   = (y * w + x) * 4;
      const xR  = Math.min(w - 1, x + shift); // red fringe: right
      const xB  = Math.max(0,     x - shift); // blue fringe: left
      dd[i]     = sd[(y * w + xR) * 4];       // red channel shifted right
      dd[i + 1] = sd[i + 1];                  // green: no shift
      dd[i + 2] = sd[(y * w + xB) * 4 + 2];  // blue channel shifted left
      dd[i + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// Unsharp mask: classic darkroom sharpening — enlarges local contrast at edges.
function addSharpen(ctx, w, h, strength) {
  if (strength < 0.01) return;
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const n = w * h;

  // Extract luminance
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    luma[i] = (d[i*4]*0.2126 + d[i*4+1]*0.7152 + d[i*4+2]*0.0722) / 255;
  }

  // Blur radius ~1% of width — fine-detail sharpening only
  const r = Math.max(1, Math.round(w * 0.010));
  const blurred = boxBlurArr(luma, w, h, r);

  // Unsharp mask: add scaled (luma − blurred_luma) to all channels
  const amt = strength * 1.4;
  for (let i = 0; i < n; i++) {
    const usm = Math.round((luma[i] - blurred[i]) * amt * 255);
    const idx = i * 4;
    d[idx]   = clamp(d[idx]   + usm);
    d[idx+1] = clamp(d[idx+1] + usm);
    d[idx+2] = clamp(d[idx+2] + usm);
  }
  ctx.putImageData(src, 0, 0);
}

function applyContrastBrightness(v, contrast, brightness) {
  let t = v / 255;
  // Brightness: soft exposure shift applied first
  t = Math.max(0, Math.min(1, t * brightness));
  // S-curve contrast: boosts midtone separation while protecting shadows/highlights
  // from crushing (unlike a hard linear pivot that clips at extreme settings).
  if (Math.abs(contrast - 1.0) > 0.005) {
    const k = (contrast - 1) * 1.5;
    t = Math.max(0, Math.min(1, t + k * t * (1 - t) * (2 * t - 1) * 2));
  }
  return clamp(Math.round(t * 255));
}

// Bilinear resize of a Float32Array mask from (srcW x srcH) to (dstW x dstH)
function resampleMask(src, srcW, srcH, dstW, dstH) {
  const dst    = new Float32Array(dstW * dstH);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio, sy = y * yRatio;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1), y1 = Math.min(y0 + 1, srcH - 1);
      const fx = sx - x0, fy = sy - y0;
      dst[y * dstW + x] =
        src[y0 * srcW + x0] * (1 - fx) * (1 - fy) +
        src[y0 * srcW + x1] *      fx  * (1 - fy) +
        src[y1 * srcW + x0] * (1 - fx) *      fy  +
        src[y1 * srcW + x1] *      fx  *      fy;
    }
  }
  return dst;
}

// Catch any runtime error inside the worker and send it back to the main thread
self.onerror = function(msg, src, line, col, err) {
  self.postMessage({ error: (err && err.message) || msg });
  return true; // suppress default browser error
};

self.onmessage = async function(e) {
  try {
  const { img1, img2, state, aiMaskData, aiMaskWidth, aiMaskHeight } = e.data;
  const { blendMode, opacity, contrast, brightness, sepia, grain, leak, halation, sharpness, useMask, highRes, overlayX, overlayY, overlayScale } = state;

  const MAX_SIDE = highRes ? Infinity : 900;
  const scale1 = Math.min(1, MAX_SIDE / Math.max(img1.width, img1.height));
  const W     = Math.round(img1.width  * scale1);
  const H     = Math.round(img1.height * scale1);

  const cvs1 = new OffscreenCanvas(W, H);
  const ctx1  = cvs1.getContext('2d');
  ctx1.drawImage(img1, 0, 0, W, H);
  const raw1 = ctx1.getImageData(0, 0, W, H);
  const d1   = raw1.data;
  for (let i = 0; i < d1.length; i += 4) {
    const luma  = Math.round(0.2126 * d1[i] + 0.7152 * d1[i + 1] + 0.0722 * d1[i + 2]);
    d1[i] = d1[i + 1] = d1[i + 2] = luma;
  }
  ctx1.putImageData(raw1, 0, 0);

  const cvs2 = new OffscreenCanvas(W, H);
  const ctx2  = cvs2.getContext('2d');
  // "cover" scale: make img2 fill the canvas completely regardless of its size
  const fitScale = Math.max(W / img2.width, H / img2.height);
  const oScale   = (overlayScale || 1) * fitScale;
  const oX = (overlayX || 0);
  const oY = (overlayY || 0);
  ctx2.translate(W / 2 + oX, H / 2 + oY);
  ctx2.scale(oScale, oScale);
  ctx2.translate(-img2.width / 2, -img2.height / 2);
  ctx2.drawImage(img2, 0, 0);
  ctx2.setTransform(1, 0, 0, 1, 0, 0);
  const raw2 = ctx2.getImageData(0, 0, W, H);
  const d2   = raw2.data;

  // Use AI mask (from MediaPipe) when available; fall back to luminance mask
  let mask = null;
  if (useMask) {
    if (aiMaskData && aiMaskData.length > 0) {
      mask = (aiMaskWidth === W && aiMaskHeight === H)
        ? aiMaskData
        : resampleMask(aiMaskData, aiMaskWidth, aiMaskHeight, W, H);
    } else {
      mask = buildLuminanceMask(d1, W, H);
    }
  }
  const fn = blendFn[blendMode] || blendFn['screen'];
  const output = new ImageData(W, H);
  const dOut   = output.data;

  for (let i = 0; i < W * H; i++) {
    const idx = i * 4;
    let r1 = d1[idx]     / 255,  g1 = d1[idx + 1] / 255,  b1 = d1[idx + 2] / 255;
    const r2 = d2[idx]     / 255,  g2 = d2[idx + 1] / 255,  b2 = d2[idx + 2] / 255;

    // Smoothstep the raw mask value so the transition zone is S-curved
    // rather than linear — gives natural, film-like edge feathering.
    const mRaw = mask ? mask[i] : 1;
    const mSmooth = mask ? mRaw * mRaw * (3 - 2 * mRaw) : 1;

    // Remove the background: fade Layer I to pure white where the mask is 0 (not human)
    if (mask) {
      const bgFade = 1.0 - mSmooth;
      r1 = lerp(r1, 1.0, bgFade);
      g1 = lerp(g1, 1.0, bgFade);
      b1 = lerp(b1, 1.0, bgFade);
    }

    const br = fn(r1, r2);
    const bg = fn(g1, g2);
    const bb = fn(b1, b2);

    // Alpha controls how much of the overlay (Layer II) is applied
    const alpha = mask ? lerp(opacity * 0.10, opacity, mSmooth) : opacity;
    
    let fr = lerp(r1, br, alpha) * 255;
    let fg = lerp(g1, bg, alpha) * 255;
    let fb = lerp(b1, bb, alpha) * 255;
    
    fr = applyContrastBrightness(fr, contrast, brightness);
    fg = applyContrastBrightness(fg, contrast, brightness);
    fb = applyContrastBrightness(fb, contrast, brightness);
    if (sepia > 0.01) { [fr, fg, fb] = applySepiaPixel(fr, fg, fb, sepia); }
    dOut[idx]     = clamp(Math.round(fr));
    dOut[idx + 1] = clamp(Math.round(fg));
    dOut[idx + 2] = clamp(Math.round(fb));
    dOut[idx + 3] = 255;
  }

  const outCvs = new OffscreenCanvas(W, H);
  const outCtx = outCvs.getContext('2d');
  outCtx.putImageData(output, 0, 0);
  if (grain > 0.01) {
    const grainData = outCtx.getImageData(0, 0, W, H);
    addGrain(grainData, grain);
    outCtx.putImageData(grainData, 0, 0);
  }
  addLightLeak(outCtx, W, H, leak);
  addVignette(outCtx, W, H);
  addSharpen(outCtx, W, H, sharpness);
  addHalation(outCtx, W, H, halation);
  addChromaticAberration(outCtx, W, H, grain * 0.35);

  // Final Pass: Restore background to pure white, overriding any vignette,
  // grain, or overlay bleed. Uses same smoothstep curve as the blend loop.
  if (mask) {
    const finalData = outCtx.getImageData(0, 0, W, H);
    const fd = finalData.data;
    for (let i = 0; i < W * H; i++) {
      const mRaw = mask[i];
      const mSmooth = mRaw * mRaw * (3 - 2 * mRaw);
      const isBg = 1.0 - mSmooth;
      if (isBg > 0.004) {
        const idx = i * 4;
        fd[idx]     = lerp(fd[idx], 255, isBg);
        fd[idx + 1] = lerp(fd[idx + 1], 255, isBg);
        fd[idx + 2] = lerp(fd[idx + 2], 255, isBg);
      }
    }
    outCtx.putImageData(finalData, 0, 0);
  }

  const blob = await outCvs.convertToBlob({ type: 'image/png' });
  self.postMessage({ blob, width: W, height: H });
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
`;

async function processImages() {
  return new Promise((resolve, reject) => {
    // Create a Blob URL from the inlined worker source so it works
    // even when the page is opened as a local file:// URL.
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);

    worker.onmessage = (e) => {
      URL.revokeObjectURL(blobUrl); // clean up
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        if (window._lastResultUrl) URL.revokeObjectURL(window._lastResultUrl);
        resolve(URL.createObjectURL(e.data.blob));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      URL.revokeObjectURL(blobUrl);
      reject(err);
      worker.terminate();
    };

    // Prepare AI mask buffer (transfer if available)
    const aiMaskCopy = (state.aiMask && state.useMask) ? new Float32Array(state.aiMask.data) : null;
    const aiMaskWidth = state.aiMask ? state.aiMask.width : 0;
    const aiMaskHeight = state.aiMask ? state.aiMask.height : 0;

    // Clone the ImageBitmaps so originals stay usable after transfer
    Promise.all([
      createImageBitmap(state.img1),
      createImageBitmap(state.img2),
    ]).then(([bmp1, bmp2]) => {
      const transferList = [bmp1, bmp2];
      if (aiMaskCopy) transferList.push(aiMaskCopy.buffer);
      worker.postMessage({
        img1: bmp1,
        img2: bmp2,
        aiMaskData: aiMaskCopy,
        aiMaskWidth,
        aiMaskHeight,
        state: {
          blendMode:    state.blendMode,
          opacity:      state.opacity,
          contrast:     state.contrast,
          brightness:   state.brightness,
          sepia:        state.sepia,
          grain:        state.grain,
          leak:         state.leak,
          halation:     state.halation  ?? 0.10,
          sharpness:    state.sharpness ?? 0.00,
          useMask:      state.useMask,
          highRes:      state.highRes,
          overlayX:     state.overlayX,
          overlayY:     state.overlayY,
          overlayScale: state.overlayScale,
        }
      }, transferList);
    }).catch(reject);
  });
}


/* ============================================================
   11. GENERATE BUTTON
   Triggers the pipeline, manages loading state, shows result.
   ============================================================ */

DOM.generateBtn.addEventListener('click', async () => {
  if (!state.img1 || !state.img2) return;

  // Show loading state
  DOM.outputSec.classList.remove('visible');
  DOM.errorMsg.classList.remove('visible', 'is-error', 'is-success');
  DOM.processing.classList.add('visible');
  DOM.generateBtn.disabled = true;

  try {
    await new Promise(r => setTimeout(r, 120)); // Let animation tick
    const resultUrl = await processImages();

    // Capture the original portrait for the "before" side
    const beforeCvs = new OffscreenCanvas(state.img1.width, state.img1.height);
    beforeCvs.getContext('2d').drawImage(state.img1, 0, 0);
    const beforeBlob = await beforeCvs.convertToBlob({ type: 'image/png' });

    DOM.resultImg.src = resultUrl;
    if (DOM.beforeImg.src.startsWith('blob:')) URL.revokeObjectURL(DOM.beforeImg.src);
    DOM.beforeImg.src = URL.createObjectURL(beforeBlob);
    DOM.beforeImg.style.width = '100%';

    // Keep reference for download
    window._lastResultUrl = resultUrl;
    _hasGenerated = true;

    // Match "before" image height to rendered "after" image
    DOM.resultImg.onload = () => {
      DOM.beforeImg.style.height = DOM.resultImg.offsetHeight + 'px';
    };

  } catch (err) {
    console.error(err);
    const msg = err && err.message ? err.message : String(err);
    DOM.errorMsg.textContent = '⚠ Processing failed: ' + msg;
    DOM.errorMsg.classList.add('visible', 'is-error');
  } finally {
    DOM.processing.classList.remove('visible');
    DOM.generateBtn.disabled = false;
    DOM.outputSec.classList.add('visible');
  }
});


/* ============================================================
   12. BEFORE / AFTER COMPARISON SLIDER
   Drag the golden handle left/right to reveal original vs result.
   ============================================================ */

let isDragging = false;

function setSliderPosition(clientX) {
  const rect = DOM.compareWrap.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const str = (pct * 100).toFixed(1) + '%';
  DOM.beforeWrap.style.width = str;
  DOM.handle.style.left = str;
}

// Mouse events
DOM.compareWrap.addEventListener('mousedown', e => { isDragging = true; setSliderPosition(e.clientX); });
window.addEventListener('mousemove', e => { if (isDragging) setSliderPosition(e.clientX); });
window.addEventListener('mouseup', () => isDragging = false);

// Touch events (mobile)
DOM.compareWrap.addEventListener('touchstart', e => { isDragging = true; setSliderPosition(e.touches[0].clientX); }, { passive: true });
window.addEventListener('touchmove', e => { if (isDragging) setSliderPosition(e.touches[0].clientX); }, { passive: true });
window.addEventListener('touchend', () => isDragging = false);


/* ============================================================
   13. DOWNLOAD
   Re-encodes the result blob in the chosen format (JPG/PNG/WEBP).
   ============================================================ */

function downloadResult(mimeType, extension) {
  if (!window._lastResultUrl) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Apply watermark if set
    applyWatermark(ctx, canvas.width, canvas.height);

    const quality = (mimeType === 'image/jpeg' || mimeType === 'image/webp') ? 0.92 : undefined;
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `double-exposure.${extension}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 100);
    }, mimeType, quality);
  };
  img.src = window._lastResultUrl;
}

document.querySelectorAll('.dl-btns .dl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const formats = { JPG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' };
    const label = btn.textContent.trim();
    if (formats[label]) {
      downloadResult(formats[label], label.toLowerCase());
    }
  });
});


/* ============================================================
   TEXTURE GALLERY
   Loads a built-in Unsplash texture into Layer II on click.
   ============================================================ */

const _UNSPLASH      = 'https://images.unsplash.com/';
const _FULL_PARAMS   = '?w=2000&auto=format&q=80';
const _THUMB_PARAMS  = '?w=600&h=800&fit=crop&auto=format&q=90';

let _textureFetchController = null;
const _textureCache = new Map();

async function loadBuiltinTexture(url, card) {
  if (_textureFetchController) _textureFetchController.abort();
  _textureFetchController = new AbortController();

  document.querySelectorAll('.tex-card').forEach(c => c.classList.remove('active', 'loading'));
  card.classList.add('loading');
  try {
    let blob = _textureCache.get(url);
    if (!blob) {
      const resp = await fetch(url, { signal: _textureFetchController.signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      blob = await resp.blob();
      _textureCache.set(url, blob);
    }
    await handleUpload(new File([blob], 'texture.jpg', { type: blob.type || 'image/jpeg' }), 2);
    card.classList.add('active');
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Texture load failed:', err);
    DOM.errorMsg.textContent = '⚠ Could not load texture — check your internet connection.';
    DOM.errorMsg.classList.add('visible', 'is-error');
    setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-error'), 4000);
  } finally {
    card.classList.remove('loading');
  }
}

document.querySelectorAll('.tex-card').forEach(card => {
  const id = card.dataset.id;
  card.querySelector('.tex-thumb').src = _UNSPLASH + id + _THUMB_PARAMS;
  card.addEventListener('click', () => loadBuiltinTexture(_UNSPLASH + id + _FULL_PARAMS, card));
});


/* ============================================================
   14. RESET
   Clears both image slots and resets the UI to initial state.
   ============================================================ */

document.querySelector('.reset-btn').addEventListener('click', () => {
  state.img1 = null;
  state.img2 = null;
  state.aiMask = null;

  // Clear previews
  [DOM.prev1, DOM.prev2].forEach(el => { el.style.display = 'none'; el.src = ''; });

  // Show placeholders
  [DOM.ph1, DOM.ph2].forEach(el => el.style.display = 'flex');

  // Remove image-loaded classes
  [DOM.zone1, DOM.zone2].forEach(el => el.classList.remove('has-image'));

  // Hide output and errors
  DOM.outputSec.classList.remove('visible');
  DOM.errorMsg.classList.remove('visible', 'is-error', 'is-success');

  // Disable generate button
  DOM.generateBtn.disabled = true;

  // Clear stored result
  window._lastResultUrl = null;
  _hasGenerated = false;
  clearTimeout(_liveTimer);

  // Clear AI badge and slot warnings
  if (DOM.aiMaskBadge) {
    DOM.aiMaskBadge.textContent = '';
    DOM.aiMaskBadge.className = 'ai-badge';
  }
  clearSlotWarning(1);
  clearSlotWarning(2);

  // Clear texture gallery selection
  document.querySelectorAll('.tex-card').forEach(c => c.classList.remove('active'));

  // Restore Classic preset
  document.querySelector('[data-preset="classic"]').click();
});


/* ============================================================
   15. PAN / ZOOM OVERLAY (Layer II drag to reposition, scroll to zoom)
   ============================================================ */

let isOverlayDragging = false;
let _startX = 0, _startY = 0;
let _initOX = 0, _initOY = 0;

function updateOverlayTransform() {
  if (!DOM.prev2) return;
  DOM.prev2.style.transform = `translate(${state.overlayX}px, ${state.overlayY}px) scale(${state.overlayScale})`;
  DOM.prev2.style.transformOrigin = 'center center';
}

DOM.zone2.addEventListener('mousedown', e => {
  if (!state.img2) return;
  if (e.target.closest('.zone-overlay')) return; // ignore Replace click
  isOverlayDragging = true;
  _startX = e.clientX;
  _startY = e.clientY;
  _initOX = state.overlayX;
  _initOY = state.overlayY;
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (!isOverlayDragging) return;
  state.overlayX = _initOX + (e.clientX - _startX);
  state.overlayY = _initOY + (e.clientY - _startY);
  updateOverlayTransform();
});

window.addEventListener('mouseup', () => { if (isOverlayDragging) liveUpdate(220); isOverlayDragging = false; });

DOM.zone2.addEventListener('wheel', e => {
  if (!state.img2) return;
  e.preventDefault();
  const speed = 0.05;
  state.overlayScale = e.deltaY < 0
    ? state.overlayScale + speed
    : Math.max(0.1, state.overlayScale - speed);
  updateOverlayTransform();
  liveUpdate(220);
}, { passive: false });


/* ============================================================
   16. INIT UI FROM SAVED STATE
   Syncs all controls to values restored from localStorage.
   ============================================================ */

function initUIFromState() {
  DOM.sOpacity.value    = Math.round(state.opacity    * 100); DOM.vOpacity.textContent    = DOM.sOpacity.value    + '%';
  DOM.sContrast.value   = Math.round(state.contrast   * 100); DOM.vContrast.textContent   = DOM.sContrast.value   + '%';
  DOM.sBrightness.value = Math.round(state.brightness * 100); DOM.vBrightness.textContent = DOM.sBrightness.value + '%';
  DOM.sSepia.value      = Math.round(state.sepia      * 100); DOM.vSepia.textContent      = DOM.sSepia.value      + '%';
  DOM.sGrain.value      = Math.round(state.grain      * 100); DOM.vGrain.textContent      = DOM.sGrain.value      + '%';
  DOM.sLeak.value       = Math.round(state.leak       * 100); DOM.vLeak.textContent       = DOM.sLeak.value       + '%';
  DOM.sHalation.value   = Math.round((state.halation  ?? 0.10) * 100); DOM.vHalation.textContent  = DOM.sHalation.value  + '%';
  DOM.sSharpness.value  = Math.round((state.sharpness ?? 0.00) * 100); DOM.vSharpness.textContent = DOM.sSharpness.value + '%';
  [DOM.sOpacity, DOM.sContrast, DOM.sBrightness, DOM.sSepia, DOM.sGrain, DOM.sLeak, DOM.sHalation, DOM.sSharpness].forEach(sliderFill);

  document.querySelectorAll('.blend-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.blendMode);
  });

  DOM.maskToggle.classList.toggle('on', state.useMask);
  DOM.maskToggle.setAttribute('aria-checked', String(state.useMask));
  DOM.highResToggle.classList.toggle('on', state.highRes);
  DOM.highResToggle.setAttribute('aria-checked', String(state.highRes));
}

initUIFromState();


/* ============================================================
   17. SEND TO PHONE — QR CODE + IMAGE HOSTING
   Uploads the result to imgbb (free), generates a QR code URL,
   and shows it in a modal so users can scan with their phone.
   ============================================================ */

// ── imgbb API key — stored in localStorage, never hardcoded ─
function getImgbbKey() { return localStorage.getItem('imgbbApiKey') || ''; }
function saveImgbbKey(k) { localStorage.setItem('imgbbApiKey', k.trim()); }

// Close modal
if (DOM.qrClose) {
  DOM.qrClose.addEventListener('click', () => DOM.qrModal.classList.remove('visible'));
}
if (DOM.qrModal) {
  DOM.qrModal.addEventListener('click', (e) => {
    if (e.target === DOM.qrModal) DOM.qrModal.classList.remove('visible');
  });
}
async function resultToBlob() {
  if (!window._lastResultUrl) throw new Error('No result to share');


  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load result image'));
    img.src = window._lastResultUrl;
  });

  const MAX_UPLOAD_SIDE = 800;
  const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);


  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  applyWatermark(ctx, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) reject(new Error('Image encoding failed'));
      else resolve(blob);
    }, 'image/jpeg', 0.85);
  });
}

function applyWatermark(ctx, w, h) {
  const text = document.getElementById('watermarkText')?.value?.trim();
  if (!text) return;
  const pad = w * 0.04;
  ctx.font = `600 ${Math.max(20, w * 0.035)}px "Playfair Display", serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, w - pad, h - pad);
}


/**
 * Upload blob image to imgbb and return the public view URL.
 */
async function uploadToImgbb(blob) {
  const form = new FormData();
  form.append('key', getImgbbKey());
  form.append('image', blob, 'double-exposure.jpg');
  form.append('name', 'double-exposure-' + Date.now());

  const resp = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });

  if (!resp.ok) throw new Error('Upload failed (' + resp.status + ')');
  const json = await resp.json();
  if (!json.success) throw new Error(json.error?.message || 'Upload error');
  return json.data.url; // direct image URL
}

/**
 * Render a QR code into the specified container.
 * Uses local library with a reliable API fallback if it fails.
 */
function generateQR(url, container, forceApi = false) {
  if (!container) return;
  container.innerHTML = '';

  try {
    if (forceApi) throw new Error('Forcing API');
    // Attempt local generation first
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#1a130d',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L,
    });
  } catch (err) {
    console.warn('[QR] Local QRCode failed, falling back to API:', err);
    container.innerHTML = '';

    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=1a130d&bgcolor=ffffff&margin=0&format=svg&data=${encodeURIComponent(url)}`;
    img.style.width = '220px';
    img.style.height = '220px';
    img.alt = 'QR Code';
    container.appendChild(img);
  }
}

/**
 * Try native Web Share API (works on mobile browsers).
 */
async function tryNativeShare() {
  if (!navigator.share || !navigator.canShare) return false;

  try {
    const resp = await fetch(window._lastResultUrl);
    const blob = await resp.blob();
    const file = new File([blob], 'double-exposure.jpg', { type: 'image/jpeg' });

    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Double Exposure — Darkroom',
        text: 'Check out my double exposure artwork!',
        files: [file],
      });
      return true;
    }
  } catch (err) {
    if (err.name === 'AbortError') return true; // user cancelled, still "handled"
    console.warn('Native share failed:', err);
  }
  return false;
}

// ── Upload helper shared by the button and key-save flows ───
async function runImgbbUpload() {
  const modal = DOM.qrModal;
  const body = modal.querySelector('.qr-body');
  DOM.qrContainer.style.display = 'none';
  DOM.qrNote.textContent = '';
  DOM.apiKeyForm.style.display = 'none';

  let spinner = body.querySelector('.qr-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.className = 'qr-spinner';
    body.insertBefore(spinner, body.firstChild);
  }
  spinner.style.display = 'block';
  DOM.qrHint.textContent = 'Uploading your artwork...';

  try {
    let blob;
    try {
      blob = await resultToBlob();
    } catch (e) {
      throw new Error('[Step 1 - Blob] ' + e.message);
    }


    let imageUrl;
    try {
      imageUrl = await uploadToImgbb(blob);
    } catch (e) {
      throw new Error('[Step 2 - Upload] ' + e.message);
    }



    try {
      generateQR(imageUrl, DOM.qrContainer);
    } catch (e) {
      throw new Error('[Step 3 - QR] ' + e.message);
    }

    spinner.style.display = 'none';
    DOM.qrContainer.style.display = 'flex';
    DOM.qrHint.innerHTML = 'Point your phone camera at this code<br>to download the image directly.';
    DOM.qrNote.textContent = 'Image hosted temporarily on imgbb.com';
  } catch (err) {
    console.error('[QR] Send to phone failed at step:', err);
    spinner.style.display = 'none';
    DOM.qrHint.innerHTML = '⚠ ' + (err.message || 'Upload failed').toUpperCase();
    DOM.qrNote.textContent = 'Check your connection and API key.';
  }
}

// ── Main Send to Phone handler ──────────────────────────────
if (DOM.sendPhoneBtn) {
  DOM.sendPhoneBtn.addEventListener('click', async () => {
    if (!window._lastResultUrl) return;

    // On mobile, try native share first (instant, no upload needed)
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      const shared = await tryNativeShare();
      if (shared) return;
    }

    DOM.qrModal.classList.add('visible');

    if (!getImgbbKey()) {
      const modal = DOM.qrModal;
      const body = modal.querySelector('.qr-body');
      let spinner = body.querySelector('.qr-spinner');
      if (spinner) spinner.style.display = 'none';
      DOM.qrContainer.style.display = 'none';
      DOM.qrNote.textContent = '';
      DOM.qrHint.innerHTML = 'Enter your imgbb API key to enable QR sharing.<br><small style="opacity:0.6">Get a free key at api.imgbb.com</small>';
      DOM.apiKeyForm.style.display = 'block';
      DOM.imgbbKeyInput.value = '';
      DOM.imgbbKeyInput.focus();
      return;
    }

    await runImgbbUpload();
  });

  DOM.apiKeySaveBtn.addEventListener('click', async () => {
    const k = DOM.imgbbKeyInput.value.trim();
    if (!k) { DOM.imgbbKeyInput.focus(); return; }
    saveImgbbKey(k);
    await runImgbbUpload();
  });

  DOM.imgbbKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') DOM.apiKeySaveBtn.click();
  });
}

/* ============================================================
   17. REMOTE RECEIVE (Ably Realtime)
   Allows users to upload from their phone directly to kiosk.
   ============================================================ */

// Build REMOTE_URL: if ?lanip= param is present (set by run_studio.bat so camera works on localhost)
// use that IP for the QR code so the phone can still reach remote.html over the LAN.
const _urlParams = new URLSearchParams(window.location.search);
const _lanIp = _urlParams.get('lanip');
const _baseUrl = _lanIp
  ? `${window.location.protocol}//${_lanIp}:${window.location.port || '8000'}`
  : window.location.origin;
const REMOTE_URL = _baseUrl + "/remote.html";
let _ably = null;
let _kioskId = sessionStorage.getItem('kioskId') || Math.random().toString(36).substring(2, 8).toUpperCase();
sessionStorage.setItem('kioskId', _kioskId);

const PHONE_TIMEOUT_MS = 2 * 60 * 1000;

let _lastPhoneActivity = null;
let _phoneConnected = false;
let _countdownInterval = null;
let _cmdChannel = null;
let _activePhoneId = null;

const _RS_CFG = {
  idle:         { dot: 'rs-idle',   text: 'No phone connected' },
  active:       { dot: 'rs-active', text: 'Phone connected · <span id="rs-countdown" class="rs-countdown">2:00</span>' },
  timeout:      { dot: 'rs-idle',   text: 'Phone inactive — session ended' },
  disconnected: { dot: 'rs-idle',   text: 'Phone disconnected' },
  error:        { dot: 'rs-idle',   text: 'Remote connection failed — reopen to retry' },
};

function startCountdown() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  const countdownEl = document.getElementById('rs-countdown');
  _countdownInterval = setInterval(() => {
    if (!_phoneConnected || _lastPhoneActivity === null) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      return;
    }
    const elapsed = Date.now() - _lastPhoneActivity;
    if (elapsed > PHONE_TIMEOUT_MS) {
      _phoneConnected = false;
      _activePhoneId = null;
      _lastPhoneActivity = null;
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      if (_cmdChannel) _cmdChannel.publish('kick', {});
      setRemoteStatus('timeout');
      return;
    }
    const remaining = Math.floor((PHONE_TIMEOUT_MS - elapsed) / 1000);
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, '0');
    if (countdownEl) countdownEl.textContent = `${m}:${s}`;
  }, 1000);
}

function setRemoteStatus(type) {
  const el = document.getElementById('remoteStatus');
  if (!el) return;
  if (type !== 'active' && _countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
  const s = _RS_CFG[type];
  if (!s) { el.innerHTML = ''; el.classList.remove('visible'); return; }
  el.innerHTML = `<span class="rs-dot ${s.dot}"></span><span>${s.text}</span>`;
  el.classList.add('visible');
  if (DOM.disconnectBtn) DOM.disconnectBtn.classList.toggle('visible', type === 'active');
}

function disconnectPhone() {
  if (_cmdChannel) _cmdChannel.publish('kick', {});
  _phoneConnected = false;
  _activePhoneId = null;
  _lastPhoneActivity = null;
  if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  setRemoteStatus('disconnected');
}

function getAblyKey() { return localStorage.getItem('ablyApiKey'); }
function saveAblyKey(k) { localStorage.setItem('ablyApiKey', k); }

async function initAbly(force = false) {
  const key = getAblyKey();
  if (!key) return;
  if (_ably && !force) return;
  
  if (force && _ably) {
    try { _ably.close(); } catch(e){}
    _ably = null;
    _phoneConnected = false;
    _activePhoneId = null;
    _lastPhoneActivity = null;
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
    _cmdChannel = null;
    setRemoteStatus(null);
  }

  try {
    if (typeof Ably === 'undefined') {
      throw new Error('Ably library is blocked or not loaded. Check your internet/CSP.');
    }


    if (DOM.errorMsg) {
      DOM.errorMsg.textContent = '🟡 Connecting to Remote Bridge...';
      DOM.errorMsg.classList.add('visible');
    }

    _ably = new Ably.Realtime({ key });
    const channel = _ably.channels.get(`kiosk-${_kioskId}`);
    _cmdChannel = _ably.channels.get(`kiosk-cmd-${_kioskId}`);

    channel.subscribe(async (msg) => {
      const incomingPhoneId = msg.data?.phoneId || null;

      if (msg.name !== 'disconnect') {
        // Reject a second device if one is already active
        if (_phoneConnected && incomingPhoneId && incomingPhoneId !== _activePhoneId) {
          const rejectCh = _ably.channels.get(`kiosk-cmd-${_kioskId}-${incomingPhoneId}`);
          rejectCh.publish('kick', { reason: 'session_taken' });
          return;
        }
        _lastPhoneActivity = Date.now();
        if (!_phoneConnected) {
          _activePhoneId = incomingPhoneId;
          _phoneConnected = true;
          setRemoteStatus('active');
          startCountdown();
        }
      }

      if (msg.name === 'heartbeat') return;

      if (msg.name === 'ping') {
        if (DOM.errorMsg) {
          DOM.errorMsg.textContent = '📡 Remote link confirmed — phone connected!';
          DOM.errorMsg.classList.add('visible', 'is-success');
          setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-success'), 4000);
        }
        return;
      }

      if (msg.name === 'disconnect') {
        _phoneConnected = false;
        _activePhoneId = null;
        _lastPhoneActivity = null;
        setRemoteStatus('disconnected');
        if (DOM.errorMsg) {
          DOM.errorMsg.textContent = '📵 Phone disconnected from remote link.';
          DOM.errorMsg.classList.add('visible');
          setTimeout(() => DOM.errorMsg.classList.remove('visible'), 4000);
        }
        return;
      }

      if (msg.name === 'upload') {
        const { base64, url, slot } = msg.data;
        if (!base64 && !url) return;

        try {
          const slotLabel = slot === 1 ? 'I' : 'II';
          if (DOM.errorMsg) {
            DOM.errorMsg.textContent = `📥 Receiving Layer ${slotLabel}...`;
            DOM.errorMsg.classList.add('visible');
          }
          let blob;
          if (url) {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Fetch failed (' + resp.status + ')');
            blob = await resp.blob();
          } else {
            const mimeMatch = base64.match(/^data:([^;]+)/);
            const mimeString = mimeMatch?.[1] ?? 'image/jpeg';
            const rawB64 = base64.replace(/^data:[^;]*;base64,/, '');
            const byteString = atob(rawB64);
            const ia = Uint8Array.from(byteString, c => c.charCodeAt(0));
            blob = new Blob([ia], { type: mimeString });
          }

          handleUpload(blob, slot, true);

          if (DOM.errorMsg) {
            DOM.errorMsg.textContent = `✅ Layer ${slotLabel} Received!`;
            DOM.errorMsg.classList.add('is-success');
            setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-success'), 3000);
          }
        } catch (e) {
          console.error('[Remote] Reception failed:', e);
          DOM.errorMsg.textContent = '⚠ Reception failed: ' + e.message;
          DOM.errorMsg.classList.add('visible', 'is-error');
          setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-error'), 4000);
        }
      }
    });

    _ably.connection.on('connected', () => {
      if (DOM.errorMsg) {
        DOM.errorMsg.textContent = '🟢 Remote Link Active';
        DOM.errorMsg.classList.add('visible', 'is-success');
        setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-success'), 2000);
      }
      setRemoteStatus('idle');
    });

    _ably.connection.on('disconnected', () => {
      if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
      _phoneConnected = false;
      _lastPhoneActivity = null;
      setRemoteStatus('idle');
    });
    _ably.connection.on('failed', () => {
      if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
      _phoneConnected = false;
      _lastPhoneActivity = null;
      setRemoteStatus('error');
    });

    DOM.ablyKeyForm.style.display = 'none';
  } catch (err) {
    console.error('[Remote] Ably init error:', err);
  }
}

if (getAblyKey()) {
  initAbly();
}

if (DOM.receivePhoneBtn) {
  DOM.receivePhoneBtn.addEventListener('click', () => {
    // Close any other open modals first
    if (DOM.qrModal) DOM.qrModal.classList.remove('visible');
    if (CAM.modal) closeCamera();

    // 1. Check Ably Key
    if (!getAblyKey()) {
      DOM.receiveModal.classList.add('visible');
      DOM.receiveQrContainer.style.display = 'none';
      DOM.ablyKeyForm.style.display = 'block';
      return;
    }

    // 2. Check ImgBB Key
    if (!getImgbbKey()) {
      if (DOM.errorMsg) {
        DOM.errorMsg.textContent = '⚠️ Please setup "Send to Phone" (ImgBB Key) first!';
        DOM.errorMsg.classList.add('visible');
        setTimeout(() => DOM.errorMsg.classList.remove('visible'), 5000);
      }
      // CLOSE this modal first so the other one isn't covered!
      DOM.receiveModal.classList.remove('visible');
      DOM.sendPhoneBtn.click();
      return;
    }

    DOM.receiveModal.classList.add('visible');
    initAbly(true);
    DOM.receiveQrContainer.style.display = 'block';
    DOM.ablyKeyForm.style.display = 'none';
    
    const pairingUrl = `${REMOTE_URL}?id=${_kioskId}&key=${btoa(getAblyKey())}&imgbb=${btoa(getImgbbKey() || '')}`;
    generateQR(pairingUrl, DOM.receiveQrContainer, true);

    const hint = document.getElementById('receiveHint');
    if (hint) {
      const isLocalWithoutLanIp = ['localhost', '127.0.0.1'].includes(window.location.hostname) && !_lanIp;
      hint.innerHTML = isLocalWithoutLanIp
        ? '⚠ Opened via <b>localhost</b> — phone cannot connect.<br>Re-open the kiosk using your computer\'s network IP<br>(e.g. <b>http://192.168.x.x:PORT</b>) then scan again.'
        : 'Scan this with your phone<br>to upload photos remotely.';
    }
  });

  DOM.receiveClose.addEventListener('click', () => DOM.receiveModal.classList.remove('visible'));

  // Close on background click
  DOM.receiveModal.addEventListener('click', (e) => {
    if (e.target === DOM.receiveModal) DOM.receiveModal.classList.remove('visible');
  });

  DOM.ablyKeySaveBtn.addEventListener('click', () => {
    const k = DOM.ablyKeyInput.value.trim();
    if (k) {
      saveAblyKey(k);
      initAbly();
      DOM.receivePhoneBtn.click();
    }
  });

  if (DOM.disconnectBtn) DOM.disconnectBtn.addEventListener('click', disconnectPhone);
}




/* ============================================================
   18. CAMERA CAPTURE
   Opens the device camera in a modal with live preview.
   Slot 1 defaults to front camera (selfie), slot 2 to rear.
   ============================================================ */

const CAM = {
  modal: document.getElementById('cameraModal'),
  title: document.getElementById('cameraTitle'),
  close: document.getElementById('cameraClose'),
  video: document.getElementById('cameraVideo'),
  canvas: document.getElementById('cameraCanvas'),
  capture: document.getElementById('captureBtn'),
  flip: document.getElementById('cameraFlip'),
  btn1: document.getElementById('cameraBtn1'),
  btn2: document.getElementById('cameraBtn2'),
  errOverlay: document.getElementById('camErrorOverlay'),
};

let _camStream = null;
let _camSlot = 1;
let _facingMode = 'user';
let _hasMultipleCameras = null;

function showCamModalError(msg) {
  CAM.errOverlay.textContent = msg;
  CAM.errOverlay.style.display = 'flex';
  CAM.capture.disabled = true;
  CAM.flip.style.display = 'none';
}

function clearCamModalError() {
  CAM.errOverlay.textContent = '';
  CAM.errOverlay.style.display = 'none';
  CAM.capture.disabled = false;
}

async function openCamera(slot) {
  _camSlot = slot;
  _facingMode = slot === 1 ? 'user' : 'environment';
  CAM.title.textContent = slot === 1 ? 'Take Selfie' : 'Take Photo';
  clearCamModalError();
  CAM.modal.classList.add('visible');  // Open modal immediately
  await startCamStream();
}

async function startCamStream() {
  stopCamStream();
  // Try with facingMode first; fall back for devices with a single unnamed camera
  const constraints = [
    { video: { facingMode: { ideal: _facingMode }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
    { video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
  ];
  let stream = null;
  let lastErr = null;
  for (const opts of constraints) {
    try { stream = await navigator.mediaDevices.getUserMedia(opts); break; }
    catch (e) { lastErr = e; }
  }
  if (!stream) {
    const reason = lastErr.name === 'NotAllowedError'
      ? 'Camera permission denied.\nPlease click "Allow" in the browser permission popup and try again.'
      : 'Could not open camera:\n' + lastErr.message;
    showCamModalError(reason);
    return;
  }
  _camStream = stream;
  CAM.video.srcObject = _camStream;
  CAM.video.classList.toggle('mirrored', _facingMode === 'user');

  if (_hasMultipleCameras === null) {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      _hasMultipleCameras = devices.filter(d => d.kind === 'videoinput').length > 1;
      CAM.flip.style.display = _hasMultipleCameras ? '' : 'none';
    }).catch(() => {});
  } else {
    CAM.flip.style.display = _hasMultipleCameras ? '' : 'none';
  }
}

function stopCamStream() {
  if (_camStream) {
    _camStream.getTracks().forEach(t => t.stop());
    _camStream = null;
  }
}

function closeCamera() {
  stopCamStream();
  clearCamModalError();
  if (_captureCountdownTimer) {
    clearInterval(_captureCountdownTimer);
    _captureCountdownTimer = null;
    _isCountingDown = false;
    const cdEl = document.getElementById('camCountdown');
    if (cdEl) cdEl.classList.remove('visible');
  }
  CAM.modal.classList.remove('visible');
}

let _isCountingDown = false;
let _captureCountdownTimer = null;

function capturePhoto() {
  if (_isCountingDown) return;
  const cdEl = document.getElementById('camCountdown');
  let count = 3;
  _isCountingDown = true;
  cdEl.textContent = count;
  cdEl.classList.add('visible');

  _captureCountdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      cdEl.textContent = count;
      cdEl.classList.remove('visible');
      void cdEl.offsetWidth; // trigger reflow to restart animation
      cdEl.classList.add('visible');
    } else {
      clearInterval(_captureCountdownTimer);
      _captureCountdownTimer = null;
      cdEl.classList.remove('visible');
      _isCountingDown = false;
      executeCapture();
    }
  }, 1000);
}

function executeCapture() {

  const v = CAM.video;
  const c = CAM.canvas;
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext('2d');
  if (_facingMode === 'user') {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, 0, 0);
  c.toBlob(async (blob) => {

    closeCamera();
    const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
    handleUpload(file, _camSlot);
  }, 'image/jpeg', 0.92);
}

// ── Event bindings ──────────────────────────────────────────
CAM.capture.addEventListener('click', capturePhoto);

CAM.flip.addEventListener('click', async () => {
  _facingMode = _facingMode === 'user' ? 'environment' : 'user';
  await startCamStream();
});

CAM.close.addEventListener('click', closeCamera);
CAM.modal.addEventListener('click', (e) => { if (e.target === CAM.modal) closeCamera(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (CAM.modal.classList.contains('visible')) closeCamera();
    if (DOM.qrModal.classList.contains('visible')) DOM.qrModal.classList.remove('visible');
    if (DOM.receiveModal.classList.contains('visible')) DOM.receiveModal.classList.remove('visible');
  }
});

function showCamError(msg) {
  DOM.errorMsg.textContent = '⚠ ' + msg;
  DOM.errorMsg.classList.add('visible', 'is-error');
  setTimeout(() => DOM.errorMsg.classList.remove('visible', 'is-error'), 7000);
}

function checkCameraAvailable() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const isInsecure = location.protocol !== 'https:' && location.hostname !== 'localhost';
    if (isInsecure) {
      showCamError('Camera requires localhost. Open http://localhost:8000 in your browser instead of the LAN IP.');
    } else {
      showCamError('Camera not supported on this browser. Please use Chrome or Edge.');
    }
    return false;
  }
  return true;
}

[[CAM.btn1, 1], [CAM.btn2, 2]].forEach(([btn, slot]) => {
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!checkCameraAvailable()) return;
    openCamera(slot);
  });
});


/* ============================================================
   19. KIOSK IDLE TIMER
   Auto-resets the app after 60s of inactivity.
   ============================================================ */

const IDLE = {
  overlay: document.getElementById('idleOverlay'),
  counter: document.getElementById('idleCounter'),
  btn: document.getElementById('idleCancelBtn')
};

let _idleTimer = null;
let _idleCountdownTimer = null;
let _idleCount = 10;

function resetIdleTimer() {
  // Clear any existing timers
  clearTimeout(_idleTimer);
  clearInterval(_idleCountdownTimer);

  // Hide overlay if it was visible
  if (IDLE.overlay.classList.contains('visible')) {
    IDLE.overlay.classList.remove('visible');
  }

  // Set new 60s idle wait
  _idleTimer = setTimeout(showIdleOverlay, 60000);
}

function showIdleOverlay() {
  // Don't interrupt if they are taking a photo or generating
  if (CAM.modal.classList.contains('visible') || DOM.processing.classList.contains('visible')) {
    resetIdleTimer();
    return;
  }

  _idleCount = 10;
  IDLE.counter.textContent = _idleCount;
  IDLE.overlay.classList.add('visible');

  _idleCountdownTimer = setInterval(() => {
    _idleCount--;
    IDLE.counter.textContent = _idleCount;
    if (_idleCount <= 0) {
      clearInterval(_idleCountdownTimer);
      IDLE.overlay.classList.remove('visible');
      document.querySelector('.reset-btn')?.click(); // trigger global reset
    }
  }, 1000);
}

// Bind activity events to reset timer
['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

if (IDLE.btn) IDLE.btn.addEventListener('click', resetIdleTimer);

// Start the timer immediately
resetIdleTimer();

