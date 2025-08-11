import { stripPathFromUrl } from './utils.js';

const REFRESH_INTERVAL = 5 * 60 * 1000;

const config = {
  async get(storageKey) {
    return new Promise(resolve => {
      chrome.storage.local.get([storageKey], (result) => {
        resolve(result[storageKey] || '');
      });
    });
  },

  async getDemoMode() {
    return this.get('demoMode');
  },

  async getStoredToken(type) {
    return this.get(`${type}Token`);
  },
}

class MissingConfiguration extends Error {
  constructor(...params) {
    super(...params);
    this.name = "MissingConfiguration";
  }
}

class ReauthRequested extends Error {
  constructor(location, ...params) {
    super(...params);
    this.name = "ReauthRequested";
    this.location = location;
  }
}

function generateLoremWords(wordCount = 5) {
    const loremWords = [
        "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
        "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
        "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation",
        "ullamco", "laboris", "nisi", "ut", "aliquip", "ex", "ea", "commodo", "consequat"
    ];

    let result = '';
    for (let i = 0; i < wordCount; i++) {
        const randomIndex = Math.floor(Math.random() * loremWords.length);
        result += loremWords[randomIndex] + ' ';
    }
    return result.trim(); // Return a space-separated string of lorem-like words
}

function generateJiraKey() {
    const randomNumber = Math.floor(Math.random() * 900) + 100;  // Random number between 100 and 999
    return `PROJ-${randomNumber}`;
}

function requestGoogleToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "getToken" }, (response) => {
      if (response?.token) resolve(response.token);
      else reject(response?.error || "Unknown error");
    });
  });
}

async function fetchGoogleEvents() {
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(now.setHours(23, 59, 59, 999)).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
              `?timeMin=${startOfDay}&timeMax=${endOfDay}` +
              `&maxResults=20&singleEvents=true&orderBy=startTime`;
  const token = await requestGoogleToken();

  const response = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });
  const data = await response.json();

  return data.items || [];
}

async function fetchGoogleTasks() {
  const token = await requestGoogleToken();
  const taskListsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });
  const taskLists = await taskListsRes.json();

  const allTasks = [];

  for (const list of taskLists.items || []) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`;
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    const data = await res.json();
    const tasks = data.items || [];
    allTasks.push(...tasks.map(t => ({ ...t, listTitle: list.title })));
  }

  return allTasks;
}

function renderItems(container, items) {
  container.innerHTML = "";
  if (items.length === 0) {
    container.textContent = "No items to show.";
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    const timeStart = item.timeStart;
    const timeEnd = item.timeEnd;
    if (timeStart && timeEnd) {
      const now = Date.now();
      if (Date.parse(timeStart) <= now && now <= Date.parse(timeEnd))
        div.className += " event-now";
      if (Date.parse(timeEnd) <= now)
        div.className += " event-elapsed";
    }

    const div_a = document.createElement("a");
    div.appendChild(div_a);

    div_a.textContent = item.text
    div_a.href = item.webLink;
    div_a.target = "_blank";

    fragment.appendChild(div);
  });

  container.appendChild(fragment);
}

async function renderGoogleTasks(container, tasks) {
  const demoMode = await config.getDemoMode();
  const items = tasks.map(task => ({
    text: !demoMode ? `${task.listTitle} - ${task.title}` : generateLoremWords(),
    webLink: task.webViewLink
  }));
  renderItems(container, items);
}

function getEventResponse(event, myEmail) {
  if (!myEmail)
    return "unknown";

  const attendees = event.attendees || [];

  for (const attendee of attendees) {
    if (attendee.email == myEmail)
      return attendee.responseStatus;
  }

  return "unknown";
}

async function renderGoogleEvents(container, events) {
  const demoMode = await config.getDemoMode();
  const myEmail = await config.get('emailAddress');
  const items = [ ];
  events.forEach(event => {
    if (event.eventType && event.eventType == "workingLocation")
      return;

    if (getEventResponse(event, myEmail) == 'declined')
      return;

    const timeStart = event.start.dateTime || event.start.date;
    const timeEnd = event.end.dateTime || event.end.date;
    const summary = !demoMode ? (event.summary || "(No Title)") : generateLoremWords();

    items.push({
      text: `${formatDateTime(timeStart)} - ${summary}`,
      webLink: event.htmlLink,
      timeStart: timeStart,
      timeEnd: timeEnd,
    });
  });
  renderItems(container, items);
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function fetchGitHubItems(search) {
  const token = await config.getStoredToken('github');
  if (!token)
    throw new MissingConfiguration("Configure a GitHub token");

  const queryString = 'q=' + encodeURIComponent(search);
  const url = `https://api.github.com/search/issues?${queryString}`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response) {
    console.error("Failed to fetch issues:", response.status);
    return;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }

  return data.items;
}

function parseGitHubIssueUrl(url) {
  // eslint-disable-next-line no-useless-escape
  const regex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/;
  const match = url.match(regex);

  if (match) {
    const [_unused, owner, repo, _unused2, issueNumber] = match;
    return { owner, repo, issueNumber };
  } else {
    throw new Error('Invalid GitHub issue URL: ', url);
  }
}

async function renderGitHubItems(container, issues) {
  const demoMode = await config.getDemoMode();

  const items = issues.map(issue => {
    const { owner, repo, issueNumber } = parseGitHubIssueUrl(issue.html_url);
    if (demoMode) {
      return {
        text: `my-org/my-repo#${issueNumber} - ${generateLoremWords()}`,
        webLink: issue.html_url,
      };
    }

    return {
      text: `${owner}/${repo}#${issueNumber} - ${issue.title}`,
      webLink: issue.html_url,
    };
  });
  renderItems(container, items);
}

async function withOrg(query) {
  const org = await config.get('githubOrg');
  const orgQuery = org ? `org:${org} ` : '';

  return `${orgQuery}${query}`
}


function parseConfluenceTaskReport(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const rows = [...doc.querySelectorAll('table.tasks-report tbody tr')];

  const tasks = rows.map(row => {
    const descriptionEl = row.querySelector('td:nth-child(1)');
    const dueDateEl = row.querySelector('td:nth-child(2)');
    const locationEl = row.querySelector('td:nth-child(4) a');

    return {
      text: descriptionEl?.textContent.trim() || '',
      relWebLink: locationEl?.getAttribute('href') || '',
      dueDate: dueDateEl?.textContent.trim() || '',
    };
  });

  return tasks;
}

async function fetchConfluenceTasks() {
  const baseUrl = await config.get('confluenceBaseUrl');
  if (!baseUrl)
    throw new MissingConfiguration('Configure the Confluence Base URL.');
  /* TODO: Un-hard-code */
  const url = `${baseUrl}/rest/api/content/32712570?expand=body.view`;
  const token = await config.getStoredToken('confluence');
  if (!token)
    throw new MissingConfiguration('Configure the Confluence token.');
  const responseOrReauth = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    mode: 'no-cors',
  });
  const response = handleReauth(url, responseOrReauth);

  const data = await response.json();

  const html = data.body?.view?.value || '';

  return parseConfluenceTaskReport(html).map(t => ({
    ...t,
    webLink: `${baseUrl}${t.relWebLink}`
  }));
}

async function renderConfluenceTasks(container, items) {
  const demoMode = await config.getDemoMode();

  if (demoMode) {
    items = items.map(i => ({
      text: generateLoremWords(),
      webLink: i.webLink
    }));
  }

  renderItems(container, items);
}

/* Resolve the response or throw ReauthRequested */
function handleReauth(url, responseOrReauth) {
  const response = responseOrReauth;
  /* https://fetch.spec.whatwg.org/#concept-filtered-response-opaque-redirect */
  if (response.status === 0 || response.status === 404) {
    console.log('Reauth detected:', response);
    throw new ReauthRequested(stripPathFromUrl(url));
  }
  return response;
}

async function fetchJiraIssues() {
  const baseUrl = await config.get('jiraBaseUrl');
  if (!baseUrl)
    throw new MissingConfiguration("Configure a Jira Base URL");
  const query = "assignee = currentUser() AND resolution = Unresolved order by updated DESC";
  const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(query)}&maxResults=50`;
  const token = await config.getStoredToken('jira');
  if (!token)
    throw new MissingConfiguration("Configure a Jira token");

  const responseOrReauth = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    redirect: 'manual',
  });
  const response = handleReauth(url, responseOrReauth);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();
  return data.issues || [];
}

async function renderJiraIssues(container, issues) {
  const baseUrl = await config.get('jiraBaseUrl');
  const demoMode = await config.getDemoMode();

  if (demoMode) {
    const items = issues.map(i => ({
      text: `${generateJiraKey()} - ${generateLoremWords()}`,
      webLink: `${baseUrl}/browse/${i.key}`
    }));

    return renderItems(container, items);
  }
  const items = issues.map(i => ({
    text: `${i.key} - ${i.fields.summary}`,
    webLink: `${baseUrl}/browse/${i.key}`
  }));

  renderItems(container, items);
}

async function renderError(container, error) {
  console.error(error);
  if (error instanceof ReauthRequested) {
    container.innerHTML = "";

    const div_a = document.createElement("a");

    div_a.textContent = "Please authenticate by clicking here."
    div_a.href = error.location;
    div_a.target = "_blank";

    container.appendChild(div_a);
  }
  else {
    container.innerHTML = error;
    container.className = (error instanceof MissingConfiguration) ? "" : "error";
  }
}

const dashboardItems = [
  {
    id: 'google-events',
    label: 'Google Events',
    fetcher: fetchGoogleEvents,
    renderer: renderGoogleEvents,
  },
  {
    id: 'jira-issues',
    label: 'Jira issues',
    fetcher: fetchJiraIssues,
    renderer: renderJiraIssues,
  },
  {
    id: 'confluence-tasks',
    label: 'Confluence Tasks',
    fetcher: fetchConfluenceTasks,
    renderer: renderConfluenceTasks,
  },
  {
    id: 'google-tasks',
    label: 'Google Tasks',
    fetcher: fetchGoogleTasks,
    renderer: renderGoogleTasks,
  },
  {
    id: 'github-issues',
    label: 'GitHub Issues',
    fetcher: (async () => fetchGitHubItems(await withOrg('assignee:@me is:issue is:open'))),
    renderer: renderGitHubItems,
  },
  {
    id: 'github-prs',
    label: 'GitHub PRs',
    fetcher: (async () => fetchGitHubItems(await withOrg('assignee:@me is:pr is:open'))),
    renderer: renderGitHubItems,
  },
  {
    id: 'github-review-requests',
    label: 'GitHub Review Requests',
    fetcher: (async () => fetchGitHubItems(await withOrg('review-requested:@me is:pr is:open'))),
    renderer: renderGitHubItems,
  },
];

async function refreshDashboard() {
  dashboardItems.forEach(async d => {
    const container = document.getElementById(d.id);
    if (!container) {
      console.error(`Cannot find container with ID ${d.id}`);
      return;
    }

    try {
      const items = await d.fetcher();
      console.log(d.label, items);
      await d.renderer(container, items);
    } catch (error) {
      renderError(container, error);
    }
  });
}

let refreshTimeout;
function debounceRefreshDashboard() {
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(refreshDashboard, 300);
}

document.addEventListener("DOMContentLoaded", debounceRefreshDashboard);
setInterval(debounceRefreshDashboard, REFRESH_INTERVAL);

function wireDemoMode() {
  document.getElementById('demo-mode').addEventListener('change', refreshDashboard);
}

document.addEventListener("DOMContentLoaded", wireDemoMode);
