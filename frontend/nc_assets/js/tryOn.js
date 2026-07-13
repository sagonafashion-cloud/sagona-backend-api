import { API_BASE } from './config.js';
import { getToken } from './storage.js';

// ── OPEN TRY-ON MODAL ─────────────────────────────────────────
window.openTryOnModal = async function(productId, garmentImageUrl, productName) {
  document.getElementById('tryon-modal')?.remove();

  const token = getToken();

  let hasPhoto = !!window._tryOnPhotoUrl;
  if (!hasPhoto && token) {
    try {
      const res = await fetch(`${API_BASE}/tryon/photo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.data?.hasPhoto) {
        window._tryOnPhotoUrl = data.data.url;
        hasPhoto = true;
      }
    } catch {}
  }

  const modal = document.createElement('div');
  modal.id = 'tryon-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  if (!token) {
    modal.innerHTML = buildShell(productName, `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:48px;margin-bottom:16px">👗</div>
        <h3 style="font-family:'Playfair Display',serif;font-size:20px;margin-bottom:10px;color:#0A0A0A">
          Sign in to Try On
        </h3>
        <p style="font-size:13px;color:#888;margin-bottom:24px;line-height:1.7">
          Create an account or sign in to upload your photo and try garments on yourself.
        </p>
        <a href="/login.html?next=account.html"
           style="display:inline-block;padding:12px 28px;background:#C9A84C;
                  color:#fff;text-decoration:none;border-radius:3px;
                  font-size:12px;letter-spacing:0.1em">
          SIGN IN TO CONTINUE
        </a>
      </div>
    `);
  } else if (!hasPhoto) {
    modal.innerHTML = buildShell(productName, `
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:48px;margin-bottom:16px">📸</div>
        <h3 style="font-family:'Playfair Display',serif;font-size:20px;margin-bottom:10px;color:#0A0A0A">
          Upload Your Photo First
        </h3>
        <p style="font-size:13px;color:#888;margin-bottom:8px;line-height:1.7">
          Upload one photo of yourself to your account. You can then try on any
          garment with one click — no re-uploading needed.
        </p>
        <label style="display:inline-block;margin:16px 0;padding:12px 28px;
                      background:#C9A84C;color:#fff;border-radius:3px;
                      font-size:12px;letter-spacing:0.1em;cursor:pointer">
          <input type="file" id="tryon-quick-upload" accept="image/*"
                 style="display:none"
                 onchange="quickTryOnUpload(this,'${esc(productId)}','${esc(garmentImageUrl)}','${esc(productName)}')">
          📸 UPLOAD MY PHOTO NOW
        </label>
        <div style="font-size:11px;color:#888;margin-bottom:16px">or</div>
        <a href="/account.html#tryon"
           style="font-size:13px;color:#0A0A0A;text-decoration:underline">
          Manage in My Account →
        </a>
        <div style="margin-top:20px;padding:12px;background:#F8F6F3;border-radius:6px;
                    font-size:11px;color:#888;line-height:1.7">
          🔒 Your photo is stored securely and only used for virtual try-on.
        </div>
      </div>
    `);
  } else {
    modal.innerHTML = buildShell(productName, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                      color:#888;margin-bottom:8px">YOUR PHOTO</div>
          <div style="aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:#F0EDE8">
            <img src="${window._tryOnPhotoUrl}" alt="Your photo"
                 style="width:100%;height:100%;object-fit:cover">
          </div>
        </div>
        <div>
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                      color:#888;margin-bottom:8px">GARMENT</div>
          <div style="aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:#F0EDE8">
            <img src="${garmentImageUrl}" alt="${productName}"
                 style="width:100%;height:100%;object-fit:cover">
          </div>
        </div>
      </div>
      <div id="tryon-result-area">
        <div style="text-align:center;padding:24px;background:#F8F6F3;border-radius:8px;
                    margin-bottom:16px" id="tryon-generating">
          <div style="font-size:28px;margin-bottom:12px;display:inline-block;
                      animation:tryonSpin 2s linear infinite">✨</div>
          <div style="font-size:14px;font-weight:500;color:#0A0A0A;margin-bottom:6px">
            Generating your try-on...
          </div>
          <div style="font-size:12px;color:#888">
            Our AI is styling the garment on your photo. This takes 20–40 seconds.
          </div>
          <div style="margin-top:14px;height:3px;background:#E8E5E0;border-radius:99px;overflow:hidden">
            <div id="tryon-ai-bar"
                 style="height:100%;background:#C9A84C;border-radius:99px;
                        width:5%;transition:width 60s linear"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="retryTryOn('${esc(productId)}','${esc(garmentImageUrl)}','${esc(productName)}')"
                style="flex:1;padding:11px;background:transparent;border:0.5px solid #E8E5E0;
                       cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
          🔄 TRY AGAIN
        </button>
        <button onclick="closeTryOnModal();window.location.href='/account.html#tryon'"
                style="padding:11px 16px;background:transparent;border:0.5px solid #E8E5E0;
                       cursor:pointer;font-size:11px;border-radius:3px">
          📸 CHANGE PHOTO
        </button>
      </div>
    `);

    setTimeout(() => {
      const bar = document.getElementById('tryon-ai-bar');
      if (bar) bar.style.width = '85%';
      runGeneration(productId, garmentImageUrl, productName);
    }, 200);
  }

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeTryOnModal(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { closeTryOnModal(); document.removeEventListener('keydown', onEsc); }
  });
};

function buildShell(productName, content) {
  return `
    <style>
      @keyframes tryonSpin { to { transform:rotate(360deg) } }
      @keyframes tryonFadeIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
    </style>
    <div style="background:#fff;width:100%;max-width:680px;max-height:90vh;
                overflow-y:auto;border-radius:12px;animation:tryonFadeIn 0.25s ease">
      <div style="padding:20px 24px;border-bottom:0.5px solid #E8E5E0;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:18px;
                      font-weight:500;color:#0A0A0A">Try-On Studio</div>
          <div style="font-size:12px;color:#888;margin-top:2px">${productName}</div>
        </div>
        <button onclick="closeTryOnModal()"
                style="width:36px;height:36px;border-radius:50%;background:#F8F6F3;
                       border:none;cursor:pointer;font-size:20px;color:#555;
                       display:flex;align-items:center;justify-content:center">×</button>
      </div>
      <div style="padding:22px">${content}</div>
    </div>
  `;
}

async function runGeneration(productId, garmentImageUrl, productName) {
  const resultArea = document.getElementById('tryon-result-area');
  const token = getToken();

  try {
    const res = await fetch(`${API_BASE}/tryon/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productId, garmentImageUrl })
    });

    const data = await res.json();

    if (!data.success) {
      if (data.message === 'NO_PHOTO') {
        if (resultArea) resultArea.innerHTML = noPhotoMessage();
        return;
      }
      throw new Error(data.message);
    }

    const resultUrl = data.data.resultUrl;
    const bar = document.getElementById('tryon-ai-bar');
    if (bar) { bar.style.transition = 'width 0.3s'; bar.style.width = '100%'; }

    setTimeout(() => {
      if (!resultArea) return;
      resultArea.innerHTML = `
        <div>
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
                      color:#888;margin-bottom:10px;text-align:center">✨ YOUR TRY-ON RESULT</div>
          <div style="border-radius:10px;overflow:hidden;margin-bottom:14px;
                      position:relative;background:#F0EDE8">
            <img src="${resultUrl}" alt="Try-on result"
                 style="width:100%;display:block;border-radius:10px"
                 onload="this.parentElement.style.background='transparent'">
            <div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.6);
                        color:#fff;font-size:10px;padding:3px 10px;border-radius:99px;
                        letter-spacing:0.06em">AI GENERATED</div>
          </div>
          <div style="font-size:11px;color:#888;text-align:center;margin-bottom:14px">
            This is an AI-generated preview. Actual product may vary slightly.
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="saveTryOnResultFn('${esc(productId)}','${esc(productName)}','${esc(resultUrl)}')"
                    style="flex:1;padding:10px;background:#0A0A0A;color:#fff;border:none;
                           cursor:pointer;font-size:11px;letter-spacing:0.08em;border-radius:3px">
              💾 SAVE RESULT
            </button>
            <a href="${resultUrl}" download="sagona-tryon.jpg" target="_blank"
               style="padding:10px 16px;background:transparent;border:0.5px solid #E8E5E0;
                      color:#555;text-decoration:none;border-radius:3px;font-size:11px;
                      display:flex;align-items:center">⬇</a>
          </div>
        </div>
      `;
    }, 300);

  } catch (err) {
    if (!resultArea) return;
    resultArea.innerHTML = `
      <div style="text-align:center;padding:28px;background:#FCEBEB;border-radius:8px">
        <div style="font-size:24px;margin-bottom:10px">⚠️</div>
        <div style="font-size:13px;color:#E24B4A;margin-bottom:16px">
          ${err.message || 'Try-on generation failed. Please try again.'}
        </div>
        <button onclick="retryTryOn()"
                style="padding:10px 24px;background:#E24B4A;color:#fff;border:none;
                       cursor:pointer;border-radius:3px;font-size:12px">
          TRY AGAIN
        </button>
      </div>
    `;
  }
}

window.quickTryOnUpload = async function(input, productId, garmentUrl, productName) {
  const file = input.files[0];
  if (!file) return;
  const label = input.closest('label');
  if (label) label.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/tryon/upload-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    window._tryOnPhotoUrl = data.data.url;
    closeTryOnModal();
    setTimeout(() => openTryOnModal(productId, garmentUrl, productName), 200);
  } catch (err) {
    if (label) label.textContent = '⚠ Upload failed — try again';
  }
};

window.retryTryOn = function(productId, garmentUrl, productName) {
  closeTryOnModal();
  setTimeout(() => openTryOnModal(productId, garmentUrl, productName), 200);
};

window.saveTryOnResultFn = async function(productId, productName, resultUrl) {
  try {
    const token = getToken();
    await fetch(`${API_BASE}/tryon/save-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ garmentProductId: productId, garmentName: productName, resultImageUrl: resultUrl })
    });
    const btn = event?.target;
    if (btn) { btn.textContent = '✓ SAVED'; btn.disabled = true; btn.style.background = '#1D9E75'; }
  } catch {}
};

window.closeTryOnModal = function() {
  document.getElementById('tryon-modal')?.remove();
};

function noPhotoMessage() {
  return `
    <div style="text-align:center;padding:24px">
      <div style="font-size:36px;margin-bottom:12px">📸</div>
      <div style="font-size:14px;margin-bottom:16px">Upload your photo to use Try-On</div>
      <a href="/account.html#tryon"
         style="display:inline-block;padding:10px 24px;background:#C9A84C;
                color:#fff;text-decoration:none;border-radius:3px;font-size:12px">
        GO TO MY ACCOUNT
      </a>
    </div>
  `;
}

function esc(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
