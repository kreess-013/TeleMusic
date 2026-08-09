const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Эндпоинт поиска
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск: "${query}"`);

    try {
        // 1. Загружаем страницу поиска
        const searchUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
        });

        const html = response.data;
        console.log(`✅ Страница загружена, длина: ${html.length}`);

        // 2. Парсим HTML с помощью cheerio
        const $ = cheerio.load(html);

        // Ищем все элементы с data-url (в том числе вложенные)
        const trackItems = $('[data-url]');
        console.log(`📀 Найдено элементов с data-url: ${trackItems.length}`);

        if (trackItems.length === 0) {
            // Если data-url нет, возможно, страница с капчей или пустой результат
            return res.status(404).json({ error: 'No tracks found' });
        }

        const tracks = [];
        trackItems.each((index, element) => {
            const dataUrl = $(element).attr('data-url');
            if (!dataUrl) return;

            // Пытаемся извлечь название и исполнителя
            let title = $(element).find('.musicset-track__title').text().trim();
            let artist = $(element).find('.musicset-track__artist').text().trim();
            let cover = $(element).find('.musicset-track__cover img').attr('src') || '';

            // Если не нашли по классам, пробуем взять из текста
            if (!title) {
                const text = $(element).text().trim();
                const parts = text.split(' - ');
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                } else {
                    title = text;
                }
            }

            tracks.push({
                dataUrl,
                title: title || 'Без названия',
                artist: artist || 'Неизвестен',
                cover: cover,
            });
        });

        console.log(`📀 Собрано ${tracks.length} треков без MP3`);

        // 3. Для каждого трека загружаем JSON и получаем MP3
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const jsonResponse = await axios.get(jsonUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000,
                });
                const mp3Url = jsonResponse.data.url;
                if (mp3Url) {
                    tracksWithMp3.push({
                        id: track.dataUrl,
                        title: track.title,
                        artist: track.artist,
                        cover: track.cover,
                        mp3: mp3Url,
                    });
                } else {
                    console.warn(`⚠️ Нет mp3 для ${track.title}`);
                }
            } catch (e) {
                console.warn(`⚠️ Ошибка mp3 для ${track.title}: ${e.message}`);
            }
        }

        console.log(`✅ Готово: ${tracksWithMp3.length} треков с MP3`);
        res.json({ tracks: tracksWithMp3 });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
