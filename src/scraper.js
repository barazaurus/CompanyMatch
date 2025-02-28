// Web Scraper for Company Information
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

// Constants
const MAX_WORKERS = 20; // Adjust based on server capacity
const REQUEST_TIMEOUT = 10000; // 10 seconds timeout for each request
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Regular expressions for data extraction
const PHONE_REGEX = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ADDRESS_REGEX = /(\d+\s+[A-Za-z0-9\s,.-]+(?:Avenue|Lane|Road|Boulevard|Drive|Street|Ave|Dr|Rd|Blvd|Ln|St)\.?)\s+([A-Za-z]+[\s,.-]+[A-Za-z]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

// Social media domains for link extraction
const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'pinterest.com',
  'tiktok.com',
  'snapchat.com',
  't.me', // Telegram
  'reddit.com',
  'github.com',
  'medium.com',
  'tumblr.com'
];

// Worker function to process a batch of domains
if (!isMainThread) {
  const { domains, startIndex } = workerData;
  processDomains(domains).then(results => {
    parentPort.postMessage({ results, startIndex });
  }).catch(error => {
    console.error('Worker error:', error);
    parentPort.postMessage({ error: error.message, startIndex });
  });
}

async function processDomains(domains) {
  const results = [];
  
  for (const domain of domains) {
    try {
      const data = await extractDataFromWebsite(domain);
      results.push({
        domain,
        ...data,
        success: true
      });
    } catch (error) {
      results.push({
        domain,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}

async function extractDataFromWebsite(domain) {
  // Ensure domain has protocol
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  
  try {
    // Fetch the website content
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    // If HTTP request fails, try with http://
    if (!response.data) {
      throw new Error('Empty response');
    }
    
    // Load the HTML into cheerio
    const $ = cheerio.load(response.data);
    
    // Extract the data
    const phoneNumbers = extractPhoneNumbers($, response.data);
    const socialMediaLinks = extractSocialMediaLinks($, url);
    const addresses = extractAddresses($, response.data);
    const emails = extractEmails($, response.data);
    
    return {
      url,
      phoneNumbers,
      socialMediaLinks,
      addresses,
      emails
    };
  } catch (error) {
    // If https fails, try with http
    if (url.startsWith('https://')) {
      try {
        const httpUrl = url.replace('https://', 'http://');
        const response = await axios.get(httpUrl, {
          timeout: REQUEST_TIMEOUT,
          headers: {
            'User-Agent': USER_AGENT
          }
        });
        
        const $ = cheerio.load(response.data);
        
        const phoneNumbers = extractPhoneNumbers($, response.data);
        const socialMediaLinks = extractSocialMediaLinks($, httpUrl);
        const addresses = extractAddresses($, response.data);
        const emails = extractEmails($, response.data);
        
        return {
          url: httpUrl,
          phoneNumbers,
          socialMediaLinks,
          addresses,
          emails
        };
      } catch (httpError) {
        throw new Error(`Failed to fetch website: ${error.message}`);
      }
    } else {
      throw new Error(`Failed to fetch website: ${error.message}`);
    }
  }
}

function extractPhoneNumbers($, html) {
  const phoneNumbers = new Set();
  
  // Extract from HTML using regex
  const matches = html.match(PHONE_REGEX) || [];
  matches.forEach(match => phoneNumbers.add(match.trim()));
  
  // Look for phone numbers in specific HTML elements
  $('a[href^="tel:"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      const phone = href.replace('tel:', '').trim();
      phoneNumbers.add(phone);
    }
  });
  
  // Look for elements with common phone-related classes or IDs
  $('.phone, .tel, #phone, #tel, [itemprop="telephone"]').each((_, element) => {
    const text = $(element).text().trim();
    if (PHONE_REGEX.test(text)) {
      phoneNumbers.add(text);
    }
  });
  
  return [...phoneNumbers];
}

function extractSocialMediaLinks($, baseUrl) {
  const socialLinks = new Set();
  
  // Process all links
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    
    // Normalize the URL
    let fullUrl;
    try {
      fullUrl = new URL(href, baseUrl).href;
    } catch (e) {
      // Invalid URL, skip
      return;
    }
    
    // Check if the URL contains any social media domain
    for (const domain of SOCIAL_MEDIA_DOMAINS) {
      if (fullUrl.includes(domain)) {
        socialLinks.add(fullUrl);
        break;
      }
    }
    
    // Check for common social media paths
    if (href.match(/\/(facebook|twitter|instagram|linkedin|youtube|pinterest)$/i)) {
      socialLinks.add(fullUrl);
    }
  });
  
  // Also look for social media icons
  $('a i.fa-facebook, a i.fa-twitter, a i.fa-instagram, a i.fa-linkedin, a i.fa-youtube, a i.fa-pinterest, a i.fa-github, a i.fa-medium').each((_, element) => {
    const href = $(element).parent().attr('href');
    if (href) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        socialLinks.add(fullUrl);
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });
  
  return [...socialLinks];
}

function extractAddresses($, html) {
  const addresses = new Set();
  
  // Extract from HTML using regex
  const matches = html.match(ADDRESS_REGEX) || [];
  matches.forEach(match => addresses.add(match.trim()));
  
  // Look for address in structured data
  $('[itemtype="http://schema.org/PostalAddress"], [itemprop="address"]').each((_, element) => {
    const addressText = $(element).text().trim().replace(/\s+/g, ' ');
    if (addressText) {
      addresses.add(addressText);
    }
  });
  
  // Look for address in common elements
  $('.address, #address, .location, #location').each((_, element) => {
    const addressText = $(element).text().trim().replace(/\s+/g, ' ');
    if (addressText) {
      addresses.add(addressText);
    }
  });
  
  return [...addresses];
}

function extractEmails($, html) {
  const emails = new Set();
  
  // Extract from HTML using regex
  const matches = html.match(EMAIL_REGEX) || [];
  matches.forEach(match => emails.add(match.trim()));
  
  // Look for mailto links
  $('a[href^="mailto:"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      const email = href.replace('mailto:', '').trim().split('?')[0];
      emails.add(email);
    }
  });
  
  return [...emails];
}

// Main function for multi-threaded processing
async function main() {
  try {
    console.time('Total Processing Time');
    // Read the CSV file
    const csvFile = fs.readFileSync('./data/sample-websites.csv', 'utf8');
    const records = parse(csvFile, { columns: true });
    
    // Extract domains
    const domains = records.map(record => record.domain);
    console.log(`Total domains to process: ${domains.length}`);
    
    // Divide work among workers
    const workers = [];
    const results = new Array(domains.length);
    const batchSize = Math.ceil(domains.length / MAX_WORKERS);
    
    for (let i = 0; i < MAX_WORKERS; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, domains.length);
      const workerDomains = domains.slice(startIndex, endIndex);
      
      if (workerDomains.length === 0) continue;
      
      const worker = new Worker(__filename, {
        workerData: { domains: workerDomains, startIndex }
      });
      
      worker.on('message', message => {
        if (message.error) {
          console.error(`Worker error at index ${message.startIndex}:`, message.error);
        } else {
          // Add results to the correct positions in the results array
          message.results.forEach((result, index) => {
            results[message.startIndex + index] = result;
          });
        }
      });
      
      worker.on('error', error => {
        console.error(`Worker error:`, error);
      });
      
      worker.on('exit', code => {
        if (code !== 0) {
          console.error(`Worker exited with code ${code}`);
        }
        
        // Remove the worker from the array
        const index = workers.findIndex(w => w === worker);
        if (index !== -1) {
          workers.splice(index, 1);
        }
        
        // If all workers are done, process the results
        if (workers.length === 0) {
          processResults(results);
        }
      });
      
      workers.push(worker);
    }
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Process the results
function processResults(results) {
  console.timeEnd('Total Processing Time');
  
  // Filter out null/undefined results
  const validResults = results.filter(Boolean);
  
  // Calculate statistics
  const totalWebsites = results.length;
  const successfulWebsites = validResults.filter(result => result.success).length;
  const coverage = (successfulWebsites / totalWebsites) * 100;
  
  // Calculate fill rates
  const websitesWithPhones = validResults.filter(result => result.success && result.phoneNumbers && result.phoneNumbers.length > 0).length;
  const websitesWithSocial = validResults.filter(result => result.success && result.socialMediaLinks && result.socialMediaLinks.length > 0).length;
  const websitesWithAddresses = validResults.filter(result => result.success && result.addresses && result.addresses.length > 0).length;
  const websitesWithEmails = validResults.filter(result => result.success && result.emails && result.emails.length > 0).length;
  
  const phonesFillRate = (websitesWithPhones / successfulWebsites) * 100;
  const socialFillRate = (websitesWithSocial / successfulWebsites) * 100;
  const addressesFillRate = (websitesWithAddresses / successfulWebsites) * 100;
  const emailsFillRate = (websitesWithEmails / successfulWebsites) * 100;
  
  // Print statistics
  console.log('\n--- Crawling Results ---');
  console.log(`Total websites: ${totalWebsites}`);
  console.log(`Successfully crawled: ${successfulWebsites} (${coverage.toFixed(2)}%)`);
  
  console.log('\n--- Fill Rates ---');
  console.log(`Phone numbers: ${websitesWithPhones} (${phonesFillRate.toFixed(2)}%)`);
  console.log(`Social media links: ${websitesWithSocial} (${socialFillRate.toFixed(2)}%)`);
  console.log(`Addresses: ${websitesWithAddresses} (${addressesFillRate.toFixed(2)}%)`);
  console.log(`Email addresses: ${websitesWithEmails} (${emailsFillRate.toFixed(2)}%)`);
  
  // Save the results to a CSV file
  const outputData = validResults.map(result => ({
    domain: result.domain,
    success: result.success,
    phoneNumbers: result.phoneNumbers ? result.phoneNumbers.join(', ') : '',
    socialMediaLinks: result.socialMediaLinks ? result.socialMediaLinks.join(', ') : '',
    addresses: result.addresses ? result.addresses.join(', ') : '',
    emails: result.emails ? result.emails.join(', ') : '',
    error: result.error || ''
  }));
  
  const outputCsv = stringify(outputData, { header: true });
  fs.writeFileSync('./data/crawling_results.csv', outputCsv);
  
  // Save statistics to a JSON file
  const statistics = {
    timestamp: new Date().toISOString(),
    totalWebsites,
    successfulWebsites,
    coverage: coverage.toFixed(2),
    fillRates: {
      phoneNumbers: phonesFillRate.toFixed(2),
      socialMediaLinks: socialFillRate.toFixed(2),
      addresses: addressesFillRate.toFixed(2),
      emails: emailsFillRate.toFixed(2)
    }
  };
  
  fs.writeFileSync('./data/crawling_statistics.json', JSON.stringify(statistics, null, 2));
  console.log('\nResults saved to crawling_results.csv');
  console.log('Statistics saved to crawling_statistics.json');
}

// If this is the main thread, run the main function
if (isMainThread) {
  main().catch(console.error);
}