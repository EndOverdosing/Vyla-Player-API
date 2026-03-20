const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

const EMBED_BASE = "https://02pcembed.site";
const SELF_PROXY = "https://madvid3.xyz/api/hls-proxy?url=";

function rewriteUrl(url) {
    if (!url) return null;
    if (url.startsWith("/")) url = EMBED_BASE + url;
    if (url.includes("02pcembed.site/v1/proxy")) {
        return SELF_PROXY + encodeURIComponent(url);
    }
    return url;
}

function isErrorSource(url) {
    try {
        const inner = JSON.parse(decodeURIComponent(decodeURIComponent(url.replace(SELF_PROXY, ""))));
        return inner?.url === "error";
    } catch {
        return false;
    }
}

async function scrapeMovie(tmdbId) {
    let data;
    try {
        const res = await fetch(`${EMBED_BASE}/v1/movies/${tmdbId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
            },
        });
        if (!res.ok) return { sources: [], subtitles: [] };
        data = await res.json();
    } catch {
        return { sources: [], subtitles: [] };
    }
    return buildResult(data);
}

async function scrapeTV(tmdbId, season, episode) {
    let data;
    try {
        const res = await fetch(`${EMBED_BASE}/v1/tv/${tmdbId}/seasons/${season}/episodes/${episode}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
            },
        });
        if (!res.ok) return { sources: [], subtitles: [] };
        data = await res.json();
    } catch {
        return { sources: [], subtitles: [] };
    }
    return buildResult(data);
}

function buildResult(data) {
    const seen = new Set();
    const sources = [];

    for (const source of data.sources ?? []) {
        const url = rewriteUrl(source.url);
        if (!url || seen.has(url) || isErrorSource(url)) continue;
        seen.add(url);
        sources.push({ url, quality: source.quality ?? "Auto", type: source.type ?? "hls" });
    }

    const subtitlesSeen = new Set();
    const subtitles = (data.subtitles ?? []).map(sub => ({
        url: rewriteUrl(sub.url),
        label: sub.label,
        format: sub.format ?? "vtt",
    })).filter(s => {
        if (!s.url || subtitlesSeen.has(s.url)) return false;
        subtitlesSeen.add(s.url);
        return true;
    });

    return { sources, subtitles };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const season = searchParams.get("season") ?? "1";
    const episode = searchParams.get("episode") ?? "1";
    if (!id) return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    const { sources, subtitles } = await scrapeTV(id, season, episode);
    return Response.json({ success: sources.length > 0, results_found: sources.length, sources, subtitles }, { headers: CORS });
}
