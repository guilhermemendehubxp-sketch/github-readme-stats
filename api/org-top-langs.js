// @ts-check

import { renderTopLanguages } from "../src/cards/top-languages.js";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const QUERY = `
  query OrganizationLanguages($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(
        first: 100
        after: $cursor
        isFork: false
        orderBy: {
          field: UPDATED_AT
          direction: DESC
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }

        nodes {
          name
          isArchived

          languages(
            first: 10
            orderBy: {
              field: SIZE
              direction: DESC
            }
          ) {
            edges {
              size
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

async function githubGraphQL(org, cursor = null) {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${process.env.PAT_1}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },

    body: JSON.stringify({
      query: QUERY,
      variables: {
        org,
        cursor,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  return result.data.organization;
}

async function getOrganizationLanguages(org) {
  const languages = {};

  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const organization = await githubGraphQL(org, cursor);

    if (!organization) {
      throw new Error(
        `Organization "${org}" not found or inaccessible`,
      );
    }

    const repositories = organization.repositories;

    for (const repository of repositories.nodes) {
      if (!repository || repository.isArchived) {
        continue;
      }

      for (const language of repository.languages.edges) {
        const name = language.node.name;

        if (!languages[name]) {
          languages[name] = {
            name,
            size: 0,
            count: 0,
            color: language.node.color || getLanguageColor(name),
          };
        }

        languages[name].size += language.size;
        languages[name].count += 1;
      }
    }

    hasNextPage = repositories.pageInfo.hasNextPage;
    cursor = repositories.pageInfo.endCursor;
  }

  return languages;
}

export default async (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");

  try {
    if (!process.env.PAT_1) {
      throw new Error(
        "PAT_1 environment variable is not configured",
      );
    }

    const organizations = (process.env.GITHUB_ORGS || "")
      .split(",")
      .map((org) => org.trim())
      .filter(Boolean);

    if (!organizations.length) {
      throw new Error(
        "GITHUB_ORGS environment variable is not configured",
      );
    }

    const languages = {};

    for (const organization of organizations) {
      const organizationLanguages =
        await getOrganizationLanguages(organization);

      for (const [name, data] of Object.entries(
        organizationLanguages,
      )) {
        if (!languages[name]) {
          languages[name] = {
            name,
            size: 0,
            count: 0,
            color: language.node.color || getLanguageColor(name),
          };
        }

        languages[name].size += data.size;
        languages[name].count += data.count;
      }
    }

    const sortedLanguages = Object.values(languages)
      .sort((a, b) => b.size - a.size)
      .reduce((result, language) => {
        result[language.name] = language;
        return result;
      }, {});

    const svg = renderTopLanguages(sortedLanguages, {
      custom_title:
        req.query.custom_title ||
        "Professional Languages",

      hide_title:
        req.query.hide_title === "true",

      hide_border:
        req.query.hide_border === "true",

      card_width: req.query.card_width
        ? parseInt(req.query.card_width, 10)
        : undefined,

      theme:
        req.query.theme || "buefy",

      layout:
        req.query.layout || "compact",

      langs_count:
        req.query.langs_count || "6",
    });

    res.setHeader(
      "Cache-Control",
      "public, max-age=21600, s-maxage=21600",
    );

    return res.status(200).send(svg);
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
