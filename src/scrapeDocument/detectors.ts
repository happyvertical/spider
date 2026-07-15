export interface DocumentDetectorResult {
  url: string;
  type: string;
  isPdf: boolean;
  strategy: string;
}

type DocumentDetector = (
  url: string,
  html: string,
) => DocumentDetectorResult | null;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function makeAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(decodeHtmlEntities(url), baseUrl).toString();
  } catch {
    return decodeHtmlEntities(url);
  }
}

export function extractWordPressDownloadUrl(
  url: string,
  html: string,
): string | null {
  const hasWpdmInUrl = url.includes('wpdmdl=');
  const isWpdmPage =
    url.includes('/download/') ||
    html.includes('wpdm-download-link') ||
    html.includes('wpdm_view_count');

  if (hasWpdmInUrl) {
    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.warn(
        `[spider] WordPress detection: URL already has wpdmdl parameter, skipping detection to avoid loop: ${url}`,
      );
    }
    return null;
  }

  if (!isWpdmPage) {
    return null;
  }

  const wpdmLinkMatch = html.match(/href=["']([^"']*wpdmdl=\d+[^"']*)["']/i);
  if (wpdmLinkMatch) {
    const downloadUrl = makeAbsoluteUrl(wpdmLinkMatch[1], url);

    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.log(
        `[spider] WordPress detection: Found wpdmdl link: ${downloadUrl}`,
      );
    }

    return downloadUrl;
  }

  const pdfLinkMatch = html.match(/href=["']([^"']*\.pdf[^"']*)["']/i);
  if (pdfLinkMatch) {
    const pdfUrl = makeAbsoluteUrl(pdfLinkMatch[1], url);

    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.log(
        `[spider] WordPress detection: Found direct PDF link: ${pdfUrl}`,
      );
    }

    return pdfUrl;
  }

  if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
    console.warn(
      `[spider] WordPress detection: Page looks like WordPress but no download link found: ${url}`,
    );
  }

  return null;
}

export function extractCivicWebDocumentUrl(
  url: string,
  html: string,
): string | null {
  const isCivicWebPreview =
    url.includes('/filepro/documents/?preview=') ||
    (url.includes('civicweb.net') && url.includes('/filepro/documents'));

  if (!isCivicWebPreview) {
    return null;
  }

  const docLinkMatch = html.match(
    /href=["'](\/filepro\/document\/\d+\/[^"']+\.pdf)["']/i,
  );

  if (!docLinkMatch) {
    return null;
  }

  return makeAbsoluteUrl(docLinkMatch[1], url);
}

export function extractDocuShareDocumentUrl(
  url: string,
  html: string,
): string | null {
  const isDocuSharePage =
    url.includes('/docushare/dsweb/') ||
    url.includes('DocuShare') ||
    html.includes('DocuShare') ||
    html.includes('/dsweb/Get/') ||
    html.includes('/dsweb/ServicesLib/');

  if (!isDocuSharePage) {
    return null;
  }

  const patterns = [
    /href=["'](\/dsweb\/Get\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
    /href=["'](\/dsweb\/ServicesLib\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
    /href=["'](\/[^"']*(?:docushare|dsweb)[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return makeAbsoluteUrl(match[1], url);
    }
  }

  return null;
}

const detectors: DocumentDetector[] = [
  (url, html) => {
    const downloadUrl = extractWordPressDownloadUrl(url, html);
    return downloadUrl
      ? {
          url: downloadUrl,
          type: 'application/pdf',
          isPdf: true,
          strategy: 'wordpress-pdf-link',
        }
      : null;
  },
  (url, html) => {
    const documentUrl = extractCivicWebDocumentUrl(url, html);
    return documentUrl
      ? {
          url: documentUrl,
          type: 'application/pdf',
          isPdf: true,
          strategy: 'civicweb-pdf-link',
        }
      : null;
  },
  (url, html) => {
    const documentUrl = extractDocuShareDocumentUrl(url, html);
    if (!documentUrl) {
      return null;
    }

    const isPdf = documentUrl.toLowerCase().endsWith('.pdf');
    return {
      url: documentUrl,
      type: isPdf ? 'application/pdf' : 'application/octet-stream',
      isPdf,
      strategy: 'docushare-doc-link',
    };
  },
];

export function detectDocumentUrl(
  url: string,
  html: string,
): DocumentDetectorResult | null {
  for (const detector of detectors) {
    const result = detector(url, html);
    if (result) {
      return result;
    }
  }

  return null;
}
