const https = require('https');

/**
 * Search the internet using Serper.dev Google Search API
 * @param {string} query - Search query
 * @returns {Promise<string>} - Summary of top results
 */
async function fetchSerper(query, apiKey) {
  const body = JSON.stringify({ q: query, gl: "in" });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'google.serper.dev',
      path: '/search',
      method: 'POST',
      timeout: 10000,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
           // Serper might return statusCode 403/varies if limits are hit within the JSON
          if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Serper HTTP ${res.statusCode}: ${raw}`));
              return;
          }
          if (parsed.message && parsed.message.includes('Unauthorized')) {
              reject(new Error(`Serper Unauthorized: ${parsed.message}`));
              return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Failed to parse Serper response'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Serper request timed out after 10s'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Search the internet using Serper.dev Google Search API
 * @param {string} query - Search query
 * @returns {Promise<string>} - Summary of top results
 */
async function searchInternet(query) {
  try {
    const primaryKey = process.env.SERPER_API_KEY;
    const secondaryKey = process.env.SERPER_API_KEY2;

    if (!primaryKey && !secondaryKey) {
      console.error('[Serper] No SERPER_API_KEY set in environment');
      return "Internet search unavailable (API key missing).";
    }

    let data;
    try {
      if (primaryKey) {
        data = await fetchSerper(query, primaryKey);
      } else {
        throw new Error('Primary key not set');
      }
    } catch (primaryErr) {
      console.warn(`[Serper] Primary search failed: ${primaryErr.message}. Trying secondary key...`);
      if (secondaryKey) {
        try {
          data = await fetchSerper(query, secondaryKey);
          console.log(`[Serper] Secondary search succeeded.`);
        } catch (secErr) {
          throw new Error(`Both keys failed. Primary: ${primaryErr.message}, Secondary: ${secErr.message}`);
        }
      } else {
         throw primaryErr;
      }
    }

    if (!data.organic || data.organic.length === 0) {
      return "No internet result found.";
    }

    const summary = data.organic.slice(0, 3)
      .map(r => `${r.title}: ${r.snippet}`)
      .join("\n");

    return summary;

  } catch (err) {
    console.error("Serper Search Error:", err);
    return "Internet search temporarily unavailable.";
  }
}

module.exports = { searchInternet };
