/**
 * composeMessage.js
 * ------------------
 * Turns Groq's structured plain-text output (see groq.js) into the final HTML
 * result message. This is the only place that ever emits HTML for the result
 * message - the AI's text fields are always HTML-escaped before being wrapped
 * in markup, since freeText is user-submitted and flows into Groq's context.
 * The "For More Support" section and any distress-tier resource block are
 * fixed, code-generated content - never left to the AI to reproduce - so every
 * result guarantees the same closing links regardless of what the AI writes.
 */

const NAVIGATING_PELVIC_PAIN_GUIDE_URL =
  'https://static1.squarespace.com/static/68e81b678021d5189cf1f247/t/6a361a6ff2db6d6cf2c9d08a/1781930607084/Navigating+Pelvic+Pain+Guide.pdf';
const BLOG_URL = 'https://cushionyourassets.com/blog';
const PROVIDER_DIRECTORY_URL = 'https://cushionyourassets.com/provider-directory';
const SUPPORT_EMAIL = 'support@cushionyourassets.com';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CRISIS_BLOCK =
  '<p><strong>If things feel like more than you can carry right now,</strong> ' +
  "please reach out: call or text 988 (Suicide &amp; Crisis Lifeline, available " +
  "24/7). You don't have to figure this out alone.</p>";

// Always appended, regardless of distress tier - every result ends the same way.
const MORE_SUPPORT_BLOCK =
  '<h3>For More Support</h3>\n' +
  '<p>Whatever you decide, we want you to feel supported.</p>\n' +
  '<ul>\n' +
  `<li>Download the <a href="${NAVIGATING_PELVIC_PAIN_GUIDE_URL}">Navigating Pelvic Pain Guide</a>. ` +
  'It explains what\'s actually happening in your body and how to find the right care.</li>\n' +
  `<li>Explore the <a href="${BLOG_URL}">Pelvic Pain Answers Blog</a> for insider tips and ` +
  'stories of hope and healing.</li>\n' +
  `<li>Search through our exclusive <a href="${PROVIDER_DIRECTORY_URL}">Provider Directory</a> ` +
  'with over 250 pelvic pain specialists.</li>\n' +
  '</ul>\n' +
  '<p>Still not sure this is the right fit or have more questions? Email us at ' +
  `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;

/**
 * @param {object} routedResult - the object returned by routeCushion()
 * @param {{whyWeRecommend: string, forYouSpecifically: string, distressTier: string}} groqResult
 * @returns {string} final HTML message
 */
function composeResultMessage(routedResult, groqResult) {
  const sections = [
    `<h3>Why We Recommend Your ${escapeHtml(routedResult.product)}</h3>`,
    `<p>${escapeHtml(groqResult.whyWeRecommend)}</p>`,
    '<h3>For You Specifically</h3>',
    `<p>${escapeHtml(groqResult.forYouSpecifically)}</p>`,
  ];
  if (groqResult.distressTier === 'crisis') {
    sections.push(CRISIS_BLOCK);
  }
  sections.push(MORE_SUPPORT_BLOCK);
  return sections.join('\n');
}

/**
 * Used when the Groq call fails entirely - still gives a correctly formatted
 * result with the same guaranteed closing section.
 * @param {object} routedResult
 * @returns {string} final HTML message
 */
function composeFallbackMessage(routedResult) {
  const sections = [
    `<h3>Why We Recommend Your ${escapeHtml(routedResult.product)}</h3>`,
    `<p>Based on what you told us, we'd recommend the ${escapeHtml(routedResult.product)}, ` +
      `${escapeHtml(routedResult.firmness)} firmness, ${escapeHtml(routedResult.size)}, ` +
      `${escapeHtml(routedResult.thickness)}. ${escapeHtml(routedResult.alwaysInclude.breakIn)} ` +
      `${escapeHtml(routedResult.alwaysInclude.returnPolicy)}</p>`,
  ];
  sections.push(MORE_SUPPORT_BLOCK);
  return sections.join('\n');
}

module.exports = { composeResultMessage, composeFallbackMessage };
