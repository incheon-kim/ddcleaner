const {BrowserWindow, ipcMain, app} = require('electron');
const Progressbar = require('electron-progressbar');
const path = require('path');
const https = require('https');
const {eachSeries} = require('async');

let mainWindow;

let data = {
    cookies: "",
    list: new Set(),
    errorCount: 0,
    type: "",
};

let loginURL = '';
let cookieNameList = ["__cfduid", "PHPSESSID", "rx_sesskey1", "rx_sesskey2"]
let parse_progress, req_progress;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getReferer(args){
    if(data.type == '댓글'){
        return `https://dogdrip.net/index.php?document_srl=${args.docu}&act=dispBoardDeleteComment&comment_srl=${args.comm}`
    }else{
        return `https://www.dogdrip.net/index.php?document_srl=${args.docu}&act=dispBoardDelete`
    }
}

function getPostData(args){
    if(data.type == '댓글'){
        return `_filter=delete_comment&error_return_url=/index.php?document_srl=${args.docu}&act=dispBoardDeleteComment&comment_srl=${args.comm}&act=procBoardDeleteComment&document_srl=${args.docu}&comment_srl=${args.comm}&module=board&_rx_ajax_compat=XMLRPC&_rx_csrf_token=${data.csrftoken}&vid=`
    }else{
        return `_filter=delete_document&error_return_url=/index.php?document_srl=${args.docu}&act=procBoardDeleteDocument&document_srl=${args.docu}&module=board&_rx_ajax_compat=XMLRPC&_rx_csrf_token=${data.csrftoken}&vid=`
    }
}

async function doRequest(){
    parse_progress.detail = `${data.type} 목록 수집 완료! ${data.list.size} 개`
    setTimeout(()=>parse_progress.setCompleted(), 2500);
    
    await sleep(1500);
    req_progress = new Progressbar({
        indeterminate: false,
        title: `${data.type} 삭제 요청중`,
        text: `${data.type} 삭제 중`,
        detail: `0/${data.list.size}`,
        maxValue: data.list.size,
        browserWindow:{
            width : 400,
            height : 200,
            parent : mainWindow,
            modal: true,
            webPreferences:{
                nodeIntegration: true
            }
        }
    })

    req_progress
    .on('completed', ()=>{
        req_progress.detail = "삭제 요청 완료! 종료중...";
    })
    .on('aborted', ()=>{
        req_progress.detail = "알수 없는 오류 발생! 종료중...";
        app.quit();
    })
    .on('progress', (value)=>{
        req_progress.detail =`${value}/${data.list.size}`;
    })
    
    // async.eachSeries guarantees single rqeuest during iteration.
    eachSeries(data.list,(item, cb)=>{
        setTimeout(()=>{
            var options = {
                'method' : 'POST',
                'hostname' : 'www.dogdrip.net',
                'path': '/',
                'headers':{
                    'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36 Edg/83.0.478.45',
                    'Accept': 'application/json, text/javascript, */*, q=0.01',
                    'Accept-Language': 'ko, en;q=0.9,en-US;q=0.8',
                    'DNT': '1',
                    'x-csrf-token': data.csrftoken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'Content-Type': 'text/plain',
                    'Referer': getReferer(item),
                    'Cookie': data.cookies,
                }
            }
            var postData = getPostData(item);

            var req = https.request(options, (res)=>{
                var chunks = [];
                console.log(res.statusCode, item.docu, item.comm);
                res.on('data', (chunk)=>{
                    chunks.push(chunk);
                });
    
                res.on('end', ()=>{
                    var body = Buffer.concat(chunks);
                    console.log(unescape(body.toString()), item.docu, item.comm);
                    if(!req_progress.isCompleted()){
                        req_progress.value+=1;
                    }
                    cb();
                    
                });
    
                res.on("error", (err)=>{
                    console.error(err);
                    cb();
                });
            })
            .on('error', (err)=>{
                console.error(err);
                data.errorCount++;
                cb();
            })
    
            req.write(postData);
    
            req.end();
        }, 800);
    },(err)=>{
        if(err){
            console.error(err);
        }
        console.log("Delete Requests are finished.");
        app.quit();
    });
}

const doWork = () =>{
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        resizable: false,
        webPreferences:{
            nodeIntegration : false,
            preload: path.resolve('./util/preload.js')
        }
    });
    let webContents = mainWindow.webContents;
    let session = mainWindow.webContents.session;

    mainWindow.on('close', ()=>{
        mainWindow = null;
        console.log("bye!");
    });

    function finduser(evt){
        webContents.send('find-user');
    }

    webContents.on('did-finish-load', finduser);

    ipcMain.on('btn-clicked',(evt, type)=>{
        data.type = type;
        console.log("type is ", type);
        if(type == '댓글'){
            loginURL = 'https://www.dogdrip.net/index.php?act=dispMemberOwnComment'
        }else{
            loginURL = 'https://www.dogdrip.net/index.php?act=dispMemberOwnDocument';
        }
        mainWindow.loadURL(loginURL);
    })
    
    ipcMain.on('login-done', async (evt, res)=>{
        console.log("login-done");
        var cookies = await webContents.session.cookies.get({
            filter:{
                url: "https://dogdrip.net"
            }
        });

        cookies.forEach((cookie, idx)=>{
            if(cookieNameList.includes(cookie.name)){
                data.cookies += idx==cookies.length-1?`${cookie.name}=${cookie.value}`:`${cookie.name}=${cookie.value}; `;
            }
        });

        data.csrftoken = res.csrftoken;
        data.totalPages = res.totalPages

        mainWindow.loadFile(path.resolve('./util/askpage.html'));
    });

    ipcMain.handle('get-total-pages',(evt)=>{
        return {totalPages:data.totalPages, type: data.type};
    })

    ipcMain.on('get-items', (evt, res)=>{

        res.items.forEach(item=>data.list.add(item));
        console.log(res.curPage, data.list.size);

        parse_progress.detail = `${data.type} 목록 수집 중... ${res.curPage}/${data.totalPages} 페이지 ${data.list.size} 개`

        if(res.curPage == data.totalPages){
            doRequest();
        }else{
            webContents.send('go-to-pages', {page: parseInt(res.curPage, 10)+1, type: data.type});
        }
    })

    ipcMain.on('start-parse', async (evt, val)=>{
        console.log("start-parse");

        webContents.removeListener('did-finish-load', finduser);
        webContents.on('did-finish-load', ()=>{
            webContents.send('get-items', data.type);
        })
        
        parse_progress = new Progressbar({
            title: `${data.type} 목록 수집중`,
            text: `${data.type} 목록 수집중...`,
            detail: "",
            browserWindow:{
                width : 400,
                height : 200,
                parent : mainWindow,
                modal: true,
                webPreferences:{
                    nodeIntegration: true
                }
            }
        });

        parse_progress
        .on('completed',()=>{
            mainWindow.loadFile(path.resolve('./util/requesting.html'))
        })
        .on('aborted', ()=>{
            app.quit();
        })
        await sleep(2500);
        webContents.send('go-to-pages', {page: val, type: data.type});
    })

    // clear cookie when init
    session.clearStorageData({storages:"cookies"})
            .then(()=>{
                mainWindow.loadFile(path.resolve('./util/docOrcom.html'));
            })
}
process.on('uncaughtException', (err)=>{
    console.error("[unchaughtException]", err);
})

app.on('ready', doWork);

app.on('window-all-closed', async()=>{
    // 맥이고 뭐고 얄짤없다. 걍 꺼
    app.quit();
});