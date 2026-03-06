import { createServer, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { ensureObsDir, readRuns, type GenerateRunAnalytics, LAST_RUN_JSON, OBS_DIRNAME } from './observability.js';
import { existsSync, readFileSync } from 'node:fs';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body, null, 2));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function buildSummary(runs: GenerateRunAnalytics[]) {
  const total = runs.length;
  const ok = runs.filter((r) => r.ok).length;
  const failed = runs.filter((r) => r.ok === false).length;
  const durations = runs.map((r) => r.durationMs).filter((v): v is number => typeof v === 'number');
  const avgDurationMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const totalTokens = runs
    .map((r) => r.ai?.totals?.total_tokens)
    .filter((v): v is number => typeof v === 'number')
    .reduce((a, b) => a + b, 0);
  return { total, ok, failed, avgDurationMs, totalTokens };
}

function pageTemplate(cwd: string): string {
  const obsPath = resolve(cwd, OBS_DIRNAME);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>hayagriva-llm — Observability Dashboard</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: #0b1020; color: #e7ecff; }
      header { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); }
      header h1 { margin: 0; font-size: 16px; font-weight: 700; }
      header p { margin: 6px 0 0; font-size: 12px; opacity: 0.8; }
      main { display: grid; grid-template-columns: 380px 1fr; gap: 14px; padding: 14px; }
      @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
      .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); overflow: hidden; }
      .card h2 { margin: 0; padding: 12px 14px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .card .content { padding: 12px 14px; }
      .kpi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .kpi .box { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .kpi .label { font-size: 11px; opacity: 0.75; }
      .kpi .value { margin-top: 4px; font-size: 16px; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 9px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: top; }
      th { text-align: left; font-size: 11px; opacity: 0.8; }
      tr { cursor: pointer; }
      tr:hover { background: rgba(255,255,255,0.03); }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12px; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid rgba(255,255,255,0.10); }
      .ok { background: rgba(40, 208, 148, 0.18); color: #b6ffdf; }
      .fail { background: rgba(255, 82, 82, 0.16); color: #ffd0d0; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.35; }
      .muted { opacity: 0.75; }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .spacer { height: 8px; }
      .btn { background: rgba(255,255,255,0.06); color: #e7ecff; border: 1px solid rgba(255,255,255,0.10); border-radius: 10px; padding: 8px 10px; cursor: pointer; }
      .btn:hover { background: rgba(255,255,255,0.09); }
    </style>
  </head>
  <body>
    <header>
      <h1>hayagriva-llm — Observability Dashboard</h1>
      <p class="muted">Data: <code>${obsPath}</code></p>
    </header>
    <main>
      <section class="card">
        <h2>Summary</h2>
        <div class="content">
          <div class="kpi" id="kpi"></div>
          <div class="spacer"></div>
          <div class="row">
            <button class="btn" id="refresh">Refresh</button>
            <button class="btn" id="openLast">Open last run JSON</button>
          </div>
        </div>
      </section>
      <section class="card">
        <h2>Runs</h2>
        <div class="content">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>When</th>
                <th>Mode</th>
                <th>Model</th>
                <th>Duration</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody id="runs"></tbody>
          </table>
        </div>
      </section>
      <section class="card" style="grid-column: 1 / -1;">
        <h2>Run details</h2>
        <div class="content">
          <div class="muted">Click a row above to inspect a run.</div>
          <div class="spacer"></div>
          <pre id="details"></pre>
        </div>
      </section>
    </main>
    <script>
      const fmt = (ms) => typeof ms === 'number' ? (ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(2) + 's') : '—';
      const byId = (id) => document.getElementById(id);
      const setKPIs = (s) => {
        const kpi = byId('kpi');
        kpi.innerHTML = '';
        const items = [
          ['Runs', s.total],
          ['OK', s.ok],
          ['Failed', s.failed],
          ['Avg duration', fmt(s.avgDurationMs)],
          ['Total tokens', s.totalTokens ?? 0],
          ['Last refresh', new Date().toLocaleTimeString()],
        ];
        for (const [label, value] of items) {
          const div = document.createElement('div');
          div.className = 'box';
          div.innerHTML = '<div class="label">' + label + '</div><div class="value">' + value + '</div>';
          kpi.appendChild(div);
        }
      };
      const setRuns = (runs) => {
        const tbody = byId('runs');
        tbody.innerHTML = '';
        for (const r of runs.slice().reverse()) {
          const tr = document.createElement('tr');
          const ok = r.ok === true;
          const status = ok ? '<span class="pill ok">OK</span>' : (r.ok === false ? '<span class="pill fail">FAIL</span>' : '<span class="pill">—</span>');
          const when = r.startedAt ? new Date(r.startedAt).toLocaleString() : '—';
          const mode = r.flags?.mode ?? '—';
          const model = r.flags?.model ?? '—';
          const dur = fmt(r.durationMs);
          const tokens = r.ai?.totals?.total_tokens ?? '—';
          tr.innerHTML = '<td>' + status + '</td><td>' + when + '</td><td><code>' + mode + '</code></td><td><code>' + model + '</code></td><td>' + dur + '</td><td>' + tokens + '</td>';
          tr.addEventListener('click', () => {
            byId('details').textContent = JSON.stringify(r, null, 2);
          });
          tbody.appendChild(tr);
        }
      };
      async function refresh() {
        const [runsRes, summaryRes] = await Promise.all([fetch('/api/runs'), fetch('/api/summary')]);
        const runs = await runsRes.json();
        const summary = await summaryRes.json();
        setKPIs(summary);
        setRuns(runs);
      }
      byId('refresh').addEventListener('click', refresh);
      byId('openLast').addEventListener('click', async () => {
        const res = await fetch('/api/last-run');
        const data = await res.json();
        byId('details').textContent = JSON.stringify(data, null, 2);
      });
      refresh();
    </script>
  </body>
</html>`;
}

export async function startDashboardServer(cwd: string, port: number): Promise<{ url: string }> {
  ensureObsDir(cwd);

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return html(res, 200, pageTemplate(cwd));
      }
      if (url.pathname === '/api/runs') {
        return json(res, 200, readRuns(cwd, 800));
      }
      if (url.pathname === '/api/summary') {
        const runs = readRuns(cwd, 800);
        return json(res, 200, buildSummary(runs));
      }
      if (url.pathname === '/api/last-run') {
        const obsDir = ensureObsDir(cwd);
        const p = resolve(obsDir, LAST_RUN_JSON);
        if (existsSync(p)) {
          try {
            return json(res, 200, JSON.parse(readFileSync(p, 'utf-8')));
          } catch {
            return json(res, 200, { error: 'Failed to parse last-run.json' });
          }
        }
        return json(res, 200, { error: 'No last run yet' });
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });

  const url = `http://127.0.0.1:${port}/`;
  return { url };
}

