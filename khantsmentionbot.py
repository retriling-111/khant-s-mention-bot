import asyncio
from pyrogram import Client, filters
from pyrogram.enums import ChatMemberStatus

# --- Credentials ---
# Note: Keeping these for your specific bot. Replace if you get new ones.
API_ID = 26569209 
API_HASH = "827e8574169542718e00947610664406"
BOT_TOKEN = "8570903548:AAEgbYU715iG1wJR4KhCYxzgYOxXovwgggc".replace(" ", "")

app = Client("my_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)

@app.on_message(filters.command("start") & filters.private)
async def start(client, message):
    await message.reply_text(
        "<b>Hello!</b>\n\nI am a Mention Bot. Add me to your group and "
        "make me an admin to tag all members.\n\n"
        "<b>Command:</b> /all [your message]"
    )

@app.on_message(filters.command(["all", "mention"]) & filters.group)
async def tag_all(client, message):
    # Check if user is admin before allowing them to use /all
    user_status = await client.get_chat_member(message.chat.id, message.from_user.id)
    if user_status.status not in [ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER]:
        return await message.reply_text("Only admins can use this command!")

    # Extract custom message if any (e.g., /all wake up guys)
    text_to_show = message.text.split(None, 1)[1] if len(message.command) > 1 else "Attention everyone!"

    # Get all members
    members = []
    async for member in client.get_chat_members(message.chat.id):
        if not member.user.is_bot and not member.user.is_deleted:
            members.append(member.user.mention)

    if not members:
        return await message.reply_text("I couldn't find any members to mention.")

    status_msg = await message.reply_text(f"🚀 Found {len(members)} members. Starting mention...")

    # Tagging in batches of 5 to prevent Telegram Flood Limits (Spam protection)
    for i in range(0, len(members), 5):
        output = f"📣 {text_to_show}\n\n" + " ".join(members[i:i+5])
        await client.send_message(message.chat.id, output)
        await asyncio.sleep(1.5) # Slight delay to keep your bot safe

    await status_msg.edit_text("✅ All members have been mentioned successfully!")

print("Checking... Bot is now running on your MacBook.")
app.run()