/**
 * 本局进度 + 永久仓库（经济）+ 下局加成
 *
 * SAVE_KEY     — 本局地图/战备/runMeta（败北/通关可清）
 * NEXT_RUN_KEY — 撤离后的下局加成（不被 clearSave 清）
 * VAULT_KEY    — 永久仓库：撤离带出的代币等（跨局保留）
 */
(function () {
  const SAVE_KEY = "fb_html_demo_run_v1";
  const NEXT_RUN_KEY = "fb_html_demo_next_run_v1";
  const VAULT_KEY = "fb_html_demo_vault_v1";
  const VERSION = 1;

  function hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (_) { /* ignore */ }
  }

  function saveRun(payload) {
    try {
      const data = {
        version: VERSION,
        savedAt: Date.now(),
        ...payload,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn("saveRun failed", err);
      return false;
    }
  }

  function loadRun() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return null;
      return data;
    } catch (err) {
      console.warn("loadRun failed", err);
      return null;
    }
  }

  function defaultVault() {
    return { version: VERSION, tokens: 0, loadout: null };
  }

  function loadVault() {
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (!raw) return defaultVault();
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return defaultVault();
      return {
        version: VERSION,
        tokens: Math.max(0, Number(data.tokens) || 0),
        loadout: data.loadout || null,
      };
    } catch {
      return defaultVault();
    }
  }

  function saveVault(vault) {
    try {
      const data = {
        version: VERSION,
        tokens: Math.max(0, Number(vault?.tokens) || 0),
        loadout: vault?.loadout ?? null,
        savedAt: Date.now(),
      };
      localStorage.setItem(VAULT_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn("saveVault failed", err);
      return false;
    }
  }

  /** 撤离：本局代币入永久仓；可选写回 loadout 快照 */
  function bankRunExtract({ tokens, loadout } = {}) {
    const vault = loadVault();
    const add = Math.max(0, Number(tokens) || 0);
    vault.tokens += add;
    if (loadout) vault.loadout = loadout;
    saveVault(vault);
    return { vault, added: add };
  }

  function bankRunTokens(amount) {
    return bankRunExtract({ tokens: amount });
  }

  function savePendingNextRun(bonus) {
    if (!bonus) return false;
    try {
      localStorage.setItem(
        NEXT_RUN_KEY,
        JSON.stringify({
          version: VERSION,
          savedAt: Date.now(),
          startTokens: Number(bonus.startTokens) || 0,
          maxHpDelta: Number(bonus.maxHpDelta) || 0,
          startBlock: Number(bonus.startBlock) || 0,
          notes: Array.isArray(bonus.notes) ? bonus.notes : [],
        })
      );
      return true;
    } catch (err) {
      console.warn("savePendingNextRun failed", err);
      return false;
    }
  }

  function peekPendingNextRun() {
    try {
      const raw = localStorage.getItem(NEXT_RUN_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return null;
      return data;
    } catch {
      return null;
    }
  }

  function consumePendingNextRun() {
    const data = peekPendingNextRun();
    try {
      localStorage.removeItem(NEXT_RUN_KEY);
    } catch (_) { /* ignore */ }
    return data;
  }

  window.FBSave = {
    SAVE_KEY,
    NEXT_RUN_KEY,
    VAULT_KEY,
    VERSION,
    hasSave,
    clearSave,
    saveRun,
    loadRun,
    loadVault,
    saveVault,
    bankRunTokens,
    bankRunExtract,
    savePendingNextRun,
    peekPendingNextRun,
    consumePendingNextRun,
  };
})();
