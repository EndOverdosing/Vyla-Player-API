export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    });
}

export async function onRequestGet({ request }) {
    const url = new URL(request.url);
    url.pathname = "/api/proxy";
    return Response.redirect(url.toString(), 301);
}