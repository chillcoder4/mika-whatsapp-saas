const tempMemory = require('./temp-memory');
const { getSmartMemory, updateSmartMemory } = require('../services/firebase-service');
const { generateSmartSummary } = require('../ai/smart-summary');

let summaryJobRunning = false;

async function updateSmartSummaries() {
    if (summaryJobRunning) return;
    summaryJobRunning = true;

    try {
        const pairs = tempMemory.listActivePairs();
        for (const pair of pairs) {
            const { userId, chatJid, messages } = pair;
            if (!messages || messages.length === 0) continue;

            const existing = await getSmartMemory(userId, chatJid);
            const oldSummary = existing?.summary || '';

            const newSummary = await generateSmartSummary(oldSummary, messages);
            if (!newSummary) continue;

            if (newSummary !== oldSummary) {
                await updateSmartMemory(userId, chatJid, { summary: newSummary });
            }
        }
    } catch (error) {
        console.error('[Smart Summary] Update failed:', error);
    } finally {
        summaryJobRunning = false;
    }
}

function startSmartSummaryScheduler() {
    updateSmartSummaries().catch(() => {});
    setInterval(() => {
        updateSmartSummaries().catch(() => {});
    }, 60 * 1000);
}

module.exports = { startSmartSummaryScheduler };
