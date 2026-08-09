const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Прокси для получения MP3 (без рендеринга)
const PROXY = 'https://cors.lol/?url=';

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск: "${query}"`);

    let browser;
    try {
        // 1. Запуск браузера
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
            timeout: 60000,
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const searchUrl = `https://zaycev.net/search.html?query_search=${encodeURIComponent(query)}`;
        console.log(`📡 Загрузка: ${searchUrl}`);

        // 2. Загружаем страницу и ждём, пока появятся элементы с data-url
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('✅ Страница загружена');

        // Ждём появления элементов с data-url
        await page.waitForSelector('[data-url]', { timeout: 15000 }).catch(() => {
            console.log('⚠️ Элементы с data-url не найдены за 15 секунд');
        });

        // 3. Извлекаем данные
        const tracksData = await page.evaluate(() => {
            const items = document.querySelectorAll('[data-url]');
            const result = [];
            items.forEach(el => {
                const dataUrl = el.getAttribute('data-url');
                if (!dataUrl) return;
                const titleEl = el.querySelector('.musicset-track__title');
                const artistEl = el.querySelector('.musicset-track__artist');
                const imgEl = el.querySelector('.musicset-track__cover img');
                const title = titleEl ? titleEl.textContent.trim() : '';
                const artist = artistEl ? artistEl.textContent.trim() : '';
                const cover = imgEl ? imgEl.getAttribute('src') || '' : '';
                result.push({ dataUrl, title, artist, cover });
            });
            return result;
        });

        console.log(`📀 Найдено элементов: ${tracksData.length}`);

        if (tracksData.length === 0) {
            await browser.close();
            return res.status(404).json({ error: 'No tracks found' });
        }

        // 4. Закрываем браузер (он больше не нужен)
        await browser.close();

        // 5. Получаем MP3 через прокси (для каждого трека)
        const tracksWithMp3 = [];
        for (const track of tracksData) {
            try {
                const jsonUrl = `https://zaycev.net${track.dataUrl}`;
                const proxyUrl = PROXY + encodeURIComponent(jsonUrl);
                const response = await axios.get(proxyUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000,
                });
                const json = response.data;
                const mp3Url = json.url || '';
                if (mp3Url) {
                    tracksWithMp3.push({
                        id: track.dataUrl,
                        title: track.title || 'Без названия',
                        artist: track.artist || 'Неизвестен',
                        cover: track.cover || '',
                        mp3: mp3Url,
                    });
                }
            } catch (e) {
                console.warn(`⚠️ Не удалось получить MP3 для ${track.title}: ${e.message}`);
            }
        }

        console.log(`✅ Готово: ${tracksWithMp3.length} треков с MP3`);
        res.json({ tracks: tracksWithMp3 });
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        if (browser) await browser.close();
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
