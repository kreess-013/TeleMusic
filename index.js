const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://muzal.net';

// Эндпоинт поиска
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    console.log(`🔍 Поиск на muzal.net: "${query}"`);

    try {
        // 1. Загружаем страницу поиска
        const searchUrl = `${BASE_URL}/query?q=${encodeURIComponent(query)}`;
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

            if (trackUrl) {
                tracks.push({
                    tid: tid || '',
                    title: title || 'Без названия',
                    artist: artist || 'Неизвестен',
                    cover: cover ? `${BASE_URL}${cover}` : '',
                    trackUrl: trackUrl.startsWith('http') ? trackUrl : `${BASE_URL}${trackUrl}`,
                    duration: duration,
                });
            }
        });

        console.log(`📀 Собрано ${tracks.length} треков без MP3`);

        // 3. Для каждого трека получаем MP3
        const tracksWithMp3 = [];
        for (const track of tracks) {
            try {
                let mp3 = null;

                // Сначала пробуем сформировать ссылку по data-tid (работает!)
                if (track.tid) {
                    mp3 = `https://muzal.net/download/${track.tid}.mp3`;
                    // Проверим, доступна ли ссылка (делаем HEAD-запрос)
                    try {
                        const headRes = await axios.head(mp3, { timeout: 3000 });
                        if (headRes.status === 200) {
                            // ссылка работает
                        } else {
                            mp3 = null;
                        }
                    } catch (e) {
                        mp3 = null;
                    }
                }

                // Если не получилось, парсим страницу трека
                if (!mp3) {
                    const trackPageHtml = await axios.get(track.trackUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 5000,
                    });
                    const $track = cheerio.load(trackPageHtml.data);

                    // Ищем ссылку на скачивание
                    // Вариант 1: кнопка с классом btn-track-dl (href может быть пустым, но data-dl есть)
                    const dlBtn = $track('.btn-track-dl');
                    if (dlBtn.length) {
                        // Проверяем атрибут href
                        const href = dlBtn.attr('href');
                        if (href && href.includes('.mp3')) {
                            mp3 = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                        } else {
                            // Если href ведёт на страницу, возможно, нужно добавить параметр
                            // Пробуем сформировать ссылку по data-tid (если есть)
                            const tidFromPage = $track('.track-actions').attr('data-tid');
                            if (tidFromPage) {
                                mp3 = `https://muzal.net/download/${tidFromPage}.mp3`;
                            }
                        }
                    }

                    // Вариант 2: ссылка с классом bd (на странице поиска)
                    if (!mp3) {
                        const downloadLink = $track('a.bd[href]').first();
                        if (downloadLink.length) {
                            const href = downloadLink.attr('href');
                            if (href && (href.includes('.mp3') || href.includes('/download/'))) {
                                mp3 = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                            }
                        }
                    }

                    // Вариант 3: аудио тег
                    if (!mp3) {
                        const audioSource = $track('audio source[src]').first();
                        if (audioSource.length) {
                            mp3 = audioSource.attr('src');
                            if (mp3 && !mp3.startsWith('http')) {
                                mp3 = `${BASE_URL}${mp3}`;
                            }
                        }
                    }

                    // Вариант 4: data-mp3 или data-url
                    if (!mp3) {
                        const dataElement = $track('[data-mp3], [data-url]').first();
                        if (dataElement.length) {
                            mp3 = dataElement.attr('data-mp3') || dataElement.attr('data-url');
                            if (mp3 && !mp3.startsWith('http')) {
                                mp3 = `${BASE_URL}${mp3}`;
                            }
                        }
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
