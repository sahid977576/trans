(function (global) {
  const SCRIPT_RANGES = [
    ['bn', /[\u0980-\u09FF]/g], ['hi', /[\u0900-\u097F]/g], ['pa', /[\u0A00-\u0A7F]/g],
    ['gu', /[\u0A80-\u0AFF]/g], ['or', /[\u0B00-\u0B7F]/g], ['ta', /[\u0B80-\u0BFF]/g],
    ['te', /[\u0C00-\u0C7F]/g], ['kn', /[\u0C80-\u0CFF]/g], ['ml', /[\u0D00-\u0D7F]/g],
    ['ar', /[\u0600-\u06FF\u0750-\u077F]/g], ['th', /[\u0E00-\u0E7F]/g],
    ['ru', /[\u0400-\u04FF]/g], ['ja', /[\u3040-\u30FF]/g], ['ko', /[\uAC00-\uD7AF]/g],
    ['zh-CN', /[\u3400-\u4DBF\u4E00-\u9FFF]/g]
  ];
  const COMMON_WORDS = {
    en: ['the', 'and', 'that', 'this', 'with', 'from', 'for', 'are', 'was', 'not', 'you', 'have'],
    hi: ['और', 'यह', 'एक', 'के', 'का', 'की', 'में', 'से', 'है', 'नहीं', 'आप', 'पर'],
    mr: ['आणि', 'हे', 'एक', 'च्या', 'मध्ये', 'पासून', 'आहे', 'नाही', 'तुम्ही', 'वर'],
    ar: ['ال', 'هذا', 'هذه', 'من', 'في', 'على', 'مع', 'هو', 'هي', 'ليس'],
    ur: ['یہ', 'اور', 'ایک', 'کے', 'کی', 'میں', 'سے', 'ہے', 'نہیں', 'آپ'],
    fa: ['این', 'و', 'برای', 'که', 'در', 'با', 'است', 'یک', 'نیست'],
    es: ['el', 'la', 'los', 'las', 'que', 'para', 'con', 'una', 'por', 'del', 'como'],
    fr: ['le', 'la', 'les', 'des', 'une', 'que', 'pour', 'avec', 'dans', 'est', 'sur'],
    de: ['der', 'die', 'das', 'und', 'den', 'mit', 'für', 'von', 'nicht', 'ist', 'ein'],
    pt: ['o', 'a', 'os', 'as', 'que', 'para', 'com', 'uma', 'por', 'dos', 'não'],
    it: ['il', 'la', 'le', 'gli', 'che', 'per', 'con', 'una', 'del', 'non', 'sono'],
    nl: ['de', 'het', 'een', 'en', 'van', 'voor', 'met', 'dat', 'niet', 'zijn'],
    tr: ['bir', 've', 'bu', 'için', 'ile', 'olan', 'değil', 'gibi', 'daha'],
    id: ['yang', 'dan', 'untuk', 'dengan', 'ini', 'dari', 'tidak', 'ada'],
    vi: ['của', 'và', 'cho', 'một', 'trong', 'được', 'này', 'không', 'với']
  };
  const LANGUAGE_NAMES = { en: 'English', bn: 'Bengali', hi: 'Hindi', ur: 'Urdu', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', ru: 'Russian', 'zh-CN': 'Chinese Simplified', 'zh-TW': 'Chinese Traditional', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', fa: 'Persian', pa: 'Punjabi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', or: 'Odia', as: 'Assamese' };

  function normalizeLanguageCode(value) {
    const code = String(value || '').trim().toLowerCase().replace('_', '-');
    if (!code) return '';
    if (code === 'zh-tw' || code === 'zh-hk' || code === 'zh-hant') return 'zh-TW';
    if (code === 'zh-cn' || code === 'zh-sg' || code === 'zh-hans' || code === 'zh') return 'zh-CN';
    return code.split('-')[0];
  }

  function visibleSample(root = document.body, limit = 7000) {
    if (!root) return '';
    const excluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'NAV', 'INPUT', 'SELECT', 'OPTION']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks = [];
    let length = 0;
    let node;
    while ((node = walker.nextNode()) && length < limit) {
      const parent = node.parentElement;
      if (!parent || excluded.has(parent.tagName) || parent.closest('[hidden], [aria-hidden="true"], [data-no-translate], [data-swt-controller], [data-swt-selection]')) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.fontSize === '0px') continue;
      const text = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (text.length < 3 || !/[\p{L}]/u.test(text)) continue;
      chunks.push(text.slice(0, limit - length));
      length += text.length;
    }
    return chunks.join(' ');
  }

  function metadataLanguage() {
    const html = normalizeLanguageCode(document.documentElement?.getAttribute('lang'));
    if (html) return { language: html, confidence: 0.45, source: 'html-lang' };
    const meta = [...document.querySelectorAll('meta[http-equiv], meta[property], meta[name]')].find(element => {
      const key = `${element.getAttribute('http-equiv') || ''} ${element.getAttribute('property') || ''} ${element.getAttribute('name') || ''}`.toLowerCase();
      return /content-language|og:locale|language|locale/.test(key);
    });
    const value = normalizeLanguageCode(meta?.content);
    return value ? { language: value, confidence: 0.35, source: 'meta' } : null;
  }

  function detectTextLanguage(text) {
    const letters = [...text].filter(character => /\p{L}/u.test(character));
    if (letters.length < 40) return null;
    const scriptScores = SCRIPT_RANGES.map(([language, pattern]) => ({ language, count: (text.match(pattern) || []).length })).filter(item => item.count > 0).sort((a, b) => b.count - a.count);
    const words = text.toLowerCase().match(/[\p{L}]+(?:['’-][\p{L}]+)*/gu) || [];
    const scores = Object.entries(COMMON_WORDS).map(([language, common]) => ({ language, count: words.filter(word => common.includes(word)).length }));
    scores.sort((a, b) => b.count - a.count);
    const sharedScript = new Set(['hi', 'ar']).has(scriptScores[0]?.language);
    if (sharedScript && scores[0]?.count >= 2 && scores[0].count > (scores[1]?.count || 0)) {
      return { language: scores[0].language, confidence: Math.min(0.92, 0.68 + scores[0].count / Math.max(words.length, 1) * 2.5), source: 'text' };
    }
    if (scriptScores[0] && scriptScores[0].count / letters.length >= 0.25) {
      const ratio = scriptScores[0].count / letters.length;
      return { language: scriptScores[0].language, confidence: sharedScript ? 0.78 : Math.min(0.98, 0.72 + ratio * 0.25), source: 'text' };
    }
    if (!scores[0] || scores[0].count < 2 || scores[0].count === scores[1]?.count) return null;
    const confidence = Math.min(0.9, 0.55 + (scores[0].count / Math.max(words.length, 1)) * 2.5);
    return confidence >= 0.62 ? { language: scores[0].language, confidence, source: 'text' } : null;
  }

  function detectPageLanguage() {
    const text = visibleSample();
    const textResult = detectTextLanguage(text);
    if (textResult) return { ...textResult, sample: text };
    return { ...(metadataLanguage() || { language: '', confidence: 0, source: 'unknown' }), sample: text };
  }

  global.detectPageLanguage = detectPageLanguage;
  global.normalizeLanguageCode = normalizeLanguageCode;
  global.languageName = code => LANGUAGE_NAMES[code] || LANGUAGE_NAMES[normalizeLanguageCode(code)] || code;
})(globalThis);