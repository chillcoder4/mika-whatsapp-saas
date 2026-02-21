const https = require('https');

function fetchJson(url) {
   return new Promise((resolve, reject) => {
      https.get(url, (res) => {
         let data = '';
         res.on('data', (chunk) => { data += chunk; });
         res.on('end', () => {
            try {
               const parsed = JSON.parse(data);
               resolve({ status: res.statusCode || 500, data: parsed });
            } catch (err) {
               reject(err);
            }
         });
      }).on('error', reject);
   });
}

async function searchWeb(query) {
   const apiKey = process.env.SEARCH_API_KEY || process.env.GOOGLE_API_KEY;
   const cx = process.env.SEARCH_ENGINE_ID || process.env.GOOGLE_CX;

   if (!apiKey || !cx) {
      throw new Error("Google API config missing");
   }

   const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`;
   const response = await fetchJson(url);
   const data = response.data;

   if (response.status !== 200) {
      const message = data?.error?.message || 'Google Search API error';
      throw new Error(message);
   }

   if (!data.items || data.items.length === 0) {
      return "No results found.";
   }

   return data.items.slice(0,3).map(item =>
      `${item.title}\n${item.snippet}\n${item.link}`
   ).join("\n\n");
}

module.exports = { searchWeb };
