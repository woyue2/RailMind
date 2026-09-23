# RailMind 交互链路穷举清单

> 基准版本：当前 `main` 分支（v1.8+，含 K1–K10 修复批次）。数据模型见 `src/types/index.ts`，Store 见 `src/store/useFlowStore.ts`。
>
> 本文件每一条链路必须包含 **4 个锚点**：触发入口 → 函数/Action → 数据影响 → 外部副作用。
> 严禁"用户 → 页面 → 数据库"式宏观空话。无代码证据的路径标记为 `[未找到实现]`。

---

## 0. 持久化层概览（所有链路共享的底座）

| 层 | 实现 | 位置 | 备注 |
|---|---|---|---|
| Store 进程状态 | Zustand `create()` | `src/store/useFlowStore.ts:349` | 内存态 |
| 本地持久化 | Zustand `persist` middleware + 自定义 `quotaSafeStorage` | `src/store/useFlowStore.ts:1081-1113` + `src/store/quotaSafeStorage.ts` | key=`flow-01-storage-v3`，存 **localStorage**，version=7。**不使用 IndexedDB**。超 5MB 配额时逐级剥离 base64 图片 → base64 音频，保住元数据 |
| 墓碑持久化 | localStorage `flow.sync.tombstones.v1` | `src/sync/credentials.ts:73-88` | 每次 save/load 全量读写 |
| R2 凭据 | localStorage `flow.r2.settings.v1` + `flow.r2.secret.v1` | `src/sync/credentials.ts:17-60` | Secret Key 单独 key |
| 云端同步 | Cloudflare R2 S3-compatible + SigV4 | `src/sync/r2-client.ts` | 直连 fetch，零中转 |
| 附件存储 | **已删除** | ~~`src/utils/attachmentStorage.ts`~~ | K4 修复批次移除。所有图片/音频统一以 base64 字符串嵌入 RecordItem.imgs/audio |
| 导出 | Capacitor Filesystem + Share（原生）/ Blob anchor click（Web） | `src/utils/exportFile.ts` | 仅 JSON，不含图片/音频 |

---

## 一、导航层（路由/Tab/上下文）

### N1. 侧边栏 Tab 切换

- **触发入口** — `MobileShell.tsx`：侧边栏按钮 `<button onClick={() => setActiveTab(id)}>`（id ∈ {record, review, matrix, value-matrix, thread-detail, desk}）。VALID_TABS 白名单见 `useFlowStore.ts:209`
- **函数/Action** — `useFlowStore.setActiveTab`（定义于 `useFlowStore.ts:637-650`）
- **数据影响范围** — `activeTab`；当切到 record 时额外清 `selectedDate`/`fromReviewDate`/`fromThreadDetailId`/`threadDetailReturnContext`
- **外部副作用** — localStorage persist 自动落盘；**不触发 R2 同步**
- **悬挂路径** — 无。v7 migrate 会把老数据里残留的 `activeTab: 'widgets'` 兜底为 `'record'`（K5 修复批次）

### N2. 侧边栏思维线点击 → 思维线详情页

- **触发入口** — `MobileShell.tsx:106`：`<button onClick={() => openThreadDetail(thread.id)}>`
- **函数/Action** — `useFlowStore.openThreadDetail`（`useFlowStore.ts:697-709`）
- **数据影响范围** — `activeTab='thread-detail'`、`selectedThreadId`、`threadDetailReturnContext`（快照当前 tab/selectedDate/recordViewMode/fromReviewDate/fromThreadDetailId）
- **外部副作用** — localStorage persist；**不触发 R2 同步**
- **悬挂路径** — 无

### N3. Android 物理返回键

- **触发入口** — `MobileShell.tsx:39-72`：`CapacitorApp.addListener('backButton', ...)`
- **函数/Action** — 分支逻辑：
  1. 先 `dispatchEvent(SYSTEM_BACK_EVENT)` 给 modal（`useSystemBack` 消费），若某 modal 标记 `handled=true` 则终止
  2. thread-detail → `backFromThreadDetail()` (`useFlowStore.ts:712`)
  3. record + fromThreadDetail → `backToThreadDetail()` (`useFlowStore.ts:765`)
  4. record + fromReviewDate → `backToReview()` (`useFlowStore.ts:755`)
  5. review/matrix/value-matrix/desk → `setActiveTab('record')`
  6. 否则 `window.history.back()` 或 `CapacitorApp.exitApp()`
- **数据影响范围** — 各 back action 回写 `activeTab` + 上下文状态
- **外部副作用** — localStorage persist
- **悬挂路径** — 无

### N4. RecordView 内部导航按钮组

| 按钮 | 位置 | Action |
|---|---|---|
| 返回思维线/回顾 | `RecordView.tsx:432` / `:440` | `backToThreadDetail` / `backToReview` |
| 回到今天 | `RecordView.tsx:461` | `resetToTodayRecord` (`useFlowStore.ts:787`) |
| 回顾/四象限/价值象限/桌邊 | `RecordView.tsx:503/:511/:519/:527` | `setActiveTab('review'\|'matrix'\|'value-matrix'\|'desk')` |
| 时间流/翻页模式 | `RecordView.tsx:541/:552` | `setRecordViewMode` (`useFlowStore.ts:809`) |
| 翻页箭头/日期跳转 | `RecordView.tsx:567/:582/:601/:626` | 直接调 `scrollToPage()`/`jumpToDate()`（本地 state，**不触发 R2**） |

### N5. 矩阵/桌邊/回顾页返回

- **触发入口** — `EisenhowerMatrixView.tsx:42`、`ValuePriorityMatrixView.tsx:43`、`DeskEdgeView.tsx:126`、`ReviewView.tsx:107`
- **函数/Action** — `setActiveTab('record')`
- **悬挂路径** — 无

### N6. 矩阵记录卡片点击 → 跳转并高亮

- **触发入口** — `EisenhowerMatrixView.tsx:67`、`ValuePriorityMatrixView.tsx:66`：`<article onClick={() => jumpToRecord(record)}>`
- **函数/Action** — `openDateRecord` (`useFlowStore.ts:735`) + `setHighlightRecordId` + 本地 `revealElement` 后清高亮
- **数据影响范围** — `activeTab='record'`、`selectedDate`、`fromReviewDate=true`
- **外部副作用** — localStorage persist；**不触发 R2 同步**
- **悬挂路径** — 无

### N7. 搜索结果点击 → 跳转并高亮

- **触发入口** — `RecordSearch.tsx:95`：`<button onClick={() => { closeSearch(); onSelect(record); }}>` → `RecordView.handleSearchResult`
- **函数/Action** — timeline 模式直接 `setSelectedDate(dateKey)` + `setHighlightRecordId` + `revealElement` + 350ms 后 `setHighlightRecordId(null)`
- **数据影响范围** — `selectedDate`、`highlightRecordId`（瞬时）
- **外部副作用** — localStorage persist（selectedDate 持久化；highlightRecordId 不持久化）
- **悬挂路径** — 无

---

## 二、Record CRUD 链路

### R1. 创建新记录（纯文本/图片/音频/分支/引用）

- **触发入口** — `RecordInputBar.tsx`：`<form onSubmit={handleSubmit}>` → `addRecord(inputText, {...options})`
- **函数/Action** — `useFlowStore.addRecord`（`useFlowStore.ts:235-296`）。批量场景（ValuePriorityWizard 拆解子任务）走 `addRecords`（`useFlowStore.ts:298-360`）
- **数据影响范围**：
  - `records.push(newRecord)`
  - 若新记录带 `thread_id` → 关联 thread 的 `last_used_at=nowIso`
  - 若带 `quote_id` 或跨日分支 → 调 `resolveQuoteColorUpdate` 给源记录分配 `quote_color`（同源同色，首次随机后复用）
  - 清 `activeBranchParentId` / `activeQuoteRecordId` / `quickSelectedThreadId`
- **外部副作用**：
  - Zustand persist middleware → localStorage（`quotaSafeStorage`，超 5MB 逐级剥 base64）
  - `triggerAutoSync(sync.pushRecord(newRecord))` → `enqueue(PUT records/{id}.json)`
  - 若有 thread_id → `triggerAutoSync(sync.pushThread(updatedThread))`
  - 若分配了 quote_color → `triggerAutoSync(sync.pushRecord(targetColorUpdate))`
  - **图片/音频以 base64 字符串直接嵌入 RecordItem.imgs/audio 字段，无独立文件管理**
- **悬挂路径** — 无
- **批量优化** — `addRecords` 单次 set 写入全部记录 + 去重 thread 更新 + seen 集合保证同一 parent_id 只判一次引用色，避免 N 轮订阅通知

### R2. 从已有记录续写（分支模式）

- **触发入口** — 两种入口：
  1. `RecordItemRow.tsx`：GitBranch 按钮 → `handleBranchClick` → `setActiveBranchParentId(item.id)`
  2. `RecordItemRow.tsx` / `RecordInputBar.tsx`：分支态 alert 关闭按钮 → `setActiveBranchParentId(null)`
- **函数/Action** — `setActiveBranchParentId`（`useFlowStore.ts:751`）
- **数据影响范围** — `activeBranchParentId`（**瞬时 UI 状态，不应持久化**。当前 `partialize` 用 spread 会把它也存进 localStorage — 见 L2）
- **外部副作用** — 无（纯前端 UI 态）
- **悬挂路径** — L2：刷新后"正在分支"的 UI 态会残留

### R3. 引用已有记录

- **触发入口** — `RecordItemRow.tsx`：Quote 按钮 → `handleQuoteClick` → `setActiveQuoteRecordId(item.id)`
- **函数/Action** — `setActiveQuoteRecordId`（`useFlowStore.ts:753`）
- **数据影响范围** — `activeQuoteRecordId`（**瞬时 UI 状态，不应持久化**。同上 L2）
- **外部副作用** — 无
- **悬挂路径** — L2：刷新后"正在引用"的 UI 态会残留

### R4. 快速思维线胶囊

- **触发入口** — `RecordInputBar.tsx:286`：`onClick={() => setQuickSelectedThreadId(thread.id)}`
- **函数/Action** — `setQuickSelectedThreadId`（`useFlowStore.ts:802-805`，toggle 语义）
- **数据影响范围** — `quickSelectedThreadId`（瞬时 UI 状态）
- **外部副作用** — 无
- **悬挂路径** — 无

### R5. 更新记录（文字/标签/思维线/图片/背景色/矩阵标记）

- **触发入口** — 多 UI 入口（全部走同一 store action）：

| 操作 | 触发入口 | updateRecord 参数 |
|---|---|---|
| 内联编辑文字 | `RecordItemRow.tsx:180` handleSaveEdit | `{ text: trimmed }` |
| 直接关联思维线（快速胶囊激活态） | `RecordItemRow.tsx:206` handleThreadLinkClick | `{ thread_id }` |
| 通过 ThreadPickerModal 选思维线 | `RecordView.tsx:375` handleSelectThread | `{ thread_id }` |
| 通过 TagPickerModal 选/清标签 | `RecordView.tsx:386` handleSelectTag | `{ tag_id }` |
| 追加图片 | `RecordItemRow.tsx:235` handleAddImages | `{ imgs: merged }` |
| 录音替换/添加 | `RecordItemRow.tsx:953` AudioRecorderModal.onSaveAudio | `{ audio }` |
| 设置背景色 | `RecordItemRow.tsx:803/:829/:856` Palette 点击 | `{ bg_color }` 或 null |
| 艾森豪矩阵 | `RecordItemRow.tsx:963` EisenhowerQuadrantModal.onSelect / `EisenhowerMatrixView.tsx:107` | `{ eisenhower_quadrant }` 或 null |
| 价值四象限 | `RecordItemRow.tsx:395/:396` 快捷按钮 / `ValuePriorityMatrixView.tsx:83` | `{ value_priority }` 或 null |
| 价值象限 Wizard 子任务批量生成 | `ValuePriorityWizard.tsx:82` / `:93` | 复杂：update container + 批量 addRecord 子分支 |

- **函数/Action** — `useFlowStore.updateRecord`（`useFlowStore.ts:441-472`）
- **数据影响范围**：
  - 目标 record 合并 `updates` + `updated_at=nowIso`
  - 若 `updates.thread_id` → 关联 thread 的 `last_used_at=nowIso`
- **外部副作用**：
  - localStorage persist
  - `triggerAutoSync(sync.pushRecord(updatedRecord))`
  - 若带 thread_id → `triggerAutoSync(sync.pushThread(updatedThread))`
- **悬挂路径** — 无（updateRecord 自身不会在 record 不存在时抛错，只是 updatedRecord 为 undefined 时跳过 sync）

### R6. 删除记录（级联分支）

- **触发入口** — `RecordItemRow.tsx`：`MoreHorizontal` 展开 → 红色 X → `ConfirmDeleteModal.onConfirm` → `deleteRecord(item.id)`
- **函数/Action** — `useFlowStore.deleteRecord`（`useFlowStore.ts:395-420`）
- **数据影响范围**：
  - BFS 递归收集所有 `parent_id` 指向被删记录的子记录
  - `records.filter(!removedIds)`
- **外部副作用**：
  - localStorage persist
  - 每个被删记录 → `triggerAutoSync(sync.deleteRecord(record.id))`
  - `sync.deleteRecord` → 写墓碑到 `tombstones/record/{id}.json` + `flow.sync.tombstones.v1` → DELETE `records/{id}.json`
  - **撤销路径**：`RecordView` 撤销按钮 → `restoreRecords` → 先 `removeTombstoneRecords('record', ids)` 清本地墓碑 → `sync.clearTombstones` 清远端墓碑 → `sync.pushRecord` 推回正文本体（K6 修复，不再有墓碑短路）
- **悬挂路径** — 无

### R7. 置顶/取消置顶浮动气泡

- **触发入口** — `RecordItemRow.tsx:337`（Pin 图标）→ `togglePinRecord(item.id)`；或 `FloatingBubblePin.tsx:261`（X 按钮）→ `unpinRecord(currentPin.id)`
- **函数/Action** — `useFlowStore.togglePinRecord`（`useFlowStore.ts:513-536`）/ `unpinRecord`（`useFlowStore.ts:538-560`）
- **数据影响范围** — `is_pinned`、`pinned_at`、`updated_at`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord(targetRecord))`
- **悬挂路径** — 无

### R8. 标记完成

- **触发入口** — `RecordItemRow.tsx:355` / `EisenhowerMatrixView.tsx:80` / `ValuePriorityMatrixView.tsx:70`
- **函数/Action** — `toggleCompletedRecord`（`useFlowStore.ts:562-583`）
- **数据影响范围** — `is_completed`、`updated_at`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord)`
- **悬挂路径** — 无

---

## 三、Tag / Thread CRUD 链路

### T1. 创建新 Tag

- **触发入口** — `TagPickerModal.tsx:34`（新建按钮 → 输入框 → 创建）
- **函数/Action** — `useFlowStore.createTag`（`useFlowStore.ts:634-648`）
- **数据影响范围** — `tags.push(newTag)`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushTag(newTag))`
- **悬挂路径** — 无

### T2. 删除 Tag

- **触发入口** — `TagPickerModal.tsx`：每个 tag 行末尾 trash 按钮 → `setPendingDelete({id, name, count})` → `ConfirmDeleteModal` → 确认后 `deleteTag(id)`
- **函数/Action** — `useFlowStore.deleteTag`（`useFlowStore.ts:605-622`）
- **数据影响范围**：
  - `tags.filter(!id)`
  - 把 `records` 中 `tag_id===id` 的记录 `tag_id` 清为 null + `updated_at=nowIso`
- **外部副作用**：
  - localStorage persist
  - 每条被解绑的 record → `triggerAutoSync(sync.pushRecord(record))`
  - `triggerAutoSync(sync.deleteTag(id))` → 写墓碑 + DELETE `tags/{id}.json`
- **悬挂路径** — 无

### T3. 创建新 Thread

- **触发入口** — `ThreadPickerModal.tsx:37`（+新建思维线 → 输入框 → 创建并关联）
- **函数/Action** — `useFlowStore.createThread`（`useFlowStore.ts:585-601`）
- **数据影响范围** — `threads.unshift(newThread)`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushThread(newThread))`
- **悬挂路径** — 无

### T4. 删除 Thread

- **触发入口** — `ThreadPickerModal.tsx`：每个 thread 行末尾 trash 按钮 → `setPendingDelete({id, title, count})` → `ConfirmDeleteModal` → 确认后 `deleteThread(id)`
- **函数/Action** — `useFlowStore.deleteThread`（`useFlowStore.ts:531-556`）
- **数据影响范围**：
  - `threads.filter(!id)`
  - 把 `records` 中 `thread_id===id` 的记录 `thread_id` 清为 null + `updated_at=nowIso`
  - 若当前停留在该思维线详情页 → 自动退回到 record tab + 清 `selectedThreadId`
  - 清 `quickSelectedThreadId` 若匹配
- **外部副作用**：
  - localStorage persist
  - 每条被解绑的 record → `triggerAutoSync(sync.pushRecord(record))`
  - `triggerAutoSync(sync.deleteThread(id))` → 写墓碑 + DELETE `threads/{id}.json`
- **悬挂路径** — 无

---

## 四、桌邊抽屜（DeskEdge）全链路

DeskEdge 的所有 CRUD action 都走同一种模式：先 set 改本地 state，再 `triggerDeskRowSync(rowId)` 把整个 row 对象推到 R2。

### D1. 新增一行

- **触发入口** — `DeskEdgeView.tsx:143` / `:162`：新增一行按钮
- **函数/Action** — `useFlowStore.addDeskRow`（`useFlowStore.ts:823-835`）
- **数据影响范围** — `deskRows.push(newRow)`
- **外部副作用** — localStorage persist + `triggerDeskRowSync(newRow.id)` → `sync.pushDeskRow(row)` → `PUT desks/{id}.json`
- **悬挂路径** — 无

### D2. 编辑桌邊标题

- **触发入口** — `DeskEdgeView.tsx:216`：标题点击 → 内联编辑 → 保存按钮 `DeskEdgeView.tsx:197`
- **函数/Action** — `updateDeskRowTitle`（`useFlowStore.ts:837-847`）
- **数据影响范围** — 目标 row 的 `title` + `updated_at`
- **外部副作用** — localStorage persist + `triggerDeskRowSync(rowId)`
- **悬挂路径** — 空字符串保护（`if (!trimmed) return`）

### D3. 删除桌邊

- **触发入口** — `DeskEdgeView.tsx`：垃圾桶按钮 → `setPendingDelete({kind:'row', rowId})` → `ConfirmDeleteModal`（标题"确定要删除整个桌邊吗？"）→ 确认后 `handleConfirmDelete` → `deleteDeskRow(rowId)`
- **函数/Action** — `useFlowStore.deleteDeskRow`（`useFlowStore.ts:804-812`）
- **数据影响范围** — `deskRows.filter(!id)`；**删除前先取完整 row 对象**返回供撤销用
- **外部副作用** — localStorage persist + `triggerDeskRowSync(rowId, true)` → `sync.deleteDeskRow(id)` → 写墓碑 + DELETE 远端
- **悬挂路径** — 无。K7 修复：有 confirm + 有 undo

### D3.1 撤销删除桌邊

- **触发入口** — `DeskEdgeView.tsx`：删除后 6s 内底部 undo toast 点击 → `handleUndoDelete`
- **函数/Action** — `restoreDeskRow(removedRow)`（`useFlowStore.ts:814-824`）
- **数据影响范围**：
  - upsert：若 row.id 已存在 → 覆盖；否则 push 到末尾
  - 清本地墓碑 `removeTombstoneRecords('desk', [row.id])`
- **外部副作用** — localStorage persist + `sync.clearTombstones('desk', [row.id])` 清远端墓碑 + `triggerDeskRowSync(row.id)` pushDeskRow 推回正文本体
- **悬挂路径** — 无

### D4. 新增抽屉

- **触发入口** — `DeskEdgeView.tsx`：新增抽屉按钮
- **函数/Action** — `addDeskDrawer`（`useFlowStore.ts:826-848`）
- **数据影响范围** — row 内 `drawers.push(newDrawer)` + row `updated_at`
- **外部副作用** — localStorage persist + `triggerDeskRowSync(rowId)`
- **悬挂路径** — 无

### D5. 编辑抽屉标题 / 删除抽屉

- **触发入口** — `DeskEdgeView.tsx`
  - 编辑：抽屉标题点击 → 内联编辑 → 保存 → `updateDeskDrawerTitle`
  - 删除：trash 按钮 → `setPendingDelete({kind:'drawer', drawer})` → `ConfirmDeleteModal`（标题"确定要删除整个抽屉吗？"）→ 确认 → `deleteDeskDrawer(drawerId)`
- **函数/Action** — `updateDeskDrawerTitle` / `deleteDeskDrawer`（`useFlowStore.ts:850-893`）
- **数据影响范围** — drawer `title` / 移除 drawer + row `updated_at`；删除时**返回 `{rowId, drawer, index}` 三元组供撤销**（必须在删除前取 `rowId`，注释明确"不能再用 deskRowIdForDrawer 反查"）
- **外部副作用** — localStorage persist + `triggerDeskRowSync(removed.rowId)`（删除前取 rowId，注释说明不能反查）
- **悬挂路径** — 无

### D5.1 撤销删除抽屉

- **触发入口** — `DeskEdgeView.tsx`：删除后 6s 内底部 undo toast 点击 → `handleUndoDelete`
- **函数/Action** — `restoreDeskDrawer(rowId, drawer, index)`（`useFlowStore.ts:895-907`）
- **数据影响范围** — row.drawers 在原 index 位置 splice 插回 drawer + row `updated_at`（**不写墓碑** — deleteDeskDrawer 只做 row upsert，不写远端墓碑，因为 drawer 是嵌套在 row 里的数组元素）
- **外部副作用** — localStorage persist + `triggerDeskRowSync(rowId)`
- **悬挂路径** — 无（因为 drawer 不独立写墓碑，恢复也无需清墓碑 — 与 desk row 不同）

### D6. 抽屉展开/收起 + 变暗

- **触发入口** — `DeskEdgeView.tsx`（点击抽屉卡）→ `toggleDeskDrawer(drawer.id, next)`；变暗按钮 → `toggleDeskDrawerDimmed`
- **函数/Action** — `toggleDeskDrawer`（`useFlowStore.ts:1026-1059`）/ `toggleDeskDrawerDimmed`（`useFlowStore.ts:1061-1079`）
- **数据影响范围** — drawer 的 `expanded_override`、`expanded_override_date`、`state_updated_at` / `is_dimmed`、`state_updated_at`；row 的 `state_updated_at`
- **外部副作用** — localStorage persist + `triggerDeskRowSync(rowId)`
- **悬挂路径** — 无

### D7. 抽屉内文字条目 CRUD

- **触发入口** — `DeskEdgeView.tsx`
  - 新增：输入框 Enter → `addDeskEntry`
  - 编辑：文字双击 → 内联编辑 → 保存 → `updateDeskEntry`
  - 删除：trash 按钮 → `setPendingDelete({kind:'entry', drawerId, entryId})` → `ConfirmDeleteModal` → 确认 → `deleteDeskEntry(drawerId, entryId)`
- **函数/Action** — `addDeskEntry` / `updateDeskEntry` / `deleteDeskEntry`（`useFlowStore.ts:909-1000`）
- **数据影响范围** — drawer `entries` 数组 + drawer `updated_at` + row `updated_at`；删除返回 `{drawerId, entry, index}` 三元组
- **外部副作用** — localStorage persist + `triggerDeskRowSync(ownerRow.id)`（删除时 ownerRow 在删除前取）
- **悬挂路径** — 无

### D7.1 撤销删除文字条目

- **触发入口** — `DeskEdgeView.tsx`：删除后 6s 内底部 undo toast 点击 → `handleUndoDelete`
- **函数/Action** — `restoreDeskEntry(drawerId, entry, index)`（`useFlowStore.ts:1002-1024`）
- **数据影响范围** — 目标 drawer.entries 在原 index splice 插回 entry + drawer `updated_at`
- **外部副作用**：
  - localStorage persist + `triggerDeskRowSync(rowId)`
  - 若目标 drawer 已被提前删除 → 返回 `false`，toast 显示"所在抽屉已被删除，无法撤销"
- **悬挂路径** — 无（抽屉不存在有显式兜底）

### D8. DeskEdge 通用撤销 UI

- **触发入口** — D3.1 / D5.1 / D7.1 共用同一套 toast（`DeskEdgeView.tsx` 底部）
- **函数/Action** — `showUndo(state)` → 6s setTimeout；`handleUndoDelete` 按 kind 分派到对应 restore
- **数据影响范围** — 组件本地 `undoState`（瞬时，不持久化）
- **悬挂路径** — 无

---

## 五、设置与 R2 手动同步链路

### S1. 设置透明度滑块（时间流 / 翻页）

- **触发入口** — `SettingsModal.tsx:145`：`<input type="range" onChange={option.setValue(Number(...))}>`
- **函数/Action** — `setTimelineDateHeaderBackgroundOpacity`（`useFlowStore.ts:811`）/ `setDailyPageDateHeaderBackgroundOpacity`（`useFlowStore.ts:814`）
- **数据影响范围** — 两个 opacity 值，clamp 到 [0,100]
- **外部副作用** — localStorage persist；**不触发 R2 同步**
- **悬挂路径** — 无

### S2. 保存 R2 凭据

- **触发入口** — `SettingsModal.tsx:266`："保存设置" submit → `handleSave` → `saveR2Settings(settings)`
- **函数/Action** — `saveR2Settings`（`credentials.ts:37-43`）
- **数据影响范围** — localStorage `flow.r2.settings.v1` + `flow.r2.secret.v1`
- **外部副作用** — 纯本地；**不自动触发同步**
- **悬挂路径** — 无

### S3. 测试 R2 连接

- **触发入口** — `SettingsModal.tsx:247`："测试连接"按钮 → `handleTest` → `testR2Connection()`
- **函数/Action** — `testR2Connection`（`sync/index.ts:248-259`）→ `new R2Client(config).testConnection()`
- **数据影响范围** — 无（纯网络）
- **外部副作用** — 发 1 个 `GET /?list-type=2&max-keys=1&prefix=_sync/` 请求（SigV4 签名），有 15s 超时
- **悬挂路径** — 无

### S4. 立即手动全量同步

- **触发入口** — `SettingsModal.tsx:256`："立即同步"按钮 → `handleManualSync` → `triggerR2Sync({ manual: true })`
- **函数/Action** — `triggerR2Sync`（`sync/index.ts:203-246`）→ `R2SyncService.runSync()`（`r2-sync.ts:210`）
- **数据影响范围**：
  - 拉取远端 records/threads/tags/desks → 按 revisionOf 比较后写入本地 store（`flowRepository.saveXxx`）
  - 拉取远端 homeLink → 时间戳比较后覆盖本地
  - 推送本地 records/threads/tags/desks → 远端 revision 比本地新则 PUT
  - 墓碑双向同步（先 push 本地墓碑，再 pull 远端墓碑并执行本地删除）
- **外部副作用**：
  - 本地 localStorage persist + 墓碑 localStorage
  - 远端：records/*.json / threads/*.json / tags/*.json / desks/*.json / settings/home-link.json / tombstones/{entity}/{id}.json 全量读写
  - 60s 总超时；每个请求 15s 超时；受控并发 4
  - SyncProgressOverlay 展示毛玻璃遮罩（manual=true 或冷启动）
- **悬挂路径** — 见「已知问题」第 2、3 条

### S5. App 启动自动同步

- **触发入口** — `MobileShell.tsx:30-34`：`useEffect(() => triggerR2Sync({manual: false}), [])`
- **函数/Action** — 同上
- **数据影响范围** — 同上
- **外部副作用** — 同 S4；manual=false 只在冷启动（本地数据全空）展示遮罩
- **悬挂路径** — 无

---

## 六、主页链接（HomeLink）链路

### H1. 点击打开 / 长按编辑

- **触发入口** — `RecordView.tsx:477-487`：homeLink 按钮
  - 短按 → `openHomeLink()` → 构造 `<a>` 并 `.click()`（`RecordView.tsx:128-141`）
  - 长按（>550ms）→ `setHomeLinkModalOpen(true)`
- **函数/Action** — `setHomeLink`（`useFlowStore.ts:817-821`）
- **数据影响范围** — `homeLink`（含 `shownName`、`href`、`updatedAt`）
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushHomeLink(nextLink))` → `PUT settings/home-link.json`（null 时 DELETE）
- **悬挂路径** — 无

---

## 七、导出链路

### E1. 导出 JSON

- **触发入口** — `ReviewView.tsx:142`："导出最近 7 天"/"导出所有记录"按钮 → `handleExport`
- **函数/Action**：
  1. `buildWeeklyExport(snapshot.records, snapshot.tags, snapshot.threads, new Date(), exportScope)`（`utils/weeklyExport.ts`）
  2. `exportJsonFile(filename, data)`（`utils/exportFile.ts:5-37`）
- **数据影响范围** — 无（纯读 store）
- **外部副作用**：
  - Capacitor 原生：`Filesystem.writeFile(Directory.Cache, 'exports/{timestamp}/{filename}')` → `Share.share()`
  - Web：Blob + `a.download` + `URL.revokeObjectURL`
  - **不含图片和音频**（buildWeeklyExport 只处理文本 + tag/thread 关联）
- **悬挂路径** — 无

---

## 八、FloatingBubblePin（浮动气泡）链路

### P1. 点击浮标 → 跳转原始记录

- **触发入口** — `FloatingBubblePin.tsx:124-177`：`onPointerDown/Up` 判断未拖过 → `handleJumpToOriginal(currentPin)`
- **函数/Action** — 先找 DOM 节点 `record-{id}`，找不到则 `openDateRecord(dateKey)` + `setHighlightRecordId` + `revealElement` + 1600ms 后清高亮
- **数据影响范围** — `selectedDate`、`activeTab='record'`、`highlightRecordId`（瞬时）
- **悬挂路径** — 无

### P2. 浮标拖拽

- **触发入口** — `FloatingBubblePin.tsx`：`onPointerMove` → `setPos(clampPosition(...))`
- **数据影响范围** — 组件本地 `pos` state + 调 `persistBubblePos(pos)` 写 localStorage（K9 修复，位置现在持久化到单独 key）
- **悬挂路径** — 无。详见 `src/utils/bubblePosition.ts`

---

## 九、图片/音频处理链路（RecordInputBar + RecordItemRow）

### IM1. 图片选择 → 压缩 → 存 base64

- **触发入口** — `RecordInputBar.tsx:431`（新建记录输入栏相机按钮）或 `RecordItemRow.tsx:539/:578/:896`（已有记录追加图片）
- **函数/Action**：
  1. `<input type="file" accept="image/*" multiple>.click()`
  2. `handleFileChange` / `handleAddImages` → `processImageFiles(files, currentCount)`
  3. 新建记录走 `setPendingImgs` + submit 时 `addRecord(...imgs: pendingImgs)`
  4. 已有记录走直接 `updateRecord({imgs: merged})`
- **数据影响范围** — RecordItem.imgs（base64 字符串数组，最多 4 张）
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord)`
- **悬挂路径** — 无 attachmentStorage 参与；**R2 同步会把 base64 图片直接塞进 JSON 上传，体积大**

### IM2. 图片全屏查看

- **触发入口** — `RecordItemRow.tsx:523/:561` / `ThreadDetailView.tsx:162/:176` → `ImageViewerModal`
- **函数/Action** — 纯本地 React state，不影响 store
- **外部副作用** — 无

### AU1. 新建记录时录音

- **触发入口** — `RecordInputBar.tsx:454`（麦克风按钮）→ `handleStartRecording` → `createRecordingSession()`（`utils/audioUtils.ts`）
- **函数/Action**：MediaRecorder API → 60s 自动停止 → `setPendingAudio({url: dataUrl, duration, format})` → submit 时 `addRecord(...audio: pendingAudio)`
- **数据影响范围** — RecordItem.audio（AudioAttachment 对象，url 是 data URL）
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord)`
- **悬挂路径** — 无 attachmentStorage 参与；同图片体积问题

### AU2. 已有记录补录/重录语音

- **触发入口** — `RecordItemRow.tsx:919` → `AudioRecorderModal`（`RecordItemRow.tsx:950-955`）→ `updateRecord(item.id, { audio })`
- **函数/Action** — 同上
- **悬挂路径** — 无

### AU3. 播放语音

- **触发入口** — `AudioPlayerPill.tsx`（多处引用：RecordItemRow、ThreadDetailView）
- **数据影响范围** — 纯本地 HTMLAudioElement 播放；**无持久化/同步**
- **悬挂路径** — 无

---

## 十、Eisenhower 矩阵与 ValuePriority 向导链路

### Q1. Eisenhower 四象限打标 / 移除

- **触发入口** — `RecordItemRow.tsx:374`（快捷按钮）/ `RecordItemRow.tsx:957`（EisenhowerQuadrantModal）/ `EisenhowerMatrixView.tsx:89`（菜单）
- **函数/Action** — `updateRecord(item.id, { eisenhower_quadrant } | null)`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord)`

### Q2. ValuePriority Wizard（单条快速判断）

- **触发入口** — `RecordItemRow.tsx:395/:396` → `ValuePriorityWizard`（`RecordItemRow.tsx:968-972`）
- **函数/Action** — 6 步问答（routine / oneAction / highValue / highDelayLoss / highLeverage / unlocksWork）→ `buildValueProfile()` → `updateRecord({ value_priority: profile })`
- **外部副作用** — localStorage persist + `triggerAutoSync(sync.pushRecord)`

### Q3. ValuePriority Wizard（多子任务拆解）

- **触发入口** — Wizard step=6 "拆成可执行分支"（`ValuePriorityWizard.tsx`）
- **函数/Action** — `createBreakdown()` → 逐子任务重复 Wizard → 全部完成后：
  - 原记录 `updateRecord({ value_priority: { is_container: true, is_routine, reason } })`
  - 全部子任务一次性 `addRecords(subtasks)`（K10 修复：批量 set 一次而非 N 次独立 addRecord）
- **数据影响范围** — 多条 Record；子任务记录与原记录有 parent_id 分支关系。批量创建时 `resolveQuoteColorUpdate` 用 `seen` 集合保证同一 parent_id 只判一次引用色
- **外部副作用** — **单次 set** → localStorage persist 只写一次；但子任务仍逐条 enqueue pushRecord + 每条独立引用色更新时二次 push。父/思维线 `last_used_at` 只推进一次（去重）
- **悬挂路径** — 无

---

## 十一、已知问题 / 悬挂路径全表

> 修复批次：6ff9e93（K6 墓碑）/ ad5e16e（K7 confirm+undo, K9 quotaSafe）/ 9caed89（K8 bubble, K10 batch）/ 6124bcd（K1/K2/K5）/ 6cc831c（K3）。全部已修复。

### ✅ 已全部关闭

| # | 原问题 | 修复 commit | 当前状态 |
|---|---|---|---|
| K1 | `deleteTag` 无 UI 入口 | 6124bcd | ✅ TagPickerModal 行内删除按钮 + ConfirmDeleteModal |
| K2 | `deleteThread` 无任何实现 | 6124bcd | ✅ ThreadPickerModal 行内删除 + 解绑关联记录（不连坐） |
| K3 | `resetToDefaultData` 无 UI 入口 | 6cc831c | ✅ 按用户要求彻底移除（action + UI + mock 种子全部删除） |
| K4 | `src/utils/attachmentStorage.ts` 死文件 | 9caed89 | ✅ 184 行 dead code 已删除 |
| K5 | Widgets Tab 不可达 | 6124bcd | ✅ Tab + 视图删除；ActiveTab 收窄；persist version 7 + VALID_TABS 白名单兜底防白屏 |
| K6 | restoreRecords 不墓碑 → 墓碑冲突 | 6ff9e93 | ✅ `removeTombstoneRecords` + `sync.clearTombstones` 在 pushRecord 之前执行；desk row restore 同理 |
| K7 | 桌邊删除无确认无撤销 | ad5e16e | ✅ ConfirmDeleteModal + 6s undo toast（行/抽屉/条目三级） |
| K8 | triggerAutoSync 每次 createR2SyncService 新实例 | 1877c3b | ✅ syncService 构造已缓存；enqueue 串行队列保证顺序 |
| K9 | 浮标位置不持久化 | 9caed89 | ✅ `src/utils/bubblePosition.ts` localStorage persist |
| K10 | localStorage 单 key 存全部 + 静默写失败 | ad5e16e | ✅ `src/store/quotaSafeStorage.ts` 超 5MB 逐级剥 base64 → 先图后音频 |

### 🟡 数据一致性风险（仍存在）

| # | 问题 | 证据 | 风险 |
|---|---|---|---|
| L1 | localStorage 持久化 payload 里包含 30+ 个 action 函数 | `partialize: (state) => ({ ...state, threadDetailReturnContext: null })` 用 spread 把所有字段带进去 | JSON.stringify 会静默忽略函数所以**不会真的膨胀 payload**，但属于防御性技术债 — 若未来有人加了非函数不应持久化的字段（如 cache: Map）会被意外序列化 |
| L2 | `activeBranchParentId` / `activeQuoteRecordId` 被意外持久化 | 同上 spread partialize 会包含瞬时交互状态 | 刷新后"正在引用/分支"的 UI 态残留（实际没坏处，但语义上是瞬态不应持久化） |
| L3 | sync 层 `pushHomeLink` 直接调 PUT/DELETE，不走 `syncEntities` 修订比较 | `r2-sync.ts` pushHomeLink 方法 | 单条操作，幂等安全；但完整 sync 时走另一条路径（runSync settings 阶段），两条路径独立 |
| L4 | R2 凭据 localStorage key 未加密 | `credentials.ts` 明文 localStorage | 桌面浏览器下 DevTools 可读；但项目主打 Android Capacitor，原生场景隔离较好 |

### 🟢 轻微 / 未使用字段

| # | 问题 | 证据 |
|---|---|---|
| L5 | RecordItem.parent_id 用于展示分支树；删除父记录级联删除子记录 → 合理 | `deleteRecord` BFS 递归收集 parent_id 子树 |
| L6 | `revisionOf` 选最大时间戳比较；quote_color 变更会手动刷新 updated_at | `addRecord` / `addRecords` 内给源记录配 quote_color 时写 `updated_at: nowIso` → ✅ 已覆盖 |
| L7 | 桌邊 drawer/entry 不独立写墓碑 — 删除只 upsert 整个 row | 与 record/tag/thread/deskRow 不同 | 合理，因为 drawer/entry 是 row 内嵌数组元素，deleteDeskRow 才写墓碑 |

---

## 十二、外部副作用汇总表

| 类型 | 触发条件 | 具体动作 |
|---|---|---|
| localStorage persist | 任何 store action | Zustand persist middleware + quotaSafeStorage 自动把 flow-01-storage-v3 写 localStorage。超 5MB 时先剥 base64 图片，再剥 base64 音频，保住元数据 |
| localStorage 墓碑 | deleteRecord / deleteTag / deleteThread / deleteDeskRow | 手动写 `flow.sync.tombstones.v1` |
| localStorage 墓碑清除 | restoreRecords / restoreDeskRow | `removeTombstoneRecords` 清本地 + `sync.clearTombstones` 清远端 |
| localStorage R2 凭据 | SettingsModal 保存 | `flow.r2.settings.v1` + `flow.r2.secret.v1` |
| localStorage 浮标位置 | FloatingBubblePin 拖拽 | `persistBubblePos(pos)` 写单独 key |
| R2 PUT | addRecord / addRecords / updateRecord / togglePin / toggleCompleted / restoreRecords | `enqueue(PUT records/{id}.json)` |
| R2 PUT Thread | addRecord 带 thread_id / updateRecord 带 thread_id / createThread / deleteThread 解绑记录 | `enqueue(PUT threads/{id}.json)` |
| R2 PUT Tag | createTag / deleteTag 解绑记录 | `enqueue(PUT tags/{id}.json)` |
| R2 DELETE + 墓碑 | deleteRecord / deleteTag / deleteThread / deleteDeskRow | 写墓碑 → `enqueue(PUT tombstones/{entity}/{id}.json)` → DELETE `{entity}s/{id}.json` |
| R2 PUT DeskRow | 桌邊任何 CRUD + 任何 restoreDeskRow/Drawer/Entry | `enqueue(PUT desks/{rowId}.json)` — 所有桌邊操作只 upsert row，不独立写 drawer/entry 墓碑 |
| R2 PUT HomeLink | setHomeLink | `enqueue(PUT settings/home-link.json)`（null 时 DELETE） |
| R2 全量双向 sync | SettingsModal 手动同步 / App 启动 | `runSync` 5 阶段 → 墓碑 → records → threads → tags → desks → settings |
| SyncProgressOverlay | R2 失败（节流：只展示首次失败，后续 5s 内静默） | 毛玻璃遮罩 + 失败提示 |
| StorageQuotaNotice | quotaSafeStorage 超 5MB 触发剥离 | 底部 notice 提示用户 |
| Capacitor Filesystem | ReviewView 导出（原生） | 写 Cache 目录 `exports/{ts}/{filename}` |
| Capacitor Share | ReviewView 导出（原生） | 调系统分享 |
| DOM fetch（Web 导出） | ReviewView 导出（Web） | Blob + a.download |
| System Browser | 打开 HomeLink | `<a href=... target='_blank'>.click()` |
| Android Share Intent | 同上 | Capacitor Share |
| Capacitor exitApp | Android 返回栈空 | `CapacitorApp.exitApp()` |
| MediaRecorder API | RecordInputBar / RecordItemRow 录音 | 原生 MediaRecorder |

---

## 附录 A：Store Action 索引（按调用次数排序）

| Action | 调用处数（UI → Store） | 触发 R2 |
|---|---|---|
| `updateRecord` | 20+ | ✅ pushRecord (+ pushThread 若改 thread_id) |
| `addRecord` | 2（input bar / ValuePriorityWizard 非批量场景） | ✅ pushRecord (+ pushThread + 源记录 color 更新时二次 push) |
| `addRecords` | 1（ValuePriorityWizard 批量拆解） | ✅ 单次 set；逐条 pushRecord + 去重 pushThread + 源记录 color 更新 push |
| `setActiveTab` | 10+（侧边栏/各页返回） | ❌ |
| `setActiveBranchParentId` / `setActiveQuoteRecordId` / `setQuickSelectedThreadId` | 6 | ❌ |
| `togglePinRecord` / `unpinRecord` | 4 | ✅ pushRecord |
| `toggleCompletedRecord` | 3 | ✅ pushRecord |
| `openThreadDetail` / `backFromThreadDetail` / `openDateRecord` / `backToReview` / `backToThreadDetail` / `resetToTodayRecord` | 10+ | ❌ |
| `deleteRecord` | 1 | ✅ 级联墓碑 + delete |
| `restoreRecords` | 1（撤销按钮） | ✅ 清墓碑 + pushRecord |
| `createThread` | 2（ThreadPickerModal） | ✅ pushThread |
| `deleteThread` | 1（ThreadPickerModal 行内删除 + ConfirmDeleteModal） | ✅ 解绑记录 pushRecord + deleteThread 写墓碑 |
| `createTag` | 1（TagPickerModal） | ✅ pushTag |
| `deleteTag` | 1（TagPickerModal 行内删除 + ConfirmDeleteModal） | ✅ 解绑记录 pushRecord + deleteTag 写墓碑 |
| `setHomeLink` | 1（HomeLinkModal） | ✅ pushHomeLink |
| `addDeskRow` / `updateDeskRowTitle` / `deleteDeskRow` | 各 1 | ✅ triggerDeskRowSync |
| `restoreDeskRow` | 1（undo toast） | ✅ clearTombstones + pushDeskRow |
| `addDeskDrawer` / `updateDeskDrawerTitle` / `deleteDeskDrawer` | 各 1 | ✅ triggerDeskRowSync |
| `restoreDeskDrawer` | 1（undo toast） | ✅ triggerDeskRowSync |
| `addDeskEntry` / `updateDeskEntry` / `deleteDeskEntry` | 各 1 | ✅ triggerDeskRowSync |
| `restoreDeskEntry` | 1（undo toast，可能返回 false） | ✅ triggerDeskRowSync |
| `toggleDeskDrawer` / `toggleDeskDrawerDimmed` | 各 1 | ✅ triggerDeskRowSync |
| `setRecordViewMode` | 2（时间流/翻页切换） | ❌ |
| `setTimelineDateHeaderBackgroundOpacity` / `setDailyPageDateHeaderBackgroundOpacity` | 各 1（SettingsModal） | ❌ |
| `setHighlightRecordId` | 多处（瞬时） | ❌ |
| `resetToDefaultData` | — | — **已彻底移除（commit 6cc831c），不再存在此 action** |
