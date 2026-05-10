const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// ===== Google Sheets Setup =====
let doc;
async function connectToSheet() {
    try {
        doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        console.log(`✅ Connected to Google Sheet: ${doc.title}`);
    } catch (error) {
        console.error('❌ Google Sheets Connection Error:', error.message);
    }
}

// ===== LOGIN ENDPOINT (معدل على حسب الأعمدة بتاعتك) =====
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const sheet = doc.sheetsByTitle['Users'];
        if (!sheet) return res.status(404).json({ ok: false, error: 'Users tab not found' });

        const rows = await sheet.getRows();
        
        // بدور على الإيميل والباصورد في الأعمدة بتاعتك بالظبط
        const user = rows.find(r => r.Email === email && r.Password === password);

        if (user) {
            // لاقيته، هبعت البيانات للواجهة (من غير الباصورد عشان الأمان)
            res.json({ 
                ok: true, 
                user: { 
                    id: user.ID, 
                    name: user.Name, 
                    email: user.Email, 
                    role: user.Role, 
                    region: user.Region,
                    status: user.Status
                } 
            });
        } else {
            // مالقاهوش
            res.status(401).json({ ok: false, error: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ===== Links Endpoints =====
app.get('/api/links', async (req, res) => {
    try {
        const sheet = doc.sheetsByTitle['Links'];
        if (!sheet) return res.status(404).json({ error: 'Links tab not found' });
        const rows = await sheet.getRows();
        const links = rows.map(row => ({
            linkId: row.linkId,
            linkConfig: row.linkConfig,
            scope: row.scope,
            company: row.company,
            area: row.area,
            owner: row.owner,
            status: row.status,
            tgChatId: row.tgChatId,
            addDate: row.addDate
        }));
        res.json({ ok: true, data: links });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/links', async (req, res) => {
    try {
        const data = req.body;
        const sheet = doc.sheetsByTitle['Links'];
        await sheet.addRow({
            linkId: data.linkId,
            linkConfig: data.linkConfig || '',
            scope: data.scope || '',
            company: data.company || '',
            area: data.area || '',
            owner: data.owner || '',
            status: 'Not sent to Telegram',
            tgChatId: '',
            addDate: new Date().toISOString(),
            note: data.note || ''
        });

        try {
            const webhookResponse = await axios.post(process.env.RENDER_WEBHOOK_URL, data);
            res.json({ ok: true, message: 'Link saved and Telegram process started', taskId: webhookResponse.data.task_id });
        } catch (webhookErr) {
            res.json({ ok: true, message: 'Link saved, but Telegram webhook failed' });
        }
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'running', sheets_connected: !!doc });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await connectToSheet();
    console.log(`🚀 Server running on port ${PORT}`);
});
