// Direct fetch used for API integration to minimize external dependencies.
const TARGET_SCHEMES = [
  "Axis Silver FoF Direct Growth",
  "Axis Small Cap Fund Direct Growth",
  "Axis Liquid Direct Fund Growth",
  "LIC MF Index Fund Nifty Direct Growth",
  "LIC MF Children's Fund Direct Growth",
  "Baroda BNP Paribas Large & Mid Cap Fund Direct Growth",
  "Baroda BNP Paribas Multi Asset Fund Direct Growth",
  "Quantum ESG Best In Class Strategy Fund Direct Growth",
  "Quantum Ethical Fund Direct Growth",
  "Quantum Dynamic Bond Fund Growth",
  "Zerodha Overnight Fund Direct Growth",
  "Zerodha Nifty 50 Index Fund Direct Growth",
  "Aditya Birla Sun Life Gold Fund Direct Growth"
];

// 1. PII Sanitizer
export function sanitizePII(text) {
  let sanitized = text;

  // PAN Regex: 5 letters, 4 digits, 1 letter
  sanitized = sanitized.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi, '[REDACTED_PAN]');

  // Aadhaar Regex: 12 digits (with optional spaces every 4 digits)
  sanitized = sanitized.replace(/\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b/g, '[REDACTED_AADHAAR]');
  sanitized = sanitized.replace(/\b[2-9]{1}[0-9]{11}\b/g, '[REDACTED_AADHAAR]');

  // Bank Account Number: 9 to 18 digits
  sanitized = sanitized.replace(/\b\d{9,18}\b/g, '[REDACTED_ACCOUNT]');

  // IFSC Code: 4 letters, '0', 6 alphanumeric characters
  sanitized = sanitized.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[REDACTED_IFSC]');

  // Email Address
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');

  // Phone Number: 10 digits (optional country code)
  sanitized = sanitized.replace(/\b(?:\+?\d{1,3}[- ]?)?\d{10}\b/g, '[REDACTED_PHONE]');

  return sanitized;
}

// Levenshtein Distance Calculator
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // Deletion
          dp[i][j - 1] + 1,    // Insertion
          dp[i - 1][j - 1] + 1 // Substitution
        );
      }
    }
  }
  return dp[m][n];
}

// 2. Entity Resolver using Fuzzy Match
export function resolveSchemeEntity(query) {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  let bestScheme = null;
  let bestScore = 0; // Higher is better (0 to 1)

  TARGET_SCHEMES.forEach(scheme => {
    const normalizedScheme = scheme.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Exact match or contains
    if (normalizedQuery.includes(normalizedScheme) || normalizedScheme.includes(normalizedQuery)) {
      bestScheme = scheme;
      bestScore = 1.0;
      return;
    }

    // Token overlap match
    const queryTokens = normalizedQuery.split(/\s+/).filter(t => t.length > 2);
    const schemeTokens = normalizedScheme.split(/\s+/);
    
    let matchCount = 0;
    queryTokens.forEach(qToken => {
      // Find closest token match in scheme
      let minDistance = 999;
      schemeTokens.forEach(sToken => {
        const dist = levenshteinDistance(qToken, sToken);
        if (dist < minDistance) minDistance = dist;
      });
      // Threshold for token match (e.g. dist <= 1 or dist <= 2 depending on length)
      if (minDistance <= 1) {
        matchCount++;
      }
    });

    const score = matchCount / Math.max(queryTokens.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestScheme = scheme;
    }
  });

  // Strict threshold for fuzzy matching
  if (bestScore >= 0.3) {
    return { resolvedName: bestScheme, score: bestScore };
  }
  return { resolvedName: null, score: 0 };
}

// 3. Intent Classifier (Hybrid Keyword/LLM)
export async function classifyIntent(query, resolvedScheme = null) {
  const lowerQuery = query.toLowerCase();

  // Basic keyword routing for common advisory patterns
  const advisoryKeywords = [
    'should i invest', 'should i buy', 'is it good', 'recommend a fund',
    'which fund is best', 'where to invest', 'suggest a mutual fund',
    'best mutual fund for return', 'advice', 'advisory', 'recommendation'
  ];

  for (const kw of advisoryKeywords) {
    if (lowerQuery.includes(kw)) {
      return 'ADVISORY';
    }
  }

  // ── Strong factual keyword guard (runs BEFORE performance check) ──────────
  // These phrases unambiguously indicate a factual query; short-circuit here
  // so the performance keyword list cannot fire on them.
  const strongFactualKeywords = [
    'exit load', 'expense ratio', 'aum', 'assets under management',
    'fund manager', 'fund size', 'minimum sip', 'minimum lump', 'lock-in',
    'lock in', 'benchmark index', 'benchmark', 'redemption', 'risk grade',
    'risk rating', 'risk-o-meter', 'riskometer', 'nav', 'net asset value',
    'sebi category', 'fund category', 'investment objective', 'portfolio turnover',
    'download statement', 'account statement', 'tax', 'who is the fund manager',
    'what is the manager'
  ];

  for (const kw of strongFactualKeywords) {
    if (lowerQuery.includes(kw)) {
      return 'FACTUAL';
    }
  }

  // Basic keyword routing for common performance/comparison patterns
  // NOTE: 'grow' is intentionally replaced with a word-boundary match to avoid
  //       false positives from scheme names that end in "...Direct Growth".
  const performanceKeywords = [
    'return', 'returns', 'performance', 'yield', 'profit',
    'interest rate', 'growth comparison', 'is better than', 'vs'
  ];
  // Match 'grow' only as a standalone word (not the 'growth' in a scheme name)
  const growRegex = /\bgrow\b/i;

  if (growRegex.test(query) || performanceKeywords.some(kw => lowerQuery.includes(kw))) {
    return 'PERFORMANCE';
  }


  // Fallback to LLM for precise classification if API key is configured

  const apiKey = process.env.LLM_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an intent classifier for a financial mutual fund assistant. Classify the user query into exactly one of these categories: FACTUAL, ADVISORY, PERFORMANCE, OUT_OF_DOMAIN.\n\n- FACTUAL: Specific objective questions about exit load, expense ratio, AUM, manager name/tenure, minimum SIP/lump sum, lock-in, benchmark index, or downloading statement processes.\n- ADVISORY: Requests for advice, recommendations, buy/sell decisions, or "should I invest".\n- PERFORMANCE: Queries about return rates, historical returns, growth projections, or comparing returns between funds.\n- OUT_OF_DOMAIN: Anything else unrelated to mutual funds.\n\nRespond with only the category word.'
            },
            {
              role: 'user',
              content: `Query: "${query}"`
            }
          ],
          temperature: 0.0,
          max_tokens: 10
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0].message) {
        const intent = data.choices[0].message.content.trim().toUpperCase();
        if (['FACTUAL', 'ADVISORY', 'PERFORMANCE', 'OUT_OF_DOMAIN'].includes(intent)) {
          return intent;
        }
      }
    } catch (e) {
      console.error('LLM Intent Classification failed, using keyword fallback:', e);
    }
  }

  // Fallback rule if LLM fails or is missing
  if (hasFactualKeyword && resolvedScheme) {
    return 'FACTUAL';
  } else if (!resolvedScheme) {
    return 'OUT_OF_DOMAIN';
  }
  return 'FACTUAL';
}
