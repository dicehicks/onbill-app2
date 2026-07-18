// Simple key-value cache using Upstash Redis (free tier, no server to manage).
// Keyed by band name only now - no city involved anywhere in this app.

const TTL_SECONDS = 60 * 60 * 24 * 90; // cache each band for 90 days

function baseUrl() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables.');
  }
  return { url, token };
}

function normalizeKey(name) {
  const clean = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `band:${clean}`;
}

async function cacheGet(name) {
  const { url, token } = baseUrl();
  const key = normalizeKey(name);

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

async function cacheSet(name, value) {
  const { url, token } = baseUrl();
  const key = normalizeKey(name);
  const body = encodeURIComponent(JSON.stringify(value));

  await fetch(`${url}/set/${encodeURIComponent(key)}/${body}?EX=${TTL_SECONDS}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = { cacheGet, cacheSet };

// --- Ohio band index ---
// A Redis SET of band names that are confirmed to be in the Ohio seed list.
// This is what the matching engine scores candidates from, instead of
// searching Spotify's whole genre space live.

const INDEX_KEY = 'ohio:index';

async function indexAdd(name) {
  const { url, token } = baseUrl();
  const member = encodeURIComponent(name.trim().toLowerCase());
  await fetch(`${url}/sadd/${INDEX_KEY}/${member}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function indexGetAll() {
  const { url, token } = baseUrl();
  const res = await fetch(`${url}/smembers/${INDEX_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.result || [];
}

module.exports.indexAdd = indexAdd;
module.exports.indexGetAll = indexGetAll;
