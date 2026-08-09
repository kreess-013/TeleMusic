const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const ytSearch = require('yt-search');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Поиск
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    try {
        const result = await ytSearch(query);
        const tracks = result.videos.slice(0, 15).map(v => ({
            id: v.videoId,
            title: v.title,
            artist: v.author.name,
            cover: v.thumbnail,
            duration: v.duration.seconds,
        }));
        res.json({ tracks });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Получение аудио через yt-dlp
app.get('/info', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    // Команда для получения прямой ссылки на аудио (лучшее качество)
    const command = `yt-dlp -f bestaudio --get-url ${url}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', error);
            return res.status(500).json({ error: 'Failed to get audio' });
        }
        const audioUrl = stdout.trim();
        if (!audioUrl) {
            return res.status(404).json({ error: 'No audio URL found' });
        }

        // Также можно получить метаданные через yt-dlp -j
        // Но для простоты сначала получаем ссылку, а потом можем получить информацию отдельно
        // Запрашиваем метаданные в том же вызове? Лучше сделать два вызова, но можно и один, используя -j
        // Упростим: сначала получаем ссылку, а для метаданных используем yt-search (уже есть)
        // Но у нас нет названия и артиста — можно получить через yt-search по ID
        // Либо сразу извлечь через yt-dlp --print title и т.д.
        // Оптимально — сделать один вызов с выводом JSON
        const infoCommand = `yt-dlp -j ${url}`;
        exec(infoCommand, (err, stdoutInfo) => {
            if (err) {
                // Если не удалось получить инфу, отдаём только ссылку
                return res.json({ audioUrl });
            }
            try {
                const info = JSON.parse(stdoutInfo);
                res.json({
                    id: info.id,
                    title: info.title,
                    artist: info.uploader,
                    thumbnail: info.thumbnail,
                    audioUrl: audioUrl,
                    duration: info.duration,
                });
            } catch (parseErr) {
                res.json({ audioUrl });
            }
        });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
