![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

Media stream scraper API running entirely on Cloudflare Pages Functions. No backend, no Python — just deploy and use.

---

## How it works

Sources are scraped from 02pcembed.site and proxied through madvid3.xyz's HLS proxy so they're playable directly in any video player.
```
Client
  │
  ▼
Cloudflare Pages (vyla-api)
  ├── GET /          → health check
  ├── GET /api/movie → scrape movie sources
  └── GET /api/tv    → scrape TV episode sources
```

---

## Repo layout
```
├── functions/
│   ├── api/
│   │   ├── movie.js     ← /api/movie
│   │   └── tv.js        ← /api/tv
│   └── lib/
│       └── scraper.js   ← source scraping logic
├── public/
│   └── .gitkeep
├── wrangler.toml
├── .gitignore
└── README.md
```

---

## Local dev
```bash
wrangler pages dev
```

Test:
```
GET http://127.0.0.1:8788/api/movie?id=550
GET http://127.0.0.1:8788/api/tv?id=456&season=1&episode=1
```

---

## Deploy to Cloudflare Pages

### Option A — Git (recommended)

1. Push this repo to GitHub
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
3. Select your repo, set build output directory to `public`, leave build command blank
4. Deploy

Every push to `main` redeploys automatically.

### Option B — CLI
```bash
wrangler pages deploy ./public --project-name=vyla-api
```

---

## API reference

### `GET /api/movie`

| Param | Required | Description |
|---|---|---|
| `id` | ✅ | TMDB movie ID |
```
GET /api/movie?id=550
```
```json
{
  "success": true,
  "results_found": 6,
  "sources": [
    {
      "url": "https://madvid3.xyz/api/hls-proxy?url=...",
      "quality": "1080p",
      "type": "hls"
    }
  ],
  "subtitles": [
    {
      "url": "https://madvid3.xyz/api/hls-proxy?url=...",
      "label": "English",
      "format": "vtt"
    }
  ]
}
```

---

### `GET /api/tv`

| Param | Required | Default | Description |
|---|---|---|---|
| `id` | ✅ | — | TMDB series ID |
| `season` | ❌ | `1` | Season number |
| `episode` | ❌ | `1` | Episode number |
```
GET /api/tv?id=456&season=1&episode=1
```

Response shape is identical to `/api/movie`.

---

## Usage from any frontend
```js
const res = await fetch("https://vyla-api.pages.dev/api/movie?id=550");
const { sources, subtitles } = await res.json();
```

All endpoints are `Access-Control-Allow-Origin: *` — works from any origin.

---

### `GET /proxy`

| Param | Required | Description |
|---|---|---|
| `url` | ✅ | Direct URL to proxy and force-download |

Used internally by the player's download button to force `Content-Disposition: attachment` on cross-origin mp4 sources. Without this, browsers open the file instead of downloading it.
```
GET /proxy?url=https://example.com/video.mp4
```

> Only works with mp4 sources. HLS (`.m3u8`) streams cannot be downloaded this way.

---

## TMDB IDs
```
https://www.themoviedb.org/movie/550-fight-club   →  id=550
https://www.themoviedb.org/tv/456-the-simpsons    →  id=456
```

---

## License

MIT