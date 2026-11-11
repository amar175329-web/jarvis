// What the voice lab page plays. `tag` null = no emotion tag (the baseline to compare against).
// `prod: true` = the tag JARVIS really uses (see tags.ts). `raw: true` = sent exactly as written (experimental Fish tags, not yet used by JARVIS).
export type LabVoice = 'jarvis' | 'helper';
export interface LabVariant { label: string; tag: string | null; voice?: LabVoice; raw?: string; prod?: boolean; experimental?: boolean; pace?: { speed?: number; gapMs?: number; commaPause?: boolean }; tuning?: { temperature?: number; top_p?: number; normalize?: boolean }; join?: boolean }
export interface LabGroup { id: string; title: string; why: string; text: string; voice: LabVoice; mode?: 'normal' | 'focus' | 'night' | 'chill' | 'workout'; situation?: 'greeting' | 'good_news' | 'bad_news' | 'joke' | 'alert' | 'normal'; variants: LabVariant[] }

export const PACE_VARIANTS: LabVariant[] = [
  { label: 'A. अभी जैसा (तेज़): गति 1.0, कोई ठहराव नहीं, वाक्यों के बीच gap 0', tag: null, pace: { speed: 1.0, commaPause: false, gapMs: 0 } },
  { label: 'B. सुझाव: गति 0.93, कॉमा पर ठहराव, वाक्यों के बीच 350 ms', tag: null, prod: true },
  { label: 'C. और धीमा: गति 0.85, कॉमा पर ठहराव, वाक्यों के बीच 450 ms', tag: null, pace: { speed: 0.85, gapMs: 450 } },
  { label: 'D. सिर्फ़ ठहराव (गति 1.0 वही), कॉमा पर और वाक्यों के बीच 350 ms', tag: null, pace: { speed: 1.0 } },
  { label: 'E. सिर्फ़ धीमा (0.9), बिना ठहराव, gap 0', tag: null, pace: { speed: 0.9, commaPause: false, gapMs: 0 } },
];
export const LAB_GROUPS: LabGroup[] = [
  { id: 'tune', title: 'सही शब्द, एक जैसी आवाज़: कल, बस, जब, सब, तब, अब', why: 'पेज "सुना गया" भी दिखाएगा: मशीन ने आवाज़ को वापस लिखा। "कल" का "कॉल" बन जाए तो यहीं पकड़ में आएगा।', voice: 'jarvis',
    text: 'बॉस, कल की मीटिंग दस बजे है। अब बस एक काम बाकी है, जब कहोगे तब सब बता दूँगा।',
    variants: [
      { label: 'T1. अभी की सेटिंग (temperature 0.7, normalize चालू)', tag: null, tuning: { temperature: 0.7, normalize: true } },
      { label: 'T2. आवाज़ ज़्यादा टिकाऊ (temperature 0.4), normalize चालू', tag: null, tuning: { temperature: 0.4, normalize: true } },
      { label: 'T3. normalize बंद (जो लिखा वही), temperature 0.7', tag: null, tuning: { temperature: 0.7, normalize: false } },
      { label: 'T4. सुझाव: temperature 0.5, normalize बंद', tag: null, prod: true },
      { label: 'T5. temperature 0.4, normalize बंद', tag: null, tuning: { temperature: 0.4, normalize: false } },
      { label: 'T6. पूरा जवाब एक ही बार में (एक टेक), temperature 0.5, normalize बंद', tag: null, join: true },
    ] },
  { id: 'pace1', title: 'गति और ठहराव (1): तीन वाक्य, कई कॉमा. सबसे पहले यही सुनो', why: 'कौन सा ज़्यादा इंसानी लगता है: A से E तक। सिर्फ़ गति, सिर्फ़ ठहराव, या दोनों?', voice: 'jarvis', text: 'बॉस, आज का दिन ऐसा है। सुबह दस बजे मीटिंग है, दोपहर में दो काम बाकी हैं। शाम को खाली समय है, चाहो तो उसमें जिम रख दूँ।', variants: PACE_VARIANTS },
  { id: 'pace2', title: 'गति और ठहराव (2): एक लंबा वाक्य', why: 'कॉमा पर साँस लेने जैसा रुकाव आ रहा है या नहीं', voice: 'jarvis', text: 'बॉस, एक बात बतानी थी, कल की मीटिंग का समय बदल गया है, अब वह ग्यारह बजे होगी।', variants: PACE_VARIANTS.slice(0, 3) },
  { id: 'pace3', title: 'गति और ठहराव (3): छोटा जवाब', why: 'छोटे जवाब में भी बहुत धीमा तो नहीं लग रहा?', voice: 'jarvis', text: 'ठीक है बॉस, कर दिया। कुछ और चाहिए तो बोलना।', variants: PACE_VARIANTS.slice(0, 3) },
  { id: 'greet', situation: 'greeting', title: 'सुबह की नमस्ते (greeting)', why: 'पहली बात दिन की: गर्मजोशी आनी चाहिए', voice: 'jarvis', text: 'सुप्रभात, बॉस। आज तीन काम हैं, पहली मीटिंग 10:30 AM पर है।',
    variants: [{ label: 'बिना tag (तुलना के लिए)', tag: null }, { label: 'warm', tag: 'warm', prod: true }] },
  { id: 'good', situation: 'good_news', title: 'अच्छी ख़बर', why: 'ख़ुशी सुनाई देनी चाहिए, चिल्लाहट नहीं', voice: 'jarvis', text: 'बॉस, काम हो गया! सब कुछ पहली बार में चल गया।',
    variants: [{ label: 'बिना tag', tag: null }, { label: 'happy', tag: 'happy', prod: true }, { label: 'excited (प्रयोग)', tag: 'excited', experimental: true, raw: '[excited] बॉस, काम हो गया! सब कुछ पहली बार में चल गया।' }] },
  { id: 'joke', situation: 'joke', title: 'एक लाइन का dry मज़ाक', why: 'हल्की सूखी तान, हँसी नहीं', voice: 'jarvis', text: 'आज भी सब कुछ मैं ही करूँगा, वैसे।',
    variants: [{ label: 'बिना tag', tag: null }, { label: 'dry tone', tag: 'dry tone', prod: true }, { label: 'laughing (प्रयोग)', tag: 'laughing', experimental: true, raw: '[laughing] आज भी सब कुछ मैं ही करूँगा, वैसे।' }] },
  { id: 'night', mode: 'night', title: 'रात का मोड', why: 'धीमी, हल्की आवाज़', voice: 'jarvis', text: 'रात हो गई, बॉस। कल सुबह उठा दूँगा।',
    variants: [{ label: 'बिना tag', tag: null }, { label: 'softly', tag: 'softly', prod: true }, { label: 'whispering (प्रयोग)', tag: 'whispering', experimental: true, raw: '[whispering] रात हो गई, बॉस। कल सुबह उठा दूँगा।' }] },
  { id: 'chill', mode: 'chill', title: 'चिल मोड', why: 'आराम वाला, बिना जल्दी', voice: 'jarvis', text: 'आराम से, बॉस। कोई जल्दी नहीं है। जब मन करे तब बताना।',
    variants: [{ label: 'बिना tag', tag: null }, { label: 'relaxed', tag: 'relaxed', prod: true }] },
  { id: 'workout', mode: 'workout', title: 'वर्कआउट मोड', why: 'जोश', voice: 'jarvis', text: 'चलो बॉस, दस मिनट और! तुम कर सकते हो।',
    variants: [{ label: 'बिना tag', tag: null }, { label: 'energetic', tag: 'energetic', prod: true }, { label: 'excited (प्रयोग)', tag: 'excited', experimental: true, raw: '[excited] चलो बॉस, दस मिनट और! तुम कर सकते हो।' }] },
  { id: 'bad', situation: 'bad_news', title: 'बुरी ख़बर', why: 'नियम: कोई tag नहीं, कोई मज़ाक नहीं, सीधी और नरम आवाज़', voice: 'jarvis', text: 'बॉस, मीटिंग रद्द हो गई है। नई तारीख़ अभी तय नहीं हुई।',
    variants: [{ label: 'बिना tag (JARVIS यही बोलेगा)', tag: null, prod: true }, { label: 'sad (सिर्फ़ प्रयोग, JARVIS नहीं बोलेगा)', tag: 'sad', experimental: true, raw: '[sad] बॉस, मीटिंग रद्द हो गई है। नई तारीख़ अभी तय नहीं हुई।' }] },
  { id: 'alert', situation: 'alert', title: 'चेतावनी', why: 'नियम: बिना tag, साफ़ और सीधी', voice: 'jarvis', text: 'बॉस, ध्यान दो! बैटरी पाँच प्रतिशत बची है।', variants: [{ label: 'बिना tag (JARVIS यही बोलेगा)', tag: null, prod: true }] },
  { id: 'confirm', title: 'काम से पहले दोहराना', why: 'मैसेज भेजने से पहले पूरा पढ़कर पूछना', voice: 'jarvis', text: 'अमित को मैसेज भेज रहा हूँ: आज की मीटिंग साढ़े दस बजे रखते हैं। भेज दूँ?', variants: [{ label: 'बिना tag', tag: null, prod: true }] },
  { id: 'numbers', title: 'अंक और समय (हिंदी में बदलाव)', why: '18:45, 3, 40% हिंदी शब्दों में पढ़े जाने चाहिए', voice: 'jarvis', text: 'तुम्हारी ट्रेन 18:45 पर है, प्लेटफ़ॉर्म 3 पर। बैटरी 40% है।', variants: [{ label: 'बिना tag', tag: null, prod: true }] },
  { id: 'pause', title: 'रुकना (pause)', why: 'Fish का [break] असली रुकाव देता है या नहीं', voice: 'jarvis', text: 'एक मिनट, बॉस। हाँ, मिल गया।',
    variants: [{ label: 'बिना pause', tag: null }, { label: '[break] बीच में (प्रयोग)', tag: 'break', experimental: true, raw: 'एक मिनट, बॉस। [break] हाँ, मिल गया।' }] },
  { id: 'long', title: 'थोड़ा लंबा जवाब', why: 'कई वाक्य जुड़कर सहज लगते हैं या नहीं', voice: 'jarvis', text: 'बॉस, आज का दिन ऐसा है। सुबह दस बजे मीटिंग है। दोपहर में दो काम बाकी हैं। शाम को खाली समय है, चाहो तो उसमें जिम रख दूँ।', variants: [{ label: 'बिना tag', tag: null, prod: true }] },
  { id: 'h-board', title: 'बोर्ड का अपडेट (छोटा helper)', why: 'बोर्ड, बॉट और छोटी चीज़ों की आवाज़', voice: 'helper', text: 'टास्क बोर्ड अपडेट हो गया। दो काम पूरे, तीन बाकी।', variants: [{ label: 'बिना tag', tag: null, prod: true }, { label: 'warm', tag: 'warm' }] },
  { id: 'h-bot', title: 'बॉट का काम पूरा (helper)', why: '', voice: 'helper', text: 'बॉट ने काम पूरा कर लिया है। नतीजा तैयार है।', variants: [{ label: 'बिना tag', tag: null, prod: true }, { label: 'happy', tag: 'happy' }] },
  { id: 'h-notif', title: 'नोटिफ़िकेशन (helper)', why: '', voice: 'helper', text: 'तीन नए नोटिफ़िकेशन आए हैं।', variants: [{ label: 'बिना tag', tag: null, prod: true }] },
  { id: 'h-remind', title: 'रिमाइंडर (helper)', why: '', voice: 'helper', text: 'रिमाइंडर: पानी पीने का टाइम हो गया।', variants: [{ label: 'बिना tag', tag: null, prod: true }, { label: 'softly', tag: 'softly' }] },
  { id: 'h-err', title: 'बॉट में गड़बड़ (helper)', why: 'बुरी ख़बर: बिना tag', voice: 'helper', text: 'बॉट में कुछ गड़बड़ हो गई। दोबारा कोशिश करूँ?', variants: [{ label: 'बिना tag', tag: null, prod: true }] },
  { id: 'cmp', title: 'दोनों आवाज़ें आमने-सामने', why: 'एक ही वाक्य, JARVIS बनाम helper', voice: 'jarvis', text: 'ठीक है बॉस, हो गया। और कुछ चाहिए तो बोल देना।',
    variants: [{ label: 'JARVIS (calm)', tag: null, voice: 'jarvis', prod: true }, { label: 'helper (indian)', tag: null, voice: 'helper' }] },
];
