# Muslim Days Management

Muslim Days টিমের টিকেট আর পুশ নোটিফিকেশন — এক জায়গা থেকে।

**হোম:** https://mdabarik.github.io/push-notifications/

| কার্ড | কী আছে |
|---|---|
| 📋 Ticket Management | Trello বোর্ড |
| 🔔 Notification System | Sent · Pending · Send New Notification |

## ফাইল

```
index.html           হোম পেজ (দুটো কার্ড)
notifications.html   Sent / Pending তালিকা
send.html            নতুন নোটিফিকেশন পাঠানোর admin পেজ
guide.html           পুশ গাইড
push-config.js       Worker-এর লিংক (পাবলিক)
worker/              Cloudflare Worker (push-notify)
reminders/           রিমাইন্ডারের JSON আর ছবি
```

## কীভাবে কাজ করে

```
send.html → Cloudflare Worker → Firebase → ফোন
```

- **ধরন (ট্যাব):** Notification · Reminder · Feedback · Quiz। ট্যাবটাই `type` হিসেবে যায়।
- **কাকে:** ডিবাগ ফোন (`debug` topic, টেস্টের জন্য) বা সব ইউজার।
- **Sent:** সব ইউজারকে পাঠানো নোটিফিকেশন ৬০ দিন থাকে, Worker-এর `/inbox` থেকে আসে।
- **Pending:** schedule করার ব্যবস্থা এখনো নেই, তাই এখন খালি।
- **Firebase label:** `muslim-days-<ধরন>-<তারিখ>` (ডিবাগে `muslim-days-debug-…`)। Firebase → Messaging → Reports-এ ফিল্টার করুন।

বিস্তারিত: [guide.html](https://mdabarik.github.io/push-notifications/guide.html)

## গোপন জিনিস

GitHub-এ কিছু নেই। সব Cloudflare → Workers → `push-notify` → Settings-এ:

| নাম | ধরন | কী |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Firebase service account JSON |
| `ADMIN_PASSWORD` | Secret | admin পেজের পাসওয়ার্ড |
| `NOTIFY_KV` | KV | template, কনটেন্ট আর inbox |

## Worker আপডেট

```bash
cd worker && npx wrangler deploy
```

টেস্ট: `npm test`
