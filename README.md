# Accounting PWA v7

## 圓餅圖選取效果
選取支出分類後：
- 該扇形向外突出
- 該扇形半徑略微放大
- 外框加粗
- 對應 legend 加上選取框
- 下方顯示分類、占比與金額

可用兩種方式選取：
1. 點圓餅圖扇形
2. 點分類 legend

## 收支趨勢選取效果
點擊任一：
- 收入 bar
- 支出 bar
- 結餘折線上的 point

就會選取「整個當期」。

選取後：
- 當期收入 / 支出 bar 加框
- 結餘 point 放大
- 當期背景淡色標示
- 下方同時顯示：
  - 收入
  - 支出
  - 結餘

例如：
2026/10
收入：$50,000　支出：$18,500　結餘：$31,500

## PWA 更新
靜態資源版本升為 v7：
- style.css?v=7
- app.js?v=7
- manifest.json?v=7
- accounting-pwa-v7 cache

## Git 更新
git add .
git commit -m "Add interactive chart selection details"
git push

資料庫 DB_VERSION 仍為 4，不會清除既有資料。
