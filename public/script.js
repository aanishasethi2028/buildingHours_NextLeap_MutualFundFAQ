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

// Example card triggers
window.runExample = function(queryText) {
  queryInput.value = queryText;
  inputForm.dispatchEvent(new Event('submit'));
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

  // Format link markdown inside text
  let formattedText = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" class="citation-link">$1</a>');
  bubble.innerHTML = `<p>${formattedText}</p>`;

  if (sender === 'bot') {
    if (citation && !text.includes(citation)) {
      const citationDiv = document.createElement('div');
      citationDiv.className = 'bot-citation';
      citationDiv.innerHTML = `Source: <a href="${citation}" target="_blank" class="citation-link">Official Document</a>`;
      bubble.appendChild(citationDiv);
    }
    
    if (footer) {
      const footerDiv = document.createElement('div');
      footerDiv.className = 'bot-footer';
      footerDiv.innerText = footer;
      bubble.appendChild(footerDiv);
    }
  }

  chatDisplay.appendChild(bubble);
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
