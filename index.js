const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Список публичных инстансов Invidious (без ключа)
const INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://yt.chocolatemoo53.com',
    'https://invidious.tiekoetter.com',
    'https://invidious.f5.si',
    'https://inv.zoomerville.com'
];

// Функция запроса с перебором инстансов
async function fetchFromInvidious(endpoint) {
    for (const base of INSTANCES) {
        const url = base + endpoint;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Instance ${base} returned ${res.status}`);
                continue;
            }
            const data = await res.json();
            // Проверка на капчу
            if (data.error && data.error.includes('captcha')) {
                console.warn(`Instance ${base} requires captcha`);
                continue;
            }
            return data;
        } catch (e) {
            console.warn(`Instance ${base} failed:`, e.message);
        }
    }
    throw new Error('All Invidious instances are unavailable');
}

// Поиск
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    try {
        const endpoint = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,thumbnails,lengthSeconds`;
        const data = await fetchFromInvidious(endpoint);
        const items = data.items || [];
        const tracks = items.map(v => ({
            id: v.videoId,
            title: v.title,
            artist: v.author,
            cover: v.thumbnails?.pop()?.url || '',
            duration: v.lengthSeconds,
        }));
        res.json({ tracks });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Search failed: ' + e.message });
    }
});

// Получение аудио
app.get('/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    // Извлекаем ID
    const videoId = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });
    try {
        const endpoint = `/api/v1/videos/${videoId}?fields=title,author,thumbnailUrl,adaptiveFormats,formatStreams`;
        const data = await fetchFromInvidious(endpoint);
        // Ищем аудио
        let audioUrl = null;
        const formats = data.adaptiveFormats || [];
        const audioFormats = formats.filter(f => f.type && f.type.startsWith('audio/'));
        if (audioFormats.length > 0) {
            audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            audioUrl = audioFormats[0].url;
        }
        if (!audioUrl) {
            // Попробуем formatStreams
            const streams = data.formatStreams || [];
            const audioStreams = streams.filter(s => s.type && s.type.startsWith('audio/'));
            if (audioStreams.length > 0) {
                audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                audioUrl = audioStreams[0].url;
            }
        }
        if (!audioUrl) {
            return res.status(404).json({ error: 'No audio found' });
        }
        res.json({
            id: videoId,
            title: data.title,
            artist: data.author,
            thumbnail: data.thumbnailUrl,
            audioUrl: audioUrl,
            duration: data.lengthSeconds || 0,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Info failed: ' + e.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
