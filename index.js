const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Список прокси-сервисов (порядок = приоритет)
const PROXIES = [
    'https://cors.lol/?url=',
    'https://proxy.corsfix.com/?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy/?url=',
    'https://cors.x2u.in/?url=',
];

// Функция для выполнения запроса через прокси с fallback
async function fetchWithProxy(url, maxRetries = PROXIES.length) {
    for (let i = 0; i < maxRetries; i++) {
        const proxy = PROXIES[i % PROXIES.length];
        const proxyUrl = proxy + encodeURIComponent(url);
        console.log(`📡 Попытка ${i+1} через ${proxy.split('//')[1].split('/')[0]}`);
        try {
            const response = await axios.get(proxyUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000,
            });
            if (response.status === 200 && response.data && response.data.length > 100) {
                console.log(`✅ Успех через ${proxy.split('//')[1].split('/')[0]}`);
                return response;
            }
        } catch (err) {
            console.warn(`⚠️ Прокси ${proxy.split('//')[1].split('/')[0]} не сработал: ${err.message}`);
        }
    }
    throw new Error('Все прокси недоступны');
}

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск: "${query}"`);

    try {
        const targetUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        const response = await fetchWithProxy(targetUrl);
        const html = response.data;

        const $ = cheerio.load(html);

        // Проверка на капчу
        if (html.includes('captcha') || html.includes('Доступ к сайту ограничен')) {
            console.warn('⚠️ Zaycev вернул капчу');
            return res.status(403).json({ error: 'Captcha detected' });
        }

        // Поиск треков с несколькими селекторами
        let trackItems = $('.musicset-track-list__items .musicset-track');
        if (trackItems.length === 0) trackItems = $('.musicset-track');
        if (trackItems.length === 0) trackItems = $('.track-item');
        if (trackItems.length === 0) trackItems = $('.musicset-track-list__items > div');

        console.log(`📀 Найдено элементов: ${trackItems.length}`);

        if (trackItems.length === 0) {
            return res.status(404).json({ error: 'No tracks found' });
        }

        // Сбор данных о треках
        const tracks = [];
        trackItems.each((index, element) => {
            const dataUrl = $(element).attr('data-url');
            if (!dataUrl) return;

            const title = $(element).find('.musicset-track__title').text().trim();
            const artist = $(element).find('.musicset-track__artist').text().trim();
            const cover = $(element).find('.musicset-track__cover img').attr('src') || '';

            tracks.push({
                id: dataUrl,
                title: title || 'Без названия',
                artist: artist || 'Неизвестен',
                cover: cover,
                dataUrl: dataUrl,
            });
        });

        console.log(`📀 Собрано ${tracks.length} треков, загружаем MP3...`);

        // Параллельная загрузка MP3 (не более 3 одновременных)
        const batchSize = 3;
        const tracksWithMp3 = [];

        for (let i = 0; i < tracks.length; i += batchSize) {
            const batch = tracks.slice(i, i + batchSize);
            const promises = batch.map(async (track) => {
                try {
                    const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                    const jsonResponse = await fetchWithProxy(jsonUrl);
                    const jsonData = jsonResponse.data;
                    const mp3Url = jsonData.url;
                    if (mp3Url) {
                        return {
                            id: track.id,
                            title: track.title,
                            artist: track.artist,
                            cover: track.cover,
                            mp3: mp3Url,
                        };
                    }
                } catch (e) {
                    console.warn(`⚠️ Ошибка MP3 для ${track.title}:`, e.message);
                }
                return null;
            });
            const results = await Promise.all(promises);
            results.forEach(result => {
                if (result) tracksWithMp3.push(result);
            });
        }

        console.log(`✅ Готово: ${tracksWithMp3.length} треков с MP3`);
        res.json({ tracks: tracksWithMp3 });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
