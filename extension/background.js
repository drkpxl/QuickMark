// QuickMark server URL - change this to your QuickMark instance
const QUICKMARK_URL = 'http://do:9022';

// When the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  // Skip chrome:// and other restricted URLs
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.log('Cannot save browser internal pages');
    return;
  }

  try {
    // Inject content script to extract metadata
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMetadata
    });

    const metadata = results[0]?.result || {};

    // Build the save URL with parameters
    const params = new URLSearchParams({
      url: tab.url || '',
      title: metadata.title || tab.title || '',
      description: metadata.description || '',
      image_url: metadata.image || ''
    });

    // Open QuickMark save popup
    const saveUrl = `${QUICKMARK_URL}/save?${params.toString()}`;

    chrome.windows.create({
      url: saveUrl,
      type: 'popup',
      width: 500,
      height: 650
    });

  } catch (error) {
    console.error('Error saving bookmark:', error);

    // Fallback: open with just URL and title
    const params = new URLSearchParams({
      url: tab.url || '',
      title: tab.title || ''
    });

    chrome.windows.create({
      url: `${QUICKMARK_URL}/save?${params.toString()}`,
      type: 'popup',
      width: 500,
      height: 650
    });
  }
});

// Function that runs in the page context to extract metadata
function extractMetadata() {
  const getMetaContent = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.content) return el.content;
    }
    return '';
  };

  return {
    title: getMetaContent(['meta[property="og:title"]']) || document.title || '',
    description: getMetaContent([
      'meta[property="og:description"]',
      'meta[name="description"]'
    ]),
    image: getMetaContent([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]'
    ])
  };
}
