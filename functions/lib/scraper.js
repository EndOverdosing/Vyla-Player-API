const EMBED_BASE = "https://02pcembed.site";
const HLS_PROXY = "https://madvid3.xyz/api/hls-proxy?url=";

function rewriteUrl(url) {
    if (!url) return null;
    if (url.startsWith("/")) url = EMBED_BASE + url;
    if (url.includes("02pcembed.site/v1/proxy")) {
        return HLS_PROXY + encodeURIComponent(url);
    }
    return url;
}

function isErrorSource(url) {
    try {
        let cleanUrl = url.replace(HLS_PROXY, "");
        cleanUrl = decodeURIComponent(cleanUrl);
        const urlObj = new URL(cleanUrl);
        const dataParam = urlObj.searchParams.get("data");
        
        if (dataParam) {
            const innerJson = JSON.parse(decodeURIComponent(dataParam));
            return innerJson?.url === "error";
        }
        return false;
    } catch {
        return false;
    }
}

function getProviderName(url) {
    if (url.includes("02pcembed")) return "02Embed (Fast)";
    if (url.includes("hakunaymatata")) return "Hakuna";
    if (url.includes("bcdnxw")) return "BunnyCDN";
    return "Primary Server";
}

function estimateBitrate(quality) {
    const rates = {
        "2160p": "15-20 Mbps",
        "1080p": "5-8 Mbps",
        "720p": "2-4 Mbps",
        "480p": "1-1.5 Mbps",
        "360p": "800 Kbps"
    };
    return rates[quality] || "Auto / Variable";
}

function normalizeSubtitles(subtitles) {
    const uniqueSubs = new Map();
    
    for (const sub of subtitles) {
        const url = rewriteUrl(sub.url);
        if (!url) continue;
        
        const label = sub.label || "Unknown";
        
        if (!uniqueSubs.has(label)) {
            uniqueSubs.set(label, {
                url,
                label,
                format: sub.format ?? "vtt"
            });
        }
    }
    
    return Array.from(uniqueSubs.values());
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1") {
    const endpoint = mediaType === "movie"
        ? `/v1/movies/${tmdbId}`
        : `/v1/tv/${tmdbId}/seasons/${season}/episodes/${episode}`;

    let data;
    try {
        const res = await fetch(`${EMBED_BASE}${endpoint}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
            },
        });
        
        if (!res.ok) return { sources: [], subtitles: [] };
        data = await res.json();
    } catch {
        return { sources: [], subtitles: [] };
    }

    const seen = new Set();
    const sources = [];

    for (const source of data.sources ?? []) {
        const url = rewriteUrl(source.url);
        if (!url || isErrorSource(url)) continue;
        
        const rawDecoded = decodeURIComponent(url);
        if (seen.has(url) || seen.has(rawDecoded)) continue;
        
        seen.add(url);
        seen.add(rawDecoded);
        
        sources.push({ 
            url, 
            quality: source.quality ?? "Auto", 
            type: source.type ?? "hls",
            provider: getProviderName(url),
            bitrate: estimateBitrate(source.quality)
        });
    }

    sources.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA; 
    });

    const subtitles = normalizeSubtitles(data.subtitles ?? []);

    return { sources, subtitles };
}
