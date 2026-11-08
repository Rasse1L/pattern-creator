const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RECIPIENT = process.env.RECIPIENT_EMAIL || 'sodimmlit@gmail.com';

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/send-pattern', async (req, res) => {
  try {
    const { nickname, size, image, cells, website } = req.body || {};
    // Honeypot field: ordinary visitors never see or fill this input.
    if (website) return res.json({ ok: true });
    if (typeof nickname !== 'string' || !nickname.trim() || nickname.trim().length > 32) {
      return res.status(400).json({ error: 'Укажи ник длиной от 1 до 32 символов.' });
    }
    if (!Number.isInteger(size) || size < 12 || size > 64 || size % 2 !== 0) {
      return res.status(400).json({ error: 'Недопустимый размер сетки.' });
    }
    if (!Array.isArray(cells) || cells.length !== size * size || cells.some(v => ![0, 1, 2].includes(v))) {
      return res.status(400).json({ error: 'Данные узора повреждены.' });
    }
    if (typeof image !== 'string' || !/^data:image\/png;base64,/.test(image) || image.length > 7_000_000) {
      return res.status(400).json({ error: 'Не удалось прочитать изображение узора.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.error('Email is not configured: set RESEND_API_KEY and EMAIL_FROM.');
      return res.status(503).json({ error: 'Отправка пока не настроена. Попробуй позже.' });
    }

    const base64 = image.split(',')[1];
    const safeNick = nickname.trim().replace(/[<>\r\n]/g, '');
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const html = `<div style="font-family:Arial,sans-serif"><h2>Новый узор</h2><p><b>Ник:</b> ${escapeHtml(safeNick)}</p><p><b>Размер:</b> ${size} × ${size}</p><p><b>Время:</b> ${timestamp} (МСК)</p><p>Чёрный — выступ, красный — впадина.</p></div>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        subject: `Новый узор от ${safeNick} (${size}×${size})`,
        html,
        attachments: [{ filename: `pattern-${size}x${size}.png`, content: base64 }]
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend error:', response.status, result);
      return res.status(502).json({ error: 'Почтовый сервис не смог принять узор. Попробуй ещё раз позже.' });
    }
    res.json({ ok: true, id: result.id });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Не получилось отправить узор. Попробуй ещё раз.' });
  }
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Pattern Creator is running on port ${PORT}`));
