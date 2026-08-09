const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Эндпоинт для получения информации о треке по URL
app.get('/info', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    try {
        const info = await ytdl.getInfo(url);
        const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            audioUrl: audioFormat.url,
            duration: info.videoDetails.lengthSeconds,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get audio' });
    }
});

// Эндпоинт для поиска
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
    }
    try {
        const result = await ytSearch(query);
        const videos = result.videos.slice(0, 10).map(v => ({
            id: v.videoId,
            title: v.title,
            author: v.author.name,
            thumbnail: v.thumbnail,
            duration: v.duration.seconds,
            url: v.url,
        }));
        res.json({ tracks: videos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Простой эндпоинт для проверки
app.get('/', (req, res) => {
    res.send('YouTube Music Backend is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
