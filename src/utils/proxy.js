import { issueSessionToken } from '../middleware/auth.js';

const PROXY_STREAMS = process.env.PROXY_STREAMS === "true";
const EXTERNAL_PROXY_URL = (process.env.PROXY_URL || "").replace(/\/+$/, "");

function buildProxyUrl(base, params) {
    return `${base}?${params.toString()}`;
}

export function wrapUrl(rawUrl, sourceKey, absoluteBase, sdk) {
    if (!rawUrl) return null;

    const raw = typeof rawUrl === "object" ? rawUrl.url : rawUrl;
    if (!raw) return null;
    const cfg = sdk.getSources().find(c => c.key === sourceKey);

    if (!cfg || cfg.skipProxy || rawUrl?.skipProxy) {
        return raw;
    }

    const isLocalBase =
        absoluteBase.includes("localhost") || absoluteBase.includes("127.0.0.1");
    const safeBaseCheck = isLocalBase
        ? absoluteBase.replace(/^https:\/\//, "http://")
        : absoluteBase.replace(/^http:\/\//, "https://");

    if (raw.startsWith(`${safeBaseCheck}/api?`) || (EXTERNAL_PROXY_URL && raw.startsWith(`${EXTERNAL_PROXY_URL}?`))) {
        return raw;
    }

    const proxyParam = cfg.proxyParam || "proxy";

    if (PROXY_STREAMS) {
        const isLocal = isLocalBase;
        const safeBase = safeBaseCheck;
        const normalized = isLocal ? raw : raw.replace(/^http:\/\//, "https://");

        const params = new URLSearchParams({ url: normalized, [proxyParam]: "1" });
        if (typeof rawUrl === "object" && rawUrl.headers) params.set("proxyHeaders", JSON.stringify(rawUrl.headers));
        params.set("internal_token", issueSessionToken("internal", sourceKey));

        return buildProxyUrl(`${safeBase}/api`, params);
    }

    if (EXTERNAL_PROXY_URL) {
        const normalized = raw.replace(/^http:\/\//, "https://");
        const params = new URLSearchParams({ url: normalized, [proxyParam]: "1" });
        if (typeof rawUrl === "object" && rawUrl.headers) params.set("proxyHeaders", JSON.stringify(rawUrl.headers));
        return buildProxyUrl(EXTERNAL_PROXY_URL, params);
    }

    return raw;
}