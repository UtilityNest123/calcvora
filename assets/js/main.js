/* ==========================================================================
   Calcvora Core Utilities (Theme, Navigation, Clipboard, CSV, Charts)
   ========================================================================== */
(function () {
  "use strict";

  // 1. Theme Initialization & Toggle
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("calcvora-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
  root.setAttribute("data-theme", initialTheme);

  function updateThemeIcon(theme) {
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateThemeIcon(initialTheme);

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = root.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        localStorage.setItem("calcvora-theme", next);
        updateThemeIcon(next);
        window.dispatchEvent(new CustomEvent("calcvora:themechange", { detail: { theme: next } }));
      });
    }

    // 2. Mobile Navigation Toggle
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const navLinks = document.getElementById("nav-links");
    if (mobileBtn && navLinks) {
      mobileBtn.addEventListener("click", () => {
        navLinks.classList.toggle("open");
      });
    }

    // 3. Universal Tab Switcher
    document.querySelectorAll("[data-tab-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.closest("[data-tab-group]") || document;
        const targetId = btn.getAttribute("data-tab-target");

        group.querySelectorAll("[data-tab-target]").forEach((b) => b.classList.remove("active"));
        group.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

        btn.classList.add("active");
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add("active");
      });
    });
  });

  // 4. Toast Helper
  function showToast(message) {
    let toast = document.getElementById("calcvora-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "calcvora-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // 5. Copy Text to Clipboard
  async function copyText(text, successMsg = "Summary copied to clipboard!") {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(successMsg);
    }
  }

  // 6. Download CSV Utility
  function downloadCSV(filename, rows) {
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`);
  }

  // 7. Number Formatting Helpers
  function formatNum(num, decimals = 2) {
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatCurrency(num, symbol = "$", decimals = 2) {
    if (!Number.isFinite(num)) return `${symbol}0.00`;
    return `${symbol}${num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  // 8. Chart.js Theme Color Helper
  function getChartColors() {
    const isDark = root.getAttribute("data-theme") === "dark";
    return {
      text: isDark ? "#cbd5e1" : "#334155",
      grid: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)",
      primary: isDark ? "#3b82f6" : "#2563eb",
      success: isDark ? "#10b981" : "#059669",
      warning: isDark ? "#f59e0b" : "#d97706",
      danger: isDark ? "#ef4444" : "#dc2626",
      purple: isDark ? "#a855f7" : "#7c3aed",
    };
  }

  window.Calcvora = {
    showToast,
    copyText,
    downloadCSV,
    formatNum,
    formatCurrency,
    getChartColors,
    printReport: () => window.print(),
  };
})();
