// REPLACED: This file previously used Google Custom Search API.
// Now redirects to Serper.dev via webSearch.js
const { searchInternet } = require('./webSearch');

/**
 * @deprecated Use searchInternet from webSearch.js directly
 * Kept for backward compatibility
 */
async function searchWeb(query) {
    return await searchInternet(query);
}

module.exports = { searchWeb };
