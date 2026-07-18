// Simple key-value cache using Upstash Redis (free tier, no server to manage).
// This is what makes repeat lookups instant and free instead of hitting
// Spotify + Claude every single time someone searches the same band.

const TTL_SECONDS = 60 * 60 * 24 * 90; // cache each band for 90 days - band genre/sound rarely changes, so keep it longer to avoid re-paying for the same lookup

function baseUrl() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables.');
  }
  return { url, token };
}

function normalizeKey(name, city) {
  const clean = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `band:${clean(name)}:${clean(city)}`;
}

async function cacheGet(name, city) {
  const { url, token } = baseUrl();
  const key = normalizeKey(name, city);

  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.result) return null;

  try {
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

async function cacheSet(name, city, value) {
  const { url, token } = baseUrl();
  const key = normalizeKey(name, city);
  const body = encodeURIComponent(JSON.stringify(value));

  await fetch(`${url}/set/${encodeURIComponent(key)}/${body}?EX=${TTL_SECONDS}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = { cacheGet, cacheSet };
