export async function onRequestGet() {
    return Response.json({
        status: "ok",
        service: "vyla-api",
        endpoints: {
            movie: "/api/movie?id=<tmdb_id>",
            tv: "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            stream_movie: "/api/stream/movie?id=<tmdb_id>",
            stream_tv: "/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            stream_scraper: "/api/stream/scraper?id=<tmdb_id>&type=<movie|tv>&season=<s>&episode=<e>",
            proxy: "/api/proxy?url=<encoded_url>&headers=<base64_headers>",
            download: "/api/download?url=<encoded_url>&filename=<name.mp4>",
            player: "/player?type=movie&id=<tmdb_id>",
        },
    });
}