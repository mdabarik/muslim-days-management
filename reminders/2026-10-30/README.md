# জুমার রিমাইন্ডার — ৩০ অক্টোবর ২০২৬

তারিখ: 2026-10-30 (শুক্রবার), Asia/Dhaka। এটি কনটেন্টের তারিখ; কোনো নোটিফিকেশন পাঠানো বা শিডিউল করা হয়নি।

## প্রকাশিত ফাইল

- JSON: https://mdabarik.github.io/muslim-days-management/reminders/2026-10-30/jummah-kahf-v2.json
- ছবি: https://mdabarik.github.io/muslim-days-management/reminders/2026-10-30/jummah-kahf-v2.jpg
- সূরা কাহফ: https://quran.com/bn/al-kahf

## পাঠানোর সময়

Admin পেজে Reminder → নিজের JSON লিংক বেছে JSON URL দিন।

Firebase Console ব্যবহার করলে:
- Notification title: জুমার স্মরণ: সূরা কাহফ পড়ুন
- Notification text: আজ সূরা কাহফ পড়ুন, বেশি বেশি দরুদ ও দোয়া করুন।
- Notification image: https://mdabarik.github.io/muslim-days-management/reminders/2026-10-30/jummah-kahf-v2.jpg
- Custom data `json_url`: https://mdabarik.github.io/muslim-days-management/reminders/2026-10-30/jummah-kahf-v2.json
- Custom data `type`: `reminder`
- Custom data `full_screen`: `false`
- Custom data `return_on_close`: `false`
- Android notification channel: খালি রাখুন।

গাইড: https://mdabarik.github.io/muslim-days-management/guide.html#t2

বাংলা ও ইংরেজি লেখা JSON-এ আছে। ছবির লেখা বাংলা। ধর্মীয় দাবির সূত্র JSON-এর বিবরণে দেওয়া আছে। সূরা কাহফের দোয়াটি জুমার জন্য নির্দিষ্ট বলে দাবি করা হয়নি।

## ছবি

Built-in image_gen দিয়ে আগের ডিজাইনকে ১৬:৯ লেআউটে সাজানো হয়েছে। চূড়ান্ত JPEG ঠিক 1280×720 পিক্সেল, ১ MB-এর কম। ব্যবহৃত সম্পূর্ণ প্রম্পট: [image-prompt-v2.txt](image-prompt-v2.txt)।

আগের বর্গাকার ছবি ও JSON ইতিহাসের জন্য রাখা আছে। নতুন রিমাইন্ডারে v2 URL ব্যবহার করুন: গাইড অনুযায়ী অ্যাপ একই JSON URL একবারই ডাউনলোড করে। ফোনে অ্যাপের ভেতরের রেন্ডারিং এখনো পরীক্ষা করা হয়নি।
