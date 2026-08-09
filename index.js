const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Поиск треков на zaycev.net
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    try {
        // 1. Загружаем страницу поиска
        const searchUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = response.data;

        // 2. Парсим HTML
        const $ = cheerio.load(html);
        const trackItems = $('.musicset-track-list__items .musicset-track');

        const tracks = [];
        trackItems.each((index, element) => {
            const dataUrl = $(element).attr('data-url');
            if (!dataUrl) return;

            const title = $(element).find('.musicset-track__title').text().trim();
            const artist = $(element).find('.musicset-track__artist').text().trim();
            const cover = $(element).find('.musicset-track__cover img').attr('src') || '';

            tracks.push({
                id: dataUrl, // используем dataUrl как уникальный ID
                title: title || 'Без названия',
                artist: artist || 'Неизвестен',
                cover: cover,
                dataUrl: dataUrl,
            });
        });

        // 3. Для каждого трека получаем MP3 (загружаем JSON по dataUrl)
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const jsonResponse = await axios.get(jsonUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const jsonData = jsonResponse.data;
                const mp3Url = jsonData.url;

                tracksWithMp3.push({
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    cover: track.cover,
                    mp3: mp3Url,
                });
            } catch (e) {
                console.warn(`Не удалось получить MP3 для ${track.title}:`, e.message);
            }
        }

        res.json({ tracks: tracksWithMp3 });
    } catch (err) {
        console.error('Ошибка поиска:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
