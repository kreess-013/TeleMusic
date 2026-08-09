const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Эндпоинт поиска
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск на Deezer: "${query}"`);

    try {
        const apiUrl = `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=30`;
        const response = await axios.get(apiUrl, { timeout: 10000 });
        const data = response.data;

        if (!data.data || data.data.length === 0) {
            return res.status(404).json({ error: 'No tracks found' });
        }

        const tracks = data.data.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist.name,
            cover: t.album.cover_medium,
            mp3: t.preview, // 30‑секундное превью
            duration: t.duration,
        }));

        console.log(`✅ Найдено ${tracks.length} треков`);
        res.json({ tracks });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
