const { searchSpotifyArtist } = require('./spotify');
const { lookupBandBackground } = require('./ai');
const { cacheGet, cacheSet } = require('./cache');

// Full lookup: cache first, then Spotify + a web-search AI call for
// background. Used for the anchor band the user actually typed in, where we
// need accurate, freshly-researched info.
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
    sound: background.sound || null,
    spotifyUrl: spotifyData.spotifyUrl,
  };

  await cacheSet(name, cityHint, profile);
  return { ...profile, fromCache: false };
}

// Cheaper lookup for candidate bands where Claude already researched and
// described the sound as part of finding them — this only hits Spotify
// (free) for tags/listener counts instead of paying for another web-search
// call to re-research something we already know.
async function lookupBandCheap(candidate) {
  const cached = await cacheGet(candidate.name, candidate.city);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const spotifyData = await searchSpotifyArtist(candidate.name);
  if (!spotifyData) return null;

  const profile = {
    name: spotifyData.spotifyName,
    city: candidate.city || null,
    tags: spotifyData.tags,
    listeners: spotifyData.listeners,
    popularity: spotifyData.popularity,
    activeSince: null,
    bio: null,
    sound: candidate.sound || null,
    spotifyUrl: spotifyData.spotifyUrl,
  };

  await cacheSet(candidate.name, candidate.city, profile);
  return { ...profile, fromCache: false };
}

module.exports = { lookupBand, lookupBandCheap };
