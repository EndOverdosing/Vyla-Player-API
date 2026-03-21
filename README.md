![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

A Cloudflare Pages API for scraping and streaming movies & TV shows via TMDB ID. Aggregates sources from 8 providers, proxies streams to handle CORS, and serves a zero-UI embedded player.

**[https://vyla.mintlify.app](https://vyla.mintlify.app)**

---

## Base URL

```
https://vyla-api.pages.dev
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/movie?id=<tmdb_id>` | Scrape sources for a movie |
| GET | `/api/tv?id=<tmdb_id>&season=<s>&episode=<e>` | Scrape sources for a TV episode |
| GET | `/api/proxy?url=<encoded_url>&headers=<b64>` | CORS proxy with m3u8 rewriting |
| GET | `/api/download?url=<encoded_url>&filename=<name>` | Download a video file |
| GET | `/api/download?url=<encoded_url>&info=1` | Get file metadata as JSON |
| GET | `/api/stream/movie?id=<tmdb_id>` | Alias of `/api/movie` |
| GET | `/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>` | Alias of `/api/tv` |

---

## Quick Start

```bash
# Fetch movie sources
curl https://vyla-api.pages.dev/api/movie?id=27205

# Fetch TV episode sources
curl "https://vyla-api.pages.dev/api/tv?id=1396&season=1&episode=1"
```

---

## Providers

Sources are scraped concurrently, deduplicated, filtered to English audio, and sorted by quality.

`02MovieDownloader` · `VixSrc` · `VidSrc` · `Uembed` · `VidRock` · `RgShows` · `VidZee` · `02Embed`

---

## Deployment

```bash
# Local dev
wrangler pages dev

# Deploy
wrangler pages deploy
```

---

## File Structure

```
functions/
├── _lib/
│   ├── proxy.js
│   └── scraper.js
└── api/
    ├── stream/
    │   ├── movie.js
    │   ├── proxy.js
    │   └── tv.js
    ├── download.js
    ├── index.js
    ├── movie.js
    ├── proxy.js
    └── tv.js
```