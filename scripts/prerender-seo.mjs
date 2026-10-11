import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'dist');
const template = await readFile(join(outputDir, 'index.html'), 'utf8');
const site = 'https://usebeforeyourent.com';

const pages = {
  '/inspection-checklist': {
    file: 'inspection-checklist.html',
    title: 'Rental inspection checklist for Nigeria | Before you rent',
    description: 'Use this practical rental viewing checklist to review building condition, water, electricity, surroundings, security, and tenancy paperwork.',
    robots: 'index, follow, max-image-preview:large',
  },
  '/contact': {
    file: 'contact.html',
    title: 'Contact Before you rent',
    description: 'Get in touch with Before you rent about product questions, feedback, or the rental inspection checklist.',
    robots: 'index, follow, max-image-preview:large',
  },
  '/privacy': {
    file: 'privacy.html',
    title: 'Privacy policy | Before you rent',
    description: 'Understand how Before you rent handles locally stored property details, inspection notes, photos, and exported backups.',
    robots: 'index, follow, max-image-preview:large',
  },
  '/terms': {
    file: 'terms.html',
    title: 'Terms of use | Before you rent',
    description: 'Read the terms, intended use, and limitations of the Before you rent rental decision-support tool.',
    robots: 'index, follow, max-image-preview:large',
  },
  '/app': {
    file: 'app.html',
    title: 'Your renting workspace | Before you rent',
    description: 'Organise rental property details, inspection checks, costs, questions, and photo evidence on this device.',
    robots: 'noindex, nofollow, noarchive',
  },
};

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

for (const [route, page] of Object.entries(pages)) {
  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);
  const canonical = site + route;
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + title + '</title>');
  html = html.replace(/(<meta name="description" content=")[^"]*(" \/>)/, '$1' + description + '$2');
  html = html.replace(/(<meta name="robots" content=")[^"]*(" \/>)/, '$1' + page.robots + '$2');
  html = html.replace(/(<meta name="googlebot" content=")[^"]*(" \/>)/, '$1' + page.robots + '$2');
  html = html.replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, '$1' + title + '$2');
  html = html.replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, '$1' + description + '$2');
  html = html.replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, '$1' + canonical + '$2');
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, '$1' + title + '$2');
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(" \/>)/, '$1' + description + '$2');
  html = html.replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, '$1' + canonical + '$2');
  await writeFile(join(outputDir, page.file), html, 'utf8');
}

console.log('Generated static SEO entry points for: ' + Object.keys(pages).join(', '));
