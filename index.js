const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Прокси для обхода блокировки Zaycev
const PROXY = 'https://api.allorigins.win/raw?url=';

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск: "${query}"`);

    try {
        const targetUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        const proxyUrl = PROXY + encodeURIComponent(targetUrl);
        console.log(`📡 Запрос через прокси: ${proxyUrl}`);

        const response = await axios.get(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000,
        });

        console.log(`✅ Статус: ${response.status}, длина HTML: ${response.data.length}`);

        // Проверяем, не пришла ли капча
        if (response.data.includes('captcha') || response.data.includes('Доступ к сайту ограничен')) {
            console.log('❌ Zaycev вернул страницу с капчей (даже через прокси)');
            return res.status(403).json({ error: 'Captcha detected' });
        }

        const $ = cheerio.load(response.data);
        let trackItems = $('.musicset-track-list__items .musicset-track');
        if (trackItems.length === 0) {
            trackItems = $('.musicset-track');
        }

        console.log(`📀 Найдено элементов: ${trackItems.length}`);

        if (trackItems.length === 0) {
            console.log('⚠️ Треки не найдены, возможно, изменилась структура');
            return res.status(404).json({ error: 'No tracks found' });
        }

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

        // Получаем MP3 через тот же прокси
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const proxyJsonUrl = PROXY + encodeURIComponent(jsonUrl);
                const jsonResponse = await axios.get(proxyJsonUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 5000,
                });
                const jsonData = jsonResponse.data;
                const mp3Url = jsonData.url;
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
