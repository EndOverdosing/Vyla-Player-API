![Vyla API](https://github.com/EndOverdosing/Vyla-Player-API/blob/main/images/banner.png?raw=true)

# vyla-api

A Cloudflare Pages API for scraping and streaming movies and TV shows via TMDB IDs. Aggregates sources from multiple providers, proxies streams to handle CORS, and serves a zero-UI embedded player.

---

## Base URL

```
https://vyla-api.pages.dev
```

---

## Endpoints

### `GET /api/movie`
Scrape all available sources for a movie.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | ✅ | TMDB movie ID |

**Example**
```
/api/movie?id=27205
```

**Response**
```json
{
  "success": true,
  "results_found": 4,
  "sources": [
    {
      "url": "https://...",
      "type": "hls",
      "quality": "1080p",
      "provider": "VixSrc",
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

---

### `GET /api/tv`
Scrape all available sources for a TV episode.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | ✅ | TMDB series ID |
| `season` | string | ❌ | Season number (default: `1`) |
| `episode` | string | ❌ | Episode number (default: `1`) |

**Example**
```
/api/tv?id=1396&season=1&episode=1
```

---

### `GET /api/stream/movie`
Same as `/api/movie` but nested under the `/stream` path.

```
/api/stream/movie?id=27205
```

---

### `GET /api/stream/tv`
Same as `/api/tv` but nested under the `/stream` path.

```
/api/stream/tv?id=1396&season=2&episode=3
```

---

### `GET /api/stream/scraper`
Generic scraper endpoint supporting both types via a `type` param.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | ✅ | TMDB ID |
| `type` | string | ✅ | `movie` or `tv` |
| `season` | string | ❌ | Season (TV only) |
| `episode` | string | ❌ | Episode (TV only) |

**Example**
```
/api/stream/scraper?id=1396&type=tv&season=1&episode=1
```

---

### `GET /api/player`
Returns a fullscreen embedded HTML video player that scrapes and streams the content directly in the browser. No UI controls — pure video.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | ✅ | TMDB ID |
| `type` | string | ❌ | `movie` or `tv` (default: `movie`) |
| `season` | string | ❌ | Season (TV only, default: `1`) |
| `episode` | string | ❌ | Episode (TV only, default: `1`) |

**Examples**
```
/api/player?type=movie&id=27205
/api/player?type=tv&id=1396&season=1&episode=1
```

HLS streams are played via HLS.js. If the first source fails, the player automatically falls through to the next available source. Subtitles are injected as native `<track>` elements when available.

---

### `GET /api/proxy`
Proxies any URL through Cloudflare, handling CORS and required referer/origin headers. Rewrites m3u8 playlists so all segment URLs are also proxied.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | ✅ | URL-encoded target URL |
| `headers` | string | ❌ | Base64-encoded JSON of additional request headers |

**Examples**
```
/api/proxy?url=https%3A%2F%2Fexample.com%2Fstream.m3u8
/api/proxy?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&headers=eyJSZWZlcmVyIjoiaHR0cHM6Ly9leGFtcGxlLmNvbSJ9
```

Supports `GET` and `HEAD`. Private IPs and localhost are blocked.

---

### `GET /api/download`
Downloads a video file and streams it to the browser with proper headers.

**Parameters**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | ✅ | URL-encoded video URL |
| `filename` | string | ❌ | Output filename (default: `download.mp4`) |
| `info` | string | ❌ | Set to `1` to return JSON metadata instead of the file |

**Download a file**
```
/api/download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&filename=inception.mp4
```

**Get file metadata**
```
/api/download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&info=1
```

**Metadata response**
```json
{
  "success": true,
  "resolved_url": "https://...",
  "original_url": "https://...",
  "filename": "inception.mp4",
  "status": 200,
  "content_type": "video/mp4",
  "content_length": 1610612736,
  "content_length_mb": 1536.0,
  "accept_ranges": "bytes",
  "last_modified": "Mon, 01 Jan 2024 00:00:00 GMT",
  "download_url": "/api/download?url=...&filename=inception.mp4"
}
```

---

### `GET /`
Health check and endpoint index.

**Response**
```json
{
  "status": "ok",
  "service": "vyla-api",
  "endpoints": {
    "movie": "/api/movie?id=<tmdb_id>",
    "tv": "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
    "stream_movie": "/api/stream/movie?id=<tmdb_id>",
    "stream_tv": "/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>",
    "stream_scraper": "/api/stream/scraper?id=<tmdb_id>&type=<movie|tv>&season=<s>&episode=<e>",
    "proxy": "/api/proxy?url=<encoded_url>&headers=<base64_headers>",
    "download": "/api/download?url=<encoded_url>&filename=<name.mp4>",
    "player": "/player?type=movie&id=<tmdb_id>"
  }
}
```

---

## Providers

Sources are scraped concurrently from all providers and deduplicated. Results are sorted by quality (highest first) and filtered to English audio only.

| Provider | Type | Notes |
|----------|------|-------|
| 02MovieDownloader | mp4 / hls | Requires token verification |
| VixSrc | hls | Token + expiry from page HTML |
| VidSrc | hls | Multi-domain template resolution |
| Uembed | hls | Multi-API with m3u8 variant resolution |
| VidRock | hls / mp4 | AES-CBC encrypted item IDs |
| RgShows | mp4 | Single stream per title |
| VidZee | hls | AES-CBC encrypted stream URLs, 14 servers |
| 02Embed | hls | Rewritten via HLS proxy |

---

## Quality Priority

Sources are ranked in this order:

```
4K / 2160p > 1440p > 1080p > 720p > 480p > 360p > 240p > HD > Auto > Unknown
```

---

## Source Object

```json
{
  "url": "https://...",
  "type": "hls | mp4 | mkv",
  "quality": "1080p",
  "provider": "VixSrc",
  "audioTracks": [
    { "language": "eng", "label": "English" }
  ],
  "headers": {
    "Referer": "https://...",
    "Origin": "https://..."
  }
}
```

---

## Subtitle Object

```json
{
  "url": "https://...",
  "label": "English",
  "format": "vtt | srt"
}
```

---

## CORS

All endpoints return:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: *
```

---

## Deployment

Deployed on Cloudflare Pages with Functions.

```
wrangler pages deploy
```

Local development:

```
wrangler pages dev
```

---

## File Structure

```
functions/
├── _lib/
│   ├── proxy.js       # Core proxy logic (GET, HEAD, OPTIONS)
│   └── scraper.js     # All provider scrapers + scrape() export
└── api/
    ├── stream/
    │   ├── movie.js
    │   ├── proxy.js
    │   ├── scraper.js
    │   └── tv.js
    ├── download.js
    ├── index.js
    ├── movie.js
    ├── player.js
    ├── proxy.js
    └── tv.js
```