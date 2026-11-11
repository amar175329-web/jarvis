// Builds ONE self-contained HTML page (audio embedded) so Amit can listen to both voices across emotions and situations and rate them.
//   node packages/voice/tools/build-voice-lab.ts [--out ~/JARVIS-private/voice-lab/index.html] [--fake]
// Needs FISH_API_KEY in the environment (never printed). --fake makes silent clips to test the page without any key or network.
//   --verify  also transcribes every clip (Fish speech-to-text) and shows written vs heard words on the page.
// Every clip is also saved next to the page in clips/<group>__<n>-<voice>.mp3 (measure them with tools/measure-voice.py).
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_TUNING, FISH_FREE_MODEL, buildCloudSentences, createFishAdapter, createFishAsr, paceFor, voiceIdFor, wordDiff } from '../src/index.ts';
import type { Tuning } from '../src/index.ts';
import { LAB_GROUPS } from './lab-cases.ts';

const args = process.argv.slice(2);
const fake = args.includes('--fake');
const verify = args.includes('--verify');
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(homedir(), 'JARVIS-private', 'voice-lab', 'index.html');
const key = process.env.FISH_API_KEY;
if (!fake && !key) { console.error('FISH_API_KEY is not set (use --fake to test the page without audio).'); process.exit(2); }

function silentWav(seconds = 0.6): Uint8Array {
  const rate = 8000, n = Math.floor(rate * seconds), buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer); const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  buf.fill(128, 44); return buf;
}
const concat = (parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cloud = fake ? null : createFishAdapter({ apiKey: key! });
const asr = verify && !fake ? createFishAsr({ apiKey: key! }) : null;
async function synth(text: string, voiceId: string, speed: number, tuning: Tuning): Promise<Uint8Array> {
  if (!cloud) return silentWav();
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await cloud({ text, voiceId, model: FISH_FREE_MODEL, signal: AbortSignal.timeout(15000), speed, tuning }); } catch (e) { last = e; await sleep(1500); }
  }
  throw last;
}

const rows: any[] = [];
for (const g of LAB_GROUPS) {
  const variants: any[] = [];
  let vi = 0;
  for (const v of g.variants) {
    vi++;
    const voice = v.voice ?? g.voice; const voiceId = voiceIdFor(voice, process.env);
    // Exactly the production path (buildCloudSentences: Hindi conversion, tag on the first sentence, comma pauses, speed, gaps).
    // `raw` variants are sent as written, but at the group's normal speed.
    const mode = g.mode ?? 'normal', situation = g.situation ?? 'normal';
    const items = v.raw
      ? [{ plain: v.raw, cloud: v.raw, speed: v.pace?.speed ?? paceFor(mode, situation).speed, gapAfterMs: 0 }]
      : buildCloudSentences(g.text, { mode, situation, tag: v.tag, pace: v.pace, join: v.join });
    const tuning: Tuning = { ...DEFAULT_TUNING, ...(v.tuning ?? {}) };
    const t0 = Date.now();
    try {
      const chunks: { b64: string; mime: string; gapAfterMs: number }[] = []; let bytes = 0;
      const all: Uint8Array[] = [];
      for (const it of items) { const d = await synth(it.cloud, voiceId, it.speed, tuning); all.push(d); bytes += d.length; chunks.push({ b64: Buffer.from(d).toString('base64'), mime: fake ? 'audio/wav' : 'audio/mpeg', gapAfterMs: it.gapAfterMs }); }
      const combined = concat(all);
      const clipDir = join(dirname(out), 'clips'); mkdirSync(clipDir, { recursive: true });
      writeFileSync(join(clipDir, `${g.id}__${vi}-${voice}.${fake ? 'wav' : 'mp3'}`), combined);
      // Written vs heard: what we asked Fish to say (spoken-form Hindi, no tags) against what speech-to-text hears back.
      const expected = v.raw ? v.raw : items.map((x) => x.plain).join(' ');
      let check: { heard: string; accuracy: number; missing: string[]; extra: string[] } | undefined;
      if (verify) {
        try {
          const heard = fake ? expected.split(' ').slice(0, -1).concat('नमूना').join(' ') : await asr!(combined, { mime: 'audio/mpeg', language: 'hi', signal: AbortSignal.timeout(20000) });
          const d = wordDiff(expected, heard); check = { heard, accuracy: d.accuracy, missing: d.missing, extra: d.extra };
        } catch (e) { check = { heard: '(सुनने वाला काम नहीं कर पाया: ' + (e instanceof Error ? e.message.slice(0, 40) : 'error') + ')', accuracy: -1, missing: [], extra: [] }; }
      }
      variants.push({ label: v.label, tag: v.tag, voice, prod: !!v.prod, experimental: !!v.experimental, sent: items.map((x) => x.cloud), speed: items[0].speed, gap: items[0].gapAfterMs, ms: Date.now() - t0, bytes, chunks, expected, check });
      console.log(`ok   ${g.id} / ${v.label} (${bytes} bytes, ${Date.now() - t0} ms)`);
    } catch (e) {
      variants.push({ label: v.label, tag: v.tag, voice, prod: !!v.prod, experimental: !!v.experimental, sent: items.map((x) => x.cloud), error: e instanceof Error ? e.message.slice(0, 60) : 'error' });
      console.log(`FAIL ${g.id} / ${v.label}: ${e instanceof Error ? e.message.slice(0, 60) : 'error'}`);   // status only: never the key
    }
  }
  rows.push({ id: g.id, title: g.title, why: g.why, text: g.text, voice: g.voice, variants });
}

const data = { built: new Date().toISOString(), model: fake ? 'FAKE (silent test clips)' : FISH_FREE_MODEL, fake, verify, groups: rows };
const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, PAGE(json));
console.log(`wrote ${out} (${(json.length / 1048576).toFixed(1)} MB)`);

function PAGE(embedded: string): string {
  return `<!doctype html>
<html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>JARVIS आवाज़ लैब</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1c1b19;--mut:#6b685f;--line:#e4e1d8;--acc:#1f5eff;--ok:#1a8f4d;--no:#c0392b;--mid:#b9770e;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--card:#1c1c1a;--ink:#f1efe9;--mut:#a09c91;--line:#2e2d2a;--acc:#7da2ff;--ok:#4cc882;--no:#ff7a6b;--mid:#e0a84a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
header{padding:20px 16px 8px;max-width:760px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}header p{margin:4px 0;color:var(--mut);font-size:14px}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;max-width:760px;margin:0 auto}
.chips{display:flex;gap:8px;flex-wrap:wrap}button.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:7px 13px;font:inherit;font-size:14px}
button.chip[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:#fff}
.count{margin-top:8px;font-size:13px;color:var(--mut)}main{max-width:760px;margin:0 auto;padding:12px 16px 80px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}.card h2{margin:0;font-size:17px}.why{color:var(--mut);font-size:13px;margin:2px 0 8px}
.txt{font-size:18px;margin:6px 0 10px}.v{border-top:1px solid var(--line);padding:10px 0}.v:first-of-type{border-top:0}
.meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;font-size:13px}.badge{border-radius:6px;padding:2px 7px;background:var(--line);color:var(--ink)}
.b-j{background:#1f5eff22;color:var(--acc)}.b-h{background:#b9770e22;color:var(--mid)}.b-p{background:#1a8f4d22;color:var(--ok)}.b-x{background:#c0392b22;color:var(--no)}
audio{width:100%;margin:4px 0}button.play{width:100%;margin:4px 0;border:1px solid var(--acc);background:transparent;color:var(--acc);border-radius:10px;padding:11px;font:inherit}.rate{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap}.rate button{flex:1;min-width:84px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:9px 6px;font:inherit;font-size:14px}
.rate button[aria-pressed=true].g{background:var(--ok);border-color:var(--ok);color:#fff}.rate button[aria-pressed=true].m{background:var(--mid);border-color:var(--mid);color:#fff}.rate button[aria-pressed=true].b{background:var(--no);border-color:var(--no);color:#fff}
input.note{width:100%;margin-top:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:8px;font:inherit;font-size:14px}
  .hear{font-size:13px;border-left:3px solid var(--line);padding:2px 0 2px 10px;margin:6px 0}.mm{color:var(--no)}.okk{color:var(--ok)}
details{font-size:12px;color:var(--mut);margin-top:4px}.err{color:var(--no);font-size:13px}
.copy{position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0));background:var(--bg);border-top:1px solid var(--line);text-align:center}
.copy button{width:100%;max-width:728px;border:0;border-radius:12px;background:var(--acc);color:#fff;padding:12px;font:inherit;font-weight:600}
</style></head><body>
<header><h1>JARVIS आवाज़ लैब</h1>
<p>हर वाक्य को बिना tag (तुलना) और tag के साथ सुनो। देखो कि भाव सच में आ रहा है या नहीं।</p>
<p id="info"></p></header>
<div class="bar"><div class="chips" id="chips"></div><div class="count" id="count"></div></div>
<main id="main"></main>
<div class="copy"><button id="copy">मेरे जवाब कॉपी करो (चैट में चिपका दो)</button></div>
<script>
const DATA=${embedded};
const KEY='jarvis-voice-lab-v1';let R={};try{R=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){R={}}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(R))}catch(e){}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let filter='all';let cur=null,curBtn=null,timer=null;
function stopSeq(){if(timer)clearTimeout(timer);timer=null;if(cur){cur.onended=null;cur.pause();cur=null}if(curBtn){curBtn.textContent=curBtn.dataset.t;curBtn=null}}
function playSeq(v,btn){const same=curBtn===btn;stopSeq();if(same)return;btn.dataset.t=btn.dataset.t||btn.textContent;curBtn=btn;btn.textContent='⏹ रोको';let i=0;const run=()=>{if(i>=v.chunks.length){stopSeq();return}const c=v.chunks[i];const a=new Audio('data:'+c.mime+';base64,'+c.b64);cur=a;a.onended=()=>{const g=c.gapAfterMs||0;i++;timer=setTimeout(run,g)};a.play().catch(()=>stopSeq())};run()}
const VN={jarvis:'JARVIS (calm)',helper:'helper (indian)'};
document.getElementById('info').textContent='Model: '+DATA.model+(DATA.fake?' · यह सिर्फ़ टेस्ट पेज है, आवाज़ें ख़ाली हैं':'')+' · बना: '+DATA.built.slice(0,16).replace('T',' ')+' UTC';
const FILTERS=[['all','सब'],['jarvis','JARVIS'],['helper','helper'],['exp','सिर्फ़ प्रयोग वाले'],['todo','बिना सुने']];
function chips(){const c=document.getElementById('chips');c.innerHTML='';FILTERS.forEach(([k,l])=>{const b=document.createElement('button');b.className='chip';b.textContent=l;b.setAttribute('aria-pressed',String(filter===k));b.onclick=()=>{filter=k;chips();render()};c.appendChild(b)})}
const id=(g,i)=>g.id+':'+i;
function show(g,v,i){if(filter==='jarvis')return v.voice==='jarvis';if(filter==='helper')return v.voice==='helper';if(filter==='exp')return v.experimental;if(filter==='todo')return !(R[id(g,i)]&&R[id(g,i)].r);return true}
function render(){const m=document.getElementById('main');m.innerHTML='';let total=0,done=0;
DATA.groups.forEach(g=>{g.variants.forEach((v,i)=>{total++;if(R[id(g,i)]&&R[id(g,i)].r)done++});
const vis=g.variants.map((v,i)=>[v,i]).filter(([v,i])=>show(g,v,i));if(!vis.length)return;
const card=document.createElement('section');card.className='card';
card.innerHTML='<h2>'+esc(g.title)+'</h2>'+(g.why?'<div class="why">'+esc(g.why)+'</div>':'')+'<div class="txt">'+esc(g.text)+'</div>';
vis.forEach(([v,i])=>{const k=id(g,i),cur=R[k]||{};const d=document.createElement('div');d.className='v';
let h='<div class="meta"><span class="badge '+(v.voice==='jarvis'?'b-j':'b-h')+'">'+VN[v.voice]+'</span><b>'+esc(v.label)+'</b>'+(v.prod?'<span class="badge b-p">JARVIS यही इस्तेमाल करेगा</span>':'')+(v.experimental?'<span class="badge b-x">प्रयोग</span>':'')+'</div>';
if(v.error){h+='<div class="err">यह क्लिप नहीं बनी: '+esc(v.error)+'</div>'}else if(v.chunks.length===1){h+='<audio controls preload="none" src="data:'+v.chunks[0].mime+';base64,'+v.chunks[0].b64+'"></audio>'}else{h+='<button class="play" type="button">▶ चलाओ ('+v.chunks.length+' वाक्य, बीच में '+v.gap+' ms का रुकाव)</button>'}
if(!v.error)h+='<div class="why">गति '+v.speed+' · वाक्यों के बीच '+v.gap+' ms</div>';
if(v.check){const c=v.check;if(c.accuracy<0){h+='<div class="err">'+esc(c.heard)+'</div>'}else{h+='<div class="hear"><div><b>लिखा था:</b> '+esc(v.expected)+'</div><div><b>सुना गया:</b> '+esc(c.heard)+'</div>'+(c.missing.length||c.extra.length?'<div class="mm">⚠ छूटे: '+(c.missing.map(esc).join(', ')||'-')+' · अलग सुने: '+(c.extra.map(esc).join(', ')||'-')+'</div>':'<div class="okk">✔ शब्द-शब्द मिला</div>')+'<div class="why">मिलान '+Math.round(c.accuracy*100)+'% (सुनने वाली मशीन भी कभी ग़लत होती है, इसलिए शक हो तो ख़ुद सुनो)</div></div>'}}
h+='<details><summary>Fish को क्या भेजा गया</summary>'+v.sent.map(esc).join('<br>')+'</details>';
h+='<div class="rate">'+[['g','👍 ठीक'],['m','😐 ठीक-ठाक'],['b','👎 नहीं']].map(([c,l])=>'<button class="'+c+'" data-r="'+c+'" aria-pressed="'+(cur.r===c)+'">'+l+'</button>').join('')+'</div>';
h+='<input class="note" placeholder="कुछ लिखना हो (जैसे: भाव नहीं आया / बहुत तेज़)" value="'+esc(cur.n||'')+'">';
d.innerHTML=h;const pb=d.querySelector('button.play');if(pb)pb.onclick=()=>playSeq(v,pb);
d.querySelectorAll('.rate button').forEach(b=>b.onclick=()=>{R[k]=Object.assign({},R[k],{r:R[k]&&R[k].r===b.dataset.r?'':b.dataset.r});save();render()});
d.querySelector('.note').onchange=e=>{R[k]=Object.assign({},R[k],{n:e.target.value});save()};
card.appendChild(d)});m.appendChild(card)});
document.getElementById('count').textContent='सुनकर जवाब दिए: '+done+' / '+total}
document.getElementById('copy').onclick=async()=>{const L={g:'ठीक',m:'ठीक-ठाक',b:'नहीं'};const out=['JARVIS आवाज़ लैब जवाब:'];
DATA.groups.forEach(g=>g.variants.forEach((v,i)=>{const c=R[id(g,i)];if(c&&(c.r||c.n))out.push(g.id+' | '+VN[v.voice]+' | '+v.label+' | '+(L[c.r]||'-')+(c.n?' | '+c.n:''))}));
const t=out.join('\\n');try{await navigator.clipboard.writeText(t);alert('कॉपी हो गया। अब चैट में चिपका दो।')}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');alert('कॉपी हो गया।')}catch(_){prompt('इसे कॉपी कर लो:',t)}a.remove()}};
chips();render();
</script></body></html>`;
}
