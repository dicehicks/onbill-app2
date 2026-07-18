const { lookupBand } = require('./lib/lookupBand');
const { suggestSimilarBands } = require('./lib/ai');

function similarity(anchor, candidate) {
  const setA = new Set(anchor.tags);
  const setB = new Set(candidate.tags);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  const tagScore = shared / union; // Jaccard overlap of genre tags — this is the real signal

  // Same-city is only a small tiebreaker, and only counts if there's already
  // genuine genre overlap. It should never rescue a band that doesn't sound alike.
  const sameCity = anchor.city && candidate.city && anchor.city.toLowerCase() === candidate.city.toLowerCase();
  const cityBonus = (sameCity && shared > 0) ? 0.05 : 0;

  return Math.min(tagScore + cityBonus, 1);
}

const MIN_SCORE = 0.12; // drop candidates with little to no real genre overlap

module.exports = async (req, res) => {
  const { name, city } = req.query;

  if (!name) {
    res.status(400).json({ error: 'Missing required "name" query parameter.' });
    return;
  }

  try {
    const anchor = await lookupBand(name, city);
    if (!anchor) {
      res.status(404).json({ error: `No band found matching "${name}". Try a more well-known act to test with.` });
      return;
    }

    const candidateNames = await suggestSimilarBands(anchor.name, anchor.tags, anchor.city);

    // Look up each candidate (cache-first, so repeats are instant).
    // Run a few at a time rather than all at once, to be gentle on rate limits.
    const results = [];
    const batchSize = 3;
    for (let i = 0; i < candidateNames.length; i += batchSize) {
      const batch = candidateNames.slice(i, i + batchSize);
      const looked = await Promise.all(
        batch.map((n) => lookupBand(n, anchor.city).catch(() => null))
      );
      results.push(...looked);
    }

    const matches = results
      .filter((b) => b && b.name.toLowerCase() !== anchor.name.toLowerCase())
      .map((b) => ({ ...b, score: similarity(anchor, b) }))
      .filter((b) => b.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.status(200).json({ anchor, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
