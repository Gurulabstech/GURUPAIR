const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number?.trim();
    let responseSent = false;
    let sessionCleanedUp = false;

    if (!num) {
        if (!res.headersSent) {
            res.status(400).json({ error: "Missing phone number parameter" });
        }
        return;
    }

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
                console.log(`Session cleaned: ${id}`);
            } catch (cleanupError) {
                console.error("Cleanup failed:", cleanupError.message);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        try {
            const { version } = await fetchLatestBaileysVersion();
            console.log("Using Baileys version:", version);

            const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));

            const Gifted = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            // Wait for pairing request to complete and send REAL code
            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');

                const realRandomCode = generateRandomCode();
                const realPairingCode = await Gifted.requestPairingCode(num, realRandomCode);

                // Send the REAL pairing code to the user/frontend
                if (!responseSent && !res.headersSent) {
                    res.json({ code: realPairingCode });
                    responseSent = true;
                    console.log(`Real pairing code sent: ${realPairingCode}`);
                }
            }

            Gifted.ev.on('creds.update', saveCreds);

            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log(`[SUCCESS] Connected as ${Gifted.user?.id}`);

                    // Removed groupAcceptInvite - this was causing the crash
                    // If you need to join a group later, use a FRESH invite code

                    await delay(8000); // Give time for full connection

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data?.length > 100) {
                                    sessionData = data;
                                    console.log("Session data captured successfully");
                                    break;
                                }
                            }
                            await delay(6000);
                            attempts++;
                        } catch (readError) {
                            console.error("Session read error:", readError.message);
                            await delay(3000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.error("Failed to capture session after max attempts");
                        await cleanUpSession();
                        return;
                    }

                    try {
                        const compressedData = zlib.gzipSync(sessionData);
                        const b64data = compressedData.toString('base64');
                        await delay(4000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                await sendButtons(Gifted, Gifted.user.id, {
                                    title: '',
                                    text: 'GURUHBOT~' + b64data,
                                    footer: `> *Powered by GuruTech*`,
                                    buttons: [
                                        { 
                                            name: 'cta_copy', 
                                            buttonParamsJson: JSON.stringify({ 
                                                display_text: 'Copy Session ID', 
                                                copy_code: 'GURUHBOT~' + b64data 
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
                                                url: 'https://whatsapp.com/channel/0029Vb3hlgX5kg7G0nFggl0Y'
                                            })
                                        }
                                    ]
                                });

                                console.log("Session sent successfully via buttons");
                                sessionSent = true;
                            } catch (sendError) {
                                console.error("Session send attempt failed:", sendError.message);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(4000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            console.error("Failed to send session after max attempts");
                        }

                        await delay(3000);
                        await Gifted.ws.close();
                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError.message);
                    } finally {
                        await cleanUpSession();
                    }
                } 
                else if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log("Connection closed. Status:", statusCode);

                    if (statusCode !== 401) {
                        console.log("Reconnecting in 5 seconds...");
                        await delay(5000);
                        GIFTED_PAIR_CODE(); // Reconnect
                    } else {
                        console.log("Logged out (401) - not reconnecting");
                        await cleanUpSession();
                    }
                }
            });

        } catch (err) {
            console.error("Main pairing error:", err.message);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ error: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError.message);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ error: "Service Error" });
        }
    }
});

module.exports = router;
