// Company Data API with ElasticSearch Integration
const express = require("express");
const fs = require("fs");
const morgan = require("morgan");
const cors = require("cors");
const { client } = require("./elastic-client");
const { mergeData } = require("./data-processor");
const { parse } = require("csv-parse/sync");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());

// Utility functions
function normalizePhone(phone) {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

function normalizeWebsite(website) {
  if (!website) return "";

  let url = website.toLowerCase();

  // Fix common input errors
  url = url.replace(/https:\/\/https:\/\//i, "https://");
  url = url.replace(/https:\/\/http:\/\//i, "http://");
  url = url.replace(/http:\/\/https:\/\//i, "https://");
  url = url.replace(/https\/\//i, "https://");
  url = url.replace(/http\/\//i, "http://");

  // Extract domain
  let domain = url;

  try {
    // Try to parse as URL
    const urlObj = new URL(url);
    domain = urlObj.hostname;
  } catch (e) {
    // Not a valid URL, check if it looks like a domain
    if (!domain.includes(".") && !domain.startsWith("www.")) {
      domain += ".com"; // Default to .com for bare words
    }

    if (domain.startsWith("www.")) {
      domain = domain.substring(4);
    }
  }

  return domain;
}

// Initialize the API
async function initializeAPI() {
  try {
    console.log("Initializing API and ElasticSearch...");

    // Check if ElasticSearch is running
    try {
      await client.ping();
      console.log("ElasticSearch connection successful");
    } catch (esError) {
      console.error("ElasticSearch connection failed:", esError);
      throw new Error("Failed to connect to ElasticSearch. Is it running?");
    }

    // Check if the companies index exists
    const indexExists = await client.indices.exists({ index: "companies" });

    // Check if we have data indexed
    let companyCount = 0;
    if (indexExists) {
      const countResponse = await client.count({ index: "companies" });
      companyCount = countResponse.count;
      console.log(`Found ${companyCount} companies indexed in ElasticSearch`);
    }

    // If no index or no data, run the data processing and indexing
    if (!indexExists || companyCount === 0) {
      console.log(
        "No company data found in ElasticSearch. Running data processing..."
      );

      // Check if company_profiles.json exists to avoid re-scraping
      if (fs.existsSync("./data/company_profiles.json")) {
        console.log(
          "Using existing company profiles from ./data/company_profiles.json"
        );
        const profiles = JSON.parse(
          fs.readFileSync("./data/company_profiles.json", "utf8")
        );
        await require("./data-processor").indexCompanies(profiles);
      } else {
        // Process data from scratch
        await mergeData();
      }
    }

    console.log("API ready to serve requests");
  } catch (error) {
    console.error("Error initializing API:", error);
    process.exit(1);
  }
}

// API Routes

// GET

// Root path - Documentation page
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>CompanyMatch API</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
          h1 { color: #333; }
          h2 { color: #555; margin-top: 30px; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
          .endpoint { background: #e9f7fe; padding: 15px; border-left: 5px solid #0099ff; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>CompanyMatch API</h1>
        <p>Welcome to the CompanyMatch API. This API allows you to search and match company profiles based on various data points.</p>
        
        <h2>API Endpoints</h2>

        <h2>GET</h2>
        <div class="endpoint">
          <h3>Health Check</h3>
          <p><strong>GET /health</strong></p>
          <p>Check if the API is running.</p>
        </div>

        <div class="endpoint">
          <h3>Get Database Statistics</h3>
          <p><strong>GET /api/stats</strong></p>
          <p>Get statistics about the company database.</p>
        </div>

        <div class="endpoint">
          <h3>Get Company by Domain</h3>
          <p><strong>GET /api/company/:domain</strong></p>
          <p>Retrieve a company profile by its domain name.</p>
        </div>
        
        <h2>POST</h2>
        <div class="endpoint">
          <h3>Match Company</h3>
          <p><strong>POST /api/match</strong></p>
          <p>Find the best matching company profile based on provided information.</p>
          <pre>
            {
              "name": "Company Name",
              "website": "example.com",
              "phone": "123-456-7890",
              "facebook": "facebook.com/company"
            }
          </pre>
        </div>
        
        <div class="endpoint">
          <h3>Search Companies</h3>
          <p><strong>POST /api/search</strong></p>
          <p>Search for multiple company matches.</p>
          <pre>
            {
              "name": "Company Name",
              "limit": 5
            }
          </pre>
        </div>
                
        <div class="endpoint">
          <h3>Test Sample Data</h3>
          <p><strong>POST /api/test-sample</strong></p>
          <p>Run the matching algorithm against sample test data.</p>
        </div>
      </body>
    </html>
  `);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "UP", timestamp: new Date().toISOString() });
});

// Get database stats
app.get('/api/stats', async (req, res) => {
  try {
    // Get total count
    const { count: totalCompanies } = await client.count({ index: 'companies' });
    
    const { count: companiesWithPhone } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "phoneNumbers" }
        }
      }
    });
    
    const { count: companiesWithSocial } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "socialMediaLinks" }
        }
      }
    });
    
    const { count: companiesWithAddress } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "addresses" }
        }
      }
    });
    
    const { count: companiesWithEmail } = await client.count({
      index: 'companies',
      body: {
        query: {
          exists: { field: "emails" }
        }
      }
    });
    
    res.json({
      success: true,
      stats: {
        totalCompanies,
        companiesWithPhone,
        companiesWithSocial,
        companiesWithAddress,
        companiesWithEmail,
        fillRates: {
          phone: (companiesWithPhone / totalCompanies * 100).toFixed(2) + '%',
          social: (companiesWithSocial / totalCompanies * 100).toFixed(2) + '%',
          address: (companiesWithAddress / totalCompanies * 100).toFixed(2) + '%',
          email: (companiesWithEmail / totalCompanies * 100).toFixed(2) + '%'
        }
      }
    });
  } catch (error) {
    console.error('Error in stats endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get company profile by domain
app.get("/api/company/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;

    if (!domain) {
      return res.status(400).json({ error: "Domain parameter is required" });
    }

    // Find the company by domain
    const result = await client.search({
      index: "companies",
      body: {
        query: {
          bool: {
            should: [
              { term: { domain: { value: domain } } },
              { term: { domain: { value: domain.toLowerCase() } } },
            ],
            minimum_should_match: 1,
          },
        },
      },
    });

    // Check if company found
    if (result.hits.total.value > 0) {
      const company = result.hits.hits[0]._source;

      res.json({
        success: true,
        company: {
          domain: company.domain,
          company_commercial_name: company.company_commercial_name,
          company_legal_name: company.company_legal_name,
          company_all_available_names: company.company_all_available_names,
          phoneNumbers: company.phoneNumbers,
          socialMediaLinks: company.socialMediaLinks,
          facebookLink: company.facebookLink,
          addresses: company.addresses,
          emails: company.emails,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }
  } catch (error) {
    console.error("Error in company endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST

// Match company by name, website, phone, or facebook
app.post('/api/match', async (req, res) => {
  try {
    const { name, website, phone, facebook } = req.body;
    
    // Require at least one search parameter
    if (!name && !website && !phone && !facebook) {
      return res.status(400).json({ 
        error: 'At least one search parameter (name, website, phone, facebook) is required'
      });
    }
    
    // Log the incoming request
    console.log('Matching request:', { name, website, phone, facebook });
    
    // Build ElasticSearch query
    const should = [];
    
    // Add name queries if provided
    if (name) {
      should.push(
        { match: { company_commercial_name: { query: name, boost: 3 } } },
        { match: { company_legal_name: { query: name, boost: 2 } } },
        { match: { company_all_available_names: { query: name, boost: 1 } } }
      );
      
      // Add exact match with higher boost
      should.push(
        { term: { "company_commercial_name.keyword": { value: name, boost: 5 } } },
        { term: { "company_legal_name.keyword": { value: name, boost: 4 } } }
      );
    }
    
    // Add website queries if provided
    if (website) {
      const normalizedDomain = normalizeWebsite(website);
      
      if (normalizedDomain) {
        should.push(
          { term: { domain: { value: normalizedDomain, boost: 10 } } },
          { wildcard: { domain: { value: `*${normalizedDomain}*`, boost: 5 } } }
        );
        
        // Try matching domain without TLD
        const domainWithoutTld = normalizedDomain.split('.')[0];
        if (domainWithoutTld && domainWithoutTld.length > 3) {
          should.push(
            { wildcard: { domain: { value: `${domainWithoutTld}*`, boost: 3 } } }
          );
        }
      }
    }
    
    // Add phone queries if provided
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      
      if (normalizedPhone.length >= 7) {
        should.push(
          { term: { phoneNumbers: { value: normalizedPhone, boost: 8 } } },
          { term: { phoneNumbers: { value: phone, boost: 7 } } }
        );
        
        // Match last 7 digits for partial matches
        if (normalizedPhone.length >= 7) {
          const last7 = normalizedPhone.slice(-7);
          should.push(
            { wildcard: { phoneNumbers: { value: `*${last7}`, boost: 4 } } }
          );
        }
      }
    }
    
    // Add Facebook queries if provided
    if (facebook) {
      should.push(
        { wildcard: { socialMediaLinks: { value: `*facebook.com*${facebook.split('/').pop()}*`, boost: 6 } } },
        { wildcard: { socialMediaLinks: { value: `*facebook.com*`, boost: 3 } } }
      );
    }
    
    // Execute ElasticSearch query
    const result = await client.search({
      index: 'companies',
      body: {
        query: {
          bool: {
            should,
            minimum_should_match: 1
          }
        },
        size: 10 // Get top 10 matches
      }
    });
    
    // Check if we found a good match
    if (result.hits.total.value > 0 && result.hits.hits[0]._score > 3) {
      const bestMatch = result.hits.hits[0];
      const confidence = Math.min(100, Math.round(bestMatch._score * 10));
      
      // Enhance response with match details
      const matchDetails = {
        score: bestMatch._score,
        matchingFields: []
      };
      
      // Determine which fields matched
      if (name && 
          (bestMatch._source.company_commercial_name.toLowerCase().includes(name.toLowerCase()) || 
           (bestMatch._source.company_legal_name && bestMatch._source.company_legal_name.toLowerCase().includes(name.toLowerCase())))) {
        matchDetails.matchingFields.push('name');
      }
      
      if (website && normalizeWebsite(website) === bestMatch._source.domain) {
        matchDetails.matchingFields.push('domain');
      }
      
      if (phone && bestMatch._source.phoneNumbers.some(p => normalizePhone(p) === normalizePhone(phone))) {
        matchDetails.matchingFields.push('phone');
      }
      
      if (facebook && bestMatch._source.socialMediaLinks.some(link => 
          link.includes('facebook.com') && (link.includes(facebook) || facebook.includes(link)))) {
        matchDetails.matchingFields.push('facebook');
      }
      
      // Return the match with confidence score
      res.json({
        success: true,
        match: {
          domain: bestMatch._source.domain,
          company_commercial_name: bestMatch._source.company_commercial_name,
          company_legal_name: bestMatch._source.company_legal_name,
          company_all_available_names: bestMatch._source.company_all_available_names,
          phoneNumbers: bestMatch._source.phoneNumbers,
          socialMediaLinks: bestMatch._source.socialMediaLinks,
          addresses: bestMatch._source.addresses,
          emails: bestMatch._source.emails
        },
        confidence,
        score: bestMatch._score,
        matchDetails,
        alternatives: result.hits.hits.slice(1, 3).map(hit => ({
          domain: hit._source.domain,
          company_commercial_name: hit._source.company_commercial_name,
          confidence: Math.min(100, Math.round(hit._score * 10)),
          score: hit._score
        }))
      });
      
      // Log successful match
      console.log(`Match found: ${bestMatch._source.company_commercial_name} (${bestMatch._source.domain}) with score ${bestMatch._score}`);
    } else {
      // No confident match found, return potential matches
      const potentialMatches = result.hits.hits.slice(0, 3).map(hit => ({
        domain: hit._source.domain,
        company_commercial_name: hit._source.company_commercial_name,
        score: hit._score
      }));
      
      res.json({
        success: false,
        message: 'No confident match found',
        potentialMatches: result.hits.total.value > 0 ? potentialMatches : []
      });
      
      // Log no match found
      console.log('No confident match found. Potential matches:', potentialMatches);
    }
  } catch (error) {
    console.error('Error in match endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search for companies (returns multiple matches)
app.post("/api/search", async (req, res) => {
  try {
    const { name, website, phone, facebook, limit = 5 } = req.body;

    // Require at least one search parameter
    if (!name && !website && !phone && !facebook) {
      return res.status(400).json({
        error:
          "At least one search parameter (name, website, phone, facebook) is required",
      });
    }

    // Build query similar to match endpoint but return more results
    const should = [];

    if (name) {
      should.push(
        { match: { company_commercial_name: { query: name, boost: 3 } } },
        { match: { company_legal_name: { query: name, boost: 2 } } },
        { match: { company_all_available_names: { query: name, boost: 1 } } }
      );
    }

    if (website) {
      const normalizedDomain = normalizeWebsite(website);
      if (normalizedDomain) {
        should.push(
          { term: { domain: { value: normalizedDomain, boost: 10 } } },
          { wildcard: { domain: { value: `*${normalizedDomain}*`, boost: 5 } } }
        );
      }
    }

    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (normalizedPhone.length >= 7) {
        should.push(
          { term: { phoneNumbers: { value: normalizedPhone, boost: 8 } } },
          {
            wildcard: {
              phoneNumbers: { value: `*${normalizedPhone}*`, boost: 4 },
            },
          }
        );
      }
    }

    if (facebook) {
      should.push(
        { term: { facebookLink: { value: facebook, boost: 9 } } },
        { wildcard: { facebookLink: { value: `*${facebook}*`, boost: 6 } } },
        {
          wildcard: { socialMediaLinks: { value: `*facebook.com*`, boost: 4 } },
        }
      );
    }

    // Execute search
    const result = await client.search({
      index: "companies",
      body: {
        query: {
          bool: {
            should,
            minimum_should_match: 1,
          },
        },
        size: limit,
      },
    });

    // Format response
    res.json({
      success: true,
      count: result.hits.total.value,
      results: result.hits.hits.map((hit) => ({
        domain: hit._source.domain,
        company_commercial_name: hit._source.company_commercial_name,
        company_legal_name: hit._source.company_legal_name,
        phoneNumbers: hit._source.phoneNumbers,
        socialMediaLinks: hit._source.socialMediaLinks,
        facebookLink: hit._source.facebookLink,
        score: hit._score,
      })),
    });
  } catch (error) {
    console.error("Error in search endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Test the matching algorithm with the API input sample
app.post("/api/test-sample", async (req, res) => {
  try {
    // Check if the API input sample exists
    if (!fs.existsSync("./data/API-input-sample.csv")) {
      return res.status(404).json({
        error: "./data/API-input-sample.csv file not found",
      });
    }

    // Read and parse the input sample
    const csvFile = fs.readFileSync("./data/API-input-sample.csv", "utf8");
    const testInputs = parse(csvFile, { columns: true });

    // Process each test input
    const results = [];
    let matchCount = 0;

    for (const input of testInputs) {
      const query = {
        name: input["input name"] || null,
        phone: input["input phone"] || null,
        website: input["input website"] || null,
        facebook: input["input_facebook"] || null,
      };

      // Build ElasticSearch query
      const should = [];

      if (query.name) {
        should.push(
          {
            match: { company_commercial_name: { query: query.name, boost: 3 } },
          },
          { match: { company_legal_name: { query: query.name, boost: 2 } } },
          {
            match: {
              company_all_available_names: { query: query.name, boost: 1 },
            },
          }
        );
      }

      if (query.website) {
        const normalizedDomain = normalizeWebsite(query.website);
        if (normalizedDomain) {
          should.push(
            { term: { domain: { value: normalizedDomain, boost: 10 } } },
            {
              wildcard: {
                domain: { value: `*${normalizedDomain}*`, boost: 5 },
              },
            }
          );
        }
      }

      if (query.phone) {
        const normalizedPhone = normalizePhone(query.phone);
        if (normalizedPhone.length >= 7) {
          should.push(
            { term: { phoneNumbers: { value: normalizedPhone, boost: 8 } } },
            {
              wildcard: {
                phoneNumbers: { value: `*${normalizedPhone}*`, boost: 4 },
              },
            }
          );
        }
      }

      if (query.facebook) {
        should.push(
          { term: { facebookLink: { value: query.facebook, boost: 9 } } },
          {
            wildcard: {
              facebookLink: { value: `*${query.facebook}*`, boost: 6 },
            },
          },
          {
            wildcard: {
              socialMediaLinks: { value: `*facebook.com*`, boost: 4 },
            },
          }
        );
      }

      // Execute search
      const searchResult = await client.search({
        index: "companies",
        body: {
          query: {
            bool: {
              should,
              minimum_should_match: 1,
            },
          },
          size: 1,
        },
      });

      const result = {
        inputName: input["input name"],
        inputPhone: input["input phone"],
        inputWebsite: input["input website"],
        inputFacebook: input["input_facebook"],
      };

      if (
        searchResult.hits.total.value > 0 &&
        searchResult.hits.hits[0]._score > 3
      ) {
        matchCount++;
        const match = searchResult.hits.hits[0]._source;
        const score = searchResult.hits.hits[0]._score;

        result.matched = true;
        result.confidence = Math.min(100, Math.round(score * 10));
        result.score = score;
        result.matchedDomain = match.domain;
        result.matchedName = match.company_commercial_name;
      } else {
        result.matched = false;
      }

      results.push(result);
    }

    // Calculate match rate
    const matchRate = (matchCount / testInputs.length) * 100;

    res.json({
      success: true,
      totalTestCases: testInputs.length,
      matchesFound: matchCount,
      matchRate: matchRate.toFixed(2) + "%",
      results,
    });
  } catch (error) {
    console.error("Error in test-sample endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// Start the server
app.listen(PORT, async () => {
  console.log(`Company Matching API running on port ${PORT}`);
  await initializeAPI();
});
