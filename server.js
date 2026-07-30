import cluster from 'cluster'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import { Readable } from 'stream';
import { CACHE_TTL } from './config.js';
import { handleSubtitleMovie, handleSubtitleTv } from './src/routes/subtitles.js';
import { handleDownloadMovie, handleDownloadTv } from './src/routes/downloads/main.js';
import { handleHealth } from './src/routes/health.js';
import { authenticateRequest, checkRateLimit, canAccess, issueSessionToken, refreshSessionToken, initAuth } from './src/middleware/auth.js';
import { wrapUrl } from './src/utils/proxy.js';
import { handleTestRoute, handleDebugRoute } from './src/routes/test.js';
import { getUA, validateTmdbId } from './src/utils/helpers.js';
import VylaSDK from '@vyla-entertainment/sdk';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_HF = !!process.env.SPACE_ID;
const ENABLE_DEBUG_ROUTE = process.env.ENABLE_DEBUG_ROUTE === 'true';
const PORT = process.env.PORT || 7860;
const HF_FETCH_TIMEOUT = 12000;
const EARLY_CLOSE_MS = IS_HF ? 20000 : 14000;
const MAX_GLOBAL_TEST_CONCURRENCY = IS_HF ? 30 : 300;
const MAX_OUTBOUND_FETCH_CONCURRENCY = IS_HF ? 60 : 400;
const MAX_SHARED_INFLIGHT = 2000;
const MAX_IPC_PENDING = 2000;

const FALLBACK_BASE = '';

const LOGO_TEXT = (() => {
    try { return fs.readFileSync(path.join(__dirname, 'public/assets/title.txt'), 'utf8'); } catch { return ''; }
})();

const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;

const M3U8_REGEX = /\.m3u8?(\?|$)|mpegurl|m3u8/i;
const TIKTOK_REGEX = /tiktokcdn\.com|ibyteimg\.com/i;
const STRIP_REGEX = /seg\.html|enproxy|letsgocdn\d+\.shop/i;
const STRIP_TEST_FAST = /seg\.html|enproxy|tiktokcdn|ibyteimg/i;
const URI_REPLACE = /URI="([^"]+)"/g;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Origin, Accept, Access-Control-Request-Method, Access-Control-Request-Headers, X-Session-Token',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Max-Age': '86400',
};

const JSON_CORS = { 'Content-Type': 'application/json', ...CORS_HEADERS };

const ROUTE_PATTERNS = {
    subtitleMovie: /^\/(?:api\/)?subtitles?\/movie\/([^/]+)$/,
    subtitleTv: /^\/(?:api\/)?subtitles?\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/,
    debug: /^\/(?:api\/)?debug\/([^/]+)$/,
    test: /^\/(?:api\/)?test\/([^/]+)$/,
    downloadMovie: /^\/(?:api\/)?downloads?\/movie\/([^/]+)$/,
    downloadTv: /^\/(?:api\/)?downloads?\/tv\/([^/]+)\/([^/]+)\/([^/]+)$/,
};

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) console.warn('Warning: TMDB_API_KEY not set, imdb-required sources will be unavailable');

// Internal VylaSDK instance
const sdk = new VylaSDK({
    tmdbApiKey: TMDB_API_KEY
});

if (cluster.isPrimary) {
    const cpus = (await import('os')).default.cpus().length;
    const workerCount = IS_HF ? Math.min(cpus, 2) : (process.env.WORKER_COUNT ? Math.max(1, parseInt(process.env.WORKER_COUNT, 10)) : 1);
    const sharedCache = new Map();
    const SHARED_CACHE_MAX = 1500;

    const pruneCache = () => {
        const now = Date.now();
        for (const [k, v] of sharedCache) {
            if (now - v.ts > v.ttl) sharedCache.delete(k);
        }
        if (sharedCache.size > SHARED_CACHE_MAX) {
            const overflow = sharedCache.size - SHARED_CACHE_MAX;
            const it = sharedCache.keys();
            for (let i = 0; i < overflow; i++) {
                const k = it.next().value;
                if (k === undefined) break;
                sharedCache.delete(k);
            }
        }
    };

    const pruneTimer = setInterval(pruneCache, 30000);
    pruneTimer.unref();

    for (let i = 0; i < workerCount; i++) {
        const w = cluster.fork({ WORKER_ID: String(i) });
        w.on('online', () => w.send({ type: 'worker:id', id: i }));
    }

    cluster.on('message', (worker, msg) => {
        if (!msg?.type) return;

        if (msg.type === 'cache:get') {
            const entry = sharedCache.get(msg.key);
            const now = Date.now();
            if (entry && now - entry.ts <= entry.ttl) {
                worker.send({ type: 'cache:hit', id: msg.id, value: entry.value });
            } else {
                sharedCache.delete(msg.key);
                worker.send({ type: 'cache:miss', id: msg.id });
            }
            return;
        }

        if (msg.type === 'cache:set') {
            sharedCache.set(msg.key, { value: msg.value, ts: Date.now(), ttl: msg.ttl || CACHE_TTL });
            if (sharedCache.size > SHARED_CACHE_MAX) pruneCache();
            for (const id in cluster.workers) {
                if (cluster.workers[id] !== worker) {
                    try { cluster.workers[id]?.send({ type: 'cache:push', key: msg.key, value: msg.value, ttl: msg.ttl || CACHE_TTL }); } catch { }
                }
            }
        }
    });

    const watchPaths = [
        fileURLToPath(import.meta.url),
        './config.js',
        './src/routes/subtitles.js',
        './src/routes/downloads/main.js',
        './src/routes/health.js',
    ];

    const intentionallyKilled = new Set();
    let restarting = false;
    const scheduleRestart = () => {
        if (restarting) return;
        restarting = true;
        setTimeout(() => {
            for (const id in cluster.workers) {
                const w = cluster.workers[id];
                if (!w) continue;
                intentionallyKilled.add(w.process.pid);
                w.kill();
            }
            restarting = false;
        }, 500);
    };

    // fs.watch('./src/sources', { persistent: false }, scheduleRestart);
    watchPaths.forEach(f => { try { fs.watch(f, scheduleRestart); } catch { } });

    let pendingForks = 0;
    let nextWorkerId = workerCount;
    cluster.on('exit', (worker, code, signal) => {
        const isIntentional = code === 0 || intentionallyKilled.delete(worker.process.pid);
        const delay = isIntentional ? 0 : Math.min(++pendingForks * 1000, 5000);
        setTimeout(() => {
            pendingForks = Math.max(0, pendingForks - 1);
            const id = nextWorkerId++;
            const w = cluster.fork({ WORKER_ID: String(id) });
            w.on('online', () => w.send({ type: 'worker:id', id }));
        }, delay);
    });

    await new Promise(() => { });
}

const _nativeFetch = globalThis.fetch;

async function sendGAEvent(eventName, params = {}, clientId = null) {
    if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;
    const cid = clientId || `server.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const payload = {
        client_id: cid,
        timestamp_micros: String(Date.now() * 1000),
        non_personalized_ads: false,
        events: [{
            name: eventName,
            params: {
                engagement_time_msec: 100,
                session_id: cid,
                ...params,
            },
        }],
    };
    try {
        const res = await fetch(
            `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
    } catch (err) {
    }
}

async function validateGAConfig() {
    if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
        return;
    }
    const payload = {
        client_id: 'debug.startup',
        events: [{ name: 'server_start', params: { engagement_time_msec: 100, session_id: 'debug.startup' } }],
    };
    try {
        const validateRes = await fetch(
            `https://www.google-analytics.com/debug/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
        const body = await validateRes.json();
        const issues = body?.validationMessages ?? [];
        if (issues.length === 0) {
            await sendGAEvent('server_start', { uptime: 0 }, 'debug.startup');
        }
    } catch (err) {
    }
}

let outboundFetchActive = 0;
const outboundFetchQueue = [];

function acquireFetchSlot() {
    if (outboundFetchActive < MAX_OUTBOUND_FETCH_CONCURRENCY) { outboundFetchActive++; return Promise.resolve(); }
    return new Promise(resolve => outboundFetchQueue.push(resolve));
}

function releaseFetchSlot() {
    const next = outboundFetchQueue.shift();
    if (next) next();
    else outboundFetchActive = Math.max(0, outboundFetchActive - 1);
}

globalThis.fetch = async (url, opts) => {
    const signal = opts?.signal ?? AbortSignal.timeout(HF_FETCH_TIMEOUT);
    await acquireFetchSlot();
    try {
        return await _nativeFetch(url, opts?.signal ? opts : { ...opts, signal });
    } finally {
        releaseFetchSlot();
    }
};

class LRUCache {
    #max; #ttl; #map;

    constructor(max, ttl) {
        this.#max = max;
        this.#ttl = ttl;
        this.#map = new Map();
    }

    get(key) {
        const entry = this.#map.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.ts > this.#ttl) { this.#map.delete(key); return undefined; }
        this.#map.delete(key);
        this.#map.set(key, entry);
        return entry.val;
    }

    set(key, val) {
        if (this.#map.has(key)) this.#map.delete(key);
        else if (this.#map.size >= this.#max) this.#map.delete(this.#map.keys().next().value);
        this.#map.set(key, { val, ts: Date.now() });
    }

    has(key) {
        const entry = this.#map.get(key);
        if (!entry) return false;
        if (Date.now() - entry.ts > this.#ttl) { this.#map.delete(key); return false; }
        return true;
    }

    get size() { return this.#map.size; }
}

const mainCache = new LRUCache(600, CACHE_TTL);
const hlsVerifyCache = new LRUCache(400, 180_000);
const testResultCache = new LRUCache(400, 90_000);

const sharedInflight = new Map();

let ipcIdCounter = 0;
const ipcPending = new Map();

const ipcSend = (msg) => new Promise(resolve => {
    if (ipcPending.size >= MAX_IPC_PENDING) { resolve(null); return; }
    const id = ++ipcIdCounter;
    ipcPending.set(id, resolve);
    try {
        process.send({ ...msg, id });
    } catch {
        ipcPending.delete(id);
        resolve(null);
        return;
    }
    setTimeout(() => {
        if (ipcPending.has(id)) { ipcPending.delete(id); resolve(null); }
    }, 150);
});

process.on('message', (msg) => {
    if (!msg) return;
    if (msg.type === 'worker:id') return;

    if (msg.type === 'cache:hit' || msg.type === 'cache:miss') {
        const resolve = ipcPending.get(msg.id);
        if (resolve) { ipcPending.delete(msg.id); resolve(msg); }
        return;
    }

    if (msg.type === 'cache:push' && msg.key && msg.value !== undefined) {
        mainCache.set(msg.key, msg.value);
        testResultCache.set(msg.key, msg.value);
    }
});

async function sharedCacheGet(key) {
    const local = mainCache.get(key);
    if (local !== undefined) return local;
    if (!process.send) return undefined;
    const reply = await ipcSend({ type: 'cache:get', key });
    if (reply?.type === 'cache:hit') { mainCache.set(key, reply.value); return reply.value; }
    return undefined;
}

function sharedCacheSet(key, value, ttl) {
    mainCache.set(key, value);
    testResultCache.set(key, value);
    if (process.send) {
        try { process.send({ type: 'cache:set', key, value, ttl: ttl || CACHE_TTL }); } catch { }
    }
}

function getSharedCached(key, fn, ttl) {
    const local = mainCache.get(key);
    if (local !== undefined) return Promise.resolve(local);

    const inflight = sharedInflight.get(key);
    if (inflight) return inflight;

    if (sharedInflight.size >= MAX_SHARED_INFLIGHT) {
        return (async () => {
            const shared = await sharedCacheGet(key);
            if (shared !== undefined) return shared;
            return fn();
        })();
    }

    const p = withTimeout((async () => {
        const shared = await sharedCacheGet(key);
        if (shared !== undefined) return shared;
        const val = await fn();
        if (val != null) sharedCacheSet(key, val, ttl);
        return val;
    })(), 60_000).finally(() => sharedInflight.delete(key));

    sharedInflight.set(key, p);
    return p;
}

const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const jitter = ms => ms > 0 ? new Promise(r => setTimeout(r, Math.random() * ms)) : Promise.resolve();
const withTimeout = (promise, ms) => Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))]);

async function withRetry(fn, attempts = 2, delay = 300) {
    for (let i = 0; i < attempts; i++) {
        try {
            const result = await fn();
            if (result != null) return result;
        } catch (err) {
            if (i === attempts - 1) throw err;
            await new Promise(r => setTimeout(r, delay + Math.random() * delay * 0.5));
        }
    }
    return null;
}

const ACTIVE_SOURCES = sdk.getSources(true);
const PROXY_PARAM_MAP = new Map(ACTIVE_SOURCES.map(cfg => [cfg.proxyParam, cfg]));

const BLOCKED_IPS = new Set([]);

let globalTestConcurrency = 0;
const testQueue = [];

function runTestQueue() {
    while (testQueue.length > 0 && globalTestConcurrency < MAX_GLOBAL_TEST_CONCURRENCY) {
        testQueue.shift().resolve();
        globalTestConcurrency++;
    }
}

async function acquireTestSlot() {
    if (globalTestConcurrency < MAX_GLOBAL_TEST_CONCURRENCY) { globalTestConcurrency++; return; }
    await new Promise(resolve => testQueue.push({ resolve }));
}

function releaseTestSlot() {
    globalTestConcurrency = Math.max(0, globalTestConcurrency - 1);
    runTestQueue();
}

const getAbsoluteBase = host =>
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')) ? `http://${host}` : `https://${host}`;

function buildM3u8Rewriter(rewriteSegments) {
    return function rewrite(body, url, extraParam, absoluteBase) {
        const safeBase = absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1');
        const qmark = url.indexOf('?');
        const base = qmark === -1 ? url : url.slice(0, qmark);
        const dir = base.slice(0, base.lastIndexOf('/') + 1);
        const schemeEnd = url.indexOf('//') + 2;
        const originBase = url.slice(0, url.indexOf('/', schemeEnd));
        const prefix = `${safeBase}/api?url=`;
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (!t) continue;
            if (t.charCodeAt(0) === 35) {
                let uIdx = t.indexOf('URI="');
                if (uIdx !== -1) {
                    const end = t.indexOf('"', uIdx + 5);
                    if (end !== -1) {
                        const uri = t.slice(uIdx + 5, end);
                        const abs = uri.startsWith('http') ? uri : uri.startsWith('/') ? originBase + uri : dir + uri;
                        lines[i] = t.slice(0, uIdx + 5) + prefix + encodeURIComponent(abs) + extraParam + '"' + t.slice(end + 1);
                    }
                }
            } else {
                const abs = t.startsWith('http') ? t : t.startsWith('/') ? originBase + t : dir + t;
                lines[i] = rewriteSegments ? `${prefix}${encodeURIComponent(abs)}${extraParam}${STRIP_TEST_FAST.test(abs) ? '&tt=1' : ''}` : abs;
            }
        }
        return lines.join('\n');
    };
}

const rewriteM3u8 = buildM3u8Rewriter(true);
const rewriteM3u8KeyOnly = buildM3u8Rewriter(false);

async function fetchUpstream(url, extraHeaders = {}, timeoutMs = 30_000) {
    let current = url.startsWith('http://') ? 'https://' + url.slice(7) : url;
    const headers = { 'User-Agent': getUA(), ...extraHeaders };
    const opts = { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) };

    for (let i = 0; i <= 5; i++) {
        const res = await _nativeFetch(current, opts);

        if (res.status < 300 || res.status >= 400 || !res.headers.has('location')) {
            return res;
        }
        res.body?.cancel();
        const loc = res.headers.get('location');
        current = loc.startsWith('http')
            ? (loc.startsWith('http://') ? 'https://' + loc.slice(7) : loc)
            : new URL(loc, current).href;
    }

    throw new Error('redirect loop');
}

async function verifyStream(rawUrl, sourceKey, extraHeaders = {}) {
    const cfg = sdk.getSources().find(c => c.key === sourceKey);
    if (cfg?.skipVerify) return true;

    const cacheKey = `vstream-${rawUrl}`;
    const cached = hlsVerifyCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
        const res = await _nativeFetch(rawUrl, {
            method: 'HEAD',
            headers: { 'User-Agent': getUA(), ...(cfg?.verifyHeaders ?? {}), ...extraHeaders },
            redirect: 'follow',
            signal: AbortSignal.timeout(6_000),
        });
        res.body?.cancel();
        const ok = res.status < 400;
        hlsVerifyCache.set(cacheKey, ok);
        return ok;
    } catch {
        hlsVerifyCache.set(cacheKey, false);
        return false;
    }
}

async function verifyPlayable(proxiedUrl, extraHeaders = {}, skipProxyCheck = false) {
    if (IS_HF && proxiedUrl.includes('.hf.space/api?url=')) {
        try {
            const parsed = new URL(proxiedUrl);
            const rawUrl = decodeURIComponent(parsed.searchParams.get('url') || '');
            const ph = parsed.searchParams.get('proxyHeaders');
            if (ph) try { Object.assign(extraHeaders, JSON.parse(decodeURIComponent(ph))); } catch { }
            if (rawUrl) { proxiedUrl = rawUrl; skipProxyCheck = true; }
        } catch { }
    }
    const cached = hlsVerifyCache.get(proxiedUrl);
    if (cached !== undefined) return cached;
    const store = val => { hlsVerifyCache.set(proxiedUrl, val); return val; };
    const fail = error => ({ ok: false, error });
    try {
        const fetchHeaders = extraHeaders['User-Agent'] ? extraHeaders : { 'User-Agent': getUA(), ...extraHeaders };
        const m3u8Res = await _nativeFetch(proxiedUrl, { signal: AbortSignal.timeout(12000), headers: fetchHeaders });
        if (!m3u8Res.ok) {
            const val = fail(`m3u8 failed: ${m3u8Res.status}`);
            if (m3u8Res.status !== 429) store(val);
            return val;
        }
        const text = await m3u8Res.text();
        if (/\.mpd(\?|$)/i.test(proxiedUrl) || text.includes('<MPD') || text.includes('urn:mpeg:dash')) {
            return store({ ok: true, error: null });
        }
        if (!text.trim().startsWith('#EXTM3U')) return fail('invalid m3u8');
        if (/^429$|^429\s/m.test(text) || text.includes('Too Many Requests')) return fail('Proxy Blocked or Invalid Hash');
        if (!text.includes('#EXTINF') && !text.includes('#EXT-X-STREAM-INF')) return fail('empty playlist');
        if (!skipProxyCheck) {
            let nextUrl = null;
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                if (t && t.charCodeAt(0) !== 35) { nextUrl = t; break; }
            }
            if (nextUrl) {
                if (!nextUrl.startsWith('http')) nextUrl = new URL(nextUrl, proxiedUrl).href;
                const variantRes = await _nativeFetch(nextUrl, { method: 'GET', headers: { ...fetchHeaders, 'Range': 'bytes=0-1024' }, signal: AbortSignal.timeout(10000) });
                if (!variantRes.ok && variantRes.status !== 206) return fail(`Variant failed: ${variantRes.status}`);
                const ct = (variantRes.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('mpegurl') || ct.includes('m3u8') || nextUrl.includes('.m3u8')) {
                    let segUrl = null;
                    const vLines = (await variantRes.text()).split('\n');
                    for (let i = 0; i < vLines.length; i++) {
                        const t = vLines[i].trim();
                        if (t && t.charCodeAt(0) !== 35) { segUrl = t; break; }
                    }
                    if (segUrl) {
                        if (!segUrl.startsWith('http')) segUrl = new URL(segUrl, nextUrl).href;
                        const segRes = await _nativeFetch(segUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000), headers: fetchHeaders });
                        segRes.body?.cancel();
                        if (!segRes.ok && segRes.status !== 206) return fail(`Segment failed: ${segRes.status}`);
                    }
                }
            }
        }
        return store({ ok: true, error: null });
    } catch (err) { return fail(err.message); }
}

async function getMetadata(id, s, e) {
    const key = process.env.TMDB_API_KEY;
    if (!key) return { error: 'TMDB API key not configured' };

    const cleanId =
        typeof id === 'object'
            ? id?.id ?? id?.tmdbId
            : id;

    if (!cleanId) return { error: 'Invalid TMDB id' };

    const cacheKey = `meta-${cleanId}-${s ?? ''}-${e ?? ''}`;

    return getSharedCached(cacheKey, async () => {
        const url = s
            ? `https://api.themoviedb.org/3/tv/${cleanId}/season/${s}/episode/${e || 1}?api_key=${key}`
            : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${key}`;

        const res = await _nativeFetch(url, {
            signal: AbortSignal.timeout(5_000),
        });

        if (!res.ok) {
            res.body?.cancel();
            return { error: `TMDB API error: ${res.status}` };
        }

        return res.json();
    }, 1_800_000);
}

function applyCdnHeaders(cleanUrl, extraHeaders, sourceKey) {
    const cfg = sdk.getSources().find(c => c.key === sourceKey);
    if (!cfg?.cdnHeaders) return;
    for (const rule of cfg.cdnHeaders) {
        if (rule.pattern.test(cleanUrl)) { Object.assign(extraHeaders, rule.headers); return; }
    }
}

function fetchSource(cfg, cacheKey, id, s, e, clientIP, absoluteBase) {
    // const mod = SOURCE_MODULES[cfg.key];
    // const audio = /dub$/.test(cfg.key) ? 'dub' : 'sub';
    // const streamArgs = extra => ({ id, s, e, clientIP, absoluteBase: extra || absoluteBase, audio, config: cfg });

    if (cfg.skipCache) {
        return withTimeout(
            jitter(cfg.jitter).then(() => withRetry(() => sdk.getStream(cfg.key, id, s, e, clientIP), cfg.retries, 300)),
            cfg.timeout
        );
    }

    return withTimeout(
        jitter(cfg.jitter).then(() =>
            getSharedCached(`${cfg.key}-${cacheKey}`, () => withRetry(() => sdk.getStream(cfg.key, id, s, e, clientIP), cfg.retries, 300))
        ),
        cfg.timeout
    );
}

function normalizeCandidates(rawResult) {
    let candidates = [];
    if (rawResult?.allUrls?.length) {
        candidates = rawResult.allUrls.map(u => typeof u === 'object' ? u : { url: u });
    } else if (rawResult?.streams?.length) {
        candidates = rawResult.streams.map(u => typeof u === 'object' ? u : { url: u });
    } else if (Array.isArray(rawResult)) {
        candidates = rawResult.map(u => typeof u === 'object' ? u : { url: u });
    } else if (rawResult) {
        candidates = [{ url: typeof rawResult === 'object' ? rawResult.url : rawResult, headers: rawResult?.headers, skipProxy: rawResult?.skipProxy, skipHlsCheck: rawResult?.skipHlsCheck }];
    }
    return candidates;
}

async function handleTestSource(sdk, sourceKey, id, s, e, clientIP, host) {
    const start = Date.now();
    const sources = sdk.getSources();
    const cfg = sources.find(c => c.key === sourceKey);
    const absoluteBase = getAbsoluteBase(host);

    const respond = (ok, url, raw_url, error, debug) => ({
        status: 200,
        body: JSON.stringify({
            source: sourceKey,
            id,
            s: s || null,
            e: e || null,
            ok,
            url: ok ? url : null,
            raw_url,
            elapsed_ms: Date.now() - start,
            error: ok ? null : error,
            ...(debug ? { debug } : {}),
        }, null, 2),
        contentType: 'application/json',
    });

    if (cfg?.disabled) return respond(false, null, null, 'source disabled');

    const cacheKey = `test-${sourceKey}-${id}-${s ?? ''}-${e ?? ''}`;
    const localCached = testResultCache.get(cacheKey);
    if (localCached !== undefined) return respond(localCached.ok, localCached.url, localCached.raw_url, localCached.error);

    const shared = await sharedCacheGet(cacheKey);
    if (shared !== undefined) { testResultCache.set(cacheKey, shared); return respond(shared.ok, shared.url, shared.raw_url, shared.error); }

    const inflightKey = `inflight-${cacheKey}`;
    const existing = sharedInflight.get(inflightKey);
    if (existing) {
        try {
            const result = await existing;
            return respond(result?.ok ?? false, result?.url ?? null, result?.raw_url ?? null, result?.error ?? null);
        } catch {
            return respond(false, null, null, 'deduped request failed');
        }
    }

    if (sharedInflight.size >= MAX_SHARED_INFLIGHT) {
        return respond(false, null, null, 'server busy, try again shortly');
    }

    await acquireTestSlot();

    const testPromise = withTimeout((async () => {
        try {
            let rawResult = null, fetchError = null;
            const audio = /dub$/.test(cfg.key) ? 'dub' : 'sub';

            try {
                rawResult = await fetchSource(cfg, `${id}-${s ?? ''}-${e ?? ''}`, id, s, e, clientIP, absoluteBase);
                if (!rawResult) rawResult = await withTimeout(sdk.getStream(sourceKey, id, s, e), 20_000);
            } catch (err) { fetchError = err.message; }

            const candidates = normalizeCandidates(rawResult);

            for (const candidate of candidates) {
                const wrappedUrl = wrapUrl(candidate, sourceKey, absoluteBase, sdk);
                if (!wrappedUrl) continue;

                if (candidate.type === 'dash' || /\.mpd(\?|$)/i.test(candidate.url)) {
                    try {
                        const headRes = await _nativeFetch(candidate.url, {
                            method: 'HEAD',
                            headers: { 'User-Agent': getUA(), ...(candidate.headers ?? {}) },
                            signal: AbortSignal.timeout(6_000),
                            redirect: 'follow',
                        });
                        headRes.body?.cancel();
                        if (headRes.status < 400) {
                            const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                            testResultCache.set(cacheKey, result);
                            sharedCacheSet(cacheKey, result, cfg.testCacheTtl ?? 90_000);
                            return result;
                        }
                    } catch { }
                    continue;
                }

                if (candidate?.skipProxy) {
                    const check = await verifyPlayable(candidate.url, candidate.headers ?? {}, true);
                    if (check.ok || /timeout|aborted/i.test(check.error ?? '')) {
                        const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                        testResultCache.set(cacheKey, result);
                        sharedCacheSet(cacheKey, result, 90_000);
                        return result;
                    }
                    try {
                        const headRes = await _nativeFetch(candidate.url, {
                            method: 'HEAD',
                            headers: { 'User-Agent': getUA(), ...(candidate.headers ?? {}) },
                            signal: AbortSignal.timeout(6_000),
                            redirect: 'follow',
                        });
                        headRes.body?.cancel();
                        const ct = (headRes.headers.get('content-type') || '').toLowerCase();
                        if (headRes.status < 400 && (!ct || /video|octet-stream|mp4/.test(ct) && !ct.includes('mpegurl'))) {
                            const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                            testResultCache.set(cacheKey, result);
                            sharedCacheSet(cacheKey, result, 90_000);
                            return result;
                        }
                    } catch { }
                    continue;
                }

                if (candidate?.skipHlsCheck) {
                    try {
                        const r = await _nativeFetch(wrappedUrl, {
                            signal: AbortSignal.timeout(8_000),
                            headers: { 'User-Agent': getUA() },
                        });
                        if (!r.ok) {
                            const body = await r.text();
                            return { ok: false, url: null, raw_url: candidate.url, error: `skipHlsCheck proxy failed: ${r.status} - ${body.slice(0, 100)}` };
                        }
                        const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                        testResultCache.set(cacheKey, result);
                        sharedCacheSet(cacheKey, result, 90_000);
                        return result;
                    } catch (err) {
                        return { ok: false, url: null, raw_url: candidate.url, error: `skipHlsCheck exception: ${err.message}` };
                    }
                }

                if (cfg.skipVerify || cfg.multiUrl) {
                    const checkUrl = IS_HF ? candidate.url : wrappedUrl;
                    const checkHeaders = IS_HF ? (candidate.headers ?? {}) : {};

                    const check = await verifyPlayable(checkUrl, checkHeaders, false);

                    if (check.ok) {
                        const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                        if (!rawResult?.skipCache) { testResultCache.set(cacheKey, result); sharedCacheSet(cacheKey, result, cfg.testCacheTtl ?? 90_000); }
                        return result;
                    }

                    if (/timeout|aborted/i.test(check.error ?? '')) {
                        const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                        if (!rawResult?.skipCache) { testResultCache.set(cacheKey, result); sharedCacheSet(cacheKey, result, 15_000); }
                        return result;
                    }

                    try {
                        const headRes = await _nativeFetch(candidate.url, {
                            method: 'HEAD',
                            headers: { 'User-Agent': getUA(), ...(candidate.headers ?? {}) },
                            signal: AbortSignal.timeout(6_000),
                            redirect: 'follow',
                        });
                        headRes.body?.cancel();
                        const ct = (headRes.headers.get('content-type') || '').toLowerCase();
                        if (headRes.status < 400 && /video|octet-stream|mp4/.test(ct) && !ct.includes('mpegurl')) {
                            const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                            testResultCache.set(cacheKey, result);
                            sharedCacheSet(cacheKey, result, cfg.testCacheTtl ?? 90_000);
                            return result;
                        }
                    } catch { }
                    continue;
                }

                if (!(await verifyStream(candidate.url, sourceKey, candidate?.headers ?? {}))) continue;

                const verifyUrl = IS_HF ? candidate.url : wrappedUrl;
                const verifyHeaders = IS_HF ? (candidate.headers ?? {}) : {};
                const check = await verifyPlayable(verifyUrl, verifyHeaders, IS_HF);

                if (!check.ok) {
                    const rawHeaders = candidate?.headers ?? {};
                    const [proxiedBody, rawCheck] = await Promise.all([
                        _nativeFetch(wrappedUrl, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': getUA() } })
                            .then(r => r.text()).then(t => t.slice(0, 200)).catch(e => e.message),
                        verifyPlayable(candidate.url, rawHeaders, true),
                    ]);
                    return {
                        ok: false, url: null, raw_url: candidate.url, error: check.error,
                        debug: { proxy_failed: true, proxy_error: check.error, proxy_body_preview: proxiedBody, raw_reachable: rawCheck.ok, raw_error: rawCheck.error, raw_headers_used: rawHeaders, proxied_url: wrappedUrl },
                    };
                }

                const result = { ok: true, url: wrappedUrl, raw_url: candidate.url };
                testResultCache.set(cacheKey, result);
                sharedCacheSet(cacheKey, result, 90_000);
                return result;
            }

            return { ok: false, url: null, raw_url: candidates[0]?.url || null, error: fetchError };
        } finally {
            releaseTestSlot();
            sharedInflight.delete(inflightKey);
        }
    })(), 45_000);

    sharedInflight.set(inflightKey, testPromise);
    const result = await testPromise;
    return respond(result?.ok ?? false, result?.url ?? null, result?.raw_url ?? null, result?.error ?? null, result?.debug ?? null);
}

async function streamSources(sources, id, s, e, clientIP, absoluteBase, res) {
    const sent = new Set();
    const host = absoluteBase.replace(/https?:\/\//, '');
    const debugResults = [];
    let closed = false;

    const onClose = () => { closed = true; };
    res.on('close', onClose);
    res.on('error', onClose);

    const safeWrite = data => {
        if (closed || res.writableEnded || res.destroyed) return false;
        try { res.write(data); return true; } catch { closed = true; return false; }
    };

    const promises = sources.map(async cfg => {
        if (closed) return;
        try {
            const result = await handleTestSource(sdk, cfg.key, id, s, e, clientIP, host);
            if (closed) return;
            const parsed = JSON.parse(result.body);
            debugResults.push({ source: cfg.key, ok: parsed.ok, error: parsed.error || null, elapsed_ms: parsed.elapsed_ms });
            if (parsed.ok && parsed.url && !sent.has(parsed.url)) {
                sent.add(parsed.url);
                safeWrite(`data: ${JSON.stringify({ type: 'source', source: { source: cfg.key, label: cfg.label ?? cfg.key, url: parsed.url } })}\n\n`);
            }
        } catch (err) {
            debugResults.push({ source: cfg.key, ok: false, error: err.message });
        }
    });

    await Promise.race([
        Promise.all(promises),
        new Promise(r => setTimeout(r, EARLY_CLOSE_MS)),
    ]);

    safeWrite(`data: ${JSON.stringify({ type: 'debug', results: debugResults })}\n\n`);
    return sent.size;
}

const respondJson = (status, data, extraHeaders) => ({
    status,
    body: JSON.stringify(data),
    headers: extraHeaders ? { ...JSON_CORS, ...extraHeaders } : JSON_CORS,
});

async function handleRequest(req, res) {
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const reqUrl = new URL(req.url, baseUrl);
    const { pathname, searchParams } = reqUrl;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;

    if (BLOCKED_IPS.size && BLOCKED_IPS.has(clientIP)) return respondJson(403, { error: 'forbidden' });

    if (req.method === 'OPTIONS') return { status: 204, body: '', headers: CORS_HEADERS };

    const PUBLIC_ROUTES = new Set(['/', '']);
    const isPublicRoute = PUBLIC_ROUTES.has(pathname) && req.method === 'GET';

    const authResult = authenticateRequest(req);

    if (!isPublicRoute) {
        if (!authResult.valid) return respondJson(401, { error: authResult.error });
        if (!canAccess(authResult.type, req, pathname)) return respondJson(403, { error: 'Access denied' });

        const authHeader = req.headers['authorization'];
        const apiKey = authHeader?.replace('Bearer ', '')?.trim() || req.headers['x-api-key']?.trim() || authResult.key;

        if (apiKey && !authResult.bypassed && !authResult.internal) {
            const rateLimitResult = checkRateLimit(apiKey, clientIP);
            if (!rateLimitResult.allowed) {
                return respondJson(429, { error: rateLimitResult.error, resetAt: rateLimitResult.resetAt, limit: rateLimitResult.limit, window: rateLimitResult.window });
            }
        }

    }

    if (pathname === '/api/auth' && req.method === 'POST') {
        if (authResult.bypassed || authResult.type === 'player') {
            return respondJson(401, { error: 'API key required for session token generation' });
        }
        return respondJson(200, { token: issueSessionToken(authResult.type, authResult.key) });
    }

    if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const existingToken = req.headers['x-session-token']?.trim();
        if (!existingToken) return respondJson(400, { error: 'Missing session token' });

        const refreshed = refreshSessionToken(existingToken);
        if (!refreshed) return respondJson(401, { error: 'Session token cannot be refreshed. Re-authenticate via /api/auth.' });

        return respondJson(200, { token: refreshed });
    }

    if (pathname === '/' || pathname === '') {
        return {
            status: 200,
            body: `${LOGO_TEXT}\n\ndeveloped_by: @vyla-entertainment\ngithub: https://github.com/vyla-entertainment\ndocs: https://docs.vyla.cc\ndmca: https://docs.vyla.cc/misc/dmca`,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
        };
    }

    if (pathname === '/test' || pathname === '/api/test') {
        const tests = {};
        ACTIVE_SOURCES.forEach(s => {
            tests[s.key] = {
                movie: `/api/test/155?source=${s.key}`,
                tv: `/api/test/1396?season=1&episode=1&source=${s.key}`
            };
        });
        return respondJson(200, tests);
    }

    if (pathname === '/health' || pathname === '/api/health') {
        const result = await handleHealth(sdk, mainCache);
        return { ...result, headers: { ...result.headers, ...CORS_HEADERS } };
    }

    const absoluteBase = getAbsoluteBase(reqUrl.host);
    const getRequestedSources = () => {
        const raw = searchParams.get('sources')?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
        return raw.length ? ACTIVE_SOURCES.filter(s => raw.includes(s.key)) : ACTIVE_SOURCES;
    };

    const getRequestMeta = () => {
        const raw = {
            ip: clientIP,
            referer: req.headers['referer'] || null,
            origin: req.headers['origin'] || null,
            user_agent: req.headers['user-agent'] || null,
            host: req.headers['host'] || null,
            country: req.headers['cf-ipcountry'] || null,
            path: pathname,
            query: reqUrl.search || null,
        };
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null && v !== undefined));
    };

    const googleAnalytic = (event, extra = {}) => {
        if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;
        const gaClientId = (clientIP && clientIP !== '127.0.0.1' && clientIP !== '::1' && clientIP !== '::ffff:127.0.0.1')
            ? clientIP
            : `local.${Date.now()}.${Math.random().toString(36).slice(2, 9)}`;
        const safeName = event.replace(/-/g, '_');
        const meta = getRequestMeta();
        sendGAEvent(safeName, { ...meta, ...extra }, gaClientId);
    };

    if (pathname === '/movie' || pathname === '/api/movie') {
        const id = searchParams.get('id');
        if (!id) return respondJson(400, { error: 'missing id', route: '/movie?id=:tmdb_id', example: '/movie?id=155' });

        const tmdbValidation = await validateTmdbId(id, 'movie');
        if (!tmdbValidation.valid) {
            return respondJson(400, { error: tmdbValidation.error });
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', ...CORS_HEADERS });
        const [meta, subtitles] = await Promise.all([
            getMetadata(id, null, null),
            sdk.getSubtitles(id, null, null)
        ]);

        if (!res.writableEnded && !res.destroyed) {
            try { res.write(`data: ${JSON.stringify({ type: 'meta', meta, subtitles })}\n\n`); } catch { return null; }
        }

        googleAnalytic('stream_movie', { id });
        const total = await streamSources(getRequestedSources(), id, null, null, clientIP, absoluteBase, res);
        if (!res.writableEnded && !res.destroyed) {
            try { res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`); res.end(); } catch { }
        }
        return null;
    }

    if (pathname === '/tv' || pathname === '/api/tv') {
        const id = searchParams.get('id'), s = searchParams.get('season'), e = searchParams.get('episode');
        if (!id || !s || !e) return respondJson(400, { error: 'missing parameters', route: '/tv?id=:id&season=:s&episode=:e', example: '/tv?id=1396&season=1&episode=1' });

        const tmdbValidation = await validateTmdbId(id, 'tv');
        if (!tmdbValidation.valid) {
            return respondJson(400, { error: tmdbValidation.error });
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', ...CORS_HEADERS });

        const [meta, subtitles] = await Promise.all([
            getMetadata(id, s, e),
            sdk.getSubtitles(id, s, e)
        ]);

        if (!res.writableEnded && !res.destroyed) {
            try { res.write(`data: ${JSON.stringify({ type: 'meta', meta, subtitles })}\n\n`); } catch { return null; }
        }

        googleAnalytic('stream_tv', { id, season: s, episode: e });
        const total = await streamSources(getRequestedSources(), id, s, e, clientIP, absoluteBase, res);
        if (!res.writableEnded && !res.destroyed) {
            try { res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`); res.end(); } catch { }
        }
        return null;
    }

    if (pathname === '/subtitle' || pathname === '/subtitles' || pathname === '/api/subtitle' || pathname === '/api/subtitles') {
        return respondJson(200, { routes: { movie: '/subtitles/movie/:id', tv: '/subtitles/tv/:id/:s/:e' }, examples: { movie: '/subtitles/movie/155', tv: '/subtitles/tv/1396/1/1' } });
    }

    if (pathname === '/download' || pathname === '/downloads' || pathname === '/api/download' || pathname === '/api/downloads') {
        return respondJson(200, { routes: { movie: '/downloads/movie/:id', tv: '/downloads/tv/:id/:s/:e' }, examples: { movie: '/downloads/movie/155', tv: '/downloads/tv/1396/1/1' } });
    }

    let match;

    match = ROUTE_PATTERNS.subtitleMovie.exec(pathname);
    if (match) {
        googleAnalytic('subtitles_movie', { id: match[1] });
        return handleSubtitleMovie(match[1], CORS_HEADERS, sdk);
    }

    match = ROUTE_PATTERNS.subtitleTv.exec(pathname);
    if (match) {
        googleAnalytic('subtitles_tv', { id: match[1], season: match[2], episode: match[3] });
        return handleSubtitleTv(match[1], match[2], match[3], CORS_HEADERS, sdk);
    }

    match = ROUTE_PATTERNS.downloadMovie.exec(pathname);
    if (match) {
        googleAnalytic('downloads_movie', { id: match[1] });
        return handleDownloadMovie(match[1], CORS_HEADERS, sdk);
    }

    match = ROUTE_PATTERNS.downloadTv.exec(pathname);
    if (match) {
        googleAnalytic('downloads_tv', { id: match[1], season: match[2], episode: match[3] });
        return handleDownloadTv(match[1], match[2], match[3], CORS_HEADERS, sdk);
    }

    match = ROUTE_PATTERNS.test.exec(pathname);
    if (match) {
        const result = await handleTestRoute(sdk, match, searchParams, clientIP, reqUrl.host, handleTestSource, googleAnalytic);
        return { status: result.status, body: result.body, headers: JSON_CORS };
    }

    match = ENABLE_DEBUG_ROUTE ? ROUTE_PATTERNS.debug.exec(pathname) : null;
    if (match) {
        const result = await handleDebugRoute(sdk, match, searchParams, absoluteBase, _nativeFetch, verifyPlayable);
        return { status: result.status, body: result.body, headers: JSON_CORS };
    }

    if (pathname === '/api' || pathname === '/api/') {
        const url = searchParams.get('url') || searchParams.get('proxy');

        if (url) {
            if (IS_HF && searchParams.get('lm') === '1') {
                return { status: 302, body: '', headers: { 'Location': FALLBACK_BASE + req.url, ...CORS_HEADERS } };
            }

            try {
                new URL(url);

                const extraHeaders = {};
                const proxyHeaders = searchParams.get('proxyHeaders');
                if (proxyHeaders) try { Object.assign(extraHeaders, JSON.parse(safeDecode(proxyHeaders))); } catch { }
                if (!extraHeaders['User-Agent'] && !extraHeaders['user-agent']) extraHeaders['User-Agent'] = getUA();
                const vlHost = extraHeaders['x-vl-host'];
                delete extraHeaders['Host'];
                delete extraHeaders['x-vl-host'];
                if (vlHost) extraHeaders['Host'] = vlHost;
                let matchedSource = null;
                for (const [param, cfg] of PROXY_PARAM_MAP) {
                    if (searchParams.has(param)) { matchedSource = cfg; break; }
                }

                let cleanUrl = url;
                if (matchedSource) {
                    try {
                        const qIndex = url.indexOf('?');
                        if (qIndex !== -1) {
                            const params = new URLSearchParams(url.slice(qIndex + 1));
                            const headersParam = params.get('headers');
                            if (headersParam) {
                                try { Object.assign(extraHeaders, JSON.parse(decodeURIComponent(headersParam))); } catch { }
                                params.delete('headers');
                            }
                            cleanUrl = `${url.slice(0, qIndex)}${params.toString() ? '?' + params.toString() : ''}`;
                        }
                    } catch { }
                    applyCdnHeaders(cleanUrl, extraHeaders, matchedSource.key);
                }

                const upstream = await fetchUpstream(cleanUrl, extraHeaders, 30_000);
                const ct = (upstream.headers.get('content-type') || '').toLowerCase();
                const looksLikeM3u8 = M3U8_REGEX.test(cleanUrl) || cleanUrl.includes('/playlist/') || cleanUrl.includes('/streamsvr/') || ct.includes('mpegurl') || ct.includes('m3u8');

                if (looksLikeM3u8) {
                    const text = await upstream.text();
                    if (text.trim().startsWith('#EXT') || /megacloud\.animanga\.fun\/(ts-proxy|proxy)/i.test(text.slice(0, 200))) {
                        const isTesub = matchedSource?.proxyParam === 'tesub';
                        const extraParam = matchedSource ? `&${matchedSource.proxyParam}=1&proxyHeaders=${encodeURIComponent(JSON.stringify(extraHeaders))}` : '&vn=1';
                        const rewritten = isTesub
                            ? rewriteM3u8KeyOnly(text, cleanUrl, extraParam, absoluteBase)
                            : rewriteM3u8(text, matchedSource ? cleanUrl : url, extraParam, absoluteBase);
                        return { status: 200, body: rewritten, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...CORS_HEADERS } };
                    }
                    return { status: 502, body: `expected m3u8 but got: ${text.slice(0, 100)}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                }

                if (matchedSource) {
                    const isTikTok = TIKTOK_REGEX.test(cleanUrl);
                    const isMkv = cleanUrl.includes('.mkv') || ct.includes('matroska');
                    const isPngMasked = ct === 'image/png' || ct === 'image/jpeg' || /\.png(\?|$)/i.test(cleanUrl) || /letsgocdn\d+\.shop/i.test(cleanUrl);
                    const needsStrip = searchParams.has('tt') || STRIP_REGEX.test(cleanUrl);

                    const isKey = cleanUrl.endsWith('.key') || ct.includes('octet-stream') && cleanUrl.includes('mon.key');
                    if (isKey) {
                        if (!upstream.ok) return { status: upstream.status, body: `upstream ${upstream.status}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                        const keyBytes = Buffer.from(await upstream.arrayBuffer());
                        return { status: 200, body: keyBytes, headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } };
                    }

                    if (isTikTok || isPngMasked || needsStrip) {
                        if (!upstream.ok) return { status: upstream.status, body: `upstream ${upstream.status}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };
                        const full = Buffer.from(await upstream.arrayBuffer());
                        const stripped = (full[0] === 0x89 || full[0] === 0xFF || full[0] === 0x00) ? full.subarray(120) : full;
                        return { status: 200, body: stripped, headers: { 'Content-Type': 'video/MP2T', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } };
                    }

                    if (!upstream.ok) return { status: upstream.status, body: `upstream ${upstream.status}`, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } };

                    const rangeHeader = req.headers['range'];
                    const streamUpstream = rangeHeader
                        ? await _nativeFetch(cleanUrl, { headers: { 'User-Agent': getUA(), ...extraHeaders, 'Range': rangeHeader }, redirect: 'follow' })
                        : upstream;

                    const responseHeaders = {
                        'Content-Type': isMkv || ct === 'application/octet-stream' ? 'video/mp4' : (ct || 'video/mp4'),
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store',
                    };
                    if (streamUpstream.headers.has('content-length')) responseHeaders['Content-Length'] = streamUpstream.headers.get('content-length');
                    if (streamUpstream.headers.has('content-range')) responseHeaders['Content-Range'] = streamUpstream.headers.get('content-range');

                    return { status: rangeHeader && streamUpstream.status === 206 ? 206 : 200, stream: streamUpstream.body, headers: responseHeaders };
                }

                const full = Buffer.from(await upstream.arrayBuffer());
                const needsStrip = searchParams.has('tt') || TIKTOK_REGEX.test(url) || STRIP_REGEX.test(url);
                const stripped = (needsStrip && (full[0] === 0x89 || full[0] === 0xFF || full[0] === 0x00)) ? full.subarray(120) : full;
                return { status: 200, body: stripped, headers: { 'Content-Type': 'video/MP2T', ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' } };
            } catch (e) {
                return respondJson(502, { error: e.message });
            }
        }

        if (searchParams.has('sources_meta')) {
            return respondJson(200, { sources: ACTIVE_SOURCES.map(c => ({ key: c.key, label: c.label, timeout: c.timeout })) });
        }

        if (searchParams.has('tmdb_movie') || searchParams.has('tmdb_tv') || searchParams.has('tmdb_show') || searchParams.has('tmdb_season')) {
            const k = process.env.TMDB_API_KEY;
            if (!k) return respondJson(500, { error: 'no key' });
            const tmdbId = searchParams.get('id'), tmdbSeason = searchParams.get('s');
            let tmdbUrl;
            if (searchParams.has('tmdb_season')) tmdbUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${tmdbSeason}?api_key=${k}`;
            else if (searchParams.has('tmdb_movie')) tmdbUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${k}${searchParams.has('append_to_response') ? `&append_to_response=${searchParams.get('append_to_response')}` : ''}`;
            else tmdbUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${k}`;
            try { const r = await _nativeFetch(tmdbUrl); return respondJson(200, await r.json()); }
            catch (err) { return respondJson(500, { error: err.message }); }
        }

        return respondJson(400, { error: 'missing parameters' });
    }

    return respondJson(404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
    req.socket.setTimeout(90_000);
    req.socket.setNoDelay(true);

    try {
        const result = await handleRequest(req, res);
        if (result === null || res.headersSent || res.writableEnded || res.destroyed) return;

        const headers = result.headers || {};
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        res.writeHead(result.status, headers);

        if (result.stream) {
            const readable = Readable.fromWeb(result.stream);
            readable.on('error', () => { try { res.destroy(); } catch { } });
            res.on('error', () => { try { readable.destroy(); } catch { } });
            readable.pipe(res);
        } else {
            res.end(result.body ?? '');
        }
    } catch (err) {
        if (!res.headersSent) {
            console.error(err)
            try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"internal server error"}'); } catch { }
        }
    }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.maxHeadersCount = 100;
server.timeout = 90_000;

server.on('error', err => { if (err.code !== 'EADDRINUSE') console.error('server error', err.message); });
await validateGAConfig();
await initAuth();
server.listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));