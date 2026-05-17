import { API_BASE } from './config.js';
import { getToken } from './storage.js';

/* ── inject styles ── */
const style = document.createElement('style');
style.textContent = `
  #sagi-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 9000;
    width: 56px; height: 56px; border-radius: 50%;
    background: #C9A84C; border: none; cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.22);
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s, box-shadow .2s;
  }
  #sagi-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,.28); }
  #sagi-btn svg { width: 26px; height: 26px; fill: #fff; }

  #sagi-drawer {
    position: fixed; bottom: 96px; right: 28px; z-index: 9001;
    width: 360px; max-width: calc(100vw - 40px);
    height: 500px; max-height: calc(100vh - 120px);
    background: #fff; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.18);
    display: flex; flex-direction: column;
    transform: translateY(20px) scale(.96); opacity: 0;
    pointer-events: none;
    transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s;
  }
  #sagi-drawer.open {
    transform: translateY(0) scale(1); opacity: 1; pointer-events: auto;
  }

  #sagi-header {
    background: #0A0A0A; color: #C9A84C;
    padding: 14px 18px; border-radius: 12px 12px 0 0;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'Playfair Display', Georgia, serif; font-size: 15px; letter-spacing: 2px;
  }
  #sagi-header span { font-size: 11px; color: #999; font-family: 'Inter', Arial, sans-serif; letter-spacing: 0; }
  #sagi-close { background: none; border: none; color: #999; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; }
  #sagi-close:hover { color: #fff; }

  #sagi-messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 10px;
    scroll-behavior: smooth;
  }
  #sagi-messages::-webkit-scrollbar { width: 4px; }
  #sagi-messages::-webkit-scrollbar-thumb { background: #E8E5E0; border-radius: 2px; }

  .sagi-msg {
    max-width: 86%; padding: 10px 14px; border-radius: 12px;
    font-size: 13px; line-height: 1.6; font-family: 'Inter', Arial, sans-serif;
    word-break: break-word;
  }
  .sagi-msg.user {
    background: #0A0A0A; color: #fff;
    border-radius: 12px 12px 2px 12px; align-self: flex-end;
  }
  .sagi-msg.assistant {
    background: #F8F6F3; color: #0A0A0A;
    border-radius: 12px 12px 12px 2px; align-self: flex-start;
  }
  .sagi-msg.assistant a { color: #C9A84C; }
  .sagi-typing {
    background: #F8F6F3; border-radius: 12px 12px 12px 2px;
    padding: 12px 16px; align-self: flex-start;
    display: flex; gap: 5px; align-items: center;
  }
  .sagi-dot {
    width: 6px; height: 6px; background: #C9A84C; border-radius: 50%;
    animation: sagiPulse 1.2s infinite;
  }
  .sagi-dot:nth-child(2) { animation-delay: .2s; }
  .sagi-dot:nth-child(3) { animation-delay: .4s; }
  @keyframes sagiPulse { 0%,80%,100%{opacity:.2} 40%{opacity:1} }

  #sagi-form {
    padding: 12px 14px; border-top: 1px solid #E8E5E0;
    display: flex; gap: 8px; background: #fff;
    border-radius: 0 0 12px 12px;
  }
  #sagi-input {
    flex: 1; border: 1px solid #E8E5E0; border-radius: 8px;
    padding: 9px 12px; font-size: 13px; font-family: 'Inter', Arial, sans-serif;
    outline: none; resize: none; height: 38px; line-height: 1.4;
    transition: border-color .15s;
  }
  #sagi-input:focus { border-color: #C9A84C; }
  #sagi-send {
    background: #C9A84C; border: none; border-radius: 8px;
    padding: 0 14px; cursor: pointer; color: #fff; font-size: 16px;
    flex-shrink: 0; transition: background .15s;
  }
  #sagi-send:hover { background: #b8943e; }
  #sagi-send:disabled { background: #E8E5E0; cursor: not-allowed; }

  @media (max-width: 480px) {
    #sagi-drawer { right: 12px; bottom: 84px; width: calc(100vw - 24px); }
    #sagi-btn    { bottom: 16px; right: 16px; }
  }
`;
document.head.appendChild(style);

/* ── build DOM ── */
const btn = document.createElement('button');
btn.id = 'sagi-btn';
btn.setAttribute('aria-label', 'Chat with SAGi');
btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
</svg>`;

const drawer = document.createElement('div');
drawer.id = 'sagi-drawer';
drawer.setAttribute('aria-live', 'polite');
drawer.innerHTML = `
  <div id="sagi-header">
    <div>SAGi <span>by SAGONA</span></div>
    <button id="sagi-close" aria-label="Close chat">✕</button>
  </div>
  <div id="sagi-messages"></div>
  <form id="sagi-form" autocomplete="off">
    <input id="sagi-input" type="text" placeholder="Ask me anything…" maxlength="400" autocomplete="off" />
    <button id="sagi-send" type="submit" aria-label="Send">➤</button>
  </form>
`;

document.body.appendChild(btn);
document.body.appendChild(drawer);

/* ── state ── */
const msgs    = drawer.querySelector('#sagi-messages');
const input   = drawer.querySelector('#sagi-input');
const sendBtn = drawer.querySelector('#sagi-send');
let   sessionId = localStorage.getItem('sagi_session') || null;
let   isOpen  = false;
let   busy    = false;

const open  = () => { isOpen = true;  drawer.classList.add('open');    input.focus(); if (!msgs.children.length) greet(); };
const close = () => { isOpen = false; drawer.classList.remove('open'); };

btn.addEventListener('click', () => isOpen ? close() : open());
drawer.querySelector('#sagi-close').addEventListener('click', close);

/* ── helpers ── */
function addMsg(role, text = '') {
  const el = document.createElement('div');
  el.className = `sagi-msg ${role}`;
  el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'sagi-typing';
  el.id = 'sagi-typing';
  el.innerHTML = '<div class="sagi-dot"></div><div class="sagi-dot"></div><div class="sagi-dot"></div>';
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  document.getElementById('sagi-typing')?.remove();
}

function greet() {
  addMsg('assistant', 'Hi! I\'m SAGi, your SAGONA shopping assistant. Ask me about products, delivery, or your orders.');
}

/* ── send message ── */
drawer.querySelector('#sagi-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;

  busy = true;
  input.value = '';
  sendBtn.disabled = true;

  addMsg('user', text);
  showTyping();

  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let assistantEl = null;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ message: text, sessionId })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    removeTyping();
    assistantEl = addMsg('assistant', '');

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(line.slice(6)); } catch { continue; }

        if (data.type === 'session') {
          sessionId = data.sessionId;
          localStorage.setItem('sagi_session', sessionId);
        } else if (data.type === 'text') {
          assistantEl.textContent += data.content;
          msgs.scrollTop = msgs.scrollHeight;
        } else if (data.type === 'error') {
          assistantEl.textContent = data.content;
        }
        // 'done' type — nothing to do
      }
    }

    if (!assistantEl.textContent.trim()) {
      assistantEl.textContent = 'Sorry, I couldn\'t get a response. Please try again.';
    }

  } catch (err) {
    removeTyping();
    if (assistantEl) {
      assistantEl.textContent = 'Connection error. Please try again.';
    } else {
      addMsg('assistant', 'Connection error. Please try again.');
    }
    console.error('[SAGi]', err);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

/* ── Enter to send, Shift+Enter for newline ── */
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    drawer.querySelector('#sagi-form').dispatchEvent(new Event('submit'));
  }
});
