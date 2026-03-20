![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

Media stream scraper API running entirely on Cloudflare Pages Functions. No backend, no Python — just deploy and use.

---

## How it works

All 7 providers run inside a Cloudflare Worker. Source URLs are AES-encrypted before being returned — no one can see the original stream URLs. Sources are verified in parallel before being returned.

```
Client
  │
  ▼
Cloudflare Pages (vyla-api)
  ├── GET /              → health check
  ├── GET /api/movie     → scrape movie sources
  ├── GET /api/tv        → scrape TV episode sources
  └── GET /proxy         → stream proxy + HLS rewriter
```

---

## Repo layout

```
├── functions/
│   ├── index.js              ← health check at /
│   ├── proxy.js              ← stream proxy at /proxy
│   ├── api/
│   │   ├── movie.js          ← /api/movie
│   │   └── tv.js             ← /api/tv
│   └── lib/
│       └── scraper.js        ← all 7 providers
├── public/
│   └── .gitkeep
├── wrangler.toml
├── .gitignore
└── README.md
```

---

## Local dev

Create a `.dev.vars` file in the root:

```
PROXY_SECRET=your_secret_here
```

Then run:

```bash
wrangler pages dev ./public
```

Test:

```
GET http://127.0.0.1:8788/
GET http://127.0.0.1:8788/api/movie?id=550
GET http://127.0.0.1:8788/api/tv?id=1396&season=1&episode=1
```

---

## Deploy to Cloudflare Pages

### Option A — Git (recommended)

1. Push this repo to GitHub
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
3. Select your repo
4. Set build output directory to `public`
5. Leave build command blank
6. Deploy
7. Set your secret:

```bash
wrangler pages secret put PROXY_SECRET --project-name=vyla-api
```

Every push to `main` redeploys automatically.

### Option B — CLI

```bash
wrangler pages deploy ./public --project-name=vyla-api
wrangler pages secret put PROXY_SECRET --project-name=vyla-api
```

---

## API reference

### `GET /`

Health check. Returns API status and available endpoints.

```json
{
  "status": "ok",
  "service": "vyla-api",
  "endpoints": {
    "movie": "/api/movie?id=<tmdb_id>",
    "tv": "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
    "proxy": "/proxy?t=<encrypted_token>"
  }
}
```

---

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
  "results_found": 4,
  "sources": [
    {
      "url": "https://vyla-api.pages.dev/proxy?t=aB3xK9mPqT2rWv...",
      "quality": "1080p",
      "type": "hls",
      "provider": "VidRock"
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
GET /api/tv?id=1396&season=1&episode=1
```

Response shape is identical to `/api/movie`.

---

### `GET /proxy`

| Param | Required | Description |
|---|---|---|
| `t` | ✅ | AES-encrypted token representing the upstream stream URL |

Handles HLS manifest rewriting and `Range` headers for MP4 seeking. The original URL is never exposed. Source URLs returned by `/api/movie` and `/api/tv` already point here — you don't call this directly.

---

## Usage from any frontend

```js
const res = await fetch("https://vyla-api.pages.dev/api/movie?id=550");
const { sources } = await res.json();
```

All endpoints are `Access-Control-Allow-Origin: *` — no proxy, no CORS issues, works from any origin.

---

## TMDB IDs

No API key needed. IDs are in the TMDB URL:

```
https://www.themoviedb.org/movie/550-fight-club   →  id=550
https://www.themoviedb.org/tv/1396-breaking-bad   →  id=1396
```

---

## Providers

| Provider | Type |
|---|---|
| 02MovieDownloader | mp4 |
| RgShows | mp4 |
| Uembed / MadPlay | hls |
| VidRock | mp4 / hls |
| VidSrc | hls |
| VidZee | hls |
| VixSrc | hls |

---

## License

MIT