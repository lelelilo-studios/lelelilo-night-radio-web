// Live captions, on this PC only: your microphone streamed to Scribe v2 Realtime. The one-time token comes from
// gen/live_server.py (the API key never reaches the page). Transcripts go to the room through __nr.feed():
// {kind: "partial" | "committed" | "status", text}. On the public site this script does nothing.
// Only when served by gen/live_server.py (127.0.0.1:8748): never on the public site or in checks
const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8748';
const RATE = 16000;

function button() {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'nr-live';
  b.style.cssText = 'position:fixed;z-index:5;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 12px;border-radius:999px;border:1.5px solid #ffe3a3;background:radial-gradient(circle at 40% 35%,#e9b75a,#b8863b 70%);color:#2c2014;font:800 13px var(--font-body);letter-spacing:.06em;box-shadow:0 3px 0 #6e4c22;';
  b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg><span>Go live</span>';
  document.body.appendChild(b);
  return b;
}

function b64(int16) {
  const u8 = new Uint8Array(int16.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

const feed = v => window.__nr && window.__nr.feed(v);

async function main() {
  try { if (!(await fetch('/live/ping')).ok) return; } catch { return; }
  const btn = button();
  let live = null;
  async function start() {
    btn.disabled = true;
    try {
      const { token, error } = await (await fetch('/live/scribe-token', { method: 'POST' })).json();
      if (!token) throw new Error(error || 'no token');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext({ sampleRate: RATE });
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=vad&token=${encodeURIComponent(token)}`);
      ws.onopen = () => { feed({ kind: 'status', text: 'listening' }); };
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.message_type === 'partial_transcript') feed({ kind: 'partial', text: m.text || '' });
        else if (m.message_type === 'committed_transcript') feed({ kind: 'committed', text: m.text || '' });
        else if (m.error) feed({ kind: 'status', text: m.error });
      };
      ws.onclose = () => stop();
      proc.onaudioprocess = e => {
        if (ws.readyState !== 1) return;
        const f = e.inputBuffer.getChannelData(0), i16 = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
        ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: b64(i16), commit: false, sample_rate: RATE }));
      };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      if (window.__nr) window.__nr.pause();
      live = { stream, ctx, ws };
      btn.querySelector('span').textContent = 'Stop';
      btn.style.background = 'radial-gradient(circle at 40% 35%,#ff9a8a,#e2493a 70%)';
    } catch (e) {
      feed({ kind: 'status', text: `could not go live: ${e.message || e}` });
    } finally { btn.disabled = false; }
  }
  function stop() {
    if (!live) return;
    const l = live; live = null;
    try { l.ws.close(); } catch {}
    l.stream.getTracks().forEach(t => t.stop());
    l.ctx.close();
    feed({ kind: 'status', text: 'stopped' });
    btn.querySelector('span').textContent = 'Go live';
    btn.style.background = 'radial-gradient(circle at 40% 35%,#e9b75a,#b8863b 70%)';
  }
  btn.addEventListener('click', () => (live ? stop() : start()));
}

if (LOCAL) addEventListener('lelelilo-ready', main, { once: true });
