const DB_NAME = "AccountingDB";
const DB_VERSION = 1;
const STORE_NAME = "transactions";

let db;

const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = function(event) {

    db = event.target.result;

    if (!db.objectStoreNames.contains(STORE_NAME)) {

        const store = db.createObjectStore(
            STORE_NAME,
            {
                keyPath: "id",
                autoIncrement: true
            }
        );

        store.createIndex("date", "date");
        store.createIndex("category", "category");
        store.createIndex("type", "type");
    }
};

request.onsuccess = function(event) {

    db = event.target.result;

    setDefaultDate();
    loadTransactions();
};

request.onerror = function(event) {
    console.error("IndexedDB error:", event);
};

const addBtn = document.getElementById("add-btn");

addBtn.addEventListener("click", addTransaction);


function addTransaction() { // 新增交易紀錄

    const date =
        document.getElementById("date").value;

    const type =
        document.getElementById("type").value;

    const amount =
        Number(document.getElementById("amount").value);

    const category =
        document.getElementById("category").value;

    const payment =
        document.getElementById("payment").value;

    const merchant =
        document.getElementById("merchant").value.trim();

    const note =
        document.getElementById("note").value.trim();


    if (!date) {
        alert("請選擇日期");
        return;
    }

    if (!amount || amount <= 0) {
        alert("請輸入正確金額");
        return;
    }


    const transactionData = {

        date,
        type,
        amount,
        category,
        payment,
        merchant,
        note,

        createdAt:
            new Date().toISOString()
    };


    const transaction =
        db.transaction(
            STORE_NAME,
            "readwrite"
        );

    const store =
        transaction.objectStore(STORE_NAME);

    store.add(transactionData);


    transaction.oncomplete = function() {

        document.getElementById("amount").value = "";
        document.getElementById("merchant").value = "";
        document.getElementById("note").value = "";

        loadTransactions();
    };
}

function loadTransactions() { // 讀取交易紀錄

    const transaction =
        db.transaction(
            STORE_NAME,
            "readonly"
        );

    const store =
        transaction.objectStore(STORE_NAME);

    const request =
        store.getAll();


    request.onsuccess = function() {

        const records =
            request.result.sort(
                (a, b) =>
                    b.date.localeCompare(a.date)
                    ||
                    b.id - a.id
            );

        renderTransactions(records);

        updateMonthlySummary(records);
    };
}

function renderTransactions(records) { // 渲染交易紀錄

    const container =
        document.getElementById("transaction-list");

    container.innerHTML = "";


    if (records.length === 0) {

        container.innerHTML =
            "<p>目前沒有記帳紀錄。</p>";

        return;
    }


    for (const item of records) {

        const div =
            document.createElement("div");

        div.className = "transaction";


        const amountClass =
            item.type === "expense"
                ? "expense"
                : "income";


        const sign =
            item.type === "expense"
                ? "-"
                : "+";


        div.innerHTML = `

            <div class="transaction-top">

                <span>
                    ${escapeHtml(item.category)}
                </span>

                <span class="${amountClass}">
                    ${sign}$${item.amount.toLocaleString()}
                </span>

            </div>

            <div class="transaction-meta">

                ${escapeHtml(item.date)}

                ·

                ${escapeHtml(item.payment)}

                ${item.merchant
                    ? " · " + escapeHtml(item.merchant)
                    : ""}

                ${item.note
                    ? " · " + escapeHtml(item.note)
                    : ""}

            </div>

            <button
                class="delete-btn"
                onclick="deleteTransaction(${item.id})">

                刪除

            </button>
        `;

        container.appendChild(div);
    }
}

function escapeHtml(value) { // 避免 XSS 攻擊

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function deleteTransaction(id) { // 刪除交易紀錄

    if (!confirm("確定要刪除這筆紀錄嗎？")) {
        return;
    }


    const transaction =
        db.transaction(
            STORE_NAME,
            "readwrite"
        );

    const store =
        transaction.objectStore(STORE_NAME);

    store.delete(id);


    transaction.oncomplete = function() {
        loadTransactions();
    };
}

function updateMonthlySummary(records) { // 更新本月支出統計

    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(now.getMonth() + 1)
            .padStart(2, "0");

    const prefix =
        `${year}-${month}`;


    const total =
        records
            .filter(
                item =>
                    item.type === "expense"
                    &&
                    item.date.startsWith(prefix)
            )
            .reduce(
                (sum, item) =>
                    sum + item.amount,
                0
            );


    document.getElementById(
        "monthly-summary"
    ).textContent =
        `本月支出：$${total.toLocaleString()}`;
}

const exportBtn =
    document.getElementById("export-btn");

exportBtn.addEventListener(
    "click",
    exportCSV
);


function csvEscape(value) {

    const str =
        String(value ?? "");

    return `"${str.replaceAll('"', '""')}"`;
}


function exportCSV() { // 匯出 CSV 檔案

    const transaction =
        db.transaction(
            STORE_NAME,
            "readonly"
        );

    const store =
        transaction.objectStore(STORE_NAME);

    const request =
        store.getAll();


    request.onsuccess =
        async function() {

        const records =
            request.result;


        if (records.length === 0) {
            alert("沒有資料可以匯出");
            return;
        }


        const header = [
            "id",
            "date",
            "type",
            "category",
            "amount",
            "payment",
            "merchant",
            "note",
            "createdAt"
        ];


        let csv =
            header
                .map(csvEscape)
                .join(",")
            + "\n";


        for (const item of records) {

            const row = [

                item.id,
                item.date,
                item.type,
                item.category,
                item.amount,
                item.payment,
                item.merchant,
                item.note,
                item.createdAt

            ];

            csv +=
                row
                    .map(csvEscape)
                    .join(",")
                + "\n";
        }


        /*
         * BOM:
         * Windows Excel 開中文 CSV
         * 比較不容易亂碼
         */

        const csvData =
            "\uFEFF" + csv;


        const today =
            new Date()
            .toISOString()
            .slice(0, 10);


        const filename =
            `accounting_${today}.csv`;


        const file =
            new File(
                [csvData],
                filename,
                {
                    type:
                    "text/csv;charset=utf-8"
                }
            );


        /*
         * iPhone 優先使用 Share Sheet
         */

        if (
            navigator.share
            &&
            navigator.canShare
            &&
            navigator.canShare({
                files: [file]
            })
        ) {

            try {

                await navigator.share({

                    files: [file],

                    title:
                        "記帳資料 CSV"
                });

                return;

            } catch (error) {

                if (
                    error.name ===
                    "AbortError"
                ) {
                    return;
                }
            }
        }


        /*
         * fallback
         */

        const url =
            URL.createObjectURL(file);

        const a =
            document.createElement("a");

        a.href = url;
        a.download = filename;

        document.body.appendChild(a);

        a.click();

        a.remove();

        URL.revokeObjectURL(url);
    };
}

function setDefaultDate() { // 設定預設日期為今天

    const today =
        new Date()
            .toLocaleDateString(
                "en-CA"
            );

    document.getElementById(
        "date"
    ).value = today;
}


