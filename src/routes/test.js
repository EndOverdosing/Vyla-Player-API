import { wrapUrl } from '../utils/proxy.js';
import { getUA } from '../utils/helpers.js';

export async function handleTestRoute(sdk, match, searchParams, clientIP, host, handleTestSource, googleAnalytic) {
    const sources = sdk.getSources();
    const source = searchParams.get('source');
    const cfg = sources.find(src => src.key === source) || null;
    if (!source || !cfg) return { status: 400, body: JSON.stringify({ error: 'Invalid or Missing Source' }) };

    const result = await handleTestSource(
        sdk,
        source,
        match[1],
        searchParams.get('season') || searchParams.get('s') || null,
        searchParams.get('episode') || searchParams.get('e') || null,
        clientIP,
        host
    );

    googleAnalytic('source_test', { source, id: match[1], ok: JSON.parse(result.body).ok });
    return { status: result.status, body: result.body };
}

function headersToObject(h) {
    const out = {};
    if (!h) return out;
    for (const [k, v] of h.entries()) out[k] = v;
    return out;
}

function safeStack(err) {
    if (!err) return null;
    return String(err.stack || err.message || err).split('\n').slice(0, 10);
}

export async function handleDebugRoute(sdk, match, searchParams, absoluteBase, _nativeFetch, verifyPlayable) {
    const id = match[1];
    const s = searchParams.get('season') || searchParams.get('s') || null;
    const e = searchParams.get('episode') || searchParams.get('e') || null;
    const sourceKey = searchParams.get('source');
    const maxCandidates = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, 25);
    const previewBytes = Math.min(parseInt(searchParams.get('preview') || '800', 10) || 800, 4000);

    if (!sourceKey) return { status: 400, body: JSON.stringify({ error: 'missing source', usage: '/debug/:id?source=key&season=&episode=&limit=&preview=' }) };

    const sources = sdk.getSources();
    const cfg = sources.find(src => src.key === sourceKey) || null;
    if (!cfg) return { status: 400, body: JSON.stringify({ error: `unknown source: ${sourceKey}` }) };

    const t0 = Date.now();
    let streamResult = null, streamError = null, streamErrorStack = null;
    const fetchTrace = [];

    const tracingFetch = async (url, opts = {}) => {
        const start = Date.now();
        const reqHeaders = headersToObject(new Headers(opts.headers || {}));
        const entry = {
            step: fetchTrace.length,
            url: String(url).slice(0, 500),
            method: opts.method || 'GET',
            request_headers: reqHeaders,
        };
        try {
            const r = await _nativeFetch(url, opts);
            entry.status = r.status;
            entry.ok = r.ok;
            entry.redirected = r.redirected;
            entry.final_url = r.url && r.url !== String(url) ? r.url : undefined;
            entry.response_headers = headersToObject(r.headers);
            entry.ms = Date.now() - start;
            fetchTrace.push(entry);
            return r;
        } catch (err) {
            entry.error = err.message;
            entry.ms = Date.now() - start;
            fetchTrace.push(entry);
            throw err;
        }
    };

    const prev = globalThis.fetch;
    globalThis.fetch = tracingFetch;
    try {
        streamResult = await sdk.getStream(sourceKey, id, s, e);
    } catch (err) {
        streamError = err.message;
        streamErrorStack = safeStack(err);
    } finally {
        globalThis.fetch = prev;
    }

    const candidates =
        streamResult?.allUrls ||
        streamResult?.streams ||
        (streamResult?.url ? [streamResult] : []);

    const checks = await Promise.all(candidates.slice(0, maxCandidates).map(async (raw, i) => {
        const rawUrl = typeof raw === 'object'
            ? (raw.url || raw.file || raw.stream || raw.src)
            : raw;

        const rawHeaders = typeof raw === 'object' && raw.headers
            ? raw.headers
            : {};

        const wrappedUrl = wrapUrl(
            typeof raw === 'object'
                ? raw
                : { url: raw },
            sourceKey,
            absoluteBase,
            sdk
        );

        const isSkippedProxy = !!raw?.skipProxy;
        const fetchUrl = isSkippedProxy ? rawUrl : (wrappedUrl || rawUrl);
        const fetchHeaders = isSkippedProxy || !wrappedUrl ? { 'User-Agent': getUA(), ...rawHeaders } : { 'User-Agent': getUA() };

        let m3u8Preview = null, mp4Preview = null, playable_check = null;
        let previewRequestHeaders = null, previewResponseHeaders = null, previewStatus = null, previewOk = null, previewFinalUrl = null;

        try {
            const previewHeaders = { ...fetchHeaders, Range: `bytes=0-${previewBytes - 1}` };
            previewRequestHeaders = previewHeaders;
            const r = await _nativeFetch(fetchUrl, { signal: AbortSignal.timeout(15_000), headers: previewHeaders });
            previewStatus = r.status;
            previewOk = r.ok || r.status === 206;
            previewFinalUrl = r.url && r.url !== fetchUrl ? r.url : undefined;
            previewResponseHeaders = headersToObject(r.headers);
            const ct = (r.headers.get('content-type') || '').toLowerCase();
            const isMp4 = /\.mp4(\?|$)/i.test(fetchUrl) || ct.includes('video/mp4') || ct.includes('video/mp2t') || ct.includes('octet-stream');
            if (isMp4) {
                const bytes = new Uint8Array(await r.arrayBuffer());
                mp4Preview = Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                playable_check = { ok: previewOk, error: previewOk ? null : `mp4 fetch failed: ${r.status}` };
            } else {
                m3u8Preview = (await r.text()).slice(0, previewBytes);
                playable_check = await verifyPlayable(fetchUrl, fetchHeaders, isSkippedProxy || !wrappedUrl);
            }
        } catch (err) {
            playable_check = { ok: false, error: err.message };
        }

        return {
            index: i,
            raw_candidate: raw,
            raw_url: rawUrl,
            raw_headers: rawHeaders,
            proxy_url: isSkippedProxy ? rawUrl : wrappedUrl,
            skip_proxy: isSkippedProxy,
            fetch_url_used: fetchUrl,
            preview_request: { headers: previewRequestHeaders, method: 'GET' },
            preview_response: {
                status: previewStatus,
                ok: previewOk,
                final_url: previewFinalUrl,
                headers: previewResponseHeaders,
            },
            playable_check,
            m3u8_preview: m3u8Preview,
            mp4_preview_hex: mp4Preview,
        };
    }));

    return {
        status: 200,
        body: JSON.stringify({
            source: sourceKey,
            id,
            season: s,
            episode: e,
            config_used: cfg,
            candidates_total: candidates.length,
            candidates_checked: checks.length,
            checks,
            elapsed_ms: Date.now() - t0,
            stream_error: streamError,
            stream_error_stack: streamErrorStack,
            fetch_trace: fetchTrace,
            fetch_count: fetchTrace.length,
            got_result: streamResult !== null,
            result_keys: streamResult ? Object.keys(streamResult) : null,
            raw_stream_result: streamResult,
        }, null, 2)
    };
}