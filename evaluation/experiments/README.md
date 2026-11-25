# Final report evaluation

From the extracted PaperTrace directory, run the following command to reproduce the live experiment tables offline. The scorer reads the original model responses, request usage and saved semantic judgments in `evaluation/experiments/recorded`. It verifies case coverage and matches judgments to the saved output.

```sh
python -B -X utf8 evaluation/experiments/report_results.py
```

Use `--figure-data DIR` to export both time/token scatter series.

## Reading QA judging and human check

Codex assigned the two binary reading QA scores. Core coverage requires the full answer to accurately convey every core fact in the reference. Evidence support requires the quotes linked to the first cited sentence in run 1 to jointly support every material detail and qualifier in that sentence. The answer with no cited sentence has no evidence-support score. The scorer checks whether quotes resolve to the selected source version separately.

A group member independently applied the same criteria with the Codex scores hidden. The targeted sample included nine answers from run 1 and three from run 2. In run 1, it covered all four sentences initially marked as having insufficient evidence, the answer with no citations, and four randomly selected answers with supported sentences. The three run 2 answers were randomly selected from questions absent from the run 1 sample. The human judgments agreed on all 12 core-coverage scores and all eight evidence-support scores. `recorded/qa-assessment.json` stores the per-answer judgments and notes under `human_review`. `human_checked` counts reviewed answers.

## Collect fresh model responses

Run from the repository root or extracted PaperTrace folder. Use Python 3.12.13 with `pypdf==6.4.0` installed in the same environment (`python -m pip install pypdf==6.4.0`). Put Node 24 on PATH or set `PAPERTRACE_NODE` to its executable. Configure `deepseek-flash` at `https://api.deepseek.com`, disable the optional reviewer, and make the API key available to the worker via the selected desktop provider or the shell's `DEEPSEEK_API_KEY` when no saved provider is selected. Live requests consume provider quota. Use a fresh extraction for a new experiment because runners can reuse earlier results.

For example, in Windows PowerShell with uv installed, prepare the Python environment for the five commands below. If using an environment key, enter it at the masked prompt.

```powershell
uv venv --python 3.12.13 .venv
uv pip install --python .venv/Scripts/python.exe pypdf==6.4.0
$env:Path = "$(Resolve-Path .venv/Scripts);$env:Path"
node --version
if (-not $env:DEEPSEEK_API_KEY) {
    # Skip this block when using a saved desktop provider.
    $env:DEEPSEEK_API_KEY = [Net.NetworkCredential]::new('', (Read-Host 'DeepSeek API key' -AsSecureString)).Password
}
```

| Report experiment | Fresh collection command |
| --- | --- |
| Desktop reading and citation checks, two rounds | `python -B -X utf8 evaluation/experiments/run_batch.py` |
| Three withheld-source cases | `python -B -X utf8 evaluation/experiments/run_product.py --missing-only --output evaluation/experiments/results/missing.jsonl` |
| Desktop comparisons, two rounds | `python -B -X utf8 evaluation/experiments/run_comparison.py` |
| Research-engine labels, Agent and fixed BM25 | `python -B -X utf8 evaluation/experiments/run_engine_audit.py --output evaluation/experiments/results/engine-audit.jsonl` |
| Cross-session Wiki, six papers, 48 trials | `python -B -X utf8 evaluation/experiments/warm-wiki/run.py` |

## Score a fresh collection

1. The first four commands write their responses under `evaluation/experiments/results`. In that directory, create `qa-assessment.json` for the 36 new reading answers and `app-comparison-review.csv` for the 48 new comparison cells. Follow the corresponding files in `recorded/` for fields and rating categories. Use the new task IDs and cell texts when grading.
2. Grade the 48 new Wiki trials with the condition hidden. Save the new `judgments.jsonl` alongside the six `*-trials.jsonl` files in `evaluation/experiments/warm-wiki/results/`. Match each judgment to its trial using the first ten hexadecimal characters of the SHA-256 digest of the UTF-8 task ID (`snapshot.task_id`). See `recorded/wiki/judgments.jsonl` for the fields.
3. With all three new grading files saved, run this PowerShell example from the extracted PaperTrace folder to assemble the scorer's input and print the report metrics.

```powershell
$records = 'evaluation/experiments/results'
$wikiRuns = 'evaluation/experiments/warm-wiki/results'
$wiki = New-Item -ItemType Directory -Force -Path "$records/wiki"
Copy-Item -Path "$wikiRuns/*-trials.jsonl" -Destination $wiki.FullName
Copy-Item -LiteralPath "$wikiRuns/judgments.jsonl" -Destination $wiki.FullName
python -B -X utf8 evaluation/experiments/report_results.py --records $records
```

The deterministic worker replay, client contract tests and paper collection validation commands are in the project README. The 28 observed user tasks are in `evaluation/live_traces.json`.
