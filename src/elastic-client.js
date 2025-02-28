// src/elastic-client.js
const { Client } = require('@elastic/elasticsearch');

const client = new Client({ 
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' 
});

async function initializeElastic() {
  try {
    // Check if ES is running
    await client.ping();
    console.log('ElasticSearch connected');
    
    // Create company index if it doesn't exist
    const indexExists = await client.indices.exists({ index: 'companies' });
    
    if (!indexExists) {
      // Create index with appropriate mappings
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
                }
              },
              company_legal_name: { type: 'text' },
              phoneNumbers: { type: 'keyword' },
              socialMediaLinks: { type: 'keyword' },
              emails: { type: 'keyword' },
            }
          }
        }
      });
      console.log('Companies index created');
    }
    
    return true;
  } catch (error) {
    console.error('ElasticSearch initialization error:', error);
    return false;
  }
}

module.exports = {
  client,
  initializeElastic
};