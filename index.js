const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Путь к файлу с куками (опционально, но помогает избежать 403)
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');

// Проверяем, существует ли файл с куками
let cookiesOption = '';
if (fs.existsSync(COOKIES_PATH)) {
    cookiesOption = `--cookies ${COOKIES_PATH}`;
    console.log('🍪 Куки загружены');
} else {
    console.warn('⚠️ cookies.txt не найден. YouTube может блокировать запросы.');
}

// Эндпоинт для скачивания одного видео
app.get('/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    console.log(`📥 Скачивание: ${url}`);

    try {
        // Генерируем временное имя файла
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

        // Команда yt-dlp для скачивания аудио в MP3
        const command = `yt-dlp ${cookiesOption} --extract-audio --audio-format mp3 --audio-quality 0 --output "${outputTemplate}" "${url}"`;

        exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Ошибка yt-dlp:', error);
                console.error('stderr:', stderr);
                return res.status(500).json({ error: 'Failed to download' });
            }

            // Ищем скачанный файл
            const files = fs.readdirSync(tempDir);
            const audioFile = files.find(f => f.endsWith('.mp3'));
            if (!audioFile) {
                return res.status(500).json({ error: 'No MP3 file generated' });
            }

            const filePath = path.join(tempDir, audioFile);
            // Отправляем файл
            res.download(filePath, audioFile, (err) => {
                // Удаляем файл после отправки
                fs.unlink(filePath, () => {});
                if (err) console.error('Ошибка отправки файла:', err);
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Эндпоинт для скачивания плейлиста (возвращает ZIP-архив)
app.get('/download-playlist', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    console.log(`📥 Скачивание плейлиста: ${url}`);

    try {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

        // Скачиваем все аудио из плейлиста
        const command = `yt-dlp ${cookiesOption} --extract-audio --audio-format mp3 --audio-quality 0 --output "${outputTemplate}" --yes-playlist "${url}"`;

        exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Ошибка yt-dlp:', error);
                console.error('stderr:', stderr);
                return res.status(500).json({ error: 'Failed to download playlist' });
            }

            // Собираем все MP3-файлы
            const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.mp3'));
            if (files.length === 0) {
                return res.status(500).json({ error: 'No MP3 files generated' });
            }

            // Создаём ZIP-архив (если несколько файлов) или отправляем один файл
            if (files.length === 1) {
                const filePath = path.join(tempDir, files[0]);
                res.download(filePath, files[0], () => {
                    fs.unlink(filePath, () => {});
                });
            } else {
                // Для простоты: возвращаем ссылки на файлы (можно расширить до ZIP)
                const fileUrls = files.map(f => ({
                    filename: f,
                    url: `/download-file?file=${encodeURIComponent(f)}`
                }));
                res.json({
                    message: `Скачано ${files.length} треков`,
                    files: fileUrls
                });
                // Очистка временных файлов через некоторое время
                setTimeout(() => {
                    files.forEach(f => {
                        const p = path.join(tempDir, f);
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    });
                }, 60000);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Эндпоинт для прямой отдачи временного файла (используется при плейлисте)
app.get('/download-file', (req, res) => {
    const { file } = req.query;
    if (!file) return res.status(400).json({ error: 'Missing file parameter' });
    const filePath = path.join(__dirname, 'temp', file);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath, file, () => {
        fs.unlink(filePath, () => {});
    });
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
