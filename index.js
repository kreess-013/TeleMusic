const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== Конфигурация =====
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || null;
const USE_INVIDIOUS = !YOUTUBE_API_KEY; // если ключа нет – используем Invidious

// Список публичных инстансов Invidious (с поддержкой go-away)
const INVIDIOUS_INSTANCES = [
    { url: 'https://inv.nadeko.net', goAway: true },
    { url: 'https://invidious.nerdvpn.de', goAway: false },
    { url: 'https://yt.chocolatemoo53.com', goAway: true },
    { url: 'https://invidious.tiekoetter.com', goAway: false },
    { url: 'https://invidious.f5.si', goAway: false },
    { url: 'https://inv.zoomerville.com', goAway: false },
];

// ===== Кэш (на 1 час) =====
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 час

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ===== YouTube Data API (если есть ключ) =====
async function searchYouTubeAPI(query) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=30&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
    const response = await axios.get(url);
    const items = response.data.items || [];
    return items.map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        cover: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        videoId: item.id.videoId,
    }));
}

// ===== Invidious (без ключа) =====
async function searchInvidious(query) {
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            let url = `${instance.url}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,thumbnails,lengthSeconds`;
            if (instance.goAway) url += '&go-away=1';
            const res = await axios.get(url, { timeout: 10000 });
            if (res.data && res.data.length) {
                return res.data.map(item => ({
                    id: item.videoId,
                    title: item.title,
                    artist: item.author,
                    cover: item.thumbnails?.[item.thumbnails.length - 1]?.url || '',
                    videoId: item.videoId,
                }));
            }
        } catch (_) {}
    }
    throw new Error('All Invidious instances failed');
}

// ===== Поиск =====
async function searchTracks(query) {
    const cacheKey = `search_${query}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    let results;
    if (USE_INVIDIOUS) {
        results = await searchInvidious(query);
    } else {
        results = await searchYouTubeAPI(query);
    }

    // Для каждого результата получаем аудио-ссылку
    const tracks = [];
    for (const item of results) {
        try {
            // Пытаемся получить аудио через ytdl (для YouTube)
            const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${item.id}`, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                },
            });
            const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
            if (audioFormat && audioFormat.url) {
                tracks.push({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    cover: item.cover,
                    mp3: audioFormat.url,
                    duration: info.videoDetails.lengthSeconds,
                });
            }
        } catch (e) {
            console.warn(`⚠️ Не удалось получить аудио для ${item.title}: ${e.message}`);
        }
    }

    setCache(cacheKey, tracks);
    return tracks;
}

// ===== Эндпоинты =====

// Поиск
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    try {
        const tracks = await searchTracks(query);
        res.json({ tracks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Топ (используем популярный поиск)
app.get('/top', async (req, res) => {
    try {
        const tracks = await searchTracks('top hits');
        res.json({ tracks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
