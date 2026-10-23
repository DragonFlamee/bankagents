import { useState } from "react";
import { api } from "./api";
import { Button } from "./components";
import type { RiskProfile } from "./types";

/** Answered by the customer and posted straight to the bank; the model never sees or fills it. */
export function Questionnaire({
  questions,
  initial,
  onDone,
}: {
  questions: { id: string; title: string; options: string[] }[];
  initial?: number[];
  onDone: (p: RiskProfile) => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const done = answers.filter((a) => a != null).length;
  async function submit() {
    setSaving(true);
    setError("");
    try {
      const { profile } = await api<{ profile: RiskProfile }>("/api/wealth/assessment", { answers });
      onDone(profile);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="questionnaire"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="questionnaire-progress" aria-hidden="true">
        <i style={{ width: `${(100 * done) / questions.length}%` }} />
      </div>
      <p className="small-note">
        按你的真实情况选。结果决定能买哪些风险等级的产品，有效期一年。{initial && "上次的答案不会预先勾选。"}
      </p>
      {questions.map((q, qi) => (
        <fieldset key={q.id} className={answers[qi] != null ? "is-answered" : ""}>
          <legend>
            <span>{qi + 1}</span>
            {q.title}
          </legend>
          <div className="choice-row">
            {q.options.map((o, oi) => (
              <label key={o} className={answers[qi] === oi ? "is-picked" : ""}>
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[qi] === oi}
                  onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row">
        <Button kind="primary" type="submit" loading={saving} disabled={done < questions.length}>
          {done < questions.length ? `还有 ${questions.length - done} 题` : "提交测评"}
        </Button>
      </div>
    </form>
  );
}
