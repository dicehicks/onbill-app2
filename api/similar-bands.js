const { lookupBand, lookupBandCheap } = require('./lib/lookupBand');
const { suggestAndScoreSimilarBands } = require('./lib/ai');

const MIN_SCORE = 0.35; // drop candidates Claude judges as not really sounding alike

module.exports = async (req, res) => {
  const { name, city } = req.query;

  if (!name) {
    res.status(400).json({ error: 'Missing required "name" query parameter.' });
    return;
  }

  try {
    // Web-search call #1: research the anchor band.
    const anchor = await lookupBand(name, city);
    if (!anchor) {
      res.status(404).json({ error: `No band found matching "${name}". Try a more well-known act to test with.` });
      return;
    }

    // Web-search call #2: find candidates, research their sound, and score
    // them against the anchor, all in one pass.
    const candidates = await suggestAndScoreSimilarBands(anchor);

    // Spotify lookups are free and don't call Claude at all — this just
    // fills in real tags/listener counts for display.
    const looked = await Promise.all(
      candidates
        .filter((c) => c && c.name && c.name.toLowerCase() !== anchor.name.toLowerCase())
        .map((c) =>
          lookupBandCheap(c)
            .then((profile) => (profile ? { ...profile, score: (c.score || 0) / 100, matchReason: c.reason || null } : null))
            .catch(() => null)
        )
    );

    const matches = looked
      .filter((b) => b && b.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.status(200).json({ anchor, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
