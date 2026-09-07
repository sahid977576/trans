async function translateFree(texts, target, source = 'auto', timeout = 15000) {
  if (!texts.length) return [];
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try { const query = texts.join('\n'); const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(query)}`; const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error('Free translation service is unavailable.'); const data = await response.json(); return (data[0] || []).map(item => item[0] || '').join('').split('\n'); }
  catch (error) { if (error.name === 'AbortError') throw new Error('Translation timed out.'); throw new Error('Free translation failed. Check your connection and try again.'); }
  finally { clearTimeout(timer); }
}

async function detectFreeLanguage(text, timeout = 10000) {
  if (!text || text.length < 40) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text.slice(0, 1200))}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const language = data[2] || '';
    return language ? { language, confidence: 0.8, source: 'provider' } : null;
  } catch (error) { return null; }
  finally { clearTimeout(timer); }
}