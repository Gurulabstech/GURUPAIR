const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = giftedId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (e) {}
            sessionCleanedUp = true;
        }
    }

    async function GURU_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));

        try {
            let GURU = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            GURU.ev.on('creds.update', saveCreds);

            GURU.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                // Show QR immediately when generated
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr, { 
                        margin: 2,
                        color: { dark: '#000000', light: '#ffffff' },
                        width: 300
                    });

                    if (!res.headersSent) {
                        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
    <title>GURUHBOT • QR Login</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            background: #0f0c29;
            background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
            color: #e0e0ff;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        .container {
            max-width: 420px;
            padding: 2.5rem 1.5rem;
        }
        h1 {
            font-size: 2.4rem;
            font-weight: 700;
            margin: 0 0 1rem;
            background: linear-gradient(90deg, #c084fc, #60a5fa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .qr-box {
            background: white;
            border-radius: 16px;
            padding: 1.2rem;
            box-shadow: 0 0 40px rgba(96,165,250,0.4);
            margin: 1.8rem auto;
            width: 280px;
            height: 280px;
        }
        .qr-box img {
            width: 100%;
            height: 100%;
            border-radius: 8px;
        }
        p {
            font-size: 1.1rem;
            margin: 1rem 0 1.5rem;
            color: #d0c4ff;
        }
        .back-btn {
            display: inline-block;
            padding: 0.9rem 2rem;
            background: linear-gradient(90deg, #7c3aed, #60a5fa);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 600;
            box-shadow: 0 6px 20px rgba(124,58,237,0.4);
            transition: all 0.3s;
        }
        .back-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 30px rgba(124,58,237,0.6);
        }
        .pulse {
            animation: pulse 2.5s infinite;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(96,165,250,0.5); }
            70% { box-shadow: 0 0 0 20px rgba(96,165,250,0); }
            100% { box-shadow: 0 0 0 0 rgba(96,165,250,0); }
        }
        @media (max-width: 500px) {
            .qr-box { width: 240px; height: 240px; }
            h1 { font-size: 2rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>GURUHBOT</h1>
        <div class="qr-box pulse">
            <img src="${qrImage}" alt="Scan this QR Code"/>
        </div>
        <p>Scan this QR code with WhatsApp → Linked Devices</p>
        <a href="./" class="back-btn">← Back to Home</a>
    </div>
</body>
</html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    await GURU.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");

                    await delay(10000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(2000);
                            attempts++;
                        } catch (e) {}
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');

                        await sendButtons(GURU, GURU.user.id, {
                            title: '',
                            text: 'GURU~' + b64data,
                            footer: `> *Powered by GuruTech*`,
                            buttons: [
                                { 
                                    name: 'cta_copy', 
                                    buttonParamsJson: JSON.stringify({ 
                                        display_text: 'Copy Session', 
                                        copy_code: 'GURU~' + b64data 
                                    }) 
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'Bot Repository',
                                        url: 'https://github.com/Gurulabstech/GURU-MD'
                                    })
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'Join Channel',
                                        url: 'https://whatsapp.com/channel/0029VbBNUAFFXUuUmJdrkj1f'
                                    })
                                }
                            ]
                        });

                        await delay(2000);
                        await GURU.ws.close();
                    } catch (err) {
                        console.error("Session delivery error:", err);
                    } finally {
                        await cleanUpSession();
                    }
                } 
                else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    GURU_QR_CODE(); // Reconnect
                }
            });
        } catch (err) {
            console.error("Main QR error:", err);
            if (!responseSent) {
                res.status(500).json({ error: "QR Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GURU_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({ error: "Service Error" });
        }
    }
});

module.exports = router;
