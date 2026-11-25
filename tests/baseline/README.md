# Client contract checks

From the submission root, run `npm ci --prefix tests/baseline` followed by `npm test --prefix tests/baseline` with Node.js 24. The tests load the submitted client's mock transport from `frontend/src/api/mock.ts`. Each scenario has isolated storage and a controlled clock. The case IDs and expected outcomes are in [the test baseline](../../docs/test-baseline.md).
