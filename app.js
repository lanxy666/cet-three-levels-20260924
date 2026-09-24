(() => {
  'use strict';
  const DATA = window.APP_DATA;
  if (!DATA) { document.body.innerHTML = '<p style="padding:24px">词典数据加载失败，请重新打开应用。</p>'; return; }
  const LEVELS = ['daily', 'cet4', 'cet6'];
  const LEVEL_NAMES = { daily: '日常版', cet4: '四级版', cet6: '六级版' };
  const wordMap = new Map(DATA.words.map(x => [x.w, x]));
  const phraseMap = new Map(DATA.phrases.map(x => [x.zh, x]));
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const normalize = s => String(s || '').trim().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()]/g, '');
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function toast(msg, ms = 2200) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function rankScore(rank) {
    const n = Math.max(1, Number(rank) || 30000);
    return Math.max(8, 420 - Math.log10(n) * 72);
  }

  function candidateScore(word, rec, term, input) {
    let score = rankScore(rec.r) + Math.max(0, 18 - word.length) * 2;
    const pos = rec.m.indexOf(input); if (pos >= 0) score += Math.max(0, 900 - pos * 18); if (term === input) score += 900;
    else if (term.includes(input)) score += 360 + input.length * 18;
    else if (input.includes(term)) score += 260 + term.length * 20;
    if (rec.lv.includes('daily')) score += 18;
    if (rec.lv.includes('cet4')) score += 10;
    return score;
  }

  function collectTermMatches(input) {
    const scores = new Map();
    const add = (term, termScore) => {
      const ids = DATA.index[term] || [];
      ids.forEach(id => {
        const rec = wordMap.get(id); if (!rec) return;
        const score = candidateScore(id, rec, term, input) + termScore;
        const prev = scores.get(id);
        if (!prev || score > prev.score) scores.set(id, { rec, score, term });
      });
    };
    if (DATA.index[input]) add(input, 500);
    let scanned = 0;
    for (const term of Object.keys(DATA.index)) {
      if (term === input) continue;
      let s = 0;
      if (term.includes(input)) s = 220 + input.length * 12;
      else if (input.includes(term)) s = 120 + term.length * 10;
      if (s) { add(term, s); scanned++; }
      if (scanned > 240) break;
    }
    return [...scores.values()].sort((a, b) => b.score - a.score);
  }

  function splitLongInput(input) {
    const clean = normalize(input);
    if (clean.length <= 6) return [clean];
    const parts = [];
    if (window.Intl && Intl.Segmenter) {
      const seg = new Intl.Segmenter('zh-CN', { granularity: 'word' });
      for (const x of seg.segment(clean)) {
        const s = normalize(x.segment);
        if (s.length >= 2) parts.push(s);
      }
    }
    if (!parts.length) for (let i = 0; i < clean.length; i += 2) parts.push(clean.slice(i, i + 2));
    return [...new Set(parts)];
  }

  function toItem(rec, source = 'word') {
    return { word: rec.w, meaning: rec.m, phonetic: rec.p, pos: rec.pos, root: rec.root, rank: rec.r, levels: rec.lv, source };
  }

  function query(input) {
    const q = normalize(input);
    const out = { input: String(input || '').trim(), type: 'word', phrase: null, everyday: [], cet4: [], cet6: [], warning: '' };
    if (!q) return out;
    const phrase = phraseMap.get(q);
    if (phrase) {
      out.type = 'phrase'; out.phrase = phrase;
      out.everyday = [{ word: phrase.d, meaning: `短语：${phrase.zh}`, phonetic: '', pos: 'phrase', root: '', rank: 1, levels: ['daily'], source: 'phrase' }];
      out.cet4 = [{ word: phrase.c4, meaning: `短语：${phrase.zh}`, phonetic: '', pos: 'phrase', root: '', rank: 1, levels: ['cet4'], source: 'phrase' }];
      out.cet6 = [{ word: phrase.c6, meaning: `短语：${phrase.zh}`, phonetic: '', pos: 'phrase', root: '', rank: 1, levels: ['cet6'], source: 'phrase' }];
      return out;
    }
    let matches = collectTermMatches(q);
    if (!matches.length && q.length > 6) {
      const segmentScores = new Map();
      splitLongInput(q).forEach(part => {
        collectTermMatches(part).slice(0, 18).forEach(x => {
          const prev = segmentScores.get(x.rec.w); if (!prev || x.score > prev.score) segmentScores.set(x.rec.w, x);
        });
      });
      matches = [...segmentScores.values()].sort((a, b) => b.score - a.score);
      out.warning = '离线词库不提供完整长句翻译；下面是从句子中拆出的关键词候选。';
    }
    const grouped = { daily: [], cet4: [], cet6: [] };
    matches.forEach(x => x.rec.lv.forEach(level => grouped[level].push({ ...toItem(x.rec), _score: x.score })));
    if (!grouped.daily.length && grouped.cet4.length) grouped.daily = grouped.cet4.slice(0,3).map(x=>({...x,fallback:true}));
    if (!grouped.cet6.length && grouped.cet4.length) grouped.cet6 = grouped.cet4.slice(1,4).map(x=>({...x,fallback:true}));
    LEVELS.forEach(level => {
      const seen = new Set();
      const outKey = level === 'daily' ? 'everyday' : level; out[outKey] = grouped[level].sort((a, b) => b._score - a._score).filter(x => {
        const key = x.word.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, 3).map(x => { delete x._score; return x; });
    });
    return out;
  }

  window.CET_APP_QUERY = query;
  window.CET_APP_UTILS = { normalize, toast };
})();

(() => {
  'use strict';
  const query = window.CET_APP_QUERY;
  const { toast } = window.CET_APP_UTILS;
  const DATA = window.APP_DATA;
  const $ = s => document.querySelector(s);
  const LEVELS = ['daily','cet4','cet6'];
  const levelKey = { daily:'everyday', cet4:'cet4', cet6:'cet6' };
  const state = { history:JSON.parse(localStorage.getItem('cet_history')||'[]'), favorites:JSON.parse(localStorage.getItem('cet_favorites')||'[]'), installPrompt:null, listening:false };
  function save(){ localStorage.setItem('cet_history',JSON.stringify(state.history.slice(0,30))); localStorage.setItem('cet_favorites',JSON.stringify(state.favorites.slice(0,100))); }
  function htmlEscape(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function isFav(item){ return state.favorites.some(x=>x.word.toLowerCase()===item.word.toLowerCase()); }
  function addHistory(q){ q=q.trim(); if(!q)return; state.history=[q,...state.history.filter(x=>x!==q)].slice(0,30); save(); renderLists(); }
  function toggleFavorite(item,q){ const key=item.word.toLowerCase(), exists=state.favorites.some(x=>x.word.toLowerCase()===key); if(exists)state.favorites=state.favorites.filter(x=>x.word.toLowerCase()!==key); else state.favorites.unshift({word:item.word,meaning:item.meaning,query:q,level:item.levels?.[0]||''}); save(); renderLists(); toast(exists?'已取消收藏':'已加入收藏'); }
  function fallbackCopy(text,done){ const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done(); }
  function copyWord(word){ const done=()=>toast(`已复制：${word}`); if(navigator.clipboard?.writeText)navigator.clipboard.writeText(word).then(done).catch(()=>fallbackCopy(word,done));else fallbackCopy(word,done); }
  function speak(word){ if(!('speechSynthesis' in window))return toast('此浏览器不支持系统朗读'); speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=.88;const v=speechSynthesis.getVoices().find(x=>/en[-_](US|GB)/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u);toast(`朗读：${word}`); }
  function resultItem(item,index,q){ const n=document.createElement('div');n.className='result-item'+(index===0?' primary':'');const meta=[item.phonetic,item.pos,item.source==='phrase'?'短语':'',item.fallback?'替换表达':''].filter(Boolean);n.innerHTML=`<div class="result-word">${htmlEscape(item.word)}</div><div class="result-meta">${meta.map(x=>`<span class="meta-pill">${htmlEscape(x)}</span>`).join('')}</div>${item.source==='phrase'?'':`<div class="result-zh">${htmlEscape(item.meaning||'')}</div>`}${item.root?`<div class="root-hint">记忆拆解：${htmlEscape(item.root)}</div>`:''}<div class="result-actions"><button class="action-btn copy-btn">复制</button><button class="action-btn speak-btn">🔊 朗读</button><button class="action-btn fav-btn ${isFav(item)?'active':''}">${isFav(item)?'★ 已收藏':'☆ 收藏'}</button></div>`;n.querySelector('.copy-btn').onclick=()=>copyWord(item.word);n.querySelector('.speak-btn').onclick=()=>speak(item.word);n.querySelector('.fav-btn').onclick=e=>{toggleFavorite(item,q);e.currentTarget.classList.toggle('active');e.currentTarget.textContent=isFav(item)?'★ 已收藏':'☆ 收藏';};return n; }
  function renderLevel(level,result,q){ const card=$(`.level-card[data-level="${level}"] .result-body`),items=result[levelKey[level]]||[];card.innerHTML='';if(!items.length){card.className='result-body empty-state';card.innerHTML='<p>暂无匹配，换个更短的中文词试试</p>';return;}card.className='result-body';items.forEach((item,i)=>card.appendChild(resultItem(item,i,q))); }
  function renderResult(result){ LEVELS.forEach(l=>renderLevel(l,result,result.input));const status=$('#statusBar'),total=LEVELS.reduce((n,l)=>n+(result[levelKey[l]]?.length||0),0);if(result.warning){status.textContent=result.warning;status.classList.add('show');}else if(!total){status.textContent='没有找到合适结果，请尝试更短或更常见的词。';status.classList.add('show');}else if(result.type==='phrase'){status.textContent='已命中短句词库，三档表达可直接对照。';status.classList.add('show');}else status.classList.remove('show'); }
  function runQuery(value=$('#queryInput').value){ const q=String(value||'').trim();if(!q)return toast('请输入中文词或短句');$('#queryInput').value=q;const result=query(q);renderResult(result);addHistory(q);document.querySelector('.results').scrollIntoView({behavior:'smooth',block:'start'}); }
  function renderQuick(){ const row=$('#quickRow');row.innerHTML='';DATA.suggestions.forEach(s=>{const b=document.createElement('button');b.type='button';b.className='quick-chip';b.textContent=s;b.onclick=()=>runQuery(s);row.appendChild(b);}); }
  function renderLists(){ const h=$('#historyList'),f=$('#favoritesList');h.innerHTML='';f.innerHTML='';if(!state.history.length)h.innerHTML='<span class="empty">还没有查询记录</span>';else state.history.slice(0,12).forEach(x=>{const b=document.createElement('button');b.type='button';b.className='history-chip';b.textContent=x;b.onclick=()=>runQuery(x);h.appendChild(b);});if(!state.favorites.length)f.innerHTML='<span class="empty">还没有收藏词条</span>';else state.favorites.slice(0,12).forEach(x=>{const b=document.createElement('button');b.type='button';b.className='fav-chip';b.textContent=x.word;b.title=x.meaning;b.onclick=()=>runQuery(x.query||x.word);f.appendChild(b);});$('#favCount').textContent=`${state.favorites.length}条`; }
  function setupVoice(){ const SR=window.SpeechRecognition||window.webkitSpeechRecognition,btn=$('#micBtn'),input=$('#queryInput');if(!SR){btn.onclick=()=>{input.focus();toast('此浏览器没有网页语音识别，请点击输入框使用键盘麦克风',3600);};return;}const rec=new SR();rec.lang='zh-CN';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;rec.onstart=()=>{state.listening=true;btn.classList.add('listening');toast('正在听，请说中文词或短句');};rec.onend=()=>{state.listening=false;btn.classList.remove('listening');};rec.onerror=e=>{state.listening=false;btn.classList.remove('listening');const map={'not-allowed':'没有麦克风权限，请在浏览器设置中允许','network':'语音识别需要联网，可改用键盘麦克风','service-not-allowed':'系统未允许语音识别，可改用键盘麦克风'};toast(map[e.error]||`语音识别失败：${e.error}，可改用键盘麦克风`,3600);};rec.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;input.value=text.trim();if(e.results[e.results.length-1].isFinal)runQuery(text);};btn.onclick=()=>{if(state.listening)return rec.stop();if(!window.isSecureContext&&location.protocol!=='http:'&&location.protocol!=='https:'){input.focus();return toast('直接打开的本地文件不能调用网页麦克风，请用键盘麦克风或HTTPS版',4200);}try{rec.start();}catch(_){rec.stop();setTimeout(()=>rec.start(),120);}}; }
  function setupTheme(){ const saved=localStorage.getItem('cet_theme')||'';if(saved)document.documentElement.dataset.theme=saved;$('#themeBtn').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('cet_theme',next);};const large=localStorage.getItem('cet_font')==='large';if(large)document.documentElement.style.setProperty('--font-scale','1.12');$('#fontBtn').onclick=()=>{const isLarge=document.documentElement.style.getPropertyValue('--font-scale')==='1.12';document.documentElement.style.setProperty('--font-scale',isLarge?'1':'1.12');localStorage.setItem('cet_font',isLarge?'normal':'large');toast(isLarge?'已恢复标准文字':'已放大文字');}; }
  function setupInstall(){ const btn=$('#installBtn');window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;btn.classList.remove('hidden');});window.addEventListener('appinstalled',()=>{state.installPrompt=null;btn.textContent='已安装';setTimeout(()=>btn.classList.add('hidden'),1800);toast('已安装到手机');});btn.onclick=async()=>{if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return;}if(window.matchMedia('(display-mode: standalone)').matches)return toast('已经安装到主屏幕');const ua=navigator.userAgent.toLowerCase(),tip=ua.includes('android')?'请点Chrome右上角⋮，选择“添加到主屏幕”或“安装应用”。':'请在Safari点分享按钮，再选“添加到主屏幕”。';toast(tip,5000);alert(tip);}; }
  function setupEvents(){ $('#searchForm').addEventListener('submit',e=>{e.preventDefault();runQuery();});$('#queryInput').addEventListener('input',e=>$('#clearBtn').classList.toggle('hidden',!e.target.value));$('#clearBtn').onclick=()=>{$('#queryInput').value='';$('#clearBtn').classList.add('hidden');$('#queryInput').focus();};$('#clearHistoryBtn').onclick=()=>{state.history=[];save();renderLists();}; }
  function setupOffline(){ const update=()=>{if(!navigator.onLine){const s=$('#statusBar');s.textContent='当前离线，仍可查询本地词库；网页语音识别需联网。';s.classList.add('show');}};window.addEventListener('online',update);window.addEventListener('offline',update); }
  renderQuick();renderLists();setupVoice();setupTheme();setupInstall();setupEvents();setupOffline();if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();




