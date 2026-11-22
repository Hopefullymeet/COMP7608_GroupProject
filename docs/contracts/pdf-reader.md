# PDF 阅读批注与图表检索

复用[共用协议](protocol.md)中的主题范围、写入重试和任务事件。所有位置以原始 PDF 的版本和页码为准，坐标为旋转后的可视页从左上角起的 0–1 比例。文字范围可包含多块矩形，手绘记录点列。

| 操作 | 请求与返回 |
| --- | --- |
| 打开 PDF | `reader.pdf` 用主题与论文版本返回原 PDF 字节的 Base64。 |
| 读取 PDF 自带批注 | `reader.embedded_marks` 按主题、论文版本、页码返回只读条目。每条附嵌入对象 ID、原始类型、归一化矩形、选中文字、备注及作者。单页超过 500 条时返回 `truncated`。条目沿用 PDF 版本，原文件和工作区批注均不改写。 |
| 保存、编辑、删除批注 | `reader.marks` 按主题和版本返回列表。`reader.mark_save` 保存页码、位置、类型、颜色、文字选区或备注。编辑及 `reader.mark_delete` 提交当前 `base_revision`。过期编辑返回 `STALE_REVISION`。 |
| 导出批注副本 | `reader.export` 按主题和版本返回副本文件名和 Base64。原件保留在库内。 |
| 按描述找区域 | `visual.search` 接收主题、所选版本和自然语言描述，返回图、表或公式的版本、页码、矩形、编号和图注。算法使用图内文字、视觉特征及正文交叉引用。无法建立索引的论文会计入 `skipped`。`visual.objects` 列出指定版本可识别的区域，`visual.crop` 读取某一页的合法矩形。 |
| 问原文 | `reader_question` 接收问题、论文版本、页码、矩形及 `medium`。文字问题在确认后只向所选文本模型提供由原文区域提取的文字。图片问题把裁剪区域交给配置的本机视觉模型。`reader.answers` 返回主题内已有回答及原位置。会话中的提问在任务参数外层传 `session_id`，读取回答时按此字段筛选。省略字段可查看整个主题的选区答复。会话不属于指定主题时返回未找到错误。 |
| 翻译 PDF | `reader_translation` 通过 `task.prepare → task.start` 发起。输入 `source_version_id`、`target_language`，以及最多八个 `pages`，或单页 `page` 和 `rects`；可填最多 30 个术语的 `glossary`。确认单列出需要发送的页和术语。 |
| 读回译文 | `reader.translations` 接收 `topic_id`、`source_version_id`、`page`；返回译文记录及逐段 `source`、`translation`、`rects`。页内原文与译文用同一个段落 ID 配对。 |
| 视觉描述补充 | `visual.capabilities` 返回是否配置了本地视觉模型。使用 `task.prepare → task.start` 发起 `visual_index`，输入论文版本。每批补充至多 24 张图像的描述，已提交的描述按模型和图块缓存。结束事件包括 `indexed` 与 `remaining`。仍有图块待处理时返回 `partial`。若本批达到了上限，`issue.reason` 为 `VISUAL_BATCH_REMAINING`；若某个图块无法处理，则为 `VISUAL_DESCRIPTIONS_INCOMPLETE`。重新发起同一任务时只处理尚无缓存的图块。 |
| 保存到 Wiki | `reader.mark_to_wiki` 或 `reader.answer_save` 显式保存批注或回答。证据保留区域锚点，`evidence.open` 返回 `region`。已换版的论文需复核后再保存，已保存条目会显示待复核。 |

将 ALCE、ASQA、RARR 导入同一主题。搜索「几个小框、不同色块和箭头组成的流程图」后打开 ALCE 的第 1 页并定位原图。框选其中一块写备注，再导出 PDF 副本。用选区发起问题时，可以从回答回到同一部分原文。

翻译任务按页保存结果，结束事件的 `result.pages` 包含页码、`translation_id` 和 `cached`。任一页失败时，已保存页仍可读回。至少有一页可用时返回 `partial`；没有可用译文时返回 `failed`。`issue.details.pages` 列出失败的页及重试条件。相同主题、版本、页或选区、目标语言、术语和模型的请求复用成功结果。纯缓存请求不发起外部调用。

接口目前消费 PDF 原有文字层。无文字的选区或页面会返回 `NO_TEXT_IN_SELECTION`。译文记录与原 PDF 位置相连，可实现左原右译；版面重排与扫描件 OCR 单独接入。
