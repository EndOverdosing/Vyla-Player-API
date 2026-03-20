const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get("url");
    const filename = searchParams.get("filename") || "download.mp4";

    if (!encodedUrl) {
        return Response.json({ error: "Missing url" }, { status: 400, headers: CORS });
    }

    const decoded = decodeURIComponent(encodedUrl);

    let upstream;
    try {
        upstream = await fetch(decoded, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "Referer": "https://02movie.com/",
                "Origin": "https://02movie.com",
            },
        });
    } catch (e) {
        return Response.json({ error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ error: "Upstream returned " + upstream.status }, { status: 502, headers: CORS });
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
        },
    });
}
