const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск: "${query}"`);

    try {
        const searchUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        console.log(`📡 Запрос к: ${searchUrl}`);

        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            },
            timeout: 15000,
            maxRedirects: 5,
        });

        console.log(`✅ Статус: ${response.status}, длина HTML: ${response.data.length}`);

        // Проверяем, не вернулась ли страница с капчей
        if (response.data.includes('captcha') || response.data.includes('проверка')) {
            console.error('❌ Zaycev вернул страницу с капчей');
            return res.status(403).json({ error: 'Zaycev требует проверку' });
        }

        // Если HTML слишком короткий, возможно, ошибка
        if (response.data.length < 1000) {
            console.error('❌ HTML слишком короткий:', response.data);
            return res.status(404).json({ error: 'Пустой ответ' });
        }

        const $ = cheerio.load(response.data);

        // Попробуем найти треки разными селекторами
        let trackItems = [];

        // Способ 1: стандартный селектор
        trackItems = $('.musicset-track-list__items .musicset-track');
        console.log(`Способ 1 (.musicset-track-list__items .musicset-track): ${trackItems.length}`);

        // Способ 2: только .musicset-track
        if (trackItems.length === 0) {
            trackItems = $('.musicset-track');
            console.log(`Способ 2 (.musicset-track): ${trackItems.length}`);
        }

        // Способ 3: ищем контейнер с атрибутом data-url
        if (trackItems.length === 0) {
            trackItems = $('[data-url]').filter((i, el) => $(el).attr('data-url').startsWith('/track/'));
            console.log(`Способ 3 ([data-url^="/track/"]): ${trackItems.length}`);
        }

        // Способ 4: ищем по классу track
        if (trackItems.length === 0) {
            trackItems = $('.track');
            console.log(`Способ 4 (.track): ${trackItems.length}`);
        }

        // Если всё равно ничего, сохраняем фрагмент HTML в лог
        if (trackItems.length === 0) {
            const bodyHtml = $('body').html().slice(0, 500);
            console.log('📄 Фрагмент body:', bodyHtml);
            return res.status(404).json({ 
                error: 'Треки не найдены', 
                htmlPreview: bodyHtml 
            });
        }

        const tracks = [];
        trackItems.each((index, element) => {
            const dataUrl = $(element).attr('data-url');
            if (!dataUrl) return;

            const title = $(element).find('.musicset-track__title').text().trim() ||
                          $(element).find('.track__title').text().trim() ||
                          $(element).find('[class*="title"]').text().trim();

            const artist = $(element).find('.musicset-track__artist').text().trim() ||
                           $(element).find('.track__artist').text().trim() ||
                           $(element).find('[class*="artist"]').text().trim();

            const cover = $(element).find('.musicset-track__cover img').attr('src') ||
                          $(element).find('.track__cover img').attr('src') ||
                          '';

            if (dataUrl && title) {
                tracks.push({ dataUrl, title, artist, cover });
            }
        });

        console.log(`📀 Собрано ${tracks.length} треков`);

        // Получаем MP3
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const jsonRes = await axios.get(jsonUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                    },
                    timeout: 5000,
                });
                const jsonData = jsonRes.data;
                if (jsonData.url) {
                    tracksWithMp3.push({
                        id: track.dataUrl,
                        title: track.title,
                        artist: track.artist,
                        cover: track.cover,
                        mp3: jsonData.url,
                    });
                } else {
                    console.warn(`⚠️ Нет mp3 для ${track.title}`);
                }
            } catch (e) {
                console.warn(`⚠️ Ошибка mp3 для ${track.title}:`, e.message);
            }
        }

        console.log(`✅ Готово: ${tracksWithMp3.length} треков`);
        res.json({ tracks: tracksWithMp3 });

    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        if (err.response) {
            console.error('Статус:', err.response.status);
            console.error('Заголовки:', err.response.headers);
            console.error('Данные:', err.response.data?.slice(0, 300));
        }
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
