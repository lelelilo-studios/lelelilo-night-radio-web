// Call Mo, on this PC only: a live conversation with the station's private agent. The signed link comes from
// gen/live_server.py (the API key never reaches the page). Turns go to the room through __nr.feed():
// {kind: "agent" | "user" | "tool" | "status", text, tool}. On the public site this script does nothing.
// Only when served by gen/live_server.py (127.0.0.1:8748): never on the public site or in checks
const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8748';

function button() {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'nr-live';
  b.style.cssText = 'position:fixed;z-index:5;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 12px;border-radius:999px;border:1.5px solid #ffe3a3;background:radial-gradient(circle at 40% 35%,#e9b75a,#b8863b 70%);color:#2c2014;font:800 13px var(--font-body);letter-spacing:.06em;box-shadow:0 3px 0 #6e4c22;';
  b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg><span>Call Mo</span>';
  document.body.appendChild(b);
  return b;
}

function b64(int16) {
  const u8 = new Uint8Array(int16.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function pcm(b64s) {
  const bin = atob(b64s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(u8.buffer, 0, u8.length >> 1), f = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 0x8000;
  return f;
}

const rateOf = fmt => { const m = /pcm_(\d+)/.exec(fmt || ''); return m ? +m[1] : 16000; };
const feed = v => window.__nr && window.__nr.feed(v);

async function main() {
  try { if (!(await fetch('/live/ping')).ok) return; } catch { return; }
  const btn = button();
  let call = null;
  async function start() {
    btn.disabled = true;
    try {
      const { signed_url, error } = await (await fetch('/live/agent-url')).json();
      if (!signed_url) throw new Error(error || 'no link');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      let outRate = 16000, nextAt = 0, playing = [];
      const ws = new WebSocket(signed_url);
      ws.onopen = () => { ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' })); feed({ kind: 'status', text: 'ringing' }); };
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        switch (m.type) {
          case 'conversation_initiation_metadata':
            outRate = rateOf(m.conversation_initiation_metadata_event?.agent_output_audio_format);
            feed({ kind: 'status', text: 'connected' });
            break;
          case 'audio': {
            const f = pcm(m.audio_event.audio_base_64), buf = ctx.createBuffer(1, f.length, outRate);
            buf.copyToChannel(f, 0);
            const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
            nextAt = Math.max(ctx.currentTime + 0.03, nextAt); s.start(nextAt); nextAt += buf.duration;
            playing.push(s); s.onended = () => { playing = playing.filter(x => x !== s); };
            break;
          }
          case 'interruption':
            playing.forEach(s => { try { s.stop(); } catch {} }); playing = []; nextAt = 0;
            break;
          case 'agent_response':
            feed({ kind: 'agent', text: m.agent_response_event?.agent_response || '' });
            break;
          case 'user_transcript':
            feed({ kind: 'user', text: m.user_transcription_event?.user_transcript || '' });
            break;
          case 'client_tool_call': {
            const c = m.client_tool_call;
            feed({ kind: 'tool', tool: c.tool_name, text: JSON.stringify(c.parameters || {}) });
            ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: c.tool_call_id, result: 'done', is_error: false }));
            break;
          }
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event?.event_id }));
            break;
        }
      };
      ws.onclose = () => stop();
      proc.onaudioprocess = e => {
        if (ws.readyState !== 1) return;
        const f = e.inputBuffer.getChannelData(0), i16 = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
        ws.send(JSON.stringify({ user_audio_chunk: b64(i16) }));
      };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      if (window.__nr) window.__nr.pause();
      call = { stream, ctx, ws };
      btn.querySelector('span').textContent = 'Hang up';
      btn.style.background = 'radial-gradient(circle at 40% 35%,#ff9a8a,#e2493a 70%)';
    } catch (e) {
      feed({ kind: 'status', text: `could not call: ${e.message || e}` });
    } finally { btn.disabled = false; }
  }
  function stop() {
    if (!call) return;
    const c = call; call = null;
    try { c.ws.close(); } catch {}
    c.stream.getTracks().forEach(t => t.stop());
    c.ctx.close();
    feed({ kind: 'status', text: 'hung up' });
    btn.querySelector('span').textContent = 'Call Mo';
    btn.style.background = 'radial-gradient(circle at 40% 35%,#e9b75a,#b8863b 70%)';
  }
  btn.addEventListener('click', () => (call ? stop() : start()));
}

if (LOCAL) addEventListener('lelelilo-ready', main, { once: true });
