// Talks to Spotify's API to get real genre tags and listener numbers for a band.

let cachedToken = null;
let tokenExpiresAt = 0;

// Spotify requires an access token before you can search anything.
// This gets one using your app's Client ID + Secret, and reuses it
// until it's about to expire (tokens last ~1 hour).
async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables.');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // refresh a bit early
  return cachedToken;
}

// Searches Spotify for a band by name and returns the closest match's
// genre tags and follower count. Returns null if nothing found.
async function searchSpotifyArtist(name) {
  const token = await getSpotifyToken();

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify search failed: ${res.status}`);
  }

  const data = await res.json();
  const artist = data.artists && data.artists.items && data.artists.items[0];

  if (!artist) return null;

  return {
    spotifyName: artist.name,
    tags: artist.genres || [],
    listeners: artist.followers ? artist.followers.total : 0,
    popularity: artist.popularity || 0,
    spotifyUrl: artist.external_urls ? artist.external_urls.spotify : null,
  };
}

module.exports = { searchSpotifyArtist };
