"use strict";
let token;
const $ = (id) => document.getElementById(id);
async function request(path, body, method = body ? "POST" : "GET") {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token || "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "请求失败");
  return data;
}
async function refresh() {
  const data = await request("/api/admin/handoffs");
  $("staff-plans").replaceChildren();
  if (!data.plans.length)
    $("staff-plans").textContent = "当前没有等待人工处理的任务。";
  for (const item of data.plans) {
    const section = document.createElement("section");
    section.className = "panel";
    const title = document.createElement("h2");
    title.textContent = item.plan.message;
    const detail = document.createElement("p");
    detail.textContent = `客户账户：${item.user_id}`;
    const metadata = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "任务技术信息";
    const identifier = document.createElement("p");
    identifier.textContent = `任务编号：${item.plan.id}`;
    metadata.append(summary, identifier);
    const label = document.createElement("label");
    label.textContent = "人工处理说明（5–300 字）";
    const input = document.createElement("textarea");
    input.minLength = 5;
    input.maxLength = 300;
    label.append(input);
    const button = document.createElement("button");
    button.className = "button primary";
    button.textContent = "记录说明，交还客户授权";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await request(
          `/api/admin/plans/${encodeURIComponent(item.plan.id)}/release`,
          { user_id: item.user_id, reason: input.value },
        );
        await refresh();
      } catch (e) {
        $("staff-error").textContent = e.message;
      } finally {
        button.disabled = false;
      }
    });
    section.append(title, detail, label, button, metadata);
    $("staff-plans").append(section);
  }
}
$("operator-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("staff-error").textContent = "";
  try {
    const data = await request("/api/session", {
      username: $("staff-user").value,
      password: $("staff-password").value,
    });
    if (data.role !== "operator") throw new Error("请使用操作员账户。");
    token = data.csrf_token;
    $("operator-login").classList.add("hidden");
    $("staff-actions").classList.remove("hidden");
    await refresh();
  } catch (error) {
    $("staff-error").textContent = error.message;
  }
});
$("staff-refresh").addEventListener("click", () =>
  refresh().catch((e) => ($("staff-error").textContent = e.message)),
);
$("staff-logout").addEventListener("click", async () => {
  await request("/api/session", null, "DELETE");
  location.reload();
});
