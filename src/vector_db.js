import fs from 'fs';
import path from 'path';
import { getEmbedding } from './embedding_service.js';



// Common stop words to exclude from TF-IDF
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
  'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is',
  'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll',
  'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt',
  'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which',
  'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll',
  'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

export class VectorDB {
  constructor(dbPath = 'data/db/vector_index.json') {
    this.dbPath = dbPath;
    this.documents = []; // Array of { id, text, metadata, tokens, tf }
    this.idf = {}; // Word -> IDF
    this.loadIndex();
  }

  loadIndex() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const data = JSON.parse(raw);
        this.documents = data.documents || [];
        this.idf = data.idf || {};
      }
    } catch (e) {
      console.error('Error loading vector index, starting fresh:', e);
      this.documents = [];
      this.idf = {};
    }
  }

  saveIndex() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, JSON.stringify({
        documents: this.documents,
        idf: this.idf
      }, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving vector index:', e);
    }
  }

  // Processes raw text and adds to the database
  addDocuments(chunks) {
    // chunks: Array of { id, text, metadata }
    const newDocs = chunks.map(chunk => {
      const tokens = tokenize(chunk.text);
      const tf = {};
      tokens.forEach(token => {
        if (!STOP_WORDS.has(token)) {
          tf[token] = (tf[token] || 0) + 1;
        }
      });
      const totalTokens = tokens.filter(t => !STOP_WORDS.has(t)).length || 1;
      // Normalize TF
      Object.keys(tf).forEach(token => {
        tf[token] = tf[token] / totalTokens;
      });

      return {
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        tokens,
        tf
      };
    });

    this.documents = [...this.documents, ...newDocs];
    this.calculateIdf();
    this.saveIndex();
  }

  clear() {
    this.documents = [];
    this.idf = {};
    this.saveIndex();
  }

  calculateIdf() {
    const docCount = this.documents.length;
    const documentFrequencies = {};

    this.documents.forEach(doc => {
      const uniqueTokens = new Set(Object.keys(doc.tf));
      uniqueTokens.forEach(token => {
        documentFrequencies[token] = (documentFrequencies[token] || 0) + 1;
      });
    });

    this.idf = {};
    Object.keys(documentFrequencies).forEach(token => {
      this.idf[token] = Math.log(1 + docCount / (1 + documentFrequencies[token]));
    });
  }

  // Computes TF-IDF vector for a set of token frequencies
  getVector(tf) {
    const vector = {};
    Object.keys(tf).forEach(token => {
      const idfVal = this.idf[token] || 0;
      vector[token] = tf[token] * idfVal;
    });
    return vector;
  }

  // Cosine similarity between two sparse vectors
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    // Use union of keys for magnitude calculation
    const allKeys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    
    Object.keys(vec1).forEach(key => {
      mag1 += vec1[key] * vec1[key];
    });

    Object.keys(vec2).forEach(key => {
      mag2 += vec2[key] * vec2[key];
    });

    Object.keys(vec1).forEach(key => {
      if (vec2[key]) {
        dotProduct += vec1[key] * vec2[key];
      }
    });

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  // Sparse BM25-like overlap scorer
  bm25OverlapScore(queryTokens, doc) {
    let score = 0;
    queryTokens.forEach(token => {
      if (doc.tf[token]) {
        const idfVal = this.idf[token] || 0;
        // Simple term frequency scoring with saturation
        const tfVal = doc.tf[token];
        score += idfVal * ((tfVal * 2.2) / (tfVal + 1.2));
      }
    });
    return score;
  }

  // Hybrid search combining BM25 keyword matching and Dense (TF-IDF Cosine) similarity via RRF
  search(queryStr, filterMetadata = null, topK = 3) {
    const queryTokens = tokenize(queryStr).filter(t => !STOP_WORDS.has(t));
    if (queryTokens.length === 0) {
      // Fallback to absolute match or first documents matching filter
      return this.documents
        .filter(doc => !filterMetadata || doc.metadata.scheme_name === filterMetadata.scheme_name)
        .slice(0, topK);
    }

    // Calculate query vector
    const queryTf = {};
    queryTokens.forEach(token => {
      queryTf[token] = (queryTf[token] || 0) + 1;
    });
    const totalQueryTokens = queryTokens.length;
    Object.keys(queryTf).forEach(token => {
      queryTf[token] = queryTf[token] / totalQueryTokens;
    });
    const queryVector = this.getVector(queryTf);

    // Filter documents
    const candidateDocs = this.documents.filter(doc => {
      if (!filterMetadata) return true;
      // Strict filter on scheme_name
      return doc.metadata.scheme_name === filterMetadata.scheme_name;
    });

    if (candidateDocs.length === 0) return [];

    // Dense retrieval rank (Cosine)
    const denseScores = candidateDocs.map(doc => {
      const docVector = this.getVector(doc.tf);
      return {
        doc,
        score: this.cosineSimilarity(queryVector, docVector)
      };
    }).sort((a, b) => b.score - a.score);

    // Sparse retrieval rank (BM25 Overlap)
    const sparseScores = candidateDocs.map(doc => {
      return {
        doc,
        score: this.bm25OverlapScore(queryTokens, doc)
      };
    }).sort((a, b) => b.score - a.score);

    // RRF implementation
    // Constant k = 60
    const k = 60;
    const rrfScores = new Map();

    denseScores.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      rrfScores.set(item.doc.id, { doc: item.doc, score });
    });

    sparseScores.forEach((item, index) => {
      const rank = index + 1;
      const score = 1 / (k + rank);
      const existing = rrfScores.get(item.doc.id);
      if (existing) {
        existing.score += score;
      } else {
        rrfScores.set(item.doc.id, { doc: item.doc, score });
      }
    });

    // Sort by RRF score
    const results = Array.from(rrfScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.doc);

    return results;
  }

  // Hybrid search alias – keeps API surface clear
  async searchHybrid(queryStr, filterMetadata = null, topK = 3) {
    return this.search(queryStr, filterMetadata, topK);
  }
}
