import { scrape } from "../../_lib/scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

function getSourceHeaders(url) {
    if (url.includes("hakunaymatata")) return { Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc" };
    if (url.includes("tripplestream.online") || url.includes("hlmv-files")) return { Referer: "https://www.rgshows.ru/", Origin: "https://www.rgshows.ru" };
    if (url.includes("vixsrc.to") || url.includes("/playlist/")) return { Referer: "https://vixsrc.to/", Origin: "https://vixsrc.to" };
    if (url.includes("vdrk.site") || url.includes("vidrock")) return { Referer: "https://vidrock.net/", Origin: "https://vidrock.net" };
    if (url.includes("madvid3.xyz")) return { Referer: "https://madvid3.xyz/", Origin: "https://madvid3.xyz" };
    if (url.includes("goodstream.cc")) return { Referer: "https://goodstream.cc/", Origin: "https://goodstream.cc" };
    try { const o = new URL(url).origin; return { Referer: o + "/", Origin: o }; } catch { return {}; }
}

function buildFfmpegCommand(url, headers, filename) {
    const safe = (filename || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    const parts = [
        headers.Referer ? `Referer: ${headers.Referer}\\r\\n` : "",
        headers.Origin ? `Origin: ${headers.Origin}\\r\\n` : "",
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36\\r\\n`,
    ].filter(Boolean).join("");
    return `ffmpeg -headers "${parts}" -i "${url}" -c copy -bsf:a aac_adtstoasc ${safe}`;
}

function buildDownloadUrl(url, headers, filename) {
    if (url.includes("hakunaymatata")) {
        return "https://02movie.com/api/download?url=" + encodeURIComponent(url) + "&filename=" + encodeURIComponent(filename);
    }
    const h = Object.keys(headers).length
        ? "&headers=" + encodeURIComponent(btoa(JSON.stringify(headers)))
        : "";
    return `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}${h}`;
}

function unwrapEmbedUrl(url) {
    if (!url.includes("madvid3.xyz") && !url.includes("02pcembed.site")) return url;
    try {
        const u = new URL(url);
        const inner = u.searchParams.get("url");
        if (!inner) return url;
        const inner2 = new URL(decodeURIComponent(inner));
        const data = inner2.searchParams.get("data");
        if (!data) return url;
        const parsed = JSON.parse(decodeURIComponent(data));
        return parsed.url || url;
    } catch { return url; }
}

function dedupeKey(url) {
    const real = unwrapEmbedUrl(url);
    try {
        const u = new URL(real);
        if (/^tmstr\d+\./.test(u.hostname)) return "tmstr:" + u.pathname;
        if (u.hostname.includes("hakunaymatata")) {
            u.searchParams.delete("sign");
            u.searchParams.delete("t");
            return u.toString();
        }
        return real;
    } catch { return real; }
}

function deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(s => {
        const real = unwrapEmbedUrl(s.url);
        if (!real || real === "error" || real === "null" || !real.startsWith("http")) return false;
        const key = dedupeKey(s.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function fetchSignedUrls(tmdbId) {
    try {
        const res = await fetch("https://02movie.com/api/movies/download?id=" + tmdbId, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
                Referer: "https://02movie.com/",
                Origin: "https://02movie.com",
            },
        });
        if (!res.ok) return null;
        const text = await res.text();
        const clean = text.replace(/```json|```/g, "").trim();
        return JSON.parse(clean);
    } catch {
        return null;
    }
}

function enrichSource(s, index, prefix) {
    const realUrl = unwrapEmbedUrl(s.url);
    const isHLS = s.type === "hls" || realUrl.includes(".m3u8") || realUrl.includes("/playlist/");
    const realHeaders = getSourceHeaders(realUrl);
    const filename = `${prefix}_${s.quality || "unknown"}_${index + 1}.mp4`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(realUrl)}&headers=${encodeURIComponent(btoa(JSON.stringify(realHeaders)))}`;

    return {
        provider: s.provider,
        quality: s.quality || "unknown",
        type: s.type,
        url: realUrl,
        is_hls: isHLS,
        referer: realHeaders.Referer || null,
        ffmpeg_command: buildFfmpegCommand(realUrl, realHeaders, filename),
        download_url: isHLS ? null : buildDownloadUrl(realUrl, realHeaders, filename),
        vlc_url: proxyUrl,
    };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

function normalizeVixsrcSubtitle(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete("token");
        u.searchParams.delete("expires");
        u.searchParams.delete("edge");
        return u.toString();
    } catch { return url; }
}

function unwrapSubtitleUrl(url) {
    if (!url.includes("madvid3.xyz") && !url.includes("02pcembed.site")) {
        if (url.includes("vixsrc.to") && url.includes("type=subtitle")) {
            return normalizeVixsrcSubtitle(url);
        }
        return url;
    }
    try {
        const u = new URL(url);
        const inner = u.searchParams.get("url");
        if (!inner) return url;
        const inner2 = new URL(decodeURIComponent(inner));
        const data = inner2.searchParams.get("data");
        if (!data) return url;
        const parsed = JSON.parse(decodeURIComponent(data));
        const realUrl = parsed.url || url;
        if (realUrl.includes("vixsrc.to") && realUrl.includes("type=subtitle")) {
            return normalizeVixsrcSubtitle(realUrl);
        }
        return realUrl;
    } catch { return url; }
}

function deduplicateSubtitles(subtitles) {
    const seen = new Set();
    return subtitles.filter(s => {
        if (!s.url || !s.url.startsWith("http")) return false;
        const real = unwrapSubtitleUrl(s.url);
        if (seen.has(real)) return false;
        seen.add(real);
        return true;
    });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const season = searchParams.get("season") ?? "1";
    const episode = searchParams.get("episode") ?? "1";

    if (!id) {
        return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    }

    const [{ sources, subtitles }, signedData] = await Promise.all([
        scrape("tv", id, season, episode),
        fetchSignedUrls(id),
    ]);

    const deduped = deduplicateSources(sources);

    const signedMap = new Map();
    if (signedData) {
        const downloads = signedData?.data?.downloadData?.data?.downloads ?? [];
        for (const dl of downloads) {
            if (dl.url && dl.resolution) {
                signedMap.set(dl.resolution + "p", dl.url);
            }
        }
    }

    const prefix = `s${season}e${episode}`;
    const results = deduped.map((s, i) => {
        const base = enrichSource(s, i, prefix);
        if (!base.is_hls && signedMap.has(s.quality)) {
            const signedUrl = signedMap.get(s.quality);
            base.download_url = buildDownloadUrl(signedUrl, `${prefix}_${s.quality}_${i + 1}.mp4`);
        }
        return base;
    });

    const cleanSubtitles = deduplicateSubtitles(subtitles);

    return new Response(JSON.stringify({
        success: results.length > 0,
        tmdb_id: id,
        season,
        episode,
        results_found: results.length,
        sources: results,
        subtitles: cleanSubtitles,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
}