/**
 * 本局进度：localStorage 存读
 * 存：地图 / 战备 / 跑团资源 / HP / 败北标记
 */
(function () {
  const SAVE_KEY = "fb_html_demo_run_v1";
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

  window.FBSave = {
    SAVE_KEY,
    VERSION,
    hasSave,
    clearSave,
    saveRun,
    loadRun,
  };
})();
