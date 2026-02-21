const Groq = require('groq-sdk');

function fallbackSmartSummary(oldSummary, recentMessages) {
    const recentText = recentMessages
        .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join(' | ')
        .slice(0, 400);

    const combined = [oldSummary, recentText].filter(Boolean).join(' | ').trim();
    return combined.slice(0, 420);
}

async function generateSmartSummary(oldSummary, recentMessages) {
    if (!recentMessages || recentMessages.length === 0) return oldSummary || '';

    const apiKey = process.env.GROQ_PRIMARY || process.env.GROQ_API_KEY;
    if (!apiKey) {
        return fallbackSmartSummary(oldSummary, recentMessages);
    }

    const groq = new Groq({ apiKey });
    const history = recentMessages.map((msg) => {
        return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`;
    }).join('\n');

    const systemPrompt = [
        'You update a long-term chat memory summary.',
        'Use the existing summary and recent messages.',
        'Keep it concise (max 4 sentences).',
        'Preserve names, preferences, facts, and commitments.',
        'Avoid repeating info already covered unless updated.',
        'Use the dominant language from the recent messages.'
    ].join(' ');

    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `Existing summary:\n${oldSummary || 'None'}\n\nRecent messages:\n${history}`
            }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 300,
        top_p: 0.9,
        stream: false
    });

    const reply = response.choices[0]?.message?.content?.trim();
    return reply && reply.length > 0 ? reply : fallbackSmartSummary(oldSummary, recentMessages);
}

module.exports = { generateSmartSummary };
