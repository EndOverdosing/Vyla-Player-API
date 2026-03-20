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
    const url = searchParams.get("url");

    if (!url) return Response.json({ error: "Missing url" }, { status: 400, headers: CORS });

    try {
        const upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Range": request.headers.get("Range") || "",
            }
        });

        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        const filename = url.split("/").pop().split("?")[0] || "vyla-download";

        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                ...CORS,
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": upstream.headers.get("content-length") || "",
            }
        });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: CORS });
    }
}