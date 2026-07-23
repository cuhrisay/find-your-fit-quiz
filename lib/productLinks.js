/**
 * productLinks.js
 * ---------------
 * Maps a routed product name to its shop page and CTA button label, so
 * api/quiz-result.js can hand results.html a ready-to-use order link instead
 * of results.html needing its own copy of this mapping.
 */

const PRODUCT_LINKS = {
  'Twin Cheeks': {
    url: 'https://www.cushionyourassets.com/shop-products/p/twin-cheeks-folding-cushion',
    label: 'Order a Twin Cheeks',
  },
  'Simple Soother': {
    url: 'https://www.cushionyourassets.com/shop-products/p/simple-soother',
    label: 'Order a Simple Soother',
  },
};

const DEFAULT_LINK = { url: 'https://cushionyourassets.com/shop', label: 'Shop Your Fit' };

/** @param {string} product @returns {{url: string, label: string}} */
function getOrderLink(product) {
  return PRODUCT_LINKS[product] || DEFAULT_LINK;
}

module.exports = { getOrderLink, PRODUCT_LINKS };
