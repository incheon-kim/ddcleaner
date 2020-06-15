window.ipcRenderer = require('electron').ipcRenderer;

var baseURL;
var comURL = "https://www.dogdrip.net/index.php?act=dispMemberOwnComment"
var docURL = "https://www.dogdrip.net/index.php?act=dispMemberOwnDocument";
var totalItems;
var totalPages;

if(window.location.href.includes('dogdrip.net')){
    window.ipcRenderer.on('find-user', (evt)=>{
        console.log("find-user");
        if (document.querySelector("#navbar > div > div.eq.navbar-right > div.eq.dropdown.dropdown-right.dropdown-angle.visible\\@s > a > img") !== null){
            
            var info = document.querySelector("#main > div > div.eq.section.secontent.background-color-content > section > table > caption").innerText;
            totalItems = parseInt(info.match('Total: (.*), Page .*\/(.*)')[1].replace(/,/g,''), 10);
            totalPages = parseInt(info.match('Total: (.*), Page .*\/(.*)')[2].replace(/,/g,''), 10);
            
            window.ipcRenderer.send('login-done',{
                csrftoken : window.getCSRFToken(),
                totalItems: totalItems,
                totalPages: totalPages
            });
        }else{
            console.log(false);
        }
    });

    window.ipcRenderer.on('get-items', (evt, type)=>{
        var nodes = document.querySelectorAll("#main > div > div.eq.section.secontent.background-color-content > section > table > tbody > tr > td:nth-child(2) > a");
        var result = Array.from(nodes).map((node)=>{
                            if(node.innerText !== "[삭제 되었습니다]"){
                                var re = type=='댓글'?'document_srl=(.*)&_comment_srl=(.*)#':'dogdrip\.net\/(.*)';
                                var matches = node.href.match(re);

                                if(matches[1] !== undefined){
                                    if(type == '댓글'){
                                        return {
                                            docu : matches[1],
                                            comm : matches[2]
                                        }
                                    }else{
                                        return {
                                            docu : matches[1]
                                        }
                                    }
                                }
                            }
                        }).filter(item => item !== undefined);
        console.log(result);

        window.ipcRenderer.send('get-items', {
            items: result,
            curPage: window.location.href.match('&page=(.*)')[1]
        });
    })
}

window.onload = () => {
    if(window.location.href.includes("askpage")){
        console.log("what");
        window.ipcRenderer.invoke('get-total-pages')
                          .then((res)=>{
                                console.log("whut", res);
                                var slider = document.getElementById('pageRange');
                                var numStart = document.getElementById('start');
                                var numEnd = document.getElementById('end');
                        
                                slider.max = res.totalPages;
                                numStart.max = res.totalPages;
                                numEnd.max = res.totalPages;
                                numEnd.value = res.totalPages;

                                var btn = document.getElementById("startBtn");
                                btn.onclick = () => {
                                    window.ipcRenderer.send('start-parse', slider.value);
                                }
                          });
    }else if(window.location.href.includes("docOrcom")){
        var docBtn = document.getElementById("docBtn");
        var comBtn = document.getElementById("comBtn");
    
        if(docBtn && comBtn){
            docBtn.onclick = (evt) => {
                window.ipcRenderer.send('btn-clicked', docBtn.innerText);
            }
            comBtn.onclick = (evt) => {
                window.ipcRenderer.send('btn-clicked', comBtn.innerText);
            }
        }
    }
}

window.ipcRenderer.on('go-to-pages', (evt, res)=>{
    window.location = `${res.type=='댓글'?comURL:docURL}&page=${res.page}`;
})