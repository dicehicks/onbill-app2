const { lookupBand } = require('./lib/lookupBand');

module.exports = async (req, res) => {
  const { name, city } = req.query;

  if (!name) {
    res.status(400).json({ error: 'Missing required "name" query parameter.' });
    return;
  }

  try {
    const profile = await lookupBand(name, city);
    if (!profile) {
      res.status(404).json({ error: `No band found matching "${name}".` });
      return;
    }
    res.status(200).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
