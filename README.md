# Accounting PWA v6

這版修正兩個問題：

1. 所有 iPhone 日期 / 月份欄位都強制在卡片內對齊
2. 圖表真正改成新版互動圖，並強制刷新 PWA cache

## 日期欄位
套用到：
- 新增紀錄日期
- 定期記帳開始日期
- 定期記帳下次記帳日
- 圖表開始 / 結束日期
- 記帳紀錄月份 / 日期

iOS Safari 使用：
- `-webkit-appearance: none`
- `min-width: 0`
- `max-width: 100%`
- `inline-size: 100%`
- `::-webkit-date-and-time-value`
- `::-webkit-datetime-edit`

圖表日期與定期記帳日期在手機上改為單欄全寬。

## 支出分類
真正改成 donut / pie chart。
點擊：
- 圓餅 slice
- 下方分類名稱

會顯示：
`分類：xx.x% · $金額`

## 收支趨勢
- 綠色 bar：收入
- 紅色 bar：支出
- 黑色折線：結餘 = 收入 - 支出
- 左側有 Y 軸金額
- 點擊 bar 顯示精確金額

## 強制更新 PWA
v6 使用：
- `style.css?v=6`
- `app.js?v=6`
- `manifest.json?v=6`
- `sw.js?v=6`
- `updateViaCache: "none"`
- network-first / `cache:"no-store"`

更新 GitHub 後，建議先用 Safari 開網站網址一次，再完全關閉主畫面 PWA 後重開。

## Git
git add .
git commit -m "Fix all iPhone date fields and interactive charts"
git push

DB_VERSION 仍為 4，既有資料不會被清除。
