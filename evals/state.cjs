const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { fixture } = require("./fixtures.cjs");
const { stripTypeScriptTypes } = require("node:module");
const { pathToFileURL } = require("node:url");
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
(async () => {
  const api = url(
    stripTypeScriptTypes(fs.readFileSync("apps/frontend/src/api.ts", "utf8")).replace('from "react"', 'from "' + pathToFileURL(require.resolve("react")).href + '"'),
  );
  const source = stripTypeScriptTypes(
    fs.readFileSync("apps/frontend/src/taskPresentation.ts", "utf8"),
  ).replace('from "./api"', 'from "' + api + '"');
  const {
    taskPresentation,
    taskTitle,
    paymentAccount,
    businessParagraph,
    isComplexPlan,
    committedSummary,
  } = await import(url(source));
  const checks = [];
  function check(name, fn) {
    fn();
    checks.push(name);
    console.log("PASS", name);
  }
  check("eight primary states map from backend vocabulary", () => {
    assert.equal(taskPresentation(null, null).code, "not_started");
    const map = {
      planning: "planning",
      running: "running",
      waiting: "awaiting_user",
      success: "succeeded",
      failed: "failed",
      cancelled: "cancelled",
      partial: "partial",
      unknown: "unknown",
    };
    for (const [input, code] of Object.entries(map)) {
      const r = fixture(input);
      assert.equal(
        taskPresentation(r.plan, r, ["planning", "running"].includes(input))
          .code,
        code,
      );
    }
  });
  check("unknown overrides stale success/cancelled and blocks restart", () => {
    const r = fixture("unknown");
    r.plan.status = "succeeded";
    assert.equal(taskPresentation(r.plan, r).code, "unknown");
    r.plan.status = "cancelled";
    assert.equal(taskPresentation(r.plan, r).canRestart, false);
    assert.equal(taskPresentation(null, { ...r, plan: null }).code, "unknown");
  });
  check(
    "partial cancellation keeps committed transaction and blocks repeating it",
    () => {
      const r = fixture("partial"),
        before = JSON.stringify(r);
      const s = taskPresentation(r.plan, r);
      assert.equal(s.committed.length, 1);
      assert.equal(s.canRestart, false);
      assert.equal(JSON.stringify(r), before);
    },
  );
  check(
    "cancelled transfer says not executed only with explicit cancelled operation",
    () => {
      const r = fixture("cancelled");
      assert.equal(taskPresentation(r.plan, r).summary, "转账未执行。");
      r.plan.nodes[0].tool = "card.report_lost";
      assert(!taskPresentation(r.plan, r).summary.includes("转账"));
    },
  );
  check(
    "paused, handoff, clarification and interrupted remain distinct",
    () => {
      for (const status of [
        "paused",
        "handoff",
        "clarification",
        "interrupted",
      ]) {
        const r = fixture("waiting");
        r.plan.status = status;
        r.status = status;
        assert.equal(taskPresentation(r.plan, r).code, status);
      }
    },
  );
  check(
    "response preparation never exposes a final success state early",
    () => {
      const r = fixture("success");
      assert.equal(
        taskPresentation(r.plan, { ...r, status: "running" }, true).code,
        "running",
      );
    },
  );
  check(
    "source account mirrors backend ID ordering; cannot invent account",
    () => {
      assert.equal(paymentAccount(null), undefined);
      const o = {
        accounts: [
          { id: "acct-z", name: "Z" },
          { id: "acct-a", name: "A" },
        ],
      };
      assert.equal(paymentAccount(o).name, "A");
      assert.equal(o.accounts[0].name, "Z");
    },
  );
  check("business title uses resolved recipient and exact cents", () => {
    const r = fixture("waiting");
    assert(
      taskTitle(r.plan, { contacts: [{ id: "li", name: "李娜" }] }).includes(
        "300.00",
      ),
    );
  });
  check(
    "known metadata leaves prose while complete raw evidence stays unchanged",
    () => {
      const r = fixture("success"),
        raw = `已转账 ¥300.00，回执编号 ${r.plan.nodes[0].operation.receipt.id}。`;
      assert.equal(businessParagraph(raw, r.plan), "已转账 ¥300.00。");
      assert(r.plan.nodes[0].operation.receipt.id);
      assert.equal(businessParagraph("客户备注 A/B", r.plan), "客户备注 A/B");
    },
  );
  check("complexity uses actual branches and joins, not decoration", () => {
    assert.equal(isComplexPlan(fixture("waiting").plan), false);
    const p = fixture("partial").plan;
    assert.equal(isComplexPlan(p), false);
    p.nodes.push({ ...p.nodes[1], id: "n3", depends_on: ["n1"] });
    assert.equal(isComplexPlan(p), true);
  });
  check("missing receipt amount never becomes a fabricated zero", () => {
    const r = fixture("success");
    delete r.plan.nodes[0].operation.receipt.amount_cents;
    assert(!committedSummary(r.plan.nodes[0]).includes("0.00"));
  });
  fs.writeFileSync(
    "evals/results/state.json",
    JSON.stringify(
      { mode: "presentation-contract", checks, errors: [] },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
