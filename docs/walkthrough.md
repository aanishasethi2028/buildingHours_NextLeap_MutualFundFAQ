# Walkthrough: Mutual Fund FAQ Assistant Implementation

This document details the completed codebase, components, and verification tests for the compliance-first, facts-only Mutual Fund FAQ Assistant RAG system.

---

## 1. Codebase Overview

I have created a clean, modular Node.js ES Modules application in the workspace root directory:

*   **Corpus Definition**:
    *   [schemes_data.json](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/data/corpus/schemes_data.json): Structured JSON file containing detailed compliance-safe metrics (expense ratios, exit loads, manager names, tenure, and AUM) for the 13 supported mutual fund schemes.
*   **Backend Server**:
    *   [server.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/server.js): Express backend server that maps chat requests, triggers PII/intent filters, executes the retrieval/LLM pipeline, and handles daily scheduling.
*   **Vector Engine**:
    *   [vector_db.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/vector_db.js): Custom in-memory term-frequency cosine database that supports hybrid retrieval (BM25 keyword overlap + dense cosine similarity) merged via **Reciprocal Rank Fusion (RRF)**.
*   **Ingestion Pipeline & Scheduler**:
    *   [ingestion.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/ingestion.js): Ingestion engine that parses scheme data and populates VectorDB.
    *   [scheduler.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/scheduler.js): Periodic cron scheduling tool executing database ingestion daily.
*   **Guardrail Filters**:
    *   [guardrails.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/guardrails.js): Regex PII redactor (filters PAN, Aadhaar, accounts, phone numbers), Levenshtein-based fuzzy match Entity Resolver (maps colloquial queries to supported schemes), and an Intent Classifier.
*   **LLM Pipeline & Compliance Guard**:
    *   [llm.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/src/llm.js): Groq LLM API caller that enforces system prompting, validates outputs (exceeding 3 sentences or containing invalid citation counts triggers fallback), and formats date footers.
*   **Frontend UI Console**:
    *   [index.html](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/public/index.html): Dark-mode user interface layout with a sticky disclaimer banner and preset query buttons.
    *   [style.css](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/public/style.css): Slate-themed CSS styling with transitions and hover lift effects.
    *   [script.js](file:///c:/AS/PM/Projects/Mutual%20Fund-FAQ/public/script.js): Handles API requests and animates step-by-step progress through the pipeline stages (PII Shield → Intent Classifier → Vector Search → LLM API → Compliance Guard).

---

## 2. API Integration & Compliance Verifications

All core functions have been successfully verified through local API testing.

### Test 1: Factual RAG Query (Axis Small Cap Exit Load)
*   **Input**: `"What is the exit load of Axis Small Cap?"`
*   **API Route**: `FACTUAL` intent.
*   **Response**:
    ```json
    {
      "intent": "FACTUAL",
      "text": "The exit load for Axis Small Cap Fund Direct Growth is 1% if redeemed or switched out within 1 year from the date of allotment, and nil if redeemed or switched out after 1 year. This information is based on the official documentation. For more details, refer to the [official factsheet](https://groww.in/mutual-funds/axis-small-cap-fund-direct-growth).",
      "citation": "https://groww.in/mutual-funds/axis-small-cap-fund-direct-growth",
      "footer": "Last updated from sources: 2026-05-01"
    }
    ```
    *Status: Verified. Exactly 3 sentences, 1 official citation, and a structured date footer.*

### Test 2: Advisory Block & SEBI Redirect
*   **Input**: `"Should I invest in Axis Liquid Direct Fund?"`
*   **API Route**: `ADVISORY` intent.
*   **Response**:
    ```json
    {
      "intent": "ADVISORY",
      "text": "I am a facts-only mutual fund assistant and cannot provide investment recommendations, advice, or buy/sell suggestions. For official investor education, please refer to the [SEBI Investor Association Guide](https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doSubInvestortab=yes).",
      "citation": "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doSubInvestortab=yes",
      "footer": "Facts-Only Assistant Disclaimer"
    }
    ```
    *Status: Verified. Properly refused advisory and routed to the SEBI Investor Education portal.*

### Test 3: Performance Return Query & Direct Link Routing
*   **Input**: `"What is the returns rate of Zerodha Nifty 50?"`
*   **API Route**: `PERFORMANCE` intent.
*   **Response**:
    ```json
    {
      "intent": "PERFORMANCE",
      "text": "I cannot provide return rate calculations, projections, or performance comparisons. To view historical returns and official statistics for Zerodha Nifty 50 Index Fund Direct Growth, please refer directly to the [official factsheet](https://groww.in/mutual-funds/zerodha-nifty-50-index-fund-direct-growth).",
      "citation": "https://groww.in/mutual-funds/zerodha-nifty-50-index-fund-direct-growth",
      "footer": "Last updated from sources: 2026-05-01"
    }
    ```
    *Status: Verified. Bypassed LLM generation and directly linked the scheme's factsheet.*

### Test 4: Input Guardrail (PII Redaction)
*   **Input**: `"My PAN is ABCDE1234F. What is the exit load of Axis Small Cap?"`
*   **System Action**: Redacted user PAN to `[REDACTED_PAN]` inside the server logs before forwarding to retrieval.
*   *Status: Verified. Sensitive financial profiles are shielded.*
