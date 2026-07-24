const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ⚡ ইন-মেমোরি ক্যাশ (RAM Variables)
global.config = {
    geminiApiKey: '',
    metaAccessToken: '',
    metaApiVersion: 'v25.0',
    verifyToken: '',
    productSheetId: '',
    orderSheetId: '',
    configSheetId: '',
    appsScriptUrl: ''
};
global.products = [];
global.orders = [];

// ==========================================
// 📊 গুগল শিট ইন্টিগ্রেশন
// ==========================================

async function fetchSheetData(sheetId, tabName) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
        const response = await axios.get(url);
        const jsonString = response.data.match(/google\.visualization\.Query\.setResponse\(([\s\S\n\r]*)\);/)[1];
        const data = JSON.parse(jsonString);
        const rows = data.table.rows;
        const cols = data.table.cols.map(c => c.label || '');
        return rows.map(row => {
            let item = {};
            row.c.forEach((cell, i) => {
                if (cols[i]) item[cols[i]] = cell ? cell.v : '';
            });
            return item;
        });
    } catch (error) {
        console.error(`❌ Error reading sheet [${tabName}]:`, error.message);
        return [];
    }
}

async function appendSheetData(sheetId, tabName, rowData) {
    try {
        const scriptUrl = global.config.appsScriptUrl || process.env.APPS_SCRIPT_URL;
        if (!scriptUrl) {
            console.error('❌ Apps Script URL missing.');
            return false;
        }
        await axios.post(scriptUrl, { sheetId, tabName, data: rowData });
        console.log(`✅ Synced to Google Sheet [${tabName}]`);
        return true;
    } catch (error) {
        console.error(`❌ Error writing to sheet [${tabName}]:`, error.message);
        return false;
    }
}

// ==========================================
// 🔄 অটো-বুট রিকভারি লজিক
// ==========================================
async function autoBootRecovery() {
    const masterSheetId = process.env.MASTER_CONFIG_SHEET_ID;
    if (masterSheetId) {
        console.log('🔄 Auto-Boot: Restoring cache from Config Sheet...');
        const configData = await fetchSheetData(masterSheetId, 'Server Config');
        if (configData && configData.length > 0) {
            const latestConfig = configData[configData.length - 1];
            global.config = {
                geminiApiKey: latestConfig['Gemini API Key'] || '',
                metaAccessToken: latestConfig['Meta Access Token'] || '',
                metaApiVersion: latestConfig['Meta API Version'] || 'v25.0',
                verifyToken: latestConfig['Verify Token'] || 'aureon_secure_token',
                productSheetId: latestConfig['Product Sheet ID'] || '',
                orderSheetId: latestConfig['Order Sheet ID'] || '',
                configSheetId: masterSheetId,
                appsScriptUrl: latestConfig['Apps Script URL'] || ''
            };
            if (global.config.productSheetId) {
                global.products = await fetchSheetData(global.config.productSheetId, 'Products');
            }
            if (global.config.orderSheetId) {
                global.orders = await fetchSheetData(global.config.orderSheetId, 'Orders');
            }
            console.log('🚀 Auto-Activated from Cloud Backup! Products:', global.products.length);
        } else {
            console.log('⚠️ Config Sheet empty. Waiting for App activation.');
        }
    } else {
        console.log('ℹ️ No MASTER_CONFIG_SHEET_ID. Waiting for App activation.');
    }
}

// ==========================================
// 🌐 মোবাইল অ্যাপের REST API এন্ডপয়েন্ট
// ==========================================

app.post('/api/connect', async (req, res) => {
    const { geminiApiKey, metaAccessToken, metaApiVersion, webhookVerifyToken, verifyToken, productSheetId, orderSheetId, configSheetId, appsScriptUrl } = req.body;
    const resolvedVerifyToken = webhookVerifyToken || verifyToken || 'aureon_secure_token';
    const resolvedApiVersion = metaApiVersion || 'v25.0';

    global.config = {
        geminiApiKey,
        metaAccessToken,
        metaApiVersion: resolvedApiVersion,
        verifyToken: resolvedVerifyToken,
        productSheetId,
        orderSheetId,
        configSheetId,
        appsScriptUrl
    };

    await appendSheetData(configSheetId, 'Server Config', {
        'Gemini API Key': geminiApiKey,
        'Meta Access Token': metaAccessToken,
        'Meta API Version': resolvedApiVersion,
        'Verify Token': resolvedVerifyToken,
        'Product Sheet ID': productSheetId,
        'Order Sheet ID': orderSheetId,
        'Apps Script URL': appsScriptUrl,
        'Timestamp': new Date().toISOString()
    });

    global.products = await fetchSheetData(productSheetId, 'Products');
    global.orders = await fetchSheetData(orderSheetId, 'Orders');

    console.log('✅ Activated! Products loaded:', global.products.length);
    res.status(200).json({ status: 'success', message: 'Aureon AI Core Activated!' });
});

app.get('/api/products', (req, res) => {
    res.json({ status: 'success', data: global.products });
});

app.post('/api/products', async (req, res) => {
    const { name, price, description, inStock, stockStatus } = req.body;
    const resolvedStockStatus = typeof inStock === 'boolean'
        ? (inStock ? 'In Stock' : 'Out of Stock')
        : (stockStatus || 'In Stock');

    const newProduct = {
        'Product Name': name,
        'Price': price,
        'Description': description,
        'Stock Status': resolvedStockStatus
    };

    global.products.push(newProduct);
    if (global.config.productSheetId) {
        appendSheetData(global.config.productSheetId, 'Products', newProduct);
    }
    res.status(201).json({ status: 'success', message: 'Product synced instantly!' });
});

app.get('/api/orders', (req, res) => {
    res.json({ status: 'success', data: global.orders });
});

app.post('/api/config', async (req, res) => {
    const { geminiApiKey, metaAccessToken, metaApiVersion, webhookVerifyToken, verifyToken, productSheetId, orderSheetId, configSheetId, appsScriptUrl } = req.body;
    const resolvedVerifyToken = webhookVerifyToken || verifyToken || global.config.verifyToken;

    global.config = {
        ...global.config,
        geminiApiKey: geminiApiKey || global.config.geminiApiKey,
        metaAccessToken: metaAccessToken || global.config.metaAccessToken,
        metaApiVersion: metaApiVersion || global.config.metaApiVersion || 'v25.0',
        verifyToken: resolvedVerifyToken,
        productSheetId: productSheetId || global.config.productSheetId,
        orderSheetId: orderSheetId || global.config.orderSheetId,
        configSheetId: configSheetId || global.config.configSheetId,
        appsScriptUrl: appsScriptUrl || global.config.appsScriptUrl,
    };

    if (global.config.configSheetId) {
        await appendSheetData(global.config.configSheetId, 'Server Config', {
            'Gemini API Key': global.config.geminiApiKey,
            'Meta Access Token': global.config.metaAccessToken,
            'Meta API Version': global.config.metaApiVersion,
            'Verify Token': global.config.verifyToken,
            'Product Sheet ID': global.config.productSheetId,
            'Order Sheet ID': global.config.orderSheetId,
            'Apps Script URL': global.config.appsScriptUrl,
            'Timestamp': new Date().toISOString()
        });
    }

    res.status(200).json({ status: 'success', message: 'Configurations updated successfully!' });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        productsLoaded: global.products.length,
        ordersLoaded: global.orders.length,
        geminiKeySet: !!global.config.geminiApiKey,
        metaTokenSet: !!global.config.metaAccessToken
    });
});

// ==========================================
// ⚙️ Meta Webhook ও Gemini AI চ্যাট ইঞ্জিন
// ==========================================

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === (global.config.verifyToken || 'aureon_secure_token')) {
        console.log('✅ Webhook verified by Meta!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed. Token mismatch.');
        res.sendStatus(403);
    }
});

// Webhook Message Handler (POST)
app.post('/webhook', async (req, res) => {
    // সবার আগে 200 পাঠাও — Meta 20 সেকেন্ডের মধ্যে 200 না পেলে retry করে
    res.sendStatus(200);

    try {
        const body = req.body;
        console.log('📨 Webhook received:', JSON.stringify(body).substring(0, 400));

        // =========================================
        // ✅ Message Parsing (WhatsApp & Facebook)
        // =========================================
        const waValue = body.entry?.[0]?.changes?.[0]?.value;
        const fbMessaging = body.entry?.[0]?.messaging?.[0];
        const recipientPageId = body.entry?.[0]?.id;

        let senderId = null;
        let userMessage = null;
        let isWhatsApp = false;
        let phoneNumberId = null;

        if (waValue && waValue.messages && waValue.messages.length > 0) {
            // WhatsApp Cloud API format
            isWhatsApp = true;
            const waMsg = waValue.messages[0];
            senderId = waMsg.from;
            userMessage = waMsg.text?.body || null;
            phoneNumberId = waValue.metadata?.phone_number_id;
            console.log(`📱 WhatsApp | From: ${senderId} | WNID: ${phoneNumberId} | Msg: ${userMessage}`);

        } else if (fbMessaging && fbMessaging.message) {
            // Facebook Messenger format
            isWhatsApp = false;
            senderId = fbMessaging.sender?.id;
            userMessage = fbMessaging.message?.text || null;
            console.log(`💬 Facebook | Page ID: ${recipientPageId} | From: ${senderId} | Msg: ${userMessage}`);
        }

        // টেক্সট মেসেজ না থাকলে (ছবি/স্টিকার/status update) skip করো
        if (!userMessage || !senderId) {
            console.log('⚠️ No text message or senderId. Skipping.');
            return;
        }

        // Gemini API Key চেক
        const apiKey = global.config.geminiApiKey;
        if (!apiKey) {
            console.log('❌ Gemini API Key not set. Please re-activate from app.');
            return;
        }

        // =========================================
        // 🤖 Gemini AI রিপ্লাই জেনারেট করা
        // =========================================
        const context = global.products.length > 0
            ? JSON.stringify(global.products)
            : 'No products loaded yet.';

        const promptText = `You are Aureon AI, a friendly and professional WhatsApp/Facebook sales assistant.
Use this live product inventory to help customers: ${context}.
If the customer wants to buy, politely collect their: Name, Phone number, and Delivery Address.
Once you have all 3 details, include this exact JSON at the END of your message:
{"ORDER": {"name": "...", "phone": "...", "address": "...", "items": "..."}}
Keep your replies short, friendly, and in the same language the customer uses.
Customer message: ${userMessage}`;

        // Gemini valid model list (Strictly from user verified API key models)
        const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-3.5-flash',
            'gemini-3.6-flash',
            'gemini-flash-latest',
            'gemini-2.5-pro'
        ];
        let aiResponse = null;
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                aiResponse = await axios.post(geminiUrl, {
                    contents: [{ parts: [{ text: promptText }] }]
                });
                if (aiResponse && aiResponse.data) {
                    console.log(`🤖 Using Gemini model: ${modelName}`);
                    break;
                }
            } catch (err) {
                lastError = err;
                console.log(`⚠️ Gemini model ${modelName} failed, trying next model...`);
            }
        }

        if (!aiResponse) {
            throw lastError || new Error('All Gemini models failed.');
        }

        const replyText = aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'আমি কিভাবে সাহায্য করতে পারি?';
        console.log(`🤖 Gemini reply (${replyText.length} chars): ${replyText.substring(0, 120)}...`);

        // =========================================
        // 📤 Meta Graph API দিয়ে রিপ্লাই পাঠানো
        // =========================================
        const metaToken = global.config.metaAccessToken;
        const apiVersion = global.config.metaApiVersion || 'v25.0';
        if (!metaToken) {
            console.log('❌ Meta Access Token not set. Cannot send reply.');
            return;
        }

        if (isWhatsApp && phoneNumberId) {
            // WhatsApp Cloud API
            const sendUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
            await axios.post(sendUrl, {
                messaging_product: 'whatsapp',
                to: senderId,
                type: 'text',
                text: { body: replyText }
            }, {
                headers: { Authorization: `Bearer ${metaToken}` }
            });
            console.log(`✅ WhatsApp reply sent (${apiVersion}) to ${senderId}`);

        } else if (!isWhatsApp) {
            // Facebook Messenger
            const targetEndpoint = recipientPageId ? `${recipientPageId}/messages` : 'me/messages';
            const sendUrl = `https://graph.facebook.com/${apiVersion}/${targetEndpoint}`;
            await axios.post(sendUrl, {
                recipient: { id: senderId },
                message: { text: replyText }
            }, {
                headers: { Authorization: `Bearer ${metaToken}` }
            });
            console.log(`✅ Facebook reply sent via ${targetEndpoint} (${apiVersion}) to ${senderId}`);

        } else {
            console.log('⚠️ WhatsApp message but phone_number_id missing in metadata.');
        }

        // =========================================
        // 🛒 অর্ডার ডিটেকশন ও অটো-সেভ
        // =========================================
        const orderMatch = replyText.match(/\{"ORDER"\s*:\s*\{[\s\S]*?\}\s*\}/);
        if (orderMatch) {
            try {
                const orderObj = JSON.parse(orderMatch[0]).ORDER;
                const newOrder = {
                    'Order ID': `AUR-${Date.now().toString().slice(-6)}`,
                    'Customer Name': orderObj.name || '',
                    'Phone': orderObj.phone || senderId,
                    'Address': orderObj.address || '',
                    'Items': orderObj.items || '',
                    'Status': 'Pending',
                    'Timestamp': new Date().toISOString()
                };
                global.orders.push(newOrder);
                console.log('🛒 New order saved to RAM:', newOrder['Order ID']);

                if (global.config.orderSheetId) {
                    appendSheetData(global.config.orderSheetId, 'Orders', newOrder);
                }
            } catch (parseErr) {
                console.error('❌ Order JSON parse error:', parseErr.message);
            }
        }

    } catch (err) {
        console.error('❌ Webhook error:', err.response?.data || err.message);
    }
});

// ==========================================
// 🔔 Keep-Alive: Render ঘুমিয়ে না পড়ার জন্য
// ==========================================
function startKeepAlive() {
    const selfUrl = process.env.RENDER_EXTERNAL_URL;
    if (!selfUrl) {
        console.log('ℹ️ RENDER_EXTERNAL_URL not set. Keep-alive disabled. (Set it in Render env vars)');
        return;
    }

    // প্রতি ১৪ মিনিটে নিজের /health এ ping করবে
    // Render free tier ১৫ মিনিট idle থাকলে ঘুমায়, তাই ১৪ মিনিটে ping দিলেই জেগে থাকবে
    const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

    setInterval(async () => {
        try {
            const res = await axios.get(`${selfUrl}/health`, { timeout: 10000 });
            console.log(`💓 Keep-alive ping OK — ${new Date().toLocaleTimeString()} | Status: ${res.data.status}`);
        } catch (err) {
            console.error('⚠️ Keep-alive ping failed:', err.message);
        }
    }, PING_INTERVAL_MS);

    console.log(`💓 Keep-alive started! Pinging ${selfUrl}/health every 14 minutes.`);
}

app.listen(PORT, () => {
    console.log(`🌐 Aureon AI Headless Engine online on port ${PORT}`);
    autoBootRecovery();
    startKeepAlive();
});