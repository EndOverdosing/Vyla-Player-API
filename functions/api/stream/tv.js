import { scrape } from "../../_lib/scraper.js";

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
    const season = searchParams.get("season") ?? "1";
    const episode = searchParams.get("episode") ?? "1";

    if (!id) {
        return Response.json(
            { success: false, error: "Missing id" },
            { status: 400, headers: CORS }
        );
    }

    const { sources, subtitles } = await scrape("tv", id, season, episode);

    const mapped = sources.map(s => ({ ...s, vlc_url: s.url }));

    return Response.json(
        { success: mapped.length > 0, results_found: mapped.length, sources: mapped, subtitles },
        { headers: CORS }
    );
}