const https = require('https');

/**
 * Search the internet using Serper.dev Google Search API
 * @param {string} query - Search query
 * @returns {Promise<string>} - Summary of top results
 */
async function searchInternet(query) {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      console.error('[Serper] SERPER_API_KEY not set in environment');
      return "Internet search unavailable (API key missing).";
    }

    const body = JSON.stringify({ q: query, gl: "in" });

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'google.serper.dev',
        path: '/search',
        method: 'POST',
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
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error('Failed to parse Serper response'));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });

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

/**
 * Detects if a message is asking about real-time / internet info
 * @param {string} message
 * @returns {boolean}
 */
function needsWebSearch(message) {
  const keywords = [
    'news', 'today', 'internet', 'latest', 'current affairs',
    'what is', 'who is', 'how to', 'trending', 'weather',
    'price', 'score', 'match', 'update', 'recent', 'now',
    'right now', 'current', 'aaj', 'abhi', 'kya hua',
    'batao', 'bata', 'kaun hai', 'kya hai', 'kaise'
  ];
  const lower = message.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

module.exports = { searchInternet, needsWebSearch };
