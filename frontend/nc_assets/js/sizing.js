import { API_BASE } from './config.js';

let _productId       = null;
let _selectedProfile = null;
let _cameraStream    = null;
let _poseDetector    = null;

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
// Called from product.js after product data loads
export function initSizingTool(productId, hasGarmentData) {
  _productId = productId;
  if (!hasGarmentData) return;

  const sizeArea = document.getElementById('size-selector')
    || document.querySelector('.size-options')
    || document.querySelector('.size-buttons')
    || document.querySelector('[data-section="sizes"]')
    || document.getElementById('sizes-section');

  if (!sizeArea) return;

  const wrapper = document.createElement('div');
  wrapper.style.marginTop = '12px';
  wrapper.innerHTML = `
    <button id="ai-size-btn" onclick="window.openSizingModal()"
            style="width:100%;padding:13px;background:transparent;
                   border:1px solid #C9A84C;color:#C9A84C;cursor:pointer;
                   font-size:11px;letter-spacing:0.14em;font-family:inherit;
                   border-radius:3px;display:flex;align-items:center;
                   justify-content:center;gap:8px;transition:all 0.25s">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.5">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      FIND MY CHILD'S PERFECT SIZE
    </button>
    <div style="text-align:center;font-size:11px;color:#888;margin-top:6px;letter-spacing:0.04em">
      AI-powered sizing — takes 30 seconds
    </div>
  `;

  sizeArea.parentNode.insertBefore(wrapper, sizeArea.nextSibling);

  const btn = document.getElementById('ai-size-btn');
  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#C9A84C';
    btn.style.color = '#fff';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.color = '#C9A84C';
  });
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
window.openSizingModal = function () {
  document.getElementById('sizing-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'sizing-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'AI size recommendation');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;
    display:flex;align-items:flex-end;justify-content:center;
    animation:szFadeIn 0.2s ease;
  `;

  modal.innerHTML = `
    <style>
      @keyframes szFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes szSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      .sizing-sheet {
        background:#fff;width:100%;max-width:560px;
        max-height:92vh;overflow-y:auto;
        border-radius:20px 20px 0 0;
        animation:szSlideUp 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      .sizing-input {
        width:100%;padding:10px 13px;border:0.5px solid #E8E5E0;
        border-radius:5px;font-size:14px;outline:none;font-family:inherit;
        transition:border-color 0.2s;box-sizing:border-box;
      }
      .sizing-input:focus { border-color:#C9A84C; }
      .sizing-btn-primary {
        width:100%;padding:14px;background:#C9A84C;color:#fff;
        border:none;cursor:pointer;font-size:12px;letter-spacing:0.12em;
        font-family:inherit;border-radius:4px;transition:background 0.2s;
      }
      .sizing-btn-primary:hover { background:#b8963d; }
      .sizing-btn-ghost {
        padding:12px 20px;background:transparent;
        border:0.5px solid #E8E5E0;cursor:pointer;
        font-size:12px;border-radius:4px;font-family:inherit;
        transition:background 0.15s;
      }
      .sizing-btn-ghost:hover { background:#F8F6F3; }
      .method-card {
        width:100%;padding:16px;border:0.5px solid #E8E5E0;border-radius:8px;
        background:#fff;cursor:pointer;text-align:left;margin-bottom:10px;
        transition:border-color 0.2s,box-shadow 0.2s;
        display:flex;align-items:center;gap:14px;
      }
      .method-card:hover { border-color:#C9A84C;box-shadow:0 2px 12px rgba(0,0,0,0.08); }
    </style>

    <div class="sizing-sheet" id="sizing-sheet">
      <div style="text-align:center;padding:10px 0 4px">
        <div style="width:40px;height:4px;background:#E8E5E0;border-radius:99px;display:inline-block"></div>
      </div>

      <div style="padding:4px 22px 18px;border-bottom:0.5px solid #E8E5E0;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:21px;
                     font-weight:500;margin-bottom:3px;color:#0A0A0A">
            Find Perfect Size
          </h2>
          <p style="font-size:12px;color:#888;margin:0">AI-powered for this specific garment</p>
        </div>
        <button onclick="window.closeSizingModal()" aria-label="Close"
                style="width:36px;height:36px;border-radius:50%;background:#F8F6F3;
                       border:none;cursor:pointer;font-size:20px;color:#555;
                       display:flex;align-items:center;justify-content:center">
          &#215;
        </button>
      </div>

      <!-- Step 1: Method selection -->
      <div id="sz-step-method" style="padding:20px 22px">
        <div id="sz-saved-profiles"></div>

        <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;
                    text-transform:uppercase;color:#888;margin-bottom:14px">
          CHOOSE HOW TO MEASURE
        </div>

        <button class="method-card" onclick="window.szShowCamera()">
          <div style="width:46px;height:46px;background:#F8F6F3;border-radius:8px;
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;flex-shrink:0">&#128247;</div>
          <div>
            <div style="font-size:14px;font-weight:500;color:#0A0A0A;margin-bottom:4px">
              Camera Scan
              <span style="font-size:10px;background:#EAF3DE;color:#1D9E75;
                           padding:2px 8px;border-radius:99px;font-weight:600;
                           margin-left:6px">RECOMMENDED</span>
            </div>
            <div style="font-size:12px;color:#888;line-height:1.5">
              Use camera to estimate measurements automatically in browser
            </div>
          </div>
        </button>

        <button class="method-card" onclick="window.szShowManual()">
          <div style="width:46px;height:46px;background:#F8F6F3;border-radius:8px;
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;flex-shrink:0">&#9998;</div>
          <div>
            <div style="font-size:14px;font-weight:500;color:#0A0A0A;margin-bottom:4px">
              Enter Measurements
            </div>
            <div style="font-size:12px;color:#888;line-height:1.5">
              Type height, chest and waist manually — fastest option
            </div>
          </div>
        </button>

        <div style="margin-top:14px;padding:12px 14px;background:#F8F6F3;
                    border-radius:6px;font-size:11px;color:#888;line-height:1.7">
          &#128274; <strong style="color:#555">Your privacy is protected.</strong>
          Camera images are processed entirely in your browser.
          No images are uploaded or stored.
          Only measurements are saved (with your permission).
        </div>
      </div>

      <!-- Step 2A: Camera -->
      <div id="sz-step-camera" style="display:none;padding:0 22px 22px">
        <div style="margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:500;margin-bottom:8px;color:#0A0A0A">
            Position Your Child
          </h3>
          <ul style="font-size:13px;color:#555;line-height:2.1;padding-left:20px;margin-bottom:14px">
            <li>Stand child straight, facing the camera</li>
            <li>Full body visible from head to toes</li>
            <li>Good lighting — no shadows behind</li>
            <li>Remove thick jackets or padded clothing</li>
            <li>Stand 2–3 metres from camera for best results</li>
          </ul>
        </div>

        <div style="background:#FAEEDA;border-radius:6px;padding:13px 14px;
                    margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">
          <input type="checkbox" id="sz-consent"
                 style="margin-top:3px;flex-shrink:0;accent-color:#C9A84C;width:16px;height:16px">
          <label for="sz-consent" style="font-size:12px;color:#555;cursor:pointer;line-height:1.6">
            I consent to camera access for measurement estimation.
            Images are <strong>processed locally on my device</strong>
            and are <strong>never uploaded or stored</strong>.
          </label>
        </div>

        <div style="position:relative;background:#0A0A0A;border-radius:10px;
                    overflow:hidden;aspect-ratio:3/4;margin-bottom:14px">
          <video id="sz-video" autoplay playsinline muted
                 style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <canvas id="sz-canvas"
                  style="display:none;position:absolute;inset:0;width:100%;height:100%"></canvas>
          <div style="position:absolute;inset:0;pointer-events:none;
                      display:flex;align-items:center;justify-content:center">
            <div style="border:2px dashed rgba(201,168,76,0.7);border-radius:50% 50% 30% 30%;
                        width:30%;height:75%;opacity:0.8"></div>
          </div>
          <div id="sz-camera-status"
               style="position:absolute;top:12px;left:50%;transform:translateX(-50%);
                      background:rgba(0,0,0,0.65);color:#fff;padding:5px 14px;
                      border-radius:99px;font-size:11px;white-space:nowrap;letter-spacing:0.04em">
            Tap consent to start camera
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button id="sz-capture-btn" onclick="window.szCapture()"
                  class="sizing-btn-primary" disabled style="opacity:0.5">
            CAPTURE &amp; ANALYSE
          </button>
          <button onclick="window.szShowMethod()" class="sizing-btn-ghost">BACK</button>
        </div>
      </div>

      <!-- Step 2B: Manual -->
      <div id="sz-step-manual" style="display:none;padding:0 22px 22px">
        <h3 style="font-size:15px;font-weight:500;margin-bottom:16px;color:#0A0A0A">
          Enter Measurements
        </h3>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Height (cm) *</label>
            <input id="sz-height" type="number" class="sizing-input"
                   placeholder="e.g. 116" inputmode="decimal">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Weight (kg)</label>
            <input id="sz-weight" type="number" class="sizing-input"
                   placeholder="e.g. 20" inputmode="decimal">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Chest circumference (cm) *</label>
            <input id="sz-chest" type="number" class="sizing-input"
                   placeholder="Full chest around body" inputmode="decimal">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Waist (cm)</label>
            <input id="sz-waist" type="number" class="sizing-input"
                   placeholder="Natural waist" inputmode="decimal">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Hip (cm)</label>
            <input id="sz-hip" type="number" class="sizing-input"
                   placeholder="Hip circumference" inputmode="decimal">
          </div>
          <div>
            <label style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                          color:#888;display:block;margin-bottom:5px">Shoulder width (cm)</label>
            <input id="sz-shoulder" type="number" class="sizing-input"
                   placeholder="Shoulder to shoulder" inputmode="decimal">
          </div>
        </div>

        <div style="font-size:11px;color:#888;margin-bottom:16px;line-height:1.7;
                    background:#F8F6F3;padding:10px 13px;border-radius:5px">
          &#128210; <strong>Tip:</strong> Chest = measure around fullest part of chest.
          Height = standing straight without shoes.
          Only height and chest are required.
        </div>

        <div id="sz-save-option" style="display:none;border:0.5px solid #E8E5E0;
             border-radius:6px;padding:14px;margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;
                        font-size:13px;font-weight:500;color:#0A0A0A">
            <input type="checkbox" id="sz-save-check"
                   style="accent-color:#C9A84C;width:16px;height:16px">
            Save as a child profile for next time
          </label>
          <div id="sz-save-fields"
               style="display:none;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
            <div>
              <label style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                            color:#888;display:block;margin-bottom:5px">Child's name</label>
              <input id="sz-child-name" type="text" class="sizing-input" placeholder="e.g. Aarav">
            </div>
            <div>
              <label style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                            color:#888;display:block;margin-bottom:5px">Date of birth</label>
              <input id="sz-child-dob" type="date" class="sizing-input">
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button onclick="window.szGetRecommendation()" class="sizing-btn-primary">
            GET MY RECOMMENDATION
          </button>
          <button onclick="window.szShowMethod()" class="sizing-btn-ghost">BACK</button>
        </div>
      </div>

      <!-- Step 3: Result -->
      <div id="sz-step-result" style="display:none;padding:0 22px 28px"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', e => {
    if (e.target === modal) window.closeSizingModal();
  });

  document.addEventListener('keydown', function escListener(e) {
    if (e.key === 'Escape') {
      window.closeSizingModal();
      document.removeEventListener('keydown', escListener);
    }
  });

  _loadSavedProfiles();

  setTimeout(() => {
    const consent = document.getElementById('sz-consent');
    if (consent) {
      consent.addEventListener('change', async () => {
        if (consent.checked) await _startCamera();
        else _stopCamera();
      });
    }
    const saveCheck  = document.getElementById('sz-save-check');
    const saveFields = document.getElementById('sz-save-fields');
    if (saveCheck && saveFields) {
      saveCheck.addEventListener('change', () => {
        saveFields.style.display = saveCheck.checked ? 'grid' : 'none';
      });
    }
    if (localStorage.getItem('token')) {
      const saveOpt = document.getElementById('sz-save-option');
      if (saveOpt) saveOpt.style.display = 'block';
    }
  }, 100);
};

window.closeSizingModal = function () {
  _stopCamera();
  document.getElementById('sizing-modal')?.remove();
};

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function _showOnly(stepId) {
  ['sz-step-method', 'sz-step-camera', 'sz-step-manual', 'sz-step-result'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === stepId ? 'block' : 'none';
  });
}

window.szShowMethod = function () { _showOnly('sz-step-method'); _stopCamera(); };
window.szShowCamera = function () { _showOnly('sz-step-camera'); };
window.szShowManual = function () { _showOnly('sz-step-manual'); };

// ── CAMERA ────────────────────────────────────────────────────────────────────
async function _startCamera() {
  const status     = document.getElementById('sz-camera-status');
  const captureBtn = document.getElementById('sz-capture-btn');

  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }
    });
    const video = document.getElementById('sz-video');
    if (video) {
      video.srcObject = _cameraStream;
      video.onloadedmetadata = () => video.play();
    }
    if (status) status.textContent = 'Camera ready — position your child';
    if (captureBtn) { captureBtn.disabled = false; captureBtn.style.opacity = '1'; }
    _loadPoseModel().catch(e => console.log('Pose model optional:', e.message));
  } catch (err) {
    if (status) status.textContent = 'Camera blocked — please use manual entry';
    if (captureBtn) { captureBtn.disabled = true; captureBtn.style.opacity = '0.4'; }
    console.error('Camera error:', err.message);
  }
}

function _stopCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

async function _loadPoseModel() {
  if (_poseDetector) return;
  const status = document.getElementById('sz-camera-status');

  if (!window.tf) {
    await _loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js');
  }
  if (!window.poseDetection) {
    await _loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');
  }

  _poseDetector = await window.poseDetection.createDetector(
    window.poseDetection.SupportedModels.BlazePose,
    { runtime: 'tfjs', modelType: 'lite' }
  );

  if (status) status.textContent = 'AI ready — tap Capture when child is in position';
}

window.szCapture = async function () {
  const video      = document.getElementById('sz-video');
  const canvas     = document.getElementById('sz-canvas');
  const captureBtn = document.getElementById('sz-capture-btn');
  const status     = document.getElementById('sz-camera-status');

  if (!video) return;

  if (captureBtn) { captureBtn.disabled = true; captureBtn.textContent = 'ANALYSING...'; }
  if (status) status.textContent = 'Analysing body position...';

  let measurements = {};

  try {
    if (_poseDetector) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const poses = await _poseDetector.estimatePoses(video);
      if (poses.length > 0) {
        measurements = _extractMeasurements(poses[0], video.videoWidth, video.videoHeight);
        if (status) {
          status.textContent = `Detected — ${Math.round((measurements.poseConfidence || 0.8) * 100)}% confidence`;
        }
      } else {
        if (status) status.textContent = 'No person detected — please try again';
        if (captureBtn) { captureBtn.disabled = false; captureBtn.textContent = 'CAPTURE & ANALYSE'; }
        return;
      }
    } else {
      const h = prompt('Camera AI is still loading. Enter child\'s height in cm to continue:');
      if (!h) {
        if (captureBtn) { captureBtn.disabled = false; captureBtn.textContent = 'CAPTURE & ANALYSE'; }
        return;
      }
      measurements.height = parseFloat(h);
    }
  } catch (err) {
    console.error('Capture error:', err);
    if (captureBtn) { captureBtn.disabled = false; captureBtn.textContent = 'CAPTURE & ANALYSE'; }
    return;
  }

  _stopCamera();
  await _fetchRecommendation(measurements, 'camera');
};

function _extractMeasurements(pose, w, h) {
  const kp  = {};
  (pose.keypoints || []).forEach(k => { if (k.score > 0.3) kp[k.name] = k; });

  const out  = { poseConfidence: pose.score || 0.8 };
  const nose = kp.nose;
  const lAnkle = kp.left_ankle, rAnkle = kp.right_ankle;
  const ankle  = lAnkle && rAnkle
    ? (lAnkle.score > rAnkle.score ? lAnkle : rAnkle)
    : (lAnkle || rAnkle);

  if (nose && ankle) {
    const pixH    = Math.abs(ankle.y - nose.y) * 1.12;
    const cmPerPx = 160 / h;
    out.height    = Math.round(pixH * cmPerPx);
  }

  const lSh = kp.left_shoulder, rSh = kp.right_shoulder;
  if (lSh && rSh && out.height) {
    const shoulderPx = Math.abs(lSh.x - rSh.x);
    const cmPerPx    = (out.height * 0.24) / shoulderPx;
    out.shoulder     = Math.round(shoulderPx * cmPerPx);
    out.chest        = Math.round(out.shoulder * 2.85);
  }

  const lHip = kp.left_hip, rHip = kp.right_hip;
  if (lHip && rHip && out.shoulder) {
    const hipPx  = Math.abs(lHip.x - rHip.x);
    const ratio  = hipPx / Math.abs((lSh?.x || 0) - (rSh?.x || 0));
    out.hip      = Math.round(out.chest * ratio * Math.PI / 2);
    out.waist    = Math.round(out.hip * 0.85);
  }

  return out;
}

// ── MANUAL RECOMMENDATION ─────────────────────────────────────────────────────
window.szGetRecommendation = async function () {
  const measurements = {
    height:   parseFloat(document.getElementById('sz-height')?.value)   || null,
    weight:   parseFloat(document.getElementById('sz-weight')?.value)   || null,
    chest:    parseFloat(document.getElementById('sz-chest')?.value)    || null,
    waist:    parseFloat(document.getElementById('sz-waist')?.value)    || null,
    hip:      parseFloat(document.getElementById('sz-hip')?.value)      || null,
    shoulder: parseFloat(document.getElementById('sz-shoulder')?.value) || null
  };

  if (!measurements.height && !measurements.chest) {
    alert('Please enter at least height and chest measurement to continue.');
    return;
  }

  const saveCheck = document.getElementById('sz-save-check');
  if (saveCheck?.checked && localStorage.getItem('token')) {
    const name = document.getElementById('sz-child-name')?.value?.trim();
    if (name) {
      await _saveProfile({
        name,
        dateOfBirth:        document.getElementById('sz-child-dob')?.value || null,
        height:             measurements.height,
        weight:             measurements.weight,
        chestCircumference: measurements.chest,
        waistCircumference: measurements.waist,
        hipCircumference:   measurements.hip,
        shoulderWidth:      measurements.shoulder,
        measurementMethod:  'manual'
      });
    }
  }

  await _fetchRecommendation(measurements, 'manual');
};

// ── FETCH RECOMMENDATION ──────────────────────────────────────────────────────
async function _fetchRecommendation(measurements, method) {
  _showOnly('sz-step-result');
  const result = document.getElementById('sz-step-result');
  result.innerHTML = `
    <div style="text-align:center;padding:50px 20px">
      <div style="font-size:40px;margin-bottom:16px">&#129302;</div>
      <div style="font-size:14px;color:#888;margin-bottom:8px">Calculating best fit...</div>
      <div style="font-size:12px;color:#C8C5C0">Analysing garment dimensions vs child measurements</div>
    </div>
  `;

  try {
    const res  = await fetch(`${API_BASE}/sizing/recommend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId: _productId, measurements, method })
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.message);
    if (!data.hasData) {
      result.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#888">
          <div style="font-size:30px;margin-bottom:12px">&#128207;</div>
          <div style="font-size:14px;margin-bottom:20px">${data.message}</div>
          <button onclick="window.szShowMethod()" class="sizing-btn-primary"
                  style="max-width:200px;margin:0 auto">TRY AGAIN</button>
        </div>
      `;
      return;
    }

    _renderResult(result, data.recommendation, measurements);
  } catch (err) {
    result.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:30px;margin-bottom:12px">&#9888;</div>
        <div style="color:#E24B4A;font-size:14px;margin-bottom:20px">
          ${err.message || 'Something went wrong. Please try again.'}
        </div>
        <button onclick="window.szShowMethod()" class="sizing-btn-primary"
                style="max-width:200px;margin:0 auto">TRY AGAIN</button>
      </div>
    `;
  }
}

// ── RENDER RESULT ─────────────────────────────────────────────────────────────
function _renderResult(container, rec, measurements) {
  const confColor = rec.confidence >= 85 ? '#1D9E75' : rec.confidence >= 65 ? '#C9A84C' : '#EF9F27';
  const confBg    = rec.confidence >= 85 ? '#EAF3DE' : '#FAEEDA';

  container.innerHTML = `
    <div style="text-align:center;padding:24px 0 20px">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;
                  color:#888;margin-bottom:12px">RECOMMENDED SIZE</div>
      <div style="font-size:60px;font-family:'Playfair Display',Georgia,serif;
                  font-weight:500;color:#0A0A0A;line-height:1;margin-bottom:12px">
        ${rec.size}
      </div>
      <span style="padding:6px 16px;border-radius:99px;font-size:13px;font-weight:600;
                   background:${confBg};color:${confColor}">
        ${rec.confidence}% match &nbsp;·&nbsp; ${rec.confidenceLabel} Confidence
      </span>
      ${rec.fitType ? `<div style="font-size:12px;color:#888;margin-top:8px">${rec.fitType}</div>` : ''}
    </div>

    <div style="padding:0 22px 20px;border-bottom:0.5px solid #E8E5E0">
      <div style="display:flex;justify-content:space-between;font-size:11px;
                  color:#888;margin-bottom:6px">
        <span>Fit confidence</span><span>${rec.confidence}%</span>
      </div>
      <div style="height:6px;background:#E8E5E0;border-radius:99px;overflow:hidden">
        <div id="sz-conf-bar"
             style="height:100%;width:0%;background:${confColor};
                    border-radius:99px;transition:width 1s ease"></div>
      </div>
    </div>

    <div style="padding:18px 22px">
      ${rec.warnings?.length ? `
        <div style="background:#FCEBEB;border-radius:6px;padding:12px 14px;margin-bottom:14px">
          ${rec.warnings.map(w => `
            <div style="font-size:13px;color:#C0392B;display:flex;gap:8px;
                        margin-bottom:3px;line-height:1.5">
              <span style="flex-shrink:0">&#9888;&#65039;</span><span>${w}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${rec.fitNote ? `
        <div style="background:#FAEEDA;border-radius:6px;padding:12px 14px;
                    margin-bottom:14px;font-size:13px;color:#633806;line-height:1.5">
          &#128204; ${rec.fitNote}
        </div>
      ` : ''}

      ${rec.notes?.length ? `
        <div style="background:#EAF3DE;border-radius:6px;padding:12px 14px;margin-bottom:14px">
          ${rec.notes.map(n => `
            <div style="font-size:13px;color:#2D6A4F;display:flex;gap:8px;line-height:1.5">
              <span>&#10003;</span><span>${n}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${rec.alternative?.size && rec.alternative?.reason ? `
        <div style="border:0.5px solid #E8E5E0;border-radius:6px;padding:14px 16px;
                    margin-bottom:16px;display:flex;align-items:center;
                    justify-content:space-between;gap:10px">
          <div>
            <div style="font-size:11px;color:#888;margin-bottom:3px;letter-spacing:0.06em">ALTERNATIVE SIZE</div>
            <div style="font-size:20px;font-weight:600;color:#0A0A0A">${rec.alternative.size}</div>
            <div style="font-size:12px;color:#888;margin-top:2px">${rec.alternative.reason}</div>
          </div>
          <button onclick="window.szApplySize('${rec.alternative.size}')"
                  class="sizing-btn-ghost">SELECT</button>
        </div>
      ` : ''}

      ${rec.safeToAvoid?.size ? `
        <div style="background:#FCEBEB;border-radius:6px;padding:10px 14px;
                    margin-bottom:14px;font-size:12px;color:#C0392B">
          &#10060; Avoid size <strong>${rec.safeToAvoid.size}</strong>
          ${rec.safeToAvoid.reason ? ` — ${rec.safeToAvoid.reason}` : ''}
        </div>
      ` : ''}

      <div style="display:flex;gap:10px;margin-bottom:18px">
        <button onclick="window.szApplySize('${rec.size}')" class="sizing-btn-primary">
          SELECT SIZE ${rec.size}
        </button>
        <button onclick="window.szShowMethod()" class="sizing-btn-ghost">REDO</button>
      </div>

      ${rec.allSizes?.length ? `
        <div style="border-top:0.5px solid #E8E5E0;padding-top:14px">
          <div style="font-size:10px;letter-spacing:0.12em;font-weight:600;
                      text-transform:uppercase;color:#aaa;margin-bottom:10px">ALL SIZES</div>
          ${rec.allSizes.map(s => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-size:13px;font-weight:${s.recommended ? '600' : '400'};
                           color:${s.recommended ? '#0A0A0A' : '#888'};
                           width:36px;flex-shrink:0">${s.size}</span>
              <div style="flex:1;height:4px;background:#E8E5E0;border-radius:99px;overflow:hidden">
                <div style="height:100%;width:${s.confidence}%;
                            background:${s.confidence >= 85 ? '#1D9E75' : s.confidence >= 65 ? '#C9A84C' : '#D4CFC9'};
                            border-radius:99px"></div>
              </div>
              <span style="font-size:11px;color:#aaa;width:28px;text-align:right">${s.confidence}%</span>
              ${s.recommended
                ? `<span style="font-size:10px;background:#C9A84C;color:#fff;
                               padding:2px 7px;border-radius:99px;flex-shrink:0">BEST</span>`
                : `<span style="width:47px;display:inline-block"></span>`}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  setTimeout(() => {
    const bar = document.getElementById('sz-conf-bar');
    if (bar) bar.style.width = rec.confidence + '%';
  }, 100);
}

// ── SAVED PROFILES ────────────────────────────────────────────────────────────
async function _loadSavedProfiles() {
  const container = document.getElementById('sz-saved-profiles');
  if (!container || !localStorage.getItem('token')) return;

  try {
    const res  = await fetch(`${API_BASE}/sizing/profiles`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    const profiles = data.data || [];
    if (!profiles.length) return;

    window._szProfiles = profiles;

    container.innerHTML = `
      <div style="margin-bottom:18px">
        <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;
                    text-transform:uppercase;color:#888;margin-bottom:10px">SAVED PROFILES</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${profiles.map(p => `
            <button onclick="window.szUseProfile('${p._id}')"
                    style="padding:10px 14px;border:0.5px solid #E8E5E0;border-radius:8px;
                           background:#fff;cursor:pointer;text-align:left;font-size:13px;
                           font-family:inherit;transition:all 0.15s;min-width:100px"
                    onmouseover="this.style.borderColor='#C9A84C'"
                    onmouseout="this.style.borderColor='#E8E5E0'">
              <div style="font-weight:500">&#128100; ${p.name}</div>
              <div style="font-size:11px;color:#888;margin-top:2px">
                ${p.height ? `${p.height}cm` : ''}${p.chestCircumference ? ` · ${p.chestCircumference}cm` : ''}
              </div>
            </button>
          `).join('')}
        </div>
      </div>
      <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;
                  text-transform:uppercase;color:#888;margin-bottom:14px;
                  border-top:0.5px solid #E8E5E0;padding-top:14px">
        OR MEASURE NOW
      </div>
    `;
  } catch (err) {
    console.log('[sizing] Could not load profiles:', err.message);
  }
}

window.szUseProfile = async function (profileId) {
  const profiles = window._szProfiles || [];
  const profile  = profiles.find(p => p._id === profileId);
  if (!profile) return;
  _selectedProfile = profile;
  await _fetchRecommendation({
    height:   profile.height,
    weight:   profile.weight,
    chest:    profile.chestCircumference,
    waist:    profile.waistCircumference,
    hip:      profile.hipCircumference,
    shoulder: profile.shoulderWidth
  }, 'profile');
};

async function _saveProfile(profileData) {
  try {
    const res  = await fetch(`${API_BASE}/sizing/profiles`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(profileData)
    });
    const data = await res.json();
    if (data.success) console.log('[sizing] Profile saved:', data.data?.name);
  } catch (err) {
    console.log('[sizing] Profile save failed:', err.message);
  }
}

// ── APPLY SIZE TO PRODUCT PAGE ────────────────────────────────────────────────
window.szApplySize = function (size) {
  // Trigger click on the matching size button — fires existing event listeners in product.js
  const btn = document.querySelector(`.size-btn[data-size="${size}"]`);
  if (btn) btn.click();
  window.closeSizingModal();
};

// ── UTILS ─────────────────────────────────────────────────────────────────────
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s  = document.createElement('script');
    s.src    = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}
