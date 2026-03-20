export async function onRequestGet() {
    return Response.json({
        status: "ok",
        service: "vyla-api",
        endpoints: {
            movie: "/api/movie?id=<tmdb_id>",
            tv: "/api/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            stream_movie: "/api/stream/movie?id=<tmdb_id>",
            stream_tv: "/api/stream/tv?id=<tmdb_id>&season=<s>&episode=<e>",
            proxy: "/api/proxy?url=<encoded_url>&headers=<base64_headers>",
            download: "/api/download?url=<encoded_url>&filename=<name.mp4>",
            download_info: "/api/download?url=<encoded_url>&info=1",
            player_movie: "/api/player?type=movie&id=<tmdb_id>",
            player_tv: "/api/player?type=tv&id=<tmdb_id>&season=<s>&episode=<e>",
        },
    });
}