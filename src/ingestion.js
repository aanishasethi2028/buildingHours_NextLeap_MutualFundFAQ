import fs from 'fs';
import path from 'path';
import { VectorDB } from './vector_db.js';

export function runIngestion() {
  console.log(`[${new Date().toISOString()}] Starting Data Ingestion Pipeline...`);

  const corpusPath = 'data/corpus/schemes_data.json';
  if (!fs.existsSync(corpusPath)) {
    console.error(`Corpus file not found at ${corpusPath}`);
    return;
  }

  // Load raw scheme document corpus
  const rawCorpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const db = new VectorDB();
  db.clear(); // Fresh build for consistency

  let totalChunks = 0;
  const chunks = [];

  rawCorpus.forEach(scheme => {
    const { scheme_name, document_type, source_url, last_updated, sections } = scheme;
    
    sections.forEach((section, index) => {
      totalChunks++;
      const chunkId = `${scheme_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-chunk-${index}`;
      
      // Structure-aware parsing and metadata association
      chunks.push({
        id: chunkId,
        text: `Scheme: ${scheme_name}\nSection: ${section.title}\nContent: ${section.content}`,
        metadata: {
          chunk_id: chunkId,
          scheme_name,
          document_type,
          source_url,
          last_updated,
          section_header: section.title
        }
      });
    });
  });

  db.addDocuments(chunks);
  console.log(`[${new Date().toISOString()}] Ingestion completed successfully. Indexed ${totalChunks} chunks into VectorDB.`);
  return totalChunks;
}

// Enable running as direct script
if (process.argv[1] && process.argv[1].endsWith('ingestion.js')) {
  runIngestion();
}
