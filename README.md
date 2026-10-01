# Accounting PWA v5

本版調整：

## 1. iPhone 日期欄位不再超出卡片
- 所有 date / month input 設定 `min-width: 0`
- grid 欄位使用 `minmax(0, 1fr)`
- 所有日期欄位固定 `width: 100%` / `max-width: 100%`

## 2. 區間支出分類改成互動式圓餅圖
- 每個分類是一個 slice
- 下方保留可換行的分類 legend，不會因名稱太長截斷
- 點擊圓餅 slice 或分類 legend 顯示：
  - 分類名稱
  - 支出占比 %
  - 支出金額

## 3. 區間收支趨勢圖
- 收入：綠色 bar
- 支出：紅色 bar
- 結餘（收入 - 支出）：黑色折線
- 左側新增 Y 軸金額與水平格線
- 點擊收入 / 支出 bar 顯示該期精確金額

## 4. 記帳紀錄控制區重新排版
手機版與桌面版都固定為：

[ 每頁顯示 ]
[ 選擇日期 ]
[ 上一頁 ][ 下一頁 ]

左右邊界一致，兩個換頁按鈕各占 50%。

## 更新
覆蓋原 repository 的：
- index.html
- style.css
- app.js
- sw.js
- manifest.json

然後：

git add .
git commit -m "Improve mobile dates and interactive charts"
git push

資料庫 schema 沒有改動，DB_VERSION 保持 4，既有資料不需 migration。
