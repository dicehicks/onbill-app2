const { lookupBand } = require('./lib/lookupBand');
const { indexGetAll } = require('./lib/cache');

const MIN_SCORE = 0.1; // drop candidates with essentially no tag overlap

function similarity(anchor, candidate) {
  const setA = new Set(anchor.tags);
  const setB = new Set(candidate.tags);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return shared / union; // Jaccard overlap of genre tags
}

module.exports = async (req, res) => {
  const { name } = req.query;

  if (!name) {
    res.status(400).json({ error: 'Missing required "name" query parameter.' });
    return;
  }

  try {
    const anchor = await lookupBand(name);
    if (!anchor) {
      res.status(404).json({ error: `No band found matching "${name}". Try a more well-known act to test with.` });
      return;
    }

    if (!anchor.tags || anchor.tags.length === 0) {
      res.status(200).json({
        anchor,
        matches: [],
        note: `Spotify doesn't have genre tags for "${anchor.name}", so there's nothing to match against.`,
      });
      return;
    }

    // Candidates come ONLY from the Ohio seed index now - this is what
    // guarantees every match is an actual Ohio band, instead of anywhere
    // Spotify's genre search happens to return results from.
    const indexNames = await indexGetAll();
    if (indexNames.length === 0) {
      res.status(200).json({
        anchor,
        matches: [],
        note: 'The Ohio band index is empty. Run /api/seed-ohio to populate it first.',
      });
      return;
    }

    const candidates = await Promise.all(
      indexNames
        .filter((n) => n.toLowerCase() !== anchor.name.toLowerCase())
        .map((n) => lookupBand(n).catch(() => null))
    );

    const matches = candidates
      .filter((b) => b && b.tags && b.tags.length > 0)
      .map((b) => ({ ...b, score: similarity(anchor, b) }))
      .filter((b) => b.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.status(200).json({ anchor, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
