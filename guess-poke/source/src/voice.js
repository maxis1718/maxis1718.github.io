// Mandarin (Taiwan) speech via the Web Speech API. Fully optional: silently no-ops if unavailable.
const SS = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
const keep = [];
let voice = null, unlocked = false, enabled = true, onDuck = null, speaking = 0;

function pickVoice() {
  if (!SS) return;
  const vs = SS.getVoices() || [];
  const score = (v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    let s = 0;
    if (l === 'zh-tw') s = 100; else if (l.startsWith('zh-hant')) s = 90; else if (l === 'zh-cn' || l.startsWith('zh-hans')) s = 60;
    else if (l === 'zh-hk') s = 20; else if (l.startsWith('zh') || l.startsWith('cmn')) s = 50; else return -1;
    if (/mei-?jia|美佳|ya-?ling|hsiao|xiao|female|女/i.test(v.name)) s += 8;
    if (v.localService) s += 2;
    return s;
  };
  let best = null, bs = -1;
  for (const v of vs) { const s = score(v); if (s > bs) { bs = s; best = v; } }
  voice = best;
}
if (SS) {
  pickVoice();
  try { SS.addEventListener('voiceschanged', pickVoice); } catch (e) { SS.onvoiceschanged = pickVoice; }
}

export const voiceAPI = {
  setDuck(fn) { onDuck = fn; },
  setEnabled(b) { enabled = b; if (!b) this.cancel(); },
  // must be called inside a user gesture once (iOS)
  unlock() {
    if (!SS || unlocked) return;
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'zh-TW'; SS.speak(u); } catch (e) {}
  },
  cancel() { if (SS) { try { SS.cancel(); } catch (e) {} } speaking = 0; onDuck && onDuck(false); },
  get busy() { return speaking > 0; },
  say(text, { rate = 0.92, pitch = 1.35, onend } = {}) {
    if (!SS || !enabled) { onend && setTimeout(onend, 600); return; }
    const busy = (() => { try { return SS.speaking || SS.pending; } catch (e) { return false; } })();
    if (busy) { try { SS.cancel(); } catch (e) {} setTimeout(() => this._speak(text, rate, pitch, onend), 90); return; }
    this._speak(text, rate, pitch, onend);
  },
  _speak(text, rate, pitch, onend) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      keep.push(u); if (keep.length > 4) keep.shift(); // Chrome GC bug: keep a reference so onend fires
      u.lang = voice ? voice.lang : 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      speaking++;
      onDuck && onDuck(true);
      let fin = false;
      const end = () => { if (fin) return; fin = true; speaking = Math.max(0, speaking - 1); if (!speaking) onDuck && onDuck(false); onend && onend(); };
      u.onend = end; u.onerror = end;
      setTimeout(end, 4000 + text.length * 300); // safety: some engines never fire onend
      SS.speak(u);
    } catch (e) { onend && setTimeout(onend, 600); }
  },
};
