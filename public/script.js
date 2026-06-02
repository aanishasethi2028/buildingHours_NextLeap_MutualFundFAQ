const chatDisplay = document.getElementById('chat-display');
const queryInput = document.getElementById('query-input');
const inputForm = document.getElementById('input-form');
const pipelineIndicator = document.getElementById('pipeline-indicator');
const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('status-text');

// Pipeline Step IDs
const steps = [
  { id: 'step-pii', label: 'PII Shield' },
  { id: 'step-intent', label: 'Intent Classifier' },
  { id: 'step-db', label: 'Vector Search' },
  { id: 'step-llm', label: 'LLM API' },
  { id: 'step-compliance', label: 'Compliance Guard' }
];

// Chat History State
let chatHistory = [];
let currentSessionHasHistoryEntry = false;

function updateHistoryUI() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  
  historyList.innerHTML = '';
  chatHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'scheme-item'; // Reuse same styles as scheme-item
    div.textContent = item.header;
    div.title = item.fullQuery; // Show full query on hover
    div.onclick = () => {
      queryInput.value = item.fullQuery;
      queryInput.focus();
    };
    historyList.appendChild(div);
  });
}

function setSystemStatus(status, text) {
  statusText.textContent = text;
  if (status === 'loading') {
    statusDot.className = 'status-dot loading';
  } else {
    statusDot.className = 'status-dot';
  }
}

// Side-bar helper to prefill query
window.populateQuery = function(schemeName) {
  queryInput.value = `What is the exit load of ${schemeName}?`;
  queryInput.focus();
};

// Sidebar visibility toggle
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('collapsed');
};

// Theme toggle
window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-icon-sun').style.display = isLight ? 'none' : 'block';
  document.getElementById('theme-icon-moon').style.display = isLight ? 'block' : 'none';
};

// Initialize theme on load
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-theme');
  document.getElementById('theme-icon-sun').style.display = 'none';
  document.getElementById('theme-icon-moon').style.display = 'block';
}

// Example card triggers
window.runExample = function(queryText) {
  queryInput.value = queryText;
  inputForm.dispatchEvent(new Event('submit'));
};

// Pill triggers for topic explanation
window.explainTopic = function(topic) {
  const explanation = `You can ask me factual questions about **${topic}**. \n\nPlease make sure to include the name of one of our supported schemes in your query so I know which fund you are referring to.\n\n*Example: "What is the ${topic.toLowerCase()} of Axis Small Cap Fund?"*`;
  appendMessage('bot', explanation, null, 'System Guide');
};

// Start a new chat session
window.startNewChat = function() {
  const bubbles = document.querySelectorAll('.chat-bubble');
  bubbles.forEach(b => b.remove());
  
  const welcomeCard = document.getElementById('welcome-card');
  if (welcomeCard) {
    welcomeCard.style.display = 'block';
  }
  
  queryInput.value = '';
  queryInput.focus();
  currentSessionHasHistoryEntry = false;
};

// Append a message bubble to the chat
function appendMessage(sender, text, citation = null, footer = null, isRefusal = false) {
  // Hide welcome card if present
  const welcomeCard = document.getElementById('welcome-card');
  if (welcomeCard) {
    welcomeCard.style.display = 'none';
  }

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  if (sender === 'bot' && isRefusal) {
    bubble.classList.add('refusal');
  }

  // Mini markdown renderer
  function renderMarkdown(raw) {
    // 1. Markdown links → <a>
    let html = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" class="citation-link">$1</a>');

    // 2. Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 3. Split into lines and detect list items
    const lines = html.split(/\n/);
    let result = '';
    let inOl = false;
    let inUl = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);   // numbered list
      const ulMatch = trimmed.match(/^[-*]\s+(.+)/);       // bullet list

      if (olMatch) {
        if (!inOl) { if (inUl) { result += '</ul>'; inUl = false; } result += '<ol>'; inOl = true; }
        result += `<li>${olMatch[2]}</li>`;
      } else if (ulMatch) {
        if (!inUl) { if (inOl) { result += '</ol>'; inOl = false; } result += '<ul>'; inUl = true; }
        result += `<li>${ulMatch[1]}</li>`;
      } else {
        if (inOl) { result += '</ol>'; inOl = false; }
        if (inUl) { result += '</ul>'; inUl = false; }
        if (trimmed) result += `<p>${trimmed}</p>`;
      }
    });

    if (inOl) result += '</ol>';
    if (inUl) result += '</ul>';
    return result;
  }

  bubble.innerHTML = renderMarkdown(text);

  // Action bar
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'bubble-actions';

  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'bubble-action-btn';
  copyBtn.title = 'Copy text';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      const origHtml = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => copyBtn.innerHTML = origHtml, 2000);
    });
  };
  actionsDiv.appendChild(copyBtn);

  if (sender === 'user') {
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'bubble-action-btn';
    editBtn.title = 'Edit query';
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    editBtn.onclick = () => {
      queryInput.value = text;
      queryInput.focus();
    };
    actionsDiv.appendChild(editBtn);
  }

  

  if (sender === 'bot') {
    if (citation) {
      const citationDiv = document.createElement('div');
      citationDiv.className = 'bot-citation';
      citationDiv.innerHTML = `📄 Source: <a href="${citation}" target="_blank" class="citation-link">Official Factsheet ↗</a>`;
      bubble.appendChild(citationDiv);
    }
    
    if (footer) {
      const footerDiv = document.createElement('div');
      footerDiv.className = 'bot-footer';
      footerDiv.innerText = footer;
      bubble.appendChild(footerDiv);
    }
  }

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${sender}`;
  wrapper.appendChild(bubble);
  wrapper.appendChild(actionsDiv);

  chatDisplay.appendChild(wrapper);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// Animate the pipeline indicator steps to show compliance in action
async function animatePipeline() {
  pipelineIndicator.style.display = 'block';
  
  // Reset all badges
  steps.forEach(step => {
    const badge = document.getElementById(step.id);
    badge.className = 'step-badge';
  });

  // Step 1: PII Shield
  const pii = document.getElementById('step-pii');
  pii.className = 'step-badge active';
  await sleep(400);
  pii.className = 'step-badge done';

  // Step 2: Intent Classifier
  const intent = document.getElementById('step-intent');
  intent.className = 'step-badge active';
  await sleep(450);
  intent.className = 'step-badge done';

  // Step 3: Vector Search
  const db = document.getElementById('step-db');
  db.className = 'step-badge active';
  await sleep(400);
  db.className = 'step-badge done';

  // Step 4: LLM API
  const llm = document.getElementById('step-llm');
  llm.className = 'step-badge active';
}

async function finalizePipelineSuccess() {
  const llm = document.getElementById('step-llm');
  llm.className = 'step-badge done';

  // Step 5: Compliance Guard
  const comp = document.getElementById('step-compliance');
  comp.className = 'step-badge active';
  await sleep(350);
  comp.className = 'step-badge done';
  await sleep(200);

  pipelineIndicator.style.display = 'none';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Submit handler
window.handleQuerySubmit = async function(event) {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  // Append user message
  appendMessage('user', query);
  queryInput.value = '';

  // Update History (only for the first query in a new session)
  if (!currentSessionHasHistoryEntry) {
    const summary = query.length > 28 ? query.substring(0, 28) + '...' : query;
    chatHistory.unshift({ header: summary, fullQuery: query });
    if (chatHistory.length > 5) chatHistory.pop();
    updateHistoryUI();
    currentSessionHasHistoryEntry = true;
  }

  setSystemStatus('loading', 'Processing Query...');
  
  // Start pipeline visual progress
  const pipelinePromise = animatePipeline();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query })
    });

    if (!res.ok) {
      throw new Error(`API responded with status code ${res.status}`);
    }

    const data = await res.json();
    
    // Wait for the pipeline transition to finish
    await pipelinePromise;
    await finalizePipelineSuccess();

    const isRefusal = data.is_refusal;
    const footerText = data.last_updated ? `Last updated from sources: ${data.last_updated}` : null;
    appendMessage('bot', data.answer, data.citation_url, footerText, isRefusal);
    setSystemStatus('ready', 'System Ready');

  } catch (e) {
    console.error('Error submitting query:', e);
    pipelineIndicator.style.display = 'none';
    appendMessage('bot', 'I encountered a communication error while verifying the details. Please check your network connection and try again.', null, null, true);
    setSystemStatus('ready', 'Ready (Errors Occurred)');
  }
};
