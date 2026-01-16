const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const http = require('http');

// --- CONFIGURATION ---
const TOKEN = '8570903548:AAEGRl-f2lEO74D9Ko3U2ac-2cfhuPI7wSU'; 
// MongoDB URI ကို တည်ငြိမ်တဲ့ parameter များနဲ့ အစားထိုးထားပါတယ်
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
        // Database မချိတ်မိဘဲ Bot ကို ဆက်မပွင့်စေရန်
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
    console.error(`❌ Bot Error (${ctx.updateType}):`, err.message);
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
        // လူသစ်ဆိုရင် $addToSet က ထပ်မတိုးအောင် တားပေးပါတယ်
        // $each ကိုသုံးပြီး Object ပုံစံတူရင် ထပ်မဝင်အောင် လုပ်ထားပါတယ်
        await membersColl.updateOne(
            { chatId: chatId },
            { $addToSet: { users: { id: user.id, name: user.first_name } } },
            { upsert: true }
        );
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

// 1. စာရိုက်တဲ့သူတိုင်းကို မှတ်သားခြင်း
bot.on('message', async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private' && ctx.from) {
        await saveMember(ctx.chat.id, ctx.from);
    }
    return next();
});

// 2. Automatic Cleanup (လူထွက်သွားရင် စာရင်းမှဖျက်ခြင်း)
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
        // Trigger ကိုဖယ်ပြီး message ယူခြင်း
        const userMessage = ctx.message.text.replace(/^(\/all|@all|\.all)/i, '').trim();
        
        const learnedMembers = await getMembers(chatId);
        const admins = await ctx.getChatAdministrators();
        
        // Admin များနှင့် Member စာရင်းကို Unique ဖြစ်အောင် ပေါင်းခြင်း
        let fullList = [...learnedMembers];
        admins.forEach(admin => {
            if (!admin.user.is_bot && !fullList.some(m => m.id === admin.user.id)) {
                fullList.push({ id: admin.user.id, name: admin.user.first_name });
            }
        });

        if (fullList.length === 0) {
            return ctx.reply("I haven't learned any members yet. စာအရင်ပို့ခိုင်းပါ။");
        }

        let header = `📢 **Attention Everyone!**\n`;
        if (userMessage) header += `📝 ${userMessage}\n\n`;

        // တစ်ခါပို့ရင် ၅ ယောက်နှုန်းခွဲပို့ခြင်း
        for (let i = 0; i < fullList.length; i += 5) {
            const chunk = fullList.slice(i, i + 5);
            const mentionString = chunk
                .map(u => `[${u.name}](tg://user?id=${u.id})`)
                .join(' ');
            
            const textToSend = (i === 0) ? (header + mentionString) : mentionString;
            
            // စာသားပို့ရာတွင် markdown အမှားမတက်စေရန် catch ခံထားပါတယ်
            await ctx.replyWithMarkdown(textToSend).catch(e => {
                console.error("Markdown Error:", e.message);
                ctx.reply(textToSend.replace(/[\[\]()]/g, '')); // markdown မရရင် plain text နဲ့ပို့
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
        .catch((err) => console.error('❌ Launch Failed:', err.message));
});

// ပုံမှန်အတိုင်း ပိတ်နိုင်အောင် လုပ်ခြင်း
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
