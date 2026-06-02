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
  const contextChunks = await db.searchHybrid(query, { scheme_name: resolvedSchemeName }, 3);

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

  // Build system prompt – citation link is handled by the UI Source row, not the LLM
  const systemPrompt = `You are a compliance-first mutual fund FAQ assistant. Your core philosophy is: "Accuracy over Intelligence".
Your job is to answer the user query based ONLY on the provided context chunks.

Strict Rules:
1. Answer using ONLY the facts explicitly mentioned in the context. If the fact is not in the context, say "I'm sorry, but that information is not available in the official documentation."
2. Do NOT speculate, extrapolate, or provide opinions or recommendations.
3. Write the answer to the user query clearly and concisely while giving complete information available in the context.
4. If the answer involves steps or a list, format each item on a new line as a numbered list (e.g. "1. Step one\n2. Step two\n3. Step three").
5. Do NOT include any URLs, links, or "for more information" statements. The citation will be shown separately.
6. Return only the factual answer text. Do not append footers, disclaimer notes, or source references.`;

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
    console.log(`[LLM Raw Response] ${rawResponse.substring(0, 200)}...`);

    // Strip any citation/reference sentences the LLM may add despite instructions.
    // Patterns: "For more information...", "refer to the official...", markdown links, raw URLs.
    const cleanAnswer = rawResponse
      // Remove markdown links entirely: [text](url)
      .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
      // Remove raw URLs
      .replace(/https?:\/\/[^\s)]+/g, '')
      // Remove trailing sentences that reference sources/factsheets
      .replace(/[^.!?]*\b(for more information|refer to|official factsheet|more detail|please visit|source document)[^.!?]*[.!?]?\s*$/gi, '')
      .trim();

    return {
      success: true,
      answer: cleanAnswer || rawResponse, // fallback to raw if stripping removed everything
      citation_url: sourceUrl,
      last_updated: lastUpdated
    };
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
