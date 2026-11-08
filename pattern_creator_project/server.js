
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(express.json({ limit: '8mb' }));

app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/send-pattern', async (req, res) => {
  try {
    const { nickname, size, image, cells, website } = req.body || {};

    // Защита от ботов
    if (website) return res.json({ ok: true });

    // Проверка ника
    if (
      typeof nickname !== 'string' ||
      !nickname.trim() ||
      nickname.trim().length > 32
    ) {
      return res.status(400).json({
        error: 'Укажи ник длиной от 1 до 32 символов.'
      });
    }

    // Проверка размера сетки
    if (
      !Number.isInteger(size) ||
      size < 12 ||
      size > 64 ||
      size % 2 !== 0
    ) {
      return res.status(400).json({
        error: 'Недопустимый размер сетки.'
      });
    }

    // Проверка клеток
    if (
      !Array.isArray(cells) ||
      cells.length !== size * size ||
      cells.some(v => ![0, 1, 2].includes(v))
    ) {
      return res.status(400).json({
        error: 'Данные узора повреждены.'
      });
    }

    // Проверка PNG
    if (
      typeof image !== 'string' ||
      !/^data:image\/png;base64,/.test(image) ||
      image.length > 7_000_000
    ) {
      return res.status(400).json({
        error: 'Не удалось прочитать изображение узора.'
      });
    }

    // Настройки Google Apps Script
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const secret = process.env.GOOGLE_SCRIPT_SECRET;

    if (!scriptUrl || !secret) {
      console.error('Google Apps Script is not configured.');

      return res.status(503).json({
        error: 'Отправка пока не настроена. Попробуй позже.'
      });
    }

    const safeNick = nickname.trim().replace(/[<>\r\n]/g, '');

    // Отправляем PNG в Google Apps Script
    const response = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secret: secret,
        nickname: safeNick,
        size: size,
        pngBase64: image,
        cells: cells
      }),
      signal: AbortSignal.timeout(30000)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success !== true) {
      console.error('Google Apps Script error:', result);

      return res.status(502).json({
        error: 'Не удалось отправить узор на почту. Попробуй позже.'
      });
    }

    console.log(`Pattern sent: ${safeNick}, ${size}x${size}`);

    return res.json({ ok: true });

  } catch (error) {
    console.error('Submission error:', error);

    return res.status(500).json({
      error: 'Не получилось отправить узор. Попробуй ещё раз.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Pattern Creator is running on port ${PORT}`);
});
