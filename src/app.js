// 随机摄影情感句子（hero 副标题，每次刷新不同）。
// 如需接真实「一言」API，可改为：
//   fetch('https://v1.hitokoto.cn/').then(r=>r.json()).then(d=>{var e=document.getElementById('heroQuote');if(e)e.textContent=d.hitokoto;});
// 但一言不按「摄影」主题筛选，句子易跑题，故默认用下方内置句库。
var QUOTES = [
  '每一张快门都是成本,拍前先瞄一眼',
  '光不会等你,但胶片会替你记得',
  '把转瞬即逝的光,留给不会重来的瞬间',
  '按下快门前,世界先安静了一秒',
  '胶片不修图,它只诚实地收藏光',
  '你拍下的不是风景,是那一刻的自己',
  '慢一点,胶卷数得清每一次心跳',
  '等一束光,是摄影最温柔的耐心',
  '曝光不足可以补,错过的瞬间不能重来',
  '一卷三十六张,是三十六次认真的相遇',
  '镜头里没有滤镜,只有真实的光与影',
  '拍得糙不要紧,拍得少才可惜',
  '时间会褪色,胶片替你留底色',
  '最好的光线,往往在你愿意等的时候来',
  '每一次按下,都是和世界的私语',
  '模糊的不只是焦,还有来不及看清的从前',
  '胶片贵,所以你学会了先看再拍',
  '光影易逝,唯有记录让此刻长存',
  '柯达黄,富士绿,装的是各自的青春',
  'C200 便宜大碗,是新手的第一卷勇气',
  '反转片娇贵,偏半级就翻脸,新手暂避',
  '黑白片洗出来,世界突然变得讲道理',
  '过期胶片像开盲盒,惊喜惊吓五五开',
  '镜头越长,今天走的路越短',
  '三脚架才是沉默的摄影老师',
  '定焦练腿,变焦练腰,最后都练钱包',
  '买镜头一时爽,背器材火葬场',
  '测光表不会骗人,骗人的是手抖',
  '阳光十六法则:记不住就多拍两张',
  '冲扫店说"正常",就是最好的赞美'
];
function setHeroQuote(){
  var el = document.getElementById('heroQuote');
  if (!el) return;
  el.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  // 重新触发淡入动画（每次刷新/调用都渐显）
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

var ISO = 400;
var evOffset = 0;          // 灰卡校准偏移（EV 单位），对齐 Light Meter 用
var lastSensorLux = NaN;   // 传感器最近一次真实 lux
var STD = [8,15,30,60,125,250,500,1000,2000,4000];
function near(v){var b=STD[0],d=1e9;STD.forEach(function(s){if(Math.abs(s-v)<d){d=Math.abs(s-v);b=s}});return b}
function fnum(f){return 'f/'+f}

var ICONS = {
  iso:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 3l4 6-4 6-4-6z"/></svg>',
  ape:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 4l5 7-5 7-5-7z"/></svg>',
  shu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  foc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 20l6-10 4 6 3-4 5 8z"/></svg>',
  met:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  rec:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9h12l-3-3M20 15H8l3 3"/></svg>'
};
var FILM = {
  bw:{name:'黑白负片',disc:ICONS.iso,iso:'100 / 200 / 400',tole:'±2 ~ 3 级（最宽容）',tip:'过曝不慌，欠曝丢暗部；冲洗容错最高，新手首选练手。',
      sc:[['晴天户外','f/8-f/11','1/250-1/500','阳光16交叉验证'],['多云阴天','f/5.6-f/8','1/125-1/250','反差柔和'],['室内窗边','f/2.8-f/4','1/60-1/125','注意安全快门'],['夜景长曝','f/8-f/11','2s-30s','三脚架+快门线']]},
  color:{name:'彩色负片 (C-41)',disc:ICONS.iso,iso:'200 / 400',tole:'±1.5 ~ 2 级',tip:'欠曝易偏色、丢层次；宁可偏亮半级。C400=ISO400，通用保险。',
      sc:[['晴天户外','f/11-f/16','1/250-1/500','蓝绿鲜明'],['多云阴天','f/5.6-f/8','1/125-1/250','色彩饱满'],['室内窗边','f/2.8-f/4','1/60-1/125','补光更稳'],['傍晚街灯','f/2.8以下','1/30-1/60','靠墙或脚架']]},
  slide:{name:'反转片 (E-6)',disc:ICONS.iso,iso:'50 / 100 / 200',tole:'±0.5 级（零容错）',tip:'贵且严苛，偏半级即废片；建议独立入射光测光表，新手暂避。',
      sc:[['晴天户外','f/11-f/16','1/250-1/500','务必精准'],['多云阴天','f/8-f/11','1/125-1/250','点测光更稳'],['室内窗边','f/4-f/5.6','1/60-1/125','基本需补光'],['弱光','不推荐','—','宽容度不足']]}
};
var PARAMS = [
  {t:'ISO 感光度',c:'amber',cs:'amber-soft',ico:'iso',d:'买卷时定死，拍完才能换。↑更亮但颗粒粗。',ch:['100','200','400','800','1600']},
  {t:'光圈 Aperture',c:'teal',cs:'teal-soft',ico:'ape',d:'f值越小开口越大越亮（反着记）。↓虚化，↑清晰。',ch:['f/1.4','f/2.8','f/5.6','f/8','f/16']},
  {t:'快门 Shutter',c:'blue',cs:'blue-soft',ico:'shu',d:'分母越大越快越暗。↑凝固，↓模糊。',ch:['1/60','1/125','1/250','1/500','1/1000']},
  {t:'焦距 Focal',c:'pink',cs:'pink-soft',ico:'foc',d:'不直接影响曝光，但决定安全快门=1/焦距。',ch:['24','35','50','85','135']},
  {t:'测光 Metering',c:'gray',cs:'gray-soft',ico:'met',d:'先设ISO，测光表才准。平均/中央/点测三种。',ch:['平均','中央','点测']},
  {t:'互易律',c:'amber',cs:'amber-soft',ico:'rec',d:'改一参数N级，另一反向N级补偿，亮度不变。',ch:['1级','2倍光']}
];

function renderRef(key){
  var f = FILM[key], html='';
  html += '<div class="info"><div class="top"><div class="disc">'+f.disc+'</div><h3>'+f.name+'</h3></div>'+
    '<div class="kv"><span class="k">推荐 ISO</span><span class="v">'+f.iso+'</span></div>'+
    '<div class="kv"><span class="k">曝光宽容度</span><span class="v">'+f.tole+'</span></div>'+
    '<div class="tip">'+f.tip+'</div></div>';
  html += '<div class="grid">';
  PARAMS.forEach(function(p){
    var chips = p.ch.map(function(c){return '<span class="chip">'+c+'</span>'}).join('');
    html += '<div class="pc" style="--c:var(--'+p.c+');--c-soft:var(--'+p.cs+')"><div class="hd"><span class="ic">'+ICONS[p.ico]+'</span><b>'+p.t+'</b></div><p>'+p.d+'</p><div class="chips">'+chips+'</div></div>';
  });
  html += '</div>';
  html += '<div class="sec-t"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg>常见场景参数速查</div>';
  html += '<div class="tbl-wrap"><table><thead><tr><th>场景</th><th>光圈</th><th>快门</th><th>备注</th></tr></thead><tbody>';
  f.sc.forEach(function(r){html+='<tr><td>'+r[0]+'</td><td class="ape">'+r[1]+'</td><td class="sh">'+r[2]+'</td><td style="color:var(--muted);font-size:11.5px">'+r[3]+'</td></tr>'});
  html += '</tbody></table></div>';
  html += '<div class="note"><b>阳光16 法则：</b>晴天顺光 f/16，快门=1/ISO；薄云 f/11 · 厚云 f/8 · 阴天 f/5.6 · 阴影/窗边 f/4 · 室内 f/2.8。</div>';
  document.getElementById('ref-body').innerHTML = html;
}

// bottom tabs
document.querySelectorAll('nav .tab').forEach(function(t){
  t.addEventListener('click',function(){
    document.querySelectorAll('nav .tab').forEach(function(x){x.classList.remove('on')});
    t.classList.add('on');
    var p=t.getAttribute('data-page');
    // 按 data-page 统一处理，不要写死具体页面 ——
    // 原来这里只 toggle 了 ref 和 meter，新增的 roll 页永远不会显示，
    // 表现为"点了 tab 没反应"，而且控制台不会报任何错。
    document.querySelectorAll('main > section[id^="page-"]').forEach(function(sec){
      sec.classList.toggle('hidden', sec.id !== 'page-' + p);
    });
  });
});
// subtabs + glider
function moveGlider(idx){document.getElementById('glider').style.transform='translateX('+(idx*100)+'%)'}
document.querySelectorAll('.subtab').forEach(function(t,i){
  t.addEventListener('click',function(){
    document.querySelectorAll('.subtab').forEach(function(x){x.classList.remove('on')});
    t.classList.add('on');
    moveGlider(i);
    renderRef(t.getAttribute('data-f'));
  });
});
// iso chips
document.querySelectorAll('.iso-chip').forEach(function(c){
  c.addEventListener('click',function(){
    document.querySelectorAll('.iso-chip').forEach(function(x){x.classList.remove('on')});
    c.classList.add('on');
    ISO = parseInt(c.getAttribute('data-iso'),10);
    updateSun();
    document.getElementById('recIso').textContent = ISO;
    document.getElementById('sensorIso').textContent = ISO;
    renderRec(lastEvIso);
    recomputeSensor();
  });
});

// sun16
function updateSun(){
  var ape = parseFloat(document.getElementById('lightSel').value);
  var shut = near(ISO);
  document.getElementById('sunApe').textContent = fnum(ape);
  document.getElementById('sunShut').textContent = '1/'+shut;
  var stops={'16':0,'11':1,'8':2,'5.6':3,'4':4,'2.8':5};
  var cur=stops[String(ape)], apes=['16','11','8','5.6','4','2.8'], eq='';
  [cur,cur-1,cur+1].forEach(function(i){
    if(i<0||i>5)return;
    var a=apes[i], sh=near(shut*Math.pow(2,cur-i));
    eq+='<div class="row'+(i===cur?' hl':'')+'"><span>'+fnum(a)+' + 1/'+sh+'</span><span>ISO '+ISO+'</span></div>';
  });
  document.getElementById('sunEquiv').innerHTML=eq;
}
document.getElementById('lightSel').addEventListener('change',updateSun);

// safe shutter
document.getElementById('focal').addEventListener('input',function(){
  var fl=parseFloat(this.value)||50;
  document.getElementById('safeVal').textContent='1/'+near(fl);
});

// camera meter
var camOn=false;
// 优先后置（exact 强制），无后置则回退到后置偏好，再回退任意摄像头
var camConstraints=[
  {video:{facingMode:{exact:'environment'}}},
  {video:{facingMode:'environment'}},
  {video:true}
];
// 当前媒体流。必须在停止时显式 stop 每一条 track：
// 只把 srcObject 置空不会关摄像头，指示灯会一直亮着，电池也一直在耗。
var camStream=null;

function startCam(i){
  if(i>=camConstraints.length){
    document.getElementById('camTip').textContent='无法访问任何摄像头，请检查权限或设备。';
    return;
  }
  navigator.mediaDevices.getUserMedia(camConstraints[i]).then(function(s){
    var v=document.getElementById('cam'),ph=document.getElementById('camPh'),ovl=document.getElementById('camOvl');
    camStream=s;
    v.srcObject=s;camOn=true;ph.style.display='none';ovl.style.display='block';
    document.getElementById('camBtn').textContent='停止测光';
    document.getElementById('camBtn').classList.add('on');
    loop();
  }).catch(function(){startCam(i+1)});
}

/** 关掉摄像头：停循环、停 track、复位界面 */
function stopCam(){
  camOn=false;
  if(camStream){
    try{ camStream.getTracks().forEach(function(t){t.stop()}); }catch(e){}
    camStream=null;
  }
  var v=document.getElementById('cam');
  if(v) v.srcObject=null;
  var ph=document.getElementById('camPh'),ovl=document.getElementById('camOvl');
  if(ph) ph.style.display='';
  if(ovl) ovl.style.display='none';
  var btn=document.getElementById('camBtn');
  if(btn){ btn.textContent='启动摄像头'; btn.classList.remove('on'); }
  var tip=document.getElementById('camTip');
  if(tip) tip.textContent='摄像头已关闭（省电）。需要测光时再启动。';
}

// 切到别的 App / 锁屏时暂停。
// 原来 requestAnimationFrame 一旦启动就无限跑，页面进后台浏览器虽会降频，
// 但摄像头 track 一直开着 —— 手机测光一轮下来肉眼可见掉电。
document.addEventListener('visibilitychange',function(){
  if(document.hidden && camOn) stopCam();
});

document.getElementById('camBtn').addEventListener('click',function(){
  if(camOn){ stopCam(); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    document.getElementById('camTip').textContent='此浏览器不支持摄像头，请用手机 Chrome / Safari 打开 https 页面。';
    return;
  }
  startCam(0);
});
function loop(){
  // willReadFrequently：声明这块 canvas 会被频繁 getImageData 读回。
  // 不声明时浏览器默认把 canvas 放在 GPU 上，每次读回都要同步拷贝，
  // 控制台会持续告警，且实际开销正是测光循环里最贵的一步。
  var v=document.getElementById('cam'),cv=document.createElement('canvas'),ctx=cv.getContext('2d',{willReadFrequently:true});
  cv.width=64;cv.height=48;
  // 测光只需要"当前有多亮"，不需要流畅动画。
  // 按 60fps 跑等于每帧一次 drawImage + getImageData（后者要同步回读像素，
  // 是 CPU 上最贵的一步）。降到 8fps，读数依然跟得上手，耗电明显下降。
  var MIN_INTERVAL=125, lastAt=0;
  (function step(){
    if(!camOn)return;
    var now=(window.performance&&performance.now)?performance.now():Date.now();
    if(now-lastAt<MIN_INTERVAL){ requestAnimationFrame(step); return; }
    lastAt=now;
    try{
      ctx.drawImage(v,0,0,64,48);
      var d=ctx.getImageData(0,0,64,48).data,sum=0;
      for(var i=0;i<d.length;i+=4)sum+=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
      var lum=sum/(d.length/4),pct=Math.round(lum/255*100);
      document.getElementById('lumBar').style.width=pct+'%';
      document.getElementById('lumVal').textContent=pct+'%';
      document.getElementById('ovlPct').textContent=pct;
      // 估算照度（仅供参考，非校准 lux；手机自动曝光，绝对值不可靠）
      var lux=Math.round(50000*Math.pow(pct/100,4));
      document.getElementById('ovlLux').textContent=lux;
      // FC（英尺-烛光）：1 fc ≈ 10.764 lux
      document.getElementById('ovlFc').textContent=Math.round(lux/10.764);
      // EV：基于粗略 lux 估算（仅供参考）；高 ISO 应给更快快门，故 +log2(ISO/100)
      var ev100=Math.log2(lux/2.5);
      var evIso=ev100+Math.log2(ISO/100);
      lastEvIso=evIso;
      document.getElementById('evVal').textContent=isFinite(evIso)?evIso.toFixed(1):'--';
      renderRec(evIso);
      drawHist(d,300,56);
      var tip='',verdict='';
      if(pct<25){tip='偏暗：开大光圈 / 放慢快门 / 用闪光。';verdict='偏暗';}
      else if(pct>80){tip='偏亮：收小光圈，防过曝（负片可偏亮半级）。';verdict='偏亮';}
      else {tip='亮度适中，按阳光16或机内测光设参数即可。';verdict='适中';}
      document.getElementById('camTip').textContent=tip+'（反射光、粗略参考）';
      document.getElementById('ovlVerdict').textContent=verdict;
    }catch(e){}
    requestAnimationFrame(step);
  })();
}

// 最近一次 EV（供 ISO 切换时重渲染推荐表）
var lastEvIso=NaN;
var histCv=document.getElementById('hist');
var histCtx=histCv?histCv.getContext('2d'):null;
// 把秒数格式化为最接近的相机标准快门档
function fmtShut(t){
  var denoms=[8000,4000,2000,1000,500,250,125,60,30,15,8,4,2];
  if(t>=1){
    var slow=[30,15,8,4,2,1],best=Math.min(slow[0],t);
    for(var i=0;i<slow.length;i++){ if(Math.abs(slow[i]-t)<=Math.abs(best-t)) best=slow[i]; }
    return (Math.round(best*10)/10)+'s';
  }
  var x=1/t,bd=denoms[0];
  for(var j=0;j<denoms.length;j++){ if(Math.abs(denoms[j]-x)<Math.abs(bd-x)) bd=denoms[j]; }
  return '1/'+bd;
}
// 基于 EV@ISO 生成推荐光圈/快门（互易律自动补偿）的 HTML
function buildRecHTML(evIso){
  if(!isFinite(evIso)){
    return '<div class="rec-hint">传感器/摄像头就绪后按实测光线给推荐光圈 / 快门</div>';
  }
  var fs=[2.8,4,5.6,8,11,16],html='';
  for(var i=0;i<fs.length;i++){
    var f=fs[i],t=f*f/Math.pow(2,evIso);
    html+='<div class="rec-row"><span class="rec-f">f/'+f+'</span><span class="rec-s">'+fmtShut(t)+'</span></div>';
  }
  return html;
}
function renderRec(evIso){ var g=document.getElementById('recGrid'); if(g)g.innerHTML=buildRecHTML(evIso); }
function renderSensorRec(evIso){ var g=document.getElementById('sensorRecGrid'); if(g)g.innerHTML=buildRecHTML(evIso); }

// 传感器读数 → 用 photon 同款入射光 EV 数学重算（含灰卡偏移）
function recomputeSensor(){
  if(!isFinite(lastSensorLux) || lastSensorLux<=0){ return; }
  var ev100 = Math.log2(lastSensorLux/2.5) + evOffset;   // EV@ISO100 + 灰卡偏移
  var evIso = ev100 + Math.log2(ISO/100);                // 换算到所选 ISO
  document.getElementById('sensorEv').textContent = evIso.toFixed(1);
  renderSensorRec(evIso);
}

// 环境光传感器（AmbientLightSensor，读手机硬件 ALS，与 Light Meter 同源）
function startSensor(){
  var status=document.getElementById('sensorStatus');
  if(!('AmbientLightSensor' in window)){
    status.textContent='本浏览器不支持环境光传感器（iOS Safari / 微信 / QQ 常见）。请用安卓 Chrome 打开，或改用下方摄像头测光。';
    return;
  }
  try{
    var s=new AmbientLightSensor({frequency:3});
    s.addEventListener('reading',function(){
      var lux=s.illuminance;
      if(!isFinite(lux))return;
      lastSensorLux=lux;
      document.getElementById('sensorLux').textContent=Math.round(lux);
      document.getElementById('sensorFc').textContent=Math.round(lux/10.764);
      recomputeSensor();
      status.textContent='✓ 环境光传感器已连接（真实硬件 ALS，与 Light Meter 同源读数）';
    });
    s.addEventListener('error',function(e){
      status.textContent='传感器启动失败：'+(e&&e.error?e.error.message:'未知错误')+'。可改用下方摄像头测光。';
    });
    s.start();
  }catch(e){
    status.textContent='传感器不可用：'+e.message+'。请用安卓 Chrome 或改用摄像头测光。';
  }
}
// RGB 直方图（红/绿/蓝三通道分布，用于看偏色与过曝）
function drawHist(d,w,h){
  if(!histCtx)return;
  var bins=32,rh=new Array(bins).fill(0),gh=new Array(bins).fill(0),bh=new Array(bins).fill(0);
  for(var i=0;i<d.length;i+=4){ rh[d[i]>>3]++; gh[d[i+1]>>3]++; bh[d[i+2]>>3]++; }
  var max=1;
  for(var b=0;b<bins;b++){ if(rh[b]>max)max=rh[b]; if(gh[b]>max)max=gh[b]; if(bh[b]>max)max=bh[b]; }
  var bw=w/bins;
  histCtx.clearRect(0,0,w,h);
  for(var k=0;k<bins;k++){
    var r2=rh[k]/max*h,g2=gh[k]/max*h,b2=bh[k]/max*h;
    histCtx.fillStyle='rgba(255,90,90,.55)'; histCtx.fillRect(k*bw,h-r2,bw-0.6,r2);
    histCtx.fillStyle='rgba(90,220,130,.55)'; histCtx.fillRect(k*bw,h-g2,bw-0.6,g2);
    histCtx.fillStyle='rgba(90,150,255,.55)'; histCtx.fillRect(k*bw,h-b2,bw-0.6,b2);
  }
}
renderRec(lastEvIso);

setHeroQuote();
renderRef('bw');
updateSun();
document.getElementById('focal').dispatchEvent(new Event('input'));

// 灰卡校准偏移滑块：实时重算传感器 EV
document.getElementById('evOffset').addEventListener('input',function(){
  evOffset=parseFloat(this.value)||0;
  document.getElementById('evOffsetVal').textContent=evOffset.toFixed(1);
  recomputeSensor();
});

// 启动环境光传感器（无需用户手势，但与摄像头不同源）
startSensor();

// 注册 Service Worker：胶片用户常在无网环境（山里、地铁）查参数，
// 离线能力是这个 PWA 的主要价值。
// 旧版这里做的是「注销 SW + 删缓存」，等于把离线能力关掉，已纠正。
// 版本更新由 sw.js 的 stale-while-revalidate 负责：先给缓存秒开，后台拉新版。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function (e) {
      console.warn('SW 注册失败', e);
    });
  });
}

// ===== 等效曝光换算 =====
// 与上面两个"按场景给建议"的工具互补：这里解决"手里已有参数,想换个拍法"。
// 选任一参数,其它自动补回同样亮度,并列出所有可用组合。
function initEvSwap(){
  if (!window.EVSwap) return;
  var apeSel=document.getElementById('swApe');
  var shutSel=document.getElementById('swShut');
  var isoSel=document.getElementById('swIso');
  var evOut=document.getElementById('swEv');
  var listOut=document.getElementById('swOut');
  var tipOut=document.getElementById('swTip');
  if(!apeSel||!shutSel||!isoSel||!evOut||!listOut) return;

  function refresh(from){
    var N=parseFloat(apeSel.value);
    var t=window.EVSwap.parseShutter(shutSel.value);
    var iso=parseFloat(isoSel.value);
    var ev=window.EVSwap.evOf(N,t,iso);
    if(!isFinite(ev)){ evOut.textContent='--'; listOut.innerHTML=''; return; }

    evOut.textContent=ev.toFixed(1);

    // 组合列表里把"当前选中的这组"高亮，用户才知道自己在哪一格
    var combos=window.EVSwap.combinations(ev,iso);
    var html='';
    for(var i=0;i<combos.length;i++){
      var c=combos[i];
      var on=(Math.abs(c.aperture-N)<0.01 && Math.abs(c.shutter-t)<1e-6);
      html+='<div class="so-item'+(on?' on':'')+'"><b>f/'+c.aperture+'</b> · '+window.EVSwap.formatShutter(c.shutter)+'</div>';
    }
    listOut.innerHTML=html||'<div class="so-item">这个亮度在当前 ISO 下没有合适的组合</div>';

    // 提示三件事：换到哪个方向、安全快门、胶片容错
    var tips=[];
    var safe=1/Number(document.getElementById('focal').value||50);
    if(t<safe && t>0){
      tips.push('⚠ 慢于安全快门（约 1/'+Math.round(1/safe)+'），手持可能糊');
    }
    if(t>=1){
      tips.push('长曝光：>1 秒要上三脚架，胶片还需补倒易律失效');
    }
    if(iso>=800){
      tips.push('ISO '+iso+' 颗粒明显，负片可接受，反转片慎用');
    }
    tipOut.textContent=tips.join('；')||'当前组合在手持范围内，可直接拍';
  }

  apeSel.addEventListener('change',function(){ applyChange('ape'); });
  shutSel.addEventListener('change',function(){ applyChange('shut'); });
  isoSel.addEventListener('change',function(){ applyChange('iso'); });

  // 改一个参数时，把另一个「拉回」同样亮度，而不是三个都变。
  // 用户改光圈就是想换景深，快门必须替他补上 —— 否则他得自己心算。
  //
  // 关键：锚点 EV 必须用「改动之前」的完整组合来算。
  // 直接用新光圈配旧快门去算 EV，得到的是改动后的亮度，
  // 再反解回来就成了恒等变换 —— 看起来"改了但没生效"。
  function applyChange(which) {
    var N = parseFloat(apeSel.value);
    var t = window.EVSwap.parseShutter(shutSel.value);
    var iso = parseFloat(isoSel.value);

    if (which === 'ape') {
      var anchor = window.EVSwap.evOf(prevN, prevT, iso);   // 旧光圈 + 旧快门
      if (isFinite(anchor)) {
        var nt = window.EVSwap.shutterFor(anchor, N, iso);  // 新光圈 + 同亮度
        if (isFinite(nt)) setShutterSelect(window.EVSwap.nearest(window.EVSwap.SHUTTERS, nt));
      }
    } else if (which === 'iso') {
      // ISO 变了，亮度基准也跟着变：保持光圈快门不变，
      // 画面会亮一档或暗一档 —— 这是物理事实，不该"自动补偿"掉。
      // 但要把快门提示更新，所以照样刷新。
    }
    // which === 'shut'：用户直接选了快门，不需要反解

    prevN = N;
    prevT = window.EVSwap.parseShutter(shutSel.value);
    refresh(which);
  }

  function setShutterSelect(sec){
    var opts=shutSel.options;
    for(var i=0;i<opts.length;i++){
      var v=window.EVSwap.parseShutter(opts[i].value);
      if(Math.abs(v-sec)<1e-9){ shutSel.selectedIndex=i; return; }
    }
  }

  var prevN=parseFloat(apeSel.value);
  var prevT=window.EVSwap.parseShutter(shutSel.value);
  refresh('init');
}
initEvSwap();

// ===== 胶卷记录 =====
// 按卷归档：胶片用户的心智单位就是"一卷"，按张记会把一件事拆成 36 条孤数据。
var rollStore = null;
var currentRollId = null;

function initRollBook() {
  if (!window.RollBook) return;
  rollStore = new window.RollBook.RollStore(window.localStorage);
  rollStore.load();

  // 记住上次打开的卷，切页面回来不用重选
  try {
    currentRollId = window.localStorage.getItem('film.currentRoll');
  } catch (e) { currentRollId = null; }
  if (currentRollId && !rollStore.get(currentRollId)) currentRollId = null;

  var btnNew = document.getElementById('btnNewRoll');
  if (btnNew) {
    btnNew.onclick = function () {
      var t = document.getElementById('newRollType');
      var l = document.getElementById('newRollLabel');
      var roll = rollStore.startRoll({
        type: t ? t.value : 'color',
        label: l ? l.value : '',
      });
      if (l) l.value = '';
      setCurrentRoll(roll.id);
      renderRolls();
      showRollDetail(roll.id);
    };
  }

  var btnBack = document.getElementById('btnRollBack');
  if (btnBack) btnBack.onclick = function () { showRollDetail(null); };

  var btnExp = document.getElementById('btnRollExport');
  if (btnExp) btnExp.onclick = function () {
    if (!currentRollId) return;
    var text = rollStore.exportText(currentRollId);
    copyText(text);
  };

  var btnLog = document.getElementById('btnLogShot');
  if (btnLog) btnLog.onclick = doLogShot;

  renderRolls();
  updateLogShotHint();
}

function setCurrentRoll(id) {
  currentRollId = id;
  try {
    if (id) window.localStorage.setItem('film.currentRoll', id);
    else window.localStorage.removeItem('film.currentRoll');
  } catch (e) { /* 隐私模式下忽略 */ }
  updateLogShotHint();
}

function updateLogShotHint() {
  var h = document.getElementById('logShotHint');
  if (!h) return;
  var roll = currentRollId && rollStore ? rollStore.get(currentRollId) : null;
  if (!roll) {
    h.textContent = '还没有打开的胶卷 —— 先去「胶卷」页开一卷。';
    return;
  }
  var sm = window.RollBook.summarize(roll);
  var name = roll.label || sm.film.name;
  h.textContent = '当前胶卷：' + name + '（已记 ' + sm.count + ' 张，剩 ' + sm.left + '）';
}

function doLogShot() {
  if (!rollStore) return;
  var roll = currentRollId && rollStore.get(currentRollId);
  if (!roll) {
    toast('先去「胶卷」页开一卷');
    return;
  }
  // 用当前实测 EV；没有传感器数据时退回最近一次的推荐值
  var ev = isFinite(lastEvIso) ? lastEvIso : (isFinite(EVSwap.evOf(5.6, 1/125, ISO)) ? EVSwap.evOf(5.6, 1/125, ISO) : NaN);
  if (!isFinite(ev)) { toast('还没有测光数据'); return; }

  var ape = 8;
  var t = EVSwap.shutterFor(ev, ape, ISO);
  var shutter = isFinite(t) ? EVSwap.formatShutter(EVSwap.nearest(EVSwap.SHUTTERS, t)) : '—';

  var r = rollStore.addShot(roll.id, {
    at: Date.now(), ev: ev, iso: ISO, aperture: ape, shutter: shutter, note: '',
  });
  if (!r.ok) {
    toast(r.reason === 'full' ? '这卷记满了' : '记录失败');
    return;
  }
  toast('已记第 ' + rollStore.get(roll.id).shots.length + ' 张');
  updateLogShotHint();
  renderRolls();
}

function renderRolls() {
  var box = document.getElementById('rollList');
  var empty = document.getElementById('rollEmpty');
  if (!box || !rollStore) return;
  var rolls = rollStore.list();
  if (empty) empty.style.display = rolls.length ? 'none' : '';
  box.innerHTML = '';
  rolls.forEach(function (roll) {
    var sm = window.RollBook.summarize(roll);
    var card = document.createElement('div');
    card.className = 'roll-card' + (roll.id === currentRollId ? ' on' : '');
    // 用 textContent 而非 innerHTML：卷名是用户输入，不能当 HTML 解析
    var title = document.createElement('div');
    title.className = 'rc-title';
    title.textContent = (roll.label || sm.film.name) + (roll.endedAt ? '' : ' · 进行中');
    var meta = document.createElement('div');
    meta.className = 'rc-meta';
    meta.textContent = sm.film.name + ' · ISO ' + roll.iso + ' · ' + sm.count + ' 张 · 剩 ' + sm.left;
    card.appendChild(title);
    card.appendChild(meta);
    card.onclick = function () { showRollDetail(roll.id); };
    box.appendChild(card);
  });
}

function showRollDetail(id) {
  var detail = document.getElementById('rollDetail');
  var list = document.getElementById('rollList');
  var empty = document.getElementById('rollEmpty');
  if (!detail) return;

  if (!id) {
    detail.classList.add('hidden');
    if (list) list.style.display = '';
    if (empty) empty.style.display = rollStore && rollStore.list().length ? 'none' : '';
    return;
  }
  var roll = rollStore.get(id);
  if (!roll) return;
  setCurrentRoll(id);
  renderRolls();

  detail.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (empty) empty.style.display = 'none';

  var sm = window.RollBook.summarize(roll);
  var title = document.getElementById('rollDetailTitle');
  if (title) title.textContent = roll.label || sm.film.name;
  var meta = document.getElementById('rollDetailMeta');
  if (meta) {
    var range = sm.evRange ? ('EV ' + sm.evRange.min.toFixed(1) + ' ~ ' + sm.evRange.max.toFixed(1)) : '还没有记录';
    meta.textContent = sm.film.name + ' · ISO ' + roll.iso + ' · ' + sm.count + ' 张 · ' + range;
  }

  var shots = document.getElementById('rollShots');
  if (shots) {
    shots.innerHTML = '';
    if (!roll.shots.length) {
      var h = document.createElement('div');
      h.className = 'so-item';
      h.textContent = '这卷还没有记录。去测光页点「记一张」。';
      shots.appendChild(h);
    }
    roll.shots.forEach(function (s) {
      var d = new Date(s.at);
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      var item = document.createElement('div');
      item.className = 'so-item';
      item.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) +
        '  EV' + s.ev.toFixed(1) + '  f/' + window.RollBook.trimNum(s.aperture) + '  ' + s.shutter;
      shots.appendChild(item);
    });
  }
}

/** 复制到剪贴板：老浏览器没有 clipboard API，退化到 execCommand */
function copyText(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast('已复制'); },
      function () { toast('复制失败'); });
    return;
  }
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('已复制');
  } catch (e) { toast('复制失败'); }
}

/** 轻提示：没有引入 UI 库，自己做一个 */
var toastTimer = 0;
function toast(msg) {
  var el = document.getElementById('toastEl');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastEl';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
}

initRollBook();
