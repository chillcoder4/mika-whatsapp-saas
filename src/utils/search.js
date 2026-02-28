// REPLACED: This file previously used Google Custom Search API.
// Now redirects to Serper.dev via webSearch.js
const { searchInternet } = require('../services/webSearch');

/**
 * @deprecated Use searchInternet from webSearch.js directly
 * Kept for backward compatibility
 */
async function searchGoogle(query, num = 3) {
    const result = await searchInternet(query);
    return result;
}

module.exports = { searchGoogle };
