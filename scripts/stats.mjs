// Genera las tarjetas de estadísticas con la marca Hans Sierra en stats/*.svg
// Uso:  GITHUB_TOKEN=... GH_USER=hanssierra124 node scripts/stats.mjs
//       node scripts/stats.mjs --sample   (datos de ejemplo, sin red)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER = process.env.GH_USER || "hanssierra124";
const TOKEN = process.env.GITHUB_TOKEN;
const SAMPLE = process.argv.includes("--sample");

const C = { navy: "#1B1B4E", cream: "#F5EFE0", sky: "#A9C0E8", coral: "#E8442C", white: "#FFFFFF", blue: "#2F4FB0", peach: "#F6C1B6", soft: "#5D628F" };
const LANG_COLORS = [C.coral, C.sky, C.blue, C.peach, C.navy, "#8FA6D6"];
const BEBAS = readFileSync(join(ROOT, "scripts/fonts/bebas.woff2")).toString("base64");
const SANS = `"Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif`;
const fmt = n => n.toLocaleString("es-ES");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- Datos ---------- */
async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchData() {
  const base = await gql(`query($u:String!){ user(login:$u){
    createdAt followers{totalCount}
    pullRequests{totalCount} issues{totalCount}
    contributionsCollection{ totalCommitContributions }
    repositoriesContributedTo(contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]){totalCount}
    repositories(ownerAffiliations:OWNER,isFork:false,first:100){ nodes{ stargazerCount
      languages(first:10,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } } } } }`, { u: USER });
  const u = base.user;

  const langs = {};
  for (const repo of u.repositories.nodes)
    for (const e of repo.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;

  // Calendario de contribuciones año por año, para la racha
  const days = [];
  const start = new Date(u.createdAt).getUTCFullYear(), now = new Date();
  for (let y = start; y <= now.getUTCFullYear(); y++) {
    const from = new Date(Date.UTC(y, 0, 1)).toISOString();
    const to = (y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59))).toISOString();
    const d = await gql(`query($u:String!,$f:DateTime!,$t:DateTime!){ user(login:$u){ contributionsCollection(from:$f,to:$t){
      contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`, { u: USER, f: from, t: to });
    for (const w of d.user.contributionsCollection.contributionCalendar.weeks) days.push(...w.contributionDays);
  }

  return {
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    commits: u.contributionsCollection.totalCommitContributions,
    prs: u.pullRequests.totalCount,
    issues: u.issues.totalCount,
    contributedTo: u.repositoriesContributedTo.totalCount,
    langs,
    ...streak(days)
  };
}

function streak(days) {
  days.sort((a, b) => a.date.localeCompare(b.date));
  let total = 0, longest = 0, run = 0;
  for (const d of days) { total += d.contributionCount; run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0, i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // hoy aún sin contribuir no rompe la racha
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  return { total, current, longest };
}

const SAMPLE_DATA = {
  stars: 128, commits: 842, prs: 64, issues: 21, contributedTo: 17,
  langs: { TypeScript: 38, Python: 27, JavaScript: 18, HTML: 10, CSS: 7 },
  total: 1204, current: 23, longest: 61
};

/* ---------- Tarjeta base: carpeta con pestaña ---------- */
function card({ w, h, title, body }) {
  const tabW = Math.round(title.length * 12.5 + 44);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<style>@font-face{font-family:"BB";src:url(data:font/woff2;base64,${BEBAS}) format("woff2")}
.d{font-family:"BB","Bebas Neue",Impact,"Arial Narrow",sans-serif}.s{font-family:${SANS}}</style>
<rect x="3" y="22" width="${w - 6}" height="${h - 25}" rx="16" fill="${C.cream}" stroke="${C.sky}" stroke-width="2"/>
<rect x="3" y="3" width="${tabW}" height="38" rx="12" fill="${C.navy}" stroke="${C.sky}" stroke-width="2"/>
<circle cx="22" cy="20" r="5" fill="${C.coral}"/>
<text x="34" y="29" class="d" font-size="25" letter-spacing="1.2" fill="${C.cream}">${esc(title)}</text>
<rect x="34" y="32" width="${Math.round(title.length * 10.6)}" height="3.5" rx="1.75" fill="${C.coral}"/>
${body}
</svg>`;
}

function statsCard(d) {
  const rows = [["Estrellas totales", d.stars], ["Commits este año", d.commits], ["Pull requests", d.prs], ["Issues", d.issues], ["Repos en los que contribuyó", d.contributedTo]];
  const body = rows.map(([k, v], i) => {
    const y = 78 + i * 28;
    return `<circle cx="30" cy="${y - 5}" r="4.5" fill="${[C.coral, C.blue, C.sky, C.coral, C.blue][i]}"/>
<text x="44" y="${y}" class="s" font-size="14.5" fill="${C.navy}">${k}</text>
<text x="436" y="${y + 1}" class="d" font-size="24" text-anchor="end" fill="${C.navy}">${fmt(v)}</text>`;
  }).join("\n");
  return card({ w: 460, h: 230, title: "ESTADÍSTICAS", body });
}

function langsCard(d) {
  const top = Object.entries(d.langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sum = top.reduce((a, [, v]) => a + v, 0) || 1;
  let x = 24; const W = 412;
  const bar = top.map(([, v], i) => { const w = Math.max(3, (v / sum) * W); const r = `<rect x="${x.toFixed(1)}" y="64" width="${w.toFixed(1)}" height="12" fill="${LANG_COLORS[i]}"/>`; x += w; return r; }).join("");
  const legend = top.map(([n, v], i) => {
    const cx = 24 + (i % 2) * 210, cy = 112 + Math.floor(i / 2) * 32;
    return `<rect x="${cx}" y="${cy - 12}" width="14" height="14" rx="4" fill="${LANG_COLORS[i]}" stroke="${C.navy}" stroke-opacity=".15"/>
<text x="${cx + 22}" y="${cy}" class="s" font-size="14.5" fill="${C.navy}">${esc(n)}</text>
<text x="${cx + 196}" y="${cy + 1}" class="d" font-size="22" text-anchor="end" fill="${C.coral}">${Math.round((v / sum) * 100)}%</text>`;
  }).join("\n");
  return card({ w: 460, h: 230, title: "LENGUAJES MÁS USADOS", body: `<clipPath id="bc"><rect x="24" y="64" width="${W}" height="12" rx="6"/></clipPath><g clip-path="url(#bc)">${bar}</g>\n${legend}` });
}

function streakCard(d) {
  const cols = [["CONTRIBUCIONES TOTALES", d.total, C.navy], ["RACHA ACTUAL", d.current, C.coral], ["RACHA MÁS LARGA", d.longest, C.navy]];
  const body = cols.map(([k, v, col], i) => {
    const cx = 160 + i * 300;
    const ring = i === 1 ? `<circle cx="${cx}" cy="104" r="42" fill="none" stroke="${C.coral}" stroke-width="6"/><circle cx="${cx}" cy="104" r="42" fill="none" stroke="${C.sky}" stroke-width="6" stroke-dasharray="40 300" transform="rotate(-90 ${cx} 104)"/>` : "";
    const sep = i ? `<line x1="${cx - 150}" y1="66" x2="${cx - 150}" y2="170" stroke="${C.sky}" stroke-width="2"/>` : "";
    return `${sep}${ring}<text x="${cx}" y="${i === 1 ? 118 : 118}" class="d" font-size="${i === 1 ? 46 : 52}" text-anchor="middle" fill="${col}">${fmt(v)}</text>
<text x="${cx}" y="178" class="d" font-size="19" letter-spacing="1" text-anchor="middle" fill="${C.soft}">${k}</text>`;
  }).join("\n");
  return card({ w: 940, h: 200, title: "RACHA DE CONTRIBUCIONES", body });
}

/* ---------- Main ---------- */
const data = SAMPLE ? SAMPLE_DATA : await fetchData();
const out = join(ROOT, "stats");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "estadisticas.svg"), statsCard(data));
writeFileSync(join(out, "lenguajes.svg"), langsCard(data));
writeFileSync(join(out, "racha.svg"), streakCard(data));
console.log(SAMPLE ? "Tarjetas de ejemplo generadas en stats/" : "Tarjetas actualizadas en stats/");
