const { lookupBand } = require('./lib/lookupBand');
const { suggestSimilarBands, scoreSonicSimilarity } = require('./lib/ai');

const MIN_SCORE = 0.35; // drop candidates Claude judges as not really sounding alike

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

    const candidates = results.filter(
      (b) => b && b.name.toLowerCase() !== anchor.name.toLowerCase()
    );

    // Ask Claude to judge sonic similarity directly, using the fuller sound
    // descriptions rather than just counting overlapping genre tag strings.
    const scores = await scoreSonicSimilarity(anchor, candidates);

    const matches = candidates
      .map((b) => {
        const judged = scores[b.name.toLowerCase()];
        return { ...b, score: judged ? judged.score : 0, matchReason: judged ? judged.reason : null };
      })
      .filter((b) => b.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.status(200).json({ anchor, matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
