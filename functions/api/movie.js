import { scrape } from "./scraper.js";

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
    const id = searchParams.get("id");
    if (!id) return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    const { sources, subtitles } = await scrape("movie", id);
    return Response.json({ success: sources.length > 0, results_found: sources.length, sources, subtitles }, { headers: CORS });
}
