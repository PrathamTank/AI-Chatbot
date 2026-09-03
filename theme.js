// Shared Theme Controller for AI Chatbot, DocSum, and TextExtract
(function () {
    const THEME_KEY = "ai_chatbot_theme";

    function getSavedTheme() {
        try {
            return localStorage.getItem(THEME_KEY) || "light";
        } catch (e) {
            return "light";
        }
    }

    function applyTheme(theme) {
        const selected = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", selected);
        try {
            localStorage.setItem(THEME_KEY, selected);
        } catch (e) {
            console.warn("Could not persist theme to localStorage:", e);
        }
        updateToggleButtons(selected);
    }

    function updateToggleButtons(theme) {
        const isDark = theme === "dark";
        document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
            btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
            btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
            const textSpan = btn.querySelector(".theme-toggle-text");
            if (textSpan) {
                textSpan.textContent = isDark ? "Light" : "Dark";
            }
        });
    }

    function toggleTheme() {
        const current = getSavedTheme();
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
    }

    // Apply saved theme immediately
    applyTheme(getSavedTheme());

    // Bind theme toggle buttons once DOM is ready
    function initThemeButtons() {
        updateToggleButtons(getSavedTheme());
        document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
            if (!btn.dataset.themeBound) {
                btn.dataset.themeBound = "true";
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    toggleTheme();
                });
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThemeButtons);
    } else {
        initThemeButtons();
    }

    // Listen for theme changes from other open tabs/windows
    window.addEventListener("storage", (e) => {
        if (e.key === THEME_KEY && e.newValue) {
            applyTheme(e.newValue);
        }
    });

    // Expose global API
    window.AppTheme = {
        get: getSavedTheme,
        set: applyTheme,
        toggle: toggleTheme
    };
})();
