const { lookupBand } = require('./lib/lookupBand');
const { indexAdd } = require('./lib/cache');
const OHIO_SEED_LIST = require('./lib/ohioSeedList');

// Run this once (in batches) to populate the database with the Ohio seed
// list. Safe to run multiple times - already-cached/indexed bands are
// skipped fast, so re-running just picks up where it left off.
//
// Usage: visit /api/seed-ohio?offset=0&limit=40 in your browser, then
// follow "nextUrl" in the response until "done" is true.

module.exports = async (req, res) => {
  const offset = parseInt(req.query.offset || '0', 10);
  const limit = parseInt(req.query.limit || '40', 10);

  const batch = OHIO_SEED_LIST.slice(offset, offset + limit);

  if (batch.length === 0) {
    res.status(200).json({ done: true, message: 'Nothing left to seed - the whole list has been processed.' });
    return;
  }

  const results = { withTags: [], noUsableTags: [] };

  await Promise.all(
    batch.map(async (entry) => {
      try {
        const profile = await lookupBand(entry.name);
        if (profile && profile.tags && profile.tags.length > 0) {
          await indexAdd(entry.name);
          results.withTags.push(entry.name);
        } else {
          // Still cached/found, just nothing to match on (no research tags,
          // not on Spotify either) - not added to the index.
          results.noUsableTags.push(entry.name);
        }
      } catch (err) {
        results.noUsableTags.push(`${entry.name} (error: ${err.message})`);
      }
    })
  );

  const nextOffset = offset + limit;
  const done = nextOffset >= OHIO_SEED_LIST.length;

  res.status(200).json({
    processed: batch.length,
    totalInList: OHIO_SEED_LIST.length,
    addedToIndex: results.withTags.length,
    skippedNoTags: results.noUsableTags,
    done,
    nextOffset: done ? null : nextOffset,
    nextUrl: done ? null : `/api/seed-ohio?offset=${nextOffset}&limit=${limit}`,
  });
};
