const DB_NAME="AccountingDB";
const DB_VERSION=4;
const STORE_NAME="transactions";
const BACKUP_STORE="backups";
const RECURRING_STORE="recurring";
const SETTINGS_STORE="settings";

const AUTO_BACKUP_INTERVAL_MS=24*60*60*1000;
const MAX_BACKUPS=30;
const LAST_BACKUP_KEY="accountingPwaLastBackupAt";

/* Restore the original default choices, while preserving any custom choices. */
const DEFAULT_CATEGORIES=["飲食","交通","購物","娛樂","生活","房租","薪資","其他"];
const DEFAULT_PAYMENTS=["現金","信用卡","LINE Pay","悠遊卡","轉帳","其他"];

let db;
let editingId=null;
let editingRecurringId=null;
let allRecords=[];
let allRecurring=[];
let appSettings={categories:[...DEFAULT_CATEGORIES],payments:[...DEFAULT_PAYMENTS]};

const $=id=>document.getElementById(id);
const nowIso=()=>new Date().toISOString();

function localDateString(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function localMonthString(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}
function parseLocalDate(s){
  const [y,m,d]=String(s).split("-").map(Number);
  return new Date(y,m-1,d);
}
function formatMoney(v){
  return `$${Number(v||0).toLocaleString("zh-TW",{maximumFractionDigits:2})}`;
}
function escapeHtml(v){
  return String(v??"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function csvEscape(v){return `"${String(v??"").replaceAll('"','""')}"`}

/* ---------- DB ---------- */

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=e=>{
      const d=e.target.result;

      if(!d.objectStoreNames.contains(STORE_NAME)){
        const s=d.createObjectStore(STORE_NAME,{keyPath:"id",autoIncrement:true});
        s.createIndex("date","date");
        s.createIndex("category","category");
        s.createIndex("type","type");
      }

      if(!d.objectStoreNames.contains(BACKUP_STORE)){
        d.createObjectStore(BACKUP_STORE,{keyPath:"id",autoIncrement:true});
      }

      if(!d.objectStoreNames.contains(RECURRING_STORE)){
        d.createObjectStore(RECURRING_STORE,{keyPath:"id",autoIncrement:true});
      }

      if(!d.objectStoreNames.contains(SETTINGS_STORE)){
        d.createObjectStore(SETTINGS_STORE,{keyPath:"key"});
      }
    };

    r.onsuccess=e=>{db=e.target.result;resolve(db)};
    r.onerror=()=>reject(r.error);
  });
}

function getAllFromStore(name){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(name,"readonly").objectStore(name).getAll();
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

function getFromStore(name,key){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(name,"readonly").objectStore(name).get(key);
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

function writeToStore(name,value,mode="add"){
  return new Promise((resolve,reject)=>{
    const s=db.transaction(name,"readwrite").objectStore(name);
    const r=mode==="put"?s.put(value):s.add(value);
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}

function deleteFromStore(name,id){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(name,"readwrite").objectStore(name).delete(id);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

function clearStore(name){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(name,"readwrite").objectStore(name).clear();
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

/* ---------- Menu / panels ---------- */

const PANEL_META={
  "home-panel":["我的記帳","今天也一起把錢錢記好"],
  "recurring-panel":["定期自動記帳","固定開銷和收入交給小鴨記住"],
  "options-panel":["類別與支付方式","把常用選項整理得剛剛好"],
  "charts-panel":["圖表","看看錢都跑去哪裡了"],
  "data-panel":["資料匯入 / 匯出","CSV 資料交換"],
  "backup-panel":["本機備份","幫你的記帳資料多留一份"]
};

function openMenu(){
  $("side-menu").classList.add("open");
  $("menu-backdrop").classList.remove("hidden");
}

function closeMenu(){
  $("side-menu").classList.remove("open");
  $("menu-backdrop").classList.add("hidden");
}

function showPanel(panelId){
  document.querySelectorAll(".app-panel").forEach(p=>p.classList.add("hidden"));
  $(panelId).classList.remove("hidden");

  const [title,subtitle]=PANEL_META[panelId]||["我的記帳",""];
  $("page-title").textContent=title;
  $("page-subtitle").textContent=subtitle;

  closeMenu();
  window.scrollTo({top:0,behavior:"smooth"});

  if(panelId==="charts-panel"){
    requestAnimationFrame(()=>{
      refreshCharts();
      setTimeout(refreshCharts,100);
    });
  }
  if(panelId==="backup-panel")refreshBackupUI();
  if(panelId==="recurring-panel")renderRecurringList();
}

/* ---------- Settings / custom choices ---------- */

async function ensureSettings(){
  let categories=await getFromStore(SETTINGS_STORE,"categories");
  let payments=await getFromStore(SETTINGS_STORE,"payments");

  /* v4 migration: merge original defaults back into existing user choices. */
  const mergedCategories=[
    ...DEFAULT_CATEGORIES,
    ...((categories?.values)||[])
  ].filter((v,i,a)=>a.indexOf(v)===i);

  const mergedPayments=[
    ...DEFAULT_PAYMENTS,
    ...((payments?.values)||[])
  ].filter((v,i,a)=>a.indexOf(v)===i);

  categories={key:"categories",values:mergedCategories};
  payments={key:"payments",values:mergedPayments};

  await writeToStore(SETTINGS_STORE,categories,"put");
  await writeToStore(SETTINGS_STORE,payments,"put");

  appSettings={
    categories:[...categories.values],
    payments:[...payments.values]
  };

  renderOptionManagement();
  refreshSelectOptions();
}

async function saveSettingArray(key,values){
  const clean=[...new Set(values.map(v=>String(v).trim()).filter(Boolean))];
  if(!clean.length){
    alert("至少要保留一個項目");
    return false;
  }

  await writeToStore(SETTINGS_STORE,{key,values:clean},"put");
  appSettings[key]=clean;
  renderOptionManagement();
  refreshSelectOptions();
  return true;
}

function fillSelect(select,values,preserve=true){
  const old=preserve?select.value:"";
  select.innerHTML="";

  for(const value of values){
    const o=document.createElement("option");
    o.value=value;
    o.textContent=value;
    select.appendChild(o);
  }

  if(values.includes(old))select.value=old;
}

function refreshSelectOptions(){
  fillSelect($("category"),appSettings.categories);
  fillSelect($("rec-category"),appSettings.categories);
  fillSelect($("payment"),appSettings.payments);
  fillSelect($("rec-payment"),appSettings.payments);
}

function renderOptionManagement(){
  const render=(containerId,key)=>{
    const c=$(containerId);
    c.innerHTML="";

    for(const value of appSettings[key]){
      const chip=document.createElement("div");
      chip.className="chip";
      chip.innerHTML=`
        <span>${escapeHtml(value)}</span>
        <button type="button" aria-label="刪除 ${escapeHtml(value)}">×</button>
      `;

      chip.querySelector("button").addEventListener("click",async()=>{
        if(appSettings[key].length<=1){
          alert("至少要保留一個項目");
          return;
        }

        if(!confirm(`要從可選項目中刪除「${value}」嗎？既有紀錄不會被修改。`))return;

        await saveSettingArray(key,appSettings[key].filter(v=>v!==value));
        await createBackup("settings-change");
      });

      c.appendChild(chip);
    }
  };

  render("category-options","categories");
  render("payment-options","payments");
}

async function addOption(key,inputId){
  const input=$(inputId);
  const value=input.value.trim();

  if(!value)return;

  if(appSettings[key].includes(value)){
    alert("這個項目已經存在");
    return;
  }

  await saveSettingArray(key,[...appSettings[key],value]);
  input.value="";
  await createBackup("settings-change");
}

/* ---------- Transactions ---------- */

async function loadTransactions(){
  allRecords=(await getAllFromStore(STORE_NAME)).sort(
    (a,b)=>b.date.localeCompare(a.date)||(b.id??0)-(a.id??0)
  );

  refreshMainSummary();
  refreshCharts();
  renderRecordPage();
}

function refreshMainSummary(){
  const month=$("month-filter").value||localMonthString();
  const r=allRecords.filter(x=>x.date?.startsWith(month));

  const income=r.filter(x=>x.type==="income")
    .reduce((s,x)=>s+Number(x.amount||0),0);

  const expense=r.filter(x=>x.type==="expense")
    .reduce((s,x)=>s+Number(x.amount||0),0);

  const net=income-expense;

  $("summary-income").textContent=formatMoney(income);
  $("summary-expense").textContent=formatMoney(expense);
  $("summary-net").textContent=formatMoney(net);
  $("summary-net").className="summary-value "+(net<0?"expense":net>0?"income":"");
}

function readForm(){
  return{
    date:$("date").value,
    type:$("type").value,
    amount:Number($("amount").value),
    category:$("category").value,
    payment:$("payment").value,
    merchant:$("merchant").value.trim(),
    note:$("note").value.trim()
  };
}

function validateForm(d){
  if(!d.date){
    alert("請選擇日期");
    return false;
  }

  if(!Number.isFinite(d.amount)||d.amount<=0){
    alert("請輸入正確金額");
    return false;
  }

  return true;
}

function resetForm(){
  editingId=null;

  $("form-title").textContent="新增紀錄";
  $("save-btn").textContent="新增紀錄";
  $("cancel-edit-btn").classList.add("hidden");

  $("date").value=localDateString();
  $("type").value="expense";
  $("amount").value="";

  $("category").value=appSettings.categories[0]||"";
  $("payment").value=appSettings.payments[0]||"";

  $("merchant").value="";
  $("note").value="";
}

async function saveTransaction(){
  const d=readForm();
  if(!validateForm(d))return;

  if(editingId==null){
    d.createdAt=nowIso();
    d.updatedAt=d.createdAt;
    await writeToStore(STORE_NAME,d);
  }else{
    const old=allRecords.find(r=>r.id===editingId);

    if(!old){
      alert("找不到要編輯的紀錄");
      return;
    }

    d.id=editingId;
    d.createdAt=old.createdAt||nowIso();
    d.updatedAt=nowIso();

    if(old.recurringId)d.recurringId=old.recurringId;
    if(old.recurringOccurrenceDate)d.recurringOccurrenceDate=old.recurringOccurrenceDate;

    await writeToStore(STORE_NAME,d,"put");
  }

  resetForm();
  await loadTransactions();
  await maybeAutoBackup("change");
}

function ensureSelectValue(select,value){
  if(![...select.options].some(o=>o.value===value)){
    const o=document.createElement("option");
    o.value=value;
    o.textContent=value;
    select.appendChild(o);
  }

  select.value=value||"";
}

function startEdit(id){
  const x=allRecords.find(r=>r.id===id);
  if(!x)return;

  editingId=id;

  $("form-title").textContent="編輯紀錄";
  $("save-btn").textContent="儲存修改";
  $("cancel-edit-btn").classList.remove("hidden");

  $("date").value=x.date||"";
  $("type").value=x.type||"expense";
  $("amount").value=x.amount??"";

  ensureSelectValue($("category"),x.category);
  ensureSelectValue($("payment"),x.payment);

  $("merchant").value=x.merchant||"";
  $("note").value=x.note||"";

  showPanel("home-panel");
  window.scrollTo({top:0,behavior:"smooth"});
}

async function deleteTransaction(id){
  if(!confirm("確定要刪除這筆紀錄嗎？"))return;

  await deleteFromStore(STORE_NAME,id);
  await loadTransactions();
  await maybeAutoBackup("change");
}

/* ---------- Record paging ---------- */

function renderRecordPage(){
  const mode=$("record-view-mode").value;
  let records,label;

  if(mode==="day"){
    const date=$("record-date").value||localDateString();
    records=allRecords.filter(r=>r.date===date);
    label=date;
  }else{
    const month=$("record-month").value||localMonthString();
    records=allRecords.filter(r=>r.date?.startsWith(month));

    const [y,m]=month.split("-");
    label=`${y} 年 ${Number(m)} 月`;
  }

  $("record-page-label").textContent=label;

  const income=records.filter(r=>r.type==="income")
    .reduce((s,r)=>s+Number(r.amount||0),0);

  const expense=records.filter(r=>r.type==="expense")
    .reduce((s,r)=>s+Number(r.amount||0),0);

  $("record-page-summary").textContent=
    `${records.length} 筆 · 收入 ${formatMoney(income)} · 支出 ${formatMoney(expense)}`;

  const c=$("transaction-list");
  c.innerHTML="";

  if(!records.length){
    c.innerHTML="<p class='subtle'>這個區間目前沒有記帳紀錄。</p>";
    return;
  }

  for(const x of records){
    const d=document.createElement("div");
    const cls=x.type==="expense"?"expense":"income";
    const sign=x.type==="expense"?"-":"+";

    d.className="transaction";

    d.innerHTML=`
      <div class="transaction-top">
        <span>${escapeHtml(x.category)}</span>
        <span class="${cls}">${sign}${formatMoney(x.amount)}</span>
      </div>
      <div class="transaction-meta">
        ${escapeHtml(x.date)}
        · ${escapeHtml(x.payment||"")}
        ${x.merchant?" · "+escapeHtml(x.merchant):""}
        ${x.note?" · "+escapeHtml(x.note):""}
        ${x.recurringId?" · 自動記帳":""}
      </div>
      <div class="transaction-actions">
        <button class="secondary edit-btn" data-id="${x.id}">編輯</button>
        <button class="danger delete-btn" data-id="${x.id}">刪除</button>
      </div>
    `;

    c.appendChild(d);
  }

  c.querySelectorAll(".edit-btn").forEach(
    b=>b.addEventListener("click",()=>startEdit(Number(b.dataset.id)))
  );

  c.querySelectorAll(".delete-btn").forEach(
    b=>b.addEventListener("click",()=>deleteTransaction(Number(b.dataset.id)))
  );
}

function updateRecordModeUI(){
  const day=$("record-view-mode").value==="day";

  $("record-date").classList.toggle("hidden",!day);
  $("record-month").classList.toggle("hidden",day);

  renderRecordPage();
}

function navigateRecordPage(delta){
  if($("record-view-mode").value==="day"){
    let d=parseLocalDate($("record-date").value||localDateString());
    d.setDate(d.getDate()+delta);
    $("record-date").value=localDateString(d);
  }else{
    const value=$("record-month").value||localMonthString();
    const [y,m]=value.split("-").map(Number);
    const d=new Date(y,m-1+delta,1);
    $("record-month").value=localMonthString(d);
  }

  renderRecordPage();
}

/* ---------- Recurring ---------- */

function frequencyLabel(f){
  return ({daily:"每天",weekly:"每週",monthly:"每月",yearly:"每年"})[f]||f;
}

function addMonthsClamped(date,months){
  const y=date.getFullYear();
  const m=date.getMonth();
  const day=date.getDate();

  const first=new Date(y,m+months,1);
  const lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();

  return new Date(first.getFullYear(),first.getMonth(),Math.min(day,lastDay));
}

function addYearsClamped(date,years){
  const targetYear=date.getFullYear()+years;
  const month=date.getMonth();
  const day=date.getDate();

  const lastDay=new Date(targetYear,month+1,0).getDate();

  return new Date(targetYear,month,Math.min(day,lastDay));
}

function advanceRecurringDate(dateStr,frequency,interval){
  const n=Math.max(1,Number(interval)||1);
  let d=parseLocalDate(dateStr);

  if(frequency==="daily")d.setDate(d.getDate()+n);
  else if(frequency==="weekly")d.setDate(d.getDate()+7*n);
  else if(frequency==="monthly")d=addMonthsClamped(d,n);
  else if(frequency==="yearly")d=addYearsClamped(d,n);

  return localDateString(d);
}

async function loadRecurring(){
  allRecurring=(await getAllFromStore(RECURRING_STORE)).sort(
    (a,b)=>(a.nextDate||"").localeCompare(b.nextDate||"")
  );

  renderRecurringList();
}

function resetRecurringForm(){
  editingRecurringId=null;

  $("save-recurring-btn").textContent="新增定期記帳";
  $("cancel-recurring-edit-btn").classList.add("hidden");

  $("rec-name").value="";
  $("rec-type").value="expense";
  $("rec-amount").value="";
  $("rec-frequency").value="monthly";
  $("rec-interval").value="1";
  $("rec-start-date").value=localDateString();
  $("rec-next-date").value=localDateString();

  $("rec-category").value=appSettings.categories[0]||"";
  $("rec-payment").value=appSettings.payments[0]||"";

  $("rec-merchant").value="";
  $("rec-note").value="";
  $("rec-enabled").checked=true;
}

async function saveRecurring(){
  const amount=Number($("rec-amount").value);
  const startDate=$("rec-start-date").value;
  const nextDate=$("rec-next-date").value;
  const interval=Math.max(1,Number($("rec-interval").value)||1);

  if(!Number.isFinite(amount)||amount<=0){
    alert("請輸入正確金額");
    return;
  }

  if(!startDate||!nextDate){
    alert("請選擇開始日期與下次記帳日");
    return;
  }

  const r={
    name:$("rec-name").value.trim()||$("rec-category").value,
    type:$("rec-type").value,
    amount,
    frequency:$("rec-frequency").value,
    interval,
    startDate,
    nextDate,
    category:$("rec-category").value,
    payment:$("rec-payment").value,
    merchant:$("rec-merchant").value.trim(),
    note:$("rec-note").value.trim(),
    enabled:$("rec-enabled").checked,
    updatedAt:nowIso()
  };

  if(editingRecurringId==null){
    r.createdAt=r.updatedAt;
    await writeToStore(RECURRING_STORE,r);
  }else{
    const old=allRecurring.find(x=>x.id===editingRecurringId);

    r.id=editingRecurringId;
    r.createdAt=old?.createdAt||r.updatedAt;

    await writeToStore(RECURRING_STORE,r,"put");
  }

  resetRecurringForm();
  await loadRecurring();
  await processRecurringTransactions(false);
  await createBackup("recurring-change");
}

function editRecurring(id){
  const r=allRecurring.find(x=>x.id===id);
  if(!r)return;

  editingRecurringId=id;

  $("save-recurring-btn").textContent="儲存定期記帳";
  $("cancel-recurring-edit-btn").classList.remove("hidden");

  $("rec-name").value=r.name||"";
  $("rec-type").value=r.type||"expense";
  $("rec-amount").value=r.amount??"";
  $("rec-frequency").value=r.frequency||"monthly";
  $("rec-interval").value=r.interval||1;
  $("rec-start-date").value=r.startDate||localDateString();
  $("rec-next-date").value=r.nextDate||r.startDate||localDateString();

  ensureSelectValue($("rec-category"),r.category);
  ensureSelectValue($("rec-payment"),r.payment);

  $("rec-merchant").value=r.merchant||"";
  $("rec-note").value=r.note||"";
  $("rec-enabled").checked=r.enabled!==false;

  $("save-recurring-btn").scrollIntoView({behavior:"smooth",block:"center"});
}

async function deleteRecurring(id){
  if(!confirm("確定要刪除這個定期記帳設定嗎？已產生的記帳紀錄不會被刪除。"))return;

  await deleteFromStore(RECURRING_STORE,id);
  await loadRecurring();
  await createBackup("recurring-change");
}

async function toggleRecurring(id){
  const r=allRecurring.find(x=>x.id===id);
  if(!r)return;

  r.enabled=!r.enabled;
  r.updatedAt=nowIso();

  await writeToStore(RECURRING_STORE,r,"put");
  await loadRecurring();
  await createBackup("recurring-change");
}

function renderRecurringList(){
  const c=$("recurring-list");
  c.innerHTML="";

  if(!allRecurring.length){
    c.innerHTML="<p class='subtle'>尚未建立定期記帳。</p>";
    return;
  }

  for(const r of allRecurring){
    const d=document.createElement("div");
    d.className="recurring-item";

    d.innerHTML=`
      <div class="recurring-top">
        <span>
          <span class="status-dot ${r.enabled===false?"off":""}"></span>
          ${escapeHtml(r.name||r.category)}
        </span>

        <span class="${r.type==="expense"?"expense":"income"}">
          ${r.type==="expense"?"-":"+"}${formatMoney(r.amount)}
        </span>
      </div>

      <div class="recurring-meta">
        ${frequencyLabel(r.frequency)}
        ${Number(r.interval||1)>1?`（每 ${r.interval} 個週期）`:""}
        · 下次 ${escapeHtml(r.nextDate||"")}
        · ${escapeHtml(r.category)}
        · ${escapeHtml(r.payment)}
      </div>

      <div class="recurring-actions">
        <button class="secondary rec-edit" data-id="${r.id}">編輯</button>
        <button class="secondary rec-toggle" data-id="${r.id}">
          ${r.enabled===false?"啟用":"停用"}
        </button>
        <button class="danger rec-delete" data-id="${r.id}">刪除</button>
      </div>
    `;

    c.appendChild(d);
  }

  c.querySelectorAll(".rec-edit").forEach(
    b=>b.addEventListener("click",()=>editRecurring(Number(b.dataset.id)))
  );

  c.querySelectorAll(".rec-toggle").forEach(
    b=>b.addEventListener("click",()=>toggleRecurring(Number(b.dataset.id)))
  );

  c.querySelectorAll(".rec-delete").forEach(
    b=>b.addEventListener("click",()=>deleteRecurring(Number(b.dataset.id)))
  );
}

async function processRecurringTransactions(showMessage=true){
  await loadRecurring();

  const today=localDateString();
  const existing=await getAllFromStore(STORE_NAME);

  const generatedKeys=new Set(
    existing
      .filter(r=>r.recurringId&&r.recurringOccurrenceDate)
      .map(r=>`${r.recurringId}|${r.recurringOccurrenceDate}`)
  );

  let created=0;

  for(const schedule of allRecurring){
    if(schedule.enabled===false)continue;

    let next=schedule.nextDate||schedule.startDate;
    let guard=0;

    while(next&&next<=today&&guard<1000){
      const key=`${schedule.id}|${next}`;

      if(!generatedKeys.has(key)){
        const record={
          date:next,
          type:schedule.type,
          amount:Number(schedule.amount),
          category:schedule.category,
          payment:schedule.payment,
          merchant:schedule.merchant||"",
          note:schedule.note||"",
          recurringId:schedule.id,
          recurringOccurrenceDate:next,
          createdAt:nowIso(),
          updatedAt:nowIso()
        };

        await writeToStore(STORE_NAME,record);
        generatedKeys.add(key);
        created++;
      }

      next=advanceRecurringDate(next,schedule.frequency,schedule.interval);
      guard++;
    }

    if(next!==schedule.nextDate){
      schedule.nextDate=next;
      schedule.updatedAt=nowIso();
      await writeToStore(RECURRING_STORE,schedule,"put");
    }
  }

  if(created>0){
    await loadTransactions();
    await loadRecurring();
    await maybeAutoBackup("recurring-run");
  }

  if(showMessage){
    alert(created?`已自動新增 ${created} 筆到期紀錄。`:"目前沒有到期的定期記帳。");
  }

  return created;
}

/* ---------- CSV ---------- */

function exportCSV(){
  if(!allRecords.length){
    alert("沒有資料可以匯出");
    return;
  }

  const h=[
    "id","date","type","category","amount","payment","merchant","note",
    "recurringId","recurringOccurrenceDate","createdAt","updatedAt"
  ];

  let csv=h.map(csvEscape).join(",")+"\n";

  for(const x of [...allRecords].reverse()){
    csv+=h.map(k=>x[k]??"").map(csvEscape).join(",")+"\n";
  }

  shareOrDownloadFile(
    new File(
      ["\uFEFF"+csv],
      `accounting_${localDateString()}.csv`,
      {type:"text/csv;charset=utf-8"}
    ),
    "記帳資料 CSV"
  );
}

function parseCSV(text){
  text=text.replace(/^\uFEFF/,"");

  const rows=[];
  let row=[],field="",q=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];

    if(q){
      if(ch==='"'&&text[i+1]==='"'){
        field+='"';
        i++;
      }else if(ch==='"'){
        q=false;
      }else{
        field+=ch;
      }
    }else{
      if(ch==='"')q=true;
      else if(ch===","){
        row.push(field);
        field="";
      }else if(ch==="\n"){
        row.push(field.replace(/\r$/,""));
        rows.push(row);
        row=[];
        field="";
      }else{
        field+=ch;
      }
    }
  }

  if(field.length||row.length){
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r=>r.some(v=>v!==""));
}

function recordSignature(r){
  return[
    r.date,r.type,r.category,Number(r.amount),r.payment||"",r.merchant||"",r.note||""
  ].join("|");
}

async function importCSVFile(file){
  const rows=parseCSV(await file.text());

  if(rows.length<2){
    alert("CSV 沒有可匯入的資料");
    return;
  }

  const h=rows[0].map(x=>x.trim());

  if(!["date","type","category","amount"].every(k=>h.includes(k))){
    alert("CSV 缺少必要欄位：date, type, category, amount");
    return;
  }

  const existing=new Set(allRecords.map(recordSignature));
  let imported=0,skipped=0;

  const newCategories=new Set(appSettings.categories);
  const newPayments=new Set(appSettings.payments);

  for(const row of rows.slice(1)){
    const o={};
    h.forEach((k,i)=>o[k]=row[i]??"");

    const r={
      date:o.date,
      type:o.type==="income"?"income":"expense",
      category:o.category||"其他",
      amount:Number(o.amount),
      payment:o.payment||"其他",
      merchant:o.merchant||"",
      note:o.note||"",
      createdAt:o.createdAt||nowIso(),
      updatedAt:o.updatedAt||o.createdAt||nowIso()
    };

    if(!r.date||!Number.isFinite(r.amount)||r.amount<=0){
      skipped++;
      continue;
    }

    const sig=recordSignature(r);

    if(existing.has(sig)){
      skipped++;
      continue;
    }

    await writeToStore(STORE_NAME,r);
    existing.add(sig);
    imported++;

    newCategories.add(r.category);
    newPayments.add(r.payment);
  }

  await saveSettingArray("categories",[...newCategories]);
  await saveSettingArray("payments",[...newPayments]);

  await loadTransactions();
  await createBackup("CSV import");

  alert(`匯入完成：${imported} 筆，略過 ${skipped} 筆。`);
}

/* ---------- Charts ---------- */

const CHART_COLORS=[
  "#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f",
  "#edc949","#af7aa1","#ff9da7","#9c755f","#bab0ab",
  "#2f6f9f","#cc7a00","#b53f42","#4f9692","#3f7f38"
];

let selectedCategoryName=null;
let selectedTrendKey=null;

function recordsInRange(start,end){
  return allRecords.filter(r=>r.date>=start&&r.date<=end);
}

function prepareCanvas(canvas,minWidth=280,height=240){
  const wrap=canvas.parentElement;
  const card=canvas.closest(".card");

  const wrapWidth=wrap ? wrap.getBoundingClientRect().width : 0;
  const cardWidth=card ? card.getBoundingClientRect().width : 0;

  const available=Math.max(
    260,
    Math.floor(wrapWidth-16),
    Math.floor(cardWidth-36)
  );

  const width=Math.max(minWidth,available);
  const dpr=window.devicePixelRatio||1;

  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);

  canvas.style.width=`${width}px`;
  canvas.style.height=`${height}px`;

  canvas.dataset.logicalWidth=String(width);
  canvas.dataset.logicalHeight=String(height);

  const ctx=canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);

  return{ctx,width,height};
}

function canvasPoint(canvas,event){
  const touch=event.changedTouches?.[0]||event.touches?.[0];
  const clientX=touch ? touch.clientX : event.clientX;
  const clientY=touch ? touch.clientY : event.clientY;

  const rect=canvas.getBoundingClientRect();
  const logicalWidth=Number(canvas.dataset.logicalWidth||rect.width);
  const logicalHeight=Number(canvas.dataset.logicalHeight||rect.height);

  return{
    x:(clientX-rect.left)*(logicalWidth/rect.width),
    y:(clientY-rect.top)*(logicalHeight/rect.height)
  };
}

function drawEmpty(ctx,w,h,text){
  ctx.fillStyle="#8e8e93";
  ctx.font="14px -apple-system,sans-serif";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(text,w/2,h/2);
}

function refreshCharts(){
  const start=$("chart-start").value;
  const end=$("chart-end").value;

  if(!start||!end||start>end)return;

  const records=recordsInRange(start,end);
  drawCategoryChart(records);
  drawTrendChart(records,start,end,$("chart-period").value);
}

/* ---------- Expense category donut ---------- */

function drawCategoryChart(records){
  const canvas=$("category-chart");
  const legend=$("category-legend");
  const info=$("category-chart-info");

  const sums=new Map();

  for(const r of records.filter(x=>x.type==="expense")){
    sums.set(
      r.category,
      (sums.get(r.category)||0)+Number(r.amount||0)
    );
  }

  const data=[...sums.entries()]
    .sort((a,b)=>b[1]-a[1])
    .map(([name,value],index)=>({
      name,
      value,
      color:CHART_COLORS[index%CHART_COLORS.length]
    }));

  /* If range changed and selected category no longer exists, clear it. */
  if(
    selectedCategoryName &&
    !data.some(item=>item.name===selectedCategoryName)
  ){
    selectedCategoryName=null;
  }

  const {ctx,width,height}=prepareCanvas(canvas,280,320);

  legend.innerHTML="";
  canvas.onclick=null;
  canvas.ontouchend=null;

  if(!data.length){
    selectedCategoryName=null;
    drawEmpty(ctx,width,height,"這個區間沒有支出資料");
    info.textContent="這個區間沒有支出資料。";
    return;
  }

  const total=data.reduce((sum,item)=>sum+item.value,0);

  const cx=width/2;
  const cy=height/2;
  const baseRadius=Math.min(width,height)*0.35;
  const baseInnerRadius=baseRadius*0.50;
  const explodeDistance=12;
  const selectedRadiusBonus=6;

  let startAngle=-Math.PI/2;
  const slices=[];

  for(const item of data){
    const sweep=item.value/total*Math.PI*2;
    const endAngle=startAngle+sweep;
    const midAngle=(startAngle+endAngle)/2;
    const isSelected=item.name===selectedCategoryName;

    const offset=isSelected?explodeDistance:0;
    const sliceCx=cx+Math.cos(midAngle)*offset;
    const sliceCy=cy+Math.sin(midAngle)*offset;
    const outerRadius=baseRadius+(isSelected?selectedRadiusBonus:0);
    const innerRadius=baseInnerRadius;

    /* Draw an annular sector directly, allowing the selected sector to explode. */
    ctx.beginPath();
    ctx.arc(
      sliceCx,
      sliceCy,
      outerRadius,
      startAngle,
      endAngle
    );
    ctx.arc(
      sliceCx,
      sliceCy,
      innerRadius,
      endAngle,
      startAngle,
      true
    );
    ctx.closePath();

    ctx.fillStyle=item.color;
    ctx.fill();

    ctx.strokeStyle="#ffffff";
    ctx.lineWidth=isSelected?3:2;
    ctx.stroke();

    slices.push({
      ...item,
      startAngle,
      endAngle,
      midAngle,
      cx:sliceCx,
      cy:sliceCy,
      outerRadius,
      innerRadius
    });

    startAngle=endAngle;
  }

  /* Center information stays fixed while a slice moves outward. */
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillStyle="#666";
  ctx.font="12px -apple-system,sans-serif";
  ctx.fillText("區間總支出",cx,cy-11);

  ctx.fillStyle="#111";
  ctx.font="600 17px -apple-system,sans-serif";
  ctx.fillText(formatMoney(total),cx,cy+12);

  const showItem=item=>{
    const pct=total>0 ? item.value/total*100 : 0;
    info.innerHTML=
      `<strong>${escapeHtml(item.name)}</strong>`+
      `：${pct.toFixed(1)}% · ${escapeHtml(formatMoney(item.value))}`;
  };

  const selectCategory=name=>{
    selectedCategoryName=name;
    drawCategoryChart(records);
  };

  const pickSlice=event=>{
    event.preventDefault?.();

    const p=canvasPoint(canvas,event);

    /* Check each slice using its actual exploded center/radius. */
    const selected=slices.find(slice=>{
      const dx=p.x-slice.cx;
      const dy=p.y-slice.cy;
      const distance=Math.sqrt(dx*dx+dy*dy);

      if(distance<slice.innerRadius||distance>slice.outerRadius){
        return false;
      }

      let angle=Math.atan2(dy,dx);

      while(angle<slice.startAngle)angle+=Math.PI*2;
      while(angle>slice.startAngle+Math.PI*2)angle-=Math.PI*2;

      return angle>=slice.startAngle&&angle<slice.endAngle;
    });

    if(selected){
      selectCategory(selected.name);
    }
  };

  canvas.onclick=pickSlice;
  canvas.ontouchend=pickSlice;

  for(const item of data){
    const button=document.createElement("button");
    button.type="button";
    button.className=
      "legend-item"+(item.name===selectedCategoryName?" selected":"");

    button.innerHTML=
      `<span class="legend-swatch" style="background:${item.color}"></span>`+
      `<span class="legend-label">${escapeHtml(item.name)}</span>`;

    button.addEventListener("click",()=>selectCategory(item.name));
    legend.appendChild(button);
  }

  const selectedItem=data.find(
    item=>item.name===selectedCategoryName
  );

  if(selectedItem){
    showItem(selectedItem);
  }else{
    info.textContent=
      "點擊圓餅圖或下方分類可查看占比與金額；選中的扇形會放大。";
  }
}

/* ---------- Trend bar + balance line ---------- */

function buildBuckets(start,end,period){
  const buckets=[];
  let d=parseLocalDate(start);
  const e=parseLocalDate(end);

  if(period==="day"){
    while(d<=e){
      buckets.push({
        key:localDateString(d),
        label:`${d.getMonth()+1}/${d.getDate()}`,
        income:0,
        expense:0,
        net:0
      });
      d.setDate(d.getDate()+1);
    }
  }else if(period==="month"){
    d=new Date(d.getFullYear(),d.getMonth(),1);
    const last=new Date(e.getFullYear(),e.getMonth(),1);

    while(d<=last){
      buckets.push({
        key:localMonthString(d),
        label:`${d.getFullYear()}/${d.getMonth()+1}`,
        income:0,
        expense:0,
        net:0
      });
      d=new Date(d.getFullYear(),d.getMonth()+1,1);
    }
  }else{
    for(let y=d.getFullYear();y<=e.getFullYear();y++){
      buckets.push({
        key:String(y),
        label:String(y),
        income:0,
        expense:0,
        net:0
      });
    }
  }

  return buckets;
}

function compactMoney(value){
  const abs=Math.abs(value);

  if(abs>=1000000){
    return `${(value/1000000).toFixed(abs>=10000000?0:1)}M`;
  }

  if(abs>=1000){
    return `${(value/1000).toFixed(abs>=10000?0:1)}k`;
  }

  return `${Math.round(value)}`;
}

function drawTrendChart(records,start,end,period){
  const canvas=$("trend-chart");
  const info=$("trend-chart-info");

  const buckets=buildBuckets(start,end,period);
  const map=new Map(buckets.map(b=>[b.key,b]));

  for(const r of records){
    const key=
      period==="day"
        ? r.date
        : period==="month"
          ? r.date.slice(0,7)
          : r.date.slice(0,4);

    const bucket=map.get(key);
    if(!bucket)continue;

    if(r.type==="income"){
      bucket.income+=Number(r.amount||0);
    }else{
      bucket.expense+=Number(r.amount||0);
    }
  }

  for(const bucket of buckets){
    bucket.net=bucket.income-bucket.expense;
  }

  if(
    selectedTrendKey &&
    !buckets.some(bucket=>bucket.key===selectedTrendKey)
  ){
    selectedTrendKey=null;
  }

  const minWidth=Math.max(
    300,
    buckets.length*(period==="day"?58:period==="month"?76:96)+82
  );

  const {ctx,width,height}=prepareCanvas(canvas,minWidth,310);

  canvas.onclick=null;
  canvas.ontouchend=null;

  if(!buckets.length){
    selectedTrendKey=null;
    drawEmpty(ctx,width,height,"沒有可顯示的區間");
    info.textContent="沒有可顯示的區間。";
    return;
  }

  const values=[
    0,
    ...buckets.flatMap(b=>[b.income,b.expense,b.net])
  ];

  let yMin=Math.min(...values);
  let yMax=Math.max(...values);

  if(yMin===yMax)yMax=yMin+1;
  if(yMin>0)yMin=0;
  if(yMax<0)yMax=0;

  const span=yMax-yMin;
  const pad=span*0.08;

  if(yMax>0)yMax+=pad;
  if(yMin<0)yMin-=pad;

  const left=66;
  const right=16;
  const top=36;
  const bottom=52;

  const plotWidth=width-left-right;
  const plotHeight=height-top-bottom;

  const yToPx=value=>
    top+(yMax-value)/(yMax-yMin)*plotHeight;

  const zeroY=yToPx(0);

  ctx.font="11px -apple-system,sans-serif";
  ctx.textBaseline="middle";

  const ticks=5;

  for(let i=0;i<=ticks;i++){
    const value=yMax-(yMax-yMin)*(i/ticks);
    const y=top+plotHeight*(i/ticks);

    ctx.strokeStyle="#ececf0";
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(left,y);
    ctx.lineTo(width-right,y);
    ctx.stroke();

    ctx.fillStyle="#6e6e73";
    ctx.textAlign="right";
    ctx.fillText(`$${compactMoney(value)}`,left-7,y);
  }

  ctx.strokeStyle="#9a9aa0";
  ctx.beginPath();
  ctx.moveTo(left,top);
  ctx.lineTo(left,top+plotHeight);
  ctx.stroke();

  ctx.strokeStyle="#b8b8bd";
  ctx.beginPath();
  ctx.moveTo(left,zeroY);
  ctx.lineTo(width-right,zeroY);
  ctx.stroke();

  const groupWidth=plotWidth/Math.max(1,buckets.length);
  const barWidth=Math.min(21,groupWidth*0.27);
  const hitboxes=[];
  const pointHitboxes=[];

  /* Light vertical highlight for the selected period. */
  const selectedBucketIndex=buckets.findIndex(
    bucket=>bucket.key===selectedTrendKey
  );

  if(selectedBucketIndex>=0){
    const selectedCx=
      left+groupWidth*selectedBucketIndex+groupWidth/2;

    ctx.fillStyle="rgba(0,0,0,0.045)";
    ctx.fillRect(
      selectedCx-groupWidth/2,
      top,
      groupWidth,
      plotHeight
    );
  }

  buckets.forEach((bucket,index)=>{
    const cx=left+groupWidth*index+groupWidth/2;
    const isSelected=bucket.key===selectedTrendKey;

    const drawBar=(value,x,color,type)=>{
      const valueY=yToPx(value);
      const barTop=Math.min(valueY,zeroY);
      const barHeight=Math.max(2,Math.abs(zeroY-valueY));

      ctx.fillStyle=color;
      ctx.fillRect(x,barTop,barWidth,barHeight);

      if(isSelected){
        ctx.strokeStyle="#111";
        ctx.lineWidth=2;
        ctx.strokeRect(
          x-1,
          barTop-1,
          barWidth+2,
          barHeight+2
        );
      }

      hitboxes.push({
        x:x-6,
        y:barTop-6,
        width:barWidth+12,
        height:barHeight+12,
        bucket
      });
    };

    drawBar(
      bucket.income,
      cx-barWidth-2,
      "#18864b",
      "收入"
    );

    drawBar(
      bucket.expense,
      cx+2,
      "#d33a2c",
      "支出"
    );

    ctx.fillStyle="#666";
    ctx.textAlign="center";

    ctx.save();
    ctx.translate(cx,height-18);

    if(buckets.length>12){
      ctx.rotate(-Math.PI/5);
    }

    ctx.fillText(bucket.label,0,0);
    ctx.restore();
  });

  /* Net balance line. */
  ctx.strokeStyle="#333333";
  ctx.lineWidth=2;
  ctx.beginPath();

  buckets.forEach((bucket,index)=>{
    const cx=left+groupWidth*index+groupWidth/2;
    const y=yToPx(bucket.net);

    if(index===0)ctx.moveTo(cx,y);
    else ctx.lineTo(cx,y);
  });

  ctx.stroke();

  buckets.forEach((bucket,index)=>{
    const cx=left+groupWidth*index+groupWidth/2;
    const y=yToPx(bucket.net);
    const isSelected=bucket.key===selectedTrendKey;

    if(isSelected){
      ctx.beginPath();
      ctx.arc(cx,y,7,0,Math.PI*2);
      ctx.fillStyle="#ffffff";
      ctx.fill();
      ctx.strokeStyle="#333333";
      ctx.lineWidth=2.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx,y,isSelected?4.5:3.5,0,Math.PI*2);
    ctx.fillStyle="#333333";
    ctx.fill();

    pointHitboxes.push({
      x:cx,
      y,
      radius:15,
      bucket
    });
  });

  ctx.textAlign="left";
  ctx.textBaseline="alphabetic";
  ctx.font="11px -apple-system,sans-serif";

  ctx.fillStyle="#18864b";
  ctx.fillText("■ 收入",left,17);

  ctx.fillStyle="#d33a2c";
  ctx.fillText("■ 支出",left+58,17);

  ctx.fillStyle="#333333";
  ctx.fillText("●— 結餘",left+116,17);

  const showBucket=bucket=>{
    info.innerHTML=
      `<strong>${escapeHtml(bucket.label)}</strong><br>`+
      `收入：<span class="income">${escapeHtml(formatMoney(bucket.income))}</span>`+
      `　支出：<span class="expense">${escapeHtml(formatMoney(bucket.expense))}</span>`+
      `　結餘：<strong>${escapeHtml(formatMoney(bucket.net))}</strong>`;
  };

  const selectBucket=bucket=>{
    selectedTrendKey=bucket.key;
    drawTrendChart(records,start,end,period);
  };

  const pickTrend=event=>{
    event.preventDefault?.();
    const p=canvasPoint(canvas,event);

    /* Line points get priority when the finger is close to a point. */
    const point=pointHitboxes.find(hit=>{
      const dx=p.x-hit.x;
      const dy=p.y-hit.y;
      return Math.sqrt(dx*dx+dy*dy)<=hit.radius;
    });

    if(point){
      selectBucket(point.bucket);
      return;
    }

    const bar=hitboxes.find(hit=>
      p.x>=hit.x &&
      p.x<=hit.x+hit.width &&
      p.y>=hit.y &&
      p.y<=hit.y+hit.height
    );

    if(bar){
      selectBucket(bar.bucket);
    }
  };

  canvas.onclick=pickTrend;
  canvas.ontouchend=pickTrend;

  const selectedBucket=buckets.find(
    bucket=>bucket.key===selectedTrendKey
  );

  if(selectedBucket){
    showBucket(selectedBucket);
  }else{
    info.textContent=
      "點擊收入、支出長條或結餘折線上的點，可查看當期收入、支出與結餘。";
  }
}

function setChartRange(kind){
  selectedCategoryName=null;
  selectedTrendKey=null;

  const today=new Date();
  let start;
  const end=today;

  if(kind==="month"){
    start=new Date(today.getFullYear(),today.getMonth(),1);
  }else if(kind==="six"){
    start=new Date(today.getFullYear(),today.getMonth()-5,1);
  }else{
    start=new Date(today.getFullYear(),0,1);
  }

  $("chart-start").value=localDateString(start);
  $("chart-end").value=localDateString(end);

  refreshCharts();
}

/* ---------- Backups ---------- */

async function readSettingsSnapshot(){
  return{
    categories:[...appSettings.categories],
    payments:[...appSettings.payments]
  };
}

async function createBackup(reason="manual"){
  const transactions=await getAllFromStore(STORE_NAME);
  const recurring=await getAllFromStore(RECURRING_STORE);
  const settings=await readSettingsSnapshot();

  const b={
    createdAt:nowIso(),
    reason,
    transactions,
    recurring,
    settings
  };

  await writeToStore(BACKUP_STORE,b);

  localStorage.setItem(LAST_BACKUP_KEY,b.createdAt);

  await pruneBackups();
  await refreshBackupUI();

  return b;
}

async function pruneBackups(){
  const b=(await getAllFromStore(BACKUP_STORE))
    .sort((a,c)=>c.createdAt.localeCompare(a.createdAt));

  for(const x of b.slice(MAX_BACKUPS)){
    await deleteFromStore(BACKUP_STORE,x.id);
  }
}

async function maybeAutoBackup(reason="auto"){
  const last=localStorage.getItem(LAST_BACKUP_KEY);

  const due=
    !last||
    Date.now()-new Date(last).getTime()>=AUTO_BACKUP_INTERVAL_MS;

  if(due){
    await createBackup(reason==="change"?"auto-after-change":reason);
  }else{
    await refreshBackupUI();
  }
}

async function refreshBackupUI(){
  const b=(await getAllFromStore(BACKUP_STORE))
    .sort((a,c)=>c.createdAt.localeCompare(a.createdAt));

  const s=$("backup-select");
  s.innerHTML="";

  if(!b.length){
    $("backup-status").textContent="尚未建立本機備份";

    const o=document.createElement("option");
    o.textContent="沒有可還原的備份";
    o.value="";
    s.appendChild(o);

    return;
  }

  const latest=b[0];
  const n=(latest.transactions||latest.records||[]).length;

  $("backup-status").textContent=
    `最近備份：${new Date(latest.createdAt).toLocaleString("zh-TW")}（${n} 筆紀錄）`;

  for(const x of b){
    const o=document.createElement("option");

    o.value=String(x.id);
    o.textContent=
      `${new Date(x.createdAt).toLocaleString("zh-TW")} · ${(x.transactions||x.records||[]).length} 筆 · ${x.reason}`;

    s.appendChild(o);
  }
}

async function restoreDataSnapshot(snapshot){
  await clearStore(STORE_NAME);
  await clearStore(RECURRING_STORE);

  const transactions=snapshot.transactions||snapshot.records||[];
  const recurring=snapshot.recurring||[];

  for(const x of transactions){
    const copy={...x};
    delete copy.id;
    await writeToStore(STORE_NAME,copy);
  }

  for(const x of recurring){
    const copy={...x};
    delete copy.id;
    await writeToStore(RECURRING_STORE,copy);
  }

  if(snapshot.settings?.categories?.length){
    await writeToStore(
      SETTINGS_STORE,
      {key:"categories",values:snapshot.settings.categories},
      "put"
    );
  }

  if(snapshot.settings?.payments?.length){
    await writeToStore(
      SETTINGS_STORE,
      {key:"payments",values:snapshot.settings.payments},
      "put"
    );
  }

  await ensureSettings();
  await loadTransactions();
  await loadRecurring();
}

async function restoreSelectedBackup(){
  const id=Number($("backup-select").value);

  if(!id){
    alert("沒有選取可還原的備份");
    return;
  }

  const b=(await getAllFromStore(BACKUP_STORE))
    .find(x=>x.id===id);

  if(!b){
    alert("找不到備份");
    return;
  }

  if(!confirm(
    `要還原 ${new Date(b.createdAt).toLocaleString("zh-TW")} 的備份嗎？目前資料會先被備份再覆蓋。`
  ))return;

  await createBackup("before-restore");
  await restoreDataSnapshot(b);
  await createBackup("after-restore");

  alert("還原完成");
}

async function exportJSONBackup(){
  const payload={
    format:"accounting-pwa-backup",
    version:3,
    exportedAt:nowIso(),
    transactions:await getAllFromStore(STORE_NAME),
    recurring:await getAllFromStore(RECURRING_STORE),
    settings:await readSettingsSnapshot()
  };

  await shareOrDownloadFile(
    new File(
      [JSON.stringify(payload,null,2)],
      `accounting_backup_${localDateString()}.json`,
      {type:"application/json;charset=utf-8"}
    ),
    "記帳 JSON 備份"
  );
}

async function importJSONFile(file){
  const p=JSON.parse(await file.text());

  if(
    !p||
    p.format!=="accounting-pwa-backup"||
    (!Array.isArray(p.transactions)&&!Array.isArray(p.records))
  ){
    alert("不是有效的記帳 JSON 備份");
    return;
  }

  const count=(p.transactions||p.records||[]).length;

  if(!confirm(
    `要用這份 JSON 備份覆蓋目前資料嗎？共有 ${count} 筆記帳紀錄。`
  ))return;

  await createBackup("before-json-import");
  await restoreDataSnapshot(p);
  await createBackup("json-import");

  alert("JSON 備份匯入完成");
}

/* ---------- File share/download ---------- */

async function shareOrDownloadFile(file,title){
  if(
    navigator.share&&
    navigator.canShare&&
    navigator.canShare({files:[file]})
  ){
    try{
      await navigator.share({files:[file],title});
      return;
    }catch(e){
      if(e.name==="AbortError")return;
    }
  }

  const url=URL.createObjectURL(file);
  const a=document.createElement("a");

  a.href=url;
  a.download=file.name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- Events ---------- */

$("menu-btn").addEventListener("click",openMenu);
$("menu-close-btn").addEventListener("click",closeMenu);
$("menu-backdrop").addEventListener("click",closeMenu);

document.querySelectorAll(".menu-item").forEach(btn=>{
  btn.addEventListener("click",()=>showPanel(btn.dataset.panel));
});

$("save-btn").addEventListener("click",saveTransaction);
$("cancel-edit-btn").addEventListener("click",resetForm);
$("month-filter").addEventListener("change",refreshMainSummary);

$("add-category-btn").addEventListener(
  "click",
  ()=>addOption("categories","new-category")
);

$("add-payment-btn").addEventListener(
  "click",
  ()=>addOption("payments","new-payment")
);

$("save-recurring-btn").addEventListener("click",saveRecurring);
$("cancel-recurring-edit-btn").addEventListener("click",resetRecurringForm);
$("run-recurring-btn").addEventListener(
  "click",
  ()=>processRecurringTransactions(true)
);

$("rec-start-date").addEventListener("change",()=>{
  if(editingRecurringId==null){
    $("rec-next-date").value=$("rec-start-date").value;
  }
});

["chart-start","chart-end","chart-period"].forEach(id=>{
  $(id).addEventListener("change",()=>{
    selectedCategoryName=null;
    selectedTrendKey=null;
    refreshCharts();
  });
});

$("chart-this-month-btn").addEventListener(
  "click",
  ()=>setChartRange("month")
);

$("chart-six-month-btn").addEventListener(
  "click",
  ()=>setChartRange("six")
);

$("chart-this-year-btn").addEventListener(
  "click",
  ()=>setChartRange("year")
);

$("record-view-mode").addEventListener("change",updateRecordModeUI);
$("record-month").addEventListener("change",renderRecordPage);
$("record-date").addEventListener("change",renderRecordPage);

$("record-prev-btn").addEventListener(
  "click",
  ()=>navigateRecordPage(-1)
);

$("record-next-btn").addEventListener(
  "click",
  ()=>navigateRecordPage(1)
);

$("export-btn").addEventListener("click",exportCSV);

$("import-btn").addEventListener(
  "click",
  ()=>$("csv-file").click()
);

$("csv-file").addEventListener("change",async()=>{
  const f=$("csv-file").files?.[0];

  if(f){
    try{
      await importCSVFile(f);
    }catch(e){
      console.error(e);
      alert("CSV 匯入失敗");
    }
  }

  $("csv-file").value="";
});

$("backup-now-btn").addEventListener("click",async()=>{
  await createBackup("manual");
  alert("本機備份完成");
});

$("restore-backup-btn").addEventListener(
  "click",
  restoreSelectedBackup
);

$("export-json-btn").addEventListener(
  "click",
  exportJSONBackup
);

$("import-json-btn").addEventListener(
  "click",
  ()=>$("json-file").click()
);

$("json-file").addEventListener("change",async()=>{
  const f=$("json-file").files?.[0];

  if(f){
    try{
      await importJSONFile(f);
    }catch(e){
      console.error(e);
      alert("JSON 匯入失敗");
    }
  }

  $("json-file").value="";
});

window.addEventListener("resize",()=>{
  if(!$("charts-panel").classList.contains("hidden"))refreshCharts();
});

document.addEventListener("visibilitychange",async()=>{
  if(document.visibilityState==="visible"&&db){
    await processRecurringTransactions(false);
    await maybeAutoBackup("auto-open");
  }
});

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const registration=await navigator.serviceWorker.register(
        "./sw.js?v=8",
        {updateViaCache:"none"}
      );
      await registration.update();
    }catch(error){
      console.error("Service Worker error:",error);
    }
  });
}

/* ---------- Init ---------- */

(async function init(){
  try{
    await openDB();
    await ensureSettings();

    const today=new Date();

    $("date").value=localDateString(today);
    $("month-filter").value=localMonthString(today);

    $("record-month").value=localMonthString(today);
    $("record-date").value=localDateString(today);

    $("rec-start-date").value=localDateString(today);
    $("rec-next-date").value=localDateString(today);

    const sixStart=new Date(today.getFullYear(),today.getMonth()-5,1);

    $("chart-start").value=localDateString(sixStart);
    $("chart-end").value=localDateString(today);
    $("chart-period").value="month";

    await loadRecurring();
    await processRecurringTransactions(false);
    await loadTransactions();

    resetForm();
    resetRecurringForm();
    updateRecordModeUI();
    refreshCharts();

    await maybeAutoBackup("auto-open");

    showPanel("home-panel");

    setInterval(async()=>{
      await processRecurringTransactions(false);
      await maybeAutoBackup("auto-open");
    },60*60*1000);
  }catch(e){
    console.error(e);
    alert("資料庫初始化失敗，請重新整理頁面。");
  }
})();
