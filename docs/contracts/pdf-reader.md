# PDF 阅读批注与图表检索

复用[共用协议](protocol.md)中的主题范围、写入重试和任务事件。所有位置以原始 PDF 的版本和页码为准，坐标为旋转后的可视页从左上角起的 0–1 比例。文字范围可包含多块矩形，手绘记录点列。

| 操作 | 请求与返回 |
| --- | --- |
| 打开 PDF | `reader.pdf` 用主题与论文版本返回原 PDF 字节的 Base64。 |
| 保存、编辑、删除批注 | `reader.marks` 按主题和版本返回列表。`reader.mark_save` 保存页码、位置、类型、颜色、文字选区或备注。编辑及 `reader.mark_delete` 提交当前 `base_revision`。过期编辑返回 `STALE_REVISION`。 |
| 导出批注副本 | `reader.export` 按主题和版本返回副本文件名和 Base64。原件保留在库内。 |
| 按描述找区域 | `visual.search` 接收主题、所选版本和自然语言描述，返回图、表或公式的版本、页码、矩形、编号和图注。算法使用图内文字、视觉特征及正文交叉引用。无法建立索引的论文会计入 `skipped`。`visual.objects` 列出指定版本可识别的区域，`visual.crop` 读取某一页的合法矩形。 |
| 问原文 | `reader_question` 接收问题、论文版本、页码、矩形及 `medium`。文字问题在确认后只向所选文本模型提供由原文区域提取的文字。图片问题把裁剪区域交给配置的本机视觉模型。`reader.answers` 返回主题内已有回答及原位置。会话中的提问在任务参数外层传 `session_id`，读取回答时按此字段筛选。省略字段可查看整个主题的选区答复。会话不属于指定主题时返回未找到错误。 |
| 视觉描述补充 | `visual.capabilities` 返回是否配置了本地视觉模型。使用 `task.prepare → task.start` 发起 `visual_index`，输入论文版本。每批补充至多 24 张图像的描述，已提交的描述按模型和图块缓存。结束事件包括 `indexed` 与 `remaining`。 |
| 保存到 Wiki | `reader.mark_to_wiki` 或 `reader.answer_save` 显式保存批注或回答。证据保留区域锚点，`evidence.open` 返回 `region`。已换版的论文需复核后再保存，已保存条目会显示待复核。 |

将 ALCE、ASQA、RARR 导入同一主题。搜索「几个小框、不同色块和箭头组成的流程图」后打开 ALCE 的第 1 页并定位原图。框选其中一块写备注，再导出 PDF 副本。用选区发起问题时，可以从回答回到同一部分原文。
