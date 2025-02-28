// Data processor to merge scraped data with company names and index in ElasticSearch
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { client } = require('./elastic-client');

// Function to tokenize and normalize text for search
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace non-alphanumeric with spaces
    .split(/\s+/)              // Split on whitespace
    .filter(token => token.length > 1); // Filter out single-character tokens
}

// Load the companies name data
function loadCompanyNames() {
  try {
    const csvFile = fs.readFileSync('./data/sample-websites-company-names.csv', 'utf8');
    return parse(csvFile, { columns: true });
  } catch (error) {
    console.error('Error loading company names:', error);
    return [];
  }
}

// Load the scraped data
function loadScrapedData() {
  try {
    if (fs.existsSync('./data/crawling_results.csv')) {
      const csvFile = fs.readFileSync('./data/crawling_results.csv', 'utf8');
      return parse(csvFile, { columns: true });
    } else {
      console.warn('Warning: crawling_results.csv not found. Using empty dataset.');
      return [];
    }
  } catch (error) {
    console.error('Error loading scraped data:', error);
    return [];
  }
}

// Merge the datasets and prepare for search indexing
async function mergeData() {
  console.log('Starting data merge process...');
  
  const companyNames = loadCompanyNames();
  console.log(`Loaded ${companyNames.length} company names.`);
  
  const scrapedData = loadScrapedData();
  console.log(`Loaded ${scrapedData.length} scraped records.`);
  
  // Create a map from domain to scraped data for faster lookup
  const scrapedDataMap = scrapedData.reduce((map, item) => {
    map[item.domain] = item;
    return map;
  }, {});
  
  // Merge the data
  const mergedData = companyNames.map(nameData => {
    const domain = nameData.domain;
    const scrapedInfo = scrapedDataMap[domain] || {};
    
    // Parse arrays from string format or initialize empty arrays
    const phoneNumbers = scrapedInfo.phoneNumbers ? scrapedInfo.phoneNumbers.split(', ') : [];
    const socialMediaLinks = scrapedInfo.socialMediaLinks ? scrapedInfo.socialMediaLinks.split(', ') : [];
    const addresses = scrapedInfo.addresses ? scrapedInfo.addresses.split(', ') : [];
    const emails = scrapedInfo.emails ? scrapedInfo.emails.split(', ') : [];
    
    // Create search tokens from all text fields
    const searchTokens = new Set([
      ...tokenize(nameData.company_commercial_name),
      ...tokenize(nameData.company_legal_name),
      ...tokenize(nameData.company_all_available_names),
      ...tokenize(domain),
      ...phoneNumbers.flatMap(tokenize),
      ...socialMediaLinks.flatMap(tokenize),
      ...addresses.flatMap(tokenize),
      ...emails.flatMap(tokenize)
    ]);
    
    return {
      domain,
      company_commercial_name: nameData.company_commercial_name,
      company_legal_name: nameData.company_legal_name || '',
      company_all_available_names: nameData.company_all_available_names,
      phoneNumbers,
      socialMediaLinks,
      addresses,
      emails,
      success: scrapedInfo.success === 'true' || Boolean(scrapedInfo.success),
      searchTokens: Array.from(searchTokens)
    };
  });
  
  console.log(`Created ${mergedData.length} merged records.`);
  
  // Save as JSON for potential future use
  fs.writeFileSync('./data/company_profiles.json', JSON.stringify(mergedData, null, 2));
  console.log('Saved merged data to ./data/company_profiles.json');
  
  // Also save as CSV for easy viewing
  const csvData = mergedData.map(item => ({
    domain: item.domain,
    company_commercial_name: item.company_commercial_name,
    company_legal_name: item.company_legal_name,
    company_all_available_names: item.company_all_available_names,
    phoneNumbers: item.phoneNumbers.join(', '),
    socialMediaLinks: item.socialMediaLinks.join(', '),
    addresses: item.addresses.join(', '),
    emails: item.emails.join(', '),
    success: item.success
  }));
  
  const outputCsv = stringify(csvData, { header: true });
  fs.writeFileSync('./data/company_profiles.csv', outputCsv);
  console.log('Saved merged data to ./data/company_profiles.csv');
  
  // Index the merged data in ElasticSearch
  await indexCompanies(mergedData);
  
  return mergedData;
}

// Index company data in ElasticSearch
async function indexCompanies(companies) {
  try {
    console.log(`Indexing ${companies.length} companies in ElasticSearch...`);
    
    // Check if index exists, if not create it with proper mappings
    const indexExists = await client.indices.exists({ index: 'companies' });
    
    if (!indexExists) {
      console.log('Creating companies index with mappings...');
      await client.indices.create({
        index: 'companies',
        body: {
          mappings: {
            properties: {
              domain: { type: 'keyword' },
              company_commercial_name: { 
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                  completion: { type: 'completion' }
                },
                analyzer: 'standard'
              },
              company_legal_name: { 
                type: 'text',
                fields: { keyword: { type: 'keyword' } }
              },
              company_all_available_names: { type: 'text' },
              phoneNumbers: { type: 'keyword' },
              socialMediaLinks: { type: 'keyword' },
              addresses: { type: 'text' },
              emails: { type: 'keyword' },
              searchTokens: { type: 'text' }
            }
          },
          settings: {
            'index.mapping.coerce': true,
            'index.number_of_shards': 1,
            'index.number_of_replicas': 0
          }
        }
      });
    } else {
      console.log('Companies index already exists. Continuing with indexing...');
    }
    
    // Delete any existing data
    await client.deleteByQuery({
      index: 'companies',
      body: {
        query: { match_all: {} }
      },
      refresh: true
    });
    
    // Prepare bulk indexing operations
    const operations = [];
    
    companies.forEach(company => {
      operations.push(
        { index: { _index: 'companies', _id: company.domain } },
        company
      );
      
      // Execute in batches of 500 to avoid request size limits
      if (operations.length >= 1000) {
        bulkIndex(operations.splice(0, operations.length));
      }
    });
    
    // Index any remaining operations
    if (operations.length > 0) {
      await bulkIndex(operations);
    }
    
    // Refresh the index to make the operations visible to search
    await client.indices.refresh({ index: 'companies' });
    
    // Get the document count to verify indexing
    const count = await client.count({ index: 'companies' });
    console.log(`Successfully indexed ${count.count} companies in ElasticSearch`);
    
    // Verify data was indexed correctly by checking fill rates
    await verifyIndexedData();
    
    return count.count;
  } catch (error) {
    console.error('Error indexing data in ElasticSearch:', error);
    throw error;
  }
}

// Helper function to execute bulk indexing
async function bulkIndex(operations) {
  try {
    const { errors, items } = await client.bulk({
      operations,
      refresh: true
    });
    
    if (errors) {
      const erroredItems = items.filter(item => item.index && item.index.error);
      console.error(`Errors during bulk indexing (${erroredItems.length} items):`, 
        erroredItems.map(item => item.index.error.reason));
    }
  } catch (error) {
    console.error('Bulk indexing error:', error);
    throw error;
  }
}

// Verify the data was indexed correctly by querying for fill rates
async function verifyIndexedData() {
  try {
    // Get total count
    const { count: totalCompanies } = await client.count({ index: 'companies' });
    
    // Get companies with phone numbers
    const { count: companiesWithPhone } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "phoneNumbers" }
        }
      }
    });
    
    // Get companies with social media
    const { count: companiesWithSocial } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "socialMediaLinks" }
        }
      }
    });
    
    // Get companies with addresses
    const { count: companiesWithAddress } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "addresses" }
        }
      }
    });
    
    // Get companies with email
    const { count: companiesWithEmail } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "emails" }
        }
      }
    });
    
    console.log('\n--- ElasticSearch Index Fill Rates ---');
    console.log(`Total companies: ${totalCompanies}`);
    console.log(`Companies with phone numbers: ${companiesWithPhone} (${(companiesWithPhone / totalCompanies * 100).toFixed(2)}%)`);
    console.log(`Companies with social media: ${companiesWithSocial} (${(companiesWithSocial / totalCompanies * 100).toFixed(2)}%)`);
    console.log(`Companies with addresses: ${companiesWithAddress} (${(companiesWithAddress / totalCompanies * 100).toFixed(2)}%)`);
    console.log(`Companies with emails: ${companiesWithEmail} (${(companiesWithEmail / totalCompanies * 100).toFixed(2)}%)`);
    
  } catch (error) {
    console.error('Error verifying indexed data:', error);
  }
}

// Run the merge process if this file is executed directly
if (require.main === module) {
  try {
    mergeData().catch(error => {
      console.error('Error in merge process:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('Error in merge process:', error);
    process.exit(1);
  }
}

module.exports = { mergeData, tokenize, indexCompanies };