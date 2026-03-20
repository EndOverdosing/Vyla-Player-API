![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

Multi-provider media stream scraper running entirely on Cloudflare Pages Functions. No backend, no Python — just deploy and use.

---

## How it works

Sources are scraped in parallel from 8 providers (VidZee, VidRock, VixSrc, VidSrc, Uembed, RgShows, 02MovieDownloader, 02Embed). Results are deduplicated, sorted by quality, and filtered to English-only audio before being returned. Third-party proxy URLs are automatically unwrapped to their real upstream before being passed through the built-in proxy.

```
Client
  │
  ▼
Cloudflare Pages (vyla-api)
  ├── GET /api/stream/movie   → scrape movie sources (all providers)
  ├── GET /api/stream/tv      → scrape TV episode sources (all providers)
  ├── GET /api/stream/scraper → combined endpoint (type param)
  ├── GET /api/proxy          → stream proxy + M3U8 rewriter
  └── GET /api/download       → forced file download
```

---

## Repo layout

```
├── functions/
│   ├── _lib/
│   │   ├── scraper.js        ← all provider logic + English filter
│   │   └── proxy.js          ← stream proxy + M3U8 segment rewriting
│   └── api/
│       ├── stream/
│       │   ├── movie.js      ← /api/stream/movie
│       │   ├── tv.js         ← /api/stream/tv
│       │   └── scraper.js    ← /api/stream/scraper
│       ├── download.js       ← /api/download
│       └── proxy.js          ← /api/proxy
├── public/
│   └── index.html
├── wrangler.toml
├── package.json
├── .gitignore
└── README.md
```

> `_lib/` uses the `_` prefix so Cloudflare Pages treats it as a shared module folder rather than a route.

---

## Local dev

```bash
npm install
wrangler pages dev
```

Test:

```
GET http://127.0.0.1:8788/api/stream/movie?id=550
GET http://127.0.0.1:8788/api/stream/tv?id=456&season=1&episode=1
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

All endpoints return `Access-Control-Allow-Origin: *` and support `OPTIONS` preflight — works from any origin.

---

### `GET /api/stream/movie`

| Param | Required | Description |
|---|---|---|
| `id` | ✅ | TMDB movie ID |

```
GET /api/stream/movie?id=550
```

```json
{
  "success": true,
  "results_found": 12,
  "sources": [
    {
      "url": "https://...",
      "type": "hls",
      "quality": "1080p",
      "provider": "VidZee",
      "audioTracks": [{ "language": "eng", "label": "English" }],
      "headers": { "Referer": "https://..." }
    }
  ],
  "subtitles": [
    {
      "url": "https://...",
      "label": "English",
      "format": "vtt"
    }
  ]
}
```

`success` is `false` if no valid sources were found. Sources are sorted highest quality first. Only English audio tracks are returned.

---

### `GET /api/stream/tv`

| Param | Required | Default | Description |
|---|---|---|---|
| `id` | ✅ | — | TMDB series ID |
| `season` | ❌ | `1` | Season number |
| `episode` | ❌ | `1` | Episode number |

```
GET /api/stream/tv?id=456&season=1&episode=1
```

Response shape is identical to `/api/stream/movie`.

---

### `GET /api/stream/scraper`

Combined endpoint — pass `type` instead of using separate movie/tv routes.

| Param | Required | Default | Description |
|---|---|---|---|
| `id` | ✅ | — | TMDB ID |
| `type` | ❌ | `movie` | `movie` or `tv` |
| `season` | ❌ | `1` | Season number (TV only) |
| `episode` | ❌ | `1` | Episode number (TV only) |

```
GET /api/stream/scraper?id=550&type=movie
GET /api/stream/scraper?id=456&type=tv&season=2&episode=5
```

---

### `GET /api/proxy`

Proxies any upstream URL through Cloudflare. M3U8 playlists are automatically parsed and all segment/key URLs are rewritten to route through this same proxy — so HLS streams play without CORS issues in any player.

| Param | Required | Description |
|---|---|---|
| `url` | ✅ | URL-encoded target URL |
| `headers` | ❌ | Base64-encoded JSON of extra request headers |

```
GET /api/proxy?url=https%3A%2F%2Fexample.com%2Fvideo.m3u8
GET /api/proxy?url=...&headers=eyJSZWZlcmVyIjoiaHR0cHM6Ly9leGFtcGxlLmNvbS8ifQ==
```

Append `/download` to the path to force a `Content-Disposition: attachment` response.

---

### `GET /api/download`

Forces a file download with a `Content-Disposition: attachment` header. Useful for triggering browser save dialogs.

| Param | Required | Default | Description |
|---|---|---|---|
| `url` | ✅ | — | URL-encoded target URL |
| `filename` | ❌ | `download.mp4` | Output filename |

```
GET /api/download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&filename=fight-club.mp4
```

---

## Providers

| Provider | Type | Notes |
|---|---|---|
| 02MovieDownloader | mp4 + external | Token auth, up to 2160p |
| VixSrc | HLS | Token-gated master playlist |
| VidSrc | HLS | Multi-hop iframe chain |
| Uembed / Madplay | HLS | 4-API fan-out + M3U8 parsing |
| VidRock | HLS + mp4 | AES-CBC encrypted item IDs |
| RgShows | mp4 | Simple JSON stream |
| VidZee | HLS | 14-server parallel fan-out + AES-CBC decrypt |
| 02Embed | HLS | Fallback |

All providers run in parallel. A failed provider never blocks results from the others.

---

## Usage from any frontend

```js
const res = await fetch("https://vyla-api.pages.dev/api/stream/movie?id=550");
const { sources, subtitles } = await res.json();

// Pick highest quality (already sorted)
const best = sources[0];

// Play with hls.js
const hls = new Hls();
hls.loadSource(best.url);
hls.attachMedia(videoElement);
```

---

## TMDB IDs

```
https://www.themoviedb.org/movie/550-fight-club   →  id=550
https://www.themoviedb.org/tv/456-the-simpsons    →  id=456
```

---

## License

MIT