export async function handleSubtitleMovie(id, corsHeaders, sdk) {
    try {
        const subtitles = await sdk.getSubtitles(id);
        if (!subtitles.length) return { status: 404, body: JSON.stringify({ error: 'no subtitles found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        return { status: 200, body: JSON.stringify(subtitles, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}

export async function handleSubtitleTv(id, season, episode, corsHeaders, sdk) {
    try {
        const subtitles = await sdk.getSubtitles(id, season, episode);
        if (!subtitles.length) return { status: 404, body: JSON.stringify({ error: 'no subtitles found' }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
        return { status: 200, body: JSON.stringify(subtitles, null, 2), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    } catch (e) {
        return { status: 500, body: JSON.stringify({ error: e.message }), headers: { 'Content-Type': 'application/json', ...corsHeaders } };
    }
}