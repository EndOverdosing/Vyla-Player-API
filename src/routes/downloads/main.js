export const handleDownloadMovie = (id, corsHeaders, sdk) =>
    sdk.getDownloads(id);

export const handleDownloadTv = (id, season, episode, corsHeaders, sdk) =>
    sdk.getDownloads(id, season, episode);