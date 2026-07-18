// Uses Claude (with web search turned on) to find things Spotify doesn't
// track, like where a band is actually based, and to suggest other local
// bands with a similar sound.

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  // Pull out just the text parts of the response (ignore tool-use blocks).
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return text;
}

// Strips markdown code fences if Claude wraps its JSON in them, then parses.
function parseJsonLoose(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{') === -1 ? cleaned.indexOf('[') : cleaned.indexOf('{');
  const jsonSlice = start >= 0 ? cleaned.slice(start) : cleaned;
  return JSON.parse(jsonSlice);
}

// Looks up background info a band's Spotify page won't have: home city,
// how long they've been active, and a one-line description.
async function lookupBandBackground(name, cityHint) {
  const prompt = `Search the web for the band or musical act called "${name}"${
    cityHint ? ` (possibly based in or near ${cityHint})` : ''
  }.

Respond with ONLY a JSON object, no other text, no markdown formatting, in exactly this shape:
{"city": "the city/town they are based in, or null if unknown", "active_since": "year they formed, or null if unknown", "bio": "one sentence, under 25 words, describing their sound and background", "found": true or false}

Set "found" to false if you cannot find real information about a real, currently or recently active band with this name.`;

  const text = await callClaude(prompt);
  try {
    return parseJsonLoose(text);
  } catch {
    return { found: false, city: null, active_since: null, bio: null };
  }
}

// Given an anchor band's tags and city, asks Claude to suggest real,
// currently active local/regional bands that would sound good on the
// same bill.
async function suggestSimilarBands(anchorName, tags, city) {
  const prompt = `You are a music researcher, not a local show booker. Your only job is to find bands that SOUND like this one.

Band: "${anchorName}"
Genre/style tags: ${tags.join(', ') || 'unknown'}
Based in: ${city || 'unknown'}

Search the web for real, currently active bands whose actual musical style, instrumentation, and genre closely match the tags above. Sound similarity is the ONLY criterion that matters.

Strict rules:
- Do NOT suggest a band just because it's from ${city || 'the same area'}, is locally well-known, or has shared a bill/played a show with "${anchorName}" before. Scene familiarity and geography are irrelevant to this task.
- Only include a band if its genre and sound would genuinely be described with tags similar to: ${tags.join(', ') || 'unknown'}.
- It's fine, and expected, if some or most of your answers are from other cities or regions — prioritize a close sonic match over a local one.
- If you can't find enough close sonic matches, return fewer results rather than padding the list with loosely-related local acts.

Respond with ONLY a JSON array of band names, no other text, no markdown formatting, like this:
["Band Name One", "Band Name Two", "Band Name Three"]

Include up to 8 names, ordered from closest sonic match to least. Do not include "${anchorName}" itself.`;

  const text = await callClaude(prompt);
  try {
    const result = parseJsonLoose(text);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

module.exports = { lookupBandBackground, suggestSimilarBands };
