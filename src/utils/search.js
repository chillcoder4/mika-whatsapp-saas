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

async function searchGoogle(query, num = 3) {
    const apiKey = process.env.GOOGLE_SEARCH_API;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        throw new Error('Missing GOOGLE_SEARCH_API or GOOGLE_SEARCH_CX');
    }

    const params = new URLSearchParams({
        key: apiKey,
        cx: cx,
        q: query,
        num: String(num)
    });

    const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
    const response = await fetchJson(url);

    if (response.status !== 200) {
        const message = response.data?.error?.message || 'Google Search API error';
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }

    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return items.slice(0, num).map((item) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link
    }));
}

module.exports = { searchGoogle };
