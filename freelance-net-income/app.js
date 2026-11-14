/* ==========================================================================
   Calcvora Tool 3: Global Freelance Net-Income, Fee & PPP Rate Calculator
   ========================================================================== */
(function () {
  "use strict";

  let incomeChartInstance = null;
  let lastReport = {};

  function calculateFreelanceIncome() {
    const mode = document.getElementById("calc-mode").value;
    const billingType = document.getElementById("billing-type").value;
    const baseAmount = Math.max(1, parseFloat(document.getElementById("amount-input").value) || 2500);

    // Billing structure multiplier
    let totalInputAmount = baseAmount;
    if (billingType === "hourly") {
      document.getElementById("hourly-fields").style.display = "grid";
      document.getElementById("amount-label").textContent =
        mode === "forward" ? "Hourly Client Rate ($ USD/hr)" : "Desired Net Hourly Rate ($ USD/hr)";
      const hrs = Math.max(1, parseFloat(document.getElementById("hours-week").value) || 30);
      const wks = Math.max(1, parseFloat(document.getElementById("weeks-month").value) || 4.33);
      totalInputAmount = baseAmount * hrs * wks;
    } else {
      document.getElementById("hourly-fields").style.display = "none";
      document.getElementById("amount-label").textContent =
        mode === "forward" ? "Gross Client Quote ($ USD)" : "Desired Net Take-Home ($ USD)";
    }

    // Platform fee
    const platVal = document.getElementById("platform-preset").value;
    let platPct = 0;
    if (platVal === "custom") {
      document.getElementById("custom-plat-box").style.display = "flex";
      platPct = Math.min(80, Math.max(0, parseFloat(document.getElementById("custom-plat-pct").value) || 0));
    } else {
      document.getElementById("custom-plat-box").style.display = "none";
      platPct = parseFloat(platVal) || 0;
    }
    const platRate = platPct / 100;

    // Gateway & FX spread
    const [gwPct, fxSpreadPct, fixedFeeUsd] = document.getElementById("gateway-preset").value.split(",").map(Number);
    const gwRate = gwPct / 100;
    const fxSpreadRate = fxSpreadPct / 100;

    // Currency & Tax
    const [, , currSymbol] = document.getElementById("target-currency").value.split(",");
    const midMarketFx = Math.max(0.01, parseFloat(document.getElementById("fx-rate").value) || 1);
    const taxPct = parseFloat(document.getElementById("tax-reserve").value) || 0;
    const taxRate = taxPct / 100;
    document.getElementById("tax-display").textContent = `${taxPct}%`;

    // PPP Ratios
    const clientPpp = parseFloat(document.getElementById("ppp-client").value) || 1.0;
    const localPpp = parseFloat(document.getElementById("ppp-local").value) || 0.31;

    // Solve Forward vs Reverse
    let grossUsd = 0;
    let postPlatformUsd = 0;
    let netUsdBeforeTax = 0;

    if (mode === "forward") {
      grossUsd = totalInputAmount;
      postPlatformUsd = grossUsd * (1 - platRate);
      netUsdBeforeTax = Math.max(0, postPlatformUsd * (1 - gwRate) - fixedFeeUsd);
    } else {
      // Reverse mode: solve for Gross USD so Net USD (before tax) equals target
      netUsdBeforeTax = totalInputAmount;
      const denom = (1 - platRate) * (1 - gwRate);
      grossUsd = denom > 0 ? (netUsdBeforeTax + fixedFeeUsd) / denom : netUsdBeforeTax;
      postPlatformUsd = grossUsd * (1 - platRate);
    }

    const platformFeeUsd = grossUsd - postPlatformUsd;
    const gatewayFeeUsd = Math.max(0, postPlatformUsd - netUsdBeforeTax);

    // FX Spread & Local Currency Conversion
    const effectiveFx = midMarketFx * (1 - fxSpreadRate);
    const grossLocalEquivalent = netUsdBeforeTax * midMarketFx;
    const actualLocalReceived = netUsdBeforeTax * effectiveFx;
    const fxLossUsd = (grossLocalEquivalent - actualLocalReceived) / midMarketFx;

    const totalFeeDragUsd = platformFeeUsd + gatewayFeeUsd + fxLossUsd;
    const effectiveDragPct = grossUsd > 0 ? (totalFeeDragUsd / grossUsd) * 100 : 0;

    const taxReserveUsd = netUsdBeforeTax * taxRate;
    const netSpendableUsd = Math.max(0, netUsdBeforeTax - taxReserveUsd - fxLossUsd);
    const netSpendableLocal = actualLocalReceived * (1 - taxRate);

    // PPP Equivalent Salary in Client Country
    const pppEquivalentUsd = netUsdBeforeTax * (clientPpp / localPpp);

    // Update UI Cards
    if (mode === "forward") {
      document.getElementById("res-primary-label").textContent = "Net Take-Home (USD)";
      document.getElementById("res-net-usd").textContent = Calcvora.formatCurrency(netSpendableUsd);
      document.getElementById("res-gross-sub").textContent = `From ${Calcvora.formatCurrency(grossUsd)} gross client invoice`;
    } else {
      document.getElementById("res-primary-label").textContent = "Exact Gross Quote to Send";
      document.getElementById("res-net-usd").textContent = Calcvora.formatCurrency(grossUsd);
      document.getElementById("res-gross-sub").textContent = `Guarantees ${Calcvora.formatCurrency(netUsdBeforeTax)} cleared payout`;
    }

    document.getElementById("res-local-net").textContent = `${currSymbol}${Calcvora.formatNum(netSpendableLocal, 0)}`;
    document.getElementById("res-eff-fx").textContent = `Effective FX: ${Calcvora.formatNum(effectiveFx, 2)} (Mid: ${Calcvora.formatNum(midMarketFx, 2)})`;
    document.getElementById("res-total-fees").textContent = Calcvora.formatCurrency(totalFeeDragUsd);
    document.getElementById("res-fee-split").textContent = `Platform: ${Calcvora.formatCurrency(platformFeeUsd)} | GW/FX: ${Calcvora.formatCurrency(gatewayFeeUsd + fxLossUsd)}`;
    document.getElementById("res-ppp-equiv").textContent = Calcvora.formatCurrency(pppEquivalentUsd, "$", 0);

    // Status Banner
    const statusEl = document.getElementById("fl-status");
    if (effectiveDragPct <= 5) {
      statusEl.className = "status-banner status-ok";
      statusEl.textContent = `✓ Low Fee Drag (${Calcvora.formatNum(effectiveDragPct, 1)}%) — You retain ${Calcvora.formatNum(100 - effectiveDragPct, 1)}% of gross value`;
    } else if (effectiveDragPct <= 14) {
      statusEl.className = "status-banner status-warn";
      statusEl.textContent = `⚠ Moderate Fee Drag (${Calcvora.formatNum(effectiveDragPct, 1)}%) — ${Calcvora.formatCurrency(totalFeeDragUsd)} lost to fees & FX`;
    } else {
      statusEl.className = "status-banner status-danger";
      statusEl.textContent = `✕ High Fee Drag (${Calcvora.formatNum(effectiveDragPct, 1)}%) — Consider direct billing or Wise to save ${Calcvora.formatCurrency(totalFeeDragUsd)}`;
    }

    lastReport = {
      mode: mode === "forward" ? "Forward (Gross -> Net)" : "Reverse (Target Net -> Quote)",
      grossUsd: Calcvora.formatNum(grossUsd),
      platformFeeUsd: Calcvora.formatNum(platformFeeUsd),
      gatewayAndFxUsd: Calcvora.formatNum(gatewayFeeUsd + fxLossUsd),
      taxReserveUsd: Calcvora.formatNum(taxReserveUsd),
      netSpendableUsd: Calcvora.formatNum(netSpendableUsd),
      localNet: `${currSymbol}${Calcvora.formatNum(netSpendableLocal, 0)}`,
      pppEquivalentUsd: Calcvora.formatNum(pppEquivalentUsd, 0),
    };

    renderIncomeChart(netSpendableUsd, platformFeeUsd, gatewayFeeUsd + fxLossUsd, taxReserveUsd);
  }

  function renderIncomeChart(netUsd, platUsd, gwFxUsd, taxUsd) {
    const ctx = document.getElementById("incomeChart");
    if (!ctx || typeof Chart === "undefined") return;
    const c = Calcvora.getChartColors();
    if (incomeChartInstance) incomeChartInstance.destroy();

    incomeChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Net Spendable Income", "Marketplace Commission", "Gateway & FX Spread", "Tax / Savings Reserve"],
        datasets: [
          {
            data: [
              Number(netUsd.toFixed(2)),
              Number(platUsd.toFixed(2)),
              Number(gwFxUsd.toFixed(2)),
              Number(taxUsd.toFixed(2)),
            ],
            backgroundColor: [c.success, c.danger, c.warning, c.primary],
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
            labels: { color: c.text, boxWidth: 12 },
          },
          title: {
            display: true,
            text: "Gross Invoice Allocation ($ USD)",
            color: c.text,
          },
        },
      },
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const currSelect = document.getElementById("target-currency");
    const fxInput = document.getElementById("fx-rate");

    currSelect.addEventListener("change", () => {
      const [, defaultRate] = currSelect.value.split(",");
      fxInput.value = defaultRate;
      calculateFreelanceIncome();
    });

    ["calc-mode", "billing-type", "amount-input", "hours-week", "weeks-month", "platform-preset", "custom-plat-pct", "gateway-preset", "fx-rate", "tax-reserve", "ppp-client", "ppp-local"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", calculateFreelanceIncome);
        el.addEventListener("change", calculateFreelanceIncome);
      }
    });

    document.getElementById("copy-fl-btn").addEventListener("click", () => {
      const r = lastReport;
      const summary = `Calcvora Freelance Income Breakdown (${r.mode}):\n• Gross Client Quote: $${r.grossUsd}\n• Platform Commission: -$${r.platformFeeUsd}\n• Payment Gateway & FX Loss: -$${r.gatewayAndFxUsd}\n• Tax/Savings Reserve: -$${r.taxReserveUsd}\n• Net Spendable Take-Home: $${r.netSpendableUsd} (${r.localNet})\n• Client-Country PPP Equivalent: $${r.pppEquivalentUsd}`;
      Calcvora.copyText(summary);
    });

    document.getElementById("csv-fl-btn").addEventListener("click", () => {
      const r = lastReport;
      Calcvora.downloadCSV("calcvora-freelance-income-statement.csv", [
        ["Line Item", "Amount"],
        ["Calculation Mode", r.mode],
        ["Gross Client Quote (USD)", r.grossUsd],
        ["Marketplace Fee (USD)", r.platformFeeUsd],
        ["Gateway & FX Spread Loss (USD)", r.gatewayAndFxUsd],
        ["Tax & Savings Reserve (USD)", r.taxReserveUsd],
        ["Net Spendable Income (USD)", r.netSpendableUsd],
        ["Local Currency Bank Deposit", r.localNet],
        ["PPP Living Standard Equivalent (USD)", r.pppEquivalentUsd],
      ]);
    });

    window.addEventListener("calcvora:themechange", calculateFreelanceIncome);
    calculateFreelanceIncome();
  });
})();
