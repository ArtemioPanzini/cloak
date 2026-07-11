import { US_STATES } from "../constants/us-states.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderPrelander(pageToken: string): string {
  const options = US_STATES.map(
    ([code, name]) => `<option value="${code}">${name}</option>`
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Select state</title>
  <script src="/telemetry.js" defer></script>
</head>
<body>
  <form id="state-form" method="post" action="/submit">
    <input type="hidden" name="pageToken" value="${escapeHtml(pageToken)}">
    <select id="state" name="state">
      <option value="" selected>Select a state</option>
      ${options}
    </select>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;
}
