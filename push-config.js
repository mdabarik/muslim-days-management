// পাবলিক তথ্য — কোনো গোপন key নেই, GitHub-এ রাখা নিরাপদ।
// Firebase key আর admin পাসওয়ার্ড থাকে Cloudflare Worker-এর Secrets-এ।
self.PUSH_CONFIG = {
  workerUrl: "https://push-notify.muslim-days.workers.dev",
};
