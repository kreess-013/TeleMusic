const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    try {
        const result = await ytSearch(query);
        const videos = result.videos.slice(0, 15).map(v => ({
            id: v.videoId,
            title: v.title,
            artist: v.author.name,
            cover: v.thumbnail,
            duration: v.duration.seconds,
        }));
        res.json({ tracks: videos });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/info', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const command = `yt-dlp --extractor-args "youtube:player_client=default" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -f bestaudio --get-url ${url}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', error);
            console.error('stderr:', stderr);
            return res.status(500).json({ error: 'Failed to get audio' });
        }
        const audioUrl = stdout.trim();
        if (!audioUrl) return res.status(404).json({ error: 'No audio URL' });

        // Получаем метаданные
        const infoCommand = `yt-dlp --extractor-args "youtube:player_client=default" -j ${url}`;
        exec(infoCommand, (err, stdoutInfo) => {
            if (err) {
                return res.json({ audioUrl });
            }
            try {
                const info = JSON.parse(stdoutInfo);
                res.json({
                    id: info.id,
                    title: info.title,
                    artist: info.uploader,
                    thumbnail: info.thumbnail,
                    audioUrl: audioUrl,
                    duration: info.duration,
                });
            } catch (parseErr) {
                res.json({ audioUrl });
            }
        });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
