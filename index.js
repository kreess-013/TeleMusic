const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Список прокси (будем пробовать по очереди)
const PROXIES = [
    'https://cors.lol/?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy/?url=',
];

async function fetchWithProxy(url) {
    for (const proxy of PROXIES) {
        try {
            const proxyUrl = proxy + encodeURIComponent(url);
            console.log(`📡 Попытка через ${proxy}`);
            const response = await axios.get(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000,
            });
            if (response.status === 200 && response.data) {
                console.log(`✅ Успех через ${proxy}`);
                return response.data;
            }
        } catch (e) {
            console.warn(`⚠️ Ошибка ${proxy}:`, e.message);
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
        const html = await fetchWithProxy(targetUrl);

        // Логируем первые 500 символов для диагностики
        console.log('📄 Первые 500 символов ответа:');
        console.log(html.slice(0, 500));

        // Проверяем на капчу
        if (html.includes('captcha') || html.includes('Доступ к сайту ограничен')) {
            console.log('❌ Обнаружена капча');
            return res.status(403).json({ error: 'Captcha detected' });
        }

        const $ = cheerio.load(html);

        // Ищем все элементы с data-url
        const trackElements = $('[data-url]');
        console.log(`📀 Найдено элементов с data-url: ${trackElements.length}`);

        if (trackElements.length === 0) {
            // Если data-url нет, возможно, это JSON-ответ
            try {
                const json = JSON.parse(html);
                if (json && json.tracks) {
                    // Zaycev иногда отдаёт JSON
                    const tracks = json.tracks.map(t => ({
                        id: t.id || t.url,
                        title: t.title || 'Без названия',
                        artist: t.artist || 'Неизвестен',
                        cover: t.cover || '',
                        mp3: t.url || '',
                    }));
                    return res.json({ tracks });
                }
            } catch (_) {}
            return res.status(404).json({ error: 'No tracks found' });
        }

        const tracks = [];
        trackElements.each((index, element) => {
            const dataUrl = $(element).attr('data-url');
            if (!dataUrl) return;

            // Пытаемся найти название и исполнителя
            let title = $(element).find('.musicset-track__title').text().trim();
            let artist = $(element).find('.musicset-track__artist').text().trim();
            let cover = $(element).find('.musicset-track__cover img').attr('src') || '';

            // Если не нашли по классам, пробуем взять текст из элемента
            if (!title) {
                const text = $(element).text().trim();
                // Пробуем разделить на исполнителя и название (часто через " - ")
                const parts = text.split(' - ');
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                } else {
                    title = text;
                }
            }

            // Если обложка не найдена, ищем любую картинку внутри
            if (!cover) {
                const img = $(element).find('img').attr('src');
                if (img) cover = img;
            }

            tracks.push({
                id: dataUrl,
                title: title || 'Без названия',
                artist: artist || 'Неизвестен',
                cover: cover,
                dataUrl: dataUrl,
            });
        });

        console.log(`📀 Собрано ${tracks.length} треков, загружаем MP3...`);

        // Получаем MP3 через тот же прокси
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const jsonData = await fetchWithProxy(jsonUrl);
                let mp3Url = null;

                try {
                    const parsed = JSON.parse(jsonData);
                    mp3Url = parsed.url;
                } catch (_) {
                    // Если не JSON, возможно, это прямой MP3
                    if (jsonData.startsWith('http')) {
                        mp3Url = jsonData.trim();
                    }
                }

                if (mp3Url) {
                    tracksWithMp3.push({
                        id: track.id,
                        title: track.title,
                        artist: track.artist,
                        cover: track.cover,
                        mp3: mp3Url,
                    });
                } else {
                    console.warn(`⚠️ Нет mp3 для ${track.title}`);
                }
            } catch (e) {
                console.warn(`⚠️ Ошибка MP3 для ${track.title}:`, e.message);
            }
        }

        console.log(`✅ Готово: ${tracksWithMp3.length} треков с MP3`);
        res.json({ tracks: tracksWithMp3 });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
