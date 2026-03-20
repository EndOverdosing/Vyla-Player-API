const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function get(url, headers = {}) {
    return fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...headers },
    });
}

async function getJson(url, headers = {}) {
    return (await get(url, headers)).json().catch(() => null);
}

async function getText(url, headers = {}) {
    return (await get(url, headers)).text().catch(() => "");
}

async function aesCbcDecrypt(keyBytes, ivBytes, cipherBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, cipherBytes);
    return new TextDecoder().decode(plain);
}

async function aesCbcEncrypt(keyBytes, ivBytes, plainBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
    const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, plainBytes);
    return new Uint8Array(cipher);
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function pkcs7Pad(data, blockSize = 16) {
    const pad = blockSize - (data.length % blockSize);
    const out = new Uint8Array(data.length + pad);
    out.set(data);
    out.fill(pad, data.length);
    return out;
}

function resolveUrl(base, relative) {
    try {
        return new URL(relative, base).href;
    } catch {
        return relative;
    }
}

async function provider02Downloader(mediaType, tmdbId, season, episode) {
    const BASE = "https://02moviedownloader.site";
    const sources = [];
    try {
        const ref =
            mediaType === "movie"
                ? `${BASE}/api/download/movie/${tmdbId}`
                : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
        const tokRes = await fetch(`${BASE}/api/verify-robot`, {
            method: "POST",
            headers: { "User-Agent": UA, Referer: ref, Origin: BASE },
        });
        const tokData = await tokRes.json().catch(() => ({}));
        const token = tokData?.success && tokData?.token ? tokData.token : null;
        if (!token) return [];
        const apiUrl =
            mediaType === "movie"
                ? `${BASE}/api/download/movie/${tmdbId}`
                : `${BASE}/api/download/tv/${tmdbId}/${season}/${episode}`;
        const data = await getJson(apiUrl, { "x-session-token": token, Origin: BASE, Referer: BASE });
        if (!data) return [];
        for (const d of data?.data?.downloadData?.data?.downloads ?? []) {
            if (d?.url) sources.push({ url: d.url, quality: `${d.resolution}p`, type: "mp4", provider: "02MovieDownloader" });
        }
        for (const s of data?.externalStreams ?? []) {
            const u = s?.url ?? "";
            if (u && !u.includes("111477.xyz")) {
                sources.push({ url: u, quality: s.quality ?? "Unknown", type: u.includes(".mkv") ? "mkv" : "mp4", provider: "02MovieDownloader" });
            }
        }
    } catch { }
    return sources;
}

async function providerRgShows(mediaType, tmdbId, season, episode) {
    const BASE = "https://api.rgshows.ru/main";
    try {
        const url =
            mediaType === "movie"
                ? `${BASE}/movie/${tmdbId}`
                : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
        const data = await getJson(url, { Origin: "https://www.rgshows.ru", Referer: "https://www.rgshows.ru" });
        if (data?.stream?.url) {
            return [{ url: data.stream.url, quality: "1080p", type: "mp4", provider: "RgShows" }];
        }
    } catch { }
    return [];
}

async function providerUembed(mediaType, tmdbId, season, episode) {
    const sources = [];
    const hollyParams =
        mediaType === "movie"
            ? `id=${tmdbId}&token=thestupidthings&type=movie`
            : `id=${tmdbId}&token=thestupidthings&type=series&season=${season}&episode=${episode}`;
    const apis = [
        `https://uembed.xyz/api/video/tmdb?id=${tmdbId}`,
        ...(mediaType === "movie" ? [`https://cdn.madplay.site/vxr?id=${tmdbId}&type=movie`] : []),
        `https://api.madplay.site/api/movies/holly?${hollyParams}`,
        `https://api.madplay.site/api/rogflix?${hollyParams}`,
    ];
    for (const api of apis) {
        try {
            const data = await getJson(api, { Origin: "https://madplay.site", Referer: "https://madplay.site" });
            if (Array.isArray(data)) {
                for (const stream of data) {
                    if (stream?.file) sources.push({ url: stream.file, quality: "Auto", type: "hls", provider: "Uembed" });
                }
                if (sources.length) break;
            }
        } catch { }
    }
    return sources;
}

async function providerVidRock(mediaType, tmdbId, season, episode) {
    const BASE = "https://vidrock.net/";
    const sources = [];
    try {
        const itemId = mediaType === "movie" ? String(tmdbId) : `${tmdbId}_${season}_${episode}`;
        const passphrase = new TextEncoder().encode("x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9");
        const iv = passphrase.slice(0, 16);
        const padded = pkcs7Pad(new TextEncoder().encode(itemId));
        const encrypted = await aesCbcEncrypt(passphrase, iv, padded);
        const b64 = bytesToB64(encrypted).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
        const url = `${BASE}api/${mediaType}/${b64}`;
        const data = await getJson(url, { Referer: BASE, Origin: BASE });
        if (!data || typeof data !== "object") return [];
        for (const [, stream] of Object.entries(data)) {
            if (!stream?.url) continue;
            if (stream.url.includes("hls2.vdrk.site")) {
                const list = await getJson(stream.url);
                if (Array.isArray(list)) {
                    for (const obj of list) {
                        let fUrl = obj.url;
                        if (fUrl?.startsWith("https://proxy.vidrock.store/")) {
                            fUrl = decodeURIComponent(fUrl.replace("https://proxy.vidrock.store/", "")).replace(/^\//, "");
                        }
                        if (fUrl) sources.push({ url: fUrl, quality: `${obj.resolution ?? 1080}p`, type: fUrl.includes(".mp4") ? "mp4" : "hls", provider: "VidRock" });
                    }
                }
            } else {
                sources.push({ url: stream.url, quality: "1080p", type: "hls", provider: "VidRock" });
            }
        }
    } catch { }
    return sources;
}

async function providerVidSrc(mediaType, tmdbId, season, episode) {
    const BASE = "https://vsembed.ru";
    const sources = [];
    try {
        const pageUrl =
            mediaType === "movie"
                ? `${BASE}/embed/movie?tmdb=${tmdbId}`
                : `${BASE}/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`;
        const html1 = await getText(pageUrl);
        const iframeMatch = html1.match(/<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i);
        if (!iframeMatch) return [];
        let secUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
        const html2 = await getText(secUrl, { Referer: pageUrl });
        const srcMatch = html2.match(/src:\s*['"]([^'"]+)['"]/i);
        if (!srcMatch) return [];
        const thirdUrl = resolveUrl(secUrl, srcMatch[1]);
        const html3 = await getText(thirdUrl, { Referer: secUrl });
        const fileMatch = html3.match(/file\s*:\s*["']([^"']+)["']/i);
        if (!fileMatch) return [];
        const rawUrls = fileMatch[1].split(/\s+or\s+/i);
        const domains = { "{v1}": "neonhorizonworkshops.com", "{v2}": "wanderlynest.com", "{v3}": "orchidpixelgardens.com", "{v4}": "cloudnestra.com" };
        for (let tpl of rawUrls) {
            for (const [k, v] of Object.entries(domains)) tpl = tpl.replaceAll(k, v);
            if (!tpl.includes("{")) sources.push({ url: tpl, quality: "HD", type: "hls", provider: "VidSrc" });
        }
    } catch { }
    return sources;
}

async function providerVidZee(mediaType, tmdbId, season, episode) {
    const BASE = "https://player.vidzee.wtf";
    const sources = [];

    async function decryptLink(linkB64) {
        try {
            const raw = atob(linkB64);
            const [ivB64, cipherB64] = raw.split(":");
            const iv = b64ToBytes(ivB64);
            const cipher = b64ToBytes(cipherB64);
            const keyStr = atob("YWxvb2tlcGFyYXRoZXdpdGhsYXNzaQ==").padEnd(32, "\0");
            const keyBytes = new TextEncoder().encode(keyStr);
            const decrypted = await aesCbcDecrypt(keyBytes, iv, cipher);
            return decrypted.replace(/\0/g, "").trim();
        } catch {
            return null;
        }
    }

    async function fetchServer(sr) {
        const url = `${BASE}/api/server?id=${tmdbId}&sr=${sr}` + (mediaType === "tv" ? `&ss=${season}&ep=${episode}` : "");
        try {
            return await getJson(url, { Referer: BASE });
        } catch {
            return null;
        }
    }

    const results = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => fetchServer(i + 1)));
    for (const r of results) {
        if (r.status !== "fulfilled" || !r.value?.url) continue;
        for (const stream of r.value.url) {
            const dec = await decryptLink(stream?.link ?? "");
            if (dec?.startsWith("http")) sources.push({ url: dec, quality: "Auto", type: "hls", provider: "VidZee" });
        }
    }
    return sources;
}

async function providerVixSrc(mediaType, tmdbId, season, episode) {
    const BASE = "https://vixsrc.to";
    try {
        const url = mediaType === "movie" ? `${BASE}/movie/${tmdbId}` : `${BASE}/tv/${tmdbId}/${season}/${episode}`;
        const html = await getText(url, { Referer: BASE });
        const t = html.match(/token['"]\s*:\s*['"]([^'"]+)/)?.[1];
        const e = html.match(/expires['"]\s*:\s*['"]([^'"]+)/)?.[1];
        const p = html.match(/url\s*:\s*['"]([^'"]+)/)?.[1];
        if (t && e && p && parseInt(e) * 1000 - 60000 > Date.now()) {
            const sep = p.includes("?") ? "&" : "?";
            return [{ url: `${p}${sep}token=${t}&expires=${e}&h=1`, quality: "1080p", type: "hls", provider: "VixSrc" }];
        }
    } catch { }
    return [];
}

async function verifySources(sources) {
    const seen = new Set();
    const unique = sources.filter((s) => {
        if (!s?.url || seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
    });
    const results = await Promise.allSettled(
        unique.map(async (s) => {
            try {
                const res = await fetch(s.url, {
                    method: "HEAD",
                    headers: { "User-Agent": UA, Referer: "https://google.com" },
                    redirect: "follow",
                });
                return [200, 206, 302].includes(res.status) ? s : null;
            } catch {
                return null;
            }
        })
    );
    return results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
}

async function encryptUrl(url, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
        { name: "AES-CBC" },
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(url));
    const combined = new Uint8Array(16 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 16);
    return btoa(String.fromCharCode(...combined)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1", origin = "", secret = "") {
    const settled = await Promise.allSettled([
        provider02Downloader(mediaType, tmdbId, season, episode),
        providerRgShows(mediaType, tmdbId, season, episode),
        providerUembed(mediaType, tmdbId, season, episode),
        providerVidRock(mediaType, tmdbId, season, episode),
        providerVidSrc(mediaType, tmdbId, season, episode),
        providerVidZee(mediaType, tmdbId, season, episode),
        providerVixSrc(mediaType, tmdbId, season, episode),
    ]);
    const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const verified = await verifySources(all);
    if (!origin || !secret) return verified;
    const mapped = await Promise.all(verified.map(async (s) => ({ ...s, url: `${origin}/proxy?t=${await encryptUrl(s.url, secret)}` })));
    return mapped;
}