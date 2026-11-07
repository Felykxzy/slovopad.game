const { app, BrowserWindow, shell } = require("electron");
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 480, minHeight: 640,
    backgroundColor: "#05060f", autoHideMenuBar: true, title: "СЛОВОПАД",
    webPreferences: { contextIsolation: true }
  });
  win.loadFile("game/index.html");
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
