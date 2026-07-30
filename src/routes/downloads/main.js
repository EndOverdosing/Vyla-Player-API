export const handleDownloadMovie = async (id, corsHeaders, sdk) =>
{
    const dl = await sdk.getDownloads(id);
    return {
        status: 200,
        body: JSON.stringify(dl),
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    };
}

export const handleDownloadTv = async (id, season, episode, corsHeaders, sdk) =>
{
    const dl = await sdk.getDownloads(id, season, episode);
    return {
        status: 200,
        body: JSON.stringify(dl),
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    };
}