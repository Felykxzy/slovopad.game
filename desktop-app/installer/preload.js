const{contextBridge:c,ipcRenderer:r}=require("electron");
c.exposeInMainWorld("api",{info:()=>r.invoke("info"),pick:d=>r.invoke("pick",d),install:d=>r.invoke("install",d),launch:d=>r.invoke("launch",d),close:()=>r.send("close"),min:()=>r.send("min")});
