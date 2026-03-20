const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

const BLOCKED_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
]);

function isBlockedHost(hostname) {
    if (BLOCKED_HOSTS.has(hostname)) return true;
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return true;
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    return false;
}

function buildUpstreamHeaders(url, rawHeaders) {
    const origin = (() => { try { return new URL(url).origin; } catch { return ""; } })();
    const base = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: origin,
        Referer: origin + "/",
    };
    if (!rawHeaders) return base;
    try {
        const extra = JSON.parse(atob(rawHeaders));
        return { ...base, ...extra };
    } catch {
        return base;
    }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestHead({ request }) {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get("url");
    if (!encodedUrl) {
        return new Response(null, { status: 400, headers: CORS });
    }

    let url;
    try {
        url = decodeURIComponent(encodedUrl);
        const { hostname } = new URL(url);
        if (isBlockedHost(hostname)) {
            return new Response(null, { status: 403, headers: CORS });
        }
    } catch {
        return new Response(null, { status: 400, headers: CORS });
    }

    const rawHeaders = searchParams.get("headers");
    const upstreamHeaders = buildUpstreamHeaders(url, rawHeaders);

    let upstream;
    try {
        upstream = await fetch(url, { method: "HEAD", headers: upstreamHeaders });
    } catch (e) {
        return new Response(null, { status: 502, headers: CORS });
    }

    const passthrough = ["content-type", "content-length", "accept-ranges", "last-modified", "etag"];
    const resHeaders = { ...CORS };
    for (const h of passthrough) {
        const v = upstream.headers.get(h);
        if (v) resHeaders[h] = v;
    }

    return new Response(null, { status: upstream.status, headers: resHeaders });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get("url");

    if (!encodedUrl) {
        return Response.json({ error: "Missing url parameter" }, { status: 400, headers: CORS });
    }

    let url;
    try {
        url = decodeURIComponent(encodedUrl);
        const { hostname } = new URL(url);
        if (isBlockedHost(hostname)) {
            return Response.json({ error: "Blocked host" }, { status: 403, headers: CORS });
        }
    } catch {
        return Response.json({ error: "Invalid url" }, { status: 400, headers: CORS });
    }

    const rawHeaders = searchParams.get("headers");
    const upstreamHeaders = buildUpstreamHeaders(url, rawHeaders);

    let upstream;
    try {
        upstream = await fetch(url, {
            headers: upstreamHeaders,
            cf: { cacheTtl: 300, cacheEverything: true },
        });
    } catch (e) {
        return Response.json({ error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json(
            { error: "Upstream error " + upstream.status },
            { status: upstream.status, headers: CORS }
        );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const isM3u8 = contentType.includes("mpegurl") || url.includes(".m3u8");

    if (isM3u8) {
        const text = await upstream.text();
        const base = url.substring(0, url.lastIndexOf("/") + 1);
        const selfOrigin = new URL(request.url).origin;
        const proxyBase = selfOrigin + "/api/proxy?url=";

        const rewritten = text.split("\n").map((line) => {
            const t = line.trim();
            if (!t || t.startsWith("#")) return line;
            let absolute;
            try {
                absolute = new URL(t, base).toString();
            } catch {
                return line;
            }
            return proxyBase + encodeURIComponent(absolute) + (rawHeaders ? "&headers=" + encodeURIComponent(rawHeaders) : "");
        }).join("\n");

        return new Response(rewritten, {
            status: 200,
            headers: {
                ...CORS,
                "Content-Type": "application/vnd.apple.mpegurl",
                "Cache-Control": "public, max-age=300",
            },
        });
    }

    const passthrough = ["content-type", "content-length", "accept-ranges", "content-range", "last-modified", "etag"];
    const resHeaders = { ...CORS, "Cache-Control": "public, max-age=300" };
    for (const h of passthrough) {
        const v = upstream.headers.get(h);
        if (v) resHeaders[h] = v;
    }

    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}