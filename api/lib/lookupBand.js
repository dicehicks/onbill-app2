const { searchSpotifyArtist } = require('./spotify');
const { lookupBandBackground } = require('./ai');
const { cacheGet, cacheSet } = require('./cache');

// The main function: given a band name (and optionally a city hint),
// returns a combined profile — cached if we've seen it before, freshly
// built from Spotify + Claude if not.
async function lookupBand(name, cityHint) {
  const cached = await cacheGet(name, cityHint);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const spotifyData = await searchSpotifyArtist(name);
  if (!spotifyData) {
    return null; // not on Spotify at all — treat as not found
  }

  const background = await lookupBandBackground(name, cityHint);

  const profile = {
    name: spotifyData.spotifyName,
    city: background.city || cityHint || null,
    tags: spotifyData.tags,
    listeners: spotifyData.listeners,
    popularity: spotifyData.popularity,
    activeSince: background.active_since || null,
    bio: background.bio || null,
    spotifyUrl: spotifyData.spotifyUrl,
  };

  await cacheSet(name, cityHint, profile);
  return { ...profile, fromCache: false };
}

module.exports = { lookupBand };
