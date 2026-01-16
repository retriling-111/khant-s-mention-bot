const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const http = require('http');

// --- CONFIGURATION ---
const TOKEN = '8570903548:AAEGRl-f2lEO74D9Ko3U2ac-2cfhuPI7wSU'; 
const MONGO_URI = 'mongodb+srv://khant_developer:talktokhant@cluster0.huf9nc6.mongodb.net/?retryWrites=true&w=majority'; 
const DB_NAME = 'telegram_bot';

const bot = new Telegraf(TOKEN);
let db, membersColl;

// --- DATABASE CONNECTION ---
async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        membersColl = db.collection('members');
        console.log('✅ Connected to MongoDB Successfully!');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1); 
    }
}

// --- KOYEB HEALTH CHECK SERVER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Bot is alive and running!');
    res.end();
}).listen(process.env.PORT || 8000, () => {
    console.log(`📡 Health Check Server is running on port ${process.env.PORT || 8000}`);
});

// --- ERROR HANDLING ---
bot.catch((err, ctx) => {
    if (err.response && err.response.error_code === 409) {
        console.error('⚠️ Conflict Error: Bot က တခြားတစ်နေရာမှာ ပွင့်နေပါတယ်။');
    } else {
        console.error(`❌ Bot Error (${ctx.updateType}):`, err.message);
    }
});

// --- DATABASE FUNCTIONS ---
const getMembers = async (chatId) => {
    try {
        const group = await membersColl.findOne({ chatId: chatId });
        return group ? group.users : [];
    } catch (err) {
        console.error("💾 Read Error:", err.message);
        return [];
    }
};

const saveMember = async (chatId, user) => {
    if (!user || user.is_bot) return;
    try {
        console.log(`📩 မှတ်သားနေသည်: ${user.first_name} (ID: ${user.id}) in Chat: ${chatId}`);
        await membersColl.updateOne(
            { chatId: chatId },
            { $addToSet: { users: { id: user.id, name: user.first_name } } },
            { upsert: true }
        );
        console.log(`✅ ${user.first_name} ကို Database ထဲ သိမ်းဆည်းပြီးပါပြီ။`);
    } catch (err) {
        console.error("💾 Save Error:", err.message);
    }
};

const removeMember = async (chatId, userId) => {
    try {
        await membersColl.updateOne(
            { chatId: chatId },
            { $pull: { users: { id: userId } } }
        );
        console.log(`🗑️ Removed user ${userId} from group ${chatId}`);
    } catch (err) {
        console.error("💾 Delete Error:", err.message);
    }
};

// --- BOT LOGIC ---

// 1. စာရိုက်သူတိုင်းကို Database ထဲသိမ်းခြင်း
bot.on('message', async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private' && ctx.from) {
        await saveMember(ctx.chat.id, ctx.from);
    }
    return next();
});

// 2. လူထွက်သွားလျှင် စာရင်းမှဖျက်ခြင်း
bot.on('left_chat_member', async (ctx) => {
    try {
        const userId = ctx.message.left_chat_member.id;
        const chatId = ctx.chat.id;
        await removeMember(chatId, userId);
    } catch (err) {
        console.error("Cleanup Error:", err.message);
    }
});

bot.start((ctx) => ctx.reply('✅ Mention Bot is Online!\n\n🔹 Database: MongoDB Connected\n🔹 Cleanup: Active\n\nGroup ထဲမှာ /all , @all , .all [စာသား] လို့ရိုက်ပြီး သုံးနိုင်ပါတယ်။'));

// 3. Mention Commands
bot.hears([/^\/all/, /^@all/, /^\.all/], async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('❌ ဤ Command သည် Group များတွင်သာ အလုပ်လုပ်ပါသည်။');

    try {
        const chatId = ctx.chat.id;
        const userMessage = ctx.message.text.replace(/^(\/all|@all|\.all)/i, '').trim();
        
        const learnedMembers = await getMembers(chatId);
        const admins = await ctx.getChatAdministrators();
        
        let fullList = [...learnedMembers];
        admins.forEach(admin => {
            if (!admin.user.is_bot && !fullList.some(m => m.id === admin.user.id)) {
                fullList.push({ id: admin.user.id, name: admin.user.first_name });
            }
        });

        if (fullList.length === 0) {
            return ctx.reply("စာရင်းထဲမှာ ဘယ်သူမှ မရှိသေးပါဘူး။ လူတွေကို စာအရင်ပို့ခိုင်းပါ။");
        }

        let header = `📢 **Attention Everyone!**\n`;
        if (userMessage) header += `📝 ${userMessage}\n\n`;

        for (let i = 0; i < fullList.length; i += 5) {
            const chunk = fullList.slice(i, i + 5);
            const mentionString = chunk
                .map(u => `[${u.name}](tg://user?id=${u.id})`)
                .join(' ');
            
            const textToSend = (i === 0) ? (header + mentionString) : mentionString;
            
            await ctx.replyWithMarkdown(textToSend).catch(e => {
                ctx.reply(textToSend.replace(/[\[\]()]/g, ''));
            });
        }

    } catch (err) {
        console.error("⚠️ Command Error:", err.message);
        ctx.reply("⚠️ Bot ကို Admin ပေးထားရန် လိုအပ်ပါသည်။");
    }
});

// --- LAUNCH ---
connectDB().then(() => {
    bot.launch()
        .then(() => console.log('🚀 Telegram Bot is connected and ready!'))
        .catch((err) => {
            if (err.message.includes('409')) {
                console.error('❌ Launch Failed: တခြားနေရာမှာ Bot ပွင့်နေလို့ Conflict ဖြစ်နေပါတယ်။ Laptop က Bot ကို ပိတ်လိုက်ပါ။');
            } else {
                console.error('❌ Launch Failed:', err.message);
            }
        });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
