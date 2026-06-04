import fs from 'fs';
import puppeteer from 'puppeteer';

const CORPUS_PATH = 'data/corpus/schemes_data.json';

async function fetchLiveData() {
  console.log(`[${new Date().toISOString()}] Starting Live Data Fetcher...`);

  if (!fs.existsSync(CORPUS_PATH)) {
    console.error(`Corpus file not found at ${CORPUS_PATH}`);
    return;
  }

  const rawCorpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
  
  // Launch puppeteer
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < rawCorpus.length; i++) {
    const scheme = rawCorpus[i];
    console.log(`\nFetching data for: ${scheme.scheme_name}`);
    console.log(`URL: ${scheme.source_url}`);
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      await page.goto(scheme.source_url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Extract the entire page text to parse out numbers using regex
      // This is a resilient approach since classes change often on SPAs
      const pageText = await page.evaluate(() => document.body.innerText);

      // Find Expense Ratio (e.g., "Expense ratio 0.55%")
      // We look for "Expense ratio" or "Expense Ratio" followed by some optional text and then a percentage.
      const expenseRegex = /Expense\s*ratio\s*[\n\r]*\s*([0-9.]+)\s*%/i;
      const expenseMatch = pageText.match(expenseRegex);
      let newExpense = null;
      if (expenseMatch && expenseMatch[1]) {
        newExpense = expenseMatch[1] + '%';
        console.log(`  -> Found Expense Ratio: ${newExpense}`);
      } else {
        console.log(`  -> Warning: Could not find Expense Ratio, retaining old data.`);
      }

      // Find AUM (e.g., "Fund size ₹20,500 Cr" or "AUM ₹120 Cr")
      const aumRegex = /(?:Fund size|AUM|Asset Under Management)[\s\n\r]*₹\s*([0-9,.]+)\s*Cr/i;
      const aumMatch = pageText.match(aumRegex);
      let newAum = null;
      if (aumMatch && aumMatch[1]) {
        newAum = `Rs. ${aumMatch[1]} Crores`;
        console.log(`  -> Found AUM: ${newAum}`);
      } else {
        console.log(`  -> Warning: Could not find AUM, retaining old data.`);
      }

      // Update the JSON structure if we found new data
      if (newExpense || newAum) {
        scheme.last_updated = today;
        
        // Find and update the specific section
        const sectionIndex = scheme.sections.findIndex(s => s.title.includes('Expense Ratio'));
        if (sectionIndex !== -1) {
          let updatedContent = scheme.sections[sectionIndex].content;
          
          if (newExpense) {
            updatedContent = updatedContent.replace(/Expense Ratio of .*? is [0-9.]+%/, `Expense Ratio of ${scheme.scheme_name} is ${newExpense}`);
            updatedContent = updatedContent.replace(/as of [A-Za-z]+ \d+, \d{4}/, `as of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
          }
          
          if (newAum) {
            updatedContent = updatedContent.replace(/Asset Under Management \(AUM\) is Rs\. [0-9,]+ Crores/, `Asset Under Management (AUM) is ${newAum}`);
            updatedContent = updatedContent.replace(/as of [A-Za-z]+ \d{4}/, `as of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
          }
          
          scheme.sections[sectionIndex].content = updatedContent;
        }
      }

    } catch (error) {
      console.error(`  -> Failed to fetch ${scheme.scheme_name}:`, error.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Save updated data
  fs.writeFileSync(CORPUS_PATH, JSON.stringify(rawCorpus, null, 2), 'utf8');
  console.log(`\n[${new Date().toISOString()}] Successfully updated ${CORPUS_PATH} with live data.`);
}

fetchLiveData();
