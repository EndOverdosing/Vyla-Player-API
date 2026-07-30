import { HEALTH_PROBE_ID } from '@vyla-entertainment/sdk/src/config.js'
import VylaSDK from '@vyla-entertainment/sdk';
/**
 * @param { VylaSDK } sdk 
 */
export async function handleHealth(sdk, cache) {
    const sourceList = sdk.getSources(true);

    const sources = {};
    for (const cfg of sourceList) {
        const key = cfg.key;
        const probeResult = await sdk.probeSource(cfg.key, cache);
        sources[key] = probeResult;
    }

    const allOk = Object.values(sources).every(v => v.ok);

    return {
        status: allOk ? 200 : 207,
        body: JSON.stringify({
            note: 'This is a health check endpoint. This is extremely unreliable, be sure to test sources directly.',
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            tmdb: !!process.env.TMDB_API_KEY,
            cache: cache.size,
            probe_id: HEALTH_PROBE_ID,
            sources,
        }, null, 2),
        headers: { 'Content-Type': 'application/json' },
    };
}