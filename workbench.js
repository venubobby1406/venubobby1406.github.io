/* ============================================================
   ihatellom — the bench
   Shared video workbench engine: trim · to-mp4 · compress · gif · audio
   Plus the bench brain: it reads your file, suggests the right moves,
   chains tools without re-dropping, and accepts drops anywhere on the page.

   Used by tools.html and every recipe page.
   Config via window.WB_CONFIG = { mode: 'mp4', anywhere: true, moves: true }  (set BEFORE this script)
   No uploads, no accounts — everything stays in the tab.
   ============================================================ */
(function(){
  var wb = { file:null, dur:0, inT:0, outT:0, bps:1600000, busy:false, lastURL:null,
             hasAudio:null, lastBlob:null, lastName:'', lastType:'' };
  var cfg = window.WB_CONFIG || {};
  function $(id){ return document.getElementById(id); }
  var dropEl=$('wbDrop'), fileIn=$('wbFile'), pickBtn=$('wbPick'), work=$('wbWork'),
      prev=$('wbPrev'), meta=$('wbMeta'), change=$('wbChange'),
      inR=$('wbIn'), outR=$('wbOut'), inL=$('wbInL'), outL=$('wbOutL'),
      prog=$('wbProg'), bar=$('wbBar'), pct=$('wbPct'),
      res=$('wbRes'), dl=$('wbDl'), rv=$('wbOutV'), ra=$('wbOutA'), rg=$('wbOutG'),
      mp4Info=$('wbMp4Info'), est=$('wbEst'), movesEl=$('wbMoves'), chainBtn=$('wbChain');
  if(!dropEl) return;
  if(!window.MediaRecorder){ dropEl.style.display='none'; return; }

  /* ---- self-contained helpers (the bench never depends on page scripts) ---- */
  function pickMime(list){
    if(!window.MediaRecorder) return '';
    for(var i=0;i<list.length;i++){ try{ if(MediaRecorder.isTypeSupported(list[i])) return list[i]; }catch(e){} }
    return '';
  }
  function saveBlob(url,name){ var a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); }

  var VID_MIMES=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  var GIF_MAX=8, GIF_FPS=10, GIF_W=560;
  var WORKER_URL='vendor/gif.worker.js';
  try{ if(window.GIF_WORKER_SRC){ WORKER_URL=URL.createObjectURL(new Blob([window.GIF_WORKER_SRC],{type:'text/javascript'})); } }catch(e){}

  /* ---- injected styles (drop-anywhere overlay + the moves strip) ---- */
  (function(){
    if(document.getElementById('wb-style')) return;
    var s=document.createElement('style'); s.id='wb-style';
    s.textContent =
      'body.wb-dropping{outline:2px dashed rgba(180,122,0,.55);outline-offset:-10px}'+
      'body.wb-dropping::after{content:"DROP IT - THE BENCH HAS IT";position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:999;'+
      'font-family:"Geist Mono",monospace;font-size:10px;letter-spacing:.16em;background:#151515;color:#F4F2EE;padding:10px 16px;border-radius:999px;'+
      'box-shadow:0 18px 40px -18px rgba(0,0,0,.55);pointer-events:none}'+
      '.wbmoves{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 14px;border:1px solid rgba(21,21,21,.12);border-radius:14px;background:#ECE9E2}'+
      '.wbmoves .lead{font-family:"Geist Mono",monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#9B968D;margin-right:2px}'+
      '.wbmove{border:1px solid rgba(21,21,21,.12);background:#FBFAF8;border-radius:999px;padding:7px 13px;font:inherit;font-size:12px;font-weight:600;color:#6E6A63;cursor:pointer;transition:color .12s ease,border-color .12s ease}'+
      '.wbmove:hover{color:#151515;border-color:rgba(21,21,21,.3)}'+
      '.wbmove.primary{background:#151515;border-color:#151515;color:#F4F2EE}'+
      '.wbmove:disabled{opacity:.5;cursor:default;pointer-events:none}';
    document.head.appendChild(s);
  })();

  function wbStatus(el,t,err){ if(!el)return; el.textContent=t; el.classList.toggle('err',!!err); }
  function fmt(s){ s=Math.max(0,s); var m=Math.floor(s/60), r=s-m*60; return m+':'+(r<10?'0':'')+r.toFixed(1); }
  function progShow(){ prog.style.display='flex'; progSet(0); }
  function progSet(p){ p=Math.max(0,Math.min(1,p)); bar.style.width=(p*100).toFixed(0)+'%'; pct.textContent=(p*100).toFixed(0)+'%'; }
  function progHide(){ prog.style.display='none'; }
  function busy(b){
    wb.busy=b;
    [pickBtn,change,$('wbGoTrim'),$('wbGoMp4'),$('wbGoComp'),$('wbGoGif'),$('wbGoAudio'),$('wbGoSpeed')].forEach(function(el){ if(el) el.disabled=b; });
    Array.prototype.forEach.call(document.querySelectorAll('.wmode,.wpreset,.wbmove'), function(el){ el.disabled=b; });
  }

  /* ---- the bench brain: what IS this file, and what does it probably want? ---- */
  function detectAudio(v){
    try{ if(typeof v.mozHasAudio === 'boolean') return v.mozHasAudio; }catch(e){}
    try{
      var s = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
      if(!s) return null;
      var n = s.getAudioTracks().length;
      s.getTracks().forEach(function(t){ try{ t.stop(); }catch(e2){} });
      return n>0;
    }catch(e3){ return null; }
  }
  function switchMode(mode){
    var chip=document.querySelector('.wmode[data-pane="'+mode+'"]');
    if(chip) chip.click();
  }
  function renderMoves(){
    if(!movesEl || !wb.file) return;
    var t=(wb.file.type||'').toLowerCase(), n=(wb.file.name||'').toLowerCase();
    var audioOnly = t.indexOf('audio')===0 || /\.(mp3|wav|m4a|ogg|flac|aac)$/.test(n);
    var isWebm = t.indexOf('webm')>-1 || /\.webm$/.test(n);
    var isMov = /\.mov$/.test(n) || t.indexOf('quicktime')>-1;
    var isMp4 = t.indexOf('mp4')>-1 || /\.(mp4|m4v)$/.test(n);
    var isGif = t.indexOf('gif')>-1 || /\.gif$/.test(n);
    var list=[];
    if(audioOnly){
      list.push({mode:'audio', label:'Convert to WAV', primary:true});
    } else if(isGif){
      list.push({mode:'mp4', label:'GIF -> MP4', primary:true});
      list.push({mode:'trim', label:'Trim it'});
    } else {
      if(isWebm || isMov || !isMp4) list.push({mode:'mp4', label:'To MP4', primary:true});
      if(wb.dur > 2) list.push({mode:'trim', label:'Trim it'});
      if(wb.dur > 20) list.push({mode:'speed', label:'Speed it up'});
      if(wb.dur > 1) list.push({mode:'gif', label:'Best 8s as GIF'});
      if(wb.hasAudio !== false) list.push({mode:'audio', label:'Pull the audio'});
      list.push({mode:'compress', label:'Shrink for chat'});
    }
    movesEl.innerHTML='';
    var lead=document.createElement('span'); lead.className='lead'; lead.textContent='NEXT MOVES';
    movesEl.appendChild(lead);
    list.forEach(function(m){
      var b=document.createElement('button'); b.type='button';
      b.className='wbmove'+(m.primary?' primary':'');
      b.textContent=m.label;
      b.addEventListener('click', function(){
        switchMode(m.mode);
        var card=dropEl.closest('.tool')||dropEl;
        var r=card.getBoundingClientRect();
        if(r.top<0 || r.bottom>window.innerHeight) card.scrollIntoView({behavior:'smooth', block:'center'});
      });
      movesEl.appendChild(b);
    });
    movesEl.style.display='flex';
  }

  /* ---- tools chain on the result, without re-dropping ---- */
  function offerChain(){
    if(!chainBtn) return;
    chainBtn.style.display='inline';
    chainBtn.onclick=function(){
      if(!wb.lastBlob || wb.busy) return;
      try{
        var f2=new File([wb.lastBlob], wb.lastName||('result-'+Date.now()), {type: wb.lastType||'video/webm'});
        load(f2);
      }catch(e){}
    };
  }

  function encodeWav(ab){
    var ch=Math.min(2,ab.numberOfChannels), sr=ab.sampleRate, n=ab.length;
    var bytes=44+n*ch*2, dv=new DataView(new ArrayBuffer(bytes));
    function wstr(o,s){ for(var i=0;i<s.length;i++) dv.setUint8(o+i,s.charCodeAt(i)); }
    wstr(0,'RIFF'); dv.setUint32(4,bytes-8,true); wstr(8,'WAVE'); wstr(12,'fmt ');
    dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,ch,true);
    dv.setUint32(24,sr,true); dv.setUint32(28,sr*ch*2,true); dv.setUint16(32,ch*2,true); dv.setUint16(34,16,true);
    wstr(36,'data'); dv.setUint32(40,n*ch*2,true);
    var chans=[]; for(var c=0;c<ch;c++) chans.push(ab.getChannelData(c));
    var off=44;
    for(var i=0;i<n;i++){
      for(var c2=0;c2<ch;c2++){
        var s2=Math.max(-1,Math.min(1,chans[c2][i]));
        dv.setInt16(off, s2<0?s2*32768:s2*32767, true); off+=2;
      }
    }
    return new Blob([dv.buffer],{type:'audio/wav'});
  }
  window.encodeWav = encodeWav;

  function showResult(blob,name,kind){
    if(wb.lastURL) URL.revokeObjectURL(wb.lastURL);
    wb.lastURL=URL.createObjectURL(blob);
    wb.lastBlob=blob; wb.lastName=name; wb.lastType=blob.type;
    rv.style.display='none'; ra.style.display='none'; rg.style.display='none';
    if(kind==='video'){ rv.src=wb.lastURL; rv.style.display='block'; }
    else if(kind==='audio'){ ra.src=wb.lastURL; ra.style.display='block'; }
    else { rg.src=wb.lastURL; rg.style.display='block'; }
    dl.href=wb.lastURL; dl.download=name;
    res.style.display='grid';
    offerChain();
    // never auto-download: the result waits behind the Download button.
    // (earlier versions fired a save the moment a render finished — that
    //  surprised people with files they never asked for.)
  }

  function renderClip(o){
    return new Promise(function(resolve,reject){
      var v=o.video, inT=Math.max(0,o.in), outT=Math.min(o.out, v.duration||o.out);
      var vw=v.videoWidth||1280, vh=v.videoHeight||720;
      var scale=Math.min(1,(o.maxW||1920)/vw);
      var cw=Math.max(2,Math.round(vw*scale/2)*2), chh=Math.max(2,Math.round(vh*scale/2)*2);
      var canvas=document.createElement('canvas'); canvas.width=cw; canvas.height=chh;
      var ctx=canvas.getContext('2d');
      v.pause();
      if(Math.abs(v.currentTime-inT)<0.05){ start(); }
      else { v.addEventListener('seeked', function h(){ v.removeEventListener('seeked',h); start(); }); v.currentTime=inT; }
      function start(){
        var rec=null, stopped=false, wd=null, lastT=-1, stallMs=0, lastTick=0;
        var rate = (o.rate && o.rate>0) ? o.rate : 1;
        var startMs = Date.now();
        // speed-up: play faster, then the recorded (real-time) stream is shorter than the source span
        try{ v.playbackRate = rate; }catch(e){}
        var effOut = inT + (outT - inT) / rate; // wall-clock end for the accelerated render
        function stopOnce(){ if(stopped) return; stopped=true; if(wd){ clearInterval(wd); wd=null; } try{ v.playbackRate=1; }catch(e){} try{ rec.stop(); }catch(e){} }
        function tick(){
          if(stopped) return;
          var now=Date.now(), dt=lastTick?(now-lastTick):0; lastTick=now;
          if(v.currentTime<=lastT+0.001 && !v.ended) stallMs+=dt; else stallMs=0;
          lastT=v.currentTime;
          ctx.drawImage(v,0,0,cw,chh);
          if(o.onTick) o.onTick(Math.min(v.currentTime,outT));
          // for speed-up the render (and recording) ends when the accelerated wall-clock span elapses
          if(rate>1 && (now - startMs) >= (outT - inT)/rate * 1000){ stopOnce(); return; }
          if(v.ended || v.currentTime>=outT){ stopOnce(); return; }
          if(stallMs>4000){ stopOnce(); reject(new Error('playback stalled')); }
        }
        try{
          var tracks=canvas.captureStream(o.fps||30).getVideoTracks();
          var vs=null;
          try{ vs = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null); }catch(e2){}
          if(vs){ vs.getAudioTracks().forEach(function(t){ tracks.push(t); }); }
          var mime=o.mime||'';
          var ropts = mime ? {mimeType:mime} : {};
          if(o.bps && mime.indexOf('video')>-1) ropts.videoBitsPerSecond=o.bps;
          rec=new MediaRecorder(new MediaStream(tracks), ropts);
          var chunks=[];
          rec.ondataavailable=function(e){ if(e.data && e.data.size) chunks.push(e.data); };
          rec.onstop=function(){
            v.onended=null; v.pause();
            resolve(new Blob(chunks,{type:(mime.split(';')[0]||'video/webm')}));
          };
          rec.start(250);
          v.onended=stopOnce;
          // two drivers: rAF for smoothness, an interval so renders still complete when the tab is hidden or occluded
          wd=setInterval(tick, 200);
          v.play().then(function(){
            requestAnimationFrame(function loop(){ if(stopped) return; tick(); requestAnimationFrame(loop); });
          }).catch(function(err){ stopOnce(); reject(err); });
        }catch(err){ reject(err); }
      }
    });
  }

  function renderGifClip(o){
    return new Promise(function(resolve,reject){
      if(!window.GIF){ reject(new Error('gif library missing')); return; }
      var v=o.video;
      var inT=Math.max(0,o.in), outT=Math.min(Math.min(o.out, v.duration||o.out), inT+GIF_MAX);
      var scale=Math.min(1, GIF_W/(v.videoWidth||1280));
      var cw=Math.max(2,Math.round((v.videoWidth||1280)*scale/2)*2), chh=Math.max(2,Math.round((v.videoHeight||720)*scale/2)*2);
      var canvas=document.createElement('canvas'); canvas.width=cw; canvas.height=chh;
      var ctx=canvas.getContext('2d');
      var delay=Math.round(1000/GIF_FPS);
      var gif=new GIF({workers:2, quality:8, width:cw, height:chh, workerScript:WORKER_URL, dither:false});
      var frames=0;
      gif.on('progress', function(p){ if(o.onProgress) o.onProgress(p); });
      gif.on('finished', function(blob){ v.pause(); resolve(blob); });
      v.pause();
      if(Math.abs(v.currentTime-inT)<0.05){ run(); }
      else { v.addEventListener('seeked', function h(){ v.removeEventListener('seeked',h); run(); }); v.currentTime=inT; }
      function run(){
        var last=-1, wd=null, ended=false, lastT=-1, stallMs=0, lastTick=0, stalled=false;
        function done(){
          if(ended) return; ended=true;
          if(wd){ clearInterval(wd); wd=null; }
          if(stalled){ reject(new Error('stalled')); return; }
          if(frames<2){ reject(new Error('too short')); return; }
          gif.render();
        }
        function tick(){
          if(ended) return;
          var now=Date.now(), dt=lastTick?(now-lastTick):0; lastTick=now;
          if(v.currentTime<=lastT+0.001 && !v.ended) stallMs+=dt; else stallMs=0;
          lastT=v.currentTime;
          ctx.drawImage(v,0,0,cw,chh);
          if(v.currentTime-last >= 1/GIF_FPS && !v.ended){
            last=v.currentTime; frames++; gif.addFrame(ctx,{copy:true,delay:delay});
            if(o.onTick) o.onTick(v.currentTime);
          }
          if(v.ended || v.currentTime>=outT){ done(); return; }
          if(stallMs>4000){ stalled=true; done(); }
        }
        wd=setInterval(tick, Math.round(1000/GIF_FPS));
        v.play().then(function(){
          requestAnimationFrame(function loop(){ if(ended) return; tick(); requestAnimationFrame(loop); });
        }).catch(function(err){ if(wd){ clearInterval(wd); wd=null; } ended=true; reject(err); });
      }
    });
  }

  /* ---- loading a file onto the bench ---- */
  function pick(){ fileIn.click(); }
  pickBtn.addEventListener('click', function(e){ e.stopPropagation(); pick(); });
  dropEl.addEventListener('click', function(e){ if(e.target.closest('button')) return; pick(); });
  ['dragenter','dragover'].forEach(function(ev){ dropEl.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); dropEl.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(ev){ dropEl.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); dropEl.classList.remove('over'); }); });
  dropEl.addEventListener('drop', function(e){ e.stopPropagation(); var f=e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if(f) load(f); });
  fileIn.addEventListener('change', function(){ if(fileIn.files && fileIn.files[0]) load(fileIn.files[0]); });
  change.addEventListener('click', function(e){ e.stopPropagation(); pick(); });

  /* ---- drop anywhere on the page ---- */
  if(cfg.anywhere !== false){
    function isFileDrag(e){ try{ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types||[], 'Files') > -1; }catch(err){ return false; } }
    document.addEventListener('dragenter', function(e){ if(!isFileDrag(e) || wb.busy) return; e.preventDefault(); document.body.classList.add('wb-dropping'); });
    document.addEventListener('dragover', function(e){ if(!isFileDrag(e)) return; e.preventDefault(); });
    document.addEventListener('dragleave', function(e){ if(e.relatedTarget === null) document.body.classList.remove('wb-dropping'); });
    document.addEventListener('drop', function(e){
      if(!isFileDrag(e)) return;
      e.preventDefault(); document.body.classList.remove('wb-dropping');
      var f=e.dataTransfer.files && e.dataTransfer.files[0];
      if(!f || wb.busy) return;
      load(f);
      var card=dropEl.closest('.tool')||dropEl;
      var r=card.getBoundingClientRect();
      if(r.top<0 || r.bottom>window.innerHeight) card.scrollIntoView({behavior:'smooth', block:'center'});
    });
  }

  function load(f){
    if(wb.busy) return;
    if(prev.src) URL.revokeObjectURL(prev.src);
    if(movesEl) movesEl.style.display='none';
    if(chainBtn) chainBtn.style.display='none';
    prev.src=URL.createObjectURL(f);
    prev.onerror=function(){ wbStatus($('wbDropSt'),'This browser cannot play that file — try MP4 or WebM.',true); };
    prev.onloadedmetadata=function(){
      if(!isFinite(prev.duration)){
        // MediaRecorder WebM files often report Infinity until seeked — nudge the browser into computing the real duration
        prev.currentTime=1e7;
        prev.onseeked=function(){ prev.onseeked=null; prev.currentTime=0; ready(f); };
        return;
      }
      ready(f);
    };
  }

  function ready(f){
    var d=prev.duration;
    if(!isFinite(d) || d<=0){ wbStatus($('wbDropSt'),'Could not read this file\'s duration — try another file.',true); return; }
    wb.file=f; wb.dur=d;
    wb.hasAudio = detectAudio(prev);
    inR.max=wb.dur; outR.max=wb.dur; inR.value=0; outR.value=wb.dur;
    wb.inT=0; wb.outT=wb.dur;
    dropEl.style.display='none'; work.style.display='grid';
    meta.textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB · '+fmt(wb.dur);
    mp4Info.textContent = /\.mp4$/i.test(f.name)
      ? 'Looks like it\'s already MP4 — converting re-encodes anyway (real time).'
      : (/\.webm$/i.test(f.name)
        ? 'Converts the whole file to MP4 — for players and editors that refuse WebM.'
        : 'Converts the whole file to MP4 — the format that opens everywhere.');
    updateLabels();
    renderMoves();
  }

  function updateLabels(){
    inL.textContent=fmt(wb.inT); outL.textContent=fmt(wb.outT);
    if(wb.dur) est.textContent='~'+(((wb.bps+128000)*wb.dur)/8/1048576).toFixed(1)+' MB output · full file, '+fmt(wb.dur);
  }
  inR.addEventListener('input', function(){
    wb.inT=parseFloat(inR.value)||0;
    if(wb.inT>=wb.outT){ wb.inT=Math.max(0,wb.outT-0.2); inR.value=wb.inT; }
    prev.currentTime=wb.inT; updateLabels();
  });
  outR.addEventListener('input', function(){
    wb.outT=parseFloat(outR.value)||0;
    if(wb.outT<=wb.inT){ wb.outT=Math.min(wb.dur,wb.inT+0.2); outR.value=wb.outT; }
    prev.currentTime=wb.outT; updateLabels();
  });

  /* ---- modes ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.wmode'), function(btn){
    btn.addEventListener('click', function(){
      Array.prototype.forEach.call(document.querySelectorAll('.wmode'), function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      ['trim','mp4','compress','gif','audio','speed'].forEach(function(m){
        var p=$('pane-'+m);
        if(p) p.style.display = (m===btn.getAttribute('data-pane')) ? 'grid' : 'none';
      });
    });
  });

  /* ---- presets ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.wpreset'), function(btn){
    btn.addEventListener('click', function(){
      Array.prototype.forEach.call(document.querySelectorAll('.wpreset'), function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      wb.bps=parseInt(btn.getAttribute('data-bps'),10)||1600000;
      updateLabels();
    });
  });

  /* ---- actions ---- */
  $('wbGoTrim').addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    if(wb.outT-wb.inT < 0.4){ wbStatus($('wbTrimSt'),'Pick at least half a second between Start and End.',true); return; }
    var mime=pickMime(VID_MIMES);
    busy(true); progShow(); wbStatus($('wbTrimSt'),'Rendering in real time — keep this tab visible.');
    renderClip({video:prev, in:wb.inT, out:wb.outT, mime:mime, onTick:function(t){ progSet((t-wb.inT)/(wb.outT-wb.inT)); }})
      .then(function(blob){
        progSet(1); progHide(); busy(false);
        var ext=mime.indexOf('mp4')>-1?'.mp4':'.webm';
        showResult(blob,'trimmed-'+Date.now()+ext,'video');
        wbStatus($('wbTrimSt'),'Done — a '+fmt(wb.outT-wb.inT)+' cut is ready below. Hit Download to save it.');
      })
      .catch(function(){ progHide(); busy(false); wbStatus($('wbTrimSt'),'Render failed — try again, or another file.',true); });
  });

  $('wbGoMp4').addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    var mime=pickMime(['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4']);
    if(!mime){ wbStatus($('wbMp4St'),'This browser cannot record MP4 — try Chrome or Edge for this one.',true); return; }
    busy(true); progShow(); wbStatus($('wbMp4St'),'Converting in real time — keep this tab visible.');
    renderClip({video:prev, in:0, out:wb.dur, mime:mime, onTick:function(t){ progSet(t/wb.dur); }})
      .then(function(blob){
        progSet(1); progHide(); busy(false);
        showResult(blob,'converted-'+Date.now()+'.mp4','video');
        wbStatus($('wbMp4St'),'Done — your MP4 is ready below. Hit Download to save it.');
      })
      .catch(function(){ progHide(); busy(false); wbStatus($('wbMp4St'),'Conversion failed — try another file.',true); });
  });

  $('wbGoComp').addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    var mime=pickMime(VID_MIMES);
    busy(true); progShow(); wbStatus($('wbCompSt'),'Re-encoding at ~'+(wb.bps/1e6).toFixed(1)+' Mbps — real time.');
    renderClip({video:prev, in:0, out:wb.dur, mime:mime, bps:wb.bps, onTick:function(t){ progSet(t/wb.dur); }})
      .then(function(blob){
        progSet(1); progHide(); busy(false);
        var ext=mime.indexOf('mp4')>-1?'.mp4':'.webm';
        showResult(blob,'compressed-'+Date.now()+ext,'video');
        wbStatus($('wbCompSt'),'Done — '+(blob.size/1048576).toFixed(1)+' MB. Original was '+(wb.file.size/1048576).toFixed(1)+' MB.');
      })
      .catch(function(){ progHide(); busy(false); wbStatus($('wbCompSt'),'Compress failed — try again.',true); });
  });

  $('wbGoGif').addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    var span=wb.outT-wb.inT;
    var note = span>GIF_MAX ? ' (clamped to '+GIF_MAX+'s — GIFs get heavy fast)' : '';
    busy(true); progShow(); wbStatus($('wbGifSt'),'Capturing frames'+note+'…');
    renderGifClip({video:prev, in:wb.inT, out:wb.outT,
      onTick:function(t){ progSet((t-wb.inT)/Math.min(span,GIF_MAX)); },
      onProgress:function(p){ progSet(p); wbStatus($('wbGifSt'),'Encoding ('+Math.round(p*100)+'%)…'); }})
      .then(function(blob){
        progSet(1); progHide(); busy(false);
        showResult(blob,'clip-'+Date.now()+'.gif','gif');
        wbStatus($('wbGifSt'),'GIF made — '+(blob.size/1024).toFixed(0)+' KB, loops forever.');
      })
      .catch(function(e){ progHide(); busy(false); wbStatus($('wbGifSt'), e && e.message==='too short' ? 'That range is too short — give it at least half a second.' : 'GIF failed — try again.', true); });
  });

  $('wbGoAudio').addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    busy(true); wbStatus($('wbAudioSt'),'Decoding audio…');
    wb.file.arrayBuffer().then(function(buf){
      var AC=window.AudioContext||window.webkitAudioContext;
      var ac=new AC();
      return ac.decodeAudioData(buf).then(function(ab){ try{ ac.close(); }catch(e){} return ab; });
    }).then(function(ab){
      var wav=encodeWav(ab);
      busy(false);
      showResult(wav,'audio-'+Date.now()+'.wav','audio');
      wbStatus($('wbAudioSt'),'Done — '+fmt(ab.duration)+' of audio is ready below. Hit Download to save it.');
    }).catch(function(){
      busy(false); wbStatus($('wbAudioSt'),'Could not read audio from that file — does the sound play in a normal player?',true);
    });
  });

  var speedRate = 4;
  Array.prototype.forEach.call(document.querySelectorAll('.wspeed'), function(btn){
    btn.addEventListener('click', function(){
      Array.prototype.forEach.call(document.querySelectorAll('.wspeed'), function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      speedRate = parseFloat(btn.getAttribute('data-rate')) || 4;
      var outEl=$('wbSpeedEst');
      if(outEl && wb.dur) outEl.textContent='A '+fmt(wb.dur)+' recording lands at about '+fmt(wb.dur/speedRate)+'.';
    });
  });
  var goSpeed = $('wbGoSpeed');
  if(goSpeed) goSpeed.addEventListener('click', function(){
    if(wb.busy || !wb.file) return;
    var mime=pickMime(VID_MIMES);
    busy(true); progShow();
    wbStatus($('wbSpeedSt'),'Speeding up ×'+speedRate+' in real time — keep this tab visible.');
    renderClip({video:prev, in:0, out:wb.dur, mime:mime, rate:speedRate, onTick:function(t){ progSet(t/wb.dur); }})
      .then(function(blob){
        progSet(1); progHide(); busy(false);
        var ext=mime.indexOf('mp4')>-1?'.mp4':'.webm';
        showResult(blob, 'sped-up-'+speedRate+'x-'+Date.now()+ext, 'video');
        wbStatus($('wbSpeedSt'),'Done — '+fmt(wb.dur/speedRate)+' long at ×'+speedRate+'. Hit Download to save it.');
      })
      .catch(function(){ progHide(); busy(false); wbStatus($('wbSpeedSt'),'Speed-up failed — try again, or another file.',true); });
  });

  /* ---- page config: preselect a mode (recipe pages) ---- */
  if(cfg.mode && cfg.mode!=='trim'){
    var chip=document.querySelector('.wmode[data-pane="'+cfg.mode+'"]');
    if(chip && chip.className.indexOf('on')<0) chip.click();
  }
})();
