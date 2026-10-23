// QuickMark server URL - change this to your QuickMark instance
const QUICKMARK_URL = 'http://do:9022';

// Screenshots are shrunk to this width before uploading; cards never show them larger
const SCREENSHOT_WIDTH = 1024;

// When the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  // Skip chrome:// and other restricted URLs
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.log('Cannot save browser internal pages');
    return;
  }

  const params = new URLSearchParams({ url: tab.url, title: tab.title || '' });

  // Take the screenshot while the page is still the visible tab, before the popup opens
  const screenshot = captureScreenshot(tab.windowId);

  try {
    // Inject content script to extract metadata
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractMetadata
    });
    const metadata = results[0]?.result || {};

    params.set('title', metadata.title || tab.title || '');
    params.set('description', metadata.description || '');
    params.set('image_url', metadata.image || '');
    params.set('favicon_url', metadata.favicon || '');
  } catch (error) {
    // Some pages (PDFs, the Web Store) can't be scripted; save with just the URL and title
    console.error('Could not read page metadata:', error);
  }

  params.set('screenshot', await screenshot);

  // Open QuickMark save popup
  chrome.windows.create({
    url: `${QUICKMARK_URL}/save?${params.toString()}`,
    type: 'popup',
    width: 500,
    height: 720
  });
});

// Capture the visible part of the page, shrink it to card size and upload it.
// Returns the uploaded image's path, or '' if anything went wrong.
async function captureScreenshot(windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());

    // Keep the top of the page, cropped to the cards' 16:9 shape when the window is taller
    const sourceHeight = Math.min(bitmap.height, Math.round(bitmap.width * 9 / 16));
    const width = Math.min(SCREENSHOT_WIDTH, bitmap.width);
    const height = Math.round(sourceHeight * width / bitmap.width);

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, bitmap.width, sourceHeight, 0, 0, width, height);
    const image = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });

    const response = await fetch(`${QUICKMARK_URL}/api/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: image
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    return (await response.json()).path;
  } catch (error) {
    console.error('Screenshot failed:', error);
    return '';
  }
}

// Function that runs in the page context to extract metadata
function extractMetadata() {
  const meta = (...keys) => {
    for (const key of keys) {
      const el = document.querySelector(`meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`);
      if (el?.content) return el.content.trim();
    }
    return '';
  };

  const linkHref = (selector) => document.querySelector(selector)?.getAttribute('href') || '';

  // Pages often use relative paths, which the server can't download
  const absolute = (value) => {
    if (!value) return '';
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  return {
    title: meta('og:title') || document.title || '',
    description: meta('og:description', 'description', 'twitter:description'),
    image: absolute(
      meta('og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src', 'image') ||
      linkHref('link[rel="image_src"]')
    ),
    favicon: absolute(linkHref('link[rel="apple-touch-icon"]') || linkHref('link[rel~="icon"]'))
  };
}
