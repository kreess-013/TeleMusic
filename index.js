const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://muzal.net';

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск на muzal.net: "${query}"`);

    try {
        const searchUrl = `${BASE_URL}/query?q=${encodeURIComponent(query)}`;
        console.log(`📡 Запрос к: ${searchUrl}`);

        const response = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000,
        });

        const html = response.data;
        console.log(`✅ Страница загружена, длина: ${html.length}`);

        const $ = cheerio.load(html);
        const trackElements = $('.t-item');
        console.log(`📀 Найдено элементов: ${trackElements.length}`);

        if (trackElements.length === 0) {
            return res.status(404).json({ error: 'No tracks found' });
        }

        const tracks = [];
        trackElements.each((index, element) => {
            const title = $(element).find('.t-name a').first().text().trim();
            const artist = $(element).find('.t-title a').first().text().trim();
            const trackUrl = $(element).find('.t-name a').first().attr('href');
            const cover = $(element).find('img.t-img').attr('src');
            const duration = $(element).find('.t-dur').text().trim();
            const tid = $(element).attr('data-tid');
            const slug = trackUrl ? trackUrl.split('/').pop() : '';

            tracks.push({
                tid: tid || '',
                slug: slug,
                title: title || 'Без названия',
                artist: artist || 'Неизвестен',
                cover: cover ? `${BASE_URL}${cover}` : '',
                trackUrl: trackUrl ? (trackUrl.startsWith('http') ? trackUrl : `${BASE_URL}${trackUrl}`) : '',
                duration: duration,
            });
        });

        console.log(`📀 Собрано ${tracks.length} треков без MP3`);

        const tracksWithMp3 = [];
        for (const track of tracks) {
            let mp3 = null;
            console.log(`🔍 Обработка: ${track.title} (tid: ${track.tid || 'нет'}, slug: ${track.slug || 'нет'})`);

            // Способ 1: прямой URL по tid
            if (track.tid) {
                const candidate = `https://muzal.net/download/${track.tid}.mp3`;
                console.log(`   Попытка: ${candidate}`);
                try {
                    const headRes = await axios.head(candidate, { timeout: 3000 });
                    if (headRes.status === 200) {
                        mp3 = candidate;
                        console.log(`   ✅ Успех (HEAD 200)`);
                    } else {
                        console.log(`   ❌ HEAD статус: ${headRes.status}`);
                    }
                } catch (e) {
                    console.log(`   ❌ HEAD ошибка: ${e.message}`);
                }
            }

            // Способ 2: если не получилось, пробуем ?download=1 на странице трека
            if (!mp3 && track.slug) {
                const candidate = `${BASE_URL}/music/${track.slug}?download=1`;
                console.log(`   Попытка: ${candidate}`);
                try {
                    const headRes = await axios.head(candidate, { timeout: 3000 });
                    if (headRes.status === 200) {
                        // Проверим, не HTML ли это
                        // Попробуем GET и проверим Content-Type
                        const getRes = await axios.get(candidate, { timeout: 3000 });
                        if (getRes.headers['content-type'] && getRes.headers['content-type'].includes('audio/mpeg')) {
                            mp3 = candidate;
                            console.log(`   ✅ Успех (audio/mpeg)`);
                        } else {
                            console.log(`   ❌ Не audio/mpeg, content-type: ${getRes.headers['content-type']}`);
                        }
                    } else {
                        console.log(`   ❌ HEAD статус: ${headRes.status}`);
                    }
                } catch (e) {
                    console.log(`   ❌ HEAD ошибка: ${e.message}`);
                }
            }

            // Способ 3: парсинг страницы трека (если ничего не сработало)
            if (!mp3 && track.trackUrl) {
                console.log(`   Парсинг страницы: ${track.trackUrl}`);
                try {
                    const trackPageHtml = await axios.get(track.trackUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 5000,
                    });
                    const $track = cheerio.load(trackPageHtml.data);
                    // Ищем кнопку скачивания
                    const dlBtn = $track('.btn-track-dl');
                    if (dlBtn.length) {
                        const href = dlBtn.attr('href');
                        if (href && href.includes('.mp3')) {
                            mp3 = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                            console.log(`   ✅ Найден href в .btn-track-dl: ${mp3}`);
                        } else {
                            // Попробуем найти data-tid на странице
                            const tidFromPage = $track('.track-actions').attr('data-tid');
                            if (tidFromPage) {
                                const candidate = `https://muzal.net/download/${tidFromPage}.mp3`;
                                console.log(`   Попытка по data-tid страницы: ${candidate}`);
                                try {
                                    const headRes2 = await axios.head(candidate, { timeout: 3000 });
                                    if (headRes2.status === 200) {
                                        mp3 = candidate;
                                        console.log(`   ✅ Успех (HEAD 200)`);
                                    }
                                } catch (e) {}
                            }
                        }
                    }
                } catch (e) {
                    console.log(`   ❌ Ошибка парсинга страницы: ${e.message}`);
                }
            }

            if (mp3) {
                tracksWithMp3.push({
                    id: track.trackUrl,
                    title: track.title,
                    artist: track.artist,
                    cover: track.cover,
                    mp3: mp3,
                    duration: track.duration,
                });
                console.log(`   ✅ Добавлен трек: ${track.title}`);
            } else {
                console.log(`   ❌ Не удалось найти MP3 для ${track.title}`);
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
