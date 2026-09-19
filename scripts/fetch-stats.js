// Forged Loops — Roblox stats fetcher
//
// Runs inside a GitHub Actions runner (a server, not a browser), so it can
// call Roblox's official API directly with no CORS restrictions at all.
// It writes the result to games-data.json in the repo root, which the
// static site then reads as a plain same-origin file — no proxy, no
// third-party service, nothing that can be "blocked".
//
// To add more games, just add more place IDs to PLACE_IDS below.

const fs = require('fs');
const path = require('path');

const PLACE_IDS = [
  '92371631484540', // 100 Waves later
  '6063653725', // Mega hide and seek
  '132495346586140', // Swim league
  '131322417028955', // Champions
  '8511615377', // Panik
  '6335988339', // Surgery Simulator
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchGameData(placeId) {
  try {
    // 1. Place ID -> Universe ID
    const uni = await fetchJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
    const universeId = uni.universeId;
    if (!universeId) throw new Error('no universeId returned for this place ID');

    // 2. Stats, votes and thumbnail, in parallel
    const [stats, votes, thumbs] = await Promise.all([
      fetchJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
      fetchJson(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`).catch((err) => {
        console.warn(`Votes fetch failed for universe ${universeId}:`, err.message);
        return null;
      }),
      fetchJson(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`
      ).catch((err) => {
        console.warn(`Thumbnail fetch failed for universe ${universeId}:`, err.message);
        return null;
      }),
    ]);

    const game = stats.data && stats.data[0];
    if (!game) throw new Error('no stats returned for this universe');

    let likePercent = null;
    if (votes) {
      const v = votes.data && votes.data[0];
      if (v && v.upVotes + v.downVotes > 0) {
        likePercent = Math.round((v.upVotes / (v.upVotes + v.downVotes)) * 100);
      }
    }

    let thumbnail = null;
    if (thumbs) {
      const t = thumbs.data && thumbs.data[0];
      thumbnail = t ? t.imageUrl : null;
    }

    return {
      placeId,
      universeId,
      name: game.name,
      playing: game.playing,
      visits: game.visits,
      thumbnail,
      likePercent,
    };
  } catch (err) {
    console.warn(`Failed to fetch data for place ${placeId}:`, err.message);
    return { placeId, error: err.message };
  }
}

(async () => {
  const games = await Promise.all(PLACE_IDS.map(fetchGameData));
  const output = {
    updatedAt: new Date().toISOString(),
    data: games,
  };

  const outPath = path.join(__dirname, '..', 'games-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${outPath}:`);
  console.log(JSON.stringify(output, null, 2));
})();
