(function () {
  const modeKey = "repolens.theme.mode";
  const modes = [
    { id: "light", label: "浅色", icon: "日" },
    { id: "dark", label: "暗黑", icon: "月" }
  ];

  const root = document.documentElement;
  let mode = readStored(modeKey, "light");

  function readStored(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return modes.some((item) => item.id === value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Local file previews may block storage; the current page still updates. */
    }
  }

  function applyTheme() {
    root.dataset.themeMode = mode;
    root.dataset.theme = mode;
    root.style.accentColor = "var(--accent)";
    updateSwitcher();
  }

  function setMode(nextMode) {
    mode = modes.some((item) => item.id === nextMode) ? nextMode : "light";
    writeStored(modeKey, mode);
    applyTheme();
  }

  function updateSwitcher() {
    const switcher = document.querySelector("[data-theme-switcher]");
    if (!switcher) return;
    switcher.querySelectorAll("[data-theme-mode]").forEach((button) => {
      const isActive = button.dataset.themeMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function findMount() {
    const sidebar = document.querySelector(".sidebar");
    const sidebarNav = sidebar?.querySelector('nav[aria-label="主导航"]');
    if (sidebar && sidebarNav) return { parent: sidebar, before: sidebarNav.nextElementSibling };

    const topnav = document.querySelector(".topnav-inner nav, .topnav nav, header nav");
    if (topnav) return { parent: topnav, before: null };

    return { parent: document.body, before: null };
  }

  function createSwitcher() {
    if (document.querySelector("[data-theme-switcher]")) return;
    const switcher = document.createElement("section");
    switcher.className = "theme-switcher";
    switcher.dataset.themeSwitcher = "true";
    switcher.setAttribute("aria-label", "界面明暗模式");
    switcher.innerHTML = `
      <span class="theme-label">主题</span>
      <div class="theme-segmented" role="group" aria-label="界面明暗模式">
        ${modes.map((item) => `<button class="theme-option" type="button" data-theme-mode="${item.id}" aria-pressed="false"><span class="theme-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></button>`).join("")}
      </div>
    `;

    const mount = findMount();
    mount.parent.insertBefore(switcher, mount.before);
    switcher.addEventListener("click", (event) => {
      const modeButton = event.target.closest("[data-theme-mode]");
      if (modeButton) setMode(modeButton.dataset.themeMode);
    });
    updateSwitcher();
  }

  applyTheme();

  window.addEventListener("storage", (event) => {
    if (event.key !== modeKey) return;
    mode = modes.some((item) => item.id === event.newValue) ? event.newValue : "light";
    applyTheme();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createSwitcher);
  } else {
    createSwitcher();
  }
})();
