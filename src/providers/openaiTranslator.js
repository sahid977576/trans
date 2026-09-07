async function translateWithOpenAI(texts, target, apiKey, timeout = 20000, source = 'auto', sameLanguage = false) {
  if (!apiKey) throw new Error('Add an OpenAI API key in Settings to use AI mode.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try { const instruction = sameLanguage ? `Rewrite each numbered item in natural ${target}. Keep the exact meaning, improve naturalness, clarity, grammar, and readability, preserve technical terms, do not add information, do not translate into another language, and return only the rewritten items one per line.` : `Translate each numbered item from ${source || 'the detected source language'} into ${target}. Keep the meaning, preserve technical terms, do not add information, and return only the translated items one per line.`; const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'system', content: instruction }, { role: 'user', content: texts.map((text, index) => `${index + 1}. ${text}`).join('\n') }] }) }); if (response.status === 401) throw new Error('The OpenAI API key is invalid.'); if (response.status === 429) throw new Error('OpenAI rate limit reached. Try again later.'); if (!response.ok) throw new Error('OpenAI translation failed.'); const data = await response.json(); return (data.choices?.[0]?.message?.content || '').split('\n').map(line => line.replace(/^\s*\d+[.)]\s*/, '').trim()); }
  catch (error) { if (error.name === 'AbortError') throw new Error('AI translation timed out.'); throw error; }
  finally { clearTimeout(timer); }
}

async function detectWithOpenAI(text, apiKey, timeout = 15000) {
  if (!apiKey || !text || text.length < 40) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, max_tokens: 20, messages: [{ role: 'system', content: 'Identify the language of the text. Return only its ISO 639-1 code, such as en, bn, or hi.' }, { role: 'user', content: text.slice(0, 2000) }] }) });
    if (!response.ok) return null;
    const data = await response.json();
    const language = (data.choices?.[0]?.message?.content || '').trim().match(/[a-z]{2}(?:-[A-Z]{2})?/i)?.[0] || '';
    return language ? { language, confidence: 0.9, source: 'ai' } : null;
  } catch (error) { return null; }
  finally { clearTimeout(timer); }
}