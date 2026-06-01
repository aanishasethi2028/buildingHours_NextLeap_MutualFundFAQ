import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { startScheduler } from './scheduler.js';
import { sanitizePII, resolveSchemeEntity, classifyIntent } from './guardrails.js';
import { processFactualQuery } from './llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and body parsing
app.use(cors());
app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Ingestion Scheduler on startup
const scheduler = startScheduler();

// Main Chat/Query Endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Valid message parameter is required.' });
  }

  try {
    // 1. Guardrail - PII Sanitization
    const sanitizedQuery = sanitizePII(message);
    console.log(`[Query Received] Original: "${message}" | Sanitized: "${sanitizedQuery}"`);

    // 2. Guardrail - Entity Resolution
    const resolvedEntity = resolveSchemeEntity(sanitizedQuery);
    console.log(`[Entity Match] Resolved: ${resolvedEntity.resolvedName} (Score: ${resolvedEntity.score})`);

    // 3. Guardrail - Intent Classification
    const intent = await classifyIntent(sanitizedQuery, resolvedEntity.resolvedName);
    console.log(`[Intent Classification] Routed to: ${intent}`);

    // 4. Intent Execution & Response Routing
    if (intent === 'ADVISORY') {
      return res.json({
        answer: "I am a facts-only mutual fund assistant and cannot provide investment recommendations, advice, or buy/sell suggestions. For official investor education, please refer to the [SEBI Investor Association Guide](https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doSubInvestortab=yes).",
        citation_url: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doSubInvestortab=yes",
        last_updated: "2026-05-29",
        is_refusal: true,
        disclaimer: "Facts-only. No investment advice."
      });
    }

    if (intent === 'OUT_OF_DOMAIN') {
      return res.json({
        answer: "I am designed to answer factual, source-backed questions about the 13 supported mutual fund schemes only. For general educational information on mutual funds, please visit the [AMFI India Investor Corner](https://www.amfiindia.com/investor-corner).",
        citation_url: "https://www.amfiindia.com/investor-corner",
        last_updated: "2026-05-29",
        is_refusal: true,
        disclaimer: "Facts-only. No investment advice."
      });
    }

    if (intent === 'PERFORMANCE') {
      if (resolvedEntity.resolvedName) {
        const db = await import('./vector_db.js');
        const vecDb = new db.VectorDB();
        // Look up the factsheet source URL
        const matches = vecDb.search('', { scheme_name: resolvedEntity.resolvedName }, 1);
        const sourceUrl = matches.length > 0 ? matches[0].metadata.source_url : 'https://www.amfiindia.com';
        const lastUpdated = matches.length > 0 ? matches[0].metadata.last_updated : '2026-05-29';

        return res.json({
          answer: `I cannot provide return rate calculations, projections, or performance comparisons. To view historical returns and official statistics for ${resolvedEntity.resolvedName}, please refer directly to the [official factsheet](${sourceUrl}).`,
          citation_url: sourceUrl,
          last_updated: lastUpdated,
          is_refusal: true,
          disclaimer: "Facts-only. No investment advice."
        });
      } else {
        return res.json({
          answer: "I cannot provide return rates, projections, or performance comparisons. For official educational resources, please visit the [AMFI India Investor Corner](https://www.amfiindia.com/investor-corner).",
          citation_url: "https://www.amfiindia.com/investor-corner",
          last_updated: "2026-05-29",
          is_refusal: true,
          disclaimer: "Facts-only. No investment advice."
        });
      }
    }

    // Intent is FACTUAL
    if (!resolvedEntity.resolvedName) {
      return res.json({
        answer: "Please specify one of the 13 supported mutual fund schemes (e.g. Axis Small Cap Fund Direct Growth) in your query so I can retrieve factual details.",
        citation_url: null,
        last_updated: "2026-05-29",
        is_refusal: true,
        disclaimer: "Facts-only. No investment advice."
      });
    }

    // Execute Retrieval and LLM pipeline
    const result = await processFactualQuery(sanitizedQuery, resolvedEntity.resolvedName);
    
    return res.json({
      answer: result.answer,
      citation_url: result.citation_url,
      last_updated: result.last_updated,
      is_refusal: !result.success,
      disclaimer: "Facts-only. No investment advice."
    });

  } catch (error) {
    console.error('Error handling chat API request:', error);
    res.status(500).json({ error: 'Internal server error while processing query.' });
  }
});

// Endpoint to trigger manual data ingestion (primarily for QA/testing)
app.post('/api/ingest', (req, res) => {
  try {
    const totalIndexed = scheduler.triggerNow();
    res.json({ message: 'Manual ingestion triggered successfully.', totalIndexed });
  } catch (e) {
    console.error('Manual ingestion failed:', e);
    res.status(500).json({ error: 'Manual ingestion failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on http://localhost:${PORT}`);
});
