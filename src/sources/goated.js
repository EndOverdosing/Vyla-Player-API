import crypto from "crypto";

export const ID = "goated";
export const DOMAIN = "https://goated.cx";
export const RETURN_ALL_URLS = true;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const enc = new TextEncoder();
const info = enc.encode("goated-api-v1");
const salt = enc.encode("goated-stream-salt");

const generateRandomIP = () => {
    const p = () => Math.floor(Math.random() * 255);
    let first = p();
    while ([0, 10, 127, 169, 172, 192].includes(first)) first = p();
    return `${first}.${p()}.${p()}.${p()}`;
};

let cachedSession = null;
let sessionExpiresAt = 0;
let cachedProviders = null;
let providersExpiresAt = 0;

async function getValidSession(sessionIp) {
    const now = Date.now();
    if (cachedSession && now < sessionExpiresAt) {
        return cachedSession;
    }
    try {
        const chalRes = await fetch(`${DOMAIN}/api/auth/challenge`, {
            headers: {
                "User-Agent": UA,
                "X-Forwarded-For": sessionIp,
                "X-Real-IP": sessionIp,
                Origin: DOMAIN,
                Referer: DOMAIN + "/",
            },
            signal: AbortSignal.timeout(7000),
        });

        if (!chalRes.ok) throw new Error();
        const chalData = await chalRes.json();
        const { challenge, difficulty } = chalData;
        const targetPrefix = "0".repeat(Math.ceil((difficulty || 16) / 4));
        let nonceStr = "";

        for (let i = 0; i < 5000000; i++) {
            const nonce = Math.random().toString(36).substring(2, 10);
            const hash = crypto.createHash("sha256").update(`${challenge}:${nonce}`).digest("hex");
            if (hash.startsWith(targetPrefix)) {
                nonceStr = nonce;
                break;
            }
        }

        if (!nonceStr) throw new Error();

        const res = await fetch(`${DOMAIN}/api/auth/session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": UA,
                "X-Forwarded-For": sessionIp,
                "X-Real-IP": sessionIp,
                Origin: DOMAIN,
                Referer: DOMAIN + "/",
            },
            body: JSON.stringify({ challenge, nonce: nonceStr }),
            signal: AbortSignal.timeout(7000),
        });

        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.token) throw new Error();

        cachedSession = data.token;
        sessionExpiresAt = now + (data.expiresIn || 600) * 1000 - 30000;
        return cachedSession;
    } catch (e) {
        throw new Error();
    }
}

async function getProviders() {
    const now = Date.now();
    if (cachedProviders && now < providersExpiresAt) return cachedProviders;
    try {
        const res = await fetch(`${DOMAIN}/api/providers`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return [];
        const data = await res.json();
        cachedProviders = data.providers || [];
        providersExpiresAt = now + 3600 * 1000;
        return cachedProviders;
    } catch (e) {
        return [];
    }
}

async function deriveKey(tokenString) {
    const rawKey = await crypto.subtle.importKey("raw", enc.encode(tokenString), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt, info },
        rawKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

async function encryptParams(payloadObj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = enc.encode(JSON.stringify(payloadObj));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    const combined = new Uint8Array(iv.length + ct.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ct), iv.length);
    return Buffer.from(combined).toString("base64");
}

async function decryptUrl(b64Url, key) {
    const raw = Buffer.from(b64Url, "base64");
    const iv = raw.slice(0, 12);
    const ct = raw.slice(12);
    try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return Buffer.from(plain).toString("utf8");
    } catch {
        return null;
    }
}

async function decryptDeep(obj, key) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return Promise.all(obj.map(x => decryptDeep(x, key)));

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if ((k === "url" || k === "file") && typeof v === "string" && v.length > 40) {
            try {
                const dec = await decryptUrl(v, key);
                out[k] = dec ? dec : v;
            } catch {
                out[k] = v;
            }
        } else if (k === "links" && Array.isArray(v)) {
            out[k] = await Promise.all(v.map(async x => {
                if (typeof x === "string" && x.length > 40) {
                    try {
                        const dec = await decryptUrl(x, key);
                        return dec ? dec : x;
                    } catch {
                        return x;
                    }
                }
                return x;
            }));
        } else {
            out[k] = await decryptDeep(v, key);
        }
    }
    return out;
}

export async function getStream({ id, s, e, clientIP }) {
    try {
        const sessionIp = generateRandomIP();
        const sessionJwt = await getValidSession(sessionIp);
        const actualKey = await deriveKey(sessionJwt);

        const isTv = s && e && s !== "null" && e !== "null";
        const contentType = isTv ? "tv" : "movies";
        const refererPath = isTv ? `tv/${id}-${s}-${e}/play` : `movie/${id}/play`;

        let providers = await getProviders();
        let activeProviders = providers.filter(p => p.active && (p.endpoints || []).includes(contentType));
        if (activeProviders.length === 0) activeProviders = [{ name: null }];

        const fetchProviderStream = async (provider) => {
            try {
                const payload = isTv
                    ? { type: "tv", id: id.toString(), season: s.toString(), episode: e.toString() }
                    : { type: "movie", id: id.toString() };

                if (provider.name) payload.provider = provider.name;

                const dParam = await encryptParams(payload, actualKey);

                const streamRes = await fetch(`${DOMAIN}/api/stream?d=${encodeURIComponent(dParam)}`, {
                    headers: {
                        Authorization: `Bearer ${sessionJwt}`,
                        "User-Agent": UA,
                        "X-Forwarded-For": sessionIp,
                        "X-Real-IP": sessionIp,
                        Origin: DOMAIN,
                        Referer: `${DOMAIN}/${refererPath}`,
                    },
                    signal: AbortSignal.timeout(10000)
                });

                if (!streamRes.ok) return [];
                let rawData = await streamRes.json();

                if (rawData.enc) {
                    const raw = Buffer.from(rawData.enc, "base64");
                    const decIv = raw.slice(0, 12);
                    const decCt = raw.slice(12);
                    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decIv }, actualKey, decCt);
                    rawData = JSON.parse(Buffer.from(decrypted).toString("utf-8"));
                }

                const streamData = await decryptDeep(rawData, actualKey);

                if (!streamData.ok || !streamData.streams || streamData.streams.length === 0) return [];

                const validStreams = [];
                for (const stream of streamData.streams) {
                    if (!stream.url) continue;
                    if (stream.quality && stream.quality.toUpperCase() !== "AUTO" && streamData.streams.some(st => st.quality && st.quality.toUpperCase() === "AUTO")) continue;

                    let finalUrl = stream.url;
                    if (finalUrl.startsWith("/api/")) finalUrl = `${DOMAIN}${finalUrl}`;

                    validStreams.push({
                        url: finalUrl,
                        headers: {
                            "User-Agent": UA,
                            Referer: DOMAIN + "/",
                            Origin: DOMAIN,
                        },
                        server: stream.source || stream.server || provider.nickname || provider.name || "Goated",
                        quality: stream.quality || "Auto",
                        type: finalUrl.includes(".mp4") ? "mp4" : "hls",
                        skipVerify: true,
                        skipProxy: true,
                    });
                }
                return validStreams;
            } catch (err) {
                return [];
            }
        };

        const promises = activeProviders.map(p => fetchProviderStream(p));
        const results = await Promise.allSettled(promises);

        const allUrls = [];
        for (const res of results) {
            if (res.status === "fulfilled" && res.value.length > 0) {
                allUrls.push(...res.value);
            }
        }

        if (allUrls.length > 0) {
            return { ...allUrls[0], allUrls };
        }
    } catch (err) { }
    return null;
}