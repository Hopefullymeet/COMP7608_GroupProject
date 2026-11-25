# 测试入口

[基线用例与判定规则](../../docs/test-baseline.md) · [论文评估结果](../../docs/paper-evaluation.md)

## 离线回归

从仓库根目录运行。需要 Node.js 24、pnpm 11、Python 3.12 或以上、Poppler（pdftotext、pdfinfo、pdftoppm）。CI 使用 Python 3.12。安装依赖后，回归使用当前检出的代码、本地替身和仓内 PDF。

```sh
python3 -m venv /tmp/papertrace-test-env
source /tmp/papertrace-test-env/bin/activate
python3 -m pip install -r tests/baseline/requirements.txt -r data-preparation/requirements.txt
pnpm --dir frontend install --frozen-lockfile
npm ci --prefix tests/baseline
npm test --prefix tests/baseline
```

| 入口 | 检查 |
|---|---|
| mainline.test.mjs、language.test.mjs | 客户端接口主线、缺全文两种终态、语言切换和重载 |
| frontend/tests/workspace.test.mjs | 工作区恢复、授权、RPC 通道等前端回归 |
| backend_cases.py、test_comparison_recovery.py | 按基线编号执行后端测试，任一断言失败或用例跳过均返回非零 |
| data-preparation/validate_data.py、paper_eval.py、score_papers.py | 检查 PDF 与评审记录完整性、正式导入和检索权限，按题型汇总参考页覆盖率 |

## 重算已有成绩

以下命令只读仓库内的观测和判分，离线即可执行。

```sh
cd tests/baseline
python3 -B score_papers.py results/retrieval.jsonl.gz
python3 -B score_papers.py results/predictions.jsonl.gz --grades results/judgments.jsonl.gz
```

## 真实模型复测

使用桌面已选供应商、模型及系统凭据。工作区为临时目录。每项实验使用独立的输出文件。三组推理比较 81 道可执行语义题、每组两轮；另检查三个缺文件输入。判分阶段可读取参考答案。桌面链路可只重跑某类题。

```sh
cd tests/baseline
out=$(mktemp -d)
python3 -B paper_eval.py --live --output "$out/predictions.jsonl"
python3 -B score_papers.py "$out/predictions.jsonl" --judge "$out/judgments.jsonl"
python3 -B desktop_papers.py --output "$out/desktop.jsonl"
python3 -B desktop_papers.py --task paper_comparison --output "$out/comparisons.jsonl"
```

这些命令产生实际模型调用和费用。GitHub Actions 只运行离线回归。
