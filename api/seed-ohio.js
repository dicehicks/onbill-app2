const { searchSpotifyArtist } = require('./lib/spotify');
const { cacheGet, cacheSet, indexAdd } = require('./lib/cache');
const OHIO_SEED_LIST = require('./lib/ohioSeedList');

// Run this once (in batches) to populate the database with the Ohio seed
// list. Safe to run multiple times - already-cached/indexed bands are
// skipped fast, so re-running just picks up where it left off.
//
// Usage: visit /api/seed-ohio?offset=0&limit=40 in your browser, then
// increase offset by the "limit" each time using the "nextOffset" the
// response gives you, until "done" is true.

module.exports = async (req, res) => {
  const offset = parseInt(req.query.offset || '0', 10);
  const limit = parseInt(req.query.limit || '40', 10);

  const batch = OHIO_SEED_LIST.slice(offset, offset + limit);

  if (batch.length === 0) {
    res.status(200).json({ done: true, message: 'Nothing left to seed - the whole list has been processed.' });
    return;
  }

  const results = { found: [], notFoundOnSpotify: [], alreadyCached: [] };

  await Promise.all(
    batch.map(async (name) => {
      try {
        const cached = await cacheGet(name);
        if (cached) {
          await indexAdd(name);
          results.alreadyCached.push(name);
          return;
        }

        const spotifyData = await searchSpotifyArtist(name);
        if (!spotifyData) {
          results.notFoundOnSpotify.push(name);
          return;
        }

        const profile = {
          name: spotifyData.spotifyName,
          tags: spotifyData.tags,
          listeners: spotifyData.listeners,
          popularity: spotifyData.popularity,
          spotifyUrl: spotifyData.spotifyUrl,
        };

        await cacheSet(name, profile);
        await indexAdd(name);
        results.found.push(name);
      } catch (err) {
        results.notFoundOnSpotify.push(`${name} (error: ${err.message})`);
      }
    })
  );

  const nextOffset = offset + limit;
  const done = nextOffset >= OHIO_SEED_LIST.length;

  res.status(200).json({
    processed: batch.length,
    totalInList: OHIO_SEED_LIST.length,
    newlyFound: results.found.length,
    alreadyCached: results.alreadyCached.length,
    notFoundOnSpotify: results.notFoundOnSpotify,
    done,
    nextOffset: done ? null : nextOffset,
    nextUrl: done ? null : `/api/seed-ohio?offset=${nextOffset}&limit=${limit}`,
  });
};
