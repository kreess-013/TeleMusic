const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
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
        // Ищем аудио-формат с наилучшим качеством
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

// Эндпоинт для поиска (используем yt-search или простой запрос к YouTube)
// Поскольку ytdl-core не умеет искать, добавим библиотеку yt-search
// Но для простоты оставим только прямой ввод URL
// Можно добавить поиск через yt-search, но лучше предложить пользователю вставлять ссылку.

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
