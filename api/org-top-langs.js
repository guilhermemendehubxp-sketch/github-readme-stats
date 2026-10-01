// @ts-check

import { renderTopLanguages } from "../src/cards/top-languages.js";

const GITHUB_API = "https://api.github.com";

async function githubRequest(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.PAT_1}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function getRepositories(org) {
  const repositories = [];

  let page = 1;

  while (true) {
    const data = await githubRequest(
      `${GITHUB_API}/orgs/${org}/repos?per_page=100&page=${page}&type=all`,
    );

    if (!data.length) {
      break;
    }

    repositories.push(...data);

    if (data.length < 100) {
      break;
    }

    page++;
  }

  return repositories;
}

async function getLanguages(owner, repo) {
  return githubRequest(
    `${GITHUB_API}/repos/${owner}/${repo}/languages`,
  );
}

export default async (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");

  try {
    if (!process.env.PAT_1) {
      throw new Error("PAT_1 is not configured");
    }

    const organizations = (process.env.GITHUB_ORGS || "")
      .split(",")
      .map((org) => org.trim())
      .filter(Boolean);

    if (!organizations.length) {
      throw new Error("GITHUB_ORGS is not configured");
    }

    const languageStats = {};

    for (const organization of organizations) {
      const repositories = await getRepositories(organization);

      for (const repository of repositories) {
        if (repository.fork || repository.archived) {
          continue;
        }

        const languages = await getLanguages(
          organization,
          repository.name,
        );

        for (const [language, bytes] of Object.entries(languages)) {
          if (!languageStats[language]) {
            languageStats[language] = {
              name: language,
              size: 0,
              count: 0,
            };
          }

          languageStats[language].size += bytes;
          languageStats[language].count++;
        }
      }
    }

    const topLanguages = Object.values(languageStats)
      .sort((a, b) => b.size - a.size)
      .reduce((result, language) => {
        result[language.name] = language;
        return result;
      }, {});

    return res.send(
      renderTopLanguages(topLanguages, {
        custom_title: req.query.custom_title || "Professional Languages",
        hide_title: req.query.hide_title === "true",
        hide_border: req.query.hide_border === "true",
        card_width: parseInt(req.query.card_width, 10),
        theme: req.query.theme || "buefy",
        layout: req.query.layout || "compact",
        langs_count: req.query.langs_count || "6",
      }),
    );
  } catch (error) {
    console.error(error);

    return res.status(500).send(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="500"
        height="120"
      >
        <rect
          width="500"
          height="120"
          rx="10"
          fill="#ffffff"
        />

        <text
          x="25"
          y="50"
          font-family="Arial"
          font-size="16"
          fill="#555555"
        >
          Error loading professional languages
        </text>

        <text
          x="25"
          y="80"
          font-family="Arial"
          font-size="13"
          fill="#888888"
        >
          Check Vercel logs for details.
        </text>
      </svg>
    `);
  }
};
