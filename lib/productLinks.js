/**
 * productLinks.js
 * ---------------
 * Maps a routed product name to display/shop info, so api/quiz-result.js can
 * hand results.html ready-to-use values instead of results.html (or any other
 * caller) needing its own copy of these mappings.
 *
 * IMPORTANT: routing.js's internal product value ("Twin Cheeks" / "Simple
 * Soother") is used throughout routing.js's own logic and stays that way -
 * only the customer-facing display name changes here. Don't rename the
 * internal value itself; add a mapping instead, same as getOrderLink() below.
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

const PRODUCT_DISPLAY_NAMES = {
  'Twin Cheeks': 'Twin Cheeks Folding Cushion',
  'Simple Soother': 'Simple Soother Cushion',
};

/** @param {string} product @returns {{url: string, label: string}} */
function getOrderLink(product) {
  return PRODUCT_LINKS[product] || DEFAULT_LINK;
}

/** @param {string} product @returns {string} the full customer-facing product name */
function getProductDisplayName(product) {
  return PRODUCT_DISPLAY_NAMES[product] || product;
}

module.exports = { getOrderLink, getProductDisplayName, PRODUCT_LINKS, PRODUCT_DISPLAY_NAMES };
