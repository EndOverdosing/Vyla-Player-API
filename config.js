// Currently active sources reported on 7:47:50 PM PST 7/6/2026

// None Anime Tested: 936075
// Anime Tested: 37854

// Fshare/Fsonic Tested: 155 ( they don't have Michael )

export const SOURCES = [
    {
        key: '1embed',
        label: '1Embed',
        sourceFile: '1embed',
        proxyParam: '1e',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

    {
        key: '123anime',
        label: '123Anime',
        sourceFile: '123anime',
        proxyParam: 'a1',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        skipProxy: true,
        cdnHeaders: [{
            pattern: /hlsx\d+cdn\.|burntburst\d+\.store|echovideo\.ru/i,
            headers: {
                Referer: 'https://play2.echovideo.ru/',
                Origin: 'https://play2.echovideo.ru',
            },
        },],
    },

    {
        key: 'anihq-sub',
        label: 'AniHQ (Sub)',
        sourceFile: 'anihq',
        proxyParam: 'ahsub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'anihq-dub',
        label: 'AniHQ (Dub)',
        sourceFile: 'anihq',
        proxyParam: 'ahdub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'anineko-sub',
        sourceFile: 'anineko',
        label: 'AniNeko (Sub)',
        proxyParam: 'anksub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anineko-dub',
        sourceFile: 'anineko',
        label: 'AniNeko (Dub)',
        proxyParam: 'ankdub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anipm-sub',
        sourceFile: 'anipm',
        label: 'AniPM (Sub)',
        proxyParam: 'apsub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'anipm-dub',
        sourceFile: 'anipm',
        label: 'AniPM (Dub)',
        proxyParam: 'apdub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'flaxmovies',
        label: 'FlaxMovies',
        sourceFile: 'flaxmovies',
        proxyParam: 'fx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        disabled: true, // Temporarily disabled because their site is down, all streams are returning 403's
        cdnHeaders: [{
            pattern: /flix2watch\.pro/i,
            headers: {
                Referer: 'https://flaxmovies.xyz/',
                Origin: 'https://flaxmovies.xyz',
            },
        },],
    },

    {
        key: 'fsharetv',
        label: 'FShareTV',
        sourceFile: 'fsharetv',
        proxyParam: 'fs',
        timeout: 25000,
        jitter: 600,
        retries: 2,
        multiUrl: false,
        verifyHeaders: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://fsharetv.cc',
        },
    },

    {
        key: 'goated',
        label: 'Goated',
        sourceFile: 'goated',
        proxyParam: 'gt',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'fsonic',
        label: 'Fsonic',
        sourceFile: 'fsonic',
        proxyParam: 'fn',
        timeout: 35000,
        jitter: 600,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'fsonline',
        label: 'FSOnline',
        sourceFile: 'fsonline',
        proxyParam: 'fo',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'hexa',
        label: 'Hexa',
        sourceFile: 'hexa',
        proxyParam: 'hx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },

    {
        key: 'kisskh',
        label: 'KissKH',
        sourceFile: 'kisskh',
        proxyParam: 'kk',
        timeout: 30000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'lookmovie',
        label: 'LookMovie',
        sourceFile: 'lookmovie',
        proxyParam: 'lm',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        verifyHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
    },

    {
        key: 'mapple',
        label: 'Mapple',
        sourceFile: 'mapple',
        proxyParam: 'mp',
        timeout: 15000,
        retries: 1,
        jitter: 0
    },

    {
        key: 'meowtv',
        label: 'MeowTV',
        sourceFile: 'meowtv',
        proxyParam: 'mt',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'nebula',
        label: 'Nebula',
        sourceFile: 'nebula',
        proxyParam: 'nb',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'nekowatch-sub',
        sourceFile: 'nekowatch',
        label: 'NekoWatch (Sub)',
        proxyParam: 'nwsub',
        timeout: 30000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'nekowatch-dub',
        sourceFile: 'nekowatch',
        label: 'NekoWatch (Dub)',
        proxyParam: 'nwdub',
        timeout: 30000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'opstream',
        label: 'OpStream',
        sourceFile: 'opstream',
        proxyParam: 'op',
        timeout: 35000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
        verifyHeaders: {
            Referer: 'https://opstream.fun/',
            Origin: 'https://opstream.fun',
        },
    },

    {
        key: 'peachify',
        label: 'Peachify',
        sourceFile: 'peachify',
        proxyParam: 'pf',
        timeout: 30000,
        jitter: 500,
        retries: 1,
        multiUrl: true
    },

    {
        key: 'pengu',
        label: 'Pengu',
        sourceFile: 'pengu',
        proxyParam: 'pg',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
        skipProxy: true,
        disabled: true, // Temporarily disabled because they now require google auth
    },

    {
        key: 'purstream',
        sourceFile: 'purstream',
        label: 'Purstream',
        proxyParam: 'ps',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },

    {
        key: 'vidapi',
        label: 'VidAPI',
        sourceFile: 'vidapi',
        proxyParam: 'va',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true
    },

    {
        key: 'vidcore',
        sourceFile: 'vidcore',
        label: 'Vidcore',
        proxyParam: 'vc',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        sourcesTimeout: 10000,
    },

    {
        key: 'videasy',
        label: 'Videasy',
        sourceFile: 'videasy',
        proxyParam: 'vy',
        timeout: 40000,
        sourcesTimeout: 10000,
        jitter: 900,
        retries: 3,
        multiUrl: true,
        verifyHeaders: {
            Accept: 'application/json, /; q=0.01',
            Referer: 'https://player.videasy.net/',
            Origin: 'https://player.videasy.net',
        },
    },

    {
        key: 'vidfast',
        label: 'Vidfast',
        sourceFile: 'vidfast',
        proxyParam: 'vf',
        timeout: 35000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'vidlink',
        label: 'Vidlink',
        sourceFile: 'vidlink',
        proxyParam: 'vl',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        multiUrl: true,
        disabled: true, // Temporarily disabled because their site is down, all streams are returning 403's
    },

    {
        key: 'vidnest',
        label: 'VidNest',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
    },

    {
        key: 'vidnest-sub',
        label: 'VidNest (Sub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidnest-dub',
        label: 'VidNest (Dub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidrift',
        label: 'VidRift',
        sourceFile: 'vidrift',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'vidrock',
        label: 'VidRock',
        sourceFile: 'vidrock',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 800,
        retries: 3,
        multiUrl: true,
        cdnHeaders: [{
            pattern: /./,
            headers: {
                Accept: '/',
                'Accept-Language': 'en-US,en;q=0.9',
                Referer: 'https://vidrock.ru/',
                Origin: 'https://vidrock.ru',
            },
        },],
    },

    {
        key: 'vidsync',
        label: 'VidSync',
        sourceFile: 'vidsync',
        proxyParam: 'vs',
        timeout: 20000,
        retries: 2,
        multiUrl: true,
        disabled: true, // Temporarily disabled due to enc dec issues
    },

    {
        key: 'vidup',
        label: 'VidUp',
        sourceFile: 'vidup',
        proxyParam: 'vu',
        timeout: 35000,
        jitter: 500,
        retries: 1,
        multiUrl: true
    },

    {
        key: 'vidzee',
        label: 'VidZee',
        sourceFile: 'vidzee',
        proxyParam: 'vz',
        timeout: 20000,
        sourcesTimeout: 10000,
        jitter: 400,
        retries: 3,
        disabled: true, // Temporarily disabled because their site is down, all streams are returning 403's
        verifyHeaders: {
            Accept: '/',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://player.vidzee.wtf',
            Origin: 'https://player.vidzee.wtf',
        },
    },

    {
        key: 'vixsrc',
        label: 'VixSrc',
        sourceFile: 'vixsrc',
        proxyParam: 'vx',
        timeout: 35000,
        jitter: 0,
        retries: 2,
        multiUrl: false,
        skipProxy: true,
        verifyHeaders: {
            Accept: 'application/json, text/javascript, /; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://vixsrc.to/',
            Origin: 'https://vixsrc.to',
        },
    },

    {
        key: 'xpass',
        sourceFile: 'xpass',
        label: 'XPass',
        proxyParam: 'xp',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
    },

];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export const ALLOWED_ORIGINS = [''];
export const HEALTH_PROBE_ID = '155';
export const CACHE_TTL = 5 * 60 * 1000;