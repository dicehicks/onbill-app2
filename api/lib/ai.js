// Uses Claude (with web search turned on) to find things Spotify doesn't
// track, like where a band is actually based, and to suggest other local
// bands with a similar sound.
//
// Cost note: web search calls cost extra per search on top of normal
// token cost. This file is written to use as FEW web-search calls as
// possible per user search — 2 total (one for the anchor band, one for
// all candidates + their scores together) rather than one per band.

async function callClaude(prompt, { webSearch = true, maxTokens = 1200, maxSearches = 3 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }

  const body = {
    model: 'claude-haiku-4-5-20251001', // cheaper tier - this task is extraction/summarization, not complex reasoning
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (webSearch) {
    // max_uses hard-caps how many searches this call can run - web search is
    // billed separately from tokens ($10 per 1,000 searches), so this puts a
    // firm ceiling on the most expensive part of each call.
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return text;
}

function parseJsonLoose(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{') === -1 ? cleaned.indexOf('[') : cleaned.indexOf('{');
  const jsonSlice = start >= 0 ? cleaned.slice(start) : cleaned;
  return JSON.parse(jsonSlice);
}

// One web-search call: background info on the anchor band the user typed in.
async function lookupBandBackground(name, cityHint) {
  const prompt = `Search the web for the band or musical act called "${name}"${
    cityHint ? ` (possibly based in or near ${cityHint})` : ''
  }. Use as few searches as you reasonably can - one or two focused searches should be enough.

Respond with ONLY a JSON object, no other text, no markdown formatting, in exactly this shape:
{"city": "the city/town they are based in, or null if unknown", "active_since": "year they formed, or null if unknown", "bio": "one sentence, under 25 words, general background/context", "sound": "under 35 words describing ONLY sonic characteristics: instrumentation, vocal style, tempo/energy, production feel, and 1-2 comparable artists if there's a clear reference point", "found": true or false}

Set "found" to false if you cannot find real information about a real, currently or recently active band with this name.`;

  const text = await callClaude(prompt, { maxSearches: 2 });
  try {
    return parseJsonLoose(text);
  } catch {
    return { found: false, city: null, active_since: null, bio: null, sound: null };
  }
}

// ONE web-search call that does three jobs at once: finds candidate bands,
// researches their sound, and scores sonic similarity against the anchor —
// all in a single pass, instead of a separate expensive lookup per band.
async function suggestAndScoreSimilarBands(anchor) {
  const geoInstruction = anchor.city
    ? `Only include bands based within approximately 80 miles of ${anchor.city} — this needs to be a realistic driving distance for an actual local show, not just "same general region." Geography is a hard requirement here, not a preference: exclude a band entirely if it's clearly further than that, even if it sounds like a great match. Within that 80-mile radius, rank purely by sound.`
    : `The reference band's location is unknown, so search more broadly rather than assuming a specific area.`;

  const prompt = `You are a music researcher. Find real, currently active bands that SOUND like this reference band, then score how close each match actually is.

Reference band: "${anchor.name}"
Reference sound: ${anchor.sound || anchor.bio || 'unknown'}
Reference tags (weak supporting signal only, often sparse/unreliable — do not rely on this alone): ${anchor.tags.join(', ') || 'none'}
Reference based in: ${anchor.city || 'unknown'}

${geoInstruction}

Search the web and find up to 4 real, currently active bands whose actual musical style — instrumentation, vocal style, tempo/energy, production feel — closely matches the reference. Within the geographic constraint above, sonic similarity is what matters, not scene familiarity: do not include a band just because it has shared a bill with the reference before. Be efficient — use as few searches as you reasonably can, ideally one focused search per candidate rather than many searches per band.

For each one, write your own short sound description the same way you would for the reference, then judge similarity yourself.

Respond with ONLY a JSON array, no other text, no markdown formatting, in exactly this shape:
[{"name": "Band Name", "city": "their city or null", "sound": "under 30 words, same style as the reference sound description", "score": 0-100 how sonically similar to the reference, "reason": "under 12 words"}]

Order from closest match to least. Only include bands you're reasonably confident actually exist and are currently active. Return fewer than 4 if you can't find enough genuine matches — do not pad the list.`;

  const text = await callClaude(prompt, { maxTokens: 1800, maxSearches: 5 });
  try {
    const result = parseJsonLoose(text);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

module.exports = { lookupBandBackground, suggestAndScoreSimilarBands };
