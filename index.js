const express = require('express');
const cors = require('cors');
const ytdl = require('@zorner/ytdl-core');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Поиск треков
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
            artist: v.author.name,
            cover: v.thumbnail,
            duration: v.duration.seconds,
        }));
        res.json({ tracks: videos });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Получение аудио-ссылки
app.get('/info', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    try {
        // Используем @distube/ytdl-core, он обновляется быстрее
        const info = await ytdl.getInfo(url, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            },
        });
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        if (audioFormats.length === 0) {
            return res.status(404).json({ error: 'No audio formats found' });
        }
        // Сортируем по битрейту
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestAudio = audioFormats[0];
        if (!bestAudio.url) {
            return res.status(404).json({ error: 'Audio URL not available' });
        }
        res.json({
            id: info.videoDetails.videoId,
            title: info.videoDetails.title,
            artist: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            audioUrl: bestAudio.url,
            duration: info.videoDetails.lengthSeconds,
        });
    } catch (err) {
        console.error('Info error:', err);
        // Пробуем получить аудио через поток (это может сработать, если сигнатура не расшифрована)
        try {
            // Запрашиваем поток, чтобы получить ссылку
            const stream = ytdl(url, { filter: 'audioonly' });
            // Но нам нужна ссылка, а не поток. Поэтому используем другой подход: получаем информацию с принудительным обновлением
            const info2 = await ytdl.getInfo(url, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                },
                // Включить обновление сигнатуры
                // Для @distube/ytdl-core это по умолчанию
            });
            const audioFormats2 = ytdl.filterFormats(info2.formats, 'audioonly');
            if (audioFormats2.length === 0) {
                return res.status(404).json({ error: 'No audio formats found after retry' });
            }
            audioFormats2.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            const bestAudio2 = audioFormats2[0];
            if (!bestAudio2.url) {
                return res.status(404).json({ error: 'Audio URL not available after retry' });
            }
            res.json({
                id: info2.videoDetails.videoId,
                title: info2.videoDetails.title,
                artist: info2.videoDetails.author.name,
                thumbnail: info2.videoDetails.thumbnails[info2.videoDetails.thumbnails.length - 1].url,
                audioUrl: bestAudio2.url,
                duration: info2.videoDetails.lengthSeconds,
            });
        } catch (err2) {
            console.error('Retry error:', err2);
            res.status(500).json({ error: 'Failed to get audio after retry' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
