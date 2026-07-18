const { searchSpotifyArtist } = require('./spotify');
const { cacheGet, cacheSet } = require('./cache');
const OHIO_SEED_LIST = require('./ohioSeedList');

// Build a quick lookup map once, keyed by lowercased name.
const SEED_MAP = new Map(OHIO_SEED_LIST.map((b) => [b.name.toLowerCase(), b]));

// Primary source is our own compiled research (name, city, tags). Spotify is
// secondary enrichment only - it adds listener counts and popularity when
// available, and can supplement tags, but a band's absence from Spotify no
// longer makes it unusable, since we already have real tags for every
// seeded band from research.
async function lookupBand(name) {
  const cached = await cacheGet(name);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const seedEntry = SEED_MAP.get(name.trim().toLowerCase());

  // Best-effort Spotify enrichment - never blocks on this failing.
  let spotifyData = null;
  try {
    spotifyData = await searchSpotifyArtist(name);
  } catch {
    spotifyData = null;
  }

  if (!seedEntry && !spotifyData) {
    return null; // not in our research AND not on Spotify - genuinely not found
  }

  // Merge tags: our own research tags first (primary), Spotify's genres
  // folded in as extra signal without overriding what we already know.
  const ownTags = seedEntry ? seedEntry.tags : [];
  const spotifyTags = spotifyData ? spotifyData.tags : [];
  const mergedTags = [...new Set([...ownTags, ...spotifyTags])];

  const profile = {
    name: spotifyData ? spotifyData.spotifyName : (seedEntry ? seedEntry.name : name),
    city: seedEntry ? seedEntry.city : null,
    tags: mergedTags,
    listeners: spotifyData ? spotifyData.listeners : null,
    popularity: spotifyData ? spotifyData.popularity : null,
    spotifyUrl: spotifyData ? spotifyData.spotifyUrl : null,
    source: seedEntry && spotifyData ? 'research+spotify' : seedEntry ? 'research' : 'spotify',
  };

  await cacheSet(name, profile);
  return { ...profile, fromCache: false };
}

module.exports = { lookupBand };
