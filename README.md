# ONBILL — Setup Guide (no coding required)

This gets your app live on the internet with a real URL. You'll create four free accounts, get some API keys, upload this folder to GitHub, then connect it to Vercel. About 20-30 minutes.

## 1. Create your accounts and grab your keys

**Spotify** (for genre tags + listener counts)
1. Go to https://developer.spotify.com/dashboard and log in with any Spotify account.
2. Click "Create app." Name it anything, add any description, and for "Redirect URI" just put `http://localhost:3000` (you won't actually use it, but Spotify requires something there).
3. Once created, click "Settings" — you'll see your **Client ID**. Click "View client secret" for your **Client Secret**. Save both somewhere.

**Anthropic** (this is the AI that looks up band info and suggests similar acts)
1. Go to https://console.anthropic.com and create an account.
2. Add a small amount of billing credit (a few dollars covers a lot of testing — each lookup costs a fraction of a cent to a few cents).
3. Go to "API Keys" and create one. Save it — you won't be able to see it again after this.

**Upstash** (free database that remembers bands you've already looked up, so repeat searches are instant)
1. Go to https://upstash.com and create a free account.
2. Create a new Redis database (any name, any region close to you).
3. On the database page, find the "REST API" section. Save the **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**.

**Vercel** (this is what actually hosts your app and gives you a live URL)
1. Go to https://vercel.com and sign up — easiest is to sign up with GitHub.

**GitHub** (if you don't already have an account)
1. Go to https://github.com and sign up. This is just where your code "lives" so Vercel can grab it.

## 2. Upload the code to GitHub (no git commands needed)

1. On github.com, click the **+** in the top right → **New repository**. Name it `onbill-app`. Keep it private if you'd like. Click "Create repository."
2. On the new repo page, click **"uploading an existing file."**
3. Drag in every file and folder from this project (keep the `api` folder structure intact — it should contain a `lib` folder inside it).
4. Scroll down and click **"Commit changes."**

## 3. Deploy on Vercel

1. In Vercel, click **"Add New" → "Project."**
2. Find and import the `onbill-app` repo you just created.
3. Before clicking Deploy, open **"Environment Variables"** and add all 5 keys from your `.env.example` file, using the real values you saved in step 1:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `ANTHROPIC_API_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Click **Deploy**. Wait about a minute.
5. You'll get a live URL like `onbill-app.vercel.app` — that's your app, live on the internet.

## 4. Test it

Search a real, reasonably well-known band and a real city — something with an actual Spotify presence and web footprint, so there's real data to find. Obscure or made-up names will come back empty, which is expected.

The first search for any band takes 10-20 seconds (it's live-searching the web and Spotify). Search that same band again and it'll be instant — that's the cache working.

## What this costs to run

- Vercel: free tier is plenty for testing and early usage.
- Upstash: free tier covers a large number of lookups.
- Spotify API: free.
- Anthropic API: the only real ongoing cost, pay-per-use. Each new band lookup (uncached) costs roughly a cent or two. Cached repeat searches cost nothing.

## If something breaks

The app will show an error message rather than crashing silently — read what it says first. Most issues are a typo'd or missing environment variable in Vercel. Double-check the 5 keys are entered exactly as they appear in your dashboards (no extra spaces).

## What's still missing (future features, not needed for v1)

- Band profiles / sign-up so bands can be contacted directly
- A proper database instead of a simple cache (useful once you want to browse/filter *all* bands, not just search one at a time)
- Venue and booker-specific views
