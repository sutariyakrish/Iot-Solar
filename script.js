/**
 * ============================================================
 *  SolarWatch — IoT Solar Monitoring Dashboard
 *  script.js  |  ES Module  |  Firebase Realtime DB
 * ============================================================
 *
 *  DATA FLOW EXPLAINED:
 *  ┌──────────────┐      WiFi / HTTP      ┌──────────────────────┐
 *  │  ESP32 + INA │ ─────────────────────▶│ Firebase Realtime DB │
 *  │  DHT22 / LDR │    writes to /data    │  (asia-southeast1)   │
 *  └──────────────┘                       └──────────┬───────────┘
 *                                                    │ onValue() listener
 *                                                    ▼
 *                                         ┌─────────────────────┐
 *                                         │  This Dashboard UI  │
 *                                         │  updates instantly  │
 *                                         └─────────────────────┘
 *
 *  The ESP32 reads sensors → serializes to JSON → sends via
 *  Firebase REST / SDK to the "/data" path.
 *  onValue() fires every time the data node changes, pushing
 *  the payload here without any page refresh.
 * ============================================================
 */

// ── Firebase SDK (modular v9+) ────────────────────────────────
import { initializeApp }            from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ── Firebase Project Config ───────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyA5gLC-pfaqW-ZCOWVjXacLJnHbFWA-EIY",
  authDomain:        "iot-solar-8427f.firebaseapp.com",
  databaseURL:       "https://iot-solar-8427f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "iot-solar-8427f",
  storageBucket:     "iot-solar-8427f.firebasestorage.app",
  messagingSenderId: "586508786786",
  appId:             "1:586508786786:web:eec3ee7ce8d534089d853b"
};

// ── Initialize Firebase ───────────────────────────────────────
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── Chart History (last 20 readings) ─────────────────────────
const MAX_POINTS = 20;
const history = { labels: [], power: [], voltage: [], temp: [] };

// ── Chart Defaults (dark theme) ───────────────────────────────
Chart.defaults.color = "#64748b";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
Chart.defaults.font.family = "'Inter', sans-serif";

/** Creates a gradient line chart */
function makeChart(canvasId, label, color, unit) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, color + "40");
  gradient.addColorStop(1, color + "00");

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: color,
        pointBorderColor: "#0a0f1a",
        pointBorderWidth: 2,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.95)",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          titleColor: "#94a3b8",
          bodyColor: "#e2e8f0",
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)} ${unit}` }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { maxTicksLimit: 6, font: { size: 10 } }
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { font: { size: 10 }, callback: v => v + " " + unit }
        }
      }
    }
  });
}

// ── Build all three charts ────────────────────────────────────
const charts = {
  power:   makeChart("ch-power",   "Power (W)",       "#fbbf24", "W"),
  voltage: makeChart("ch-voltage", "Voltage (V)",     "#60a5fa", "V"),
  temp:    makeChart("ch-temp",    "Temperature (°C)","#f87171", "°C")
};

/** Push a new data point to chart history & update chart */
function pushChartData(time, power, voltage, temp) {
  const label = time || new Date().toLocaleTimeString("en-GB", { hour12: false });

  history.labels.push(label);
  history.power.push(power);
  history.voltage.push(voltage);
  history.temp.push(temp);

  // Keep only last MAX_POINTS
  if (history.labels.length > MAX_POINTS) {
    history.labels.shift();
    history.power.shift();
    history.voltage.shift();
    history.temp.shift();
  }

  const update = (chart, key) => {
    chart.data.labels        = [...history.labels];
    chart.data.datasets[0].data = [...history[key]];
    chart.update("active");
  };
  update(charts.power,   "power");
  update(charts.voltage, "voltage");
  update(charts.temp,    "temp");
}

// ── Alert System ──────────────────────────────────────────────
let alertCount = 0;
const alertsList = document.getElementById("alerts-list");
const alertCountEl = document.getElementById("alert-count");

/**
 * @param {"info"|"warn"|"crit"} level
 * @param {string} icon   emoji
 * @param {string} text   message
 */
function addAlert(level, icon, text) {
  alertCount++;
  alertCountEl.textContent = alertCount;

  const el = document.createElement("div");
  el.className = `alert-row ${level}`;
  const iconColor = level === "crit" ? "#f87171" : level === "warn" ? "#facc15" : "#4ade80";
  el.innerHTML = `<span style="color:${iconColor};flex-shrink:0">${icon}</span><span style="color:#cbd5e1">${text}</span>`;

  alertsList.prepend(el);

  // Keep max 30 alerts in DOM
  while (alertsList.children.length > 30) alertsList.removeChild(alertsList.lastChild);
}

// ── Helper: classify a metric value and return badge class + text ──
function classify(val, warn, crit, unit, metricName, highBad = true) {
  if (highBad) {
    if (val >= crit) return ["badge-red",    `🔴 Critical (${val}${unit})`];
    if (val >= warn) return ["badge-yellow", `🟡 Warning (${val}${unit})`];
    return               ["badge-green",   `🟢 Normal (${val}${unit})`];
  } else {
    // Low value = bad  (e.g. efficiency)
    if (val <= crit) return ["badge-red",    `🔴 Low (${val}${unit})`];
    if (val <= warn) return ["badge-yellow", `🟡 Fair (${val}${unit})`];
    return               ["badge-green",   `🟢 Good (${val}${unit})`];
  }
}

/** Set the badge class on an element */
function setBadge(id, cls, text) {
  const el = document.getElementById(id);
  el.className = `badge ${cls}`;
  el.textContent = text;
}

/** Set the progress bar width (0–100) with dynamic color */
function setBar(id, pct, color) {
  const el = document.getElementById(id);
  el.style.width   = Math.min(pct, 100) + "%";
  el.style.background = color;
}

/** Update the SVG efficiency gauge */
function setGauge(pct) {
  const circ = 2 * Math.PI * 65; // ≈ 408.41
  const offset = circ - (circ * Math.min(pct, 100)) / 100;
  const arc = document.getElementById("eff-arc");
  arc.style.strokeDashoffset = offset;
  arc.style.stroke = pct >= 70 ? "#4ade80" : pct >= 40 ? "#facc15" : "#f87171";
}

// ── Track previous alert states to avoid spam ─────────────────
const prevAlerts = { dust: false, obstacle: false, efficiency: false, temp: false };

// ── Main UI Update ────────────────────────────────────────────
function updateUI(data) {
  const {
    voltage = 0, current = 0, power = 0,
    temperature = 0, humidity = 0, light = 0,
    efficiency = 0, dustStatus = "Clean",
    obstacleStatus = "No", timestamp = null
  } = data;

  /* ── Timestamp ── */
  const timeStr = timestamp
    ? new Date(timestamp * 1000).toLocaleTimeString("en-GB", { hour12: false })
    : new Date().toLocaleTimeString("en-GB", { hour12: false });

  document.getElementById("last-update").textContent = timeStr;
  document.getElementById("ts-box").style.display = "flex";

  /* ── Voltage card ── */
  document.getElementById("val-voltage").textContent = voltage.toFixed(2);
  const [vCls, vTxt] = classify(voltage, 14, 16, "V", "Voltage");
  setBadge("st-voltage", vCls, vTxt);
  setBar("bar-voltage", (voltage / 20) * 100, "#60a5fa");

  /* ── Current card ── */
  document.getElementById("val-current").textContent = current.toFixed(2);
  const [aCls, aTxt] = classify(current, 2, 3, "A", "Current");
  setBadge("st-current", aCls, aTxt);
  setBar("bar-current", (current / 5) * 100, "#c084fc");

  /* ── Power card ── */
  document.getElementById("val-power").textContent = power.toFixed(1);
  const [pCls, pTxt] = classify(power, 30, 50, "W", "Power");
  setBadge("st-power", pCls, pTxt);
  setBar("bar-power", (power / 60) * 100, "#fbbf24");

  /* ── Temperature card ── */
  document.getElementById("val-temp").textContent = temperature.toFixed(1);
  const [tCls, tTxt] = classify(temperature, 40, 55, "°C", "Temp");
  setBadge("st-temp", tCls, tTxt);
  setBar("bar-temp", (temperature / 70) * 100, "#f87171");

  // High-temp alert
  if (temperature >= 55 && !prevAlerts.temp) {
    addAlert("crit", "🔥", `Critical temperature: ${temperature}°C — Check panel cooling!`);
    prevAlerts.temp = true;
  } else if (temperature < 55) { prevAlerts.temp = false; }

  /* ── Humidity card ── */
  document.getElementById("val-hum").textContent = humidity.toFixed(1);
  const [hCls, hTxt] = classify(humidity, 70, 85, "%", "Humidity");
  setBadge("st-hum", hCls, hTxt);
  setBar("bar-hum", humidity, "#22d3ee");

  /* ── Light card ── */
  document.getElementById("val-light").textContent = Math.round(light);
  const lightPct = (light / 1200) * 100;
  const lCls = light < 300 ? "badge-red" : light < 600 ? "badge-yellow" : "badge-green";
  const lTxt = light < 300 ? "🔴 Low Light" : light < 600 ? "🟡 Moderate" : "🟢 Bright";
  setBadge("st-light", lCls, lTxt);
  setBar("bar-light", lightPct, "#facc15");

  /* ── Dust Status ── */
  const isDusty = dustStatus && dustStatus.toLowerCase() !== "clean" && dustStatus.toLowerCase() !== "no";
  document.getElementById("st-dust").className = `badge ${isDusty ? "badge-red" : "badge-green"}`;
  document.getElementById("st-dust").textContent = isDusty ? `⚠️ ${dustStatus}` : "✅ Clean";
  document.getElementById("icon-dust").textContent = isDusty ? "🌫️" : "🌿";
  if (isDusty && !prevAlerts.dust) {
    addAlert("warn", "🌫️", `Dust detected on panel! Clean required. (Status: ${dustStatus})`);
    prevAlerts.dust = true;
  } else if (!isDusty) { prevAlerts.dust = false; }

  /* ── Obstacle Status ── */
  const hasObstacle = obstacleStatus && obstacleStatus.toLowerCase() !== "no" && obstacleStatus.toLowerCase() !== "clear";
  document.getElementById("st-obstacle").className = `badge ${hasObstacle ? "badge-red" : "badge-green"}`;
  document.getElementById("st-obstacle").textContent = hasObstacle ? `🚧 ${obstacleStatus}` : "🛣️ Clear";
  document.getElementById("icon-obstacle").textContent = hasObstacle ? "⛔" : "✅";
  if (hasObstacle && !prevAlerts.obstacle) {
    addAlert("crit", "🚧", `Obstacle detected near panel! (Status: ${obstacleStatus})`);
    prevAlerts.obstacle = true;
  } else if (!hasObstacle) { prevAlerts.obstacle = false; }

  /* ── Efficiency gauge ── */
  document.getElementById("val-eff").textContent = efficiency.toFixed(1);
  setGauge(efficiency);
  const [eCls, eTxt] = classify(efficiency, 60, 40, "%", "Efficiency", false);
  setBadge("st-eff", eCls, eTxt);
  if (efficiency < 40 && !prevAlerts.efficiency) {
    addAlert("crit", "📉", `Efficiency drop: ${efficiency}% — Possible shading or dust!`);
    prevAlerts.efficiency = true;
  } else if (efficiency >= 40) { prevAlerts.efficiency = false; }

  /* ── Push to charts ── */
  pushChartData(timeStr, power, voltage, temperature);
}

// ── Connection State UI ───────────────────────────────────────
function setConnected(ok) {
  const badge = document.getElementById("conn-badge");
  badge.className = `badge ${ok ? "badge-green" : "badge-red"}`;
  badge.textContent = ok ? "✅ Connected" : "❌ Disconnected";

  const overlay = document.getElementById("overlay");
  if (ok) overlay.classList.add("hidden");
}

// ── Firebase Real-time Listener ───────────────────────────────
/**
 *  onValue() attaches a persistent listener to the "/data" node.
 *  Every time the ESP32 writes new sensor values to Firebase,
 *  this callback fires automatically — no polling, no refresh.
 */
const dataRef = ref(db, "data");

onValue(
  dataRef,
  (snapshot) => {
    setConnected(true);
    const data = snapshot.val();
    if (!data) {
      addAlert("warn", "⚠️", "No data found at /data. Is the ESP32 running?");
      return;
    }
    updateUI(data);
  },
  (error) => {
    // Firebase triggers this if connection is lost or rules block access
    setConnected(false);
    addAlert("crit", "❌", `Firebase error: ${error.message}`);
    console.error("[Firebase] onValue error:", error);
  }
);

// ── Initial console info ──────────────────────────────────────
console.log("%c☀️ SolarWatch Dashboard", "color:#fbbf24;font-size:1.2rem;font-weight:bold");
console.log("%cListening to Firebase /data …", "color:#4ade80;font-size:.9rem");
