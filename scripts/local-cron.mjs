const CRON_SECRET = "uptime-monitor-cron-secret-2024";
const URL = "http://localhost:3001/api/cron/check-monitors";

async function runCheck() {
  console.log(`[${new Date().toISOString()}] Triggering monitor check...`);
  try {
    const res = await fetch(URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });

    if (res.ok) {
      const data = await res.json();
      console.log("✅ Check successful:", data);
    } else {
      console.error("❌ Check failed:", res.status, res.statusText);
      const text = await res.text();
      console.error(text);
    }
  } catch (err) {
    console.error("❌ Network error:", err.message);
  }
}

// Run immediately
runCheck();

// Loop every 30 seconds
setInterval(runCheck, 30000);
console.log("🔄 Local cron started. Running checks every 30 seconds...");
