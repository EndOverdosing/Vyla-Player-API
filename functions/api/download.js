const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

const PROXY_PATTERNS = {
    "https://hls1.vid1.site": [/\/proxy\/(.+)$/],
    "https://madplay.site": [/\/api\/[^/]+\/proxy\?url=(.+)$/],
    "https://hlsproxy3.asiaflix.net": [/\/m3u8-proxy\?url=(.+?)(?:&|$)/],
    "https://streams.smashystream.top": [/\/proxy\/m3u8\/(.+?)\/[^/]+$/],
    "*": [
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/|https?%3A%2F%2F).+)$/,
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/)?[^/]+\/file2\/.+)$/,
        /^https:\/\/.+?\.workers\.dev\/((?:https?:\/\/).+)$/,
        /\/proxy\/(.+)$/,
        /\/m3u8-proxy\?url=(.+?)(?:&|$)/,
        /\/api\/[^/]+\/proxy\?url=(.+)$/,
        /\/proxy\?.*url=([^&]+)/,
        /\/stream\/proxy\/(.+)$/,
        /\/(?:hls-proxy|proxy)\?url=([^&]+)/,
    ],
};

function unwrapProxy(url) {
    try {
        for (let i = 0; i < 5; i++) {
            const origin = new URL(url).origin;
            const patterns = [...(PROXY_PATTERNS[origin] ?? []), ...PROXY_PATTERNS["*"]];
            let matched = false;
            for (const p of patterns) {
                const m = url.match(p);
                if (m?.[1]) {
                    let decoded = m[1];
                    for (let j = 0; j < 3; j++) {
                        try {
                            const next = decodeURIComponent(decoded);
                            if (next === decoded) break;
                            decoded = next;
                        } catch { break; }
                    }
                    url = decoded;
                    matched = true;
                    break;
                }
            }
            if (!matched) break;
        }
    } catch { }
    return url;
}

function extractEmbeddedHeaders(rawUrl) {
    try {
        const decoded = decodeURIComponent(rawUrl);
        const dataMatch = decoded.match(/[?&]data=(\{.+\})/);
        if (dataMatch) {
            const parsed = JSON.parse(decodeURIComponent(dataMatch[1]));
            return { url: parsed.url ?? null, headers: parsed.headers ?? {} };
        }
    } catch { }
    return { url: null, headers: {} };
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get("url");
    const filename = searchParams.get("filename") || "download.mp4";

    if (!encodedUrl) {
        return Response.json({
            success: false,
            error: "Missing url parameter",
            usage: {
                download: "/api/download?url=<encoded_url>&filename=<name.mp4>",
                info: "/api/download?url=<encoded_url>&info=1",
            },
        }, { status: 400, headers: CORS });
    }

    const { url: embeddedUrl, headers: embeddedHeaders } = extractEmbeddedHeaders(url);
    const finalUrl = embeddedUrl ? embeddedUrl : url;
    const isHakunaya = finalUrl.includes("hakunaymatata");

    const fetchHeaders = {
        ...embeddedHeaders,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36",
        ...(isHakunaya ? { Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc" } : {}),
    };

    if (searchParams.get("info") === "1") {
        let upstream;
        try {
            upstream = await fetch(finalUrl, { method: "HEAD", headers: fetchHeaders });
        } catch (e) {
            return Response.json({ success: false, error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
        }

        const contentLength = upstream.headers.get("content-length");

        return Response.json({
            success: upstream.ok,
            resolved_url: url,
            original_url: rawUrl,
            filename,
            status: upstream.status,
            content_type: upstream.headers.get("content-type"),
            content_length: contentLength ? parseInt(contentLength) : null,
            content_length_mb: contentLength ? parseFloat((parseInt(contentLength) / 1024 / 1024).toFixed(2)) : null,
            accept_ranges: upstream.headers.get("accept-ranges"),
            last_modified: upstream.headers.get("last-modified"),
            download_url: "/api/download?url=" + encodedUrl + "&filename=" + encodeURIComponent(filename),
        }, { headers: CORS });
    }

    let upstream;
    try {
        upstream = await fetch(finalUrl, {
            headers: fetchHeaders,
            cf: { cacheTtl: 3600, cacheEverything: true },
        });
    } catch (e) {
        return Response.json({ success: false, error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ success: false, error: "Upstream returned " + upstream.status }, { status: 502, headers: CORS });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length") || "";

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            ...(contentLength && { "Content-Length": contentLength }),
            "Cache-Control": "public, max-age=3600",
        },
    });
}