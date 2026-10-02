# Accounting PWA v9 — Category System

新增：
- 類別分為 income / expense，只依目前記帳類型顯示。
- 支出類別使用暖珊瑚紅；收入類別使用鼠尾草綠。
- 類別選擇改為自製 picker，可顯示 Phosphor Bold 圖示與顏色。
- picker 內有「新增類別」，可直接進入新增類別畫面。
- 新增/編輯類別可設定名稱、性質與 32 個 Phosphor Bold 圖示。
- 類別管理頁分成支出與收入兩區。
- 舊字串類別自動 migration 成物件資料；歷史紀錄會補 categoryId。
- transaction / recurring / CSV / JSON backup / 圖表均支援新版 category schema。

Phosphor Icons 使用官方 @phosphor-icons/web 2.1.2 Bold webfont。

Git 更新：

```bash
git add .
git commit -m "Add typed categories and Phosphor icon library"
git push
```

DB_VERSION 升為 5，但不刪除任何既有 object store。
