import { renderTopLanguages } from "../src/cards/top-languages.js";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const LANGUAGE_QUERY = `
  query OrganizationLanguages($org: String!) {
    organization(login: $org) {
      repositories(
        first: 100
        isFork: false
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          name
          isArchived
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
  }
`;

async function githubGraphQL(query, variables, token) {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const body = await response.json();

  if (body.errors?.length) {
    throw new Error(body.errors[0].message);
  }

  return body.data;
}

async function getOrganizationLanguages(org, token) {
  const data = await githubGraphQL(
    LANGUAGE_QUERY,
    { org },
    token,
  );

  if (!data.organization) {
    throw new Error(`Organization "${org}" not found or inaccessible`);
  }

  return data.organization.repositories.nodes;
}

function calculateLanguages(repositories) {
  const languages = {};

  for (const repository of repositories) {
    if (!repository || repository.isArchived) {
      continue;
    }

    for (const edge of repository.languages.edges) {
      const language = edge.node.name;

      if (!languages[language]) {
        languages[language] = {
          name: language,
          color: edge.node.color || "#858585",
          size: 0,
          count: 0,
        };
      }

      languages[language].size += edge.size;
      languages[language].count += 1;
    }
  }

  return Object.values(languages)
    .sort((a, b) => b.size - a.size)
    .reduce((result, language) => {
      result[language.name] = language;
      return result;
    }, {});
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "image/svg+xml");

  try {
    const token = process.env.PAT_1;

    if (!token) {
      throw new Error("PAT_1 environment variable is not configured");
    }

    /*
     * Example:
     *
     * GITHUB_ORGS=afya
     *
     * Multiple organizations:
     *
     * GITHUB_ORGS=afya,outra-org
     */
    const organizations = (process.env.GITHUB_ORGS || "")
      .split(",")
      .map((org) => org.trim())
      .filter(Boolean);

    if (organizations.length === 0) {
      throw new Error("GITHUB_ORGS environment variable is not configured");
    }

    const repositories = [];

    for (const organization of organizations) {
      const organizationRepositories =
        await getOrganizationLanguages(organization, token);

      repositories.push(...organizationRepositories);
    }

    const languages = calculateLanguages(repositories);

    const {
      theme = "buefy",
      layout = "compact",
      langs_count = "6",
      hide_border = "true",
      card_width = "320",
      custom_title = "Professional Languages",
    } = req.query;

    const svg = renderTopLanguages(languages, {
      theme,
      layout,
      langs_count: Number(langs_count),
      hide_border: hide_border === "true",
      card_width: Number(card_width),
      custom_title,
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
        height="100"
        viewBox="0 0 500 100"
      >
        <rect width="500" height="100" rx="10" fill="#ffffff"/>
        <text
          x="25"
          y="55"
          font-family="Arial, sans-serif"
          font-size="16"
          fill="#555555"
        >
          Unable to load professional languages
        </text>
      </svg>
    `);
  }
}
