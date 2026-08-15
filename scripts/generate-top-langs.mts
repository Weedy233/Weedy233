#!/usr/bin/env tsx
/**
 * Aggregates language bytes for the authenticated user's OWN repositories (no
 * forks) by default, then renders a top-languages SVG using the
 * github-readme-stats card renderer.
 *
 * Environment variables adjust scope:
 *   EXCLUDE_REPOS      comma-separated "owner/repo" to exclude
 *   INCLUDE_ORG_REPOS  comma-separated "org/repo" to additionally include
 *                      (e.g. private org repos the user contributes to)
 *
 * Logs never contain repository names (privacy).
 *
 * Usage: node generate-top-langs.ts <token> <username> <output.svg>
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , TOKEN, USERNAME, OUT] = process.argv;
if (!TOKEN || !USERNAME || !OUT) {
  console.error("usage: node generate-top-langs.ts <token> <username> <out.svg>");
  process.exit(1);
}

const parseCsv = (v: string | undefined): string[] =>
  (v || "").split(",").map((s) => s.trim()).filter(Boolean);

const EXCLUDE = new Set(parseCsv(process.env.EXCLUDE_REPOS));
const INCLUDE_ORG = parseCsv(process.env.INCLUDE_ORG_REPOS);

const AUTH = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github+json",
};

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: AUTH });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface Repo {
  full_name: string;
  fork: boolean;
}

type LangBytes = Record<string, number>;

const COLORS: Record<string, string> = {
  Python: "#3572A5", Go: "#00ADD8", Vue: "#41B883", TypeScript: "#3178C6",
  JavaScript: "#f1e05a", HTML: "#e34c26", C: "#555555", "C++": "#f34b7d",
  Java: "#b07219", Ruby: "#701516", Rust: "#dea584", PHP: "#4F5D95",
  Shell: "#89e051", CSS: "#663399", Dockerfile: "#384d54", PLpgSQL: "#336791",
  "Jupyter Notebook": "#DA5B0B", Kotlin: "#A97BFF", Swift: "#F05138",
  Dart: "#00B4AB", "C#": "#178600", "Objective-C": "#438eff", SCSS: "#c6538c",
  Sass: "#c6538c", Makefile: "#427819", Lua: "#000080", R: "#198CE7",
  Zig: "#ec915c", Elixir: "#6e4a7e", Haskell: "#5e5086", QML: "#44a51c",
  Svelte: "#ff3e00", Assembly: "#6E4C13", Processing: "#0096D8",
  "Vim Script": "#199f4b", PowerShell: "#012456",
};
const FALLBACK = "#8b949e";

// 1) personal repos only (no forks); excludes are filtered out later
const repos = await ghJson<Repo[]>(
  "https://api.github.com/user/repos?per_page=100&affiliation=owner",
);
const names = repos.filter((r) => !r.fork).map((r) => r.full_name);
if (names.length === 0) throw new Error("no visible repositories");

// 2) languages per repo
const agg = new Map<string, number>();
let skipExcluded = 0, skipErrors = 0, skipDup = 0;

const bump = (obj: LangBytes) => {
  for (const [lang, size] of Object.entries(obj)) {
    agg.set(lang, (agg.get(lang) || 0) + size);
  }
};

for (const full of names) {
  if (EXCLUDE.has(full)) {
    skipExcluded += 1;
    continue;
  }
  try {
    bump(await ghJson<LangBytes>(`https://api.github.com/repos/${full}/languages`));
  } catch {
    skipErrors += 1;
  }
}

// 3) explicitly included org repos (e.g. private org repos), unless excluded
for (const full of INCLUDE_ORG) {
  if (EXCLUDE.has(full)) {
    skipExcluded += 1;
    continue;
  }
  if (names.includes(full)) {
    skipDup += 1;
    continue;
  }
  try {
    bump(await ghJson<LangBytes>(`https://api.github.com/repos/${full}/languages`));
  } catch {
    skipErrors += 1;
  }
}

if (agg.size === 0) throw new Error("no language data aggregated");

// 4) render with the github-readme-stats card renderer
const corePkg = path.resolve(
  "node_modules", "@stats-organization", "github-readme-stats-core",
  "build", "cards", "top-languages.js",
);
const { renderTopLanguages } = (await import(pathToFileURL(corePkg).href)) as {
  renderTopLanguages: (
    langs: Record<string, { name: string; color: string; size: number }>,
    options?: Record<string, unknown>,
  ) => string;
};

const langs: Record<string, { name: string; color: string; size: number }> = {};
for (const [name, size] of [...agg.entries()].sort((a, b) => b[1] - a[1])) {
  langs[name] = { name, color: COLORS[name] || FALLBACK, size };
}

const svg = renderTopLanguages(langs, {
  layout: "compact",
  langs_count: 8,
  hide_border: true,
  custom_title: "Most Used Languages",
});

await writeFile(OUT, svg, "utf8");
const counts = [...agg.values()].reduce((a, b) => a + b, 0);
console.log(
  `wrote ${OUT} (${Object.keys(langs).length} languages, ${counts} bytes, ` +
    `${skipExcluded} excluded, ${skipDup} dup, ${skipErrors} errors, ` +
    `${INCLUDE_ORG.length} included org repos)`,
);
