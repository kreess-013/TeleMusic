const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== Поиск через yt-search =====
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
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ===== Получение аудио-ссылки через yt-dlp =====
app.get('/info', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    // Флаги для обхода блокировки YouTube
    const command = `yt-dlp -f bestaudio --extractor-args "youtube:player_client=default" --get-url ${url}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', stderr || error.message);
            return res.status(500).json({ error: 'Failed to get audio' });
        }
        const audioUrl = stdout.trim();
        if (!audioUrl) {
            return res.status(404).json({ error: 'No audio URL found' });
        }

        // Также можно получить метаданные (но мы уже имеем их из поиска)
        res.json({ audioUrl });
    });
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
