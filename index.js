const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://z3.fm';
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Полный набор заголовков браузера
function getHeaders() {
    return {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Referer': 'https://z3.fm/',
        'Pragma': 'no-cache',
    };
}

// Функция запроса с повторными попытками
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: getHeaders(),
                timeout: 15000,
                // Не сжимаем ответ вручную (axios сам распакует)
            });
            return response;
        } catch (err) {
            console.log(`⚠️ Попытка ${i + 1} не удалась: ${err.message}`);
            if (i === retries - 1) throw err;
            // Пауза перед повторной попыткой
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Парсинг списка треков
async function parseSongs(html) {
    const $ = cheerio.load(html);
    const tracks = [];

    $('.song-wrap').each((i, el) => {
        const songEl = $(el).find('.song');
        if (!songEl.length) return;

        const sid = songEl.attr('data-sid') || songEl.attr('data-play');
        const dataUrl = songEl.attr('data-url');

        const nameLink = songEl.find('.song-content .song-name a');
        const artistLink = songEl.find('.song-content .song-artist a');
        const title = nameLink.text().trim();
        const artist = artistLink.text().trim();
        const duration = songEl.find('.song-info .song-time').text().trim();

        if (sid && dataUrl) {
            tracks.push({
                id: sid,
                title: title || 'Unknown',
                artist: artist || 'Unknown',
                duration: duration || '0:00',
                mp3: dataUrl.startsWith('http') ? dataUrl : `${BASE_URL}${dataUrl}`,
            });
        }
    });

    return tracks;
}

// Поиск
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    try {
        const searchUrl = `${BASE_URL}/mp3/search?keywords=${encodeURIComponent(query)}`;
        const response = await fetchWithRetry(searchUrl);
        const tracks = await parseSongs(response.data);
        res.json({ tracks });
    } catch (err) {
        console.error(err);
        // Если z3.fm блокирует, предлагаем использовать прокси
        if (err.response && err.response.status === 403) {
            return res.status(403).json({
                error: 'Сайт z3.fm блокирует запросы с вашего IP. Попробуйте позже или используйте другой источник.',
            });
        }
        res.status(500).json({ error: err.message });
    }
});

// Популярные
app.get('/popular', async (req, res) => {
    try {
        const response = await fetchWithRetry(BASE_URL);
        const tracks = await parseSongs(response.data);
        res.json({ tracks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Получение информации о треке (по ID)
app.get('/track/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const url = `${BASE_URL}/song/${id}`;
        const response = await fetchWithRetry(url);
        const $ = cheerio.load(response.data);

        const title = $('h1').first().text().trim();
        const artist = $('.title_box h1').first().text().trim() || 'Unknown';
        const duration = $('.sb_item .icon-time').parent().find('b').text().trim() || '0:00';
        const size = $('.sb_item .icon-size').parent().find('b').text().trim() || '0';
        const bitrate = $('.sb_item .icon-bitrate').parent().find('b').text().trim() || '0';
        const cover = $('meta[property="og:image"]').attr('content') || '';

        // Ссылка на скачивание (data-url)
        const downloadBtn = $('[data-sid="' + id + '"]').first();
        let mp3 = '';
        if (downloadBtn.length) {
            mp3 = downloadBtn.attr('data-url');
            if (mp3 && !mp3.startsWith('http')) {
                mp3 = `${BASE_URL}${mp3}`;
            }
        }

        res.json({
            id,
            title,
            artist,
            duration,
            size,
            bitrate,
            cover: cover || '',
            mp3: mp3 || '',
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Прокси для обхода CORS (если понадобится)
app.get('/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
        const response = await axios.get(url, {
            headers: getHeaders(),
            responseType: 'stream',
        });
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
