const configurationItems = [
  {
    id: 'github-token',
    label: 'GitHub token',
    type: 'password',
    storageKey: 'githubToken',
  },
  {
    id: 'github-org',
    label: 'GitHub Organization',
    type: 'text',
    storageKey: 'githubOrg',
  },
  {
    id: 'confluence-base-url',
    label: 'Confluence Base URL',
    type: 'url',
    storageKey: 'confluenceBaseUrl',
  },
  {
    id: 'confluence-token',
    label: 'Confluence Token',
    type: 'password',
    storageKey: 'confluenceToken',
  },
  {
    id: 'jira-base-url',
    label: 'Jira Base URL',
    type: 'url',
    storageKey: 'jiraBaseUrl',
  },
  {
    id: 'jira-token',
    label: 'Jira Token',
    type: 'password',
    storageKey: 'jiraToken',
  },
  {
    id: 'email-address',
    label: 'Email Address',
    type: 'email',
    storageKey: 'emailAddress',
  },
  {
    id: 'demo-mode',
    label: 'Demo Mode',
    type: 'checkbox',
    storageKey: 'demoMode',
  }
];

// Function to create the configuration UI
function createConfigInput(config) {
  const container = document.createElement('div');
  const input = document.createElement('input');

  input.id = config.id;

  if (config.type === 'checkbox') {
    const label = document.createElement('label');
    label.setAttribute('for', config.id);
    label.textContent = `Enable ${config.label}`;
    container.appendChild(label);

    input.type = 'checkbox';
    input.addEventListener('change', () => saveConfig(config));
  } else {
    input.type = config.type;
    input.placeholder = `Enter your ${config.label}`;
  }

  const button = document.createElement('button');
  button.textContent = 'Save';
  button.addEventListener('click', () => saveConfig(config));

  const status = document.createElement('span');
  status.id = `${config.id}-status`;

  container.appendChild(input);
  if (config.type != 'checkbox') {
    container.appendChild(button);
  }
  container.appendChild(status);

  return container;
}

// Function to save configuration to Chrome local storage
function saveConfig(config) {
  let value;
  if (config.type === 'checkbox') {
    value = document.getElementById(config.id).checked;
  } else {
    value = document.getElementById(config.id).value;
  }
  chrome.storage.local.set({ [config.storageKey]: value }, () => {
    console.log('Saved:', config.storageKey, value);
    document.getElementById(`${config.id}-status`).textContent = `✔ saved`;
  });
}

// Function to load configuration from Chrome local storage
async function loadConfig() {
  for (const config of configurationItems) {
    const value = await new Promise(resolve => {
      chrome.storage.local.get([config.storageKey], (result) => {
        resolve(result[config.storageKey] || '');
      });
    });

    const input = document.getElementById(config.id);
    if (config.type === 'checkbox') {
      input.checked = value === true;
    } else if (config.type === 'password') {
      input.value = '';
    } else {
      input.value = value;
    }

    const status = document.getElementById(`${config.id}-status`);
    if (config.type === 'checkbox') {
      status.textContent = "";
    } else if (value) {
      status.textContent = "✔ configured";
    } else {
      status.textContent = "❌ not configured";
    }
  }
}

// Function to initialize the configuration UI
function initConfiguration() {
  const configContainer = document.getElementById('configurations');
  configContainer.innerHTML = '';

  // Dynamically generate input fields for each configuration item
  configurationItems.forEach(config => {
    configContainer.appendChild(createConfigInput(config));
  });

  // Load and prefill existing configurations
  loadConfig();
}

document.addEventListener('DOMContentLoaded', initConfiguration);
