const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const http = require('http');

// --- CONFIGURATION ---
const TOKEN = '8570903548:AAGWvfShwxjS0_QfNQoJ5dhFnKKdcMzgrEM'; 
const DATA_FILE = './members.json';
const bot = new Telegraf(TOKEN);

// Database file (JSON) စစ်ဆေးခြင်း
if (!fs.existsSync(DATA_FILE)) {
    fs.writeJsonSync(DATA_FILE, {});
}

// --- KOYEB HEALTH CHECK SERVER ---
// Koyeb က Bot ကို ပိတ်မချအောင် Port 8000 (သို့မဟုတ် assigned port) မှာ နားထောင်ပေးခြင်း
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot is alive and running!');
    res.end();
}).listen(process.env.PORT || 8000, () => {
    console.log(`📡 Health Check Server is running on port ${process.env.PORT || 8000}`);
});

// --- ERROR HANDLING ---
bot.catch((err, ctx) => {
    console.error(`❌ Bot Error (${ctx.updateType}):`, err.message);
});

// --- DATABASE FUNCTIONS ---
const getMembers = async (chatId) => {
    try {
        const data = await fs.readJson(DATA_FILE);
        return data[chatId] || [];
    } catch (err) {
        return [];
    }
};

const saveMember = async (chatId, user) => {
    try {
        const data = await fs.readJson(DATA_FILE);
        if (!data[chatId]) data[chatId] = [];
        
        const exists = data[chatId].find(m => m.id === user.id);
        if (!exists && !user.is_bot) {
            data[chatId].push({ id: user.id, name: user.first_name });
            await fs.writeJson(DATA_FILE, data);
        }
    } catch (err) {
        console.error("💾 Save Error:", err.message);
    }
};

// --- BOT LOGIC ---

// 1. စာရိုက်တဲ့သူတွေကို မှတ်သားခြင်း
bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private' && ctx.from) {
        await saveMember(ctx.chat.id, ctx.from);
    }
    return next();
});

bot.start((ctx) => ctx.reply('✅ Mention Bot is Online!\nGroup ထဲမှာ /all [စာသား] လို့ ရိုက်ပြီး သုံးနိုင်ပါတယ်။'));

// 2. Mention / All Command
bot.hears([/^\/all/, /^@all/], async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('❌ ဤ Command သည် Group များတွင်သာ အလုပ်လုပ်ပါသည်။');

    try {
        const chatId = ctx.chat.id;
        const userMessage = ctx.message.text.replace(/\/all|@all/i, '').trim();
        
        const learnedMembers = await getMembers(chatId);
        const admins = await ctx.getChatAdministrators();
        
        // Admin နှင့် Member စာရင်း ပေါင်းစည်းခြင်း
        let fullList = [...learnedMembers];
        admins.forEach(admin => {
            if (!admin.user.is_bot && !fullList.some(m => m.id === admin.user.id)) {
                fullList.push({ id: admin.user.id, name: admin.user.first_name });
            }
        });

        if (fullList.length === 0) {
            return ctx.reply("I haven't learned any members yet. လူတွေကို စာအရင်ပို့ခိုင်းပါ။");
        }

        let header = `📢 **Attention Everyone!**\n`;
        if (userMessage) header += `📝 ${userMessage}\n\n`;

        // ၅ ယောက်တစ်တွဲစီ Tag ခေါ်ခြင်း
        for (let i = 0; i < fullList.length; i += 5) {
            const chunk = fullList.slice(i, i + 5);
            const mentionString = chunk
                .map(u => `[${u.name}](tg://user?id=${u.id})`)
                .join(' ');
            
            const textToSend = (i === 0) ? (header + mentionString) : mentionString;
            await ctx.replyWithMarkdown(textToSend);
        }

    } catch (err) {
        console.error("⚠️ Command Error:", err.message);
        ctx.reply("⚠️ Error: Bot ကို Admin ပေးထားဖို့ လိုအပ်ပါတယ်။");
    }
});

// --- LAUNCH ---
bot.launch()
    .then(() => console.log('🚀 Telegram Bot is connected!'))
    .catch((err) => {
        console.error('❌ Launch Failed:', err.message);
    });

// ပုံမှန်အတိုင်း ပိတ်နိုင်အောင် လုပ်ခြင်း
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));