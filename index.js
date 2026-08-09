const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://z3.fm';

// Парсинг страницы поиска или списка треков
function parseSongs(html) {
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

// Парсинг страницы конкретного трека
function parseTrackPage(html) {
    const $ = cheerio.load(html);
    const track = {};

    // Извлекаем ID из URL или из data-атрибутов
    const sid = $('.song-play').attr('data-sid') || 
                $('.btn-xlarge.song-play').attr('data-sid') || 
                $('[data-sid]').first().attr('data-sid');

    const dataUrl = $('.song-play').attr('data-url') || 
                    $('.btn-xlarge.song-play').attr('data-url') ||
                    $('[data-url]').first().attr('data-url');

    // Название и исполнитель
    const titleEl = $('h1').first();
    const artistEl = $('h2.before_h1').first();
    const title = titleEl.text().trim();
    const artist = artistEl.text().trim();

    // Длительность, размер, битрейт
    const duration = $('.sb_item .icon-time').parent().find('b').text().trim();
    const size = $('.sb_item .icon-size').parent().find('b').text().trim();
    const bitrate = $('.sb_item .icon-bitrate').parent().find('b').text().trim();

    // Обложка (может быть)
    const cover = $('meta[property="og:image"]').attr('content') || '';

    if (sid && dataUrl) {
        track.id = sid;
        track.title = title || 'Unknown';
        track.artist = artist || 'Unknown';
        track.duration = duration || '0:00';
        track.size = size || '';
        track.bitrate = bitrate || '';
        track.mp3 = dataUrl.startsWith('http') ? dataUrl : `${BASE_URL}${dataUrl}`;
        track.cover = cover;
    }

    return track;
}

// Поиск
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    try {
        const searchUrl = `${BASE_URL}/mp3/search?keywords=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': BASE_URL,
            },
            timeout: 15000,
        });
        const tracks = parseSongs(response.data);
        res.json({ tracks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Получение информации о треке по ID
app.get('/track/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing track id' });

    try {
        const trackUrl = `${BASE_URL}/song/${id}`;
        const response = await axios.get(trackUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': BASE_URL,
            },
            timeout: 15000,
        });
        const track = parseTrackPage(response.data);
        if (track && track.id) {
            res.json({ track });
        } else {
            res.status(404).json({ error: 'Track not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Популярные (главная)
app.get('/popular', async (req, res) => {
    try {
        const response = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': BASE_URL,
            },
            timeout: 15000,
        });
        const tracks = parseSongs(response.data);
        res.json({ tracks });
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
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': BASE_URL,
            },
            responseType: 'stream',
        });
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
