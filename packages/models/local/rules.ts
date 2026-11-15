/**
 * Rule-based task and time extractor for Hindi (Devanagari and Roman script).
 * Runs before any LLM call to save battery, RAM, and time.
 */

export type ExtractedInfo = {
  success: boolean;
  काम?: string;
  समय?: string;
  confidence: 'high' | 'partial' | 'none';
  hasCorrection?: boolean;
  method: 'rules';
};

const HINDI_NUM_WORDS: Record<string, string> = {
  'एक': '1:00',
  'दो': '2:00',
  'तीन': '3:00',
  'चार': '4:00',
  'पांच': '5:00',
  'पाँच': '5:00',
  'छह': '6:00',
  'छः': '6:00',
  'सात': '7:00',
  'आठ': '8:00',
  'नौ': '9:00',
  'दस': '10:00',
  'ग्यारह': '11:00',
  'बारह': '12:00',
  'डेढ़': '1:30',
  'ढाई': '2:30',
};

const ROMAN_NUM_WORDS: Record<string, string> = {
  'ek': '1:00',
  'do': '2:00',
  'teen': '3:00',
  'char': '4:00',
  'paanch': '5:00',
  'panch': '5:00',
  'chhe': '6:00',
  'chhah': '6:00',
  'saat': '7:00',
  'aath': '8:00',
  'nau': '9:00',
  'das': '10:00',
  'gyarah': '11:00',
  'barah': '12:00',
  'dedh': '1:30',
  'dhai': '2:30',
};

// Relative days
const REL_DAYS_DEVA = ['परसों', 'कल', 'आज', 'नरसों'];
const REL_DAYS_ROMAN = ['parson', 'kal', 'aaj', 'narson'];

// Weekdays
const WEEKDAYS_DEVA = ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार', 'इतवार'];
const WEEKDAYS_ROMAN = [
  'somwar', 'mangalwar', 'budhwar', 'guruwar', 'shukrawar', 'shaniwar', 'ravivar', 'itwar',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

// Dayparts
const DAYPARTS_DEVA = ['सुबह', 'दोपहर', 'शाम', 'रात', 'सवेरे', 'भोर'];
const DAYPARTS_ROMAN = ['subah', 'dopahar', 'dopehar', 'shaam', 'sham', 'raat', 'savere'];

// Self-correction triggers: "नहीं", "मतलब", "नहीं नहीं", "actually", "sorry", "रुको"
const CORRECTION_PATTERNS = [
  /नहीं\s+नहीं/,
  /\b(nahi\s+nahi|nahin\s+nahin)\b/i,
  /(?:^|[\s,;:\.।])नहीं(?:$|[\s,;:\.।])/u,
  /\b(nahi|nahin)\b/i,
  /(?:^|[\s,;:\.।])मतलब(?:$|[\s,;:\.।])/u,
  /\bmatlab\b/i,
  /\bactually\b/i,
  /\bsorry\b/i,
  /(?:^|[\s,;:\.।])रुको(?:$|[\s,;:\.।])/u,
  /\bruko\b/i,
];

/**
 * Checks whether an input contains self-correction keywords or conflicting time repetitions.
 */
export function detectSelfCorrection(text: string): { hasCorrection: boolean; reason?: string } {
  const lower = text.toLowerCase();

  // 1. Direct verbal correction keywords
  for (const pat of CORRECTION_PATTERNS) {
    if (pat.test(text) || pat.test(lower)) {
      return { hasCorrection: true, reason: `correction_pattern: ${pat}` };
    }
  }

  // 2. Conflicting days (e.g. "कल परसों", "सोमवार नहीं मंगलवार", "kal parso")
  const foundDays = new Set<string>();
  for (const d of [...REL_DAYS_DEVA, ...WEEKDAYS_DEVA]) {
    if (text.includes(d)) foundDays.add(d);
  }
  for (const d of [...REL_DAYS_ROMAN, ...WEEKDAYS_ROMAN]) {
    const re = new RegExp(`\\b${d}\\b`, 'i');
    if (re.test(lower)) foundDays.add(d);
  }
  if (foundDays.size > 1) {
    return { hasCorrection: true, reason: `multiple_conflicting_days: ${[...foundDays].join(', ')}` };
  }

  // 3. Conflicting dayparts (e.g. "दोपहर ... शाम", "subah ... shaam")
  const foundDayparts = new Set<string>();
  for (const dp of DAYPARTS_DEVA) {
    if (text.includes(dp)) foundDayparts.add(dp);
  }
  for (const dp of DAYPARTS_ROMAN) {
    const re = new RegExp(`\\b${dp}\\b`, 'i');
    if (re.test(lower)) foundDayparts.add(dp);
  }
  if (foundDayparts.size > 1) {
    return { hasCorrection: true, reason: `multiple_conflicting_dayparts: ${[...foundDayparts].join(', ')}` };
  }

  // 4. Multiple hours (e.g. "2 बजे" and "4 बजे")
  const numHourMatches = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:बजे|baje)/gi) || [];
  let wordHourCount = 0;
  for (const w of Object.keys(HINDI_NUM_WORDS)) {
    if (text.includes(`${w} बजे`)) wordHourCount++;
  }
  for (const w of Object.keys(ROMAN_NUM_WORDS)) {
    if (new RegExp(`\\b${w}\\s+baje\\b`, 'i').test(lower)) wordHourCount++;
  }
  if (numHourMatches.length + wordHourCount > 1) {
    return { hasCorrection: true, reason: 'multiple_conflicting_hours' };
  }

  return { hasCorrection: false };
}

/**
 * Strips conversational fillers, discourse vocatives, repeated stuttering, and remnant particles from extracted task.
 * (अरे, सुनो, यार, भाई, वो, जरा, arre, bhai, sun, na वगैरह)
 */
export function cleanTask(raw: string): string {
  if (!raw) return '';
  let t = raw.replace(/^[\s,;:\-–—\.।!?]+/, '').replace(/[\s,;:\-–—\.।!?]+$/, '');

  const fillers = new Set([
    'अरे', 'सुनो', 'यार', 'भाई', 'वो', 'जरा', 'ना', 'अच्छा', 'हाँ', 'समझे',
    'arre', 'arey', 'bhai', 'sun', 'suno', 'yaar', 'woh', 'vo', 'zara', 'na', 'boss',
  ]);

  const trailingFillers = new Set(['समझे', 'boss', 'urgent', 'याद से']);

  const particles = new Set([
    'को', 'में', 'पर', 'तक', 'से', 'का', 'की', 'के', 'ko', 'mein', 'me', 'tak', 'se',
  ]);

  const dayWords = new Set([
    'कल', 'आज', 'परसों', 'सुबह', 'दोपहर', 'शाम', 'रात', 'सवेरे',
    'kal', 'aaj', 'parso', 'parson', 'subah', 'dopahar', 'shaam', 'raat',
  ]);

  let changed = true;
  while (changed) {
    let words = t.split(/\s+/).filter(Boolean);
    if (words.length === 0) break;
    const origLen = words.length;

    const firstClean = words[0].toLowerCase().replace(/^[\s,;:\-–—\.।!?]+|[\s,;:\-–—\.।!?]+$/g, '');
    if (fillers.has(firstClean) || particles.has(firstClean) || dayWords.has(firstClean)) {
      words.shift();
    } else {
      const lastClean = words[words.length - 1].toLowerCase().replace(/^[\s,;:\-–—\.।!?]+|[\s,;:\-–—\.।!?]+$/g, '');
      if (fillers.has(lastClean) || trailingFillers.has(lastClean) || particles.has(lastClean)) {
        words.pop();
      }
    }

    t = words.join(' ').replace(/^[\s,;:\-–—\.।!?]+/, '').replace(/[\s,;:\-–—\.।!?]+$/, '');
    changed = words.length !== origLen;
  }

  let words = t.split(/\s+/).filter(Boolean);
  let filtered: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const rawW = words[i];
    const cleanW = rawW.toLowerCase().replace(/[\s,;:\-–—\.।!?]+/g, '');
    if (['जरा', 'वो', 'ना', 'arre', 'zara', 'na'].includes(cleanW) && (i === 0 || i === words.length - 1 || filtered.length <= 1)) {
      continue;
    }
    filtered.push(rawW);
  }

  let dedup: string[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const w = filtered[i].replace(/[\s,;:\-–—\.।!?]+/g, '');
    const prevW = dedup.length > 0 ? dedup[dedup.length - 1].replace(/[\s,;:\-–—\.।!?]+/g, '') : '';
    if (w && w === prevW) continue;
    dedup.push(filtered[i]);
  }

  return dedup.join(' ').replace(/[\s,;:\-–—\.।!?]+/g, ' ').trim();
}

/**
 * Normalizes Hindi / Roman time words and expressions into canonical time.
 */
export function extractByRules(input: string): ExtractedInfo {
  const text = input.trim();
  if (!text) return { success: false, confidence: 'none', method: 'rules' };

  const correctionCheck = detectSelfCorrection(text);
  const hasCorrection = correctionCheck.hasCorrection;

  const timeParts: string[] = [];
  const matchedSpans: Array<[number, number]> = [];

  const lower = text.toLowerCase();

  // 1. Detect relative day or weekday
  let dayFound = '';
  for (const d of [...REL_DAYS_DEVA, ...WEEKDAYS_DEVA]) {
    const idx = text.indexOf(d);
    if (idx !== -1) {
      dayFound = d;
      matchedSpans.push([idx, idx + d.length]);
      timeParts.push(d);
      break;
    }
  }
  if (!dayFound) {
    for (const d of [...REL_DAYS_ROMAN, ...WEEKDAYS_ROMAN]) {
      const re = new RegExp(`\\b${d}\\b`, 'i');
      const m = re.exec(lower);
      if (m) {
        dayFound = m[0];
        matchedSpans.push([m.index, m.index + m[0].length]);
        timeParts.push(m[0]);
        break;
      }
    }
  }

  // 2. Detect daypart (सुबह, शाम, etc.)
  let daypartFound = '';
  for (const dp of DAYPARTS_DEVA) {
    const idx = text.indexOf(dp);
    if (idx !== -1) {
      daypartFound = dp;
      matchedSpans.push([idx, idx + dp.length]);
      timeParts.push(dp);
      break;
    }
  }
  if (!daypartFound) {
    for (const dp of DAYPARTS_ROMAN) {
      const re = new RegExp(`\\b${dp}\\b`, 'i');
      const m = re.exec(lower);
      if (m) {
        daypartFound = m[0];
        matchedSpans.push([m.index, m.index + m[0].length]);
        timeParts.push(m[0]);
        break;
      }
    }
  }

  // 3. Detect specific hour + बजे / baje (digits or words)
  let hourStr = '';
  // (a) Numeric time: "8:00 बजे", "8 बजे", "9:30 baje", "10 baje"
  const numTimeRe = /(\b\d{1,2}(?::\d{2})?)\s*(?:बजे|baje)/i;
  const numMatch = numTimeRe.exec(text);
  if (numMatch) {
    let t = numMatch[1];
    if (!t.includes(':')) t = `${t}:00`;
    hourStr = `${t} ${numMatch[0].includes('baje') ? 'baje' : 'बजे'}`;
    matchedSpans.push([numMatch.index, numMatch.index + numMatch[0].length]);
    timeParts.push(hourStr);
  } else {
    // (b) Word time with साढ़े / sadhe: e.g. "साढ़े नौ बजे", "sadhe nau baje"
    const sadheDevaRe = /(साढ़े\s+([^\s]+))\s*बजे/;
    const sm = sadheDevaRe.exec(text);
    if (sm) {
      const baseWord = sm[2];
      const baseTime = HINDI_NUM_WORDS[baseWord] || '';
      const hourNum = baseTime.split(':')[0];
      const t = hourNum ? `${hourNum}:30` : sm[1];
      hourStr = `${t} बजे`;
      matchedSpans.push([sm.index, sm.index + sm[0].length]);
      timeParts.push(hourStr);
    } else {
      // (c) Word time in Devanagari: "आठ बजे", "दस बजे", etc.
      const wordTimeRe = /([^\s]+)\s*बजे/;
      const wm = wordTimeRe.exec(text);
      if (wm && HINDI_NUM_WORDS[wm[1]]) {
        const canonical = HINDI_NUM_WORDS[wm[1]];
        hourStr = `${canonical} बजे`;
        matchedSpans.push([wm.index, wm.index + wm[0].length]);
        timeParts.push(hourStr);
      } else {
        // (d) Word time in Roman: "aath baje", "das baje"
        const romanWordRe = /\b([a-z]+)\s+baje\b/i;
        const rm = romanWordRe.exec(lower);
        if (rm && ROMAN_NUM_WORDS[rm[1]]) {
          const canonical = ROMAN_NUM_WORDS[rm[1]];
          hourStr = `${canonical} baje`;
          matchedSpans.push([rm.index, rm.index + rm[0].length]);
          timeParts.push(hourStr);
        }
      }
    }
  }

  // 4. Also capture standalone particles attached to time: "को", "में", "तक", "ko", "mein", "tak"
  const particleRe = /^(?:\s+(?:को|में|पर|तक|से|ko|mein|me|tak|se))\b/i;

  if (timeParts.length === 0) {
    return {
      success: false,
      confidence: 'none',
      hasCorrection,
      method: 'rules',
    };
  }

  // 5. Construct extracted task by removing time parts and connecting particles
  const mask = new Array(text.length).fill(false);
  for (const [start, end] of matchedSpans) {
    for (let i = start; i < end; i++) mask[i] = true;
    const rest = text.slice(end);
    const pm = particleRe.exec(rest);
    if (pm) {
      for (let i = end; i < end + pm[0].length; i++) mask[i] = true;
    }
  }

  let task = '';
  for (let i = 0; i < text.length; i++) {
    if (!mask[i]) task += text[i];
  }

  // Clean filler words, discourse particles, stutters, and remnant particles
  task = cleanTask(task);

  const finalTime = timeParts.join(' ').replace(/\s+/g, ' ').trim();

  // If correction or time change is detected, confidence is NEVER high!
  let confidence: 'high' | 'partial' | 'none' = 'none';
  if (task && finalTime) {
    if (hasCorrection) {
      confidence = 'partial'; // Must call model, rule cannot be fully trusted
    } else if (hourStr || daypartFound || dayFound) {
      confidence = 'high';
    } else {
      confidence = 'partial';
    }
  }

  return {
    success: Boolean(task && finalTime),
    काम: task || undefined,
    समय: finalTime || undefined,
    confidence,
    hasCorrection,
    method: 'rules',
  };
}

/**
 * Strict mismatch check against input sentence.
 * Guards against hallucinations (e.g. inventing words/hours not present in user input).
 */
export function checkMismatch(
  inputText: string,
  result: { काम?: string; समय?: string } | null | undefined
): { ok: boolean; reason: string } {
  if (!result || !result.काम || !result.समय) {
    return { ok: false, reason: 'Missing required keys "काम" or "समय"' };
  }

  const normInput = inputText.toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');
  const normTask = String(result.काम).toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');
  const normTime = String(result.समय).toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ');

  // Task check: at least one significant keyword (>2 chars) from task must be in input
  const stopWords = new Set([
    'है', 'था', 'थी', 'hai', 'tha', 'ho', 'karna', 'karni', 'dena', 'deni', 'lena', 'leni',
    'bhai', 'arre', 'zara', 'na', 'mat', 'yaad', 'rakhna', 'bhoolna',
  ]);
  const taskWords = normTask.split(' ').filter((w) => w.length > 2 && !stopWords.has(w));
  const taskInInput = taskWords.length === 0 || taskWords.some((w) => normInput.includes(w));

  if (!taskInInput) {
    return { ok: false, reason: `Task '${result.काम}' contains fabricated tokens not in input` };
  }

  // Time check: extracted time must not fabricate hours or dayparts not in input
  const timeKeywords = normTime.split(' ').filter((w) => w.length > 1 && !['ko', 'me', 'mein', 'baje', 'बजे', '00'].includes(w));
  for (const kw of timeKeywords) {
    if (/^\d+$/.test(kw)) {
      const digitFound =
        normInput.includes(kw) ||
        Object.entries(HINDI_NUM_WORDS).some(([hw, val]) => val.startsWith(kw) && normInput.includes(hw)) ||
        Object.entries(ROMAN_NUM_WORDS).some(([rw, val]) => val.startsWith(kw) && normInput.includes(rw));
      if (!digitFound) {
        return { ok: false, reason: `Time '${result.समय}' contains fabricated hour '${kw}' not in input` };
      }
    } else {
      const kwFound =
        normInput.includes(kw) ||
        (kw.startsWith('रात') && (normInput.includes('रात') || normInput.includes('raat') || normInput.includes('night'))) ||
        (kw.startsWith('शाम') && (normInput.includes('शाम') || normInput.includes('shaam') || normInput.includes('sham'))) ||
        (kw.startsWith('दोपहर') && (normInput.includes('दोपहर') || normInput.includes('dopahar') || normInput.includes('dopehar'))) ||
        (kw.startsWith('सुबह') && (normInput.includes('सुबह') || normInput.includes('subah') || normInput.includes('savere') || normInput.includes('सवेरे')));
      if (!kwFound) {
        return { ok: false, reason: `Time '${result.समय}' contains fabricated token '${kw}' not in input` };
      }
    }
  }

  return { ok: true, reason: 'Task and time match input text keywords' };
}

/**
 * Normalizes time string into canonical components for comparison.
 */
export function parseTimeComponents(str: string | undefined): { day: string | null; daypart: string | null; time: string | null } {
  if (!str) return { day: null, daypart: null, time: null };
  const s = str.toLowerCase().replace(/[\s:,\.\-–—_]+/g, ' ').trim();
  const words = s.split(' ');

  let day: string | null = null;
  for (const w of words) {
    if (['कल', 'kal'].includes(w)) day = 'कल';
    else if (['परसों', 'parso', 'parson'].includes(w)) day = 'परसों';
    else if (['आज', 'aaj'].includes(w)) day = 'आज';
    else if (['सोमवार', 'somwar', 'monday'].includes(w)) day = 'सोमवार';
    else if (['मंगलवार', 'mangalwar', 'tuesday'].includes(w)) day = 'मंगलवार';
    else if (['बुधवार', 'budhwar', 'wednesday'].includes(w)) day = 'बुधवार';
    else if (['गुरुवार', 'guruwar', 'thursday'].includes(w)) day = 'गुरुवार';
    else if (['शुक्रवार', 'shukrawar', 'friday'].includes(w)) day = 'शुक्रवार';
    else if (['शनिवार', 'shaniwar', 'saturday'].includes(w)) day = 'शनिवार';
    else if (['रविवार', 'इतवार', 'ravivar', 'sunday'].includes(w)) day = 'रविवार';
  }

  let daypart: string | null = null;
  for (const w of words) {
    if (['सुबह', 'सवेरे', 'भोर', 'subah', 'savere', 'morning'].includes(w)) daypart = 'सुबह';
    else if (['दोपहर', 'dopehar', 'dopahar', 'afternoon'].includes(w)) daypart = 'दोपहर';
    else if (['शाम', 'shaam', 'sham', 'evening'].includes(w)) daypart = 'शाम';
    else if (['रात', 'रात्र', 'raat', 'night'].includes(w)) daypart = 'रात';
  }

  let time: string | null = null;
  const hmMatch = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (hmMatch) {
    time = `${parseInt(hmMatch[1], 10)}:${hmMatch[2]}`;
  } else {
    const hMatch = s.match(/(?:^|\s)(\d{1,2})\s*(?:बजे|baje|am|pm|\b)/);
    if (hMatch && parseInt(hMatch[1], 10) <= 24 && parseInt(hMatch[1], 10) > 0) {
      time = `${parseInt(hMatch[1], 10)}:00`;
    } else {
      for (const [w, t] of Object.entries({ ...HINDI_NUM_WORDS, ...ROMAN_NUM_WORDS })) {
        if (words.includes(w)) {
          time = t;
          break;
        }
      }
    }
  }

  return { day, daypart, time };
}

/**
 * Checks whether two time expressions match canonically.
 */
export function isCanonicalTimeMatch(a: string | undefined, b: string | undefined): boolean {
  const pA = parseTimeComponents(a);
  const pB = parseTimeComponents(b);
  if (pA.day !== pB.day) return false;
  if (pA.daypart !== pB.daypart) return false;
  if (pA.time !== pB.time) return false;
  return true;
}

export type HybridResult =
  | { ok: true; data: { काम: string; समय: string }; method: 'rules' | 'model_1b'; confidence: 'high' | 'model' }
  | { ok: false; clarificationNeeded: true; message: 'समझ नहीं आया, दोबारा बोलिए'; reason: string };

/**
 * Hybrid Extractor:
 * 1. Runs rules first.
 * 2. If rules confidence is 'high' and no correction words/repetitions: verifies checkMismatch. If ok -> returns rules result.
 * 3. If confidence is partial or hasCorrection: calls 1B model.
 * 4. Verifies checkMismatch on model result. If fail -> discards response!
 * 5. If hasCorrection and rules and model differ: discards response and asks "समझ नहीं आया, दोबारा बोलिए".
 */
export async function extractHybrid(
  inputText: string,
  modelCaller?: (text: string) => Promise<{ ok: boolean; data?: { काम?: string; समय?: string }; raw?: string }>
): Promise<HybridResult> {
  const rules = extractByRules(inputText);

  // Fast path: high confidence and no self-correction
  if (rules.confidence === 'high' && !rules.hasCorrection && rules.काम && rules.समय) {
    const mm = checkMismatch(inputText, { काम: rules.काम, समय: rules.समय });
    if (mm.ok) {
      return {
        ok: true,
        data: { काम: rules.काम, समय: rules.समय },
        method: 'rules',
        confidence: 'high',
      };
    }
  }

  // Model path: needed when confidence is partial, or when correction occurred
  if (!modelCaller) {
    // If no model caller provided, fail safely if correction was detected
    if (rules.hasCorrection) {
      return {
        ok: false,
        clarificationNeeded: true,
        message: 'समझ नहीं आया, दोबारा बोलिए',
        reason: 'correction_detected_without_model',
      };
    }
    if (rules.काम && rules.समय && checkMismatch(inputText, { काम: rules.काम, समय: rules.समय }).ok) {
      return {
        ok: true,
        data: { काम: rules.काम, समय: rules.समय },
        method: 'rules',
        confidence: 'high',
      };
    }
    return {
      ok: false,
      clarificationNeeded: true,
      message: 'समझ नहीं आया, दोबारा बोलिए',
      reason: 'extraction_incomplete',
    };
  }

  const modelRes = await modelCaller(inputText);
  if (!modelRes.ok || !modelRes.data || !modelRes.data.काम || !modelRes.data.समय) {
    return {
      ok: false,
      clarificationNeeded: true,
      message: 'समझ नहीं आया, दोबारा बोलिए',
      reason: 'model_call_failed',
    };
  }

  // Real-path mismatch check:
  // "जाँच फ़ेल हो तो जवाब फेंक दो और कभी सहेजो मत।"
  const mismatch = checkMismatch(inputText, modelRes.data);
  if (!mismatch.ok) {
    return {
      ok: false,
      clarificationNeeded: true,
      message: 'समझ नहीं आया, दोबारा बोलिए',
      reason: `mismatch_check_failed: ${mismatch.reason}`,
    };
  }

  // If self-correction occurred, verify whether rules and model disagree
  // "अगर दोनों में फ़र्क आए तो सहेजो मत, पूछो 'समझ नहीं आया, दोबारा बोलिए'।"
  if (rules.hasCorrection) {
    const timeAgrees = isCanonicalTimeMatch(rules.समय, modelRes.data.समय);
    if (!timeAgrees) {
      return {
        ok: false,
        clarificationNeeded: true,
        message: 'समझ नहीं आया, दोबारा बोलिए',
        reason: `correction_discrepancy: rules saw '${rules.समय}' while model saw '${modelRes.data.समय}'`,
      };
    }
  }

  return {
    ok: true,
    data: { काम: modelRes.data.काम, समय: modelRes.data.समय },
    method: 'model_1b',
    confidence: 'model',
  };
}
