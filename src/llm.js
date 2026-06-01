import { VectorDB } from './vector_db.js';

// Count sentences using standard punctuation boundaries (. ! ?)
function countSentences(text) {
  if (!text) return 0;
  // Clean text and split on punctuation followed by space or end of string
  const sentences = text
    .split(/[.!?]+(?:\s+|$)/)
    .filter(sentence => sentence.trim().length > 0);
  return sentences.length;
}

// Extract markdown/text links
function extractLinks(text) {
  if (!text) return [];
  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  const rawUrlRegex = /(https?:\/\/[^\s\)]+)/g;
  
  const links = [];
  let match;
  
  // Find markdown links first
  while ((match = mdLinkRegex.exec(text)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
      markdown: true
    });
  }

  // Find any raw URLs that aren't inside markdown parentheses
  const rawMatches = text.match(rawUrlRegex) || [];
  rawMatches.forEach(url => {
    // If it's already in the extracted markdown links list, skip
    if (!links.some(l => l.url === url)) {
      links.push({
        text: url,
        url: url,
        markdown: false
      });
    }
  });

  return links;
}

export async function processFactualQuery(query, resolvedSchemeName) {
  const db = new VectorDB();
  
  // 1. Faceted retrieval filtered by resolved scheme name
  const contextChunks = db.searchHybrid(query, { scheme_name: resolvedSchemeName }, 3);
  
  if (contextChunks.length === 0) {
    return {
      success: false,
      answer: `I'm sorry, I could not find verified facts regarding the scheme "${resolvedSchemeName}" in the official document corpus.`,
      citation_url: null,
      last_updated: '2026-05-29'
    };
  }

  // Compile context and retrieve source URL & last updated dates
  const contextText = contextChunks.map(c => c.text).join('\n\n');
  const sourceUrl = contextChunks[0].metadata.source_url;
  const lastUpdated = contextChunks[0].metadata.last_updated;

  // Build zero-tolerance system prompt
  const systemPrompt = `You are a compliance-first mutual fund FAQ assistant. Your core philosophy is: "Accuracy over Intelligence".
Your job is to answer the user query based ONLY on the provided context chunks.

Strict Rules:
1. Answer using ONLY the facts explicitly mentioned in the context. If the fact is not in the context, say "I'm sorry, but that information is not available in the official documentation."
2. Do NOT speculate, extrapolate, or provide opinions or recommendations.
3. Write a maximum of 3 sentences.
4. You MUST include exactly one citation link to the source document in markdown format, using the exact URL: ${sourceUrl}
Example citation format: [official factsheet](${sourceUrl})
5. Do NOT include any other URLs or links.
6. Return only the response text. Do not append footers or disclaimer notes.`;

  const userPrompt = `Context:\n${contextText}\n\nQuery: ${query}`;
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      answer: "LLM API Key is not configured in the environment.",
      citation_url: null,
      last_updated: '2026-05-29'
    };
  }

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 150
      })
    });

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('Empty LLM response choices');
    }

    const rawResponse = data.choices[0].message.content.trim();
    
    // Output Validation & Verification
    const sentenceCount = countSentences(rawResponse);
    const links = extractLinks(rawResponse);
    
    // Check 1: Sentence count <= 3
    const isSentenceCountValid = sentenceCount <= 3;
    
    // Check 2: Citation link counts == 1
    const isLinkCountValid = links.length === 1;
    
    // Check 3: Citation URL matches the official source_url
    const isUrlMatch = links.length > 0 && links[0].url === sourceUrl;

    if (isSentenceCountValid && isLinkCountValid && isUrlMatch) {
      // Successful validated compliance pathway
      return {
        success: true,
        answer: rawResponse,
        citation_url: sourceUrl,
        last_updated: lastUpdated
      };
    } else {
      console.warn(`LLM Compliance Check failed. Sentences: ${sentenceCount} (Valid: ${isSentenceCountValid}), Links Count: ${links.length} (Valid: ${isLinkCountValid}), URL Match: (Valid: ${isUrlMatch}). Executing fallback.`);
      
      // Fallback pathway
      const fallbackText = `According to the official documents for ${resolvedSchemeName}, the details regarding your query can be verified in the [official factsheet](${sourceUrl}).`;
      
      return {
        success: true,
        answer: fallbackText,
        citation_url: sourceUrl,
        last_updated: lastUpdated
      };
    }
  } catch (error) {
    console.error('LLM API Call failed:', error);
    
    // Fallback on total connection/processing error
    return {
      success: true,
      answer: `For official details on ${resolvedSchemeName}, please refer to the [official factsheet](${sourceUrl}).`,
      citation_url: sourceUrl,
      last_updated: lastUpdated
    };
  }
}
