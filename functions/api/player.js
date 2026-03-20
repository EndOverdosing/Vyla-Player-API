import { scrape } from "../_lib/scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams, origin } = new URL(request.url);
    const type = searchParams.get("type") || "movie";
    const id = searchParams.get("id");
    const season = searchParams.get("season") ?? "1";
    const episode = searchParams.get("episode") ?? "1";

    if (!id) {
        return new Response("<h2>Missing ?id=</h2>", {
            status: 400,
            headers: { "Content-Type": "text/html", ...CORS },
        });
    }

    const { sources, subtitles } = await scrape(type, id, season, episode);

    if (!sources.length) {
        return new Response("<h2>No sources found.</h2>", {
            status: 404,
            headers: { "Content-Type": "text/html", ...CORS },
        });
    }

    const proxyBase = origin + "/api/proxy";

    const sourcesJson = JSON.stringify(
        sources.map((s) => ({
            url: proxyBase + "?url=" + encodeURIComponent(s.url) + (s.headers ? "&headers=" + btoa(JSON.stringify(s.headers)) : ""),
            type: s.type,
            quality: s.quality,
            provider: s.provider,
        }))
    );

    const subtitlesJson = JSON.stringify(subtitles);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Player</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;display:block;object-fit:contain}
</style>
</head>
<body>
<video id="v" controls autoplay playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<script>
const SOURCES = ${sourcesJson};
const SUBTITLES = ${subtitlesJson};
const video = document.getElementById("v");
let hls = null;
let idx = 0;
let stallTimer = null;
let started = false;

function clearStallTimer() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
}

function armStallTimer() {
    clearStallTimer();
    stallTimer = setTimeout(() => {
        if (!started) tryNext();
    }, 12000);
}

function onPlaying() {
    started = true;
    clearStallTimer();
}

function attachSubtitles() {
    video.querySelectorAll("track").forEach(t => t.remove());
    SUBTITLES.forEach((sub, i) => {
        const t = document.createElement("track");
        t.kind = "subtitles";
        t.label = sub.label || "English";
        t.srclang = "en";
        t.src = sub.url;
        if (i === 0) t.default = true;
        video.appendChild(t);
    });
}

function load(src) {
    clearStallTimer();
    started = false;
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute("src");
    video.load();

    const isHLS = src.type === "hls" || src.url.includes(".m3u8");

    if (isHLS && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, fragLoadingTimeOut: 10000, manifestLoadingTimeOut: 10000 });
        hls.loadSource(src.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            armStallTimer();
            video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) { clearStallTimer(); tryNext(); }
        });
    } else if (video.canPlayType("application/vnd.apple.mpegurl") && isHLS) {
        video.src = src.url;
        armStallTimer();
        video.play().catch(() => {});
    } else {
        video.src = src.url;
        armStallTimer();
        video.play().catch(() => {});
    }

    attachSubtitles();
}

function tryNext() {
    if (idx < SOURCES.length) load(SOURCES[idx++]);
}

video.addEventListener("playing", onPlaying);
video.addEventListener("error", () => { clearStallTimer(); tryNext(); });
video.addEventListener("stalled", () => { if (!started) armStallTimer(); });
video.addEventListener("waiting", () => { if (!started) armStallTimer(); });

tryNext();
</script>
</body>
</html>`;

    return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=UTF-8", ...CORS },
    });
}