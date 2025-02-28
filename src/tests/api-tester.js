// API Test Runner for Sample Data
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3000/api/match';
const INPUT_FILE = './data/API-input-sample.csv';
const OUTPUT_FILE = './output/match_results.csv';
const REPORT_FILE = './output/match_report.json';

async function runTests() {
  try {
    console.log(`Reading input data from ${INPUT_FILE}...`);
    
    // Check if input file exists
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`Error: ${INPUT_FILE} not found`);
      process.exit(1);
    }
    
    // Read and parse the input file
    const csvData = fs.readFileSync(INPUT_FILE, 'utf8');
    const testCases = parse(csvData, { columns: true });
    
    console.log(`Found ${testCases.length} test cases to process`);
    
    // Process each test case
    const results = [];
    let successCount = 0;
    let totalCases = testCases.length;
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      // Prepare the request payload
      const payload = {
        name: testCase['input name'] || null,
        website: testCase['input website'] || null,
        phone: testCase['input phone'] || null,
        facebook: testCase['input_facebook'] || null
      };
      
      console.log(`\nTest case ${i+1}/${totalCases}:`);
      console.log(`Input: ${JSON.stringify(payload)}`);
      
      try {
        // Make the API request
        const response = await axios.post(API_URL, payload);
        
        const result = {
          testCaseId: i + 1,
          input: payload,
          success: response.data.success,
          confidence: response.data.success ? response.data.confidence : 0,
          score: response.data.success ? response.data.score : 0
        };
        
        if (response.data.success) {
          successCount++;
          result.match = {
            domain: response.data.match.domain,
            name: response.data.match.company_commercial_name,
            legalName: response.data.match.company_legal_name,
            phoneNumbers: response.data.match.phoneNumbers,
            facebookLink: response.data.match.facebookLink
          };
          
          console.log(`✅ Matched: ${result.match.name} (${result.match.domain})`);
          console.log(`   Score: ${result.score}, Confidence: ${result.confidence}%`);
        } else {
          result.potentialMatches = response.data.potentialMatches || [];
          
          if (result.potentialMatches.length > 0) {
            console.log(`❌ No confident match found. Top potential match: ${result.potentialMatches[0].company_commercial_name} (score: ${result.potentialMatches[0].score})`);
          } else {
            console.log(`❌ No potential matches found`);
          }
        }
        
        results.push(result);
      } catch (error) {
        console.error(`Error processing test case ${i+1}:`, error.message);
        
        results.push({
          testCaseId: i + 1,
          input: payload,
          success: false,
          error: error.message
        });
      }
    }
    
    // Calculate match rate
    const matchRate = (successCount / totalCases) * 100;
    
    console.log(`\n--- Test Results Summary ---`);
    console.log(`Total test cases: ${totalCases}`);
    console.log(`Successful matches: ${successCount} (${matchRate.toFixed(2)}%)`);
    console.log(`Failed matches: ${totalCases - successCount} (${(100 - matchRate).toFixed(2)}%)`);
    
    // Generate CSV output
    const csvOutput = stringify([
      // Header row
      {
        'Test Case': 'Test Case',
        'Input Name': 'Input Name',
        'Input Website': 'Input Website',
        'Input Phone': 'Input Phone',
        'Input Facebook': 'Input Facebook',
        'Match Status': 'Match Status',
        'Confidence': 'Confidence',
        'Score': 'Score',
        'Matched Domain': 'Matched Domain',
        'Matched Name': 'Matched Name',
        'Matched Legal Name': 'Matched Legal Name'
      },
      // Data rows
      ...results.map(result => ({
        'Test Case': result.testCaseId,
        'Input Name': result.input.name || '',
        'Input Website': result.input.website || '',
        'Input Phone': result.input.phone || '',
        'Input Facebook': result.input.facebook || '',
        'Match Status': result.success ? 'MATCHED' : 'NO MATCH',
        'Confidence': result.confidence || '',
        'Score': result.score || '',
        'Matched Domain': result.success ? result.match.domain : '',
        'Matched Name': result.success ? result.match.name : '',
        'Matched Legal Name': result.success ? result.match.legalName : ''
      }))
    ], { header: false });
    
    // Save CSV output
    fs.writeFileSync(OUTPUT_FILE, csvOutput);
    console.log(`\nDetailed results saved to ${OUTPUT_FILE}`);
    
    // Generate and save JSON report
    const report = {
      timestamp: new Date().toISOString(),
      totalTestCases: totalCases,
      successfulMatches: successCount,
      matchRate: matchRate.toFixed(2),
      failedMatches: totalCases - successCount,
      failRate: (100 - matchRate).toFixed(2),
      results: results.map(result => ({
        testCaseId: result.testCaseId,
        input: {
          name: result.input.name,
          website: result.input.website,
          phone: result.input.phone,
          facebook: result.input.facebook
        },
        matched: result.success,
        confidence: result.confidence,
        score: result.score,
        matchedCompany: result.success ? {
          domain: result.match.domain,
          name: result.match.name
        } : null,
        potentialMatches: result.potentialMatches || []
      }))
    };
    
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`Summary report saved to ${REPORT_FILE}`);
    
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };