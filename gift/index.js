const fs = require('fs');

function giftedId(num = 4) {
  let result = "";
  let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var characters9 = characters.length;
  for (var i = 0; i < num; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters9));
  }
  return result;
}

function generateRandomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    await fs.promises.rm(FilePath, { recursive: true, force: true });
    return true;
}

// Add the sendButtons function
async function sendButtons(sock, jid, options) {
    try {
        const buttons = [];
        
        for (let btn of options.buttons) {
            if (btn.name === 'cta_copy') {
                const params = JSON.parse(btn.buttonParamsJson);
                buttons.push({
                    buttonId: `copy_${Date.now()}`,
                    buttonText: { displayText: params.display_text },
                    type: 1
                });
            } else if (btn.name === 'cta_url') {
                const params = JSON.parse(btn.buttonParamsJson);
                buttons.push({
                    buttonId: `url_${Date.now()}`,
                    buttonText: { displayText: params.display_text },
                    type: 1
                });
            }
        }
        
        // Send the button message
        await sock.sendMessage(jid, {
            text: options.text,
            buttons: buttons,
            footer: options.footer || 'Powered by GuruTech'
        });
        
        // For URL buttons, also send clickable links as text (backup)
        for (let btn of options.buttons) {
            if (btn.name === 'cta_url') {
                const params = JSON.parse(btn.buttonParamsJson);
                await sock.sendMessage(jid, {
                    text: `🔗 ${params.display_text}: ${params.url}`
                });
            }
        }
        
        return true;
    } catch (error) {
        console.error('Send buttons error:', error);
        // Fallback: send as plain text
        await sock.sendMessage(jid, { 
            text: `${options.text}\n\n${options.buttons.map(b => {
                const params = JSON.parse(b.buttonParamsJson);
                return `${params.display_text}: ${b.name === 'cta_url' ? params.url : 'Copy: ' + params.copy_code}`;
            }).join('\n')}`
        });
        return false;
    }
}

module.exports = { giftedId, removeFile, generateRandomCode, sendButtons };
