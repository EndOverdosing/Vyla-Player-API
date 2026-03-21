const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

function decodeUrl(url) {
    try {
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = url;
            url = decodeURIComponent(url);
            if (url === prev) break;
        }
    } catch { }
    return url;
}

function getHeaders(url, extraHeaders) {
    const isHakunaya = url.includes("hakunaymatata");
    const isTripplestream = url.includes("tripplestream.online") || url.includes("hlmv-files");
    const isVixsrc = url.includes("vixsrc.to");
    const base = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
    };
    if (extraHeaders) return { ...base, ...extraHeaders };
    if (isHakunaya) return { ...base, Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc" };
    if (isTripplestream) return {
        ...base,
        Referer: "https://www.rgshows.ru",
        Origin: "https://www.rgshows.ru",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
    };
    if (isVixsrc) return { ...base, Referer: "https://vixsrc.to/", Origin: "https://vixsrc.to" };
    return base;
}

function getReferer(url) {
    if (url.includes("hakunaymatata")) return "https://lok-lok.cc/";
    if (url.includes("tripplestream.online") || url.includes("hlmv-files")) return "https://www.rgshows.ru/";
    if (url.includes("vixsrc.to") || url.includes("/playlist/")) return "https://vixsrc.to/";
    try { return new URL(url).origin + "/"; } catch { return ""; }
}

function buildFfmpegCommand(url, filename, referer) {
    const safe = (filename || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    const headerStr = [
        referer ? `Referer: ${referer}` : null,
        referer ? `Origin: ${referer.replace(/\/$/, "")}` : null,
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
    ].filter(Boolean).map(h => h + "\\r\\n").join("");
    return `ffmpeg -headers "${headerStr}" -i "${url}" -c copy -bsf:a aac_adtstoasc ${safe}`;
}

async function tryFetch(url, headers) {
    const attempts = [
        { ...headers },
        { ...headers, Referer: "https://www.rgshows.ru", Origin: "https://www.rgshows.ru" },
        { ...headers, Referer: "", Origin: "" },
        { "User-Agent": headers["User-Agent"] },
    ];
    for (const h of attempts) {
        try {
            const res = await fetch(url, { headers: h, cf: { cacheEverything: false } });
            if (res.ok) return res;
        } catch { }
    }
    return null;
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);

    const encodedUrl = searchParams.get("url");
    const filename = searchParams.get("filename") || "video.mp4";
    const info = searchParams.get("info");
    const ffmpeg = searchParams.get("ffmpeg");
    const rawHeaders = searchParams.get("headers");

    if (!encodedUrl) {
        return Response.json({ success: false, error: "Missing url param" }, { status: 400, headers: CORS });
    }

    const decoded = decodeUrl(encodedUrl);

    let finalUrl;
    try {
        finalUrl = new URL(decoded).href;
    } catch {
        return Response.json({ success: false, error: "Invalid URL" }, { status: 400, headers: CORS });
    }

    const isHLS = finalUrl.includes(".m3u8") || finalUrl.includes("/playlist/");

    if (ffmpeg === "1" || isHLS) {
        const referer = getReferer(finalUrl);
        const cmd = buildFfmpegCommand(finalUrl, filename, referer);
        return Response.json({ success: true, ffmpeg_command: cmd, url: finalUrl, referer }, { headers: CORS });
    }

    let extraHeaders = null;
    if (rawHeaders) {
        try {
            extraHeaders = JSON.parse(atob(decodeURIComponent(rawHeaders)));
        } catch { }
    }

    const headers = getHeaders(finalUrl, extraHeaders);

    if (info === "1") {
        try {
            const head = await fetch(finalUrl, { method: "HEAD", headers, cf: { cacheEverything: false } });
            return Response.json({
                success: head.ok,
                status: head.status,
                url: finalUrl,
                content_type: head.headers.get("content-type"),
                content_length: head.headers.get("content-length"),
                is_hls: isHLS,
            }, { headers: CORS });
        } catch (e) {
            return Response.json({ success: false, error: e.message }, { headers: CORS });
        }
    }

    const upstream = await tryFetch(finalUrl, headers);

    if (!upstream) {
        return Response.json({ success: false, error: "All fetch attempts failed" }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ success: false, error: "Upstream returned " + upstream.status }, { status: upstream.status, headers: CORS });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}