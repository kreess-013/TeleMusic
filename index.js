const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Раздаём статику (фронтенд)
app.use(express.static(path.join(__dirname, 'public')));

// Поиск треков
app.get('/api/search', async (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
    }
    try {
        const result = await ytSearch(query);
        // Берём только видео (не каналы, плейлисты)
        const videos = result.videos.slice(0, 20).map(v => ({
            id: v.videoId,
            title: v.title,
            artist: v.author.name,
            cover: v.thumbnail,
            duration: v.duration.seconds,
            // ссылка на видео для получения аудио позже
            url: v.url,
        }));
        res.json({ tracks: videos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Получение аудио-ссылки по URL видео
app.get('/api/audio', async (req, res) => {
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

// По умолчанию отдаём index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
