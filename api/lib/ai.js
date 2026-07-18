// Uses Claude (with web search turned on) to find things Spotify doesn't
// track, like where a band is actually based, and to suggest other local
// bands with a similar sound.

async function callClaude(prompt, { webSearch = true, maxTokens = 1000 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
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
{"city": "the city/town they are based in, or null if unknown", "active_since": "year they formed, or null if unknown", "bio": "one sentence, under 25 words, general background/context", "sound": "under 35 words describing ONLY the sonic characteristics: instrumentation, vocal style (e.g. screamed/clean/spoken), tempo and energy level, production feel (raw/polished/lo-fi), and 1-2 comparable well-known artists if there's a clear reference point", "found": true or false}

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

// This is the core fix for weak/sparse Spotify genre tags: instead of just
// counting overlapping tag strings, ask Claude to actually reason about how
// similar each candidate SOUNDS to the anchor band, using the fuller sonic
// descriptions. Tags are passed along only as a minor supporting hint.
async function scoreSonicSimilarity(anchor, candidates) {
  if (!candidates.length) return {};

  const candidateBlock = candidates
    .map((c, i) => `${i + 1}. "${c.name}" — sound: ${c.sound || c.bio || 'unknown'}. tags: ${c.tags.join(', ') || 'none'}`)
    .join('\n');

  const prompt = `You're judging how similar each candidate band SOUNDS to a reference band, for the purpose of building a concert bill where the sonic vibe should flow well.

Reference band: "${anchor.name}"
Reference sound: ${anchor.sound || anchor.bio || 'unknown'}
Reference tags (minor supporting signal only): ${anchor.tags.join(', ') || 'none'}

Candidates:
${candidateBlock}

For each candidate, score 0-100 for how sonically similar it actually is to the reference band. Base this primarily on the sound descriptions (instrumentation, vocal style, tempo/energy, production feel, comparable artists) — treat the tags as a weak secondary hint only, since genre tag data is often sparse or inconsistent and should not drive the score on its own. Two bands can sound very similar even with zero overlapping tags, and two bands can share a tag while sounding nothing alike — judge the actual sound.

Respond with ONLY a JSON array, no other text, no markdown formatting, in exactly this shape:
[{"name": "Candidate Name", "score": 0-100, "reason": "under 12 words"}]

Include every candidate listed above, in the same order.`;

  const text = await callClaude(prompt, { webSearch: false, maxTokens: 1200 });
  try {
    const result = parseJsonLoose(text);
    if (!Array.isArray(result)) return {};
    const map = {};
    result.forEach((r) => {
      if (r && r.name) map[r.name.toLowerCase()] = { score: (r.score || 0) / 100, reason: r.reason || '' };
    });
    return map;
  } catch {
    return {};
  }
}

module.exports = { lookupBandBackground, suggestSimilarBands, scoreSonicSimilarity };
