export async function onRequestGet() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Vyla Playground</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
  :root {
    --primary: 0 0 0;
    --primary-light: 255 255 255;
    --primary-dark: 0 0 0;
    --background-dark: 0 0 0;
    --gray-50: 17 17 17;
    --gray-100: 238 238 238;
    --gray-200: 222 222 222;
    --gray-300: 206 206 206;
    --gray-400: 158 158 158;
    --gray-500: 111 111 111;
    --gray-600: 79 79 79;
    --gray-700: 62 62 62;
    --gray-800: 37 37 37;
    --gray-900: 18 18 18;
    --gray-950: 0 0 0;
    --background: 0 0 0;
  }

  *, *::before, *::after { 
    box-sizing: border-box; 
    margin: 0; 
    padding: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: rgb(var(--background));
    color: rgb(var(--gray-100));
    min-height: 100vh;
    overflow: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    position: relative;
  }

  body::-webkit-scrollbar {
    display: none;
  }

  .header { margin-bottom: 24px; }
  .header h1 {
    font-size: 1.35rem;
    font-weight: 700;
    color: rgb(var(--gray-50));
    letter-spacing: -0.02em;
    margin-bottom: 4px;
  }
  .header p { font-size: 0.82rem; color: rgb(var(--gray-500)); }

  .controls {
    background: rgb(var(--gray-950));
    border: 1px solid rgb(var(--gray-800));
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 20px;
  }

  .form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
  }

  .field { display: flex; flex-direction: column; gap: 5px; }
  label {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgb(var(--gray-500));
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-left: 4px;
  }

  input, select {
    background: rgb(var(--gray-900));
    border: 1px solid rgb(var(--gray-800));
    border-radius: 13px;
    color: rgb(var(--gray-100));
    font-size: 0.875rem;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.15s;
    -moz-appearance: textfield;
  }
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button { -webkit-appearance: none; }
  input:focus, select:focus { border-color: rgb(var(--gray-600)); }
  input#tmdb { width: 140px; }
  input.small { width: 72px; }
  select {
    width: 110px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236f6f6f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }

  .fetch-btn {
    background: rgb(var(--gray-50));
    color: rgb(var(--primary-light));
    border: none;
    border-radius: 13px;
    font-weight: 700;
    height: 36px;
    width: 36px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }
  
  .fetch-btn:hover { 
    background: var(--gray-950); 
  }
  
  .fetch-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .statusbar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: rgb(var(--gray-500));
    margin-bottom: 18px;
    min-height: 20px;
  }
  .statusbar.loading { color: rgb(var(--gray-400)); }
  .statusbar.error { color: #f87171; }
  .statusbar.ok { color: #4ade80; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

  .spinner {
    width: 14px; height: 14px;
    border: 2px solid rgb(var(--gray-700));
    border-top-color: rgb(var(--gray-300));
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 10px;
    -webkit-mask-image: linear-gradient(to top, transparent, black 10%, black 90%, transparent);
    mask-image: linear-gradient(to top, transparent, black 10%, black 90%, transparent);
  }

  .empty {
    grid-column: 1/-1;
    text-align: center;
    padding: 60px 20px;
    color: rgb(var(--gray-700));
    font-size: 0.875rem;
    border-radius: 10px;
  }
  .empty svg { display: block; margin: 0 auto 12px; opacity: 0.3; }

  @keyframes shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position:  600px 0; }
  }

  .skeleton-card {
    background: rgb(var(--gray-950));
    border: 1px solid rgb(var(--gray-800));
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sk {
    border-radius: 5px;
    background: linear-gradient(
      90deg,
      rgb(var(--gray-800)) 25%,
      rgb(var(--gray-700)) 50%,
      rgb(var(--gray-800)) 75%
    );
    background-size: 600px 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .sk-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .sk-left { display: flex; flex-direction: column; gap: 6px; }
  .sk-title { width: 64px; height: 18px; }
  .sk-sub   { width: 90px; height: 11px; opacity: 0.6; }
  .sk-badge { width: 44px; height: 20px; border-radius: 99px; }
  .sk-url   { height: 48px; }
  .sk-actions { display: flex; gap: 6px; }
  .sk-btn   { height: 28px; border-radius: 6px; }
  .sk-btn.wide { width: 88px; }
  .sk-btn.med  { width: 64px; }
  .sk-btn.sm   { width: 72px; }

  .card {
    background: rgb(var(--gray-950));
    border: 1px solid rgb(var(--gray-800));
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s;
    animation: fadeUp 0.3s ease both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card:hover { border-color: rgb(var(--gray-700)); }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .card-meta { display: flex; flex-direction: column; gap: 3px; }
  .quality {
    font-size: 1.05rem;
    font-weight: 800;
    color: rgb(var(--gray-100));
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .provider { font-size: 0.72rem; color: rgb(var(--gray-500)); font-weight: 500; }

  .badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
  .badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid;
  }
  .badge.hls  { color: #4ade80; border-color: #4ade8033; background: #4ade8011; }
  .badge.mp4  { color: #60a5fa; border-color: #60a5fa33; background: #60a5fa11; }
  .badge.mkv  { color: #c084fc; border-color: #c084fc33; background: #c084fc11; }
  .badge.plain { color: rgb(var(--gray-400)); border-color: rgb(var(--gray-800)); background: rgb(var(--gray-900)); }

  .url-row {
    background: rgb(var(--gray-900));
    border: 1px solid rgb(var(--gray-800));
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.68rem;
    color: rgb(var(--gray-500));
    word-break: break-all;
    line-height: 1.5;
    font-family: "SF Mono", "Fira Code", monospace;
    max-height: 64px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 6px 13px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid rgb(var(--gray-800));
    background: rgb(var(--gray-900));
    color: rgb(var(--gray-300));
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .btn:hover { border-color: rgb(var(--gray-600)); color: rgb(var(--gray-50)); }
  .btn.primary {
    background: rgb(var(--gray-50));
    color: rgb(var(--gray-950));
    border-color: rgb(var(--gray-50));
    font-weight: 700;
  }
  .btn.primary:hover { background: rgb(var(--gray-200)); border-color: rgb(var(--gray-200)); }
  .btn.success { color: #4ade80; border-color: #4ade8044; background: #4ade8011; }
</style>
</head>
<body>
<div class="bg-grid"></div>

<div class="controls">
  <div class="form-row">
    <div class="field">
      <label>Type</label>
      <select id="type" onchange="onTypeChange()">
        <option value="movie">Movie</option>
        <option value="tv">TV Show</option>
      </select>
    </div>
    <div class="field">
      <label>TMDB ID</label>
      <input id="tmdb" type="number" placeholder="e.g. 550" />
    </div>
    <div class="field" id="season-field" style="display:none">
      <label>Season</label>
      <input id="season" type="number" class="small" value="1" min="1" />
    </div>
    <div class="field" id="episode-field" style="display:none">
      <label>Episode</label>
      <input id="episode" type="number" class="small" value="1" min="1" />
    </div>
    <div class="field">
      <label>&nbsp;</label>
      <button class="fetch-btn" id="fetch-btn" onclick="fetchSources()"><i class="fas fa-chevron-right"></i></button>
    </div>
  </div>
</div>

<div class="statusbar" id="status"></div>
<div class="grid" id="grid">
  <div class="empty">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    Enter a TMDB ID above and click Fetch Sources
  </div>
</div>

<script>
const BASE = location.origin;

function onTypeChange() {
  const isTV = document.getElementById("type").value === "tv";
  document.getElementById("season-field").style.display = isTV ? "" : "none";
  document.getElementById("episode-field").style.display = isTV ? "" : "none";
}

document.getElementById("tmdb").addEventListener("keydown", e => {
  if (e.key === "Enter") fetchSources();
});

function setStatus(msg, type, loading) {
  const el = document.getElementById("status");
  el.className = "statusbar " + (type || "");
  el.innerHTML = loading
    ? '<div class="spinner"></div>' + msg
    : (msg ? '<div class="dot"></div>' + msg : "");
}

function showSkeletons(count) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    grid.insertAdjacentHTML("beforeend", \`
      <div class="skeleton-card">
        <div class="sk-top">
          <div class="sk-left">
            <div class="sk sk-title"></div>
            <div class="sk sk-sub"></div>
          </div>
          <div class="sk sk-badge"></div>
        </div>
        <div class="sk sk-url"></div>
        <div class="sk-actions">
          <div class="sk sk-btn wide"></div>
          <div class="sk sk-btn med"></div>
          <div class="sk sk-btn sm"></div>
        </div>
      </div>
    \`);
  }
}

async function fetchSources() {
  const type = document.getElementById("type").value;
  const id = document.getElementById("tmdb").value.trim();
  const season = document.getElementById("season").value || "1";
  const episode = document.getElementById("episode").value || "1";

  if (!id) { setStatus("Please enter a TMDB ID", "error"); return; }

  const btn = document.getElementById("fetch-btn");
  btn.disabled = true;
  setStatus("Fetching from all providers in parallel…", "loading", true);
  showSkeletons(8);

  let url = BASE + (type === "tv" ? "/api/stream/tv" : "/api/stream/movie") + "?id=" + id;
  if (type === "tv") url += "&season=" + season + "&episode=" + episode;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (!data.success || !data.sources?.length) {
      setStatus("No sources found for ID " + id, "error");
      document.getElementById("grid").innerHTML = '<div class="empty">No sources found for this ID — try a different one</div>';
      return;
    }

    const label = type === "tv"
      ? data.results_found + " sources — S" + season + "E" + episode
      : data.results_found + " sources found";
    setStatus(label, "ok");
    renderGrid(data.sources);
  } catch(e) {
    setStatus("Request failed: " + e.message, "error");
    document.getElementById("grid").innerHTML = '<div class="empty">Something went wrong — check the console</div>';
  } finally {
    btn.disabled = false;
  }
}

function renderGrid(sources) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  sources.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.animationDelay = (i * 30) + "ms";
    card.dataset.ffmpeg = s.ffmpeg_command || "";

    const typeClass = s.type === "hls" ? "hls" : s.type === "mkv" ? "mkv" : "mp4";
    const isHLS = s.is_hls;

    let actions = "";

    if (!isHLS && s.download_url) {
      const href = s.download_url.startsWith("http") ? s.download_url : BASE + s.download_url;
      actions += \`<a class="btn primary" href="\${href}" target="_blank" rel="noopener">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </a>\`;
    }

    if (s.vlc_url) {
      const href = s.vlc_url.startsWith("http") ? s.vlc_url : BASE + s.vlc_url;
      actions += \`<a class="btn" href="\${href}" target="_blank" rel="noopener">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Open
      </a>\`;
    }

    if (s.ffmpeg_command) {
      actions += \`<button class="btn" onclick="copyFfmpeg(this, \${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        ffmpeg
      </button>\`;
    }

    card.innerHTML = \`
      <div class="card-top">
        <div class="card-meta">
          <div class="quality">\${s.quality || "unknown"}</div>
          <div class="provider">\${s.provider}</div>
        </div>
        <div class="badges">
          <span class="badge \${typeClass}">\${s.type}</span>
          \${isHLS ? '<span class="badge plain">HLS</span>' : ''}
        </div>
      </div>
      <div class="url-row">\${s.url}</div>
      <div class="actions">\${actions}</div>
    \`;

    grid.appendChild(card);
  });
}

function copyFfmpeg(btn, i) {
  const cards = document.querySelectorAll(".card");
  const cmd = cards[i].dataset.ffmpeg;
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = \`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!\`;
    btn.classList.add("success");
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("success"); }, 2000);
  });
}

window.addEventListener('message', (e) => {
  if (e.data?.type !== 'theme') return;
  const root = document.documentElement;
  if (e.data.dark) {
    root.style.setProperty('--background', '0 0 0');
    root.style.setProperty('--gray-950', '0 0 0');
    root.style.setProperty('--gray-900', '18 18 18');
    root.style.setProperty('--gray-800', '37 37 37');
    root.style.setProperty('--gray-700', '62 62 62');
    root.style.setProperty('--gray-600', '79 79 79');
    root.style.setProperty('--gray-500', '111 111 111');
    root.style.setProperty('--gray-100', '238 238 238');
    root.style.setProperty('--gray-50', '17 17 17');
  } else {
    root.style.setProperty('--background', '255 255 255');
    root.style.setProperty('--primary-light', '0 0 0');
    root.style.setProperty('--gray-950', '255 255 255');
    root.style.setProperty('--gray-900', '245 245 245');
    root.style.setProperty('--gray-800', '220 220 220');
    root.style.setProperty('--gray-700', '200 200 200');
    root.style.setProperty('--gray-600', '160 160 160');
    root.style.setProperty('--gray-500', '120 120 120');
    root.style.setProperty('--gray-100', '20 20 20');
    root.style.setProperty('--gray-50', '250 250 250');
  }
});
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL",
    },
  });
}