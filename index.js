const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== НАСТРОЙКИ ДЛЯ MUZAL.NET =====
const BASE_URL = 'https://muzal.net';
const SEARCH_URL = '/search'; // или '/search.html', уточните
const SEARCH_PARAM = 'q'; // или 'query', 'search_query'

// Селекторы (замените на реальные после осмотра сайта)
const SELECTORS = {
    trackContainer: '.track-item', // контейнер трека в результатах поиска
    title: '.track-title',         // селектор названия
    artist: '.track-artist',       // селектор исполнителя
    link: 'a',                     // ссылка на страницу трека (relative href)
    cover: '.track-cover img',     // обложка (опционально)
    // Для страницы трека:
    audioSrc: 'audio source',      // селектор для <source> внутри <audio>
    downloadLink: '.download-btn', // или прямая ссылка на MP3
};

// ===== ПОИСК =====
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск на muzal.net: "${query}"`);

    try {
        // 1. Загружаем страницу поиска
        const searchUrl = `${BASE_URL}${SEARCH_URL}?${SEARCH_PARAM}=${encodeURIComponent(query)}`;
        console.log(`📡 Запрос к: ${searchUrl}`);

        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
        });

        const html = response.data;
        console.log(`✅ Страница загружена, длина: ${html.length}`);

        // 2. Парсим HTML
        const $ = cheerio.load(html);

        // Ищем контейнеры треков
        const trackElements = $(SELECTORS.trackContainer);
        console.log(`📀 Найдено элементов: ${trackElements.length}`);

        if (trackElements.length === 0) {
            return res.status(404).json({ error: 'No tracks found' });
        }

        const tracks = [];
        trackElements.each((index, element) => {
            const title = $(element).find(SELECTORS.title).text().trim();
            const artist = $(element).find(SELECTORS.artist).text().trim();
            const link = $(element).find(SELECTORS.link).attr('href');
            const cover = $(element).find(SELECTORS.cover).attr('src') || '';

            if (link) {
                tracks.push({
                    title: title || 'Без названия',
                    artist: artist || 'Неизвестен',
                    cover: cover,
                    trackUrl: link.startsWith('http') ? link : `${BASE_URL}${link}`,
                });
            }
        });

        console.log(`📀 Собрано ${tracks.length} треков без MP3`);

        // 3. Для каждого трека получаем MP3 со страницы трека
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const trackPageHtml = await axios.get(track.trackUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000,
                });
                const $track = cheerio.load(trackPageHtml.data);

                // Ищем аудио-ссылку
                let mp3 = null;

                // Вариант 1: через <audio> <source>
                const audioSource = $track(SELECTORS.audioSrc);
                if (audioSource.length) {
                    mp3 = audioSource.attr('src');
                }

                // Вариант 2: через кнопку скачивания
                if (!mp3) {
                    const downloadLink = $track(SELECTORS.downloadLink);
                    if (downloadLink.length) {
                        mp3 = downloadLink.attr('href');
                    }
                }

                // Вариант 3: прямая ссылка в тексте или в data-атрибуте
                if (!mp3) {
                    // Можно поискать любой элемент с атрибутом data-mp3 или подобным
                    // Например: $track('[data-mp3]').attr('data-mp3')
                }

                if (mp3) {
                    // Если ссылка относительная, делаем абсолютной
                    if (mp3.startsWith('/')) {
                        mp3 = `${BASE_URL}${mp3}`;
                    }
                    tracksWithMp3.push({
                        id: track.trackUrl,
                        title: track.title,
                        artist: track.artist,
                        cover: track.cover,
                        mp3: mp3,
                    });
                } else {
                    console.warn(`⚠️ Не удалось найти MP3 для ${track.title}`);
                }
            } catch (e) {
                console.warn(`⚠️ Ошибка загрузки страницы трека ${track.title}: ${e.message}`);
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
