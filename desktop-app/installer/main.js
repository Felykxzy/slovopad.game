const{app,BrowserWindow,ipcMain,dialog}=require("electron"),path=require("path"),fs=require("fs"),cp=require("child_process");
let win;
const LOG=path.join(app.getPath("temp"),"slovopad-installer.log");
const log=t=>{try{fs.appendFileSync(LOG,new Date().toISOString()+" "+t+"\n")}catch(e){}};
process.on("uncaughtException",e=>log("uncaught "+(e&&e.stack||e)));
const setup=()=>app.isPackaged?path.join(process.resourcesPath,"setup.exe"):path.join(__dirname,"setup.exe");
const defDir=()=>path.join(process.env.LOCALAPPDATA||app.getPath("home"),"Programs","Slovopad");
if(!app.requestSingleInstanceLock())app.quit();
app.whenReady().then(()=>{win=new BrowserWindow({width:760,height:470,resizable:false,maximizable:false,frame:false,backgroundColor:"#05060f",title:"СЛОВОПАД",icon:path.join(__dirname,"icon.ico"),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,sandbox:false}});
 win.webContents.on("preload-error",(_,p,e)=>log("preload-error "+p+" "+(e&&e.message)));
 win.webContents.on("render-process-gone",(_,d)=>log("render gone "+d.reason));
 win.loadFile("ui.html")});
app.on("window-all-closed",()=>app.quit());
ipcMain.handle("info",()=>({version:app.getVersion(),dir:defDir()}));
ipcMain.handle("pick",async(_,cur)=>{let r;try{r=await dialog.showOpenDialog(win,{defaultPath:cur||undefined,properties:["openDirectory","createDirectory"]})}catch(e){log("pick "+e.message);r=await dialog.showOpenDialog({properties:["openDirectory","createDirectory"]})}if(r.canceled)return null;const d=r.filePaths[0];return/slovopad$/i.test(d)?d:path.join(d,"Slovopad")});
ipcMain.handle("install",(_,dir)=>new Promise(res=>{
 try{fs.mkdirSync(dir,{recursive:true})}catch(e){return res({ok:false,msg:"Не удалось создать папку: "+e.message})}
 let done=false;const end=r=>{if(!done){done=true;res(r)}};
 try{const c=cp.spawn(setup(),["/S","/D="+dir],{windowsHide:true,windowsVerbatimArguments:true});
  c.on("error",e=>{log("spawn "+e.message);end({ok:false,msg:e.message})});c.on("exit",code=>{log("setup exit "+code);end({ok:code===0,msg:"код "+code})})}
 catch(e){end({ok:false,msg:e.message})}}));
ipcMain.handle("launch",(_,dir)=>{try{const f=fs.readdirSync(dir).find(x=>/\.exe$/i.test(x)&&!/uninstall/i.test(x));if(!f)return false;const c=cp.spawn(path.join(dir,f),[],{detached:true,stdio:"ignore"});c.on("error",()=>{});c.unref();return true}catch(e){return false}});
ipcMain.on("close",()=>app.quit());ipcMain.on("min",()=>win&&win.minimize());
