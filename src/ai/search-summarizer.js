const Groq = require('groq-sdk');

function detectLanguageHint(text = '') {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    return 'en';
}

function fallbackSummary(query, results, userMessage) {
    const lang = detectLanguageHint(userMessage || query);
    if (lang === 'hi') {
        const items = results.map((r, i) => `${i + 1}. ${r.title} - ${r.snippet}`).join('\n');
        return `Maine internet par search karke yeh top results mile:\n${items}`;
    }

    if (lang === 'ar') {
        const items = results.map((r, i) => `${i + 1}. ${r.title} - ${r.snippet}`).join('\n');
        return `هذه أهم النتائج التي وجدتها عبر البحث:\n${items}`;
    }

    const items = results.map((r, i) => `${i + 1}. ${r.title} - ${r.snippet}`).join('\n');
    return `Here are the top search results:\n${items}`;
}

async function summarizeSearchResults(query, results, userMessage = '') {
    if (!results || results.length === 0) return '';

    const apiKey = process.env.GROQ_PRIMARY || process.env.GROQ_API_KEY;
    if (!apiKey) {
        return fallbackSummary(query, results, userMessage);
    }

    const groq = new Groq({ apiKey });

    const sources = results.map((r, i) => {
        return `${i + 1}. ${r.title}\n${r.snippet}\n${r.link}`;
    }).join('\n\n');

    const systemPrompt = [
        'You are a research assistant.',
        'Answer ONLY using the provided search results.',
        'Respond in the same language as the user message.',
        'Give a concise summary (2-4 sentences).',
        'Then add a short "Sources" list with the titles.'
    ].join(' ');

    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `User question: ${query}\nUser message: ${userMessage}\n\nSearch Results:\n${sources}`
            }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 500,
        top_p: 0.9,
        stream: false
    });

    const reply = response.choices[0]?.message?.content?.trim();
    return reply && reply.length > 0 ? reply : fallbackSummary(query, results, userMessage);
}

module.exports = { summarizeSearchResults };
