# Muslim Days · Push Notifications

Muslim Days অ্যাপে নোটিফিকেশন পাঠানোর admin পেজ।

- **পেজ:** https://mdabarik.github.io/push-notifications/
- **Worker:** https://push-notify.muslim-days.workers.dev

```
index.html        admin পেজ (GitHub Pages)
push-config.js    Worker-এর লিংক (পাবলিক)
worker/           Cloudflare Worker-এর কোড
```

## কীভাবে কাজ করে

```
admin পেজ → Cloudflare Worker (key আর পাসওয়ার্ড এখানে লুকানো) → Firebase → ফোন
```

- ট্যাব: 🔔 Notification · ⏰ Reminder · 💬 Feedback (WhatsApp / Email) · ❓ Quiz। যে ট্যাবে আছেন সেটাই `type` হিসেবে যায়।
- প্রতিটা ট্যাবে দুই মোড: **ঘর পূরণ করে** (Worker নিজেই JSON বানিয়ে রাখে) বা **নিজের JSON লিংক** (পাঠানোর আগে গাইডের ফরম্যাটে যাচাই হয়)।
- **ডিবাগ ফোনে (টেস্ট):** শুধু debug build (`flutter run`) চালানো ফোনে যায় — `debug` topic। **সব ইউজারকে:** `all` topic।
- Firebase-এ পাঠানো custom data: `json_url`, `type`, `full_screen`, `return_on_close`। (`message_type` নাম Firebase নেয় না।)

## গোপন জিনিস কোথায়

GitHub-এ কোনো গোপন কিছু নেই। Cloudflare → Workers → `push-notify` → Settings → Variables and Secrets:

| নাম | ধরন | কী |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Firebase service account-এর পুরো JSON |
| `ADMIN_PASSWORD` | Secret | admin পেজের পাসওয়ার্ড |
| `NOTIFY_KV` | KV binding | `push-notify-kv` — template আর বানানো JSON |

## Worker-এর কোড বদলালে

Cloudflare → `push-notify` → **Edit code** → সব মুছে `worker/worker.js` পেস্ট → **Deploy**।
অথবা `worker/` ফোল্ডারে: `npx wrangler deploy`।
