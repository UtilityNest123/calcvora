/* ==========================================================================
   Calcvora Tool 2: Off-Grid & Hybrid Solar + Battery Bank ROI Simulator
   ========================================================================== */
(function () {
  "use strict";

  let roiChartInstance = null;
  let loadChartInstance = null;
  let lastSolarSummary = {};
  let lastCsvRows = [];

  const INITIAL_LOADS = [
    { name: "1.5 Ton Inverter AC", watts: 1400, qty: 1, hours: 5 },
    { name: "Inverter Refrigerator", watts: 150, qty: 1, hours: 14 },
    { name: "Ceiling Fan", watts: 75, qty: 3, hours: 10 },
    { name: "LED Lights & Router", watts: 20, qty: 5, hours: 8 },
  ];

  function addLoadRow(name = "Custom Appliance", watts = 100, qty = 1, hours = 4) {
    const tbody = document.getElementById("load-tbody");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="ld-name" value="${name}" aria-label="Appliance name" /></td>
      <td><input type="number" class="ld-watts" min="1" max="50000" value="${watts}" aria-label="Watts" /></td>
      <td><input type="number" class="ld-qty" min="1" max="100" value="${qty}" aria-label="Quantity" /></td>
      <td><input type="number" class="ld-hours" min="0.1" max="24" step="0.5" value="${hours}" aria-label="Hours per day" /></td>
      <td><button type="button" class="btn btn-danger btn-sm ld-del" title="Remove">✕</button></td>
    `;

    tr.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", calculateSolar));
    tr.querySelector(".ld-del").addEventListener("click", () => {
      tr.remove();
      calculateSolar();
    });

    tbody.appendChild(tr);
    calculateSolar();
  }

  function calculateSolar() {
    const rows = document.querySelectorAll("#load-tbody tr");
    let totalDailyWh = 0;
    let peakConnectedWatts = 0;
    const applianceBreakdown = [];

    rows.forEach((tr) => {
      const name = tr.querySelector(".ld-name").value.trim() || "Appliance";
      const watts = Math.max(0, parseFloat(tr.querySelector(".ld-watts").value) || 0);
      const qty = Math.max(0, parseFloat(tr.querySelector(".ld-qty").value) || 0);
      const hours = Math.min(24, Math.max(0, parseFloat(tr.querySelector(".ld-hours").value) || 0));

      const rowWatts = watts * qty;
      const rowWh = rowWatts * hours;

      peakConnectedWatts += rowWatts;
      totalDailyWh += rowWh;
      if (rowWh > 0) {
        applianceBreakdown.push({ name, wh: rowWh, watts: rowWatts, hours });
      }
    });

    // System parameters
    const psh = Math.max(1, parseFloat(document.getElementById("sol-psh").value) || 5.0);
    const sysVoltage = parseInt(document.getElementById("sol-voltage").value, 10) || 48;
    const [dod, battEff] = document.getElementById("sol-chem").value.split(",").map(Number);
    const autonomy = Math.max(0.25, parseFloat(document.getElementById("sol-autonomy").value) || 1);
    const derate = Math.min(0.98, Math.max(0.4, parseFloat(document.getElementById("sol-derate").value) || 0.77));
    const invEff = Math.min(0.99, Math.max(0.7, (parseFloat(document.getElementById("sol-inv-eff").value) || 92) / 100));

    // ROI inputs
    const tariff = Math.max(0.01, parseFloat(document.getElementById("roi-tariff").value) || 0.18);
    const capex = Math.max(50, parseFloat(document.getElementById("roi-capex").value) || 4800);
    const inflation = Math.max(0, parseFloat(document.getElementById("roi-inflation").value) || 5) / 100;

    // Quantitative Equations
    const dailyKwh = totalDailyWh / 1000;
    const minInverterVA = (peakConnectedWatts * 1.25) / 0.80;
    const minInverterKVA = minInverterVA / 1000;

    const reqBatteryWh = (totalDailyWh * autonomy) / (dod * invEff);
    const reqBatteryKwh = reqBatteryWh / 1000;
    const reqBatteryAh = reqBatteryWh / sysVoltage;

    const reqSolarWatts = totalDailyWh / (psh * derate * battEff);
    const reqSolarKw = reqSolarWatts / 1000;
    const panels550W = Math.ceil(reqSolarWatts / 550);
    const installedSolarWatts = panels550W * 550;
    const mpptAmps = Math.ceil((installedSolarWatts / sysVoltage) * 1.25);

    // 10-Year Financial Payback Simulation
    const annualKwhOffset = dailyKwh * 365 * 0.94; // 94% annual availability factor
    let cumulativeSavings = 0;
    let paybackYear = null;
    const yearLabels = ["Yr 0"];
    const cumulativeSeries = [-capex];
    let yr1Savings = 0;

    for (let yr = 1; yr <= 10; yr++) {
      const effectiveTariff = tariff * Math.pow(1 + inflation, yr - 1);
      const annualSave = annualKwhOffset * effectiveTariff;
      if (yr === 1) yr1Savings = annualSave;

      const prevNet = cumulativeSavings - capex;
      cumulativeSavings += annualSave;
      const currentNet = cumulativeSavings - capex;

      if (paybackYear === null && currentNet >= 0 && annualSave > 0) {
        const fraction = Math.abs(prevNet) / annualSave;
        paybackYear = yr - 1 + fraction;
      }

      yearLabels.push(`Yr ${yr}`);
      cumulativeSeries.push(Number(currentNet.toFixed(0)));
    }

    const net10YrProfit = cumulativeSavings - capex;

    // Update UI
    document.getElementById("res-solar-kw").textContent = `${Calcvora.formatNum(reqSolarKw)} kW`;
    document.getElementById("res-panel-count").textContent = `${panels550W} × 550W Panels (${Calcvora.formatNum(installedSolarWatts / 1000)} kW actual)`;
    document.getElementById("res-batt-kwh").textContent = `${Calcvora.formatNum(reqBatteryKwh)} kWh`;
    document.getElementById("res-batt-ah").textContent = `${Math.ceil(reqBatteryAh)} Ah @ ${sysVoltage}V Nominal`;
    document.getElementById("res-inv-kw").textContent = `${Calcvora.formatNum(minInverterKVA, 1)} kVA`;
    document.getElementById("res-peak-watts").textContent = `Peak Connected Load: ${peakConnectedWatts.toLocaleString("en-US")} W`;
    document.getElementById("res-mppt-amps").textContent = `${mpptAmps} A`;
    document.getElementById("res-daily-kwh").textContent = `Daily Load: ${Calcvora.formatNum(dailyKwh)} kWh/day`;

    document.getElementById("res-payback").textContent = paybackYear ? `${Calcvora.formatNum(paybackYear, 1)} Yrs` : "> 10 Yrs";
    document.getElementById("res-yr1-save").textContent = `Year 1 Savings: ${Calcvora.formatCurrency(yr1Savings, "$", 0)}`;
    document.getElementById("res-10yr-net").textContent = Calcvora.formatCurrency(net10YrProfit, "$", 0);

    // Voltage Architecture Advisory Banner
    const statusEl = document.getElementById("sol-status");
    if (peakConnectedWatts > 3500 && sysVoltage < 48) {
      statusEl.className = "status-banner status-warn";
      statusEl.textContent = `⚠ High Load (${peakConnectedWatts}W) on ${sysVoltage}V DC — Switch to 48V to cut cable current & heat loss`;
    } else if (peakConnectedWatts > 1500 && sysVoltage === 12) {
      statusEl.className = "status-banner status-warn";
      statusEl.textContent = `⚠ Load exceeds 1,500W on 12V DC — 24V or 48V architecture strongly recommended`;
    } else {
      statusEl.className = "status-banner status-ok";
      statusEl.textContent = `✓ System Balanced — ${sysVoltage}V DC Architecture Optimal (${panels550W} Panels + ${mpptAmps}A MPPT)`;
    }

    lastSolarSummary = {
      dailyKwh: Calcvora.formatNum(dailyKwh),
      peakConnectedWatts,
      reqSolarKw: Calcvora.formatNum(reqSolarKw),
      panels550W,
      reqBatteryKwh: Calcvora.formatNum(reqBatteryKwh),
      reqBatteryAh: Math.ceil(reqBatteryAh),
      sysVoltage,
      minInverterKVA: Calcvora.formatNum(minInverterKVA, 1),
      mpptAmps,
      payback: paybackYear ? `${Calcvora.formatNum(paybackYear, 1)} years` : "> 10 years",
      net10YrProfit: Calcvora.formatCurrency(net10YrProfit, "$", 0),
    };

    lastCsvRows = [
      ["Parameter", "Value"],
      ["Daily Energy Demand (kWh/day)", lastSolarSummary.dailyKwh],
      ["Connected Peak Load (W)", peakConnectedWatts],
      ["Minimum Solar Array (kW)", lastSolarSummary.reqSolarKw],
      ["Recommended 550W Panels", panels550W],
      ["Battery Bank Capacity (kWh)", lastSolarSummary.reqBatteryKwh],
      ["Battery Bank Capacity (Ah)", `${lastSolarSummary.reqBatteryAh} Ah @ ${sysVoltage}V`],
      ["Minimum Inverter Rating (kVA)", lastSolarSummary.minInverterKVA],
      ["Minimum MPPT Controller (Amps)", mpptAmps],
      ["Estimated Payback Period", lastSolarSummary.payback],
      ["10-Year Cumulative Net Profit", lastSolarSummary.net10YrProfit],
    ];

    renderRoiChart(yearLabels, cumulativeSeries);
    renderLoadChart(applianceBreakdown);
  }

  function renderRoiChart(labels, netSeries) {
    const ctx = document.getElementById("solarRoiChart");
    if (!ctx || typeof Chart === "undefined") return;
    const c = Calcvora.getChartColors();
    if (roiChartInstance) roiChartInstance.destroy();

    roiChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Cumulative Net Cash Flow ($ USD)",
            data: netSeries,
            borderColor: c.success,
            backgroundColor: "rgba(16, 185, 129, 0.14)",
            fill: true,
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: c.text }, grid: { display: false } },
          y: {
            title: { display: true, text: "Net Position ($)", color: c.text },
            ticks: { color: c.text },
            grid: { color: c.grid },
          },
        },
        plugins: {
          legend: { labels: { color: c.text } },
        },
      },
    });
  }

  function renderLoadChart(items) {
    const ctx = document.getElementById("loadShareChart");
    if (!ctx || typeof Chart === "undefined") return;
    const c = Calcvora.getChartColors();
    if (loadChartInstance) loadChartInstance.destroy();

    const palette = [c.primary, c.warning, c.success, c.purple, c.danger, "#06b6d4", "#ec4899"];
    loadChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: items.map((i) => i.name),
        datasets: [
          {
            data: items.map((i) => Number((i.wh / 1000).toFixed(2))),
            backgroundColor: items.map((_, idx) => palette[idx % palette.length]),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { color: c.text, boxWidth: 12, font: { size: 11 } },
          },
          title: {
            display: true,
            text: "Daily Energy Share (kWh/day)",
            color: c.text,
          },
        },
      },
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    INITIAL_LOADS.forEach((item) => addLoadRow(item.name, item.watts, item.qty, item.hours));

    document.querySelectorAll("#appliance-presets .preset-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        addLoadRow(
          btn.getAttribute("data-name"),
          Number(btn.getAttribute("data-watts")),
          1,
          Number(btn.getAttribute("data-hours"))
        );
      });
    });

    document.getElementById("add-custom-row").addEventListener("click", () => {
      addLoadRow("New Appliance", 100, 1, 4);
    });

    ["sol-psh", "sol-voltage", "sol-chem", "sol-autonomy", "sol-derate", "sol-inv-eff", "roi-tariff", "roi-capex", "roi-inflation"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", calculateSolar);
        el.addEventListener("change", calculateSolar);
      }
    });

    document.getElementById("copy-solar-btn").addEventListener("click", () => {
      const s = lastSolarSummary;
      const text = `Calcvora Solar & Battery Sizing BOM:\n• Daily Load: ${s.dailyKwh} kWh/day (Peak: ${s.peakConnectedWatts} W)\n• Solar Array: ${s.reqSolarKw} kW (${s.panels550W} × 550W panels)\n• Battery Bank: ${s.reqBatteryKwh} kWh (${s.reqBatteryAh} Ah @ ${s.sysVoltage}V)\n• Inverter & MPPT: ${s.minInverterKVA} kVA Inverter | ${s.mpptAmps}A MPPT\n• ROI Payback: ${s.payback} | 10-Yr Net Profit: ${s.net10YrProfit}`;
      Calcvora.copyText(text);
    });

    document.getElementById("csv-solar-btn").addEventListener("click", () => {
      Calcvora.downloadCSV("calcvora-solar-sizing-bom.csv", lastCsvRows);
    });

    window.addEventListener("calcvora:themechange", calculateSolar);
  });
})();
