/* ==========================================================================
   Calcvora Tool 1: Local LLM VRAM, Token Speed & Cloud API Cost Engine
   ========================================================================== */
(function () {
  "use strict";

  let vramChartInstance = null;
  let apiChartInstance = null;
  let lastVramReport = {};
  let lastApiRows = [];

  // Cloud AI API Pricing Matrix ($ per 1M tokens)
  const API_MODELS = [
    { name: "DeepSeek-V3", input: 0.27, cachedInput: 0.07, output: 1.10 },
    { name: "Gemini 2.5 Flash", input: 0.15, cachedInput: 0.0375, output: 0.60 },
    { name: "GPT-4o-mini", input: 0.15, cachedInput: 0.075, output: 0.60 },
    { name: "Claude 3.5 Haiku", input: 0.80, cachedInput: 0.08, output: 4.00 },
    { name: "DeepSeek-R1", input: 0.55, cachedInput: 0.14, output: 2.19 },
    { name: "Gemini 2.5 Pro", input: 1.25, cachedInput: 0.31, output: 10.00 },
    { name: "GPT-4o", input: 2.50, cachedInput: 1.25, output: 10.00 },
    { name: "Claude 3.7 Sonnet", input: 3.00, cachedInput: 0.30, output: 15.00 },
  ];

  // Estimate Transformer architecture depth & hidden dim from parameter count
  function estimateArchitecture(paramsB) {
    if (paramsB <= 3) return { layers: 26, hidden: 2560 };
    if (paramsB <= 9) return { layers: 32, hidden: 4096 };
    if (paramsB <= 16) return { layers: 40, hidden: 5120 };
    if (paramsB <= 35) return { layers: 64, hidden: 5120 };
    if (paramsB <= 75) return { layers: 80, hidden: 8192 };
    if (paramsB <= 150) return { layers: 96, hidden: 12288 };
    return { layers: 120, hidden: 16384 };
  }

  function calculateVRAM() {
    const paramsB = Math.max(0.5, parseFloat(document.getElementById("param-size").value) || 8);
    const activeParamsB = Math.min(
      paramsB,
      Math.max(0.5, parseFloat(document.getElementById("active-params").value) || paramsB)
    );
    const bytesPerParam = parseFloat(document.getElementById("weight-quant").value) || 0.62;
    const kvBytes = parseFloat(document.getElementById("kv-quant").value) || 2.0;
    const contextLen = parseInt(document.getElementById("context-len").value, 10) || 8192;

    document.getElementById("param-display").textContent = `${paramsB}B`;
    document.getElementById("context-display").textContent = contextLen.toLocaleString("en-US");

    // Hardware specs
    const gpuSelect = document.getElementById("gpu-preset").value;
    let availVram = 24;
    let memBw = 936;

    if (gpuSelect === "custom") {
      document.getElementById("custom-gpu-fields").style.display = "grid";
      availVram = Math.max(1, parseFloat(document.getElementById("custom-vram").value) || 24);
      memBw = Math.max(10, parseFloat(document.getElementById("custom-bw").value) || 500);
    } else {
      document.getElementById("custom-gpu-fields").style.display = "none";
      const [v, bw] = gpuSelect.split(",").map(Number);
      availVram = v;
      memBw = bw;
    }

    // Core Quantitative Equations
    const weightsGB = paramsB * bytesPerParam;
    const activeWeightsGB = activeParamsB * bytesPerParam;
    const arch = estimateArchitecture(paramsB);
    const kvCacheGB = (2 * arch.layers * arch.hidden * contextLen * kvBytes) / 1e9;
    const overheadGB = 1.1 + 0.045 * weightsGB;
    const totalFootprintGB = weightsGB + kvCacheGB + overheadGB;
    const activeReadGB = activeWeightsGB + kvCacheGB + 0.5;

    // Speed Estimation (Tokens/sec)
    const utilization = (totalFootprintGB / availVram) * 100;
    let tokPerSec = 0;
    let speedNote = "100% VRAM resident (optimal)";

    if (totalFootprintGB <= availVram) {
      tokPerSec = (memBw / activeReadGB) * 0.75;
    } else {
      // Partial CPU/RAM offload penalty over PCIe
      const vramRatio = availVram / totalFootprintGB;
      const ramBw = 55; // Avg dual-channel DDR5 effective GB/s
      const effectiveBw = memBw * Math.pow(vramRatio, 2) + ramBw * (1 - vramRatio);
      tokPerSec = (effectiveBw / activeReadGB) * 0.45;
      speedNote = "PCIe / System RAM offload penalty";
    }

    // Update UI Metrics
    document.getElementById("res-total-vram").textContent = `${Calcvora.formatNum(totalFootprintGB)} GB`;
    document.getElementById("res-vram-util").textContent = `${Calcvora.formatNum(utilization, 1)}% of ${availVram} GB GPU memory`;
    document.getElementById("res-tok-speed").textContent = `${Calcvora.formatNum(tokPerSec, 1)} tok/s`;
    document.getElementById("res-speed-note").textContent = speedNote;
    document.getElementById("res-weights-gb").textContent = `${Calcvora.formatNum(weightsGB)} GB`;
    document.getElementById("res-kv-gb").textContent = `${Calcvora.formatNum(kvCacheGB + overheadGB)} GB`;
    document.getElementById("res-kv-breakdown").textContent = `KV: ${Calcvora.formatNum(kvCacheGB)} GB | Runtime: ${Calcvora.formatNum(overheadGB)} GB`;

    // Status Banner
    const statusEl = document.getElementById("vram-status");
    if (utilization <= 88) {
      statusEl.className = "status-banner status-ok";
      statusEl.textContent = `✓ Fits Comfortably in VRAM (${Calcvora.formatNum(availVram - totalFootprintGB)} GB headroom)`;
    } else if (utilization <= 100) {
      statusEl.className = "status-banner status-warn";
      statusEl.textContent = `⚠ Tight Fit (${Calcvora.formatNum(utilization, 1)}% full) — Consider Q8 KV cache or lower context`;
    } else {
      statusEl.className = "status-banner status-danger";
      statusEl.textContent = `✕ Exceeds VRAM by ${Calcvora.formatNum(totalFootprintGB - availVram)} GB — Offload to System RAM Required`;
    }

    lastVramReport = {
      paramsB,
      activeParamsB,
      weightsGB: Calcvora.formatNum(weightsGB),
      kvCacheGB: Calcvora.formatNum(kvCacheGB),
      overheadGB: Calcvora.formatNum(overheadGB),
      totalFootprintGB: Calcvora.formatNum(totalFootprintGB),
      availVram,
      tokPerSec: Calcvora.formatNum(tokPerSec, 1),
      contextLen,
    };

    renderVramChart(weightsGB, kvCacheGB, overheadGB, availVram);
  }

  function renderVramChart(weights, kv, overhead, availVram) {
    const ctx = document.getElementById("vramChart");
    if (!ctx || typeof Chart === "undefined") return;

    const c = Calcvora.getChartColors();
    if (vramChartInstance) vramChartInstance.destroy();

    vramChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Required Memory", "Available GPU VRAM"],
        datasets: [
          {
            label: "Model Weights (GB)",
            data: [Number(weights.toFixed(2)), 0],
            backgroundColor: c.primary,
          },
          {
            label: "KV Cache (GB)",
            data: [Number(kv.toFixed(2)), 0],
            backgroundColor: c.warning,
          },
          {
            label: "CUDA/Metal Overhead (GB)",
            data: [Number(overhead.toFixed(2)), 0],
            backgroundColor: c.purple,
          },
          {
            label: "Hardware VRAM Capacity (GB)",
            data: [0, availVram],
            backgroundColor: c.success,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: "Memory (Gigabytes)", color: c.text },
            ticks: { color: c.text },
            grid: { color: c.grid },
          },
          y: {
            stacked: true,
            ticks: { color: c.text },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { labels: { color: c.text, boxWidth: 12 } },
        },
      },
    });
  }

  function calculateApiCosts() {
    const dailyReq = Math.max(1, parseFloat(document.getElementById("api-daily-req").value) || 2500);
    const inTok = Math.max(1, parseFloat(document.getElementById("api-in-tok").value) || 1800);
    const outTok = Math.max(1, parseFloat(document.getElementById("api-out-tok").value) || 450);
    const cachePct = Math.min(95, Math.max(0, parseFloat(document.getElementById("api-cache-rate").value) || 0)) / 100;

    const monthlyInTokens = dailyReq * inTok * 30;
    const monthlyOutTokens = dailyReq * outTok * 30;
    const monthlyInM = monthlyInTokens / 1e6;
    const monthlyOutM = monthlyOutTokens / 1e6;

    document.getElementById("api-total-in").textContent = `${Calcvora.formatNum(monthlyInM)}M`;
    document.getElementById("api-total-out").textContent = `${Calcvora.formatNum(monthlyOutM)}M`;

    const uncachedInM = monthlyInM * (1 - cachePct);
    const cachedInM = monthlyInM * cachePct;

    const tbody = document.getElementById("api-table-body");
    tbody.innerHTML = "";
    lastApiRows = [["Model", "Input ($/1M)", "Output ($/1M)", "Daily Cost ($)", "Monthly Cost ($)"]];

    const labels = [];
    const monthlyCosts = [];

    API_MODELS.forEach((m) => {
      const monthlyCost = uncachedInM * m.input + cachedInM * m.cachedInput + monthlyOutM * m.output;
      const dailyCost = monthlyCost / 30;

      labels.push(m.name);
      monthlyCosts.push(Number(monthlyCost.toFixed(2)));
      lastApiRows.push([m.name, m.input.toFixed(2), m.output.toFixed(2), dailyCost.toFixed(2), monthlyCost.toFixed(2)]);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${m.name}</strong></td>
        <td class="mono">$${m.input.toFixed(2)}</td>
        <td class="mono">$${m.output.toFixed(2)}</td>
        <td class="mono">${Calcvora.formatCurrency(dailyCost)}</td>
        <td class="mono"><strong>${Calcvora.formatCurrency(monthlyCost)}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    renderApiChart(labels, monthlyCosts);
  }

  function renderApiChart(labels, costs) {
    const ctx = document.getElementById("apiCostChart");
    if (!ctx || typeof Chart === "undefined") return;

    const c = Calcvora.getChartColors();
    if (apiChartInstance) apiChartInstance.destroy();

    apiChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Estimated Monthly API Spend ($ USD)",
            data: costs,
            backgroundColor: c.primary,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: c.text }, grid: { display: false } },
          y: {
            title: { display: true, text: "Monthly Cost ($)", color: c.text },
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

  document.addEventListener("DOMContentLoaded", () => {
    // Sync slider and numeric input
    const paramInput = document.getElementById("param-size");
    const paramSlider = document.getElementById("param-slider");
    const activeInput = document.getElementById("active-params");

    paramInput.addEventListener("input", () => {
      paramSlider.value = Math.min(405, paramInput.value);
      activeInput.value = paramInput.value;
      calculateVRAM();
    });

    paramSlider.addEventListener("input", () => {
      paramInput.value = paramSlider.value;
      activeInput.value = paramSlider.value;
      calculateVRAM();
    });

    // Presets
    document.querySelectorAll("#model-presets .preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const p = chip.getAttribute("data-params");
        const a = chip.getAttribute("data-active");
        paramInput.value = p;
        paramSlider.value = Math.min(405, p);
        activeInput.value = a;
        calculateVRAM();
      });
    });

    ["active-params", "weight-quant", "kv-quant", "context-len", "gpu-preset", "custom-vram", "custom-bw"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", calculateVRAM);
      if (el) el.addEventListener("change", calculateVRAM);
    });

    ["api-daily-req", "api-in-tok", "api-out-tok", "api-cache-rate"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", calculateApiCosts);
    });

    // Copy & CSV buttons
    document.getElementById("copy-vram-btn").addEventListener("click", () => {
      const r = lastVramReport;
      const summary = `Calcvora LLM VRAM Report:\n• Model: ${r.paramsB}B (${r.activeParamsB}B active) @ ${r.contextLen} context\n• Total VRAM Required: ${r.totalFootprintGB} GB (Weights: ${r.weightsGB} GB, KV Cache: ${r.kvCacheGB} GB, Runtime: ${r.overheadGB} GB)\n• Target GPU: ${r.availVram} GB | Est. Speed: ${r.tokPerSec} tokens/sec`;
      Calcvora.copyText(summary);
    });

    document.getElementById("csv-vram-btn").addEventListener("click", () => {
      const r = lastVramReport;
      Calcvora.downloadCSV("calcvora-llm-vram-report.csv", [
        ["Metric", "Value"],
        ["Total Parameters (B)", r.paramsB],
        ["Active Parameters (B)", r.activeParamsB],
        ["Context Window (Tokens)", r.contextLen],
        ["Model Weights (GB)", r.weightsGB],
        ["KV Cache (GB)", r.kvCacheGB],
        ["Runtime Overhead (GB)", r.overheadGB],
        ["Total VRAM Required (GB)", r.totalFootprintGB],
        ["Available GPU VRAM (GB)", r.availVram],
        ["Estimated Speed (tokens/sec)", r.tokPerSec],
      ]);
    });

    document.getElementById("csv-api-btn").addEventListener("click", () => {
      Calcvora.downloadCSV("calcvora-ai-api-costs.csv", lastApiRows);
    });

    window.addEventListener("calcvora:themechange", () => {
      calculateVRAM();
      calculateApiCosts();
    });

    calculateVRAM();
    calculateApiCosts();
  });
})();
