import fs from "fs/promises";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USER || process.env.GITHUB_ACTOR;

if (!token) {
  console.error("ERRO: defina o secret PAT_1 (exportado para GITHUB_TOKEN no workflow).");
  process.exit(1);
}

const headers = {
  "User-Agent": "readme-stats-generator",
  Authorization: `token ${token}`,
  Accept: "application/vnd.github.v3+json",
};

async function fetchAllRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const res = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`Falha ao buscar repositórios: ${res.status} ${await res.text()}`);
    const data = await res.json();
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return repos.filter(r => r.owner && (r.owner.login === username || r.owner.login === process.env.GITHUB_ACTOR));
}

async function fetchLanguages(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) return {};
  return res.json();
}

function svgHeader(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
}

function svgFooter() {
  return `</svg>`;
}

function renderTopLangsSvg(topLangs) {
  const width = 600;
  const height = 160;
  const padding = 20;
  const barHeight = 18;
  const maxBarWidth = width - padding * 2 - 120;

  const maxBytes = topLangs.length ? topLangs[0].bytes : 1;
  let y = padding;

  let body = `<rect width="100%" height="100%" fill="#0b0f14" rx="8" />`;
  body += `<g font-family="Segoe UI, Arial" font-size="12" fill="#c9d1d9">`;
  body += `<text x="${padding}" y="${y+12}" font-weight="700" font-size="14">Top Languages</text>`;
  y += 28;

  for (const lang of topLangs) {
    const barW = Math.round((lang.bytes / maxBytes) * maxBarWidth);
    body += `<text x="${padding}" y="${y+12}">${lang.name}</text>`;
    body += `<rect x="${padding+120}" y="${y-6}" width="${barW}" height="${barHeight}" rx="3" fill="#39d353"/>`;
    body += `<text x="${padding+120+barW+8}" y="${y+12}" fill="#c9d1d9">${(lang.bytes).toLocaleString()}</text>`;
    y += barHeight + 12;
  }
  body += `</g>`;
  return svgHeader(width, height) + body + svgFooter();
}

function renderStatsSvg(stats) {
  const width = 600;
  const height = 140;
  const padding = 20;
  let body = `<rect width="100%" height="100%" fill="#0b0f14" rx="8" />`;
  body += `<g font-family="Segoe UI, Arial" font-size="12" fill="#c9d1d9">`;
  body += `<text x="${padding}" y="${padding+12}" font-weight="700" font-size="14">GitHub Summary</text>`;
  body += `<text x="${padding}" y="${padding+40}">Total repos: ${stats.total_repos}</text>`;
  body += `<text x="${padding+200}" y="${padding+40}">Private: ${stats.private_repos}</text>`;
  body += `<text x="${padding}" y="${padding+68}">Public: ${stats.public_repos}</text>`;
  body += `<text x="${padding+200}" y="${padding+68}">Total Stars: ${stats.stars}</text>`;
  body += `<text x="${padding}" y="${padding+96}">Total Forks: ${stats.forks}</text>`;
  body += `<text x="${padding+200}" y="${padding+96}">Total Watchers: ${stats.watchers}</text>`;
  body += `</g>`;
  return svgHeader(width, height) + body + svgFooter();
}

async function main() {
  console.log("Buscando repositórios...");
  const repos = await fetchAllRepos();
  console.log(`Repositórios encontrados: ${repos.length}`);

  const stats = {
    total_repos: repos.length,
    private_repos: repos.filter(r => r.private).length,
    public_repos: repos.filter(r => !r.private).length,
    stars: repos.reduce((s, r) => s + (r.stargazers_count || 0), 0),
    forks: repos.reduce((s, r) => s + (r.forks_count || 0), 0),
    watchers: repos.reduce((s, r) => s + (r.watchers_count || 0), 0),
  };

  const langTotals = {};
  for (const repo of repos) {
    try {
      const langs = await fetchLanguages(repo.languages_url);
      for (const [lang, bytes] of Object.entries(langs)) {
        langTotals[lang] = (langTotals[lang] || 0) + bytes;
      }
    } catch (err) {
      console.warn(`Erro ao buscar linguagens para ${repo.full_name}: ${err.message}`);
    }
  }

  const topLangs = Object.entries(langTotals)
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile("dist/top-langs.svg", renderTopLangsSvg(topLangs), "utf8");
  await fs.writeFile("dist/stats.svg", renderStatsSvg(stats), "utf8");

  console.log("SVGs gerados em dist/");
}

main().catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
