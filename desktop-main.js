const { app, BrowserWindow, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 480, minHeight: 640,
    backgroundColor: "#05060f", autoHideMenuBar: true, title: "СЛОВОПАД",
    webPreferences: { contextIsolation: true }
  });
  win.loadFile("game/index.html");
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
}
function checkUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.on("update-downloaded", (info) => {
    dialog.showMessageBox({
      type: "info", title: "СЛОВОПАД", buttons: ["Перезапустить", "Позже"], defaultId: 0, cancelId: 1,
      message: "Вышла новая версия " + info.version, detail: "Обновление скачано. Перезапустить игру сейчас?"
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.checkForUpdates().catch(() => {});
}
app.whenReady().then(() => { createWindow(); checkUpdates(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
